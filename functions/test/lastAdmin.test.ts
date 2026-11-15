// An organization keeps an admin (platform.ts refuseLastAdmin): its only admin isn't demoted, moved out or removed until
// someone else is its admin, for any caller, and refusals carry a stable reason code that the admin screens put in the
// admin's language (apps/web/src/admin/refusals.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, freshCaller,
    audit: async () => {},
    releasePupils: async () => 0,
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/billing.js", () => ({ writeClaims: async () => {}, refreshClaims: async () => null }));
vi.mock("../src/storage.js", () => ({ bucket: () => ({ deleteFiles: async () => {} }) }));

const admin = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const { db, auth } = admin;
const platform = await import("../src/platform");
type Run = { run: (req: unknown) => Promise<unknown> };
const asSuper = (data: Record<string, unknown>) => ({ auth: { uid: "root", token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");

beforeEach(() => {
  db.docs.clear(); auth.users.clear();
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 3 });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 0 });
  db.docs.set("users/a1", { role: "orgAdmin", orgId: "o1" });
  db.docs.set("users/t1", { role: "teacher", orgId: "o1" });
  db.docs.set("users/s1", { role: "student", orgId: "o1" });
});

describe("an organization's only admin", () => {
  it("can't be made a teacher, a learner or another organization's admin", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBe("last-admin");
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "learner" })))).toBe("last-admin");
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "orgAdmin", orgId: "o2" })))).toBe("last-admin");
    expect(db.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
  });

  it("can be changed once someone else is its admin, and other members never wait on it", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "learner" })))).toBeNull();
    expect(await refusal(setUserRole.run(asSuper({ uid: "t1", role: "orgAdmin", orgId: "o1" })))).toBeNull();
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBeNull();
    expect(db.docs.get("users/a1")).toMatchObject({ role: "teacher", orgId: "o1" });
  });

  it("doesn't count another admin who is suspended (they can't sign in), as orgMembers' keepAnAdmin doesn't", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    db.docs.set("users/a2", { role: "orgAdmin", orgId: "o1", suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    db.docs.set("users/a3", { role: "orgAdmin", orgId: "o1", suspended: { at: 1, by: "root", reason: "abuse" } });
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBe("last-admin");
    expect(db.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
    // A working admin after the suspended ones (all of them are read, not the first two): a1 may go.
    db.docs.set("users/a4", { role: "orgAdmin", orgId: "o1" });
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBeNull();
    // A suspended admin is not themself kept: the working ones remain.
    expect(await refusal(setUserRole.run(asSuper({ uid: "a2", role: "teacher", orgId: "o1" })))).toBeNull();
  });

  it("says why with a code: your own role, no organization, an inactive one", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "root", role: "learner" })))).toBe("self-role");
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "teacher", orgId: "nope" })))).toBe("no-org");
    db.docs.set("orgs/o3", { name: "Closed", status: "rejected" });
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "teacher", orgId: "o3" })))).toBe("org-inactive");
  });

  // createOrg moves its first admin with the same assign() setUserRole uses, and used to skip this check: naming
  // School A's only admin left School A with nobody to add people or reset passwords, without a word.
  it("can't be named a new organization's first admin either, and no organization is made", async () => {
    const createOrg = platform.createOrg as unknown as Run;
    const orgs = () => [...db.docs.keys()].filter((k) => k.startsWith("orgs/") && k.split("/").length === 2).sort();
    expect(await refusal(createOrg.run(asSuper({ name: "New School", adminUid: "a1" })))).toBe("last-admin");
    expect(orgs()).toEqual(["orgs/o1", "orgs/o2"]);
    expect(db.docs.get("users/a1")).toEqual({ role: "orgAdmin", orgId: "o1" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    // Once someone else is its admin, the same call goes through and moves them.
    db.docs.set("users/a2", { role: "orgAdmin", orgId: "o1" });
    const made = (await createOrg.run(asSuper({ name: "New School", adminUid: "a1" }))) as { orgId: string };
    expect(orgs()).toEqual(["orgs/o1", "orgs/o2", "orgs/" + made.orgId].sort());
    expect(db.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: made.orgId });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    // Someone who is not an organization's admin never waits on this: a teacher, and a learner in no organization.
    db.docs.set("users/l1", { role: "learner", orgId: null });
    expect(await refusal(createOrg.run(asSuper({ name: "Third School", adminUid: "t1" })))).toBeNull();
    expect(await refusal(createOrg.run(asSuper({ name: "Fourth School", adminUid: "l1" })))).toBeNull();
  });
});

// Only a platform admin makes, changes, suspends or deletes an organization (requireSuper, checked against the claims
// Auth holds, not the ones the token shows), and only admins look accounts up. An organization's own admin gets no
// further than the door, and nothing is written.
describe("anyone but a platform admin", () => {
  const as = (uid: string, data: Record<string, unknown>) => ({ auth: { uid, token: { role: "superadmin" } }, data }); // whatever the token says
  const code = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code);
  beforeEach(() => {
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
    auth.users.set("t1", { uid: "t1", customClaims: { role: "teacher", orgId: "o1" } });
    auth.users.set("s1", { uid: "s1", customClaims: { role: "student", orgId: "o1" } });
  });

  it("can't create, change, suspend or delete an organization", async () => {
    const before = new Map(db.docs);
    for (const uid of ["a1", "t1", "s1"]) {
      expect(await code((platform.createOrg as unknown as Run).run(as(uid, { name: "My Own School", adminUid: uid })))).toBe("permission-denied");
      expect(await code((platform.updateOrg as unknown as Run).run(as(uid, { orgId: "o1", name: "Renamed" })))).toBe("permission-denied");
      expect(await code((platform.updateOrg as unknown as Run).run(as(uid, { orgId: "o2", status: "suspended" })))).toBe("permission-denied");
      expect(await code((platform.deleteOrg as unknown as Run).run(as(uid, { orgId: "o1", confirm: "Nile School" })))).toBe("permission-denied");
      expect(await code((platform.deleteOrg as unknown as Run).run(as(uid, { orgId: "o2", confirm: "Delta School", members: "delete-managed" })))).toBe("permission-denied");
    }
    expect(await code((platform.deleteOrg as unknown as Run).run({ data: { orgId: "o1", confirm: "Nile School" } }))).toBe("unauthenticated");
    expect(new Map(db.docs)).toEqual(before); // nothing was written: no organization made, renamed, suspended or emptied
  });

  it("can't look an account up unless they are an admin", async () => {
    const findAccount = platform.findAccount as unknown as Run;
    expect(await refusal(findAccount.run(as("t1", { login: "someone@example.com" })))).toBe("not-admin");
    expect(await refusal(findAccount.run(as("s1", { login: "someone@example.com" })))).toBe("not-admin");
    expect(await code(findAccount.run({ data: { login: "someone@example.com" } }))).toBe("unauthenticated");
  });

  // Every other callable an organization's admin reaches refuses while it is suspended or being deleted; this one
  // went on answering with its members' uid, name, role and verified state.
  it("an admin of a suspended organization, or of one being deleted, can't look its members up; a platform admin still can", async () => {
    const findAccount = platform.findAccount as unknown as Run;
    auth.users.set("m1", { uid: "m1", email: "m1@school.example", emailVerified: true, providerData: [{ providerId: "password" }] });
    db.docs.set("users/m1", { name: "Mona", role: "student", orgId: "o1", email: "m1@school.example" });
    const look = (uid: string) => findAccount.run(as(uid, { login: "m1@school.example" }));
    const found = { account: expect.objectContaining({ uid: "m1", name: "Mona", role: "student", orgId: "o1" }), profiles: 1 };
    expect(await look("a1")).toEqual(found);
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, status: "suspended" });
    expect(await refusal(look("a1"))).toBe("org-suspended");
    expect(await look("root")).toEqual(found);
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, status: "deleting" });
    expect(await refusal(look("a1"))).toBe("org-deleting");
    expect(await code(look("a1"))).toBe("permission-denied");
    db.docs.set("orgs/o1", { ...db.docs.get("orgs/o1")!, status: "active" });
    expect(await look("a1")).toEqual(found);
  });
});
