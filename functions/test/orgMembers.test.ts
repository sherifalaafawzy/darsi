// The member callables (orgMembers.ts): leaving, suspending, bulk actions, audited class/teacher/name edits and the
// lean paged member list. The Admin SDK is the in-memory one (fakeFirestore.ts), extended here with what these
// callables need: ordered, paged and projected queries (so a field listMembers forgets to select is really missing),
// and Auth accounts that can be disabled and given a password.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { isManaged, leanSummary, memberPatch, memberRow, onlyWorkingAdmin, pageLimit, patchFor, selectFor, uidList, withRemovedAll } from "../src/orgMembersCore";

type Data = Record<string, unknown>;
type Account = { uid: string; customClaims?: Data; email?: string; disabled?: boolean; password?: string; providerData?: { providerId: string }[] };

vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  type Opts = { after?: string; limit?: number; fields?: string[] };
  /** Only the selected fields (dotted paths), as Firestore's select() returns them; none selected = ids only. */
  const pick = (data: Data | undefined, fields: string[]) => {
    const out: Data = {};
    for (const f of fields) {
      const parts = f.split(".");
      let from: unknown = data;
      for (const p of parts) from = from && typeof from === "object" ? (from as Data)[p] : undefined;
      if (from === undefined) continue;
      let at = out;
      for (const p of parts.slice(0, -1)) at = (at[p] ??= {}) as Data;
      at[parts.at(-1)!] = from;
    }
    return out;
  };
  class Db extends FakeDb {
    /** The base query plus document-id order, startAfter, limit and select. */
    query(col: string, filters: [string, unknown][] = [], o: Opts = {}) {
      const self = this;
      const run = () => {
        let docs = [...self.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).sort()
          .map((k) => self.snap(k)).filter((s) => filters.every(([f, v]) => s.get(f) === v));
        if (o.after) docs = docs.filter((d) => d.id > o.after!);
        if (o.limit) docs = docs.slice(0, o.limit);
        if (o.fields) docs = docs.map((d) => { const data = pick(d.data(), o.fields!); return { ...d, data: () => structuredClone(data), get: (f: string) => f.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Data)[k] : undefined), data) }; });
        return docs;
      };
      const more = (m: Opts) => self.query(col, filters, { ...o, ...m });
      const q = {
        where: (f: string, _op: "==", v: unknown) => self.query(col, [...filters, [f, v]], o),
        orderBy: (..._by: unknown[]) => q,
        startAfter: (id: string) => more({ after: id }),
        limit: (n: number) => more({ limit: n }),
        select: (...f: string[]) => more({ fields: f }),
        get: async () => { const docs = run(); return { docs, size: docs.length, empty: !docs.length }; },
        count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
        isQuery: true,
      };
      return q as never;
    }
  }
  class Auth extends FakeAuth {
    revoked: string[] = [];
    async updateUser(uid: string, p: Data) { const u = this.users.get(uid); if (!u) throw new Error("auth/user-not-found"); Object.assign(u, p); return u; }
    async revokeRefreshTokens(uid?: string) { if (uid) this.revoked.push(uid); }
  }
  const db = new Db(), auth = new Auth();
  const audits: Data[] = [];
  /** Who freshCaller was asked about: the real one is also what remembers the request for the audit entry (admin.ts). */
  const asked: string[] = [];
  type Req = { auth?: { uid: string; token: Data } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    asked.push(req.auth.uid);
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: (claims.orgId as string | null | undefined) ?? undefined };
  };
  return {
    db, auth, freshCaller, audits, asked,
    audit: async (action: string, by: string, data: Data) => { audits.push({ action, by, ...data }); },
    // As admin.ts: the organization's pupils who had this teacher have none.
    releasePupils: async (orgId: string | null | undefined, teacherUid: string) => {
      if (!orgId || !teacherUid) return 0;
      const page = await db.collection("users").where("orgId", "==", orgId).where("teacherId", "==", teacherUid).get();
      for (const d of page.docs) await d.ref.update({ teacherId: null });
      return page.size;
    },
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
// writeClaims as far as these tests look: the claims Auth holds follow the role and organization.
vi.mock("../src/billing.js", async () => {
  const { auth } = (await import("../src/admin.js")) as unknown as { auth: FakeAuth };
  return { writeClaims: async (uid: string, role: string, orgId: string | null) => { const u = auth.users.get(uid); if (u) u.customClaims = { role, orgId }; } };
});
vi.mock("../src/storage.js", () => ({ bucket: () => ({ deleteFiles: async () => {} }) }));

const admin = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth & { revoked: string[] }; audits: Data[]; asked: string[] };
const { db, auth, audits, asked } = admin;
const members = await import("../src/orgMembers");
type Run = { run: (req: unknown) => Promise<unknown> };
const run = <T = Data>(fn: unknown, uid: string | null, data: Data = {}) => (fn as Run).run({ ...(uid ? { auth: { uid, token: {} } } : {}), data }) as Promise<T>;
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");
const user = (uid: string) => db.docs.get(`users/${uid}`) as Data;
const account = (uid: string) => auth.users.get(uid) as Account;
const DOMAIN = "users.darsiai.org";

/** A profile and its Auth account. A username login when `email` is left out. */
function person(uid: string, role: string, orgId: string | null, more: Data = {}) {
  const email = (more.email as string | undefined) ?? `${uid}@${DOMAIN}`;
  db.docs.set(`users/${uid}`, { name: `Name ${uid}`, email, ...(email.endsWith(DOMAIN) ? { username: uid } : {}), role, orgId, ...more });
  auth.users.set(uid, { uid, customClaims: { role, orgId }, email, providerData: [{ providerId: "password" }] } as Account);
}

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); auth.revoked.length = 0; audits.length = 0; asked.length = 0;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  db.docs.set("users/root", { name: "Root", email: "root@darsi.app", role: "superadmin", orgId: null });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 5 });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 2 });
  person("a1", "orgAdmin", "o1", { email: "a1@nile.example" });
  person("t1", "teacher", "o1", { email: "t1@nile.example" });
  person("s1", "student", "o1", { teacherId: "t1", group: "5A", createdBy: "a1" }); // a username login the school made
  person("s2", "student", "o1", { email: "s2@nile.example", managedBy: "o1" }); // the school's own sign-in
  person("s3", "student", "o1", { email: "s3@gmail.example", teacherId: "t1" }); // signed up, joined with a code
  person("b1", "orgAdmin", "o2", { email: "b1@delta.example" });
  person("x1", "student", "o2");
});

describe("who may call (the orgAdmin guard)", () => {
  const calls = (): [string, unknown, Data][] => [
    ["setMemberSuspended", members.setMemberSuspended, { orgId: "o1", uid: "s1", suspended: true }],
    ["bulkMembers", members.bulkMembers, { orgId: "o1", uids: ["s1"], action: "remove" }],
    ["updateMembers", members.updateMembers, { orgId: "o1", uids: ["s1"], patch: { group: "6B" } }],
    ["listMembers", members.listMembers, { orgId: "o1" }],
  ];
  it("another organization's admin, a teacher and a student are refused on every callable, and nothing changes", async () => {
    const before = structuredClone([...db.docs]);
    for (const [name, fn, data] of calls()) {
      for (const uid of ["b1", "t1", "s3"]) expect(await refusal(run(fn, uid, data)), `${name} as ${uid}`).toBe("not-org-admin");
      expect(await refusal(run(fn, null, data)), name).toBe("signed-out");
    }
    expect([...db.docs]).toEqual(before);
    expect(account("s1").disabled).toBeUndefined();
    expect(await refusal(run(members.leaveOrg, null))).toBe("signed-out");
  });
  it("an admin demoted since their token was made is refused (claims as Auth holds them now)", async () => {
    account("a1").customClaims = { role: "teacher", orgId: "o1" };
    for (const [name, fn, data] of calls()) expect(await refusal(run(fn, "a1", data)), name).toBe("not-org-admin");
  });
  it("a suspended organization's admin, or one being deleted, does nothing; a platform admin still can", async () => {
    for (const status of ["suspended", "deleting"]) {
      db.docs.set("orgs/o1", { name: "Nile School", status, memberCount: 5 });
      for (const [name, fn, data] of calls()) expect(await refusal(run(fn, "a1", data)), name).toBe(`org-${status}`);
    }
    expect(await refusal(run(members.listMembers, "root", { orgId: "o1" }))).toBeNull();
    expect(await refusal(run(members.listMembers, "root", {}))).toBe("no-org");
    expect(await refusal(run(members.listMembers, "root", { orgId: "o1/private" }))).toBe("no-org");
  });
});

describe("leaveOrg", () => {
  it("a teacher who signed up leaves: a learner with no class, their pupils released, one member fewer, audited", async () => {
    expect(await run(members.leaveOrg, "t1")).toEqual({ ok: true });
    expect(user("t1")).toMatchObject({ role: "learner", orgId: null, teacherId: null, group: null });
    expect(account("t1").customClaims).toEqual({ role: "learner", orgId: null });
    expect(user("s1").teacherId).toBeNull();
    expect(user("s3").teacherId).toBeNull();
    expect((db.docs.get("orgs/o1") as Data).memberCount).toBe(4);
    expect(audits).toEqual([{ action: "leaveOrg", by: "t1", orgId: "o1", role: "teacher" }]);
    // The request went through freshCaller: that is what gives the audit entry its address and request id.
    expect(asked).toEqual(["t1"]);
  });
  it("a suspended account doesn't leave: its token may outlive the suspension", async () => {
    db.docs.set("users/s3", { ...user("s3"), suspended: { at: 1, by: "root", reason: "abuse" } });
    expect(await refusal(run(members.leaveOrg, "s3"))).toBe("disabled");
    expect(user("s3")).toMatchObject({ role: "student", orgId: "o1", teacherId: "t1" });
    expect((db.docs.get("orgs/o1") as Data).memberCount).toBe(5);
    expect(audits).toEqual([]);
  });
  it("refuses someone in no organization, an account the organization made, and its only admin", async () => {
    expect(await refusal(run(members.leaveOrg, "root"))).toBe("not-in-org");
    expect(await refusal(run(members.leaveOrg, "nobody"))).toBe("not-in-org");
    expect(await refusal(run(members.leaveOrg, "s1"))).toBe("managed"); // a username login
    expect(await refusal(run(members.leaveOrg, "s2"))).toBe("managed"); // managedBy
    expect(await refusal(run(members.leaveOrg, "a1"))).toBe("last-admin");
    expect(user("s1").orgId).toBe("o1");
    expect(user("a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
    expect(audits).toEqual([]);
  });
  it("an admin leaves once someone else is the organization's admin; a student who joined with a code leaves", async () => {
    person("a2", "orgAdmin", "o1", { email: "a2@nile.example" });
    expect(await refusal(run(members.leaveOrg, "a1"))).toBeNull();
    expect(await refusal(run(members.leaveOrg, "s3"))).toBeNull();
    expect(user("a1").role).toBe("learner");
    expect(user("s3").orgId).toBeNull();
  });
  it("another admin who is suspended is no admin to leave the organization with", async () => {
    person("a2", "orgAdmin", "o1", { suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    expect(await refusal(run(members.leaveOrg, "a1"))).toBe("last-admin");
    const { results } = await run<{ results: { reason?: string }[] }>(members.bulkMembers, "root", { orgId: "o1", uids: ["a1"], action: "remove" });
    expect(results[0].reason).toBe("last-admin");
    expect(user("a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
  });
});

describe("setMemberSuspended", () => {
  it("suspend then restore round-trips the Auth flag and the profile, and both are audited", async () => {
    expect(await run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s1", suspended: true, reason: "  Left the school  " })).toEqual({ suspended: true });
    expect(account("s1").disabled).toBe(true);
    expect(auth.revoked).toEqual(["s1"]);
    expect(user("s1").suspended).toMatchObject({ by: "a1", reason: "Left the school", byOrg: "o1" });
    expect(await run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s1", suspended: false })).toEqual({ suspended: false });
    expect(account("s1").disabled).toBe(false);
    expect("suspended" in user("s1")).toBe(false);
    expect(audits).toEqual([
      { action: "setMemberSuspended", by: "a1", orgId: "o1", uid: "s1", suspended: true, reason: "Left the school" },
      { action: "setMemberSuspended", by: "a1", orgId: "o1", uid: "s1", suspended: false },
    ]);
  });
  it("refuses yourself, another organization's person, a person with their own login, and a flag that is no boolean", async () => {
    const call = (data: Data) => refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", suspended: true, ...data }));
    expect(await call({ uid: "a1" })).toBe("self-suspend");
    expect(await call({ uid: "x1" })).toBe("not-member");
    expect(await call({ uid: "nobody" })).toBe("not-member");
    expect(await call({ uid: "x1/progress/l1" })).toBe("not-member");
    expect(await call({})).toBe("not-member");
    expect(await call({ uid: "s3" })).toBe("own-login");
    expect(await call({ uid: "t1" })).toBe("own-login");
    expect(await call({ uid: "s1", suspended: "yes" })).toBe("bad-suspended");
    expect(await call({ uid: "s1", suspended: undefined })).toBe("bad-suspended");
    for (const uid of ["a1", "x1", "s3", "t1", "s1"]) expect(account(uid).disabled).toBeUndefined();
  });
  it("never suspends the organization's only admin, even for a platform admin", async () => {
    db.docs.set("orgs/o3", { name: "Reed School", status: "active", memberCount: 1 });
    person("c1", "orgAdmin", "o3"); // a username login, so the organization manages it
    expect(await refusal(run(members.setMemberSuspended, "root", { orgId: "o3", uid: "c1", suspended: true }))).toBe("last-admin");
    expect(account("c1").disabled).toBeUndefined();
  });
  it("an account a platform admin suspended is not the organization's to restore, or to suspend again and then restore", async () => {
    db.docs.set("users/s1", { ...user("s1"), suspended: { at: 1, by: "root", reason: "abuse" } });
    account("s1").disabled = true;
    expect(await refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s1", suspended: false }))).toBe("platform-suspended");
    expect(await refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s1", suspended: true }))).toBe("platform-suspended");
    expect(account("s1").disabled).toBe(true);
    expect(user("s1").suspended).toEqual({ at: 1, by: "root", reason: "abuse" });
    // Nor one another organization suspended, and restoring someone who isn't suspended switches nothing on.
    db.docs.set("users/s2", { ...user("s2"), suspended: { at: 1, by: "b1", reason: "", byOrg: "o2" } });
    expect(await refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s2", suspended: false }))).toBe("platform-suspended");
    person("s4", "student", "o1");
    account("s4").disabled = true; // an account being deleted is switched off without the profile saying "suspended"
    expect(await refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "s4", suspended: false }))).toBe("not-suspended");
    expect(account("s4").disabled).toBe(true);
  });
  it("a profile with no Auth account is refused before anything is written", async () => {
    db.docs.set("users/ghost", { name: "Ghost", email: `ghost@${DOMAIN}`, role: "student", orgId: "o1" });
    expect(await refusal(run(members.setMemberSuspended, "a1", { orgId: "o1", uid: "ghost", suspended: true }))).toBe("no-account");
    expect("suspended" in user("ghost")).toBe(false);
  });
});

describe("bulkMembers", () => {
  type Rows = { results: { uid: string; ok: boolean; reason?: string; login?: string; password?: string }[] };
  const bulk = (uid: string, data: Data) => run<Rows>(members.bulkMembers, uid, { orgId: "o1", ...data });

  it("refuses a bad request as a whole: nobody or too many people, an unknown action, a role nobody gives", async () => {
    expect(await refusal(bulk("a1", { uids: [], action: "remove" }))).toBe("bad-uids");
    expect(await refusal(bulk("a1", { action: "remove" }))).toBe("bad-uids");
    expect(await refusal(bulk("a1", { uids: ["s1", 7], action: "remove" }))).toBe("bad-uids");
    expect(await refusal(bulk("a1", { uids: ["s1", "x/y"], action: "remove" }))).toBe("bad-uids");
    expect(await refusal(bulk("a1", { uids: Array.from({ length: 201 }, (_, i) => `u${i}`), action: "remove" }))).toBe("too-many");
    expect(await refusal(bulk("a1", { uids: ["s1"], action: "delete" }))).toBe("bad-action");
    expect(await refusal(bulk("a1", { uids: ["s1"] }))).toBe("bad-action");
    for (const role of ["learner", "superadmin", undefined]) expect(await refusal(bulk("a1", { uids: ["s1"], action: "setRole", role }))).toBe("bad-role");
    expect(user("s1")).toMatchObject({ role: "student", orgId: "o1" });
    expect(audits).toEqual([]);
  });

  it("removes three people, reports the outsider on its own row, and records who was removed", async () => {
    const { results } = await bulk("a1", { uids: ["t1", "x1", "s1", "s3"], action: "remove" });
    expect(results).toEqual([{ uid: "t1", ok: true }, { uid: "x1", ok: false, reason: "not-member" }, { uid: "s1", ok: true }, { uid: "s3", ok: true }]);
    for (const uid of ["t1", "s1", "s3"]) {
      expect(user(uid)).toMatchObject({ role: "learner", orgId: null, teacherId: null, group: null });
      expect(account(uid).customClaims).toEqual({ role: "learner", orgId: null });
    }
    expect(user("x1")).toMatchObject({ role: "student", orgId: "o2" });
    expect((db.docs.get("orgs/o1") as Data).memberCount).toBe(2);
    expect((db.docs.get("orgs/o2") as Data).memberCount).toBe(2);
    const removed = (db.docs.get("orgs/o1/private/removed") as { uids: Record<string, { at: number; name: string }> }).uids;
    expect(Object.keys(removed).sort()).toEqual(["s1", "s3", "t1"]);
    expect(removed.s1).toEqual({ at: expect.any(Number), name: "Name s1" });
    // `op`, not `action`: the audit log's own `action` is the callable's name.
    expect(audits).toEqual([{ action: "bulkMembers", by: "a1", orgId: "o1", op: "remove", ok: 3, refused: 1, uids: ["t1", "s1", "s3"] }]);
  });

  it("the removed list keeps the people removed before", async () => {
    db.docs.set("orgs/o1/private/removed", { uids: { old: { at: 5, name: "Old" } } });
    await bulk("a1", { uids: ["s3"], action: "remove" });
    expect(Object.keys((db.docs.get("orgs/o1/private/removed") as { uids: Data }).uids).sort()).toEqual(["old", "s3"]);
  });

  it("never acts on the caller: each action says so on their row and does the rest", async () => {
    person("a2", "orgAdmin", "o1"); // so the caller is not the only admin: only "self" stops these
    for (const [action, reason, more] of [["remove", "self-remove", {}], ["suspend", "self-suspend", {}], ["restore", "self-suspend", {}], ["resetPassword", "self-password", {}], ["setRole", "self-role", { role: "student" }]] as const) {
      const { results } = await bulk("a1", { uids: ["a1"], action, ...more });
      expect(results, action).toEqual([{ uid: "a1", ok: false, reason }]);
    }
    expect(user("a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
  });

  it("the same person named twice is acted on once", async () => {
    const { results } = await bulk("a1", { uids: ["s3", "s3"], action: "remove" });
    expect(results).toEqual([{ uid: "s3", ok: true }]);
    expect((db.docs.get("orgs/o1") as Data).memberCount).toBe(4);
  });

  it("an organization keeps an admin: two admins chosen together are not both removed, demoted or suspended", async () => {
    for (const [action, more] of [["remove", {}], ["setRole", { role: "teacher" }], ["suspend", {}]] as const) {
      person("a1", "orgAdmin", "o1"); person("a2", "orgAdmin", "o1"); // username logins, so they can be suspended too
      const { results } = await run<Rows>(members.bulkMembers, "root", { orgId: "o1", uids: ["a1", "a2", "s3"], action, ...more });
      expect(results.slice(0, 2), action).toEqual([{ uid: "a1", ok: true }, { uid: "a2", ok: false, reason: "last-admin" }]);
      expect(user("a2"), action).toMatchObject({ role: "orgAdmin", orgId: "o1" });
      expect(account("a2").disabled, action).toBeUndefined();
    }
  });

  it("resetPassword: a new password for a username login only, and it must be changed at the next sign-in", async () => {
    account("s2").email = "s2@nile.example";
    person("g1", "student", "o1"); account("g1").providerData = [{ providerId: "password" }, { providerId: "google.com" }];
    const t0 = Date.now();
    const { results } = await bulk("a1", { uids: ["s1", "s3", "s2", "g1", "x1"], action: "resetPassword", passwordLength: 12 });
    expect(results[0]).toEqual({ uid: "s1", ok: true, login: "s1", password: expect.any(String) });
    expect(results[0].password).toHaveLength(12);
    expect(account("s1").password).toBe(results[0].password);
    expect(user("s1").mustChangePassword).toBe(true);
    expect(user("s1").passwordSetAt as number).toBeGreaterThanOrEqual(t0);
    expect(results.slice(1)).toEqual([
      { uid: "s3", ok: false, reason: "own-login" }, { uid: "s2", ok: false, reason: "own-login" },
      { uid: "g1", ok: false, reason: "own-login" }, { uid: "x1", ok: false, reason: "not-member" },
    ]);
    for (const uid of ["s3", "s2", "g1", "x1"]) { expect(account(uid).password).toBeUndefined(); expect(user(uid).mustChangePassword).toBeUndefined(); }
    // The audit log says whose password was reset, never what to.
    expect(audits).toEqual([{ action: "bulkMembers", by: "a1", orgId: "o1", op: "resetPassword", ok: 1, refused: 4, uids: ["s1"] }]);
    expect(JSON.stringify(audits)).not.toContain(results[0].password);
  });

  it("suspend and restore: managed logins only, and a platform admin's suspension stays on its row", async () => {
    const first = await bulk("a1", { uids: ["s1", "s2", "s3"], action: "suspend", reason: "Term ended" });
    expect(first.results).toEqual([{ uid: "s1", ok: true }, { uid: "s2", ok: true }, { uid: "s3", ok: false, reason: "own-login" }]);
    expect(account("s1").disabled).toBe(true);
    expect(user("s2").suspended).toMatchObject({ by: "a1", reason: "Term ended", byOrg: "o1" });
    expect(audits.at(-1)).toMatchObject({ action: "bulkMembers", op: "suspend", ok: 2, refused: 1, uids: ["s1", "s2"], reason: "Term ended" });
    db.docs.set("users/s2", { ...user("s2"), suspended: { at: 1, by: "root", reason: "abuse" } }); // a platform admin's, since
    const back = await bulk("a1", { uids: ["s1", "s2", "s3"], action: "restore" });
    expect(back.results).toEqual([{ uid: "s1", ok: true }, { uid: "s2", ok: false, reason: "platform-suspended" }, { uid: "s3", ok: false, reason: "not-suspended" }]);
    expect(account("s1").disabled).toBe(false);
    expect(account("s2").disabled).toBe(true);
  });

  it("setRole: students become teachers; a teacher made a student loses their pupils; the same role writes nothing", async () => {
    const up = await bulk("a1", { uids: ["s1", "s3", "t1"], action: "setRole", role: "teacher" });
    expect(up.results.every((r) => r.ok)).toBe(true);
    expect(user("s1")).toMatchObject({ role: "teacher", orgId: "o1", group: "5A" }); // same organization: the class stays
    expect(account("s3").customClaims).toEqual({ role: "teacher", orgId: "o1" });
    expect("claimsUpdatedAt" in user("t1")).toBe(false);
    expect((db.docs.get("orgs/o1") as Data).memberCount).toBe(5);
    db.docs.set("users/s2", { ...user("s2"), teacherId: "t1" });
    await bulk("a1", { uids: ["t1"], action: "setRole", role: "student" });
    expect(user("t1").role).toBe("student");
    expect(user("s2").teacherId).toBeNull();
    expect(audits.at(-1)).toEqual({ action: "bulkMembers", by: "a1", orgId: "o1", op: "setRole", ok: 1, refused: 0, uids: ["t1"], role: "student" });
  });

  it("the removed list is kept to its size like the single path's: the oldest removals are forgotten", async () => {
    // A full list (REMOVED_MAX, 2000) of older removals, the oldest first in time but not in id order.
    const old = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`old${String(1999 - i).padStart(4, "0")}`, { at: 1000 + i, name: "Old" }]));
    db.docs.set("orgs/o1/private/removed", { uids: old });
    await bulk("a1", { uids: ["s1", "s3"], action: "remove" });
    const uids = (db.docs.get("orgs/o1/private/removed") as { uids: Record<string, { at: number }> }).uids;
    expect(Object.keys(uids)).toHaveLength(2000);
    expect(uids).toHaveProperty("s1");
    expect(uids).toHaveProperty("s3");
    // The two oldest (at 1000 and 1001) went; the next one stays.
    expect(uids).not.toHaveProperty("old1999");
    expect(uids).not.toHaveProperty("old1998");
    expect(uids).toHaveProperty("old1997");
  });

  it("removing someone the organization suspended gives their sign-in back; a platform admin's suspension stays", async () => {
    await bulk("a1", { uids: ["s1"], action: "suspend", reason: "Term ended" });
    db.docs.set("users/s2", { ...user("s2"), suspended: { at: 1, by: "root", reason: "abuse" } });
    account("s2").disabled = true;
    const { results } = await bulk("a1", { uids: ["s1", "s2"], action: "remove" });
    expect(results).toEqual([{ uid: "s1", ok: true }, { uid: "s2", ok: true }]);
    expect(account("s1").disabled).toBe(false);
    expect(user("s1")).toMatchObject({ role: "learner", orgId: null });
    expect(user("s1")).not.toHaveProperty("suspended");
    expect(account("s2").disabled).toBe(true);
    expect(user("s2")).toMatchObject({ role: "learner", orgId: null, suspended: { by: "root", reason: "abuse" } });
  });

  it("one person's unexpected failure is their row's, not the call's", async () => {
    db.failOn = (w) => w.path === "users/s1" && w.op === "set";
    const { results } = await bulk("a1", { uids: ["s1", "s3"], action: "remove" });
    expect(results).toEqual([{ uid: "s1", ok: false, reason: "failed" }, { uid: "s3", ok: true }]);
    expect(Object.keys((db.docs.get("orgs/o1/private/removed") as { uids: Data }).uids)).toEqual(["s3"]);
  });
});

describe("updateMembers", () => {
  const update = (uid: string, uids: unknown, patch: unknown) => run<{ updated: number }>(members.updateMembers, uid, { orgId: "o1", uids, patch });

  it("sets a class for everyone chosen, skips people of other organizations, and writes an audit entry", async () => {
    expect(await update("a1", ["s1", "s2", "x1", "nobody"], { group: "  6   B " })).toEqual({ updated: 2 });
    expect(user("s1").group).toBe("6 B");
    expect(user("s2").group).toBe("6 B");
    expect(user("x1").group).toBeUndefined();
    expect(db.docs.has("users/nobody")).toBe(false);
    expect(audits).toEqual([{ action: "updateMembers", by: "a1", orgId: "o1", patch: { group: "6 B" }, updated: 2, uids: ["s1", "s2"] }]);
    await update("a1", ["s1"], { group: null });
    expect(user("s1").group).toBeNull();
  });
  it("refuses a teacher of another organization, a student as a teacher, and an id that is nobody's", async () => {
    for (const teacherId of ["b1", "s3", "nobody", "a/b"]) expect(await refusal(update("a1", ["s2"], { teacherId })), teacherId).toBe("bad-teacher");
    expect(user("s2").teacherId).toBeUndefined();
    expect(audits).toEqual([]);
  });
  it("gives a teacher to students only: never to a teacher or an admin, and an admin can be the teacher", async () => {
    person("t2", "teacher", "o1", { email: "t2@nile.example" });
    expect(await update("a1", ["s1", "s2", "t2", "a1"], { teacherId: "t2" })).toEqual({ updated: 2 });
    expect(user("s1").teacherId).toBe("t2");
    expect(user("s2").teacherId).toBe("t2");
    expect(user("t2").teacherId).toBeUndefined();
    expect(user("a1").teacherId).toBeUndefined();
    expect(await update("a1", ["s1"], { teacherId: "a1" })).toEqual({ updated: 1 });
    expect(user("s1").teacherId).toBe("a1");
    expect(await update("a1", ["s1", "s2"], { teacherId: null })).toEqual({ updated: 2 });
    expect(user("s1").teacherId).toBeNull();
  });
  it("a name is for exactly one person, 1 to 120 characters", async () => {
    expect(await refusal(update("a1", ["s1", "s2"], { name: "Mona" }))).toBe("name-one");
    expect(await refusal(update("a1", ["s1"], { name: "   " }))).toBe("bad-name");
    expect(await refusal(update("a1", ["s1"], { name: "x".repeat(121) }))).toBe("bad-name");
    expect(await update("a1", ["s1"], { name: " Mona Adel " })).toEqual({ updated: 1 });
    expect(user("s1").name).toBe("Mona Adel");
  });
  it("refuses an empty edit, an unknown field, a class that is too long, and no people", async () => {
    expect(await refusal(update("a1", ["s1"], {}))).toBe("bad-patch");
    expect(await refusal(update("a1", ["s1"], undefined))).toBe("bad-patch");
    expect(await refusal(update("a1", ["s1"], { role: "orgAdmin" }))).toBe("bad-patch");
    expect(await refusal(update("a1", ["s1"], { group: "5A", orgId: "o2" }))).toBe("bad-patch");
    expect(await refusal(update("a1", ["s1"], { group: "x".repeat(61) }))).toBe("bad-group");
    expect(await refusal(update("a1", ["s1"], { group: 5 }))).toBe("bad-group");
    expect(await refusal(update("a1", [], { group: "5A" }))).toBe("bad-uids");
    expect(await refusal(update("a1", Array.from({ length: 201 }, (_, i) => `u${i}`), { group: "5A" }))).toBe("too-many");
    expect(user("s1")).toMatchObject({ role: "student", orgId: "o1", group: "5A" });
  });
  it("a value someone already has is counted but not written again", async () => {
    db.writes.length = 0;
    expect(await update("a1", ["s1", "s2"], { group: "5A" })).toEqual({ updated: 2 });
    expect(db.writes.map((w) => w.path)).toEqual(["users/s2"]);
  });
});

describe("listMembers", () => {
  type Page = { members: (Data & { uid: string; summary?: Data })[]; next: string | null };
  const SUMMARY = {
    lessonsDone: 12, graded: 10, xp: 340, avgAccuracy: 0.8, lastActive: "2026-11-01", lastLessonAt: "2026-11-01T10:00:00.000Z",
    competencies: { "ai.1": 3, "ai.2": 0 }, compAcc: { "ai.1": 2.4 }, units: { "ai-4-1": 4 }, tracks: { ai: { n: 12, acc: 8, sec: 900, g: 10 } }, weeks: { "2026-W44": 5 }, seconds: 900,
  };
  beforeEach(() => {
    db.docs.set("users/s1", {
      ...user("s1"), summary: SUMMARY, projectsWaiting: 2, superSeat: true, active: true, mustChangePassword: true, lastActive: "2026-11-02T08:00:00.000Z", createdAt: 1762000000000,
      notify: { hour: 18, tz: "Africa/Cairo" }, levels: { ai: 2 }, tracks: ["ai"], devices: ["d1"], lang: "ar", plan: "super", passwordSetAt: 5,
    });
  });

  it("pages by account id: a limit of 2 over 5 members gives 2, 2, 1 and no next", async () => {
    const seen: string[] = [];
    let after: string | null = null, sizes = "";
    for (let i = 0; i < 5; i++) {
      const page: Page = await run<Page>(members.listMembers, "a1", { orgId: "o1", limit: 2, ...(after ? { after } : {}) });
      seen.push(...page.members.map((m) => m.uid)); sizes += page.members.length;
      after = page.next;
      if (!after) break;
    }
    expect(sizes).toBe("221");
    expect(seen).toEqual(["a1", "s1", "s2", "s3", "t1"]);
    // A last page that is exactly full says "next", and the page after it is empty.
    const full = await run<Page>(members.listMembers, "a1", { orgId: "o1", limit: 5 });
    expect(full.next).toBe("t1");
    expect(await run<Page>(members.listMembers, "a1", { orgId: "o1", limit: 5, after: "t1" })).toEqual({ members: [], next: null });
    expect(await refusal(run(members.listMembers, "a1", { orgId: "o1", view: "everything" }))).toBe("bad-view");
    expect(await refusal(run(members.listMembers, "a1", { orgId: "o1", after: "a/b" }))).toBe("bad-after");
    expect(audits).toEqual([]);
  });

  it("a list row holds the named fields and a lean summary: never notify, levels, tracks, devices or a whole summary", async () => {
    const { members: rows } = await run<Page>(members.listMembers, "a1", { orgId: "o1" });
    expect(rows).toHaveLength(5);
    expect(rows.find((m) => m.uid === "s1")).toEqual({
      uid: "s1", name: "Name s1", email: `s1@${DOMAIN}`, username: "s1", role: "student", group: "5A", teacherId: "t1", projectsWaiting: 2, superSeat: true,
      active: true, mustChangePassword: true, managed: true, suspended: false, lastActive: "2026-11-02T08:00:00.000Z", createdAt: 1762000000000,
      summary: { lessonsDone: 12, graded: 10, xp: 340, avgAccuracy: 0.8, lastActive: "2026-11-01", competencies: { "ai.1": 1 } },
    });
    for (const m of rows) for (const k of ["notify", "levels", "tracks", "devices", "lang", "plan", "passwordSetAt", "managedBy", "createdBy"]) expect(k in m, `${m.uid}.${k}`).toBe(false);
    // Who is managed, and a person with nothing learnt yet.
    expect(Object.fromEntries(rows.map((m) => [m.uid, m.managed]))).toEqual({ a1: false, s1: true, s2: true, s3: false, t1: false });
    expect(rows.find((m) => m.uid === "s3")).toEqual({
      uid: "s3", name: "Name s3", email: "s3@gmail.example", username: null, role: "student", group: null, teacherId: "t1", projectsWaiting: 0, superSeat: false,
      active: true, mustChangePassword: false, managed: false, suspended: false, lastActive: null, createdAt: null,
    });
  });

  it("a profile with no name is '' and a suspended one says so", async () => {
    const { name: _, ...nameless } = user("s2");
    db.docs.set("users/s2", { ...nameless, suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    const { members: rows } = await run<Page>(members.listMembers, "a1", { orgId: "o1" });
    expect(rows.find((m) => m.uid === "s2")).toMatchObject({ name: "", suspended: true });
  });

  it("the report view returns the whole summary, and still nothing else", async () => {
    const { members: rows } = await run<Page>(members.listMembers, "root", { orgId: "o1", view: "report" });
    const s1 = rows.find((m) => m.uid === "s1")!;
    expect(s1.summary).toEqual(SUMMARY);
    for (const k of ["notify", "levels", "tracks", "devices"]) expect(k in s1).toBe(false);
    expect("summary" in rows.find((m) => m.uid === "s3")!).toBe(false);
  });
});

describe("listMembers' time limit", () => {
  it("is 120 s, as long as the app waits for it (firebase.ts)", () => {
    expect((members.listMembers as unknown as { __endpoint: { timeoutSeconds?: number } }).__endpoint.timeoutSeconds).toBe(120);
  });
});

describe("the removed list's size (withRemovedAll)", () => {
  it("adds every removal and keeps the newest `max`, whatever order they come in", () => {
    expect(withRemovedAll(undefined, { a: { at: 1 }, b: { at: 2 } })).toEqual({ a: { at: 1 }, b: { at: 2 } });
    expect(withRemovedAll({ x: { at: 5 }, y: { at: 1 } }, { a: { at: 9, name: "A" }, b: { at: 3 } }, 3)).toEqual({ x: { at: 5 }, a: { at: 9, name: "A" }, b: { at: 3 } });
    // Someone removed again is one entry, with the newer time.
    expect(withRemovedAll({ a: { at: 1 } }, { a: { at: 7 } }, 3)).toEqual({ a: { at: 7 } });
  });
});

describe("the pure parts (orgMembersCore)", () => {
  it("a managed account: the profile says so, or (before that field) its email is a username login", () => {
    expect(isManaged({ managedBy: "o1", email: "a@school.example" }, "o1", DOMAIN)).toBe(true);
    expect(isManaged({ managedBy: "o2", email: `a@${DOMAIN}` }, "o1", DOMAIN)).toBe(false); // another organization's
    expect(isManaged({ email: `Mona.1@${DOMAIN.toUpperCase()}` }, "o1", DOMAIN)).toBe(true);
    expect(isManaged({ managedBy: null, email: `a@${DOMAIN}` }, "o1", DOMAIN)).toBe(true);
    expect(isManaged({ email: `a@not${DOMAIN}` }, "o1", DOMAIN)).toBe(false);
    expect(isManaged({ email: "a@gmail.example" }, "o1", DOMAIN)).toBe(false);
    expect(isManaged({ email: `a@${DOMAIN}` }, null, DOMAIN)).toBe(false);
    expect(isManaged(undefined, "o1", DOMAIN)).toBe(false);
  });
  it("the only admin who can sign in: nobody else, or everybody else suspended", () => {
    expect(onlyWorkingAdmin("a1", [{ id: "a1" }])).toBe(true);
    expect(onlyWorkingAdmin("a1", [])).toBe(true);
    expect(onlyWorkingAdmin("a1", [{ id: "a1" }, { id: "a2", suspended: { at: 1 } }])).toBe(true);
    expect(onlyWorkingAdmin("a1", [{ id: "a1" }, { id: "a2", suspended: { at: 1 } }, { id: "a3" }])).toBe(false);
    expect(onlyWorkingAdmin("a1", [{ id: "a1", suspended: { at: 1 } }, { id: "a2" }])).toBe(false);
  });
  it("the people a call names: 1 to 200 ids, each once", () => {
    expect(uidList(["a", "b", "a"])).toEqual({ uids: ["a", "b"] });
    expect(uidList(Array.from({ length: 200 }, (_, i) => `u${i}`))).toMatchObject({ uids: expect.any(Array) });
    expect(uidList(Array.from({ length: 201 }, () => "same"))).toEqual({ reason: "too-many" });
    for (const bad of [undefined, null, "a", [], [""], [" a"], ["a/b"], [1], ["x".repeat(129)], ["."], [".."], ["__name__"]]) expect(uidList(bad), JSON.stringify(bad)).toEqual({ reason: "bad-uids" });
  });
  it("page sizes: 1000 by default, 2000 at most", () => {
    expect([undefined, null, "x", 0, -5, NaN].map(pageLimit)).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
    expect([1, 2.9, "50", 2000, 2001, 1e9].map(pageLimit)).toEqual([1, 2, 50, 2000, 2000, 2000]);
  });
  it("an edit, checked", () => {
    expect(memberPatch({ group: " 5  A ", teacherId: "t1" }, 3)).toEqual({ patch: { group: "5 A", teacherId: "t1" } });
    expect(memberPatch({ group: "  ", teacherId: "" }, 3)).toEqual({ patch: { group: null, teacherId: null } });
    expect(memberPatch({ group: "x".repeat(60) }, 1)).toMatchObject({ patch: {} });
    expect(memberPatch({ name: "Mona", group: undefined }, 1)).toEqual({ patch: { name: "Mona" } });
    expect(memberPatch({ name: "Mona" }, 2)).toEqual({ reason: "name-one" });
    expect(memberPatch({ teacherId: 5 }, 1)).toEqual({ reason: "bad-teacher" });
    for (const bad of [null, "x", [], {}, { active: false }]) expect(memberPatch(bad, 1), JSON.stringify(bad)).toEqual({ reason: "bad-patch" });
  });
  it("what an edit changes for one person", () => {
    const patch = { group: "5A", teacherId: "t1" };
    expect(patchFor(patch, { role: "student", group: "5A", teacherId: null })).toEqual({ applies: true, write: { teacherId: "t1" } });
    expect(patchFor(patch, { role: "teacher" })).toEqual({ applies: true, write: { group: "5A" } });
    expect(patchFor({ teacherId: "t1" }, { role: "teacher" })).toEqual({ applies: false, write: {} });
    expect(patchFor({ teacherId: null }, { role: "student" })).toEqual({ applies: true, write: {} });
    expect(patchFor({ name: "Mona" }, { role: "orgAdmin", name: "Mona" })).toEqual({ applies: true, write: {} });
  });
  it("a lean summary keeps `graded` out when the summary has none (screens then count lessonsDone)", () => {
    expect(leanSummary({ lessonsDone: 3, xp: 30, avgAccuracy: 0.5, lastActive: null, competencies: { a: 2, b: 0, c: "x" } }))
      .toEqual({ lessonsDone: 3, xp: 30, avgAccuracy: 0.5, lastActive: null, competencies: { a: 1 } });
    expect(leanSummary({})).toEqual({ lessonsDone: 0, xp: 0, avgAccuracy: 0, lastActive: null, competencies: {} });
    expect(leanSummary(undefined)).toBeUndefined();
  });
  it("times leave as milliseconds, never as Firestore Timestamps, in a row and inside a report's summary", () => {
    const stamp = (n: number) => ({ toMillis: () => n, seconds: n / 1000, nanoseconds: 0 });
    const row = memberRow("u1", { createdAt: stamp(1700000000000), lastActive: stamp(1700000005000), summary: { lessonsDone: 1, at: stamp(7), deep: [{ at: stamp(8) }] } }, "o1", "report", DOMAIN);
    expect(row.createdAt).toBe(1700000000000);
    expect(row.lastActive).toBe(1700000005000);
    expect(row.summary).toEqual({ lessonsDone: 1, at: 7, deep: [{ at: 8 }] });
    expect(memberRow("u2", undefined, "o1", "list", DOMAIN)).toMatchObject({ uid: "u2", name: "", role: "learner", createdAt: null, lastActive: null });
  });
  it("the list asks Firestore for no field a row doesn't hold", () => {
    for (const view of ["list", "report"] as const) for (const f of ["notify", "levels", "tracks", "devices", "lang"]) expect(selectFor(view)).not.toContain(f);
    expect(selectFor("list")).not.toContain("summary");
    expect(selectFor("report")).toContain("summary");
  });
});
