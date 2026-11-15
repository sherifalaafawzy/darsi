// An organization's life (platform.ts, TECHNICAL.md): power goes before the profile says so,
// suspending freezes the staff and nobody else, a platform admin is made only after a fresh sign-in, and deleting a
// large organization finishes across calls, keeps it closed meanwhile and never hides what it left behind.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMock, FakeBucket } from "./orgFakes";

const billing = vi.hoisted(() => ({ writeClaims: vi.fn(), refreshClaims: vi.fn() }));
vi.mock("../src/admin.js", async () => (await import("./orgFakes")).adminMock());
vi.mock("../src/billing.js", () => billing);
vi.mock("../src/storage.js", async () => { const b = new (await import("./orgFakes")).FakeBucket(); return { bucket: () => b }; });

const { db, auth, audits } = (await import("../src/admin.js")) as unknown as AdminMock;
const files = ((await import("../src/storage.js")) as unknown as { bucket: () => FakeBucket }).bucket();
const platform = await import("../src/platform");
type Run = { run: (req: unknown) => Promise<Record<string, unknown>> };
const updateOrg = platform.updateOrg as unknown as Run, deleteOrg = platform.deleteOrg as unknown as Run, setUserRole = platform.setUserRole as unknown as Run;

const now = () => Math.floor(Date.now() / 1000);
/** The platform admin, signed in just now unless a test says when. */
const asSuper = (data: Record<string, unknown>, authTime: number | undefined = now()) => ({ auth: { uid: "root", token: { auth_time: authTime } }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");
const user = (id: string) => db.docs.get(`users/${id}`);
const member = (id: string, role: string, orgId: string | null, more: Record<string, unknown> = {}) => {
  db.docs.set(`users/${id}`, { role, orgId, ...more });
  auth.users.set(id, { uid: id, customClaims: { role, ...(orgId ? { orgId } : {}) } });
};

beforeEach(() => {
  db.docs.clear(); db.writes.length = 0; db.onQuery = null; auth.users.clear(); audits.length = 0;
  files.files.clear(); files.deleted.length = 0; files.failDelete = null;
  billing.writeClaims.mockReset().mockResolvedValue(null);
  billing.refreshClaims.mockReset().mockResolvedValue(null);
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 3 });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 0 });
  member("a1", "orgAdmin", "o1"); member("t1", "teacher", "o1"); member("s1", "student", "o1");
});
afterEach(() => { vi.useRealTimers(); });

describe("assign: claims and profile, in the order that never leaves power behind", () => {
  /** What the profile said at the moment the claims were written. */
  const seen = (uid: string) => { const at: unknown[] = []; billing.writeClaims.mockImplementation(async () => { at.push({ ...user(uid) }); return null; }); return at; };

  it("fails closed: someone the organization suspended keeps the suspension when moving them out fails", async () => {
    const suspended = { at: 1, by: "a1", reason: "", byOrg: "o1" };
    member("s1", "student", "o1", { suspended });
    auth.users.get("s1")!.disabled = true;
    // The claims can't be written: the suspension is whole, and nothing moved.
    billing.writeClaims.mockRejectedValueOnce(new Error("auth down"));
    await expect(setUserRole.run(asSuper({ uid: "s1", role: "learner" }))).rejects.toThrow("auth down");
    expect(auth.users.get("s1")!.disabled).toBe(true);
    expect(user("s1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    // The claims are written but Auth can't lift it: still locked, the profile still names the organization.
    const enable = vi.spyOn(auth, "updateUser").mockRejectedValueOnce(Object.assign(new Error("auth busy"), { code: "auth/internal-error" }));
    await expect(setUserRole.run(asSuper({ uid: "s1", role: "learner" }))).rejects.toThrow("auth busy");
    expect(billing.writeClaims).toHaveBeenLastCalledWith("s1", "learner", null);
    expect(auth.users.get("s1")!.disabled).toBe(true);
    expect(user("s1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
    expect(audits).toEqual([]);
    enable.mockRestore();
    // The repeat finishes it; the suspension goes only after the claims were written.
    const order: string[] = [];
    billing.writeClaims.mockImplementation(async () => { order.push(`claims:${auth.users.get("s1")!.disabled}`); return null; });
    expect(await setUserRole.run(asSuper({ uid: "s1", role: "learner" }))).toEqual({ ok: true });
    expect(order).toEqual(["claims:true"]);
    expect(auth.users.get("s1")!.disabled).toBe(false);
    expect(user("s1")).toMatchObject({ role: "learner", orgId: null });
    expect(user("s1")).not.toHaveProperty("suspended");
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    // A platform admin's own suspension is about the account: it stays through a move.
    member("t1", "teacher", "o1", { suspended: { at: 1, by: "root", reason: "abuse" } });
    auth.users.get("t1")!.disabled = true;
    await setUserRole.run(asSuper({ uid: "t1", role: "learner" }));
    expect(auth.users.get("t1")!.disabled).toBe(true);
    expect(user("t1")).toMatchObject({ role: "learner", orgId: null, suspended: { by: "root" } });
  });

  it("a demotion writes the claims first", async () => {
    const at = seen("t1");
    await platform.assign("t1", "learner", null);
    expect(billing.writeClaims).toHaveBeenCalledWith("t1", "learner", null);
    expect(at).toEqual([expect.objectContaining({ role: "teacher", orgId: "o1" })]); // the profile had not changed yet
    expect(user("t1")).toMatchObject({ role: "learner", orgId: null, teacherId: null, group: null, superSeat: false });
  });

  it("so does a move to another organization, at the same role", async () => {
    const at = seen("t1");
    await platform.assign("t1", "teacher", "o2");
    expect(at).toEqual([expect.objectContaining({ orgId: "o1" })]);
    expect(user("t1")).toMatchObject({ role: "teacher", orgId: "o2" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 2 });
    expect(db.docs.get("orgs/o2")).toMatchObject({ memberCount: 1 });
  });

  it("a promotion writes the profile first, as before", async () => {
    const at = seen("s1");
    expect(await platform.assign("s1", "teacher", "o1")).toEqual({ before: "o1", roleBefore: "student" });
    expect(at).toEqual([expect.objectContaining({ role: "teacher", orgId: "o1" })]); // the profile already said teacher
  });

  it("a demotion whose claims write fails changes nothing the admin sees", async () => {
    billing.writeClaims.mockRejectedValue(new Error("auth down"));
    await expect(platform.assign("t1", "learner", null)).rejects.toThrow("auth down");
    expect(user("t1")).toMatchObject({ role: "teacher", orgId: "o1" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ memberCount: 3 });
  });
});

describe("suspending and resuming an organization", () => {
  it("suspends: the status and why, fresh claims for teachers and admins only, and an audit entry", async () => {
    const statusAt: unknown[] = [];
    billing.refreshClaims.mockImplementation(async () => { statusAt.push(db.docs.get("orgs/o1")?.status); return null; });
    const out = await updateOrg.run(asSuper({ orgId: "o1", status: "suspended", reason: "  Fees unpaid since March  " }));
    expect(out).toMatchObject({ ok: true, staff: 2, failed: 0 });
    // Members read the organization's document: it says since when, nothing more. Who and why are the platform's note.
    expect(db.docs.get("orgs/o1")).toMatchObject({ status: "suspended", suspended: { at: expect.anything() } }); // (the fake leaves a nested server time as its sentinel)
    expect(Object.keys(db.docs.get("orgs/o1")!.suspended as object)).toEqual(["at"]);
    expect(db.docs.get("orgs/o1/private/suspension")).toMatchObject({ by: "root", reason: "Fees unpaid since March" });
    expect(billing.refreshClaims.mock.calls.map((c) => c[0]).sort()).toEqual(["a1", "t1"]); // never the student
    expect(statusAt).toEqual(["suspended", "suspended"]); // the status was there for writeClaims to read
    expect(billing.writeClaims).not.toHaveBeenCalled(); // nobody's role or organization is rewritten
    expect(audits).toEqual([expect.objectContaining({ action: "suspendOrg", by: "root", orgId: "o1", reason: "Fees unpaid since March", status: "suspended" })]);
    expect(user("s1")).toMatchObject({ role: "student", orgId: "o1" });
  });

  it("resumes: the status back, the reason gone, the staff refreshed again", async () => {
    await updateOrg.run(asSuper({ orgId: "o1", status: "suspended", reason: "x" }));
    billing.refreshClaims.mockClear(); audits.length = 0;
    await updateOrg.run(asSuper({ orgId: "o1", status: "active" }));
    const org = db.docs.get("orgs/o1")!;
    expect(org.status).toBe("active");
    expect("suspended" in org).toBe(false);
    expect(db.docs.has("orgs/o1/private/suspension")).toBe(false);
    expect(billing.refreshClaims.mock.calls.map((c) => c[0]).sort()).toEqual(["a1", "t1"]);
    expect(audits).toEqual([expect.objectContaining({ action: "resumeOrg", orgId: "o1" })]);
  });

  it("reports an account whose claims could not be refreshed, and a repeat tries again without restamping", async () => {
    billing.refreshClaims.mockImplementation(async (uid: string) => { if (uid === "t1") throw new Error("auth busy"); return null; });
    expect(await updateOrg.run(asSuper({ orgId: "o1", status: "suspended", reason: "first" }))).toMatchObject({ staff: 2, failed: 1 });
    expect(db.docs.get("orgs/o1")).toMatchObject({ status: "suspended" });
    billing.refreshClaims.mockReset().mockResolvedValue(null); audits.length = 0;
    auth.users.set("root2", { uid: "root2", customClaims: { role: "superadmin" } });
    expect(await updateOrg.run({ auth: { uid: "root2", token: {} }, data: { orgId: "o1", status: "suspended", reason: "second" } })).toMatchObject({ staff: 2, failed: 0 });
    expect(db.docs.get("orgs/o1/private/suspension")).toMatchObject({ by: "root", reason: "first" });
    expect(audits.map((a) => a.action)).toEqual(["updateOrg"]);
  });

  it("keeps a reason to 500 characters", async () => {
    await updateOrg.run(asSuper({ orgId: "o1", status: "suspended", reason: "r".repeat(700) }));
    expect((db.docs.get("orgs/o1/private/suspension")!.reason as string)).toHaveLength(500);
  });

  it("refuses every other way in or out of suspended", async () => {
    db.docs.set("orgs/rej", { name: "Closed", status: "rejected" });
    db.docs.set("orgs/pen", { name: "Asked", status: "pending" });
    db.docs.set("orgs/sus", { name: "Paused", status: "suspended", suspended: { by: "root", reason: "", at: 1 } });
    db.docs.set("orgs/del", { name: "Going", status: "deleting" });
    expect(await refusal(updateOrg.run(asSuper({ orgId: "rej", status: "suspended" })))).toBe("bad-status");
    expect(await refusal(updateOrg.run(asSuper({ orgId: "pen", status: "suspended" })))).toBe("bad-status");
    expect(await refusal(updateOrg.run(asSuper({ orgId: "sus", status: "rejected" })))).toBe("bad-status");
    expect(await refusal(updateOrg.run(asSuper({ orgId: "del", status: "active" })))).toBe("bad-status");
    expect(await refusal(updateOrg.run(asSuper({ orgId: "o1", status: "deleting" })))).toBe("bad-status");
    expect(await refusal(updateOrg.run(asSuper({ orgId: "o1", status: "closed" })))).toBe("bad-status");
    expect(db.docs.get("orgs/rej")).toEqual({ name: "Closed", status: "rejected" });
    expect(db.docs.get("orgs/sus")).toMatchObject({ status: "suspended" });
    expect(db.docs.get("orgs/del")).toEqual({ name: "Going", status: "deleting" });
    expect(billing.refreshClaims).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  it("still edits details and still rejects or approves, without touching anyone's claims", async () => {
    expect(await updateOrg.run(asSuper({ orgId: "o1", name: "Nile Academy", city: "Aswan" }))).toEqual({ ok: true });
    expect(db.docs.get("orgs/o1")).toMatchObject({ name: "Nile Academy", city: "Aswan", status: "active" });
    await updateOrg.run(asSuper({ orgId: "o2", status: "rejected" }));
    expect(db.docs.get("orgs/o2")).toMatchObject({ status: "rejected" });
    await updateOrg.run(asSuper({ orgId: "o2", status: "active" }));
    expect(db.docs.get("orgs/o2")!.status).toBe("active");
    expect(billing.refreshClaims).not.toHaveBeenCalled();
    expect(audits.map((a) => a.action)).toEqual(["updateOrg", "updateOrg", "updateOrg"]);
  });
});

describe("making someone a platform admin", () => {
  it("needs a sign-in in the last ten minutes", async () => {
    expect(await refusal(setUserRole.run(asSuper({ uid: "t1", role: "superadmin" }, now() - 3600)))).toBe("recent-login");
    expect(await refusal(setUserRole.run({ auth: { uid: "root", token: {} }, data: { uid: "t1", role: "superadmin" } }))).toBe("recent-login");
    expect(user("t1")).toMatchObject({ role: "teacher", orgId: "o1" });
    expect(billing.writeClaims).not.toHaveBeenCalled();
    expect(await refusal(setUserRole.run(asSuper({ uid: "t1", role: "superadmin" }, now() - 60)))).toBeNull();
    expect(user("t1")).toMatchObject({ role: "superadmin", orgId: null });
    expect(audits).toEqual([
      expect.objectContaining({ action: "setUserRole", uid: "t1", role: "superadmin", roleBefore: "teacher", before: "o1" }),
      expect.objectContaining({ action: "setUserRole", uid: "t1", orgId: "o1", left: true, roleBefore: "teacher" }), // for the log of the organization they left
    ]);
  });

  it("asks nothing new of any other role change", async () => {
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "teacher", orgId: "o1" }, now() - 86400)))).toBeNull();
    expect(user("s1")).toMatchObject({ role: "teacher", orgId: "o1" });
  });
});

// An organization's admins read the entries that carry its id (audit.ts orgAudit). A removal or a move by a platform
// admin was written with the new organization's id (or none) only, so the organization the person left saw nothing,
// while the same removal by its own admin is in its log.
describe("the audit log of the organization a person left", () => {
  const createOrg = platform.createOrg as unknown as Run;
  const about = (orgId: string | null) => audits.filter((a) => a.orgId === orgId);

  it("a removal or a move by a platform admin is in the log of the organization the person left", async () => {
    // Removed: one entry for the platform's log as before, and one in the organization's.
    await setUserRole.run(asSuper({ uid: "s1", role: "learner" }));
    expect(audits).toEqual([
      { action: "setUserRole", by: "root", uid: "s1", role: "learner", orgId: null, roleBefore: "student", before: "o1" },
      { action: "setUserRole", by: "root", uid: "s1", orgId: "o1", roleBefore: "student", left: true, role: "learner" },
    ]);
    // Moved: each organization's log gets its own entry, and neither names the other organization.
    audits.length = 0;
    await setUserRole.run(asSuper({ uid: "t1", role: "teacher", orgId: "o2" }));
    expect(audits).toEqual([
      { action: "setUserRole", by: "root", uid: "t1", role: "teacher", orgId: "o2", roleBefore: "teacher" },
      { action: "setUserRole", by: "root", uid: "t1", orgId: "o1", roleBefore: "teacher", left: true },
    ]);
    expect(JSON.stringify(about("o2"))).not.toContain("o1");
    expect(JSON.stringify(about("o1"))).not.toContain("o2");
    // A change inside one organization, and someone who joins from none: one entry, as before.
    audits.length = 0;
    member("s2", "student", "o1");
    await setUserRole.run(asSuper({ uid: "s2", role: "teacher", orgId: "o1" }));
    await setUserRole.run(asSuper({ uid: "s1", role: "student", orgId: "o2" }));
    expect(audits).toEqual([
      { action: "setUserRole", by: "root", uid: "s2", role: "teacher", orgId: "o1", roleBefore: "student", before: "o1" },
      { action: "setUserRole", by: "root", uid: "s1", role: "student", orgId: "o2", roleBefore: "learner", before: null },
    ]);
  });

  it("a new organization's first admin who came from another one: that one's log says they left, and the new one's not from where", async () => {
    const { orgId } = (await createOrg.run(asSuper({ name: "New School", adminUid: "t1" }))) as { orgId: string };
    expect(user("t1")).toMatchObject({ role: "orgAdmin", orgId });
    expect(audits).toEqual([
      { action: "createOrg", by: "root", orgId, admin: "t1", adminBefore: { role: "teacher" } },
      { action: "setUserRole", by: "root", uid: "t1", orgId: "o1", roleBefore: "teacher", left: true },
    ]);
    // A first admin from no organization, or none named: the one entry.
    audits.length = 0;
    member("l1", "learner", null);
    const two = (await createOrg.run(asSuper({ name: "Second School", adminUid: "l1" }))) as { orgId: string };
    const three = (await createOrg.run(asSuper({ name: "Third School" }))) as { orgId: string };
    expect(audits).toEqual([
      { action: "createOrg", by: "root", orgId: two.orgId, admin: "l1", adminBefore: { role: "learner" } },
      { action: "createOrg", by: "root", orgId: three.orgId, admin: null },
    ]);
  });
});

describe("deleting an organization", () => {
  const confirm = { orgId: "o1", confirm: "Nile School" };
  /** o1 with `n` students m000… and nobody else; o2 keeps one member, a code and a course of its own. */
  function big(n: number) {
    for (const id of ["a1", "t1", "s1"]) { db.docs.delete(`users/${id}`); auth.users.delete(id); }
    for (let i = 0; i < n; i++) member(`m${String(i).padStart(3, "0")}`, "student", "o1", { email: `m${i}@school.example`, group: "5A", teacherId: "gone" });
    member("x1", "student", "o2");
    db.docs.set("orgs/o1/private/invites", { teacher: "AAAA-AAAA-AAAA", student: "BBBB-BBBB-BBBB" });
    db.docs.set("inviteCodes/AAAA-AAAA-AAAA", { orgId: "o1", role: "teacher" });
    db.docs.set("inviteCodes/BBBB-BBBB-BBBB", { orgId: "o1", role: "student" });
    db.docs.set("inviteCodes/CCCC-CCCC-CCCC", { orgId: "o2", role: "student" });
    db.docs.set("units/o1-course", { owner: "o1" }); db.docs.set("unitDrafts/o1-course", { owner: "o1" });
    db.docs.set("units/o2-course", { owner: "o2" }); db.docs.set("unitDrafts/o2-course", { owner: "o2" });
    files.files.set("orgs/o1/brand/logo.webp", { body: Buffer.from("x"), opts: {} });
    files.files.set("exports/o1/abc/part-0001.json.gz", { body: Buffer.from("x"), opts: {} });
    files.files.set("orgs/o2/brand/logo.webp", { body: Buffer.from("x"), opts: {} });
  }
  const left = () => db.all("users").filter((u) => u.orgId === "o1").length;

  it("closes the organization first, then releases 250 members across calls, and audits the start and the end", async () => {
    big(250);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Each member costs 2.5 s, so a page of 100 uses up the 240 s a call may spend paging.
    const first: unknown[] = [];
    billing.writeClaims.mockImplementation(async () => {
      if (!first.length) first.push({ status: db.docs.get("orgs/o1")?.status, codes: db.all("inviteCodes").filter((c) => c.orgId === "o1").length });
      vi.setSystemTime(Date.now() + 2500);
      return null;
    });

    const one = await deleteOrg.run(asSuper(confirm));
    expect(one).toEqual({ done: false, cursor: "m099", processed: 100, units: 0 });
    expect(first).toEqual([{ status: "deleting", codes: 0 }]); // closed and unjoinable before the first member was touched
    expect(db.docs.get("orgs/o1")).toMatchObject({ status: "deleting", deletingBy: "root", deletingAt: expect.any(Number), deletingMembers: "release", deletingReleased: 100 });
    expect(db.all("inviteCodes").map((c) => c.id)).toEqual(["CCCC-CCCC-CCCC"]);
    expect(audits).toEqual([expect.objectContaining({ action: "deleteOrgStarted", by: "root", orgId: "o1", name: "Nile School", membersOption: "release" })]);
    expect(left()).toBe(150);
    expect(db.docs.has("units/o1-course")).toBe(true); // its courses wait for the last step

    const two = await deleteOrg.run(asSuper({ ...confirm, cursor: one.cursor }));
    expect(two).toEqual({ done: false, cursor: "m199", processed: 100, units: 0 });
    expect(left()).toBe(50);
    expect(audits.map((a) => a.action)).toEqual(["deleteOrgStarted"]); // started once

    const three = await deleteOrg.run(asSuper({ ...confirm, cursor: two.cursor }));
    expect(three).toEqual({ done: true, cursor: null, processed: 50, units: 1 });
    expect(left()).toBe(0);
    expect(billing.writeClaims).toHaveBeenCalledTimes(250);
    expect(billing.writeClaims.mock.calls.every((c) => c[1] === "learner" && c[2] === null)).toBe(true);
    expect(user("m123")).toMatchObject({ role: "learner", orgId: null, teacherId: null, group: null, superSeat: false, email: "m123@school.example" });
    expect(db.all("accountDeletions")).toEqual([]); // "release" deletes nobody
    // The organization, what hangs under it, its courses and its files are gone; the other organization's are not.
    expect([...db.docs.keys()].filter((k) => k.startsWith("orgs/o1"))).toEqual([]);
    expect(db.docs.has("units/o1-course") || db.docs.has("unitDrafts/o1-course")).toBe(false);
    expect(db.docs.has("units/o2-course") && db.docs.has("unitDrafts/o2-course") && db.docs.has("orgs/o2")).toBe(true);
    expect(user("x1")).toMatchObject({ role: "student", orgId: "o2" });
    expect(files.deleted).toEqual(["orgs/o1/", "exports/o1/", "content/pages/o1/"]);
    expect([...files.files.keys()]).toEqual(["orgs/o2/brand/logo.webp"]);
    expect(audits.at(-1)).toEqual({ action: "deleteOrg", by: "root", orgId: "o1", name: "Nile School", membersOption: "release", members: 250, released: 250, queued: 0, units: 1 });
    expect(audits.map((a) => a.action)).toEqual(["deleteOrgStarted", "deleteOrg"]);
  });

  it("is safe to repeat with no cursor: the released have left, the rest are handled once", async () => {
    big(150);
    vi.useFakeTimers({ toFake: ["Date"] });
    billing.writeClaims.mockImplementation(async () => { vi.setSystemTime(Date.now() + 2500); return null; });
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: false, cursor: "m099", processed: 100 });
    expect(await deleteOrg.run(asSuper(confirm))).toEqual({ done: true, cursor: null, processed: 50, units: 1 });
    expect(billing.writeClaims).toHaveBeenCalledTimes(150);
    expect(audits.at(-1)).toMatchObject({ action: "deleteOrg", members: 150, released: 150 });
  });

  it("queues the accounts it manages for deletion only when asked, and leaves them as they are", async () => {
    member("u1", "student", "o1", { managedBy: "o1", email: "amal@school.example" });
    member("u2", "student", "o1", { email: "omar@users.darsi.app" }); // a username login from before managedBy
    member("u3", "teacher", "o1", { managedBy: "o2", email: "t@users.darsi.app" }); // another organization says it manages this one
    member("u4", "student", "o1", { email: "own@gmail.example" });
    expect(await deleteOrg.run(asSuper({ ...confirm, members: "delete-managed" }))).toEqual({ done: true, cursor: null, processed: 7, units: 0 });
    expect(db.all("accountDeletions")).toEqual([
      { id: "u1", orgId: "o1", by: "root", at: expect.any(Number) },
      { id: "u2", orgId: "o1", by: "root", at: expect.any(Number) },
    ]);
    // Queued accounts keep their organization (their files are found by it) and their claims until account.ts deletes them.
    expect(user("u1")).toEqual({ role: "student", orgId: "o1", managedBy: "o1", email: "amal@school.example" });
    expect(user("u2")).toEqual({ role: "student", orgId: "o1", email: "omar@users.darsi.app" });
    expect(billing.writeClaims.mock.calls.map((c) => c[0]).sort()).toEqual(["a1", "s1", "t1", "u3", "u4"]);
    expect(user("u3")).toMatchObject({ role: "learner", orgId: null });
    expect(audits[0]).toMatchObject({ action: "deleteOrgStarted", membersOption: "delete-managed" });
    expect(audits.at(-1)).toMatchObject({ action: "deleteOrg", membersOption: "delete-managed", members: 7, released: 5, queued: 2 });
  });

  it("deletes nobody by default: managed accounts are released like everyone else", async () => {
    member("u1", "student", "o1", { managedBy: "o1" });
    member("u2", "student", "o1", { email: "omar@users.darsi.app" });
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: true, processed: 5 });
    expect(db.all("accountDeletions")).toEqual([]);
    expect(user("u1")).toMatchObject({ role: "learner", orgId: null });
    expect(user("u2")).toMatchObject({ role: "learner", orgId: null });
    expect(audits.at(-1)).toMatchObject({ released: 5, queued: 0 });
  });

  it("does not queue an account twice", async () => {
    member("u1", "student", "o1", { managedBy: "o1" });
    db.docs.set("accountDeletions/u1", { orgId: "o1", by: "earlier", at: 1 });
    await deleteOrg.run(asSuper({ ...confirm, members: "delete-managed" }));
    expect(db.docs.get("accountDeletions/u1")).toEqual({ orgId: "o1", by: "earlier", at: 1 });
    expect(audits.at(-1)).toMatchObject({ queued: 0, released: 3 });
  });

  it("says so in the audit log when Storage would not delete its files, and still finishes", async () => {
    files.files.set("exports/o1/abc/part-0001.json.gz", { body: Buffer.from("x"), opts: {} });
    files.failDelete = (prefix) => prefix.startsWith("exports/");
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: true });
    expect(db.docs.has("orgs/o1")).toBe(false);
    expect(audits.at(-1)).toMatchObject({ action: "deleteOrg", filesLeft: true });
    expect(files.files.has("exports/o1/abc/part-0001.json.gz")).toBe(true);
  });

  it("stops, and stays open to a retry, when a member could not be released", async () => {
    billing.writeClaims.mockImplementation(async (uid: string) => { if (uid === "t1") throw new Error("auth busy"); return null; });
    const err = await deleteOrg.run(asSuper(confirm)).then(() => null, (e: { code: string; details: Record<string, unknown> }) => e);
    expect(err).toMatchObject({ code: "aborted", details: { reason: "delete-retry", failed: 1, cursor: null } });
    expect(db.docs.get("orgs/o1")).toMatchObject({ status: "deleting", deletingReleased: 2 });
    expect(user("t1")).toMatchObject({ role: "teacher", orgId: "o1" }); // still a member: nothing pretended otherwise
    expect(audits.map((a) => a.action)).toEqual(["deleteOrgStarted"]);
    billing.writeClaims.mockReset().mockResolvedValue(null);
    expect(await deleteOrg.run(asSuper(confirm))).toEqual({ done: true, cursor: null, processed: 1, units: 0 });
    expect(audits.at(-1)).toMatchObject({ action: "deleteOrg", members: 3, released: 3 });
  });

  it("releases a profile whose sign-in account is already gone", async () => {
    db.docs.set("users/ghost", { role: "student", orgId: "o1" }); // no Auth account: setCustomUserClaims would fail for good
    billing.writeClaims.mockImplementation(async (uid: string) => { if (uid === "ghost") throw new Error("auth/user-not-found"); return null; });
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: true, processed: 4 });
    expect(user("ghost")).toMatchObject({ role: "learner", orgId: null });
  });

  it("keeps the first call's choice for its members: a later call follows it, and one asking for the other is refused", async () => {
    big(150);
    vi.useFakeTimers({ toFake: ["Date"] });
    billing.writeClaims.mockImplementation(async () => { vi.setSystemTime(Date.now() + 2500); return null; });
    member("u1", "student", "o1", { managedBy: "o1" }); // sorts after m149: still waiting when the first call stops
    const one = await deleteOrg.run(asSuper(confirm)); // no choice named: "release", stored
    expect(one).toMatchObject({ done: false, cursor: "m099" });
    expect(db.docs.get("orgs/o1")).toMatchObject({ deletingMembers: "release" });
    // A stale screen (or a second one) asks to delete the managed accounts part-way: refused, nothing more is handled.
    const err = await deleteOrg.run(asSuper({ ...confirm, members: "delete-managed", cursor: one.cursor })).then(() => null, (e: { code: string; details: Record<string, unknown> }) => e);
    expect(err).toMatchObject({ code: "failed-precondition", details: { reason: "delete-option", members: "release" } });
    expect(left()).toBe(51);
    expect(db.docs.get("orgs/o1")).toMatchObject({ deletingMembers: "release" });
    // The same choice, or none, goes on by the stored one: u1 is released, never queued.
    expect(await deleteOrg.run(asSuper({ ...confirm, members: "release", cursor: one.cursor }))).toMatchObject({ done: true });
    expect(db.all("accountDeletions")).toEqual([]);
    expect(user("u1")).toMatchObject({ role: "learner", orgId: null });
    expect(audits.at(-1)).toMatchObject({ action: "deleteOrg", membersOption: "release", queued: 0 });
  });

  it("follows a stored delete-managed choice on a call that names none", async () => {
    member("u1", "student", "o1", { managedBy: "o1" });
    db.docs.set("orgs/o1", { name: "Nile School", status: "deleting", deletingMembers: "delete-managed" });
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: true });
    expect(db.all("accountDeletions").map((d) => d.id)).toEqual(["u1"]);
    expect(audits.at(-1)).toMatchObject({ membersOption: "delete-managed", queued: 1 });
  });

  it("stores this call's choice for a deletion started before the choice was kept", async () => {
    member("u1", "student", "o1", { managedBy: "o1" });
    db.docs.set("orgs/o1", { name: "Nile School", status: "deleting" }); // an older deletion, part-way, with no deletingMembers
    billing.writeClaims.mockRejectedValueOnce(new Error("auth busy")); // stops this call after the choice is stored
    await deleteOrg.run(asSuper({ ...confirm, members: "delete-managed" })).catch(() => null);
    expect(db.docs.get("orgs/o1")).toMatchObject({ deletingMembers: "delete-managed" });
    expect(await refusal(deleteOrg.run(asSuper({ ...confirm, members: "release" })))).toBe("delete-option");
  });

  it("gives a login the organization suspended its sign-in back when it releases it; a platform admin's suspension stays", async () => {
    member("u1", "student", "o1", { suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    member("u2", "student", "o1", { suspended: { at: 1, by: "root", reason: "abuse" } });
    member("u3", "student", "o1", { managedBy: "o1", suspended: { at: 1, by: "a1", reason: "", byOrg: "o1" } });
    for (const id of ["u1", "u2", "u3"]) auth.users.get(id)!.disabled = true;
    await deleteOrg.run(asSuper({ ...confirm, members: "delete-managed" }));
    expect(auth.users.get("u1")!.disabled).toBe(false);
    expect(user("u1")).not.toHaveProperty("suspended");
    expect(auth.users.get("u2")!.disabled).toBe(true);
    expect(user("u2")).toMatchObject({ suspended: { by: "root" } });
    // Queued for deletion: left exactly as it was.
    expect(auth.users.get("u3")!.disabled).toBe(true);
    expect(user("u3")).toMatchObject({ suspended: { byOrg: "o1" } });
  });

  it("fails closed: a member who could not be released keeps the organization's suspension; the next call lifts it", async () => {
    const suspended = { at: 1, by: "a1", reason: "", byOrg: "o1" };
    member("u1", "student", "o1", { suspended });
    auth.users.get("u1")!.disabled = true;
    billing.writeClaims.mockImplementation(async (uid: string) => { if (uid === "u1") throw new Error("auth busy"); return null; });
    expect(await refusal(deleteOrg.run(asSuper(confirm)))).toBe("delete-retry");
    expect(auth.users.get("u1")!.disabled).toBe(true);
    expect(user("u1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    // Released, but Auth can't lift the suspension: still locked and still a member, for the next call to find.
    billing.writeClaims.mockReset().mockResolvedValue(null);
    const enable = vi.spyOn(auth, "updateUser").mockRejectedValueOnce(Object.assign(new Error("auth down"), { code: "auth/internal-error" }));
    expect(await refusal(deleteOrg.run(asSuper(confirm)))).toBe("delete-retry");
    expect(auth.users.get("u1")!.disabled).toBe(true);
    expect(user("u1")).toMatchObject({ role: "student", orgId: "o1", suspended });
    enable.mockRestore();
    expect(await deleteOrg.run(asSuper(confirm))).toMatchObject({ done: true });
    expect(auth.users.get("u1")!.disabled).toBe(false);
    expect(user("u1")).toMatchObject({ role: "learner", orgId: null });
    expect(user("u1")).not.toHaveProperty("suspended");
  });

  it("still needs the typed name on every call, and a choice it knows", async () => {
    expect(await refusal(deleteOrg.run(asSuper({ orgId: "o1", confirm: "nile school" })))).toBe("confirm-name");
    expect(await refusal(deleteOrg.run(asSuper({ orgId: "o1" })))).toBe("confirm-name");
    expect(await refusal(deleteOrg.run(asSuper({ ...confirm, members: "delete-all" })))).toBe("bad-members");
    expect(await refusal(deleteOrg.run(asSuper({ orgId: "nope", confirm: "x" })))).toBe("no-org");
    expect(await refusal(deleteOrg.run(asSuper({ ...confirm, cursor: "users/s1" })))).toBe("bad-cursor"); // not an id: the query would throw on it
    expect(db.docs.get("orgs/o1")).toMatchObject({ status: "active" }); // and no refusal started the deletion
    expect(audits).toEqual([]);
    await deleteOrg.run(asSuper(confirm));
    expect(await refusal(deleteOrg.run(asSuper(confirm)))).toBe("no-org"); // finished: nothing left to repeat
  });
});
