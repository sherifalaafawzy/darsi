// Deleting and exporting an account, end to end (account.ts): deleteAccount as the person, a platform admin and the
// admin of the organization that manages the account; the deletion queue's worker (onAccountDeletion); and
// exportAccountData. Firestore is the in-memory fake (with recursiveDelete added here), Auth and the bucket are maps,
// and the tutor agent's sessions a stand-in for agentSessions.ts.
//
// The rule the erasure is held to: afterwards the account's id appears nowhere, in no path and no document, except the
// audit log (who deleted which account); payments and checkouts stay with a hash in its place. And the parity rule:
// whatever the erasure deletes, the export hands over first, or it is on EXCLUDED below with the reason.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import { hashedUid } from "../src/accountCore";

type AuthRec = { uid: string; email?: string; displayName?: string; disabled?: boolean; customClaims?: Record<string, unknown> };
const store = vi.hoisted(() => ({
  files: new Set<string>(), sessions: new Map<string, string[]>(), log: [] as string[],
  sessionsFail: false, globFails: false, globHangs: false, folderFails: 0, usageWhenSessionsWent: null as boolean | null,
  exportsFail: false, sessionReads: 0,
}));

vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  class Db extends FakeDb {
    /** A document and everything under it, whether or not the document itself exists. */
    async recursiveDelete(ref: { path: string }) { for (const k of [...this.docs.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) this.docs.delete(k); }
  }
  const missing = () => Object.assign(new Error("There is no user record for this id."), { code: "auth/user-not-found" });
  class Auth {
    users = new Map<string, AuthRec>();
    async getUser(uid: string) {
      const u = this.users.get(uid); if (!u) throw missing();
      return { ...u, emailVerified: true, disabled: !!u.disabled, metadata: { creationTime: "2026-09-01T08:00:00Z", lastSignInTime: "2026-11-01T08:00:00Z" }, providerData: [{ providerId: "password" }] };
    }
    async updateUser(uid: string, p: Partial<AuthRec>) { const u = this.users.get(uid); if (!u) throw missing(); Object.assign(u, p); }
    async revokeRefreshTokens() { /* sessions end */ }
    async deleteUser(uid: string) { if (!this.users.delete(uid)) throw missing(); store.log.push("deleteUser"); }
  }
  const db = new Db(), auth = new Auth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, freshCaller,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { await db.collection("audit").add({ action, by, ...data }); },
    // As admin.ts does it: the pupils of this teacher in this organization lose their teacherId.
    releasePupils: async (orgId: string, teacher: string) => {
      const pupils = (await db.collection("users").where("orgId", "==", orgId).where("teacherId", "==", teacher).get()).docs;
      for (const p of pupils) await p.ref.update({ teacherId: null });
      return pupils.length;
    },
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/storage.js", () => {
  const file = (name: string) => ({ name, delete: async () => { store.files.delete(name); } });
  return { bucket: () => ({
    file,
    getFiles: async (q: { prefix: string; matchGlob?: string }) => {
      store.log.push(q.matchGlob ? "listing:whole-bucket" : `listing:${q.prefix}`);
      if (q.matchGlob && store.globFails) throw new Error("listing timed out");
      if (q.matchGlob && store.globHangs) return new Promise<never>(() => {}); // a bucket too large to list: never answers
      if (q.prefix.startsWith("exports/") && store.exportsFail) throw new Error("Storage is unavailable");
      if (!q.matchGlob && store.folderFails > 0) { store.folderFails--; throw new Error("Storage is unavailable"); }
      return [[...store.files].filter((n) => n.startsWith(q.prefix)).map(file), null]; // matchGlob ignored, as the emulator does
    },
  }) };
});
vi.mock("../src/notify.js", () => ({
  // As notify.ts does it: the account's device records and the tokens it owns.
  forgetAllDevices: async (uid: string) => {
    const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
    const devs = (await db.collection(`users/${uid}/devices`).get()).docs;
    for (const d of devs) await d.ref.delete();
    for (const t of (await db.collection("pushTokens").where("uid", "==", uid).get()).docs) await t.ref.delete();
    return devs.length;
  },
}));
vi.mock("../src/agentSessions.js", () => ({
  deleteSessions: async (uid: string) => {
    const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
    store.usageWhenSessionsWent = [...db.docs.keys()].some((k) => k.startsWith(`tutorUsage/${uid}/`));
    if (store.sessionsFail) return { sessions: 0, sessionsFailed: true };
    const n = store.sessions.get(uid)?.length ?? 0;
    store.sessions.delete(uid);
    return { sessions: n, sessionsFailed: false };
  },
  exportSessions: async (uid: string) => (store.sessionReads++, { complete: true, sessions: (store.sessions.get(uid) ?? []).map((id) => ({ id, updatedAt: 1762000000000, events: [{ at: null, author: "user", parts: [{ text: "What is training data?" }] }] })) }),
}));

type AuthFake = { users: Map<string, AuthRec> };
const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: AuthFake };
const account = await import("../src/account");
type Run = { run: (req: unknown) => Promise<Record<string, unknown>> };
const deleteAccount = account.deleteAccount as unknown as Run, exportAccountData = account.exportAccountData as unknown as Run;
const worker = (uid: string, time = new Date().toISOString()) => (account.onAccountDeletion as unknown as { run: (e: unknown) => Promise<void> }).run({ params: { uid }, time });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");

const U = "uid-TARGET-77"; // the account every test is about; no other id or value contains it
const ORG = "org1";
const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(path)}?alt=media&token=t`;
const mark = (path: string) => `mark<${path}>`;
/** A document that carries a mark the export must hand over before the erasure removes it. */
const put = (path: string, data: Record<string, unknown> = {}) => db.docs.set(path, { mark: mark(path), ...data });

/** One document (or file, or session) in every place Darsi keeps something under an account's id. */
function seed(profile: Record<string, unknown>, email: string) {
  auth.users.set(U, { uid: U, email, displayName: "Mona Abdallah", customClaims: { role: profile.role, orgId: profile.orgId } });
  put(`users/${U}`, { name: "Mona Abdallah", email, notify: { on: true, hourLocal: 18 }, ...profile });
  put(`users/${U}/progress/ai-1-1-1`, { unitId: "ai-1-1", accuracy: 0.9 });
  put(`users/${U}/submissions/ai-1-1-4`, { orgId: ORG, text: "My project", fileUrl: url(`submissions/${ORG}/${U}/ai-1-1/photo.jpg`) });
  put(`users/${U}/notes/ai-1-1-1`, { text: "remember this" });
  put(`users/${U}/certs/ai-1-1`, { code: "ABCD" });
  put(`users/${U}/devices/dev1`, { token: "fcm-token-secret", topics: ["all"], lang: "ar" });
  put(`users/${U}/private/summaryRows`, { "ai-1-1-1": { xp: 10 } });
  db.docs.set(`users/${U}/private/export`, { at: 1, staffAt: 1 }); // a download long ago
  put("pushTokens/dev1", { uid: U });
  for (const col of ["credits", "courseAccess", "joinAttempts", "capstoneLimits", "tutorLeases"]) put(`${col}/${U}`, { n: 1 });
  put(`subscriptions/${U}`, { plan: "super", status: "active", source: "grant", currentPeriodEnd: Date.now() + 864e5 });
  put(`tutorUsage/${U}/days/2026-11-01`, { usd: 0.01 });
  // A report sent signed in, and one sent from the same phone without a token (before 2026-11 its details still named the account).
  put("bugReports/b1", { text: "Continue does nothing", user: { uid: U, email }, details: { account: { uid: U } }, shot: { path: "bugReports/b1.jpg" } });
  put("bugReports/b2", { text: "Sent while signed out", user: null, details: { account: { uid: U, email } }, shot: { path: "bugReports/b2.png" } });
  db.docs.set("bugReports/b3", { text: "Someone else's", user: { uid: "someone-else" }, details: {}, shot: { path: "bugReports/b3.jpg" } });
  // A request that never became an organization, and an organization that runs.
  db.docs.set("orgs/req1", { name: mark("orgs/req1"), status: "pending", createdBy: U, memberCount: 0 });
  put("orgs/req1/private/request", { contact: "+20 100 000 0000", reason: "Our school wants in" });
  db.docs.set("orgs/act1", { name: "Delta School", status: "active", createdBy: U, memberCount: 9 });
  put("orgs/act1/private/request", { contact: "+20 100 000 0001", reason: "We teach 400 pupils" });
  db.docs.set("orgs/act1/private/invites", { teacher: "AAAA-BBBB-CCCC" });
  // An organization that ran and was closed is "rejected" too, but it is no mere request: it has members and codes.
  db.docs.set("orgs/closed1", { name: "Old Cairo School", status: "rejected", createdBy: U, memberCount: 12 });
  put("orgs/closed1/private/request", { contact: "+20 100 000 0002", reason: "We closed in June" });
  db.docs.set("orgs/closed1/private/invites", { teacher: "DDDD-EEEE-FFFF" });
  // Kept for the accounts, with a hash for the person.
  db.docs.set("payments/stripe_1", { uid: U, amount: 500, currency: "EGP" });
  db.docs.set("checkouts/c1", { uid: U, clientId: "ga-client-1", status: "paid" });
  db.docs.set("audit/a0", { action: "setUserRole", by: "root", uid: U, role: profile.role, ip: "203.0.113.9", rid: "r-staff" });
  // Their organization, a pupil of theirs, and somebody else's pupil.
  db.docs.set(`orgs/${ORG}`, { name: "Nile School", status: "active", memberCount: 5, createdBy: "adm1" });
  db.docs.set("users/pupil1", { role: "student", orgId: ORG, teacherId: U });
  db.docs.set("users/pupil2", { role: "student", orgId: ORG, teacherId: "t-other" });
  for (const f of [
    `submissions/${ORG}/${U}/ai-1-1/photo.jpg`, `submissions/none/${U}/old.jpg`, `submissions/org9/${U}/never-sent.jpg`,
    "bugReports/b1.jpg", "bugReports/b2.png", "bugReports/b3.jpg", `submissions/${ORG}/someone-else/theirs.jpg`,
  ]) store.files.add(f);
  store.sessions.set(U, ["sess1", "sess2"]);
}
const teacher = { role: "teacher", orgId: ORG }; // joined with a code, with their own email
const managed = { role: "teacher", orgId: ORG, managedBy: ORG, createdBy: "adm1" }; // a login the school made and looks after

/** Every place the account's id still shows, outside the audit log. */
const traces = () => [
  ...[...db.docs.entries()].filter(([k, v]) => !k.startsWith("audit/") && (k.includes(U) || JSON.stringify(v).includes(U))).map(([k]) => k),
  ...[...store.files].filter((f) => f.includes(U)),
  ...(store.sessions.has(U) ? ["tutor sessions"] : []),
];
const audits = (action: string) => [...db.docs.entries()].filter(([k, v]) => k.startsWith("audit/") && v.action === action).map(([, v]) => v);
const signedIn = (uid: string, data: Record<string, unknown> = {}, authTime = Date.now() / 1000) => ({ auth: { uid, token: { auth_time: authTime } }, data });

/** What the erasure removes without the export handing it over, and why that is right. */
const EXCLUDED: [RegExp, string][] = [
  [/^pushTokens\//, "which account a push token belongs to: the device record is exported, the token is a key to the phone, not data about the person"],
  [/^joinAttempts\//, "a count of invite-code tries in the last hour (a brake on guessing), gone by itself"],
  [/^capstoneLimits\//, "today's count of project checks (a rate limit), gone by itself"],
  [/^tutorLeases\//, "the tutor calls under way this minute (a lock), gone when they end"],
  [/^users\/[^/]+\/private\/export$/, "when the account's data was last downloaded (a rate limit on exportAccountData)"],
];

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); store.files.clear(); store.sessions.clear(); store.log.length = 0;
  Object.assign(store, { sessionsFail: false, globFails: false, globHangs: false, folderFails: 0, usageWhenSessionsWent: null, exportsFail: false, sessionReads: 0 });
  db.failOn = null;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("adm1", { uid: "adm1", customClaims: { role: "orgAdmin", orgId: ORG } });
  auth.users.set("adm2", { uid: "adm2", customClaims: { role: "orgAdmin", orgId: "org2" } });
});

describe("deleteAccount leaves nothing behind", () => {
  const cases: [string, Record<string, unknown>, string, () => unknown][] = [
    ["the person themself", teacher, "mona@gmail.com", () => signedIn(U)],
    ["a platform admin", teacher, "mona@gmail.com", () => signedIn("root", { uid: U })],
    ["the admin of the organization that manages the account", managed, "mna.abd.12345@users.darsiai.org", () => signedIn("adm1", { uid: U })],
  ];
  for (const [who, profile, email, req] of cases) {
    it(`as ${who}`, async () => {
      seed(profile, email);
      expect(await deleteAccount.run(req())).toEqual({ ok: true });

      expect(traces()).toEqual([]);
      expect(auth.users.has(U)).toBe(false);
      // Kept for the accounts, without the person.
      expect(db.docs.get("payments/stripe_1")).toMatchObject({ uid: hashedUid(U), amount: 500 });
      expect(db.docs.get("checkouts/c1")).toMatchObject({ uid: hashedUid(U), clientId: null });
      // The request that never became an organization is gone; the one that runs stays, without what its requester said privately.
      expect(db.docs.has("orgs/req1")).toBe(false);
      expect(db.docs.has("orgs/req1/private/request")).toBe(false);
      expect(db.docs.get("orgs/act1")).toMatchObject({ name: "Delta School", status: "active", createdBy: hashedUid(U) });
      expect(db.docs.has("orgs/act1/private/request")).toBe(false);
      expect(db.docs.has("orgs/act1/private/invites")).toBe(true);
      expect(db.docs.get("orgs/closed1")).toMatchObject({ name: "Old Cairo School", status: "rejected", memberCount: 12, createdBy: hashedUid(U) });
      expect(db.docs.has("orgs/closed1/private/request")).toBe(false);
      expect(db.docs.has("orgs/closed1/private/invites")).toBe(true);
      // Their organization has one member fewer, and only their own pupils lost their teacher.
      expect(db.docs.get(`orgs/${ORG}`)).toMatchObject({ memberCount: 4 });
      expect(db.docs.get("users/pupil1")).toMatchObject({ teacherId: null });
      expect(db.docs.get("users/pupil2")).toMatchObject({ teacherId: "t-other" });
      // Both problem reports and their screenshots went, the one sent without a token too; nobody else's did.
      expect(db.docs.has("bugReports/b1") || db.docs.has("bugReports/b2")).toBe(false);
      expect(db.docs.has("bugReports/b3")).toBe(true);
      expect([...store.files].sort()).toEqual(["bugReports/b3.jpg", `submissions/${ORG}/someone-else/theirs.jpg`]);
      // The tutor's conversations went while the usage records were still there to go next.
      expect(store.usageWhenSessionsWent).toBe(true);
      // The audit log says who deleted which account, and what went.
      expect(audits("deleteAccount")).toEqual([expect.objectContaining({
        uid: U, by: who === "the person themself" ? U : who === "a platform admin" ? "root" : "adm1", self: who === "the person themself", role: "teacher", orgId: ORG,
        devices: 1, files: 3, leftoversChecked: true, projects: 1, reports: 2, requests: 1, payments: 1, released: 1, sessions: 2, sessionsFailed: false,
      })]);
      expect(db.docs.get("audit/a0")).toMatchObject({ uid: U }); // the audit log is kept as it was
    });
  }

  it("looks through the whole bucket for stray files only at the very end, and never waits on it", async () => {
    seed(teacher, "mona@gmail.com");
    store.globFails = true;
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect(store.log.indexOf("listing:whole-bucket")).toBeGreaterThan(store.log.indexOf("deleteUser"));
    expect(store.log.at(-1)).toBe("listing:whole-bucket");
    // The stray upload in an organization they never sent work from is all that is left, and the audit log says so.
    expect(traces()).toEqual([`submissions/org9/${U}/never-sent.jpg`]);
    expect(auth.users.has(U)).toBe(false);
    expect(audits("deleteAccount")[0]).toMatchObject({ files: 2, leftoversChecked: false });
  });

  it("gives the whole-bucket look 60 seconds and then finishes without it", async () => {
    seed(teacher, "mona@gmail.com");
    store.globHangs = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let done: unknown = null;
      const run = deleteAccount.run(signedIn(U)).then((r) => { done = r; });
      await vi.advanceTimersByTimeAsync(59_000);
      // Everything but the stray file is gone, the sign-in too, while the listing is still being waited for.
      expect(done).toBeNull();
      expect(auth.users.has(U)).toBe(false);
      expect(traces()).toEqual([`submissions/org9/${U}/never-sent.jpg`]);
      await vi.advanceTimersByTimeAsync(2_000);
      await run;
      expect(done).toEqual({ ok: true });
      expect(audits("deleteAccount")[0]).toMatchObject({ files: 2, leftoversChecked: false });
    } finally { vi.useRealTimers(); }
  });

  it("reports tutor conversations it could not delete, deletes everything else, and queues those for the worker", async () => {
    seed(teacher, "mona@gmail.com");
    store.sessionsFail = true;
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    // The only thing left besides the conversations: the queue entry that brings the worker back for them.
    expect(traces()).toEqual([`accountDeletions/${U}`, "tutor sessions"]);
    expect(db.docs.get(`accountDeletions/${U}`)).toMatchObject({ wiped: true, by: U, orgId: ORG, via: "deleteAccount" });
    expect(auth.users.has(U)).toBe(false);
    expect(audits("deleteAccount")[0]).toMatchObject({ sessions: 0, sessionsFailed: true, sessionsQueued: true });
    // The worker's sessions-only path (as the trigger on that entry runs it): still down, then done, with no second
    // erasure and no second audit entry.
    await expect(worker(U)).rejects.toThrow("tutor sessions");
    store.sessionsFail = false; store.log.length = 0;
    await worker(U);
    expect(traces()).toEqual([]);
    expect(store.log).toEqual([]);
    expect(audits("deleteAccount")).toHaveLength(1);
  });

  it("marks an entry deleteOrg already queued, instead of failing on it, when only the conversations are left", async () => {
    seed(managed, "mna.abd.12345@users.darsiai.org");
    const at = Date.now() - 5 * 3600e3; // queued five hours ago: its worker is still trying
    db.docs.set(`accountDeletions/${U}`, { orgId: ORG, by: "root", at });
    store.sessionsFail = true;
    expect(await deleteAccount.run(signedIn("adm1", { uid: U }))).toEqual({ ok: true });
    expect(db.docs.get(`accountDeletions/${U}`)).toEqual({ orgId: ORG, by: "root", at, wiped: true });
  });

  it.each([
    ["held", { held: "renewing" }, 60_000],
    ["gave-up", { startedAt: 1, gaveUpAt: 2 }, 7 * 3600e3],
    ["expired", { startedAt: 1 }, 7 * 3600e3],
  ] as const)("replaces an entry no worker is behind any more (%s) with a new one, so a new six hours start", async (why, more, age) => {
    seed(managed, "mna.abd.12345@users.darsiai.org");
    db.docs.set(`accountDeletions/${U}`, { orgId: ORG, by: "root", at: Date.now() - age, ...more });
    db.writes = [];
    store.sessionsFail = true;
    expect(await deleteAccount.run(signedIn("adm1", { uid: U }))).toEqual({ ok: true });
    // Deleted, then created (never set over the old one): a create succeeds only where no document is, and it is what
    // the worker's trigger fires on. (The fake's log keeps what was written; a delete leaves no line in it.)
    expect(db.writes.filter((w) => w.path === `accountDeletions/${U}`).map((w) => w.op)).toEqual(["create"]);
    const now = db.docs.get(`accountDeletions/${U}`)!;
    expect(now).toMatchObject({ wiped: true, by: "adm1", orgId: ORG, via: "deleteAccount", replaced: why });
    expect(now).not.toHaveProperty("held");
    expect(now).not.toHaveProperty("gaveUpAt");
    expect(audits("deleteAccount")[0]).toMatchObject({ sessionsFailed: true, sessionsQueued: true });
    // The new entry's worker (a new event, queued now) takes the sessions-only path and finishes.
    await expect(worker(U)).rejects.toThrow("tutor sessions");
    store.sessionsFail = false;
    await worker(U);
    expect(traces()).toEqual([]);
  });

  it("queues nothing when the conversations went too", async () => {
    seed(teacher, "mona@gmail.com");
    await deleteAccount.run(signedIn(U));
    expect(db.docs.has(`accountDeletions/${U}`)).toBe(false);
    expect(audits("deleteAccount")[0]).not.toHaveProperty("sessionsQueued");
  });

  // exportOrgData writes every member's name, email, lessons, projects and certificates under exports/{orgId}/, and the
  // files stay until the next export: an erased person was still in them, for the organization's admins to download.
  it("removes the export files of the person's organization, which name every member, and nobody else's", async () => {
    seed(teacher, "mona@gmail.com");
    for (const f of [`exports/${ORG}/e1/part-0001.json.gz`, `exports/${ORG}/e1/part-0002.json.gz`, "exports/org2/e9/part-0001.json.gz"]) store.files.add(f);
    db.docs.set(`orgs/${ORG}/private/export`, { at: Date.now(), by: "adm1", exportId: "e1" });
    db.docs.set("orgs/org2/private/export", { at: Date.now(), by: "adm2", exportId: "e9" });
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect([...store.files].filter((f) => f.startsWith("exports/"))).toEqual(["exports/org2/e9/part-0001.json.gz"]);
    // The stamp goes with the files, so the admin can make a new export (without the person) at once.
    expect(db.docs.has(`orgs/${ORG}/private/export`)).toBe(false);
    expect(db.docs.has("orgs/org2/private/export")).toBe(true);
    expect(traces()).toEqual([]);
    expect(audits("deleteAccount")[0]).toMatchObject({ exportFiles: 2 });
    expect(audits("deleteAccount")[0]).not.toHaveProperty("exportsLeft");
  });

  // The organization segment of a project's file link is the sender's word (the rules check the link's account, not
  // its organization): it clears the person's own folder there and nothing else. It used to empty that organization's
  // export, for any account that put another organization's id in a link and deleted itself.
  it("never touches the export of an organization that is only named inside a project's file link", async () => {
    seed({ role: "learner", orgId: null }, "mona@gmail.com");
    put(`users/${U}/submissions/ai-1-1-4`, { orgId: null, text: "My project", fileUrl: `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Forg2%2F${U}%2Fa.jpg?alt=media` });
    db.docs.delete("users/pupil1"); // no organization, so nobody's teacher
    store.files.add(`submissions/org2/${U}/a.jpg`);
    store.files.add("exports/org2/e9/part-0001.json.gz");
    db.docs.set("orgs/org2/private/export", { at: 5, by: "adm2", exportId: "e9" });
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    // The person's own file in that folder went; the organization's export and its stamp are as they were.
    expect(store.files.has(`submissions/org2/${U}/a.jpg`)).toBe(false);
    expect(store.files.has("exports/org2/e9/part-0001.json.gz")).toBe(true);
    expect(db.docs.get("orgs/org2/private/export")).toEqual({ at: 5, by: "adm2", exportId: "e9" });
    expect(store.log.filter((l) => l.startsWith("listing:exports/"))).toEqual([]);
    expect(traces()).toEqual([]);
    expect(audits("deleteAccount")[0]).not.toHaveProperty("exportFiles");
    expect(audits("deleteAccount")[0]).not.toHaveProperty("exportsLeft");
  });

  // An export call under way has stamped the organization and written no file yet: the stamp is what it checks before
  // it keeps what it wrote (orgExport.ts), so it goes even when there is no file to go with it.
  it("removes the export's stamp before its files, and also when no file is there yet", async () => {
    seed(teacher, "mona@gmail.com");
    db.docs.set(`orgs/${ORG}/private/export`, { at: Date.now(), by: "adm1", exportId: "e1" });
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect(db.docs.has(`orgs/${ORG}/private/export`)).toBe(false);
    expect(audits("deleteAccount")[0]).not.toHaveProperty("exportFiles");
    // With files: the stamp is already gone when they are listed.
    db.docs.clear(); auth.users.clear(); store.files.clear(); store.sessions.clear(); store.log.length = 0;
    seed(teacher, "mona@gmail.com");
    store.files.add(`exports/${ORG}/e1/part-0001.json.gz`);
    db.docs.set(`orgs/${ORG}/private/export`, { at: Date.now(), by: "adm1", exportId: "e1" });
    let stampAtListing: boolean | null = null;
    const push = store.log.push.bind(store.log);
    store.log.push = (...l: string[]) => { if (l[0] === `listing:exports/${ORG}/`) stampAtListing = db.docs.has(`orgs/${ORG}/private/export`); return push(...l); };
    try { await deleteAccount.run(signedIn(U)); } finally { delete (store.log as { push?: unknown }).push; }
    expect(stampAtListing).toBe(false);
    expect(store.files.has(`exports/${ORG}/e1/part-0001.json.gz`)).toBe(false);
  });

  // removeMember and bulk remove keep {at, name} under the person's id for that organization's admins; once the
  // account is gone the row keeps nobody out, and it was the one place besides the audit log that still named them.
  it("takes the person off the removed lists of organizations that removed them; a list whose school sign-in tombstone stays is left", async () => {
    const lists = () => {
      db.docs.set("orgs/old1/private/removed", { uids: { [U]: { at: 1, name: "Mona Abdallah" }, other9: { at: 2, name: "Someone else" } } });
      db.docs.set("orgs/old2/private/removed", { uids: { [U]: { at: 3, name: "Mona Abdallah" } } });
      db.docs.set("orgs/old3/private/removed", { uids: { other9: { at: 4, name: "Someone else" } } });
      db.docs.set("audit/a1", { action: "removeMember", by: "admX", orgId: "old1", uid: U });
      db.docs.set("audit/a2", { action: "bulkMembers", by: "admY", op: "remove", orgId: "old2", uids: ["other8", U] });
      // Entries that removed nobody: a bulk suspension that named them, and a removal of someone else.
      db.docs.set("audit/a3", { action: "bulkMembers", by: "admZ", op: "suspend", orgId: "old3", uids: [U] });
      db.docs.set("audit/a4", { action: "removeMember", by: "admZ", orgId: "old3", uid: "other9" });
    };
    seed(teacher, "mona@gmail.com");
    lists();
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect(traces()).toEqual([]);
    expect(db.docs.get("orgs/old1/private/removed")).toEqual({ uids: { other9: { at: 2, name: "Someone else" } } });
    expect(db.docs.get("orgs/old2/private/removed")).toEqual({ uids: {} });
    expect(db.docs.get("orgs/old3/private/removed")).toEqual({ uids: { other9: { at: 4, name: "Someone else" } } });
    expect(audits("deleteAccount")[0]).toMatchObject({ unlisted: 2 });

    // Deleted by someone else, with a school sign-in the organization made: its tombstone stays (so the school's
    // sign-in doesn't make the person a new account), and so does the row, the admin's handle for "Let back in".
    db.docs.clear(); auth.users.clear(); store.files.clear(); store.sessions.clear();
    auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
    seed(teacher, "mona@gmail.com");
    lists();
    db.docs.set("ssoIdentities/i1", { uid: U, orgId: "old1", linked: "jit", state: "removed" });
    expect(await deleteAccount.run(signedIn("root", { uid: U }))).toEqual({ ok: true });
    expect(db.docs.get("orgs/old1/private/removed")).toHaveProperty(["uids", U]);
    expect(db.docs.get("ssoIdentities/i1")).toMatchObject({ uid: U, state: "removed", accountDeleted: true });
    expect(db.docs.get("orgs/old2/private/removed")).toEqual({ uids: {} });
    expect(audits("deleteAccount")[0]).toMatchObject({ unlisted: 1, ssoIdentities: 1 });
  });

  it("still erases the account when the removed lists can't be cleared", async () => {
    seed(teacher, "mona@gmail.com");
    db.docs.set("orgs/old1/private/removed", { uids: { [U]: { at: 1, name: "Mona Abdallah" } } });
    db.docs.set("audit/a1", { action: "removeMember", by: "admX", orgId: "old1", uid: U });
    db.failOn = (w) => w.path === "orgs/old1/private/removed";
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect(auth.users.has(U)).toBe(false);
    expect(traces()).toEqual(["orgs/old1/private/removed"]);
    expect(audits("deleteAccount")[0]).not.toHaveProperty("unlisted");
  });

  it("still erases the account when the export files can't be removed, and says so in the audit log", async () => {
    seed(teacher, "mona@gmail.com");
    store.files.add(`exports/${ORG}/e1/part-0001.json.gz`);
    db.docs.set(`orgs/${ORG}/private/export`, { at: Date.now(), by: "adm1", exportId: "e1" });
    store.exportsFail = true;
    expect(await deleteAccount.run(signedIn(U))).toEqual({ ok: true });
    expect(traces()).toEqual([]);
    expect(auth.users.has(U)).toBe(false);
    expect(store.files.has(`exports/${ORG}/e1/part-0001.json.gz`)).toBe(true);
    expect(audits("deleteAccount")[0]).toMatchObject({ exportsLeft: true });
    expect(audits("deleteAccount")[0]).not.toHaveProperty("exportFiles");
  });

  it("is refused while a Stripe subscription renews by itself, and after a stale sign-in", async () => {
    seed(teacher, "mona@gmail.com");
    const before = new Map(db.docs);
    expect(await refusal(deleteAccount.run(signedIn(U, {}, Date.now() / 1000 - 11 * 60)))).toBe("recent-login");
    db.docs.set(`subscriptions/${U}`, { plan: "super", status: "active", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: Date.now() + 864e5 });
    expect(await refusal(deleteAccount.run(signedIn(U)))).toBe("renewing");
    expect(await refusal(deleteAccount.run(signedIn("root", { uid: U })))).toBe("renewing");
    expect(db.docs.size).toBe(before.size);
    expect(auth.users.get(U)?.disabled).toBeFalsy();
    expect(store.files.size).toBe(7);
  });

  it("is not an organization's to do for an account it only invited, or one another organization manages", async () => {
    // A teacher whose real email the admin typed: createdBy says who invited them, nothing more.
    seed({ ...teacher, createdBy: "adm1" }, "mona@gmail.com");
    expect(await refusal(deleteAccount.run(signedIn("adm1", { uid: U })))).toBe("not-yours");
    expect(await refusal(exportAccountData.run(signedIn("adm1", { uid: U })))).toBe("not-yours");
    db.docs.set(`users/${U}`, { ...db.docs.get(`users/${U}`), managedBy: "org2" });
    expect(await refusal(deleteAccount.run(signedIn("adm1", { uid: U })))).toBe("not-yours");
    expect(await refusal(deleteAccount.run(signedIn("adm2", { uid: U })))).toBe("not-yours");
    expect(db.docs.has(`users/${U}`)).toBe(true);
    expect(auth.users.get(U)?.disabled).toBeFalsy();
  });
});

// The admin of a suspended organization keeps the role in their claims (frozen): the role and the organization alone
// let them erase its managed accounts, records and all, and export them one by one though exportOrgData refuses.
describe("an organization that is suspended or being deleted", () => {
  it.each([["suspended", "org-suspended"], ["deleting", "org-deleting"]])("%s: its own admin deletes and exports none of its accounts", async (status, reason) => {
    seed(managed, "mna.abd.12345@users.darsiai.org");
    db.docs.set(`orgs/${ORG}`, { ...db.docs.get(`orgs/${ORG}`), status });
    auth.users.set("adm1", { uid: "adm1", customClaims: { role: "orgAdmin", orgId: ORG, frozen: true } });
    const before = db.docs.size, files = store.files.size;
    expect(await refusal(deleteAccount.run(signedIn("adm1", { uid: U })))).toBe(reason);
    expect(await refusal(exportAccountData.run(signedIn("adm1", { uid: U })))).toBe(reason);
    // A claim that lags behind the status changes nothing: the status decides.
    auth.users.set("adm1", { uid: "adm1", customClaims: { role: "orgAdmin", orgId: ORG } });
    expect(await refusal(deleteAccount.run(signedIn("adm1", { uid: U })))).toBe(reason);
    expect(db.docs.size).toBe(before);
    expect(store.files.size).toBe(files);
    expect(auth.users.has(U)).toBe(true);
    expect(auth.users.get(U)?.disabled).toBeFalsy();
    expect(audits("deleteAccount")).toEqual([]);
    expect(audits("exportAccountData")).toEqual([]);
  });

  it("the person themself and a platform admin still export and delete", async () => {
    seed(teacher, "mona@gmail.com");
    db.docs.set(`orgs/${ORG}`, { ...db.docs.get(`orgs/${ORG}`), status: "suspended" });
    auth.users.get(U)!.customClaims = { role: "teacher", orgId: ORG, frozen: true };
    expect(await exportAccountData.run(signedIn(U))).toHaveProperty("profile");
    expect(await exportAccountData.run(signedIn("root", { uid: U }))).toHaveProperty("profile");
    expect(await deleteAccount.run(signedIn("root", { uid: U }))).toEqual({ ok: true });
    expect(auth.users.has(U)).toBe(false);
  });
});

describe("exportAccountData", () => {
  it("hands the person everything the erasure would remove (or the reason it does not)", async () => {
    seed(teacher, "mona@gmail.com");
    const before = new Map(db.docs);
    const out = await exportAccountData.run(signedIn(U));
    const json = JSON.stringify(out);
    await deleteAccount.run(signedIn(U));

    const removed = [...before.keys()].filter((k) => !db.docs.has(k));
    expect(removed.length).toBeGreaterThan(15);
    const missing = removed.filter((k) => !json.includes(mark(k)) && !EXCLUDED.some(([re]) => re.test(k)));
    expect(missing).toEqual([]);
    // Every exclusion is still needed, and has its reason.
    for (const [re, why] of EXCLUDED) { expect(removed.some((k) => re.test(k))).toBe(true); expect(why.length).toBeGreaterThan(20); }
    // What stays hashed is handed over too, and so are the tutor's conversations.
    expect(out.payments).toEqual([expect.objectContaining({ id: "stripe_1", amount: 500 })]);
    expect(out.checkouts).toEqual([expect.objectContaining({ id: "c1" })]);
    expect((out.tutorConversations as { sessions: { id: string }[] }).sessions.map((s) => s.id)).toEqual(["sess1", "sess2"]);
    expect(out.auditTrail).toEqual([expect.objectContaining({ action: "setUserRole", by: "root" })]);
  });

  // Any account may download its own data, and each download asks Agent Runtime (a quota the live tutor shares) and
  // writes an audit entry: in a loop it took the tutor down to its fallback and filled the audit log.
  it("is one download per account every ten minutes, the person's and staff's counted apart; a refused one reads and audits nothing", async () => {
    seed(teacher, "mona@gmail.com");
    const start = Date.now();
    expect(await exportAccountData.run(signedIn(U))).toHaveProperty("profile");
    const again = await exportAccountData.run(signedIn(U)).then(() => null, (e: { code?: string; details?: Record<string, unknown> }) => e);
    expect(again).toMatchObject({ code: "resource-exhausted", details: { reason: "data-wait" } });
    expect(again!.details!.retryAt).toBeGreaterThanOrEqual(start + 10 * 60_000);
    expect(again!.details!.retryAt).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
    expect(store.sessionReads).toBe(1);
    expect(audits("exportAccountData")).toHaveLength(1);
    // Staff handling a request aren't kept waiting by the person's own download, and then wait in their turn.
    expect(await exportAccountData.run(signedIn("root", { uid: U }))).toHaveProperty("profile");
    expect(await refusal(exportAccountData.run(signedIn("root", { uid: U })))).toBe("data-wait");
    expect(store.sessionReads).toBe(2);
    expect(audits("exportAccountData").filter((a) => a.by === "root")).toHaveLength(1);
    // Another account is not held up by this one's.
    auth.users.set("other", { uid: "other", customClaims: { role: "learner" } });
    db.docs.set("users/other", { role: "learner", name: "Samir" });
    expect(await exportAccountData.run(signedIn("other"))).toHaveProperty("profile");
    // Ten minutes on, the person downloads again.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(start + 10 * 60_000 + 5_000);
      expect(await exportAccountData.run(signedIn(U))).toHaveProperty("profile");
      expect(await refusal(exportAccountData.run(signedIn(U)))).toBe("data-wait");
    } finally { vi.useRealTimers(); }
  });

  it("gives the audit trail without the network address of whoever else acted on the account", async () => {
    seed(teacher, "mona@gmail.com");
    db.docs.set("audit/a1", { action: "exportAccountData", by: U, uid: U, self: true, ip: "198.51.100.7" }); // their own earlier download
    for (const req of [signedIn(U), signedIn("root", { uid: U })]) {
      const trail = (await exportAccountData.run(req)).auditTrail as Record<string, unknown>[];
      const staff = trail.find((e) => e.id === "a0")!, own = trail.find((e) => e.id === "a1")!;
      expect(staff).toMatchObject({ action: "setUserRole", by: "root", rid: "r-staff" });
      expect(staff).not.toHaveProperty("ip"); // the platform admin's address is theirs, not the account's
      expect(own).toMatchObject({ by: U, ip: "198.51.100.7" });
      expect(JSON.stringify(trail)).not.toContain("203.0.113.9");
    }
  });

  it("gives problem reports in full, the one sent without a token too, and devices without their tokens", async () => {
    seed(teacher, "mona@gmail.com");
    const out = await exportAccountData.run(signedIn("root", { uid: U }));
    expect((out.problemReports as { id: string }[]).map((r) => r.id).sort()).toEqual(["b1", "b2"]);
    expect(out.problemReports).toContainEqual(expect.objectContaining({ id: "b2", text: "Sent while signed out", shot: { path: "bugReports/b2.png" } }));
    expect(out.devices).toEqual([expect.objectContaining({ id: "dev1", lang: "ar" })]);
    expect(JSON.stringify(out)).not.toContain("fcm-token-secret");
    expect(out.organizationRequests).toContainEqual(expect.objectContaining({ orgId: "act1", name: "Delta School", contact: "+20 100 000 0001" }));
    expect(audits("exportAccountData")).toEqual([expect.objectContaining({ uid: U, by: "root", self: false, orgId: ORG })]);
  });

  it("gives an organization's admin the learning record only", async () => {
    seed(managed, "mna.abd.12345@users.darsiai.org");
    const out = await exportAccountData.run(signedIn("adm1", { uid: U }));
    expect(Object.keys(out).sort()).toEqual(["account", "certificates", "courseAccess", "exportedAt", "lessonSummaryRows", "lessons", "notifications", "profile", "projects", "uid"]);
    expect(out.lessons).toHaveLength(1);
    expect(out.projects).toHaveLength(1);
    const json = JSON.stringify(out);
    for (const secret of ["remember this", "stripe_1", "ga-client-1", "Continue does nothing", "fcm-token-secret", "sess1", "+20 100 000 0001", "setUserRole"]) expect(json).not.toContain(secret);
    expect(audits("exportAccountData")[0]).toMatchObject({ by: "adm1", orgId: ORG });
  });
});

describe("the deletion queue (onAccountDeletion)", () => {
  // After deleteOrg (platform.ts letGo): the organization is gone and its other members are learners without one; the
  // accounts it managed are queued and left as they were, their profiles still naming it.
  const afterDeleteOrg = (profile: Record<string, unknown> = { managedBy: ORG }, email = "mna.abd.12345@users.darsiai.org") => {
    seed({ role: "student", orgId: ORG, createdBy: "adm1", ...profile }, email);
    for (const k of [...db.docs.keys()]) if (k === `orgs/${ORG}` || k.startsWith(`orgs/${ORG}/`)) db.docs.delete(k);
    for (const p of ["pupil1", "pupil2"]) db.docs.set(`users/${p}`, { role: "learner", orgId: null, teacherId: null });
    db.docs.set(`accountDeletions/${U}`, { orgId: ORG, by: "root", at: Date.now() });
  };
  const untouched = () => db.docs.has(`users/${U}`) && auth.users.has(U) && !auth.users.get(U)!.disabled && store.sessions.has(U);

  it("deletes an account the organization managed, as deleteAccount would", async () => {
    afterDeleteOrg();
    // The project's folder is the deleted organization's: the profile no longer names it, the queue does.
    db.docs.set(`users/${U}/submissions/ai-1-1-4`, { text: "My project" });
    store.globFails = true;
    store.files.delete(`submissions/org9/${U}/never-sent.jpg`);
    await worker(U);
    expect(traces()).toEqual([]);
    expect(auth.users.has(U)).toBe(false);
    expect(db.docs.has(`accountDeletions/${U}`)).toBe(false);
    expect(audits("deleteAccount")).toEqual([expect.objectContaining({ uid: U, by: "root", via: "deleteOrg", role: "student", orgId: ORG, self: false, projects: 1, sessions: 2, sessionsFailed: false })]);
  });

  it("the audit entry says who queued the account: school sign-in's link, or deleteOrg when the entry doesn't say", async () => {
    // sso.ts finishLink: the empty account the school's sign-in made, replaced by the person's own; its organization lives on.
    seed({ role: "student", orgId: ORG, createdBy: "sso", managedBy: ORG, sso: true }, "mona@school.edu");
    db.docs.set(`accountDeletions/${U}`, { orgId: ORG, by: "own1", at: Date.now(), via: "sso-link" });
    await worker(U);
    expect(auth.users.has(U)).toBe(false);
    expect(audits("deleteAccount")).toEqual([expect.objectContaining({ uid: U, by: "own1", via: "sso-link", orgId: ORG, self: false })]);
  });

  it("deletes an older username account, which has no managedBy, whether or not its profile still names the organization", async () => {
    for (const profile of [{}, { role: "learner", orgId: null }]) {
      db.docs.clear(); auth.users.clear(); store.files.clear(); store.sessions.clear();
      afterDeleteOrg(profile);
      await worker(U);
      expect(traces()).toEqual([]);
      expect(auth.users.has(U)).toBe(false);
      expect(db.docs.has(`accountDeletions/${U}`)).toBe(false);
    }
  });

  it("skips a platform admin, an account that is the person's own, and one another organization has by now", async () => {
    for (const [profile, email, claims] of [
      [{ role: "superadmin", managedBy: ORG }, "mna.abd.12345@users.darsiai.org", {}],
      [{ managedBy: ORG }, "mna.abd.12345@users.darsiai.org", { role: "superadmin" }], // the claim alone says so
      [{}, "mona@gmail.com", {}], // only invited: createdBy gives the organization nothing
      [{ managedBy: "org2" }, "mona@gmail.com", {}],
      [{ orgId: "org2" }, "mna.abd.12345@users.darsiai.org", {}], // moved to another organization since
    ] as [Record<string, unknown>, string, Record<string, unknown>][]) {
      db.docs.clear(); auth.users.clear(); store.files.clear(); store.sessions.clear();
      afterDeleteOrg(profile, email);
      auth.users.get(U)!.customClaims = claims;
      await worker(U);
      expect(untouched()).toBe(true);
      expect(db.docs.has(`accountDeletions/${U}`)).toBe(false);
      expect(audits("deleteAccount")).toEqual([]);
    }
  });

  it("finishes on a second run after one that failed part-way", async () => {
    // A typed-email account the school manages: once its profile is gone, only the queue's own mark says it was decided.
    afterDeleteOrg({ managedBy: ORG }, "mona@gmail.com");
    store.folderFails = 1;
    await expect(worker(U)).rejects.toThrow("Storage is unavailable");
    expect(db.docs.has(`users/${U}`)).toBe(false); // the profile went first
    expect(auth.users.get(U)).toMatchObject({ disabled: true }); // the sign-in is off, and goes last
    expect(db.docs.get(`accountDeletions/${U}`)).toMatchObject({ orgId: ORG, startedAt: expect.anything() });
    await worker(U);
    expect(traces()).toEqual([]);
    expect(auth.users.has(U)).toBe(false);
    expect(db.docs.has(`accountDeletions/${U}`)).toBe(false);
    expect(audits("deleteAccount")).toHaveLength(1);
    await worker(U); // delivered once more: nothing left to do
    expect(audits("deleteAccount")).toHaveLength(1);
  });

  it("comes back for tutor conversations it could not delete, and only for those", async () => {
    afterDeleteOrg();
    store.sessionsFail = true;
    await expect(worker(U)).rejects.toThrow("tutor sessions");
    expect(traces()).toEqual([`accountDeletions/${U}`, "tutor sessions"]);
    expect(db.docs.get(`accountDeletions/${U}`)).toMatchObject({ wiped: true });
    expect(audits("deleteAccount")).toEqual([expect.objectContaining({ sessionsFailed: true })]);
    await expect(worker(U)).rejects.toThrow("tutor sessions"); // still down
    store.sessionsFail = false; store.log.length = 0;
    await worker(U);
    expect(traces()).toEqual([]);
    expect(store.log).toEqual([]); // no second pass over the bucket
    expect(audits("deleteAccount")).toHaveLength(1);
  });

  it("gives up six hours after the account was queued, and keeps the queue document as the record", async () => {
    afterDeleteOrg();
    await worker(U, new Date(Date.now() - 6.1 * 3600e3).toISOString());
    expect(untouched()).toBe(true);
    expect(db.docs.get(`accountDeletions/${U}`)).toMatchObject({ orgId: ORG, gaveUpAt: expect.anything() });
  });

  it("holds an account whose Stripe subscription renews by itself, for a platform admin", async () => {
    afterDeleteOrg();
    db.docs.set(`subscriptions/${U}`, { plan: "super", status: "active", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: Date.now() + 864e5 });
    await worker(U);
    await worker(U);
    expect(untouched()).toBe(true);
    expect(db.docs.get(`accountDeletions/${U}`)).toMatchObject({ held: "renewing" });
  });
});
