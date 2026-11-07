/**
 * The Admin SDK, initialised once, and the helpers every callable shares.
 * index.ts and notify.ts both import from here, so neither imports the other's internals.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { missingBasics } from "./membersCore.js";

// A script that reuses this code (scripts/seed-content.mjs) starts the app itself, with its own credentials.
if (!getApps().length) initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 20 });
export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";

export function caller(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return { uid: req.auth.uid, role: (req.auth.token.role as Role | undefined) ?? "learner", orgId: req.auth.token.orgId as string | undefined };
}
/** Roles that can do more than learn; a token that claims one is re-checked against Auth (freshCaller). */
const STAFF: Role[] = ["teacher", "orgAdmin", "superadmin"];
/**
 * The caller with their claims as Auth holds them now, not as their ID token says. A token lives up to an hour, so an
 * admin who was demoted or removed still holds one that claims the old role (SECURITY in TECHNICAL.md): every
 * privileged callable checks this instead. Tokens that claim no staff role can't gain anything, so they skip the read.
 */
export async function freshCaller(req: CallableRequest) {
  const c = caller(req);
  if (!STAFF.includes(c.role)) return c;
  const claims = (await auth.getUser(c.uid).catch(() => null))?.customClaims ?? {};
  return { uid: c.uid, role: (claims.role as Role | undefined) ?? "learner", orgId: claims.orgId as string | undefined };
}
/** Platform admins only, checked against Auth now. */
export async function requireSuper(req: CallableRequest) {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
  return c;
}
export async function audit(action: string, by: string, data: Record<string, unknown>) {
  await db.collection("audit").add({ action, by, ...data, at: FieldValue.serverTimestamp() });
}
/**
 * A teacher who leaves an organization (or stops teaching in it, or whose account goes) no longer has its pupils:
 * their teacherId is cleared, so project alerts go to the org's admins and the person page offers a new teacher.
 * Equality filters only, so no extra index. Returns how many pupils were released.
 */
export async function releasePupils(orgId: string | null | undefined, teacherUid: string): Promise<number> {
  if (!orgId || !teacherUid) return 0;
  let n = 0;
  for (;;) {
    const page = await db.collection("users").where("orgId", "==", orgId).where("teacherId", "==", teacherUid).select().limit(400).get();
    if (page.empty) return n;
    const batch = db.batch();
    for (const d of page.docs) batch.update(d.ref, { teacherId: null });
    await batch.commit();
    n += page.size;
    if (page.size < 400) return n;
  }
}
/**
 * The profile fields a server write must add when it reaches a new account before the account's app has created its
 * profile (membersCore.missingBasics): its email, name and creation time, from Auth. Reads Auth only for such a
 * profile (none, or one without an email). `account`: the Auth record when the caller already has it.
 */
export async function basicsFor(uid: string, profile: { exists: boolean; data(): Record<string, unknown> | undefined }, account?: UserRecord | null): Promise<Record<string, unknown>> {
  const p = profile.exists ? profile.data() : undefined;
  if (typeof p?.email === "string" && p.email) return {};
  const a = account !== undefined ? account : await auth.getUser(uid).catch(() => null);
  const { createdAt, ...rest } = missingBasics(p, a ? { email: a.email, displayName: a.displayName } : null);
  return { ...rest, ...(createdAt ? { createdAt: FieldValue.serverTimestamp() } : {}) };
}
export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
