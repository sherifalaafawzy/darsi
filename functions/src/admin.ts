/**
 * The Admin SDK, initialised once, and the helpers every callable shares.
 * index.ts and notify.ts both import from here, so neither imports the other's internals.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { clientIp } from "./clientIp.js";
import { missingBasics } from "./membersCore.js";

// A script that reuses this code (scripts/seed-content.mjs) starts the app itself, with its own credentials.
if (!getApps().length) initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 20 });
export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";

/**
 * Where the request being answered came from, for the audit log: the client's address (clientIp.ts), its user agent
 * and a short id that ties an audit entry to the log lines of the same request. Kept per request by Node's async
 * context, so audit()'s 40-odd call sites need no extra argument and two requests answered at once never see each
 * other's. Empty outside a callable (triggers, schedules, webhooks, scripts).
 */
export interface RequestContext { ip: string; ua: string; rid: string }
const context = new AsyncLocalStorage<RequestContext>();
export const requestContext = (): RequestContext | undefined => context.getStore();

/**
 * Remembers the request for audit(). Called from caller(), which every callable reaches (directly, or through
 * freshCaller and requireSuper) in its first synchronous step: enterWith() then covers the rest of the handler.
 * A handler that awaited something in a helper before its caller() would lose it on the way back out.
 * Never throws: a request object without rawRequest (unit tests) gets "?" for the address.
 */
const known = new WeakMap<object, RequestContext>();
function remember(req: CallableRequest) {
  try {
    // One id per request, however often its handler asks who is calling (caller, then freshCaller).
    let ctx = known.get(req);
    if (!ctx) {
      const raw = req.rawRequest as { headers?: Record<string, string | string[] | undefined>; ip?: unknown } | undefined;
      const ua = raw?.headers?.["user-agent"];
      ctx = {
        ip: clientIp(raw?.headers ?? {}, String(raw?.ip ?? "?")),
        ua: String((Array.isArray(ua) ? ua[0] : ua) ?? "").slice(0, 200),
        rid: randomBytes(4).toString("hex"),
      };
      known.set(req, ctx);
    }
    if (context.getStore() !== ctx) context.enterWith(ctx);
  } catch { /* the audit entry goes without an address rather than the request failing */ }
}

export function caller(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  remember(req);
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
  const account = await auth.getUser(c.uid).catch(() => null);
  // A disabled account's ID token also lives on for up to an hour: staff powers stop at once.
  if (account?.disabled) throw new HttpsError("permission-denied", "This account is disabled.", { reason: "disabled" });
  const claims = account?.customClaims ?? {};
  return { uid: c.uid, role: (claims.role as Role | undefined) ?? "learner", orgId: claims.orgId as string | undefined };
}
/**
 * Platform admins only, checked against Auth now. The refusal carries `details.reason` "not-super" like every other
 * refusal (admin/refusals.ts words it), so a screen never has to guess from the English message.
 */
export async function requireSuper(req: CallableRequest) {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.", { reason: "not-super" });
  return c;
}
/**
 * One entry in the audit log: who did what, with the caller's own details (an `orgId` among them puts the entry in
 * that organization's log, audit.ts orgAudit), plus the request's address and id when a callable made it. The log
 * line carries only what finds the entry again, never the details (they can name people).
 */
export async function audit(action: string, by: string, data: Record<string, unknown>) {
  const ctx = context.getStore();
  await db.collection("audit").add({ action, by, ...data, ...(ctx ? { ip: ctx.ip, rid: ctx.rid } : {}), at: FieldValue.serverTimestamp() });
  logger.info("audit", { action, by, orgId: typeof data.orgId === "string" ? data.orgId : null, rid: ctx?.rid ?? null });
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
