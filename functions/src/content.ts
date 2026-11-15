/**
 * Course editor callables. Drafts live in Firestore (units/{id} for lists, unitDrafts/{id} for the content); these
 * functions are the only way content reaches learners: they validate the draft with the same validator as the editor,
 * write an immutable versioned JSON file to Storage and rebuild that owner's catalog.json.
 */
import { gzipSync } from "node:zlib";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { audit, db, freshCaller, str } from "./admin.js";
import { refuseClosedOrg } from "./closedOrg.js";
import { allFigureUrls, buildCatalog, canManage, catalogEntry, catalogPath, extraLangs, figurePath, idAllowed, inLanguages, isOwner, mediaPrefix, staleVersions, unitLangPath, unitPath, unitPrefix, versionOf, type Owner } from "./catalog.js";
import { loadTracks } from "./settings.js";
import { bucket, saveJson } from "./storage.js";
import { mediaStillUsed } from "./trackRules.js";
import { levelsByTrack } from "./shared/tracks.js";
import type { CatalogEntry, Unit } from "./shared/types.js";
import { errorsOf, UNIT_ID, validateUnit } from "./shared/validate.js";

/**
 * Owners whose catalog.json couldn't be written after a publish, unpublish or delete had already changed Firestore:
 * { dirty: { <owner>: ms } }. sitesJob (sites.ts checkSites, every 15 minutes) writes those catalogs again and clears
 * the ones that worked. Server only (the rules let platform admins read stats/*, and nobody write it).
 */
export const CATALOGS_DOC = "stats/catalogs";

/**
 * Why a call was refused, as `details.reason` beside the English message (the fallback), so the editor can say it in
 * the admin's language: bad-unit-id, no-unit, no-owner, not-unit-admin (target); changed, draft-invalid (with
 * `issues`), draft-id (publishUnit); catalog-pending (publish, unpublish, delete: see catalogOrPending). target also
 * refuses an organization's admin with org-suspended or org-deleting (closedOrg.ts).
 */
type Reason = "bad-unit-id" | "no-unit" | "no-owner" | "not-unit-admin" | "changed" | "draft-invalid" | "draft-id" | "catalog-pending";
const refuse = (code: FunctionsErrorCode, message: string, reason: Reason, more: Record<string, unknown> = {}) => new HttpsError(code, message, { reason, ...more });

/** Loads units/{unitId} and checks that the caller may manage it. */
async function target(req: CallableRequest) {
  const c = await freshCaller(req);
  const unitId = str(req.data?.unitId, 60);
  if (!UNIT_ID.test(unitId)) throw refuse("invalid-argument", "unitId is required.", "bad-unit-id");
  const meta = await db.doc(`units/${unitId}`).get();
  if (!meta.exists) throw refuse("not-found", "No such unit.", "no-unit");
  const owner = meta.get("owner") as unknown;
  if (!isOwner(owner)) throw refuse("failed-precondition", "The unit has no valid owner.", "no-owner");
  if (!canManage(c, owner)) throw refuse("permission-denied", "Only this unit's admins can do that.", "not-unit-admin");
  // An organization's own admin publishes, unpublishes and deletes nothing while it is suspended or being deleted.
  if (owner !== "public") await refuseClosedOrg(c, owner);
  return { c, unitId, meta, owner };
}

/**
 * Rewrites owner's catalog.json from the entries stored on its published units. Two publishes at once could each miss
 * the other's entry, so it re-reads after writing and writes again if the set changed. Storage's "too soon" answers are
 * waited out inside saveJson (storage.ts). Exported for sitesJob, which mends the catalogs marked in CATALOGS_DOC.
 */
export async function writeCatalog(owner: Owner) {
  const order = Object.fromEntries((await loadTracks()).map((t) => [t.id, t.order]));
  const read = async () => (await db.collection("units").where("owner", "==", owner).get()).docs
    .map((d) => d.get("published.entry") as CatalogEntry | undefined).filter((e): e is CatalogEntry => !!e);
  const key = (es: CatalogEntry[]) => es.map((e) => `${e.id}@${e.version}`).sort().join(",");
  let entries = await read();
  for (let i = 0; i < 3; i++) {
    await saveJson(catalogPath(owner), JSON.stringify(buildCatalog(entries, order)), owner === "public" ? "public, max-age=60" : "private, max-age=60");
    const again = await read();
    if (key(again) === key(entries)) return;
    entries = again;
  }
}

/**
 * writeCatalog for a change Firestore already holds. If the file still can't be written after saveJson's tries, the
 * editor (Firestore) and what learners see (catalog.json) disagree: the owner is marked in CATALOGS_DOC, so sitesJob
 * writes the catalog within 15 minutes with nobody doing anything, the change is audited as pending, and the caller is
 * told it is on its way (`unavailable`, reason catalog-pending) instead of getting Storage's raw error. Nothing after
 * the catalog runs (the unit's files stay, so the catalog phones still hold keeps working until the new one is there).
 */
async function catalogOrPending(owner: Owner, action: string, by: string, data: Record<string, unknown>) {
  try { await writeCatalog(owner); } catch (e) {
    logger.error("catalog not written", { event: "catalog-pending", owner, action, error: String(e).slice(0, 500) });
    // Each step on its own: a Firestore hiccup in one must not hide the answer or skip the other.
    await db.doc(CATALOGS_DOC).set({ dirty: { [owner]: Date.now() } }, { merge: true })
      .catch((x: unknown) => logger.error("catalog not marked for mending", { event: "catalog-unmarked", owner, error: String(x).slice(0, 500) }));
    await audit(action, by, { ...data, catalog: "pending" }).catch(() => {});
    throw refuse("unavailable", "Saved, but the course list could not be updated just now. It will follow by itself within 15 minutes.", "catalog-pending");
  }
}

type UnitMeta = { get(field: string): unknown };
/** The highest version units/{id} itself names: the one live now, or the one kept through an unpublish. */
const knownVersion = (meta: UnitMeta) => Math.max(Number(meta.get("published.version")) || 0, Number(meta.get("lastVersion")) || 0);

/**
 * The last version number ever published for a unit (0 for none). units/{id} says so (knownVersion) once it has been
 * published, or unpublished, by this code. A unit unpublished before `lastVersion` was kept (published null, no
 * lastVersion), or deleted and made again under the same id, says nothing: then the record is read once, from what is
 * still there: the unit's versioned files in Storage (an unpublish whose catalog was pending left them), and the audit
 * log, where every publish wrote its version (equality filters only, so no extra index). The next publish then stores
 * the answer on the unit, so this is read at most once per such unit.
 */
async function lastVersionOf(meta: UnitMeta, owner: Owner, unitId: string): Promise<number> {
  const known = knownVersion(meta);
  if (known > 0) return known;
  const [[files], published] = await Promise.all([
    bucket().getFiles({ prefix: unitPrefix(owner, unitId) }),
    db.collection("audit").where("action", "==", "publishUnit").where("unitId", "==", unitId).select("version", "owner").get(),
  ]);
  const fromFiles = files.map((f) => versionOf(f.name)).filter(Number.isFinite);
  // Only this owner's publishes: an org unit id never names a public one (idAllowed), but the check costs nothing.
  const fromAudit = published.docs.filter((d) => d.get("owner") === owner).map((d) => Number(d.get("version"))).filter((n) => Number.isInteger(n) && n > 0);
  return Math.max(0, ...fromFiles, ...fromAudit);
}

/** The field an unpublish writes beside `published: null`: the version counter, when the unit has one to keep. */
const keepVersion = (meta: UnitMeta): { lastVersion?: number } => { const n = knownVersion(meta); return n > 0 ? { lastVersion: n } : {}; };

async function deleteJson(owner: Owner, unitId: string, keepFrom = Infinity) {
  const [files] = await bucket().getFiles({ prefix: unitPrefix(owner, unitId) });
  const doomed = keepFrom === Infinity ? files.map((f) => f.name) : staleVersions(files.map((f) => f.name), keepFrom);
  await Promise.all(doomed.map((name) => bucket().file(name).delete({ ignoreNotFound: true })));
}

/**
 * Validate the draft, write content/…/units/{id}/v{n+1}.json, and rebuild the catalog. The editor sends the draft
 * `rev` its screen shows: a draft someone saved since (two admins at once, an autosave from another tab) is refused
 * rather than published unseen (FS-RACES).
 */
export const publishUnit = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (req) => {
  const { c, unitId, owner } = await target(req);
  const rev = Number.isInteger(req.data?.rev) ? Number(req.data.rev) : undefined;
  return publishDraft(owner, unitId, c.uid, rev);
});

/** Each published picture in the unit's text, its size in KB by its link (catalog.ts sizeByLang counts them). */
async function figureSizes(unit: Unit): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const name = bucket().name;
  await Promise.all(allFigureUrls(unit).map(async (url) => {
    const path = figurePath(url, name);
    if (!path) return;
    try {
      const [m] = await bucket().file(path).getMetadata();
      const size = Number(m.size);
      if (Number.isFinite(size) && size > 0) out[url] = Math.round(size / 1024);
    } catch { /* not there: counts nothing (the seed refuses missing pictures) */ }
  }));
  return out;
}

/**
 * Publishes a unit's saved draft. The callable above and `npm run seed` (scripts/seed-content.mjs, which publishes the
 * starting courses) both go through here, so a seeded unit is checked and laid out exactly like one from the editor.
 */
export async function publishDraft(owner: Owner, unitId: string, by: string, rev?: number) {
  const meta = await db.doc(`units/${unitId}`).get();
  if (!meta.exists || meta.get("owner") !== owner) throw refuse("not-found", "No such unit.", "no-unit");
  const c = { uid: by };
  const draft = await db.doc(`unitDrafts/${unitId}`).get();
  // The draft must be this owner's too (L12): an org admin can't publish another owner's draft under their own unit.
  if (!draft.exists || draft.get("owner") !== owner) throw new HttpsError("failed-precondition", "The unit's draft belongs to someone else.");
  if (rev !== undefined && (Number(draft.get("rev")) || 0) !== rev) {
    throw new HttpsError("aborted", "Someone saved this unit after you opened it. Reload it, check it, then publish.", { reason: "changed" });
  }
  const unit = draft.get("unit") as Unit | undefined;
  // The unit's track must be one platform admins set up, and its level must fit that track.
  const errors = errorsOf(validateUnit(unit, { tracks: levelsByTrack(await loadTracks()) }));
  if (errors.length) throw refuse("invalid-argument", "The unit has errors. Fix them in the editor first.", "draft-invalid", { issues: errors.slice(0, 20) });
  if (!unit || unit.id !== unitId) throw refuse("failed-precondition", "The draft's id does not match the unit.", "draft-id");
  if (!idAllowed(owner, unitId)) throw new HttpsError("failed-precondition", "Organization units need a generated id.");
  // Never a version number used before: v{n}.json is immutable and phones keep it forever (cache-first), so a unit
  // unpublished at v3 and published again must become v4, not v1 with other content under an old path.
  const version = (await lastVersionOf(meta, owner, unitId)) + 1;
  // English and Arabic in v{n}.json; each added language in its own v{n}.{lang}.json with English (its fallback), so a
  // phone downloads only its own language (the catalog entry's `langs`).
  const files: [string, string, string][] = [["en", unitPath(owner, unitId, version), JSON.stringify(inLanguages(unit, ["ar"]))]];
  for (const lang of extraLangs(unit)) files.push([lang, unitLangPath(unitPath(owner, unitId, version), lang), JSON.stringify(inLanguages(unit, [lang]))]);
  // Versioned paths never change, so phones may keep them forever; org units stay out of shared caches. Stored gzipped
  // (storage.ts saveJson), so the download size counts the gzipped bytes phones fetch.
  const cache = `${owner === "public" ? "public" : "private"}, max-age=31536000, immutable`;
  await Promise.all(files.map(([, path, body]) => saveJson(path, body, cache)));
  const bytes: Record<string, number> = Object.fromEntries(files.map(([lang, , body]) => [lang, Math.min(Buffer.byteLength(body), gzipSync(body).length)]));
  bytes.ar = bytes.en;
  // The download size counts the pictures in the text too (the capstones' screenshots), which phones save with it.
  const figureKB = await figureSizes(unit);
  // `rev` is the draft revision that went live: the editor shows "changes not published" while the draft's rev differs.
  await meta.ref.update({ published: { version, rev: Number(draft.get("rev")) || 0, at: FieldValue.serverTimestamp(), by: c.uid, entry: catalogEntry(unit, owner, version, bytes, figureKB) }, lastVersion: version });
  await catalogOrPending(owner, "publishUnit", c.uid, { unitId, owner, version });
  await deleteJson(owner, unitId, version);
  await audit("publishUnit", c.uid, { unitId, owner, version });
  return { version };
}

/** Take a unit away from learners. 120 s: the catalog's own waits for Storage (saveJson) can take most of a minute. */
export const unpublishUnit = onCall({ timeoutSeconds: 120 }, async (req) => {
  const { c, unitId, owner } = await target(req);
  return unpublishDraft(owner, unitId, c.uid);
});

/**
 * Takes a unit out of its owner's catalog and deletes its published JSON. The draft and the media stay, so publishing
 * again needs no new uploads, and learners' progress is untouched. The callable above and `npm run seed -- --unpublish`
 * (which retires a starting course) both go through here.
 */
export async function unpublishDraft(owner: Owner, unitId: string, by: string) {
  const meta = await db.doc(`units/${unitId}`).get();
  if (!meta.exists || meta.get("owner") !== owner) throw refuse("not-found", "No such unit.", "no-unit");
  // The version counter stays (lastVersion), so the next publish writes v(n+1).json and never an old path again.
  await meta.ref.update({ published: null, ...keepVersion(meta) });
  await catalogOrPending(owner, "unpublishUnit", by, { unitId, owner });
  await deleteJson(owner, unitId);
  await audit("unpublishUnit", by, { unitId, owner });
  return { ok: true };
}

/**
 * Delete a unit everywhere: catalog entry, JSON versions, uploaded media and both Firestore documents. Media that another
 * unit of the same owner still links to (a duplicated unit shares its files) is kept.
 */
export const deleteUnit = onCall(async (req) => {
  const { c, unitId, meta, owner } = await target(req);
  // A catalog that can't be written stops here (catalog-pending): the unit stays, unpublished, and Delete works again
  // once the catalog is there (deleting its files now would leave phones a listed course with no file). Pressing
  // Delete again before sitesJob has mended the catalog finds the unit already unpublished, so the owner's mark is
  // what says the catalog may still list it: the catalog is written first then too.
  const listed = Boolean(meta.get("published"))
    || ((await db.doc(CATALOGS_DOC).get()).get("dirty") as Record<string, unknown> | undefined)?.[owner] != null;
  if (meta.get("published")) await meta.ref.update({ published: null, ...keepVersion(meta) });
  if (listed) await catalogOrPending(owner, "unpublishUnit", c.uid, { unitId, owner, deleting: true });
  await deleteJson(owner, unitId);
  const [media] = await bucket().getFiles({ prefix: mediaPrefix(owner, unitId) });
  if (media.length) {
    const others = (await db.collection("unitDrafts").where("owner", "==", owner).get()).docs.filter((d) => d.id !== unitId).map((d) => JSON.stringify(d.get("unit") ?? ""));
    const keep = mediaStillUsed(media.map((f) => f.name), others);
    await Promise.all(media.filter((f) => !keep.has(f.name)).map((f) => f.delete({ ignoreNotFound: true })));
  }
  const batch = db.batch();
  batch.delete(meta.ref);
  batch.delete(db.doc(`unitDrafts/${unitId}`));
  await batch.commit();
  await audit("deleteUnit", c.uid, { unitId, owner });
  return { ok: true };
});
