/**
 * Course access: a platform admin lets a university teacher read the lesson results and project work of chosen
 * courses (/super/access, /results). The grant and the reads go through here, so every grant and revoke is in the
 * audit log and a grant reaches only the organizations it names.
 *
 * courseAccess/{uid} = { units: string[], orgs: string[], until?: number (ms) | null, name, email, grantedBy, updatedAt }.
 * `orgs` holds organization ids, or "none" for people in no organization, and is fixed when the grant is made: an
 * admin who names none gets the teacher's own organization as Auth holds it at that moment ("none" when they have
 * none), stored like any other. Reading goes by the stored list alone, so a teacher who leaves, is removed or joins
 * another organization (all things they can bring about themselves) reads exactly what the platform admin saw on
 * /super/access, never a different organization's students. A grant stored without `orgs` (made before they were
 * stored; scripts/pin-course-access.mjs pins those once) reads nothing until it is saved again.
 *
 * Progress and submissions carry no organization of their own, so a read takes the course's rows (collection-group
 * queries on unitId) and keeps the ones whose owner's profile is in one of the grant's organizations now.
 */
import { FieldValue, Timestamp, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, requireSuper, str } from "./admin.js";

const UNIT = /^[a-z0-9][a-z0-9-]{1,63}$/;
/** An organization id (Firestore's, or a script's own): one path segment. "none" stands for people in no organization. */
const ORG = /^[A-Za-z0-9_-]{1,128}$/;
export const NO_ORG = "none";
const MAX_UNITS = 50, MAX_ORGS = 20;
/** A grant ends within ten years at most: a time in seconds, or in microseconds, is a mistake and reads as one. */
const MAX_AHEAD = 10 * 365 * 864e5;
/** What one read returns at most, and how many pages of that size it scans to find them among other organizations' rows. */
const MAX_RESULTS = 2000, MAX_WORK = 500, PAGES = 5;

const bad = (reason: string, message: string) => new HttpsError("invalid-argument", message, { reason });
/** A list of 1..max distinct strings that all pass `ok`; null otherwise. */
function list(v: unknown, max: number, ok: (s: string) => boolean): string[] | null {
  if (!Array.isArray(v) || !v.length || v.length > max || !v.every((x) => typeof x === "string" && ok(x))) return null;
  return [...new Set(v as string[])];
}
/** A stored time as milliseconds, whatever wrote it. */
const millis = (v: unknown): number | null => (typeof v === "number" ? v : v instanceof Timestamp ? v.toMillis() : null);

/**
 * grantCourseAccess({ uid, units, orgs?, until? }) → { ok, orgs }. Replaces the person's grant: leaving `orgs` out
 * stores their own organization as it is now (`orgs` in the answer and the audit entry say which), leaving `until`
 * out means "until revoked".
 */
export const grantCourseAccess = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128);
  const units = list(req.data?.units, MAX_UNITS, (s) => UNIT.test(s));
  if (!units) throw bad("bad-units", `Choose 1 to ${MAX_UNITS} courses.`);
  const orgs = req.data?.orgs == null ? null : list(req.data.orgs, MAX_ORGS, (s) => ORG.test(s));
  if (req.data?.orgs != null && !orgs) throw bad("bad-orgs", `Choose 1 to ${MAX_ORGS} organizations.`);
  const until = req.data?.until == null ? null : Number(req.data.until);
  if (until !== null && !(Number.isSafeInteger(until) && until > Date.now() && until < Date.now() + MAX_AHEAD)) throw bad("bad-until", "The end date must be in the future.");
  // A mistyped organization id would be a grant that reads nothing, with nobody the wiser.
  const real = (orgs ?? []).filter((o) => o !== NO_ORG);
  if (real.length && (await db.getAll(...real.map((o) => db.doc(`orgs/${o}`)), { fieldMask: ["name"] })).some((o) => !o.exists)) throw bad("bad-orgs", "No such organization.");

  const account = uid && !uid.includes("/") ? await auth.getUser(uid).catch(() => null) : null;
  if (!account) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  const profile = await db.doc(`users/${uid}`).get();
  // No organization named: the teacher's own, as Auth holds it now, pinned here. Resolved at each read instead, the
  // scope followed the teacher (leaving opened every independent learner's work, joining a school with its student
  // code opened that school's), so the person the grant was for chose whose students it reached.
  const own = account.customClaims?.orgId;
  const pinned = orgs ?? [typeof own === "string" && own ? own : NO_ORG];
  // set, not merge: the grant is exactly what the admin just chose.
  await db.doc(`courseAccess/${uid}`).set({
    units, orgs: pinned, until,
    name: str(profile.get("name"), 120) || str(account.displayName, 120), email: str(account.email, 200) || str(profile.get("email"), 200),
    grantedBy: c.uid, updatedAt: FieldValue.serverTimestamp(),
  });
  // `own`: the admin named no organization, and `orgs` is what that came to.
  await audit("grantCourseAccess", c.uid, { uid, units, orgs: pinned, until, ...(orgs ? {} : { own: true }) });
  return { ok: true, orgs: pinned };
});

/** revokeCourseAccess({ uid }) → { ok }. The entry keeps which courses the person had. */
export const revokeCourseAccess = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128);
  if (!uid || uid.includes("/")) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  const ref = db.doc(`courseAccess/${uid}`), had = await ref.get();
  await ref.delete();
  const units = had.get("units");
  await audit("revokeCourseAccess", c.uid, { uid, units: Array.isArray(units) ? units : [] });
  return { ok: true };
});

/** The user who owns a users/{uid}/progress|submissions/{id} document; "" for anything else of that name. */
const ownerOf = (path: string) => { const p = path.split("/"); return p.length === 4 && p[0] === "users" ? p[1] : ""; };

/**
 * Up to `max` of a course's rows that the caller may see, in document order. With `orgs`, a row is kept when its
 * owner's profile is in one of them now (no profile: a deleted account's leftovers, dropped), and the scan goes on
 * past other organizations' rows for up to PAGES pages, so a small faculty is not crowded out of a busy course.
 * `more`: a cap was reached, so there may be rows this read did not return.
 */
async function rows(base: Query, max: number, orgs: Set<string> | null, orgOf: Map<string, string | null>) {
  const out: DocumentSnapshot[] = [];
  let last: DocumentSnapshot | null = null;
  for (let page = 0; page < (orgs ? PAGES : 1); page++) {
    const got = await (last ? base.startAfter(last) : base).limit(max).get();
    if (orgs) {
      const unknown = [...new Set(got.docs.map((d) => ownerOf(d.ref.path)).filter((u) => u && !orgOf.has(u)))];
      for (let i = 0; i < unknown.length; i += 300) {
        const group = unknown.slice(i, i + 300);
        for (const s of await db.getAll(...group.map((u) => db.doc(`users/${u}`)), { fieldMask: ["orgId"] })) orgOf.set(s.id, s.exists ? ((s.get("orgId") as string | null | undefined) || NO_ORG) : null);
      }
    }
    for (const d of got.docs) {
      const owner = ownerOf(d.ref.path);
      if (!owner) continue;
      if (orgs) { const o = orgOf.get(owner); if (!o || !orgs.has(o)) continue; }
      if (out.length === max) return { docs: out, more: true };
      out.push(d);
    }
    if (got.size < max) return { docs: out, more: false };
    last = got.docs[got.size - 1];
  }
  return { docs: out, more: true };
}

/**
 * courseResults({ unitId }) → { results, work, more }: a course's lesson results and project work, for a teacher whose
 * grant lists the course and has not ended (in the grant's organizations), or for a platform admin (everyone).
 * Final projects first, then the newest. Reading leaves no audit entry (it would be one per page view).
 */
export const courseResults = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (req) => {
  const c = await freshCaller(req);
  const unitId = str(req.data?.unitId, 64);
  let orgs: Set<string> | null = null;
  if (c.role !== "superadmin") {
    const grant = unitId ? await db.doc(`courseAccess/${c.uid}`).get() : null;
    const units = grant?.get("units"), until = millis(grant?.get("until"));
    if (!grant?.exists || !Array.isArray(units) || !units.includes(unitId) || (until !== null && until <= Date.now())) {
      throw new HttpsError("permission-denied", "You have no access to this course's results.", { reason: "no-grant" });
    }
    // The organizations stored with the grant, and no others: never the caller's own organization as it is now, which
    // they can change by themselves (leaveOrg, joinOrg with any school's student code). A grant that stores none (made
    // before they were pinned, and not yet pinned by scripts/pin-course-access.mjs) reads nothing.
    const named = grant.get("orgs");
    orgs = new Set(Array.isArray(named) ? named.filter((o): o is string => typeof o === "string" && ORG.test(o)) : []);
    if (!orgs.size) throw new HttpsError("permission-denied", "You have no access to this course's results.", { reason: "no-grant" });
    // The account as Auth holds it now. A grantee's token often claims no staff role, so freshCaller did not look:
    // a disabled account's ID token lives on for up to an hour, and its grant stops at once.
    const account = await auth.getUser(c.uid).catch(() => null);
    if (account?.disabled) throw new HttpsError("permission-denied", "This account is disabled.", { reason: "disabled" });
  } else if (!UNIT.test(unitId)) throw bad("bad-unit", "Which course?");

  const orgOf = new Map<string, string | null>();
  const [p, s] = await Promise.all([
    rows(db.collectionGroup("progress").where("unitId", "==", unitId), MAX_RESULTS, orgs, orgOf),
    rows(db.collectionGroup("submissions").where("unitId", "==", unitId), MAX_WORK, orgs, orgOf),
  ]);
  const results = p.docs.map((d) => ({ uid: ownerOf(d.ref.path), lessonId: String(d.get("lessonId") ?? d.id), accuracy: Number(d.get("accuracy")) || 0, completedAt: (d.get("completedAt") as string | undefined) ?? null }));
  // Exactly what the screen shows (apps/web/src/results/data.ts StudentWork, and a capstone milestone's own fields,
  // admin/WorkBody.tsx): the review (status, feedback, who reviewed) stays between the student and their own teacher,
  // and what the AI review cost stays with the platform.
  const work = s.docs.map((d) => {
    const x = d.data() ?? {}, at = x.createdAt;
    const { usd: _usd, ...aiReview } = (x.aiReview && typeof x.aiReview === "object" ? x.aiReview : {}) as Record<string, unknown>;
    return {
      id: d.id, uid: ownerOf(d.ref.path), lessonId: x.lessonId ?? "", stepId: x.stepId ?? null, text: x.text ?? "", final: x.final === true,
      explain: x.explain ?? null, aiUse: x.aiUse ?? null, name: x.name ?? null, fileUrl: x.fileUrl ?? null, fileName: x.fileName ?? null,
      files: Array.isArray(x.files) ? x.files : [], createdAt: at instanceof Timestamp ? { seconds: at.seconds } : null,
      ...(x.capstone === true ? { capstone: true, repo: x.repo ?? null, links: Array.isArray(x.links) ? x.links : [], checks: Array.isArray(x.checks) ? x.checks : [], ...(x.aiReview ? { aiReview } : {}) } : {}),
    };
  }).sort((a, b) => Number(b.final) - Number(a.final) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return { results, work, more: p.more || s.more };
});
