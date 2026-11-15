/**
 * Data rights and abuse (TECHNICAL.md "Accounts: data, deletion and suspension"):
 * - exportAccountData: everything Darsi keeps about an account, as JSON ("Download my data" in Me, and on the person
 *   page for staff handling a request). An organization's admin gets the learning record only.
 * - deleteAccount: the account and its data, for the person themself ("Delete my account" in Me), a platform admin
 *   handling a request, or an organization's admin for an account the organization manages. Payment records are kept
 *   for the accounts, with the person's id replaced by a hash; the audit log keeps who deleted which account.
 * - onAccountDeletion: the same deletion for the accounts an organization managed, queued by deleteOrg
 *   (accountDeletions/{uid}) when the organization itself is deleted.
 * - setAccountSuspended: a platform admin stops (or allows again) an account's sign-in, for abuse.
 * - moderateSubmission: a platform admin removes a project's text and files, for abuse.
 * Who may do what is accountActionProblem (roles.ts, pure and tested).
 */
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, releasePupils, requireSuper, str } from "./admin.js";
import { DELETION_GIVE_UP_MS, hashedUid, ownFileRe, queuedDeletionProblem, queueStopped, recentSignIn, submissionFiles } from "./accountCore.js";
import { deleteSessions, exportSessions } from "./agentSessions.js";
import { renewsByItself, type Subscription } from "./billingCore.js";
import { refuseClosedOrg } from "./closedOrg.js";
import { forgetAllDevices } from "./notify.js";
import { USERNAME_DOMAINS } from "./passwords.js";
import { accountActionProblem, managedAccount, type AccountAction } from "./roles.js";
import { bucket } from "./storage.js";
import { identitiesOf, ssoAccountWiped, ssoSetBlocked } from "./ssoStore.js";

/** Firestore values as plain JSON (timestamps as ISO dates). */
function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}

const MESSAGES = {
  "self-staff": "You are an admin: someone else must take your role over before your account can be deleted.",
  "self-org": "Your organization manages this account: ask its admin to delete it.",
  superadmin: "That person is a platform admin. Change their role on their page first.",
  "not-yours": "Only a platform admin, or the admin of the organization that manages the account, can do that.",
  missing: "No such account.",
} as const;

/** The account a request is about, and whether the caller may act on it (throws when not). */
async function target(req: CallableRequest, action: AccountAction) {
  const c = await freshCaller(req);
  const uid = str(req.data?.uid, 128) || c.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid).catch(() => null)]);
  if (!profile.exists && !account) throw new HttpsError("not-found", MESSAGES.missing, { reason: "missing" });
  const problem = accountActionProblem(action, { uid: c.uid, role: c.role, orgId: c.orgId ?? null }, {
    uid, exists: profile.exists, role: profile.get("role"), orgId: profile.get("orgId"), createdBy: profile.get("createdBy"),
    managedBy: profile.get("managedBy"), email: account?.email ?? (profile.get("email") as string | undefined) ?? null,
  }, USERNAME_DOMAINS);
  if (problem) throw new HttpsError(problem === "missing" ? "not-found" : problem === "not-yours" ? "permission-denied" : "failed-precondition", MESSAGES[problem], { reason: problem });
  // An organization's admin acting on one of its accounts: not while the organization is suspended or being deleted
  // (exportOrgData refuses the same way, and deleteOrg decides what happens to its managed accounts). Their own
  // account, and platform admins, are untouched.
  if (uid !== c.uid && c.role === "orgAdmin" && c.orgId) await refuseClosedOrg(c, c.orgId);
  // A session the school's sign-in opened (token claim `sso`) on a personal account the person connected: whoever
  // controls the school's provider could open it, so its data leave and its deletion need the person's own login.
  // Accounts the organization manages (it made them) are the organization's to handle anyway.
  if (uid === c.uid && req.auth?.token.sso && !managedAccount({ managedBy: profile.get("managedBy"), email: account?.email ?? null }, USERNAME_DOMAINS).managed) {
    throw new HttpsError("failed-precondition", "Sign in with your own Darsi login to do this.", { reason: "sso-own-login" });
  }
  return { c, uid, self: uid === c.uid, profile, account };
}

/**
 * The problem reports that are an account's: the ones it sent signed in (`user.uid`, from its verified token), and the
 * ones sent from its phone without a token (a report that waited offline past a sign-out; before 2026-11 their
 * `details.account` still named the account). Two equality queries, each report once.
 */
async function reportsOf(uid: string) {
  const [sent, named] = await Promise.all([
    db.collection("bugReports").where("user.uid", "==", uid).get(),
    db.collection("bugReports").where("details.account.uid", "==", uid).get(),
  ]);
  return [...new Map([...sent.docs, ...named.docs].map((d) => [d.id, d])).values()];
}

/** What the account sent with "Share feedback" signed in (`user.uid`, from its verified token). Guests' carries no one. */
const feedbackOf = async (uid: string) => (await db.collection("feedback").where("user.uid", "==", uid).get()).docs;

/** How long after one download of an account's data starts the next may start (the person's own, and staff's, apart). */
export const DATA_GAP_MS = 10 * 60_000;

/**
 * At most one download of an account's data per DATA_GAP_MS, as exportOrgData has for an organization (claimExport).
 * Every download asks Agent Runtime for the account's tutor conversations (a quota of about 30 queries a minute for
 * the whole project, taken from the live tutor's share: agentSessions.ts), reads some fifteen collections and writes an
 * audit entry, and any account may ask for its own, Darsi Super or not: one in a loop took the paying learners' tutor
 * down to its fallback and filled the audit log (its school's too).
 *
 * Checked and stamped in one transaction on users/{uid}/private/export (functions only; it goes with the account),
 * before anything is read. The person's own downloads (`at`) and staff's (`staffAt`) are counted apart, so neither
 * keeps the other waiting. Refused with `data-wait` and `retryAt` (ms).
 */
async function claimDataExport(uid: string, self: boolean, by: string) {
  const ref = db.doc(`users/${uid}/private/export`), field = self ? "at" : "staffAt";
  await db.runTransaction(async (tx) => {
    const last = Number((await tx.get(ref)).get(field)) || 0, now = Date.now();
    if (now - last < DATA_GAP_MS) throw new HttpsError("resource-exhausted", "A download of this account's data started a few minutes ago. Try again later.", { reason: "data-wait", retryAt: last + DATA_GAP_MS });
    tx.set(ref, { [field]: now, ...(self ? {} : { staffBy: by }) }, { merge: true });
  });
}

/**
 * Everything kept about an account, as JSON. The person and platform admins get all of it. An organization's admin
 * (for an account the organization manages) gets the learning record only: the profile, lessons, projects,
 * certificates and course access. Notes, payments, the subscription and credits, checkouts, devices, problem reports, feedback,
 * the tutor's conversations and use, and the audit trail are the person's own.
 * One download per account every ten minutes (claimDataExport).
 */
export const exportAccountData = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (req) => {
  const { c, uid, self, profile, account } = await target(req, "export");
  await claimDataExport(uid, self, c.uid);
  const all = self || c.role === "superadmin";
  const mine = <T>(read: () => Promise<T>): Promise<T | null> => (all ? read() : Promise.resolve(null));
  const [progress, submissions, certs, access, rows, notes, devices, credits, subscription, payments, checkouts, usage, reports, feedback, made, trail, tutor] = await Promise.all([
    db.collection(`users/${uid}/progress`).get(),
    db.collection(`users/${uid}/submissions`).get(),
    db.collection(`users/${uid}/certs`).get(),
    db.doc(`courseAccess/${uid}`).get(),
    db.doc(`users/${uid}/private/summaryRows`).get(),
    mine(() => db.collection(`users/${uid}/notes`).get()),
    mine(() => db.collection(`users/${uid}/devices`).get()),
    mine(() => db.doc(`credits/${uid}`).get()),
    mine(() => db.doc(`subscriptions/${uid}`).get()),
    mine(() => db.collection("payments").where("uid", "==", uid).get()),
    mine(() => db.collection("checkouts").where("uid", "==", uid).get()),
    mine(() => db.collection(`tutorUsage/${uid}/days`).get()),
    mine(() => reportsOf(uid)),
    mine(() => feedbackOf(uid)),
    // Organizations they asked for or made: what they told platform admins privately (contact, reason).
    mine(async () => {
      const orgs = await db.collection("orgs").where("createdBy", "==", uid).get();
      return Promise.all(orgs.docs.map(async (o) => ({ org: o, request: await db.doc(`orgs/${o.id}/private/request`).get() })));
    }),
    // What staff and the system did to the account (role changes, grants, exports of its data), and what it did to itself.
    mine(() => db.collection("audit").where("uid", "==", uid).limit(500).get()),
    // The conversations with the tutor live on Agent Runtime; 20 s for them, and the export says when they aren't all there.
    mine(() => exportSessions(uid, 20_000)),
  ]);
  const { notify, ...rest } = (profile.data() ?? {}) as Record<string, unknown>;
  await audit("exportAccountData", c.uid, { uid, self, orgId: (profile.get("orgId") as string | null | undefined) ?? null });
  return {
    exportedAt: new Date().toISOString(), uid,
    account: account ? {
      email: account.email ?? null, emailVerified: account.emailVerified, name: account.displayName ?? null, disabled: account.disabled,
      createdAt: account.metadata.creationTime ?? null, lastSignIn: account.metadata.lastSignInTime ?? null,
      providers: account.providerData.map((p) => p.providerId),
    } : null,
    profile: plain(rest),
    notifications: notify ? plain({ ...(notify as Record<string, unknown>) }) : null,
    lessons: progress.docs.map((d) => plain({ id: d.id, ...d.data() })),
    lessonSummaryRows: rows.exists ? plain(rows.data()) : null,
    projects: submissions.docs.map((d) => plain({ id: d.id, ...d.data() })),
    certificates: certs.docs.map((d) => plain({ unitId: d.id, ...d.data() })),
    courseAccess: access.exists ? plain(access.data()) : null,
    ...(all ? {
      notes: notes!.docs.map((d) => plain({ lessonId: d.id, ...d.data() })),
      // A device's push token is a key to the phone, not data about the person: left out.
      devices: devices!.docs.map((d) => { const { token: _token, ...dev } = d.data(); return plain({ id: d.id, ...dev }); }),
      tutorCredits: credits!.exists ? plain(credits!.data()) : null,
      subscription: subscription!.exists ? plain(subscription!.data()) : null,
      payments: payments!.docs.map((d) => plain({ id: d.id, ...d.data() })),
      checkouts: checkouts!.docs.map((d) => plain({ id: d.id, ...d.data() })),
      tutorUsage: usage!.docs.map((d) => plain({ id: d.id, ...d.data() })),
      tutorConversations: tutor,
      // In full: their words, the page, the details their phone sent, and where the screenshot is kept.
      problemReports: reports!.map((d) => plain({ id: d.id, ...d.data() })),
      // Their ratings and comments ("Share feedback"), as stored.
      feedback: feedback!.map((d) => plain({ id: d.id, ...d.data() })),
      // What they sent with the request (requestOrg), not the organization's own running record.
      organizationRequests: made!.map(({ org, request }) => plain({
        orgId: org.id, ...Object.fromEntries(["name", "type", "country", "city", "size", "status", "createdAt"].map((k) => [k, org.get(k) ?? null])),
        ...(request.exists ? request.data() : {}),
      })),
      // Who did it stays (`by`), but an entry someone else made carries that person's network address (admin.ts audit):
      // theirs, not the account's, so it is left out. The account's own entries keep theirs.
      auditTrail: trail!.docs.map((d) => { const { ip, ...entry } = d.data(); return plain({ id: d.id, ...entry, ...(entry.by === uid && ip !== undefined ? { ip } : {}) }); }),
    } : {}),
  };
});

/**
 * Deletes an account and its data. The profile goes first, so the summary trigger writes nothing back (progress.ts),
 * then everything under it, the person's project files in every organization's folder, the export files of their
 * organizations (which name every member), their other records, their conversations with the tutor, their problem reports and screenshots, and last the sign-in itself. The sign-in is
 * switched off at the start, so the account can't be used while this runs, and a run that fails part-way can simply
 * be repeated.
 */
export const deleteAccount = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const { c, uid, self, profile, account } = await target(req, "delete");
  if (self && !recentSignIn(req.auth?.token.auth_time)) {
    throw new HttpsError("failed-precondition", "Sign in again, then delete your account within 10 minutes.", { reason: "recent-login" });
  }
  // A Stripe subscription that renews by itself would keep charging a card nobody can manage any more.
  if (renewsByItself((await db.doc(`subscriptions/${uid}`).get()).data() as Subscription | undefined)) {
    throw new HttpsError("failed-precondition", "This account's Darsi Super subscription renews by itself: turn its renewal off first.", { reason: "renewing" });
  }
  const done = await wipeAccount(uid, profile, Boolean(account), [], !self);
  // Only the tutor's conversations are left (Agent Runtime down or out of quota): queued for the deletion worker's
  // sessions-only path, which tries again for 6 hours (onAccountDeletion, `wiped`). Before, they were only reported in
  // the audit entry and stayed until someone noticed.
  if (done.sessionsFailed) await queueSessions(uid, c.uid, (profile.get("orgId") as string | null | undefined) ?? null);
  await audit("deleteAccount", c.uid, { uid, self, role: profile.get("role") ?? null, orgId: profile.get("orgId") ?? null, ...done, ...(done.sessionsFailed ? { sessionsQueued: true } : {}) });
  return { ok: true };
});

/**
 * Puts an account whose erasure left only its tutor conversations on the deletion queue, as one onAccountDeletion
 * treats as done but for those (`wiped: true`: it deletes the sessions and nothing else, and takes the entry off when
 * they are gone). A new entry is created, so the worker's trigger fires; one already there (deleteOrg queued the
 * account, and its worker is still retrying) is marked `wiped` instead, which that worker's next try reads.
 *
 * An entry no worker is behind any more (queueStopped: held for a person, given up, or older than the worker's six
 * hours) would be marked for nobody: the worker runs on an entry's creation only. It is deleted and created again, in
 * two writes (one write that replaces a document is a change, not a creation), so the trigger fires and a fresh six
 * hours start; `replaced` keeps why the old one had stopped. Never fails the deletion: the account is already gone,
 * and the audit entry says what is left.
 */
async function queueSessions(uid: string, by: string, orgId: string | null) {
  const ref = db.doc(`accountDeletions/${uid}`);
  const exists = (e: unknown) => (e as { code?: unknown } | null)?.code === 6 || /ALREADY_EXISTS/.test(String(e));
  const entry = (more: Record<string, unknown> = {}) => ({ orgId, by, at: FieldValue.serverTimestamp(), via: "deleteAccount", wiped: true, startedAt: FieldValue.serverTimestamp(), ...more });
  try {
    try { await ref.create(entry()); return; } catch (e) { if (!exists(e)) throw e; }
    const cur = await ref.get();
    const stopped = cur.exists ? queueStopped(cur.data(), Date.now()) : null;
    if (cur.exists && !stopped) { await ref.set({ wiped: true }, { merge: true }); return; }
    if (cur.exists) await ref.delete();
    try { await ref.create(entry(stopped ? { replaced: stopped } : {})); }
    // Someone queued it again in between (a new entry, with its own worker): that one is marked.
    catch (e) { if (!exists(e)) throw e; await ref.set({ wiped: true }, { merge: true }); }
  } catch (e) {
    logger.error("deleteAccount: tutor conversations left and not queued", { uid, error: String(e) });
  }
}

/** A promise's value, or null when it takes longer than `ms` (it is left to finish or fail by itself). */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([p, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(0, ms)); })]).finally(() => clearTimeout(timer));
}

/**
 * Files left in an organization's folder the person no longer sent work from (an upload never sent): a listing of every
 * organization's project folder, narrowed by Storage where it can (matchGlob) and checked by name here (the emulator
 * ignores matchGlob). The listing grows with the whole bucket, so it runs a page at a time inside a budget, after
 * everything else: when it doesn't finish, the erasure is still complete but for such strays, and the log says so.
 */
async function leftoverFiles(uid: string, budgetMs = 60_000): Promise<{ files: number; finished: boolean }> {
  const own = ownFileRe(uid), until = Date.now() + budgetMs;
  let files = 0;
  try {
    let query: object | null = { prefix: "submissions/", matchGlob: `submissions/*/${uid}/**`, autoPaginate: false, maxResults: 1000 };
    while (query) {
      const page = (await within(bucket().getFiles(query as never), until - Date.now())) as unknown as [{ name: string; delete(o: { ignoreNotFound: boolean }): Promise<unknown> }[], object | null | undefined] | null;
      if (!page) { logger.warn("deleteAccount: the leftover-file listing did not finish in time", { uid, removed: files, budgetMs }); return { files, finished: false }; }
      const left = page[0].filter((f) => own.test(f.name));
      await Promise.all(left.map((f) => f.delete({ ignoreNotFound: true })));
      files += left.length;
      query = page[1] ?? null;
    }
    return { files, finished: true };
  } catch (e) {
    logger.warn("deleteAccount: leftover files not listed", { uid, removed: files, error: String(e) });
    return { files, finished: false };
  }
}

/**
 * The erasure itself, repeatable: every step finds what is still there and removes it. `extraOrgs`: organization
 * folders to clear of the person's project files besides the ones their profile and projects name (the organization a
 * queued deletion came from, which the profile may no longer name).
 */
async function wipeAccount(uid: string, profile: DocumentSnapshot, hasAccount: boolean, extraOrgs: string[] = [], byOthers = true) {
  const orgId = (profile.get("orgId") as string | null | undefined) ?? null;
  if (hasAccount) {
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
  }
  // Project files: the folders of every organization the person sent work from, and any link a project holds.
  const subs = await db.collection(`users/${uid}/submissions`).get();
  const files = new Set(subs.docs.flatMap((d) => submissionFiles(d.data(), uid)));
  // The organizations the server itself vouches for: the profile's, the deletion queue's, and each project's own
  // `orgId` (the rules set it from the sender's token at create, and the owner can never change a project).
  const memberOrgs = new Set([...(orgId ? [orgId] : []), ...extraOrgs.filter(Boolean), ...subs.docs.map((d) => d.get("orgId")).filter((o): o is string => typeof o === "string" && !!o)]);
  // The folders to clear of the person's own files: those, "none", and whatever folder a file link names. A folder
  // named only inside a link is the sender's word (the rules check the link's account, not its organization): it is
  // never trusted for anything but the person's own files under it.
  const orgs = new Set(["none", ...memberOrgs]);
  for (const f of files) orgs.add(f.split("/")[1]);

  const devices = await forgetAllDevices(uid);
  await db.doc(`users/${uid}`).delete();
  await db.recursiveDelete(db.doc(`users/${uid}`)); // progress, projects, notes, private rows: the profile is already gone

  let removedFiles = 0;
  for (const o of orgs) {
    const [list] = await bucket().getFiles({ prefix: `submissions/${o}/${uid}/` });
    await Promise.all(list.map((f) => f.delete({ ignoreNotFound: true })));
    removedFiles += list.length;
  }
  await Promise.all([...files].map((p) => bucket().file(p).delete({ ignoreNotFound: true })));

  // Their organizations' export files (exportOrgData: every member's name, email, lessons, projects and certificates
  // under exports/{orgId}/, kept until the next export): a file made before today still holds this person, and its
  // admins could download it for as long as it stays. The whole export goes, with its stamp, so an admin can make a
  // new one, without the person, at once. After the profile is gone, so a new export can't include them again.
  // The stamp goes first, and whether or not there is a file yet: it is an export's licence to write (orgExport.ts),
  // so a call that read this person before the profile went finds it gone when it saves, takes its file back and
  // stops; deleting it only after the files left such a call writing the person back.
  // Only the organizations the server vouches for (memberOrgs): never one that is only named inside a file link,
  // or any account could empty another organization's export with a crafted link.
  // A failure is logged and reported (`exportsLeft`), never stopping the erasure: a repeat no longer knows the
  // organization once the profile is gone.
  let exportFiles = 0, exportsLeft = false;
  for (const o of memberOrgs) {
    try {
      await db.doc(`orgs/${o}/private/export`).delete();
      const [parts] = await bucket().getFiles({ prefix: `exports/${o}/` });
      await Promise.all(parts.map((f) => f.delete({ ignoreNotFound: true })));
      exportFiles += parts.length;
    } catch (e) {
      exportsLeft = true;
      logger.error("deleteAccount: an organization's export files not removed", { uid, orgId: o, error: String(e) });
    }
  }

  // The person's other records.
  await Promise.all(["credits", "subscriptions", "courseAccess", "joinAttempts", "capstoneLimits", "tutorLeases"].map((col) => db.doc(`${col}/${uid}`).delete()));
  // Their conversations with the tutor, kept on Agent Runtime: a failure there is reported, and never stops the rest.
  const tutor = await deleteSessions(uid);
  await db.recursiveDelete(db.doc(`tutorUsage/${uid}`));
  // Problem reports that are theirs, with their screenshots.
  const reports = await reportsOf(uid);
  for (const r of reports) {
    const shot = r.get("shot.path");
    if (typeof shot === "string" && shot.startsWith("bugReports/")) await bucket().file(shot).delete({ ignoreNotFound: true });
    await r.ref.delete();
  }
  // Their feedback (ratings and comments sent signed in).
  const feedback = await feedbackOf(uid);
  for (const f of feedback) await f.ref.delete();
  // Organizations they asked for. A request that never became an organization goes whole. An organization that runs,
  // or ran (a closed one is "rejected" too, and still has members and courses), stays, without what its requester told
  // platform admins privately (their contact and reason), and with a hash where it named them, as the payment records do.
  const made = await db.collection("orgs").where("createdBy", "==", uid).get();
  let requests = 0;
  for (const o of made.docs) {
    const status = o.get("status");
    // Never approved: still waiting or refused, with no member and no invite codes (approval makes both).
    const onlyAsked = (status === "pending" || status === "rejected") && !(Number(o.get("memberCount")) > 0) && !(await db.doc(`orgs/${o.id}/private/invites`).get()).exists;
    if (onlyAsked) { await db.recursiveDelete(o.ref); requests++; continue; }
    await db.doc(`orgs/${o.id}/private/request`).delete();
    await o.ref.update({ createdBy: hashedUid(uid) });
  }
  // Payments and checkouts stay for the accounts, without the person: their id becomes a hash.
  const hashed = hashedUid(uid);
  const [pays, checkouts] = await Promise.all([db.collection("payments").where("uid", "==", uid).get(), db.collection("checkouts").where("uid", "==", uid).get()]);
  await Promise.all([...pays.docs.map((d) => d.ref.update({ uid: hashed })), ...checkouts.docs.map((d) => d.ref.update({ uid: hashed, clientId: null }))]);

  // Their school sign-in: gone, or (deleted by someone else) kept as a `removed` tombstone, so the school's sign-in
  // doesn't make the person a new account behind the deletion (ssoStore.ssoAccountWiped). Before the sign-in goes.
  const ssoIdentities = await ssoAccountWiped(uid, byOthers);
  const unlisted = await unlistRemoved(uid);
  // Their organization: one member fewer, and their pupils get a new teacher.
  const released = orgId ? await releasePupils(orgId, uid) : 0;
  if (orgId) await db.doc(`orgs/${orgId}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});

  if (hasAccount) await auth.deleteUser(uid).catch((e: { code?: string }) => { if (e?.code !== "auth/user-not-found") throw e; });
  // Only now the slow, bucket-wide look for stray files: the account and its data are already gone.
  const strays = await leftoverFiles(uid);
  return {
    devices, files: removedFiles + strays.files, leftoversChecked: strays.finished, projects: subs.size, reports: reports.length, feedback: feedback.length, requests, ...(ssoIdentities ? { ssoIdentities } : {}),
    payments: pays.size, released, sessions: tutor.sessions, sessionsFailed: tutor.sessionsFailed,
    ...(exportFiles ? { exportFiles } : {}), ...(exportsLeft ? { exportsLeft: true } : {}), ...(unlisted ? { unlisted } : {}),
  };
}

/**
 * Takes an erased account off the removed lists of the organizations that removed it (orgs/{orgId}/private/removed
 * {uids: {uid: {at, name}}}: index.ts removeMember, orgMembers.ts bulk remove): the row keeps the person's name for
 * that organization's admins, and once the account is gone it keeps nobody out (joinOrg and the school's sign-in match
 * by the account's id). Called after ssoAccountWiped: an organization whose school sign-in tombstone stays (someone
 * else deleted the account) keeps its row, the admin's only handle for "Let back in" (sso.ts allowBack), and both go
 * together there.
 *
 * No index leads from an account to the lists that name it (its id is a map key), so the organizations come from the
 * audit log, by its two single-field indexes: the entries a removal wrote. A removal whose audit entry retention
 * already deleted is therefore not found, and that row stays until an admin clears it. Best effort: a failure is
 * logged and never stops the erasure. Returns how many lists the account was taken off.
 */
async function unlistRemoved(uid: string): Promise<number> {
  try {
    const keptIn = new Set((await identitiesOf(uid)).map((d) => d.get("orgId")));
    const [one, many] = await Promise.all([
      db.collection("audit").where("uid", "==", uid).select("action", "orgId").get(),
      db.collection("audit").where("uids", "array-contains", uid).select("action", "op", "orgId").get(),
    ]);
    const orgs = new Set<string>();
    for (const d of one.docs) if (d.get("action") === "removeMember") orgs.add(d.get("orgId"));
    for (const d of many.docs) if (d.get("action") === "bulkMembers" && d.get("op") === "remove") orgs.add(d.get("orgId"));
    let n = 0;
    for (const o of orgs) {
      if (typeof o !== "string" || !o || keptIn.has(o)) continue;
      const ref = db.doc(`orgs/${o}/private/removed`);
      const was = await db.runTransaction(async (tx) => {
        const uids = { ...((await tx.get(ref)).get("uids") as Record<string, unknown> | undefined) };
        if (!Object.hasOwn(uids, uid)) return false;
        delete uids[uid];
        tx.set(ref, { uids });
        return true;
      });
      if (was) n++;
    }
    return n;
  } catch (e) {
    logger.error("deleteAccount: removed lists not cleared", { uid, error: String(e) });
    return 0;
  }
}

/**
 * The deletion queue's worker. deleteOrg writes accountDeletions/{uid} = {orgId, by, at} for each account the deleted
 * organization managed (username logins and the like: nobody else could look after them); each is deleted here as
 * deleteAccount would, and audited. School sign-in queues the empty account a link replaced the same way, with
 * `via: "sso-link"` (sso.ts finishLink), which the audit entry repeats; an entry without one is deleteOrg's. Failures
 * are retried (the event is redelivered) for 6 hours, then given up with an error in the log and the queue document
 * left as the record of it.
 *
 * The first try decides whether the account is still the organization's to delete (queuedDeletionProblem): a platform
 * admin, an account that is no longer managed, or one that is another organization's by now is skipped, logged, and
 * taken off the queue. Once the deletion has started (`startedAt`), a retry finishes it without asking again: the
 * profile that said so is the first thing to go. When only the tutor's conversations are left (Agent Runtime was down
 * or out of quota), the document is marked `wiped` and later tries delete just those.
 */
export const onAccountDeletion = onDocumentCreated({ document: "accountDeletions/{uid}", retry: true, timeoutSeconds: 540, memory: "512MiB", maxInstances: 5 }, async (event) => {
  const uid = event.params.uid;
  const ref = db.doc(`accountDeletions/${uid}`);
  const job = await ref.get(); // as it is now: the event's own copy is as old as the first try
  if (!job.exists) return; // finished by an earlier try
  const orgId = str(job.get("orgId"), 128), by = str(job.get("by"), 128);
  if (Date.now() - Date.parse(event.time) > DELETION_GIVE_UP_MS) {
    logger.error("onAccountDeletion: gave up on an account after 6 hours; its queue document is kept", { uid, orgId, started: Boolean(job.get("startedAt")), wiped: job.get("wiped") === true });
    await ref.set({ gaveUpAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    return;
  }
  if (job.get("held")) return; // waiting for a person (see below)
  if (job.get("wiped") === true) {
    const tutor = await deleteSessions(uid);
    if (tutor.sessionsFailed) throw new Error(`accountDeletions/${uid}: tutor sessions are left; trying again`);
    await ref.delete();
    return;
  }
  // Only "no such account" means there is no sign-in: any other Auth failure is retried, never read as "nothing to delete".
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid).catch((e: { code?: string }) => { if (e?.code === "auth/user-not-found") return null; throw e; })]);
  if (!job.get("startedAt")) {
    const problem = queuedDeletionProblem(orgId, {
      exists: profile.exists, hasAccount: Boolean(account), role: profile.get("role"), claimRole: account?.customClaims?.role, orgId: profile.get("orgId"),
      managedBy: profile.get("managedBy"), email: account?.email ?? (profile.get("email") as string | undefined) ?? null,
    }, USERNAME_DOMAINS);
    if (problem) {
      logger.warn("onAccountDeletion: skipped, the account is not the organization's to delete", { uid, orgId, reason: problem });
      await ref.delete();
      return;
    }
    // As deleteAccount refuses: a Stripe subscription that renews by itself would keep charging a card nobody can
    // manage. Nothing a retry can fix, so it waits, marked, for a platform admin (who turns the renewal off and
    // deletes the account from its page).
    if (renewsByItself((await db.doc(`subscriptions/${uid}`).get()).data() as Subscription | undefined)) {
      logger.error("onAccountDeletion: held, the account's Darsi Super subscription renews by itself", { uid, orgId });
      await ref.set({ held: "renewing" }, { merge: true });
      return;
    }
    await ref.set({ startedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  const done = await wipeAccount(uid, profile, Boolean(account), orgId ? [orgId] : []);
  await audit("deleteAccount", by || "deleteOrg", { uid, self: false, via: str(job.get("via"), 40) || "deleteOrg", role: profile.get("role") ?? null, orgId, ...done });
  if (done.sessionsFailed) {
    await ref.set({ wiped: true }, { merge: true });
    throw new Error(`accountDeletions/${uid}: everything is deleted but the tutor sessions; trying again`);
  }
  await ref.delete();
});

/** A platform admin stops an account's sign-in (abuse), or allows it again. Its sessions end at once. */
export const setAccountSuspended = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), suspended = req.data?.suspended === true;
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  if (uid === c.uid) throw new HttpsError("failed-precondition", "You can't suspend your own account.");
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), auth.getUser(uid).catch(() => null)]);
  if (!account) throw new HttpsError("not-found", MESSAGES.missing);
  if (profile.get("role") === "superadmin") throw new HttpsError("failed-precondition", MESSAGES.superadmin, { reason: "superadmin" });
  const reason = str(req.data?.reason, 500);
  await auth.updateUser(uid, { disabled: suspended });
  if (suspended) await auth.revokeRefreshTokens(uid);
  // Every school sign-in of the account stops (or opens again) with it.
  await ssoSetBlocked(uid, suspended);
  if (profile.exists) await profile.ref.update({ suspended: suspended ? { at: FieldValue.serverTimestamp(), by: c.uid, reason } : FieldValue.delete() });
  await audit("setAccountSuspended", c.uid, { uid, suspended, reason });
  return { suspended };
});

/**
 * A platform admin removes a project's content (abuse): its text, explanations, links and files go, and it is marked
 * `moderated`. Its review status and feedback stay, so nobody is told it was reviewed.
 */
export const moderateSubmission = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), id = str(req.data?.id, 128);
  if (!uid || !id) throw new HttpsError("invalid-argument", "uid and id are required.");
  const ref = db.doc(`users/${uid}/submissions/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No such project.");
  const files = submissionFiles(snap.data(), uid);
  await Promise.all(files.map((p) => bucket().file(p).delete({ ignoreNotFound: true })));
  await ref.update({
    text: "", fileUrl: null, fileName: null, files: [], explain: FieldValue.delete(), aiUse: FieldValue.delete(),
    repo: FieldValue.delete(), links: FieldValue.delete(),
    moderated: { by: c.uid, at: FieldValue.serverTimestamp(), reason: str(req.data?.reason, 500) },
  });
  await audit("moderateSubmission", c.uid, { uid, id, files: files.length });
  return { ok: true, files: files.length };
});
