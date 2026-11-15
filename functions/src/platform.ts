/**
 * What only platform admins do to organizations and accounts (TECHNICAL.md "Platform administration"): create, edit
 * and delete organizations, put anyone in an organization with any role (org admin included), and change anyone's
 * role anywhere, platform admin included. Roles live in Auth custom claims, so every change goes through here.
 *
 * An organization's life (TECHNICAL.md): active, suspended and back (updateOrg; its staff are
 * frozen, its members keep learning), and deleted in resumable steps (deleteOrg; status "deleting" on the way).
 */
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { recentSignIn } from "./accountCore.js";
import { audit, auth, db, freshCaller, releasePupils, requireSuper, str, type Role } from "./admin.js";
import { refreshClaims, writeClaims } from "./billing.js";
import { refuseClosedOrg } from "./closedOrg.js";
import { isId, isManaged, onlyWorkingAdmin } from "./orgMembersCore.js";
import { generateCode, isValidEmail, isValidUsername, USERNAME_DOMAIN, usernameToEmail } from "./passwords.js";
import { firstAdminProblem, losesPower } from "./roles.js";
import { bucket } from "./storage.js";
import { ssoKeepWayIn, ssoOrgDeleted, ssoSetBlocked } from "./ssoStore.js";

const ROLES: Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];
const IN_ORG: Role[] = ["student", "teacher", "orgAdmin"];
/** What updateOrg may set. "pending" comes only from a request (requestOrg) and "deleting" only from deleteOrg. */
const STATUSES = ["active", "suspended", "rejected"];
/** Members are handled this many at a time: enough to finish a large organization, few enough for Auth's rate limits. */
const AT_ONCE = 25;

/** An organization's editable details, checked: name 2–120 characters, the rest short text. */
function details(d: Record<string, unknown> | undefined, partial: boolean) {
  const out: Record<string, string> = {};
  for (const [k, max] of [["name", 120], ["type", 40], ["country", 80], ["city", 80]] as const) {
    if (d?.[k] === undefined) continue;
    out[k] = str(d[k], max);
  }
  if ((!partial || "name" in out) && (out.name ?? "").length < 2) throw new HttpsError("invalid-argument", "The name needs 2 characters or more.", { reason: "org-name" });
  return out;
}

/**
 * Sets claims and the profile; org changes move the member counts and clear the old org's class and teacher. Someone
 * who leaves an organization, or stops teaching in it, releases its pupils who had them as their teacher.
 *
 * The order depends on the direction. A change that takes power away (a lower role, leaving or changing organization)
 * writes the claims first: if the second write fails, the person has already lost the power and the profile still
 * shows the old role, so the admin sees it didn't finish and repeats it. A change that gives power writes the profile
 * first, as before: a failure then leaves a profile ahead of its claims, which grants nothing.
 *
 * Leaving the organization ends its own suspension of the account (liftOrgSuspension), between the two writes: after
 * the claims, so a change that failed never leaves a suspended member with a working sign-in (fail closed), and before
 * the profile, so a lifting that failed leaves a member the admin still sees and can remove again to finish it.
 */
export async function assign(uid: string, role: Role, orgId: string | null) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  const before = (user.get("orgId") as string | null | undefined) ?? null;
  const roleBefore = (user.get("role") as Role | undefined) ?? "learner";
  const left = before && before !== orgId ? before : null;
  const profile = () => user.ref.set({ role, orgId, claimsUpdatedAt: FieldValue.serverTimestamp(), ...(before !== orgId ? { teacherId: null, group: null, superSeat: false } : {}) }, { merge: true });
  // writeClaims reads the seat from the profile; it comes out the same either way (a seat never follows to a new organization).
  // Leaving always takes power away, so the lifting is on this side only.
  if (losesPower({ role: roleBefore, orgId: before }, { role, orgId })) {
    await writeClaims(uid, role, orgId);
    if (left) await liftOrgSuspension(uid, user.get("suspended"), left);
    await profile();
  } else { await profile(); await writeClaims(uid, role, orgId); }
  if (before !== orgId) {
    if (before) await db.doc(`orgs/${before}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});
    if (orgId) await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(1) });
  }
  if (before && (before !== orgId || (role !== "teacher" && role !== "orgAdmin"))) await releasePupils(before, uid);
  return { before, roleBefore };
}

/**
 * An organization's suspension of one of its logins (orgMembers.ts suspend: `suspended.byOrg`) is the organization's
 * business only: once the person leaves it (removed, moved, released when it is deleted), their sign-in works again and
 * the mark goes. A suspension a platform admin made (no `byOrg`, or another organization's) is kept: it is about the
 * account, wherever it is. Auth first, then the mark, so a failure in between is found and finished by a repeat (the
 * mark still says the organization suspended them). An account Auth no longer has only loses the mark.
 * Returns whether there was such a suspension to lift.
 *
 * Callers lift it only once the person's claims no longer name the organization (assign, removeMember, deleteOrg's
 * letGo), and before the profile stops naming it: a change that fails before the claims leaves the suspension whole,
 * and one that fails here is repeated from the lists, where the person still shows as a member.
 */
export async function liftOrgSuspension(uid: string, suspended: unknown, orgId: string): Promise<boolean> {
  if (!suspended || typeof suspended !== "object" || (suspended as { byOrg?: unknown }).byOrg !== orgId) return false;
  await auth.updateUser(uid, { disabled: false }).catch((e: { code?: string } | null) => { if (e?.code !== "auth/user-not-found") throw e; });
  // The suspension also blocked the school's sign-in for the account (orgMembers.ts suspend): that block ends with it.
  // The callers' writeClaims has already marked the identity as leaving (ssoClaimsMoved), so it comes out `removed`,
  // which "Let back in" finds; left blocked, a school-made account could never be let back in.
  await ssoSetBlocked(uid, false, orgId);
  await db.doc(`users/${uid}`).update({ suspended: FieldValue.delete() });
  return true;
}

export const createOrg = onCall(async (req) => {
  const c = await requireSuper(req);
  const d = details(req.data, false);
  // The first admin is checked before anything is written, so a refusal leaves no organization behind. Naming yourself
  // would make you an org admin and end your platform-admin sessions (setUserRole refuses self-changes for the same
  // reason); another platform admin is demoted only on purpose, from their own page. Nor is another organization's
  // only working admin taken out of it (refuseLastAdmin, as setUserRole: `last-admin`, `sso-last-way-in`).
  const admin = str(req.data?.adminUid, 128);
  if (admin) {
    const profile = await db.doc(`users/${admin}`).get();
    const problem = firstAdminProblem(admin, c.uid, profile);
    if (problem === "self") throw new HttpsError("failed-precondition", "You can't make yourself an organization's admin: you would stop being a platform admin.", { reason: "admin-self" });
    if (problem === "missing") throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
    if (problem === "superadmin") throw new HttpsError("failed-precondition", "That person is a platform admin. Change their role on their page first.", { reason: "admin-super" });
    const adminOf = profile.get("role") === "orgAdmin" ? (profile.get("orgId") as string | null | undefined) : null;
    if (adminOf) await refuseLastAdmin(admin, adminOf);
  }
  const codes = { teacher: generateCode(), student: generateCode() };
  const ref = db.collection("orgs").doc();
  const batch = db.batch();
  batch.set(ref, { type: "school", country: "", city: "", ...d, status: "active", createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), reviewedAt: FieldValue.serverTimestamp(), memberCount: 0 });
  batch.set(db.doc(`orgs/${ref.id}/private/invites`), codes);
  batch.set(db.doc(`inviteCodes/${codes.teacher}`), { orgId: ref.id, role: "teacher" });
  batch.set(db.doc(`inviteCodes/${codes.student}`), { orgId: ref.id, role: "student" });
  await batch.commit();
  const was = admin ? await assign(admin, "orgAdmin", ref.id) : null;
  // This entry is in the new organization's log (orgAudit goes by `orgId`), so it doesn't say where its admin came
  // from; the organization they left gets an entry of its own, as in setUserRole.
  await audit("createOrg", c.uid, { orgId: ref.id, admin: admin || null, ...(was ? { adminBefore: { role: was.roleBefore } } : {}) });
  if (was?.before) await audit("setUserRole", c.uid, { uid: admin, orgId: was.before, roleBefore: was.roleBefore, left: true });
  return { orgId: ref.id };
});

/**
 * Fresh claims for an organization's teachers and admins, after it was suspended or resumed: writeClaims (billing.ts)
 * sets or clears their `frozen` claim from the organization's status, which the rules and the callables read to stop
 * staff work. Students carry no such claim, so they are not touched and keep learning.
 *
 * Each account keeps the role and organization its claims hold now (refreshClaims), never the profile's: after a
 * change that stopped half-way the two can differ, and a refresh must not hand back a role an admin took away.
 * Two equality queries rather than `role in [...]`, so no index beyond the ones refuseLastAdmin already relies on.
 */
async function refreshStaff(orgId: string): Promise<{ staff: number; failed: number }> {
  const lists = await Promise.all(["teacher", "orgAdmin"].map((role) => db.collection("users").where("orgId", "==", orgId).where("role", "==", role).select().get()));
  const ids = lists.flatMap((l) => l.docs.map((d) => d.id));
  let failed = 0;
  for (let i = 0; i < ids.length; i += AT_ONCE) {
    const done = await Promise.allSettled(ids.slice(i, i + AT_ONCE).map((id) => refreshClaims(id)));
    for (const [j, r] of done.entries()) if (r.status === "rejected") { failed++; logger.error("updateOrg: claims not refreshed", { orgId, uid: ids[i + j], error: String(r.reason) }); }
  }
  return { staff: ids.length, failed };
}

/**
 * An organization's details and its status. Suspending (active → suspended, with an optional reason) stops its staff:
 * teachers and admins get fresh claims (refreshStaff) and nobody new joins or is added (joinOrg, createMembers and
 * setUserRole already refuse an organization that isn't active). Its members keep learning, and its courses and web
 * address keep serving. Resuming (suspended → active) undoes it. A suspended organization is never rejected in one
 * step and a rejected or pending one is never suspended: `bad-status`. Sending "suspended" again changes nothing
 * and refreshes the claims again, which is how a refresh that failed for some accounts (`failed` in the answer) is retried.
 */
export const updateOrg = onCall({ timeoutSeconds: 300 }, async (req) => {
  const c = await requireSuper(req);
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const d = details(req.data, true);
  const status = req.data?.status, was = org.get("status") as string | undefined;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new HttpsError("invalid-argument", "status must be active, suspended or rejected.", { reason: "bad-status" });
    const live = (s: unknown) => s === "active" || s === "suspended";
    // Suspension is for a working organization and ends only by resuming; one being deleted stays that way (deleteOrg).
    if (was === "deleting" || ((status === "suspended" || was === "suspended") && !(live(status) && live(was)))) {
      throw new HttpsError("failed-precondition", "An organization is suspended from active and resumed to active, nothing else.", { reason: "bad-status" });
    }
  }
  const suspend = status === "suspended" && was !== "suspended", resume = status === "active" && was === "suspended";
  const reason = suspend || resume ? str(req.data?.reason, 500) : "";
  // Every member reads the organization's document, so it says only since when; who suspended it and why is the
  // platform's note (private/suspension, readable by platform admins alone) and the audit log's.
  const note = db.doc(`orgs/${orgId}/private/suspension`);
  const batch = db.batch();
  batch.update(ref, {
    ...d, ...(status ? { status } : {}),
    ...(suspend ? { suspended: { at: FieldValue.serverTimestamp() } } : resume ? { suspended: FieldValue.delete() } : {}),
  });
  if (suspend) batch.set(note, { at: FieldValue.serverTimestamp(), by: c.uid, reason });
  if (resume) batch.delete(note);
  await batch.commit();
  // The status is written first: writeClaims reads it to decide who is frozen.
  const claims = status === "suspended" || resume ? await refreshStaff(orgId) : null;
  await audit(suspend ? "suspendOrg" : resume ? "resumeOrg" : "updateOrg", c.uid, {
    orgId, ...d, ...(status ? { status } : {}), ...(suspend || resume ? { reason } : {}), ...(claims ?? {}),
  });
  return { ok: true, ...(claims ?? {}) };
});

/** How many members one page holds, and how long one call keeps paging before it hands back a cursor. */
const PAGE = 100, DELETE_BUDGET_MS = 240_000;
type MembersOption = "release" | "delete-managed";
type MemberDoc = { id: string; get(field: string): unknown; ref: { set(data: Record<string, unknown>, opts: { merge: boolean }): Promise<unknown> } };

/** An organization's invite codes stop working (again at the end: an admin may have made new ones meanwhile). */
async function dropInviteCodes(orgId: string) {
  const codes = await db.collection("inviteCodes").where("orgId", "==", orgId).get();
  await Promise.all(codes.docs.map((d) => d.ref.delete()));
}

/**
 * One member of an organization that is being deleted.
 * - An account the organization manages (orgMembersCore.isManaged: `managedBy`, or an older username login), when the
 *   platform admin chose "delete-managed": queued in accountDeletions/{uid} for account.ts to delete with all its data,
 *   and otherwise left as it is (its profile still names the organization, which is how its files are found).
 * - Everyone else becomes an independent learner and keeps their learning. Claims first, as in assign: the power
 *   goes before the profile says so. Their own subscription, if any, stays (writeClaims).
 */
async function letGo(m: MemberDoc, orgId: string, option: MembersOption, by: string): Promise<"released" | "queued" | "waiting"> {
  if (option === "delete-managed" && isManaged({ managedBy: m.get("managedBy"), email: m.get("email") }, orgId, USERNAME_DOMAIN)) {
    const queue = db.doc(`accountDeletions/${m.id}`);
    if ((await queue.get()).exists) return "waiting"; // a repeated call: already queued, and counted then
    await queue.set({ orgId, by, at: FieldValue.serverTimestamp() });
    return "queued";
  }
  try { await writeClaims(m.id, "learner", null); }
  catch (e) {
    // A profile whose sign-in account is gone has no claims to lose: it must not stop the deletion for good.
    const gone = await auth.getUser(m.id).then(() => false, (x: { code?: string } | null) => x?.code === "auth/user-not-found");
    if (!gone) throw e;
  }
  // Released: a login the organization had suspended works again, as for anyone who leaves it (liftOrgSuspension).
  // After the claims (a release that failed leaves the suspension whole) and before the profile (a lifting that failed
  // leaves a member the next call finds again).
  await liftOrgSuspension(m.id, m.get("suspended"), orgId);
  await m.ref.set({ role: "learner", orgId: null, teacherId: null, group: null, superSeat: false, claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return "released";
}

/**
 * Deletes an organization, in steps a large one can finish:
 * deleteOrg({ orgId, confirm, members?: "release" | "delete-managed", cursor? }) → { done, cursor, processed, units }.
 * The caller types its name to confirm, on every call. Call again with the returned `cursor` until `done`.
 *
 * 1. The first call marks it `deleting` (nobody joins or is added: every such path wants an active organization),
 *    deletes its invite codes and writes `deleteOrgStarted` to the audit log, so a deletion that never finishes is on record.
 * 2. Members, by document id from `cursor`, a page at a time for up to 240 seconds: released to independent learners
 *    (their learning stays with them), or, for accounts the organization manages when `members` is "delete-managed",
 *    queued for deletion (letGo). "release" is the default: nothing is deleted unless the platform admin chooses it.
 *    The first call's choice is stored (`deletingMembers`) and binds every later call (`delete-option` otherwise).
 * 3. With no members left: its courses and drafts, its files and exports, then the organization itself, and `deleteOrg`
 *    in the audit log with the totals. Files Storage would not delete are logged and marked `filesLeft` there.
 *
 * Safe to repeat from any cursor, or none: released people have left the query and an account is queued once. A
 * member that fails stops the call with `delete-retry` (and the cursor to resume from), never a silent finish.
 */
export const deleteOrg = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const c = await requireSuper(req);
  const started = Date.now();
  const orgId = str(req.data?.orgId, 128);
  const ref = db.doc(`orgs/${orgId}`);
  const org = await ref.get();
  if (!org.exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const name = org.get("name") as string;
  if (str(req.data?.confirm, 120) !== name) throw new HttpsError("failed-precondition", "Type the organization's name to confirm.", { reason: "confirm-name" });
  const asked = req.data?.members as unknown;
  if (asked !== undefined && asked !== null && asked !== "release" && asked !== "delete-managed") throw new HttpsError("invalid-argument", "members must be release or delete-managed.", { reason: "bad-members" });
  // The choice is made once, by the call that starts the deletion, and stored on the organization (deletingMembers):
  // every later call goes by it. A later call that asks for the other one is refused (`delete-option`, with the stored
  // choice), so a second screen or a retry with a stale choice never deletes accounts the platform admin agreed to
  // release, or releases half of the ones they agreed to delete. A call that names none follows the stored one.
  const stored = org.get("status") === "deleting" ? (org.get("deletingMembers") as unknown) : undefined;
  const kept = stored === "release" || stored === "delete-managed" ? (stored as MembersOption) : null;
  if (kept && asked && asked !== kept) throw new HttpsError("failed-precondition", "This deletion was started with the other choice for its members.", { reason: "delete-option", members: kept });
  const option: MembersOption = kept ?? ((asked as MembersOption | null | undefined) || "release");
  // A cursor is a member's id (the one a previous answer gave): anything else would fail inside the query, unreadably.
  // Checked before anything is written, so a call that is refused has not started the deletion.
  let cursor = str(req.data?.cursor, 128) || null;
  if (cursor && !isId(cursor)) throw new HttpsError("invalid-argument", "cursor must be the one the previous answer gave.", { reason: "bad-cursor" });

  if (org.get("status") !== "deleting") {
    await ref.update({ status: "deleting", deletingBy: c.uid, deletingAt: FieldValue.serverTimestamp(), deletingMembers: option });
    await dropInviteCodes(orgId);
    await audit("deleteOrgStarted", c.uid, { orgId, name, membersOption: option });
  } else if (!kept) {
    // Started before the choice was stored (or with none readable): this call's choice becomes the stored one.
    await ref.update({ deletingMembers: option });
  }

  let processed = 0, released = 0, queued = 0;
  /** The running totals live on the organization until it goes, so the last call can put them in the audit log. */
  const tally = async () => { if (released || queued) await ref.update({ deletingReleased: FieldValue.increment(released), deletingQueued: FieldValue.increment(queued) }); };
  for (;;) {
    let q = db.collection("users").where("orgId", "==", orgId).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.select("managedBy", "email", "suspended").get();
    let failed = 0;
    for (let i = 0; i < page.docs.length; i += AT_ONCE) {
      const done = await Promise.allSettled(page.docs.slice(i, i + AT_ONCE).map((m) => letGo(m, orgId, option, c.uid)));
      for (const [j, r] of done.entries()) {
        if (r.status === "rejected") { failed++; logger.error("deleteOrg: member not handled", { orgId, uid: page.docs[i + j].id, error: String(r.reason) }); }
        else if (r.value === "released") released++;
        else if (r.value === "queued") queued++;
      }
    }
    if (failed) {
      // The cursor stays before this page: the repeat tries its failures again (the rest of the page has left the query).
      await tally().catch(() => {});
      throw new HttpsError("aborted", "Some members could not be handled. Try again.", { reason: "delete-retry", failed, cursor });
    }
    processed += page.docs.length;
    if (page.docs.length) cursor = page.docs[page.docs.length - 1].id;
    if (page.docs.length < PAGE) break;
    if (Date.now() - started >= DELETE_BUDGET_MS) { await tally(); return { done: false, cursor, processed, units: 0 }; }
  }

  await dropInviteCodes(orgId);
  // School sign-in: its client secret, identities and test links go and its slug is kept as a tombstone (ssoOrgDeleted).
  // The accounts it made followed the members choice above, as the managed accounts they are.
  const sso = await ssoOrgDeleted(orgId);
  const units = await db.collection("units").where("owner", "==", orgId).select().get();
  for (const u of units.docs) { await db.doc(`unitDrafts/${u.id}`).delete(); await u.ref.delete(); }
  // Published courses, the logo and brand files, anything exportOrgData wrote (orgExport.ts), and its homepage (orgPage.ts).
  let filesLeft = false;
  for (const prefix of [`orgs/${orgId}/`, `exports/${orgId}/`, `content/pages/${orgId}/`]) {
    await bucket().deleteFiles({ prefix }).catch((e: unknown) => { filesLeft = true; logger.error("deleteOrg: files not deleted", { orgId, prefix, error: String(e) }); });
  }
  await db.recursiveDelete(ref);
  released += Number(org.get("deletingReleased")) || 0; queued += Number(org.get("deletingQueued")) || 0;
  await audit("deleteOrg", c.uid, { orgId, name, membersOption: option, members: released + queued, released, queued, units: units.size, ...(sso.identities ? { ssoIdentities: sso.identities } : {}), ...(filesLeft ? { filesLeft: true } : {}) });
  return { done: true, cursor: null, processed, units: units.size };
});

/**
 * An organization keeps an admin: its only admin is not demoted, moved out or removed until someone else is made its
 * admin (refused with `last-admin`; OrgManage says so before asking). Refusals carry a stable `reason` in their details,
 * which the admin screens put in the admin's language (admin/refusals.ts); the English message stays as a fallback.
 * An admin the organization (or a platform admin) suspended can't sign in, so they don't count as the admin who stays:
 * the same rule as orgMembers.keepAnAdmin (orgMembersCore.onlyWorkingAdmin). Every admin is read (with `suspended`),
 * since a working one may come after several suspended ones; organizations have few admins.
 */
export async function refuseLastAdmin(uid: string, orgId: string) {
  const admins = await db.collection("users").where("orgId", "==", orgId).where("role", "==", "orgAdmin").select("suspended").get();
  // Only about an admin the lists hold (as before: someone who isn't one is never refused here).
  if (admins.docs.some((d) => d.id === uid) && onlyWorkingAdmin(uid, admins.docs.map((d) => ({ id: d.id, suspended: d.get("suspended") })))) {
    throw new HttpsError("failed-precondition", "This is the organization's only admin. Make someone else its admin first.", { reason: "last-admin" });
  }
  // With school sign-in on, one of the admins who stay must be able to sign in without it (`sso-last-way-in`).
  if (admins.docs.some((d) => d.id === uid)) await ssoKeepWayIn(orgId, uid);
}

/**
 * Any account's role and organization: students, teachers and org admins need an active organization; learners and
 * platform admins have none. A platform admin can't change their own role (so nobody locks the platform out).
 * Making someone a platform admin needs a sign-in in the last ten minutes (accountCore.recentSignIn), so a platform
 * admin's phone left signed in, or a stolen token, can't make another one: `recent-login`.
 */
export const setUserRole = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), role = str(req.data?.role) as Role;
  if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role.", { reason: "bad-role" });
  if (uid === c.uid) throw new HttpsError("failed-precondition", "You cannot change your own role.", { reason: "self-role" });
  if (role === "superadmin" && !recentSignIn(req.auth?.token.auth_time)) throw new HttpsError("failed-precondition", "Sign in again to make someone a platform admin.", { reason: "recent-login" });
  let orgId: string | null = null;
  if (IN_ORG.includes(role)) {
    orgId = str(req.data?.orgId, 128);
    const org = orgId ? await db.doc(`orgs/${orgId}`).get() : null;
    if (!org?.exists) throw new HttpsError("not-found", "Choose an organization.", { reason: "no-org" });
    if (org.get("status") !== "active") throw new HttpsError("failed-precondition", "This organization is not active.", { reason: "org-inactive" });
  }
  const now = await db.doc(`users/${uid}`).get();
  const adminOf = now.get("role") === "orgAdmin" ? (now.get("orgId") as string | null | undefined) : null;
  if (adminOf && (role !== "orgAdmin" || orgId !== adminOf)) await refuseLastAdmin(uid, adminOf);
  const { before, roleBefore } = await assign(uid, role, orgId);
  const left = before && before !== orgId ? before : null;
  // An organization's admins read the entries that carry its id (orgAudit), so a person who leaves one gets an entry
  // in its log too (`left`). The organization they are in now is not told where they came from, nor the one they
  // left where they went; a change inside one organization, or one that ends in none, is one entry as before.
  await audit("setUserRole", c.uid, { uid, role, orgId, roleBefore, ...(left && orgId ? {} : { before }) });
  if (left) await audit("setUserRole", c.uid, { uid, orgId: left, roleBefore, left: true, ...(orgId ? {} : { role }) });
  return { ok: true };
});

/**
 * An account by its email or username login (H1): resolved through Auth, which knows the account's real email,
 * never through users/{uid}.email, which only says what its owner typed. Shows whether that email is verified, and
 * how many profiles claim it (more than one means someone typed another person's address before 2026-11; the screens
 * then refuse to pick one). Platform admins find anyone; an org admin only their own members.
 */
export const findAccount = onCall(async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin" && c.role !== "orgAdmin") throw new HttpsError("permission-denied", "Admins only.", { reason: "not-admin" });
  // An admin of a suspended organization, or of one being deleted, is answered nothing, as by every other callable.
  if (c.role === "orgAdmin" && c.orgId) await refuseClosedOrg(c, c.orgId);
  const raw = str(req.data?.login, 200).toLowerCase();
  const email = raw.includes("@") ? raw : isValidUsername(raw) ? usernameToEmail(raw) : "";
  if (!email || !isValidEmail(email)) return { account: null, profiles: 0 };
  const [user, claimed] = await Promise.all([
    auth.getUserByEmail(email).catch(() => null),
    db.collection("users").where("email", "==", email).select().limit(5).get(),
  ]);
  const profile = user ? await db.doc(`users/${user.uid}`).get() : null;
  if (!user && raw.includes("@")) {
    // An account made by a school's sign-in has no email at Auth; its address is the profile's ssoEmail (display only,
    // never counted as "claimed"). Platform admins find it anywhere, an org admin only in their own organization.
    let q = db.collection("users").where("ssoEmail", "==", email);
    if (c.role === "orgAdmin") q = q.where("orgId", "==", c.orgId ?? "");
    const found = (await q.limit(2).get()).docs;
    if (found.length === 1) {
      const p = found[0];
      return {
        account: {
          uid: p.id, email, emailVerified: false, name: String(p.get("name") ?? ""), username: null, role: (p.get("role") as string | undefined) ?? "learner",
          orgId: (p.get("orgId") as string | null | undefined) ?? null, teach: (p.get("teach") as string | undefined) ?? null, provider: "sso", sso: true,
        },
        profiles: claimed.size,
      };
    }
  }
  if (c.role === "orgAdmin" && (!profile || profile.get("orgId") !== c.orgId)) return { account: null, profiles: 0 };
  const ids = new Set(claimed.docs.map((d) => d.id));
  if (user) ids.add(user.uid);
  if (!user || !profile?.exists) return { account: null, profiles: ids.size - (user ? 1 : 0) };
  return {
    account: {
      uid: user.uid, email: user.email ?? email, emailVerified: user.emailVerified, name: String(profile.get("name") ?? user.displayName ?? ""),
      username: (profile.get("username") as string | null | undefined) ?? null, role: (profile.get("role") as string | undefined) ?? "learner",
      orgId: (profile.get("orgId") as string | null | undefined) ?? null, teach: (profile.get("teach") as string | undefined) ?? null,
      provider: user.providerData.map((p) => p.providerId).sort().join(",") || "password",
    },
    profiles: ids.size,
  };
});
