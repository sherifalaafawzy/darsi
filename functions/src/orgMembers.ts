/**
 * An organization's members, beyond one person at a time (TECHNICAL.md):
 * - leaveOrg: a member who signed up themself leaves; an account the organization made is removed by its admin.
 * - setMemberSuspended: an org admin locks (or unlocks) a login the organization manages.
 * - bulkMembers: remove, suspend, restore, a new password or a role for up to 200 people, each with its own outcome.
 * - updateMembers: class, teacher and name edits, checked and audited here (they were the app's own writes, with no
 *   audit entry).
 * - listMembers: the member list as lean rows, in pages (every admin screen downloaded every member's whole profile).
 * Every refusal carries a stable `details.reason` (admin/refusals.ts words it); the pure decisions are in
 * orgMembersCore.ts. Role and organization changes go through platform.assign, as a platform admin's do: it moves the
 * member count, clears class and teacher, releases a teacher's pupils and (writeClaims) ends the sessions.
 */
import { FieldPath, FieldValue, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, str } from "./admin.js";
import type { Removed } from "./membersCore.js";
import { bulkAction, isId, isManaged, listView, memberPatch, memberRole, memberRow, onlyWorkingAdmin, pageLimit, patchFor, SELF_REASON, selectFor, uidList, withRemovedAll, type BulkAction, type MemberRole } from "./orgMembersCore.js";
import { generatePassword, USERNAME_DOMAIN } from "./passwords.js";
import { assign } from "./platform.js";
import { ownLogin, ssoKeepWayIn, ssoSetBlocked } from "./ssoStore.js";

type Code = ConstructorParameters<typeof HttpsError>[0];
const refuse = (code: Code, message: string, reason: string) => new HttpsError(code, message, { reason });
const notMember = () => refuse("not-found", "Not a member of this organization.", "not-member");
const signedIn = (req: CallableRequest) => { if (!req.auth) throw refuse("unauthenticated", "Sign in first.", "signed-out"); return req.auth; };

/**
 * This organization's admins (or a platform admin), by the claims Auth holds now (freshCaller: a demoted admin's old
 * token gets nothing). An org admin of a suspended organization, or of one being deleted, changes and reads nothing
 * here; a platform admin still does, to sort it out.
 */
export async function orgAdmin(req: CallableRequest, orgId: string) {
  signedIn(req);
  const c = await freshCaller(req);
  if (c.role !== "superadmin" && (c.role !== "orgAdmin" || !orgId || c.orgId !== orgId)) throw refuse("permission-denied", "Only this organization's admins can do that.", "not-org-admin");
  if (!isId(orgId)) throw refuse("invalid-argument", "Choose an organization.", "no-org");
  if (c.role === "superadmin") return c;
  const status = (await db.doc(`orgs/${orgId}`).get()).get("status");
  if (status === "suspended") throw refuse("failed-precondition", "This organization is suspended.", "org-suspended");
  if (status === "deleting") throw refuse("failed-precondition", "This organization is being deleted.", "org-deleting");
  return c;
}

/** A member's profile, or `not-member`: nobody acts on another organization's people, or on an id that names nobody. */
async function member(orgId: string, uid: unknown) {
  if (!isId(uid)) throw notMember();
  const u = await db.doc(`users/${uid}`).get();
  if (!u.exists || u.get("orgId") !== orgId) throw notMember();
  return u;
}

/**
 * An organization keeps an admin who can sign in: platform.refuseLastAdmin's rule and its `last-admin` reason, but a
 * suspended admin doesn't count as the one who stays (now that an organization can suspend its own people, "another
 * admin" who is locked out is no admin at all). Called before an admin is removed, demoted or suspended, or leaves.
 */
async function keepAnAdmin(uid: string, orgId: string) {
  const admins = await db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").select("suspended").get();
  if (onlyWorkingAdmin(uid, admins.docs.map((d) => ({ id: d.id, suspended: d.get("suspended") })))) {
    throw refuse("failed-precondition", "This is the organization's only admin. Make someone else its admin first.", "last-admin");
  }
  // With school sign-in on, one admin who stays must sign in without it (ssoStore.ssoKeepWayIn, `sso-last-way-in`).
  await ssoKeepWayIn(orgId, uid);
}

/* ---------- What is done to one member (the single callables and bulkMembers share these) ---------- */

/**
 * Locks a login the organization manages. Someone who signs in with their own email or Google is removed instead
 * (`own-login`): their account is theirs, and a removed person can't rejoin until readmitted. An account a platform
 * admin suspended stays theirs (`platform-suspended`): re-suspending it here would let the org admin restore it.
 * The profile is marked first and Auth second, so a call that fails half-way can simply be repeated.
 */
async function suspend(orgId: string, u: DocumentSnapshot, by: string, reason: string) {
  if (!isManaged(u.data(), orgId, USERNAME_DOMAIN)) throw refuse("failed-precondition", "This person signs in with their own account: remove them from the organization instead.", "own-login");
  const now = u.get("suspended") as { byOrg?: unknown } | undefined;
  if (now && now.byOrg !== orgId) throw refuse("failed-precondition", "A platform admin suspended this account.", "platform-suspended");
  if (u.get("role") === "orgAdmin") await keepAnAdmin(u.id, orgId);
  if (!(await auth.getUser(u.id).catch(() => null))) throw refuse("not-found", "No such account.", "no-account");
  await u.ref.update({ suspended: { at: FieldValue.serverTimestamp(), by, reason, byOrg: orgId } });
  await auth.updateUser(u.id, { disabled: true });
  await auth.revokeRefreshTokens(u.id); // signed-in phones stop within the hour, and at once for anything privileged
  // The school's sign-in stops opening it too (until restore).
  await ssoSetBlocked(u.id, true, orgId);
}

/** Unlocks a login this organization locked; one a platform admin suspended is only theirs to restore. */
async function restore(orgId: string, u: DocumentSnapshot) {
  const now = u.get("suspended") as { byOrg?: unknown } | undefined;
  if (!now) throw refuse("failed-precondition", "This account is not suspended.", "not-suspended");
  if (now.byOrg !== orgId) throw refuse("failed-precondition", "A platform admin suspended this account: only they can restore it.", "platform-suspended");
  await auth.updateUser(u.id, { disabled: false });
  await u.ref.update({ suspended: FieldValue.delete() });
  await ssoSetBlocked(u.id, false, orgId);
}

/** A new password, as resetMemberPassword (index.ts): only for a username login with nothing but a password (M4). */
async function resetPassword(u: DocumentSnapshot, length: number) {
  const account = await auth.getUser(u.id).catch(() => null);
  // Only the school's sign-in opens it: there is no Darsi password to reset (index.ts resetMemberPassword says the same).
  if (u.get("sso") === true && !ownLogin(account)) throw refuse("failed-precondition", "This person signs in with the school's own sign-in, which has no Darsi password.", "sso-login");
  const own = !account?.email?.endsWith(`@${USERNAME_DOMAIN}`) || account.providerData.some((p) => p.providerId !== "password");
  if (own) throw refuse("failed-precondition", "This person signs in with their own email or Google account, so only they can change its password.", "own-login");
  const password = generatePassword(length);
  await auth.updateUser(u.id, { password });
  // The time the password was set, so passwordChanged can tell a real change from a flag cleared without one (I1).
  await u.ref.update({ mustChangePassword: true, passwordSetAt: Date.now() });
  return { login: String(u.get("username") || u.get("email") || ""), password };
}

async function remove(orgId: string, u: DocumentSnapshot) {
  if (u.get("role") === "orgAdmin") await keepAnAdmin(u.id, orgId);
  await assign(u.id, "learner", null);
}

async function giveRole(orgId: string, u: DocumentSnapshot, role: MemberRole) {
  if (u.get("role") === role) return; // nothing to change: no write, and nobody's sessions end
  if (u.get("role") === "orgAdmin") await keepAnAdmin(u.id, orgId);
  await assign(u.id, role, orgId);
}

/* ---------- Callables ---------- */

/**
 * A member leaves their organization and becomes an independent learner; their learning stays with them. Not for an
 * account the organization made (`managed`: its admin removes it, and the login is the organization's), and not for
 * the organization's only admin (`last-admin`).
 */
export const leaveOrg = onCall(async (req) => {
  signedIn(req);
  // freshCaller, though nobody's role is asked here: it is what remembers the request (admin.ts), so the audit entry
  // below carries the address and request id like every other one; and a disabled admin's old token gets nothing.
  const { uid } = await freshCaller(req);
  const u = await db.doc(`users/${uid}`).get();
  const orgId = u.get("orgId") as string | null | undefined, role = (u.get("role") as string | undefined) ?? null;
  if (!u.exists || !orgId) throw refuse("failed-precondition", "You don't belong to an organization.", "not-in-org");
  // A suspended account changes nothing (firestore.rules says the same of its profile): its token may outlive the
  // suspension by up to an hour, and leaving would take the person out of the organization's sight meanwhile.
  if (u.get("suspended")) throw refuse("permission-denied", "This account is suspended.", "disabled");
  if (isManaged(u.data(), orgId, USERNAME_DOMAIN)) throw refuse("failed-precondition", "Your organization made this account: ask its admin to remove you.", "managed");
  if (role === "orgAdmin") await keepAnAdmin(uid, orgId);
  await assign(uid, "learner", null);
  await audit("leaveOrg", uid, { orgId, role });
  return { ok: true };
});

/** An org admin locks or unlocks one managed login (suspend and restore above). */
export const setMemberSuspended = onCall(async (req) => {
  const orgId = str(req.data?.orgId, 128), uid = req.data?.uid as unknown, suspended = req.data?.suspended as unknown;
  const by = await orgAdmin(req, orgId);
  if (typeof suspended !== "boolean") throw refuse("invalid-argument", "suspended must be true or false.", "bad-suspended");
  if (uid === by.uid) throw refuse("failed-precondition", "You can't suspend your own account.", "self-suspend");
  const u = await member(orgId, uid);
  const reason = str(req.data?.reason, 500);
  if (suspended) await suspend(orgId, u, by.uid, reason); else await restore(orgId, u);
  await audit("setMemberSuspended", by.uid, { orgId, uid: u.id, suspended, ...(suspended ? { reason } : {}) });
  return { suspended };
});

interface BulkRow { uid: string; ok: boolean; reason?: string; login?: string; password?: string }

/**
 * One action for up to 200 members, ten at a time. One person's refusal never fails the call: each row says what
 * happened, with the same reasons as the single callables. People who are the organization's admins go one after
 * another, so two of them chosen together can't both pass the "only admin" check and leave it with none.
 */
export const bulkMembers = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (req): Promise<{ results: BulkRow[] }> => {
  const orgId = str(req.data?.orgId, 128);
  const by = await orgAdmin(req, orgId);
  const list = uidList(req.data?.uids);
  if ("reason" in list) throw refuse("invalid-argument", "Choose between 1 and 200 people.", list.reason);
  const action: BulkAction | null = bulkAction(req.data?.action);
  if (!action) throw refuse("invalid-argument", "Unknown action.", "bad-action");
  const role = action === "setRole" ? memberRole(req.data?.role) : null;
  if (action === "setRole" && !role) throw refuse("invalid-argument", "Invalid role.", "bad-role");
  const reason = str(req.data?.reason, 500), length = Number(req.data?.passwordLength) || 10;

  let line: Promise<unknown> = Promise.resolve();
  const inLine = <T>(fn: () => Promise<T>): Promise<T> => { const p = line.then(fn, fn); line = p.catch(() => {}); return p; };
  const removed: Record<string, { at: number; name: string }> = {};
  const one = async (uid: string): Promise<Partial<BulkRow>> => {
    if (uid === by.uid) throw refuse("failed-precondition", "You can't do this to your own account.", SELF_REASON[action]);
    const u = await member(orgId, uid);
    const act = async (): Promise<Partial<BulkRow>> => {
      if (action === "remove") { await remove(orgId, u); removed[uid] = { at: Date.now(), name: str(u.get("name"), 120) }; return {}; }
      if (action === "suspend") { await suspend(orgId, u, by.uid, reason); return {}; }
      if (action === "restore") { await restore(orgId, u); return {}; }
      if (action === "resetPassword") return resetPassword(u, length);
      await giveRole(orgId, u, role!);
      return {};
    };
    return u.get("role") === "orgAdmin" && action !== "restore" && action !== "resetPassword" ? inLine(act) : act();
  };

  const results: BulkRow[] = [];
  for (let i = 0; i < list.uids.length; i += 10) {
    const chunk = list.uids.slice(i, i + 10);
    const done = await Promise.allSettled(chunk.map(one));
    for (const [j, d] of done.entries()) {
      if (d.status === "fulfilled") { results.push({ uid: chunk[j], ok: true, ...d.value }); continue; }
      const why = (d.reason as { details?: { reason?: unknown } } | null)?.details?.reason;
      if (typeof why !== "string") logger.error("bulkMembers: a row failed", { orgId, action, uid: chunk[j], error: String(d.reason) });
      results.push({ uid: chunk[j], ok: false, reason: typeof why === "string" ? why : "failed" });
    }
    // Who was removed (joinOrg reads it: a removed person's old invite code no longer lets them back in). Written per
    // ten, so a call that runs out of time has recorded everyone it removed but the last few. Read and written in one
    // transaction and kept to REMOVED_MAX, as the single removal does (a merge only ever added to it).
    const gone = Object.fromEntries(chunk.filter((uid) => removed[uid]).map((uid) => [uid, removed[uid]]));
    if (Object.keys(gone).length) {
      const ref = db.doc(`orgs/${orgId}/private/removed`);
      await db.runTransaction(async (tx) => { tx.set(ref, { uids: withRemovedAll((await tx.get(ref)).get("uids") as Removed | undefined, gone) }); })
        .catch((e) => logger.error("bulkMembers: removed people not recorded", { orgId, uids: Object.keys(gone), error: String(e) }));
    }
  }
  const ok = results.filter((r) => r.ok).map((r) => r.uid);
  // `op`, not `action`: an audit entry's own `action` is the callable's name, and a field of that name would replace
  // it. Never the new passwords: the log says whose were reset, not what to.
  await audit("bulkMembers", by.uid, { orgId, op: action, ok: ok.length, refused: results.length - ok.length, uids: ok, ...(role ? { role } : {}), ...(action === "suspend" ? { reason } : {}) });
  return { results };
});

/**
 * Class, teacher and name edits for up to 200 members. A teacher must teach in this organization (`bad-teacher`) and
 * is given to students only; a name is for one person. People who aren't members are skipped. Each hundred is read
 * and written in one transaction, so someone removed while this runs never gets the old organization's class back.
 * `updated`: the members the edit is for (those who already had these values included; they aren't written again).
 */
export const updateMembers = onCall(async (req) => {
  const orgId = str(req.data?.orgId, 128);
  const by = await orgAdmin(req, orgId);
  const list = uidList(req.data?.uids);
  if ("reason" in list) throw refuse("invalid-argument", "Choose between 1 and 200 people.", list.reason);
  const checked = memberPatch(req.data?.patch, list.uids.length);
  if ("reason" in checked) throw refuse("invalid-argument", "This edit can't be saved.", checked.reason);
  const { patch } = checked;
  if (patch.teacherId) {
    const t = await db.doc(`users/${patch.teacherId}`).get();
    if (t.get("orgId") !== orgId || (t.get("role") !== "teacher" && t.get("role") !== "orgAdmin")) throw refuse("failed-precondition", "Choose a teacher or an admin of this organization.", "bad-teacher");
  }
  const applied: string[] = [];
  for (let i = 0; i < list.uids.length; i += 100) {
    const refs = list.uids.slice(i, i + 100).map((uid) => db.doc(`users/${uid}`));
    applied.push(...await db.runTransaction(async (tx) => {
      const mine: string[] = []; // a retried transaction starts its count again
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      for (const u of snaps) {
        if (!u.exists || u.get("orgId") !== orgId) continue;
        const { applies, write } = patchFor(patch, u.data() ?? {});
        if (!applies) continue;
        mine.push(u.id);
        if (Object.keys(write).length) tx.update(u.ref, write);
      }
      return mine;
    }));
  }
  await audit("updateMembers", by.uid, { orgId, patch, updated: applied.length, uids: applied });
  return { updated: applied.length };
});

/**
 * An organization's members as lean rows (orgMembersCore.memberRow), by account id, in pages: one query that asks
 * Firestore only for the fields a row holds (select), so nobody's notification settings, levels, tracks or devices
 * leave the server, and a list never carries whole summaries. `view: "report"` returns each whole summary instead,
 * for the analytics report. `next` is the last id of a full page: pass it as `after` for the next one. A read: no
 * audit entry.
 */
// 120 s, as the app waits for it (firebase.ts timeouts): a page of 2000 report rows from a slow moment must not be
// cut off by the server's default 60 s while the screen still waits.
export const listMembers = onCall({ memory: "512MiB", timeoutSeconds: 120 }, async (req) => {
  const orgId = str(req.data?.orgId, 128);
  await orgAdmin(req, orgId);
  const view = listView(req.data?.view);
  if (!view) throw refuse("invalid-argument", "view must be list or report.", "bad-view");
  const after = req.data?.after as unknown;
  if (after !== undefined && after !== null && after !== "" && !isId(after)) throw refuse("invalid-argument", "after must be a member's id.", "bad-after");
  const limit = pageLimit(req.data?.limit);
  let q: Query = db.collection("users").where("orgId", "==", orgId).orderBy(FieldPath.documentId());
  if (after) q = q.startAfter(after);
  const page = await q.limit(limit).select(...selectFor(view)).get();
  const members = page.docs.map((d) => memberRow(d.id, d.data(), orgId, view, USERNAME_DOMAIN));
  return { members, next: page.docs.length === limit ? page.docs[page.docs.length - 1].id : null };
});
