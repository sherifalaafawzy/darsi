/**
 * An organization's data, as files its admins download (TECHNICAL.md): every member's profile,
 * lessons, projects and certificates. For a school that leaves, moves its records elsewhere or answers a data request,
 * and for a platform admin before deleting one (platform.ts deleteOrg).
 *
 * exportOrgData({ orgId, exportId?, cursor? }) → { exportId, done, cursor, files, members }.
 * The first call (no exportId) removes any older export, starts a new one and is written to the audit log. Each call
 * pages members by document id for up to 400 seconds (or about 24 MB of JSON) and writes one gzipped file,
 * exports/{orgId}/{exportId}/part-0001.json.gz and so on; call again with the returned `exportId` and `cursor` until
 * `done`. `files` and `members` are the export's totals so far.
 * A new export starts at most once per organization per 10 minutes (`export-wait`, with `retryAt`); continuing one
 * never waits, but it goes on only from where the last part stopped (any other cursor is `bad-export`, and a finished
 * export answers as before without a new file), so an export never holds more parts than its members fill. A first
 * call that fails before it wrote its first file takes its stamp back, so the admin can try again at once. The stamp
 * (orgs/{orgId}/private/export) is also the export's licence to write: once it is gone or names another export (a
 * newer one, or an erasure in the organization: account.ts), a call writes nothing, takes back what it just wrote,
 * and answers `no-export`. A suspended organization, or one being deleted, is exported by platform admins only
 * (`org-suspended`).
 *
 * Only what the organization's admins may already read under the rules (firebase/firestore.rules, canSee): never
 * notes (private to the person), payments, subscriptions, credits, devices or problem reports. The files are private
 * (the Storage rules let only this organization's admins and platform admins read exports/{orgId}/**), and they go
 * with the next export and with the organization.
 */
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, db, freshCaller, str } from "./admin.js";
import { isId } from "./orgMembersCore.js";
import { bucket } from "./storage.js";

/** Members per page and at once (three reads each); how long one call pages, and how much JSON one file holds. */
const PAGE = 100, AT_ONCE = 25, BUDGET_MS = 400_000, MAX_CHARS = 24_000_000;
/** The profile fields an export carries: the ones the admins' own screens show. */
const PROFILE = ["name", "email", "username", "role", "group", "teacherId", "createdAt", "lastActive", "summary"];
const EXPORT_ID = /^[a-f0-9]{24}$/;

/** Firestore values as plain JSON (timestamps as ISO dates), as exportAccountData writes them (account.ts). */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}

type MemberDoc = { id: string; get(field: string): unknown };
/** One member as a line of JSON: kept as text, so a call holds a file's worth of text and not a tree of objects. */
async function memberRow(m: MemberDoc): Promise<string> {
  const [lessons, projects, certs] = await Promise.all(["progress", "submissions", "certs"].map((sub) => db.collection(`users/${m.id}/${sub}`).get()));
  return JSON.stringify(plain({
    uid: m.id,
    profile: Object.fromEntries(PROFILE.map((f) => [f, m.get(f) ?? null])),
    lessons: lessons.docs.map((d) => ({ id: d.id, ...d.data() })),
    projects: projects.docs.map((d) => ({ id: d.id, ...d.data() })),
    certificates: certs.docs.map((d) => ({ unitId: d.id, ...d.data() })),
  }));
}

/** What a part says about itself (its custom metadata): where it started and stopped, and how many members it holds. */
type PartFile = { name: string; metadata?: { metadata?: Record<string, unknown> | null } };
const note = (f: PartFile, key: string) => String(f.metadata?.metadata?.[key] ?? "");

/** How long after one export starts the next may start, for the same organization. */
export const EXPORT_GAP_MS = 10 * 60_000;

/**
 * Starts a new export, at most one per organization per EXPORT_GAP_MS: each one reads every member's records (three
 * reads a member) and replaces the files of the one before, so a button pressed again and again, or a script, would
 * cost a large school's reads over and over and leave nobody a finished file. Checked and stamped in one transaction
 * on orgs/{orgId}/private/export {at, by, exportId} (functions only; it goes with the organization), so two presses at
 * the same moment can't both pass. Refused with `export-wait` and `retryAt` (ms) for the screen to say when.
 */
async function claimExport(orgId: string, by: string, exportId: string) {
  const ref = db.doc(`orgs/${orgId}/private/export`);
  await db.runTransaction(async (tx) => {
    const last = Number((await tx.get(ref)).get("at")) || 0, now = Date.now();
    if (now - last < EXPORT_GAP_MS) throw new HttpsError("resource-exhausted", "An export of this organization started a few minutes ago. Try again later.", { reason: "export-wait", retryAt: last + EXPORT_GAP_MS });
    tx.set(ref, { at: now, by, exportId });
  });
}

/**
 * Takes the stamp back when the export it was for wrote nothing (the first call failed before part-0001): there is no
 * file to wait for, so the next press may start at once. Only this export's own stamp: a newer one stays. A failure
 * here is logged and leaves the wait in place, never hiding the error that brought us here.
 */
async function releaseExport(orgId: string, exportId: string) {
  const ref = db.doc(`orgs/${orgId}/private/export`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).get("exportId") === exportId) tx.delete(ref);
  }).catch((e) => logger.error("export: stamp not taken back", { event: "export-stamp", orgId, exportId, error: String(e) }));
}

export const exportOrgData = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const c = await freshCaller(req);
  const started = Date.now();
  const orgId = str(req.data?.orgId, 128);
  if (c.role !== "superadmin" && !(c.role === "orgAdmin" && !!orgId && c.orgId === orgId)) throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  // An id and nothing else (a platform admin's "o1/private/invites" would name another document, and another folder).
  const org = isId(orgId) ? await db.doc(`orgs/${orgId}`).get() : null;
  if (!org?.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  // A suspended organization, or one being deleted, is exported by platform admins only: its own admins are frozen
  // and may not download the files (the Storage rules), so they must not start what they can't fetch. A platform
  // admin exports it for them, or before deleting it.
  if (c.role !== "superadmin" && (org.get("status") === "suspended" || org.get("status") === "deleting")) {
    throw new HttpsError("permission-denied", "This organization is suspended. Ask Darsi's team for its data.", { reason: "org-suspended" });
  }

  let exportId = str(req.data?.exportId, 64);
  // A cursor belongs to the export it came from: a new export starts with the first member, whatever was sent with it.
  const from = exportId ? str(req.data?.cursor, 128) : "";
  let had: PartFile[] = [];
  const first = !exportId;
  if (first) {
    exportId = randomBytes(12).toString("hex");
    // Before anything is deleted: a refused start leaves the last export's files as they were.
    await claimExport(orgId, c.uid, exportId);
  }
  try {
    return await run();
  } catch (e) {
    // Nothing was written for this export (a first call's only file is its last step): the wait would be for nothing.
    if (first) await releaseExport(orgId, exportId);
    throw e;
  }

  /**
   * Whether the organization's stamp still names this export. The stamp is an export's licence to write: a newer
   * export takes it over, and an erasure in the organization deletes it (account.ts), so nothing read before either
   * is written, or kept, after it. One document read per call.
   */
  async function mine() { return (await db.doc(`orgs/${orgId}/private/export`).get()).get("exportId") === exportId; }
  function gone() { return new HttpsError("not-found", "This export is gone: a newer one replaced it. Start again.", { reason: "no-export" }); }

  async function run() {
    if (first) {
      // One export at a time: an older one holds the same people's data, and nobody should find it lying around.
      await bucket().deleteFiles({ prefix: `exports/${orgId}/` });
      await audit("exportOrgData", c.uid, { orgId, exportId });
    } else {
      // Continuing needs the place to continue from: without it the export would start over inside the same folder.
      // (And a cursor is a member's id: anything else would fail inside the query, as an error nobody can read.)
      if (!EXPORT_ID.test(exportId) || !isId(from)) throw new HttpsError("invalid-argument", "Send the exportId and cursor of the previous answer.", { reason: "bad-export" });
      [had] = await bucket().getFiles({ prefix: `exports/${orgId}/${exportId}/part-` }) as unknown as [PartFile[]];
      // Gone, or no longer the organization's export (its stamp names another, or went with an erasure): nothing to go on with.
      if (!had.length || !(await mine())) throw gone();
      had.sort((a, b) => a.name.localeCompare(b.name));
    }
    const dir = `exports/${orgId}/${exportId}/`;
    const answer = (files: string[], members: number, done: boolean, cursor: string | null) => ({ exportId, done, cursor: done ? null : cursor, files, members });
    const before = had.reduce((n, f) => n + (Number(note(f, "members")) || 0), 0);
    // The same call again (its answer was lost on the way): the part it wrote says where it stopped. Nothing is written twice.
    const same = from ? had.find((f) => note(f, "from") === from) : undefined;
    if (same) return answer(had.map((f) => f.name), before, note(same, "done") === "true", note(same, "to") || null);
    if (!first) {
      // A finished export has nothing to go on with: its answer again, and no new file.
      if (had.some((f) => note(f, "done") === "true")) return answer(had.map((f) => f.name), before, true, null);
      // Only from where the last part stopped: any other cursor would read the members again into one more file.
      if (from !== note(had[had.length - 1], "to")) throw new HttpsError("invalid-argument", "Send the exportId and cursor of the previous answer.", { reason: "bad-export" });
    }

    const rows: string[] = [];
    let cursor = from || null, chars = 0, done = false;
    for (;;) {
      let q = db.collection("users").where("orgId", "==", orgId).orderBy(FieldPath.documentId()).limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const page = await q.select(...PROFILE).get();
      for (let i = 0; i < page.docs.length; i += AT_ONCE) {
        for (const row of await Promise.all(page.docs.slice(i, i + AT_ONCE).map(memberRow))) { rows.push(row); chars += row.length; }
      }
      if (page.docs.length) cursor = page.docs[page.docs.length - 1].id;
      if (page.docs.length < PAGE) { done = true; break; }
      if (Date.now() - started >= BUDGET_MS || chars >= MAX_CHARS) break;
    }

    const files = had.map((f) => f.name);
    // The first call always writes a file (an organization with no members exports an empty list); a later call that
    // finds nobody left writes none.
    if (rows.length || !had.length) {
      const name = `${dir}part-${String(had.length + 1).padStart(4, "0")}.json.gz`;
      // Gzipped here and stored as a .gz file (no Content-Encoding): what the admin downloads is the file as named.
      await bucket().file(name).save(gzipSync(`[${rows.join(",")}]`), {
        resumable: false, gzip: false, contentType: "application/gzip",
        metadata: { cacheControl: "private, no-store", metadata: { from, to: cursor ?? "", members: String(rows.length), done: String(done) } },
      });
      // The stamp went while this call was reading (an erasure in the organization: account.ts wipeAccount deletes it
      // first), or names a newer export: the rows read may hold someone erased since, so the file is taken back.
      if (!(await mine())) {
        await bucket().file(name).delete({ ignoreNotFound: true })
          .catch((e) => logger.error("export: a part written after its stamp went was not taken back", { event: "export-part", orgId, exportId, error: String(e) }));
        throw gone();
      }
      files.push(name);
    }
    return answer(files, before + rows.length, done, cursor);
  }
});
