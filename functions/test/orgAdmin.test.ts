// The organization callables in index.ts, run against an in-memory Firestore and Auth (fakeFirestore.ts): who may call
// them (another organization's admin, a demoted admin's old token, a suspended organization), joining with a code (the
// try limit, the profile and Auth over a stale token, expiry and limits, the join policy, removed people), bulk
// accounts (Darsi's own passwords, six at a time, teachers before their pupils), and role changes that can be repeated
// when Auth fails between the two writes (removeMember, reviewOrg's repair).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";

const h = vi.hoisted(() => ({
  audits: [] as Record<string, unknown>[], alerts: [] as unknown[][], progress: [] as unknown[][], released: [] as unknown[][],
  /** The fake Auth, for the writeClaims stand-in (importing the mocked admin.js from inside another mock, twice at once, gave the real one). */
  auth: null as null | { setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> },
}));

vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  h.auth = auth;
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  // As admin.ts: the token's word for learners and students, Auth's own claims for anyone whose token claims a staff role.
  const caller = (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    return { uid: req.auth.uid, role: (req.auth.token.role as string | undefined) ?? "learner", orgId: req.auth.token.orgId as string | undefined };
  };
  const freshCaller = async (req: Req) => {
    const c = caller(req);
    if (!["teacher", "orgAdmin", "superadmin"].includes(c.role)) return c;
    const claims = (await auth.getUser(c.uid).catch(() => null))?.customClaims ?? {};
    return { uid: c.uid, role: (claims.role as string | undefined) ?? "learner", orgId: (claims.orgId as string | null | undefined) ?? undefined };
  };
  return {
    db, auth, caller, freshCaller,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { h.audits.push({ action, by, ...data }); },
    basicsFor: async (uid: string, profile: { exists: boolean; data(): Record<string, unknown> | undefined }) => {
      if (profile.exists && profile.data()?.email) return {};
      const a = await auth.getUser(uid).catch(() => null);
      return a?.email ? { email: a.email, ...(a.displayName ? { name: a.displayName } : {}) } : {};
    },
    releasePupils: async (...a: unknown[]) => { h.released.push(a); return 0; },
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
// writeClaims as far as these tests need it: the claims Auth holds (FakeAuth.failClaims makes a write fail).
vi.mock("../src/billing.js", () => ({
  writeClaims: async (uid: string, role: string, orgId: string | null) => { await h.auth!.setCustomUserClaims(uid, { role, orgId }); },
}));
vi.mock("../src/notify.js", () => ({
  alertOrgRequest: async (...a: unknown[]) => { h.alerts.push(["request", ...a]); },
  alertOrgReviewed: async (...a: unknown[]) => { h.alerts.push(["reviewed", ...a]); },
}));
vi.mock("../src/progress.js", () => ({ progressChanged: async (...a: unknown[]) => { h.progress.push(a); return "updated"; } }));
vi.mock("../src/storage.js", () => ({ bucket: () => ({ deleteFiles: async () => {} }) }));
// Everything else index.ts only passes on: none of it runs here, and other callables' modules stay out of this test.
vi.mock("../src/content.js", () => ({}));
vi.mock("../src/settings.js", () => ({}));
vi.mock("../src/languages.js", () => ({}));
vi.mock("../src/analytics.js", () => ({}));
vi.mock("../src/orgCourses.js", () => ({}));
vi.mock("../src/sites.js", () => ({}));
vi.mock("../src/account.js", () => ({}));
vi.mock("../src/payments.js", () => ({}));
vi.mock("../src/tutor.js", () => ({}));
vi.mock("../src/agent.js", () => ({}));
vi.mock("../src/capstone.js", () => ({}));
vi.mock("../src/bugs.js", () => ({}));
vi.mock("../src/orgMembers.js", () => ({}));
vi.mock("../src/access.js", () => ({}));
vi.mock("../src/audit.js", () => ({}));
vi.mock("../src/orgExport.js", () => ({}));
vi.mock("../src/retention.js", () => ({}));
vi.mock("../src/legal.js", () => ({}));
vi.mock("../src/csp.js", () => ({}));

const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const index = (await import("../src/index")) as unknown as Record<string, { run: (req: unknown) => Promise<unknown>; __endpoint?: { eventTrigger?: { retry?: boolean } } }>;

const TEACHER_CODE = "TTTT-TTTT-TTTT", STUDENT_CODE = "SSSS-SSSS-SSSS";
type Token = Record<string, unknown>;
/** The ID token an account would hold now: its claims, email and whether that is verified. */
const tokenOf = (uid: string): Token => {
  const u = auth.users.get(uid);
  return { ...(u?.customClaims ?? {}), ...(u?.email ? { email: u.email, email_verified: u.emailVerified === true } : {}) };
};
const call = <T = Record<string, unknown>>(fn: string, uid: string, data: Record<string, unknown>, token: Token = tokenOf(uid)) =>
  index[fn].run({ auth: { uid, token }, data }) as Promise<T>;
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string }; message?: string }) => e.details?.reason ?? `no reason: ${e.message}`);
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;
const claimsOf = (uid: string) => auth.users.get(uid)?.customClaims;
const member = (uid: string, role: string, orgId: string, more: Record<string, unknown> = {}) => {
  auth.users.set(uid, { uid, customClaims: { role, orgId }, email: `${uid}@school.org`, emailVerified: true, providerData: [{ providerId: "password" }] });
  db.docs.set(`users/${uid}`, { name: `Name ${uid}`, email: `${uid}@school.org`, role, orgId, ...more });
};

beforeEach(() => {
  db.docs.clear(); db.writes = []; db.failOn = null; db.serial = false; auth.users.clear(); auth.claimWrites = []; auth.failClaims = 0; auth.maxCreating = 0;
  h.audits.length = 0; h.alerts.length = 0; h.progress.length = 0; h.released.length = 0;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" }, email: "root@darsi.org", emailVerified: true });
  db.docs.set("users/root", { name: "Root", email: "root@darsi.org", role: "superadmin", orgId: null });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 4, createdBy: "a1" });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 2, createdBy: "a2" });
  db.docs.set("orgs/o1/private/invites", { teacher: TEACHER_CODE, student: STUDENT_CODE });
  db.docs.set(`inviteCodes/${TEACHER_CODE}`, { orgId: "o1", role: "teacher" });
  db.docs.set(`inviteCodes/${STUDENT_CODE}`, { orgId: "o1", role: "student" });
  member("a1", "orgAdmin", "o1"); member("b1", "orgAdmin", "o1"); member("t1", "teacher", "o1"); member("s1", "student", "o1");
  member("a2", "orgAdmin", "o2"); member("s2", "student", "o2");
  // Someone new, signed in with their own verified email and no organization.
  auth.users.set("n1", { uid: "n1", email: "nour@gmail.com", emailVerified: true, displayName: "Nour Ali" });
});

describe("who may manage an organization's people", () => {
  it("another organization's admin is refused everywhere", async () => {
    const tries: [string, Record<string, unknown>][] = [
      ["setMemberRole", { uid: "s1", role: "teacher" }], ["resetMemberPassword", { uid: "s1" }], ["removeMember", { uid: "s1" }],
      ["createMembers", { members: [{ name: "Mona" }] }], ["regenerateInviteCode", { role: "student" }],
      ["setJoinPolicy", { requireVerifiedEmail: true }], ["readmitMember", { uid: "s1" }],
    ];
    for (const [fn, data] of tries) expect(await refusal(call(fn, "a2", { orgId: "o1", ...data })), fn).toBe("not-org-admin");
    expect(db.writes).toEqual([]);
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1" });
  });

  it("an admin can't reach into another organization by naming its people", async () => {
    for (const fn of ["setMemberRole", "resetMemberPassword", "removeMember"]) {
      expect(await refusal(call(fn, "a1", { orgId: "o1", uid: "s2", role: "teacher" })), fn).toBe("not-member");
    }
    expect(doc("users/s2")).toMatchObject({ role: "student", orgId: "o2" });
    expect(claimsOf("s2")).toEqual({ role: "student", orgId: "o2" });
    expect(doc("orgs/o1")!.memberCount).toBe(4);
  });

  it("a demoted admin's old token no longer works", async () => {
    const old = tokenOf("a1"); // still says orgAdmin of o1, for up to an hour
    auth.users.get("a1")!.customClaims = { role: "student", orgId: "o1" };
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }, old))).toBe("not-org-admin");
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "a1", role: "orgAdmin" }, old))).toBe("not-org-admin");
    expect(await refusal(call("createMembers", "a1", { orgId: "o1", members: [{ name: "Mona" }] }, old))).toBe("not-org-admin");
  });

  it("a suspended organization's admins manage nothing; platform admins still do", async () => {
    doc("orgs/o1")!.status = "suspended";
    for (const fn of ["setMemberRole", "removeMember", "regenerateInviteCode", "setJoinPolicy", "createMembers"]) {
      expect(await refusal(call(fn, "a1", { orgId: "o1", uid: "s1", role: "teacher", members: [{ name: "Mona" }] })), fn).toBe("org-suspended");
    }
    expect(await refusal(call("setMemberRole", "root", { orgId: "o1", uid: "s1", role: "teacher" }))).toBeNull();
    doc("orgs/o1")!.status = "deleting";
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toBe("org-deleting");
  });

  it("nobody changes their own role or removes themselves, and the only admin stays", async () => {
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "a1", role: "teacher" }))).toBe("self-role");
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "a1" }))).toBe("self-remove");
    expect(await refusal(call("removeMember", "root", { orgId: "o2", uid: "a2" }))).toBe("last-admin");
  });

  it("resetMemberPassword still leaves people's own logins alone, and resets the organization's", async () => {
    expect(await refusal(call("resetMemberPassword", "a1", { orgId: "o1", uid: "s1" }))).toBe("own-login"); // a real email
    auth.users.get("s1")!.email = "s1@users.darsiai.org";
    const out = await call<{ password: string }>("resetMemberPassword", "a1", { orgId: "o1", uid: "s1" });
    expect(out.password).toHaveLength(10);
    expect(auth.users.get("s1")!.password).toBe(out.password);
    expect(doc("users/s1")!.mustChangePassword).toBe(true);
  });
});

describe("a role change is two writes (profile and claims)", () => {
  it("taking power away writes the claims first: a failed claims write changes nothing, and the change can be repeated", async () => {
    auth.failClaims = 1;
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toMatch(/^no reason/);
    // Nothing half-done: still a teacher of o1 on both sides, still counted.
    expect(doc("users/t1")).toMatchObject({ role: "teacher", orgId: "o1" });
    expect(claimsOf("t1")).toEqual({ role: "teacher", orgId: "o1" });
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toBeNull();
    expect(doc("users/t1")).toMatchObject({ role: "learner", orgId: null, teacherId: null, group: null });
    expect(claimsOf("t1")).toEqual({ role: "learner", orgId: null });
    expect(doc("orgs/o1")!.memberCount).toBe(3);
  });

  it("a removal whose profile write fails after the claims ended access can be repeated too", async () => {
    db.failOn = (w) => w.path === "users/t1";
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toMatch(/^no reason/);
    expect(claimsOf("t1")).toEqual({ role: "learner", orgId: null }); // access ended at once
    expect(doc("users/t1")).toMatchObject({ role: "teacher", orgId: "o1" }); // so the admin still sees them, and repeats
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toBeNull();
    expect(doc("users/t1")).toMatchObject({ role: "learner", orgId: null });
    expect(doc("orgs/o1")!.memberCount).toBe(3);
  });

  it("a removal left half-done the old way (profile out, claims still in) can be finished", async () => {
    db.docs.set("users/t1", { ...doc("users/t1"), role: "learner", orgId: null });
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toBeNull();
    expect(claimsOf("t1")).toEqual({ role: "learner", orgId: null });
    expect(doc("orgs/o1")!.memberCount).toBe(3);
    // Finished: there is nothing left to repeat.
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toBe("not-member");
    expect(doc("orgs/o1")!.memberCount).toBe(3);
  });

  it("old claims never let an admin take another organization's member", async () => {
    // Moved to o2 by a platform admin; the claims write failed, so Auth still says o1.
    db.docs.set("users/t1", { ...doc("users/t1"), role: "teacher", orgId: "o2" });
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "t1" }))).toBe("not-member");
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "t1", role: "student" }))).toBe("not-member");
    expect(doc("users/t1")).toMatchObject({ role: "teacher", orgId: "o2" });
  });

  it("a demotion writes the claims first, a promotion the profile first", async () => {
    auth.failClaims = 1;
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "b1", role: "teacher" }))).toMatch(/^no reason/);
    expect(doc("users/b1")!.role).toBe("orgAdmin"); // the profile never ran ahead of a demotion
    auth.failClaims = 1;
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "s1", role: "teacher" }))).toMatch(/^no reason/);
    expect(doc("users/s1")!.role).toBe("teacher"); // as before: lists first, power second
    expect(claimsOf("s1")).toEqual({ role: "student", orgId: "o1" });
    expect(await refusal(call("setMemberRole", "a1", { orgId: "o1", uid: "s1", role: "teacher" }))).toBeNull();
    expect(claimsOf("s1")).toEqual({ role: "teacher", orgId: "o1" });
    expect(h.audits.at(-1)).toMatchObject({ action: "setMemberRole", by: "a1", uid: "s1", role: "teacher" });
  });

  it("removing someone puts them on the organization's removed list and leaves its codes alone", async () => {
    await call("removeMember", "a1", { orgId: "o1", uid: "s1" });
    const removed = doc("orgs/o1/private/removed")!;
    expect(Object.keys(removed.uids)).toEqual(["s1"]);
    expect(removed.uids.s1).toMatchObject({ name: "Name s1" });
    expect(removed.uids.s1.at).toBeGreaterThan(Date.now() - 5000);
    expect(doc("orgs/o1/private/invites")).toMatchObject({ teacher: TEACHER_CODE, student: STUDENT_CODE });
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toBeDefined();
    expect(h.released).toEqual([["o1", "s1"]]);
    expect(h.audits.at(-1)).toMatchObject({ action: "removeMember", orgId: "o1", uid: "s1" });
  });

  it("puts them on the removed list before their role changes, so a removal cut short there is already on it", async () => {
    // The claims write fails: they are still a member (the admin repeats the removal), and already listed as removed,
    // so a repeat that then succeeds can't leave the list without them.
    auth.failClaims = 1;
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toMatch(/^no reason/);
    expect(Object.keys(doc("orgs/o1/private/removed")!.uids)).toEqual(["s1"]);
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1" });
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toBeNull();
    expect(Object.keys(doc("orgs/o1/private/removed")!.uids)).toEqual(["s1"]);
    expect(doc("orgs/o1")!.memberCount).toBe(3); // counted once
  });

  it("gives a login the organization suspended its sign-in back; a platform admin's suspension stays", async () => {
    db.docs.set("users/s1", { ...doc("users/s1"), suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    auth.users.get("s1")!.disabled = true;
    db.docs.set("users/t1", { ...doc("users/t1"), suspended: { at: 1, by: "root", reason: "abuse" } });
    auth.users.get("t1")!.disabled = true;
    await call("removeMember", "a1", { orgId: "o1", uid: "s1" });
    await call("removeMember", "a1", { orgId: "o1", uid: "t1" });
    expect(auth.users.get("s1")!.disabled).toBe(false);
    expect(doc("users/s1")).not.toHaveProperty("suspended");
    expect(doc("users/s1")).toMatchObject({ role: "learner", orgId: null });
    expect(auth.users.get("t1")!.disabled).toBe(true);
    expect(doc("users/t1")).toMatchObject({ role: "learner", orgId: null, suspended: { by: "root" } });
  });

  it("fails closed: a removal that fails never leaves a suspended member with a working sign-in", async () => {
    const suspended = { at: 1, by: "a1", reason: "", byOrg: "o1" };
    db.docs.set("users/s1", { ...doc("users/s1"), suspended });
    auth.users.get("s1")!.disabled = true;
    // The claims can't be written: nothing of the suspension was touched, and they are still a (suspended) member.
    auth.failClaims = 1;
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toMatch(/^no reason/);
    expect(auth.users.get("s1")!.disabled).toBe(true);
    expect(claimsOf("s1")).toEqual({ role: "student", orgId: "o1" });
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    // The claims are gone but Auth can't lift the suspension: still locked, and still a member on the lists to repeat for.
    const enable = vi.spyOn(auth, "updateUser").mockRejectedValueOnce(Object.assign(new Error("auth down"), { code: "auth/internal-error" }));
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toMatch(/^no reason/);
    expect(auth.users.get("s1")!.disabled).toBe(true);
    expect(claimsOf("s1")).toEqual({ role: "learner", orgId: null });
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    expect(h.audits.some((a) => a.action === "removeMember")).toBe(false);
    enable.mockRestore();
    // The repeat finishes it: out of the organization, the sign-in back, counted once.
    expect(await refusal(call("removeMember", "a1", { orgId: "o1", uid: "s1" }))).toBeNull();
    expect(auth.users.get("s1")!.disabled).toBe(false);
    expect(doc("users/s1")).toMatchObject({ role: "learner", orgId: null });
    expect(doc("users/s1")).not.toHaveProperty("suspended");
    expect(doc("orgs/o1")!.memberCount).toBe(3);
    expect(Object.keys(doc("orgs/o1/private/removed")!.uids)).toEqual(["s1"]);
    expect(h.audits.filter((a) => a.action === "removeMember")).toHaveLength(1);
  });

  it("lifts the suspension only once the claims are gone, and before the profile stops naming the organization", async () => {
    db.docs.set("users/s1", { ...doc("users/s1"), suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    auth.users.get("s1")!.disabled = true;
    const seen: unknown[] = [];
    const real = auth.updateUser.bind(auth);
    const enable = vi.spyOn(auth, "updateUser").mockImplementation(async (uid, p) => { seen.push({ claims: claimsOf(uid), orgId: doc(`users/${uid}`)?.orgId }); return real(uid, p); });
    await call("removeMember", "a1", { orgId: "o1", uid: "s1" });
    enable.mockRestore();
    expect(seen).toEqual([{ claims: { role: "learner", orgId: null }, orgId: "o1" }]);
  });
});

describe("a new invite code (regenerateInviteCode)", () => {
  it("only for an active organization, whoever asks, and nothing changes otherwise", async () => {
    for (const [status, reason] of [["suspended", "org-suspended"], ["deleting", "org-deleting"], ["pending", "org-inactive"], ["rejected", "org-inactive"]]) {
      doc("orgs/o1")!.status = status;
      expect(await refusal(call("regenerateInviteCode", "root", { orgId: "o1", role: "student" })), status).toBe(reason);
    }
    expect(await refusal(call("regenerateInviteCode", "root", { orgId: "nope", role: "student" }))).toBe("no-org");
    expect(doc("orgs/o1/private/invites")).toMatchObject({ teacher: TEACHER_CODE, student: STUDENT_CODE });
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toBeDefined();
    expect(h.audits).toEqual([]);
    doc("orgs/o1")!.status = "active";
    const { code } = await call<{ code: string }>("regenerateInviteCode", "a1", { orgId: "o1", role: "student" });
    expect(doc("orgs/o1/private/invites")!.student).toBe(code);
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toBeUndefined();
  });
});

describe("joining with an invite code", () => {
  it("lets a new person in: profile, claims, the count, the code's uses, and the tries cleared", async () => {
    expect(await call("joinOrg", "n1", { code: " ssss ssss-ssss " })).toEqual({ orgId: "o1", role: "student", orgName: "Nile School" });
    expect(doc("users/n1")).toMatchObject({ role: "student", orgId: "o1", email: "nour@gmail.com", name: "Nour Ali" });
    expect(claimsOf("n1")).toEqual({ role: "student", orgId: "o1" });
    expect(doc("orgs/o1")!.memberCount).toBe(5);
    expect(doc(`inviteCodes/${STUDENT_CODE}`)!.uses).toBe(1);
    expect(doc("orgs/o1/private/invites")).toMatchObject({ teacher: TEACHER_CODE, student: STUDENT_CODE, uses: { student: 1 } });
    expect(doc("joinAttempts/n1")).toBeUndefined();
    expect(h.audits.at(-1)).toMatchObject({ action: "joinOrg", by: "n1", orgId: "o1", role: "student" });
  });

  it("counts every wrong code and stops at ten an hour, even for the right code", async () => {
    for (let i = 0; i < 10; i++) expect(await refusal(call("joinOrg", "n1", { code: "AAAA-AAAA-AAA" + (i % 8 + 2) }))).toBe("bad-code");
    expect(doc("joinAttempts/n1")!.n).toBe(10);
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("too-many-tries");
    expect(doc("users/n1")).toBeUndefined();
    // An hour later the count starts again.
    doc("joinAttempts/n1")!.since = Date.now() - 3601e3;
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBeNull();
  });

  it("refuses an organization that isn't active", async () => {
    for (const status of ["pending", "rejected", "suspended", "deleting"]) {
      doc("orgs/o1")!.status = status;
      expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE })), status).toBe("org-inactive");
    }
    expect(doc("users/n1")).toBeUndefined();
  });

  it("goes by the profile and Auth, not the token: someone already in an organization stays there", async () => {
    // s2's token from before they joined o2 (or a second tab): it names no organization.
    expect(await refusal(call("joinOrg", "s2", { code: STUDENT_CODE }, {}))).toBe("in-org");
    expect(doc("users/s2")).toMatchObject({ role: "student", orgId: "o2" });
    // The profile write lagged, the claims already say o2.
    db.docs.delete("users/s2");
    expect(await refusal(call("joinOrg", "s2", { code: STUDENT_CODE }, {}))).toBe("in-org");
    // A platform admin's stale token would have made them a student.
    expect(await refusal(call("joinOrg", "root", { code: STUDENT_CODE }, {}))).toBe("in-org");
    expect(claimsOf("root")).toEqual({ role: "superadmin" });
    expect(await refusal(call("joinOrg", "s1", { code: STUDENT_CODE }))).toBe("in-org"); // the token's own word, as before
    expect(doc("orgs/o1")!.memberCount).toBe(4);
  });

  it("refuses a disabled account", async () => {
    auth.users.get("n1")!.disabled = true;
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("disabled");
  });

  it("lets nobody in on the token alone when Auth can't say who they are (down, or the account was deleted)", async () => {
    const token = tokenOf("n1");
    const getUser = auth.getUser.bind(auth);
    auth.getUser = async () => { throw new Error("auth/internal-error"); };
    try { expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }, token))).toBe("try-again"); } finally { auth.getUser = getUser; }
    auth.users.delete("n1"); // deleted, its token still good for up to an hour
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }, token))).toBe("try-again");
    expect(doc("users/n1")).toBeUndefined();
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    expect(doc(`inviteCodes/${STUDENT_CODE}`)!.uses).toBeUndefined();
  });

  it("refuses an expired code and one used as often as it allows; other codes still work", async () => {
    doc(`inviteCodes/${STUDENT_CODE}`)!.expiresAt = Date.now() - 1000;
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("code-expired");
    doc(`inviteCodes/${STUDENT_CODE}`)!.expiresAt = Date.now() + 3600e3;
    Object.assign(doc(`inviteCodes/${STUDENT_CODE}`)!, { maxUses: 2, uses: 2 });
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("code-used-up");
    expect(doc("users/n1")).toBeUndefined();
    Object.assign(doc(`inviteCodes/${STUDENT_CODE}`)!, { maxUses: 3 });
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBeNull();
    expect(doc(`inviteCodes/${STUDENT_CODE}`)!.uses).toBe(3);
  });

  it("a code with one use left lets in only one of two people joining at the same moment", async () => {
    auth.users.set("n2", { uid: "n2", email: "omar@gmail.com", emailVerified: true });
    Object.assign(doc(`inviteCodes/${STUDENT_CODE}`)!, { maxUses: 1 });
    db.serial = true; // transactions as Firestore runs them: one at a time on the same document
    const out = await Promise.all([refusal(call("joinOrg", "n1", { code: STUDENT_CODE })), refusal(call("joinOrg", "n2", { code: STUDENT_CODE }))]);
    expect(out.sort()).toEqual(["code-used-up", null].sort());
    expect(doc(`inviteCodes/${STUDENT_CODE}`)!.uses).toBe(1);
    expect(doc("orgs/o1")!.memberCount).toBe(5);
  });

  it("holds people to the organization's policy: a verified email, an email on its domains", async () => {
    doc("orgs/o1/private/invites")!.policy = { requireVerifiedEmail: true };
    auth.users.get("n1")!.emailVerified = false;
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("email-unverified");
    doc("orgs/o1/private/invites")!.policy = { requireVerifiedEmail: true, allowedDomains: ["school.org"] };
    auth.users.get("n1")!.emailVerified = true;
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBe("email-domain");
    expect(doc("users/n1")).toBeUndefined();
    auth.users.get("n1")!.email = "Nour@School.org".toLowerCase();
    expect(await refusal(call("joinOrg", "n1", { code: STUDENT_CODE }))).toBeNull();
    expect(doc("users/n1")).toMatchObject({ role: "student", orgId: "o1" });
  });

  it("keeps a removed person out until an admin lets them back", async () => {
    await call("removeMember", "a1", { orgId: "o1", uid: "s1" });
    expect(await refusal(call("joinOrg", "s1", { code: STUDENT_CODE }))).toBe("removed");
    expect(doc("users/s1")).toMatchObject({ role: "learner", orgId: null });
    expect(await refusal(call("readmitMember", "a2", { orgId: "o1", uid: "s1" }))).toBe("not-org-admin");
    expect(await call("readmitMember", "a1", { orgId: "o1", uid: "s1" })).toEqual({ ok: true });
    expect(doc("orgs/o1/private/removed")!.uids).toEqual({});
    expect(h.audits.at(-1)).toMatchObject({ action: "readmitMember", by: "a1", orgId: "o1", uid: "s1" });
    expect(await refusal(call("joinOrg", "s1", { code: STUDENT_CODE }))).toBeNull();
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1" });
    expect(doc("orgs/o1")!.memberCount).toBe(4); // out and back in
    // Readmitting someone who isn't on the list changes and records nothing.
    const audits = h.audits.length;
    expect(await call("readmitMember", "a1", { orgId: "o1", uid: "nobody" })).toEqual({ ok: true });
    expect(h.audits.length).toBe(audits);
  });
});

describe("the join policy and the codes' limits (setJoinPolicy)", () => {
  it("saves what is sent, keeps the rest, and answers the policy and both codes", async () => {
    const soon = Date.now() + 7 * 86400e3;
    const out = await call<{ policy: unknown; codes: Record<string, unknown> }>("setJoinPolicy", "a1", { orgId: "o1", requireVerifiedEmail: true, allowedDomains: [" School.org", "@pupils.school.org", "school.org"], codes: { student: { expiresAt: soon, maxUses: 30 } } });
    expect(out.policy).toEqual({ requireVerifiedEmail: true, allowedDomains: ["school.org", "pupils.school.org"] });
    expect(out.codes).toEqual({ teacher: { expiresAt: null, maxUses: null, uses: 0 }, student: { expiresAt: soon, maxUses: 30, uses: 0 } });
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toEqual({ orgId: "o1", role: "student", expiresAt: soon, maxUses: 30 });
    expect(doc(`inviteCodes/${TEACHER_CODE}`)).toEqual({ orgId: "o1", role: "teacher" });
    expect(doc("orgs/o1/private/invites")).toMatchObject({ teacher: TEACHER_CODE, student: STUDENT_CODE, policy: out.policy, limits: { student: { expiresAt: soon, maxUses: 30 }, teacher: { expiresAt: null, maxUses: null } } });
    expect(h.audits.at(-1)).toMatchObject({ action: "setJoinPolicy", by: "a1", orgId: "o1" });
    // Only the limit cleared: the expiry, the domains and the verified-email rule stay.
    const next = await call<{ policy: unknown; codes: Record<string, unknown> }>("setJoinPolicy", "a1", { orgId: "o1", allowedDomains: [], codes: { student: { maxUses: null } } });
    expect(next.policy).toEqual({ requireVerifiedEmail: true, allowedDomains: [] });
    expect(next.codes.student).toEqual({ expiresAt: soon, maxUses: null, uses: 0 });
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toEqual({ orgId: "o1", role: "student", expiresAt: soon });
  });

  it("with nothing to change it only reads: no write, no audit entry", async () => {
    doc(`inviteCodes/${TEACHER_CODE}`)!.uses = 7;
    const out = await call<{ policy: unknown; codes: Record<string, unknown> }>("setJoinPolicy", "a1", { orgId: "o1" });
    expect(out).toEqual({ policy: { requireVerifiedEmail: false, allowedDomains: [] }, codes: { teacher: { expiresAt: null, maxUses: null, uses: 7 }, student: { expiresAt: null, maxUses: null, uses: 0 } } });
    expect(db.writes).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("refuses anything malformed whole, as bad-policy", async () => {
    const bad: Record<string, unknown>[] = [
      { requireVerifiedEmail: "yes" }, { allowedDomains: "school.org" }, { allowedDomains: ["not a domain"] }, { allowedDomains: ["nodot"] },
      { allowedDomains: Array.from({ length: 21 }, (_, i) => `s${i}.org`) }, { codes: { student: { expiresAt: Date.now() - 1 } } },
      { codes: { student: { maxUses: 0 } } }, { codes: { student: { maxUses: 2.5 } } }, { codes: { admin: { maxUses: 2 } } }, { codes: [] },
    ];
    for (const d of bad) expect(await refusal(call("setJoinPolicy", "a1", { orgId: "o1", requireVerifiedEmail: true, ...d })), JSON.stringify(d)).toBe("bad-policy");
    expect(db.writes).toEqual([]);
  });

  it("a new code starts with no expiry, no limit and no uses", async () => {
    await call("setJoinPolicy", "a1", { orgId: "o1", requireVerifiedEmail: true, codes: { student: { expiresAt: Date.now() + 1000, maxUses: 5 }, teacher: { maxUses: 9 } } });
    await call("joinOrg", "n1", { code: STUDENT_CODE });
    const { code } = await call<{ code: string }>("regenerateInviteCode", "a1", { orgId: "o1", role: "student" });
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(doc(`inviteCodes/${STUDENT_CODE}`)).toBeUndefined();
    expect(doc(`inviteCodes/${code}`)).toEqual({ orgId: "o1", role: "student" });
    const invites = doc("orgs/o1/private/invites")!;
    expect(invites).toMatchObject({ student: code, teacher: TEACHER_CODE, policy: { requireVerifiedEmail: true }, limits: { teacher: { maxUses: 9 } } });
    expect(invites.limits.student).toBeUndefined();
    expect(invites.uses.student).toBeUndefined();
  });
});

describe("accounts made in bulk (createMembers)", () => {
  type Result = { row: number; name: string; login: string; password?: string; uid?: string; status: string; reason?: string; warning?: string };
  const create = (members: unknown[], more: Record<string, unknown> = {}) => call<{ results: Result[] }>("createMembers", "a1", { orgId: "o1", members, ...more });

  it("refuses no rows and more than 500", async () => {
    expect(await refusal(create([]))).toBe("batch-size");
    expect(await refusal(create(Array.from({ length: 501 }, () => ({ name: "Mona" }))))).toBe("batch-size");
    expect(await refusal(call("createMembers", "a1", { orgId: "o1" }))).toBe("batch-size");
    doc("orgs/o1")!.status = "rejected";
    expect(await refusal(create([{ name: "Mona" }]))).toBe("org-inactive");
    expect(auth.users.size).toBe(8);
  });

  it("makes every password itself: one a row names is ignored, and the length is kept to 8–32", async () => {
    const { results } = await create([{ name: "Mona Ali", password: "password123" }, { name: "Omar Said", password: "12345678" }], { passwordLength: 99 });
    for (const r of results) {
      expect(r.status).toBe("created");
      expect(r.password).toHaveLength(32);
      expect(r.password).not.toMatch(/password123|12345678/);
      expect(auth.users.get(r.uid!)!.password).toBe(r.password);
    }
    expect((await create([{ name: "Sara" }], { passwordLength: 2 })).results[0].password).toHaveLength(8);
    expect((await create([{ name: "Hana" }], { passwordLength: "abc" })).results[0].password).toHaveLength(10);
    expect((await create([{ name: "Laila" }])).results[0].password).toHaveLength(10);
  });

  it("writes each account's role, organization, maker and first-login flag, and counts them once", async () => {
    const { results } = await create([
      { name: "Mona Ali", group: "5A" }, { name: "Karim Adel", username: "karim.adel" }, { name: "Dr Hoda", email: "Hoda@Uni.edu", role: "teacher" },
      { name: "", username: "x" }, { name: "Bad Email", email: "nope" }, { name: "Bad Login", username: "a" }, { name: "Taken", email: "t1@school.org" },
    ]);
    expect(results.map((r) => [r.row, r.status, r.reason])).toEqual([
      [1, "created", undefined], [2, "created", undefined], [3, "created", undefined],
      [4, "error", "missingName"], [5, "error", "invalidEmail"], [6, "error", "invalidUsername"], [7, "exists", "exists"],
    ]);
    const [mona, karim, hoda] = results;
    expect(mona.login).toMatch(/^mona\.ali\.\d{5}$/);
    expect(doc(`users/${mona.uid}`)).toMatchObject({ name: "Mona Ali", username: mona.login, email: `${mona.login}@users.darsiai.org`, role: "student", orgId: "o1", group: "5A", createdBy: "a1", managedBy: "o1", mustChangePassword: true, teacherId: null, active: true });
    expect(doc(`users/${karim.uid}`)).toMatchObject({ username: "karim.adel", email: "karim.adel@users.darsiai.org", managedBy: "o1", createdBy: "a1" });
    // A typed real email is its owner's account: made by the admin, not managed by the organization.
    expect(doc(`users/${hoda.uid}`)).toMatchObject({ email: "hoda@uni.edu", username: null, role: "teacher", orgId: "o1", createdBy: "a1" });
    expect(doc(`users/${hoda.uid}`)).not.toHaveProperty("managedBy");
    expect(auth.users.get(hoda.uid!)!.customClaims).toEqual({ role: "teacher", orgId: "o1" });
    expect(auth.users.get(mona.uid!)!.customClaims).toEqual({ role: "student", orgId: "o1" });
    expect(doc("orgs/o1")!.memberCount).toBe(7);
    expect(db.writes.filter((w) => w.path === "orgs/o1")).toHaveLength(1);
    expect(h.audits.at(-1)).toEqual({ action: "createMembers", by: "a1", orgId: "o1", created: 3, total: 7, mustChange: true, roles: { student: 2, teacher: 1 } });
  });
  it("never gives out a username an account still holds at the old domain (usernameDomain.ts), typed or drawn", async () => {
    auth.users.set("old1", { uid: "old1", email: "karim.adel@users.darsi.app", providerData: [{ providerId: "password" }] });
    const { results } = await create([{ name: "Karim Adel", username: "karim.adel" }, { name: "Lina" }]);
    expect(results.map((r) => [r.status, r.reason])).toEqual([["taken", "taken"], ["created", undefined]]); // as a username taken at the new domain
    expect([...auth.users.values()].filter((u) => u.email === "karim.adel@users.darsiai.org")).toHaveLength(0);
    expect(auth.users.get(results[1].uid!)!.email).toMatch(/^lina\.\d{5}@users\.darsiai\.org$/);
  });

  it("the admin can let people keep the password they are given", async () => {
    const { results } = await create([{ name: "Mona Ali" }], { mustChangePassword: false, defaultRole: "teacher" });
    expect(doc(`users/${results[0].uid}`)).toMatchObject({ mustChangePassword: false, role: "teacher" });
    expect(h.audits.at(-1)).toMatchObject({ mustChange: false, roles: { teacher: 1 } });
  });

  it("links pupils to a teacher made in the same call, wherever the sheet lists her, and to one who was there before", async () => {
    const { results } = await create([
      { name: "Pupil One", teacherEmail: "t.new" }, { name: "Pupil Two", teacherEmail: "new.teacher@school.org" }, { name: "Pupil Three", teacherEmail: "T1@school.org" },
      { name: "Pupil Four", teacherEmail: "s1@school.org" }, { name: "Pupil Five", teacherEmail: "nobody@school.org" }, { name: "Pupil Six", teacherEmail: "s2@school.org" },
      { name: "New Teacher", username: "t.new", role: "teacher" }, { name: "Other Teacher", email: "new.teacher@school.org", role: "orgAdmin" },
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(8).fill("created"));
    expect(results.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(doc(`users/${results[0].uid}`)!.teacherId).toBe(results[6].uid);
    expect(doc(`users/${results[1].uid}`)!.teacherId).toBe(results[7].uid);
    expect(doc(`users/${results[2].uid}`)!.teacherId).toBe("t1");
    // A student, nobody, and another organization's member are nobody's teacher here.
    for (const i of [3, 4, 5]) { expect(doc(`users/${results[i].uid}`)!.teacherId).toBeNull(); expect(results[i].warning).toBe("teacherNotFound"); }
    expect(results[0].warning).toBeUndefined();
  });

  it("makes six accounts at a time, and never the same made-up login twice", async () => {
    const { results } = await create(Array.from({ length: 60 }, () => ({ name: "منى علي" })));
    expect(auth.maxCreating).toBe(6);
    expect(results.every((r) => r.status === "created")).toBe(true);
    expect(new Set(results.map((r) => r.login)).size).toBe(60);
    expect(results.map((r) => r.row)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(doc("orgs/o1")!.memberCount).toBe(64);
  });

  it("draws a new login when a made-up one is taken, and reports a typed one that is", async () => {
    // The clash is staged: whatever login is drawn first turns out to be someone's already.
    const createUser = auth.createUser.bind(auth);
    let first = true;
    auth.createUser = async (p) => {
      if (first && p.email?.startsWith("mona.ali.")) { first = false; auth.users.set("squatter", { uid: "squatter", email: p.email }); }
      return createUser(p);
    };
    try {
      const { results } = await create([{ name: "Mona Ali" }]);
      expect(results[0].status).toBe("created");
      expect(first).toBe(false);
      expect(auth.users.get(results[0].uid!)!.email).not.toBe(auth.users.get("squatter")!.email);
      auth.users.get("t1")!.email = "karim.adel@users.darsiai.org";
      expect((await create([{ name: "Karim", username: "Karim.Adel" }])).results[0]).toMatchObject({ status: "taken", reason: "taken", login: "karim.adel" });
    } finally { auth.createUser = createUser; }
  });

  it("takes back an account whose profile could not be written, so the row can be sent again", async () => {
    db.failOn = (w) => w.path.startsWith("users/made");
    const { results } = await create([{ name: "Mona Ali", email: "mona@school.org" }]);
    expect(results[0]).toMatchObject({ status: "error" });
    expect([...auth.users.values()].some((u) => u.email === "mona@school.org")).toBe(false);
    expect(doc("orgs/o1")!.memberCount).toBe(4);
    expect((await create([{ name: "Mona Ali", email: "mona@school.org" }])).results[0].status).toBe("created");
  });
});

describe("an organization's request", () => {
  it("keeps whether the requester's email is verified beside their private contact", async () => {
    const out = await call<{ orgId: string }>("requestOrg", "n1", { name: "Sun School", contact: "0100", reason: "We teach" });
    expect(doc(`orgs/${out.orgId}`)).toMatchObject({ name: "Sun School", status: "pending", createdBy: "n1" });
    expect(doc(`orgs/${out.orgId}`)).not.toHaveProperty("contact");
    expect(doc(`orgs/${out.orgId}/private/request`)).toMatchObject({ contact: "0100", reason: "We teach", emailVerified: true });
    auth.users.set("n2", { uid: "n2", email: "omar@gmail.com", emailVerified: false });
    const two = await call<{ orgId: string }>("requestOrg", "n2", { name: "Moon School" }); // not verified: still accepted
    expect(doc(`orgs/${two.orgId}/private/request`)).toMatchObject({ emailVerified: false });
  });

  it("approval makes the requester its admin, once, with codes", async () => {
    const { orgId } = await call<{ orgId: string }>("requestOrg", "n1", { name: "Sun School" });
    const out = await call<{ status: string; inviteCodes: { teacher: string; student: string } }>("reviewOrg", "root", { orgId, approve: true });
    expect(out.status).toBe("active");
    expect(doc(`users/n1`)).toMatchObject({ role: "orgAdmin", orgId });
    expect(claimsOf("n1")).toEqual({ role: "orgAdmin", orgId });
    expect(doc(`orgs/${orgId}`)).toMatchObject({ status: "active", memberCount: 1 });
    expect(doc(`inviteCodes/${out.inviteCodes.student}`)).toEqual({ orgId, role: "student" });
    // A second approval of a healthy organization is still "already reviewed".
    expect(await refusal(call("reviewOrg", "root", { orgId, approve: true }))).toBe("reviewed");
    expect(await refusal(call("reviewOrg", "root", { orgId, approve: false }))).toBe("reviewed");
    expect(await refusal(call("reviewOrg", "a1", { orgId, approve: true }))).toBe("not-super");
  });

  it("an approval that failed half-way is repaired by approving again: the requester becomes admin, no new codes, no second count", async () => {
    const { orgId } = await call<{ orgId: string }>("requestOrg", "n1", { name: "Sun School" });
    // Promotion writes the profile first; that write fails, after the organization was already made active.
    db.failOn = (w) => w.path === "users/n1";
    expect(await refusal(call("reviewOrg", "root", { orgId, approve: true }))).toMatch(/^no reason/);
    expect(doc(`orgs/${orgId}`)).toMatchObject({ status: "active", memberCount: 1 });
    expect(doc("users/n1")?.role).not.toBe("orgAdmin");
    const codes = { ...doc(`orgs/${orgId}/private/invites`) };
    expect(await call("reviewOrg", "root", { orgId, approve: true })).toEqual({ status: "active", repaired: true });
    expect(doc("users/n1")).toMatchObject({ role: "orgAdmin", orgId });
    expect(claimsOf("n1")).toEqual({ role: "orgAdmin", orgId });
    expect(doc(`orgs/${orgId}`)).toMatchObject({ status: "active", memberCount: 1 });
    expect(doc(`orgs/${orgId}/private/invites`)).toEqual(codes);
    expect(h.audits.at(-1)).toMatchObject({ action: "repairOrg", by: "root", orgId, requester: "n1" });
    expect(h.alerts.at(-1)).toEqual(["reviewed", "n1", orgId, "Sun School", true, ""]);
    expect(await refusal(call("reviewOrg", "root", { orgId, approve: true }))).toBe("reviewed");
  });

  it("repairs claims that never followed the profile, and leaves a requester who went elsewhere alone", async () => {
    const { orgId } = await call<{ orgId: string }>("requestOrg", "n1", { name: "Sun School" });
    auth.failClaims = 1; // the profile was written, the claims were not
    expect(await refusal(call("reviewOrg", "root", { orgId, approve: true }))).toMatch(/^no reason/);
    expect(doc("users/n1")).toMatchObject({ role: "orgAdmin", orgId });
    expect(claimsOf("n1")).toBeUndefined();
    expect(await call("reviewOrg", "root", { orgId, approve: true })).toEqual({ status: "active", repaired: true });
    expect(claimsOf("n1")).toEqual({ role: "orgAdmin", orgId });
    // Another organization with no admin whose requester has since joined o1: never moved by a repair.
    db.docs.set("orgs/o9", { name: "Empty", status: "active", memberCount: 0, createdBy: "s1", reviewedBy: "root" });
    expect(await refusal(call("reviewOrg", "root", { orgId: "o9", approve: true }))).toBe("reviewed");
    expect(doc("users/s1")).toMatchObject({ role: "student", orgId: "o1" });
    // A requester who is a platform admin now is never demoted by it.
    db.docs.set("orgs/o8", { name: "Staff", status: "active", memberCount: 0, createdBy: "root", reviewedBy: "root" });
    expect(await refusal(call("reviewOrg", "root", { orgId: "o8", approve: true }))).toBe("reviewed");
    expect(claimsOf("root")).toEqual({ role: "superadmin" });
    // An organization a platform admin made (createOrg: never reviewed) has no requester to make its admin.
    auth.users.set("n3", { uid: "n3", email: "sami@gmail.com", emailVerified: true });
    db.docs.set("orgs/o7", { name: "Made", status: "active", memberCount: 0, createdBy: "n3" });
    expect(await refusal(call("reviewOrg", "root", { orgId: "o7", approve: true }))).toBe("reviewed");
    expect(doc("users/n3")).toBeUndefined();
  });
});

describe("the learning summary's trigger", () => {
  const event = (ageMs: number) => ({ params: { uid: "s1", lessonId: "ai-1-1-1" }, time: new Date(Date.now() - ageMs).toISOString() });
  it("is retried on failure, and gives up on an event older than six hours", async () => {
    expect(index.onProgressWrite.__endpoint?.eventTrigger?.retry).toBe(true);
    await index.onProgressWrite.run(event(1000));
    expect(h.progress).toEqual([["s1", "ai-1-1-1"]]);
    await index.onProgressWrite.run(event(5 * 3600e3));
    expect(h.progress).toHaveLength(2);
    await index.onProgressWrite.run(event(6 * 3600e3 + 60e3));
    expect(h.progress).toHaveLength(2);
  });
});
