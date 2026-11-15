/**
 * An organization's own audit log: the privileged changes the functions made in it (admin.ts audit), for its admins
 * and for platform admins. The `audit` collection itself stays closed to everyone but platform admins
 * (firebase/firestore.rules), so an org admin reads it only through here, one organization at a time.
 *
 * An entry belongs to an organization when its writer passed `orgId` at the top level; entries written before a
 * call site did so (and the ones that concern no organization) are simply not returned. Reading leaves no entry.
 */
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, freshCaller, str } from "./admin.js";
import { refuseClosedOrg } from "./closedOrg.js";

/** How many entries one read scans at most: PAGES pages of PAGE, so a rare action or one person's entries still fill a screen. */
const PAGE = 100, PAGES = 5;
/**
 * Figures in an entry that are the person's and the platform's, not their organization's (account.ts
 * exportAccountData keeps the same from its admins): taken out for an organization's admin, as `ip` is. A Map, so an
 * action named like something every object has ("constructor") finds nothing. `unlisted` is how many other
 * organizations' removed lists the account was taken off (account.ts unlistRemoved): not this organization's either.
 */
const PERSONAL = new Map<string, readonly string[]>([["deleteAccount", ["payments", "reports", "sessions", "sessionsFailed", "sessionsQueued", "devices", "requests", "ssoIdentities", "unlisted"]]]);
type Entry = Record<string, unknown> & { id: string; action: string; by: string; byName: string; at: number };

/** Firestore values as a callable can send them: timestamps as milliseconds. */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}
/**
 * The paging cursor: an entry's time in milliseconds, keeping Firestore's microseconds as the fraction, so the next
 * page starts exactly after the last entry shown (whole milliseconds would skip an entry written in the same one).
 * A whole number of milliseconds (a date the admin picked) works as well.
 */
const cursorOf = (t: Timestamp) => t.seconds * 1000 + Math.round(t.nanoseconds / 1000) / 1000;
function fromCursor(ms: number): Timestamp {
  const micros = Math.round(ms * 1000);
  return new Timestamp(Math.floor(micros / 1e6), (micros % 1e6) * 1000);
}

/**
 * orgAudit({ orgId, before?, action?, uid?, limit? }) → { entries, next }.
 * Newest first. `before` (ms) pages: pass the previous answer's `next`. `action` keeps one kind of change; `uid`
 * keeps what that person did or what was done to them. `next` is null at the end of the log; an answer with fewer
 * entries than asked and a `next` means the scan stopped at its cap, and the next call goes on from there.
 */
export const orgAudit = onCall(async (req) => {
  const c = await freshCaller(req);
  const orgId = str(req.data?.orgId, 128);
  const own = c.role === "orgAdmin" && !!orgId && c.orgId === orgId;
  if (c.role !== "superadmin" && !own) throw new HttpsError("permission-denied", "Only this organization's admins.", { reason: "not-org-admin" });
  if (!orgId) throw new HttpsError("invalid-argument", "Which organization?", { reason: "no-org" });
  // The log of a suspended organization, or of one being deleted, is the platform admins' to read.
  await refuseClosedOrg(c, orgId);
  const action = str(req.data?.action, 80), uid = str(req.data?.uid, 128);
  const n = req.data?.limit == null ? NaN : Number(req.data.limit);
  const max = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.floor(n))) : 50;
  const before = Number(req.data?.before);
  // Under 1e14 ms (the year 5138): Timestamp throws past the year 9999, which would read as an internal error.
  let after: Timestamp | null = Number.isFinite(before) && before > 0 && before < 1e14 ? fromCursor(before) : null;

  const kept: { id: string; at: Timestamp; data: Record<string, unknown> }[] = [];
  let next: number | null = null;
  scan: for (let page = 0; page < PAGES; page++) {
    let q = db.collection("audit").where("orgId", "==", orgId).orderBy("at", "desc");
    if (after) q = q.startAfter(after);
    const got = await q.limit(PAGE).get();
    for (const d of got.docs) {
      const data = d.data(), at = data.at;
      if (!(at instanceof Timestamp)) continue;
      after = at;
      if ((action && data.action !== action) || (uid && data.by !== uid && data.uid !== uid)) continue;
      kept.push({ id: d.id, at, data });
      // Full: go on from this entry next time, unless it was the log's last one.
      if (kept.length === max) { next = got.size === PAGE || d.id !== got.docs[got.size - 1].id ? cursorOf(at) : null; break scan; }
    }
    if (got.size < PAGE) { next = null; break; }
    next = after ? cursorOf(after) : null;
  }

  // Who acted, by name: one read for all of them.
  const actors = [...new Set(kept.map((e) => String(e.data.by ?? "")).filter((id) => id && !id.includes("/")))];
  const names = new Map<string, string>();
  if (actors.length) for (const s of await db.getAll(...actors.map((id) => db.doc(`users/${id}`)), { fieldMask: ["name"] })) names.set(s.id, String(s.get("name") ?? ""));
  const entries: Entry[] = kept.map(({ id, at, data }) => {
    // The address is the platform's to see (abuse, disputes), not one customer's admin's.
    const { ip, at: _at, ...rest } = data;
    if (c.role !== "superadmin") for (const key of PERSONAL.get(String(data.action)) ?? []) delete rest[key];
    const by = String(data.by ?? "");
    return { ...(plain(rest) as Record<string, unknown>), ...(c.role === "superadmin" && ip !== undefined ? { ip } : {}), id, action: String(data.action ?? ""), by, byName: names.get(by) ?? "", at: at.toMillis() };
  });
  return { entries, next };
});
