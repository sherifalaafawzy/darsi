// An organization's export (orgExport.ts): only its own admins and platform admins, every member with their lessons,
// projects and certificates and nothing private, in files a large organization fills across calls.
import { gunzipSync } from "node:zlib";
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminMock, FakeBucket } from "./orgFakes";

vi.mock("../src/admin.js", async () => (await import("./orgFakes")).adminMock());
vi.mock("../src/storage.js", async () => { const b = new (await import("./orgFakes")).FakeBucket(); return { bucket: () => b }; });

const { db, auth, audits } = (await import("../src/admin.js")) as unknown as AdminMock;
const files = ((await import("../src/storage.js")) as unknown as { bucket: () => FakeBucket }).bucket();
type Answer = { exportId: string; done: boolean; cursor: string | null; files: string[]; members: number };
const exportOrgData = (await import("../src/orgExport")).exportOrgData as unknown as { run: (req: unknown) => Promise<Answer> };

const as = (uid: string, data: Record<string, unknown>) => ({ auth: { uid, token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");
type Row = { uid: string; profile: Record<string, unknown>; lessons: Record<string, unknown>[]; projects: Record<string, unknown>[]; certificates: Record<string, unknown>[] };
const read = (name: string) => JSON.parse(gunzipSync(files.files.get(name)!.body).toString("utf8")) as Row[];
const member = (id: string, role: string, orgId: string | null, more: Record<string, unknown> = {}) => {
  db.docs.set(`users/${id}`, { role, orgId, name: id, ...more });
  auth.users.set(id, { uid: id, customClaims: { role, ...(orgId ? { orgId } : {}) } });
};
const day = (iso: string) => Timestamp.fromDate(new Date(iso));

beforeEach(() => {
  db.docs.clear(); db.onQuery = null; auth.users.clear(); audits.length = 0;
  files.files.clear(); files.deleted.length = 0; files.failDelete = null; files.onSave = null;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active" });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active" });
  member("a1", "orgAdmin", "o1"); member("t1", "teacher", "o1"); member("a2", "orgAdmin", "o2"); member("x1", "student", "o2");
  member("u1", "student", "o1", {
    name: "Amal", email: "amal@users.darsi.app", username: "amal", group: "5A", teacherId: "t1", createdAt: day("2026-09-01T08:00:00Z"),
    lastActive: day("2026-11-01T10:30:00Z"), summary: { lessonsDone: 2 }, plan: "super", mustChangePassword: true, pushHour: 18,
  });
  db.docs.set("users/u1/progress/ai-1-1-1", { lessonId: "ai-1-1-1", unitId: "ai-1-1", accuracy: 0.9, xp: 40, completedAt: day("2026-10-02T09:00:00Z") });
  db.docs.set("users/u1/progress/ai-1-1-2", { lessonId: "ai-1-1-2", unitId: "ai-1-1", accuracy: 1, xp: 50, completedAt: day("2026-10-03T09:00:00Z") });
  db.docs.set("users/u1/submissions/p1", { unitId: "ai-1-1", text: "My classroom robot", status: "approved", createdAt: day("2026-10-04T09:00:00Z") });
  db.docs.set("users/u1/certs/ai-1-1", { name: "Amal", at: day("2026-10-05T09:00:00Z") });
  db.docs.set("users/u1/notes/ai-1-1-1", { text: "PRIVATE-NOTE do not share", updatedAt: 1 });
  db.docs.set("users/u1/devices/d1", { token: "PUSH-TOKEN" });
  db.docs.set("subscriptions/u1", { plan: "super", status: "active" });
  db.docs.set("credits/u1", { balance: 300 });
  member("u2", "student", "o1", { name: "Omar" });
  db.docs.set("users/u2/progress/cyber-1-1-1", { lessonId: "cyber-1-1-1", unitId: "cyber-1-1", accuracy: 0.5, xp: 20 });
});
afterEach(() => { vi.useRealTimers(); });

describe("exportOrgData", () => {
  it("is for this organization's admins and platform admins only", async () => {
    expect(await refusal(exportOrgData.run(as("a2", { orgId: "o1" })))).toBe("not-org-admin"); // another organization's admin
    expect(await refusal(exportOrgData.run(as("t1", { orgId: "o1" })))).toBe("not-org-admin"); // its own teacher
    expect(await refusal(exportOrgData.run(as("u1", { orgId: "o1" })))).toBe("not-org-admin");
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o2" })))).toBe("not-org-admin");
    expect(await refusal(exportOrgData.run(as("a1", {})))).toBe("not-org-admin");
    await expect(exportOrgData.run({ data: { orgId: "o1" } })).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await refusal(exportOrgData.run(as("root", { orgId: "nope" })))).toBe("no-org");
    expect(files.files.size).toBe(0);
    expect(audits).toEqual([]);
    expect((await exportOrgData.run(as("root", { orgId: "o1" }))).done).toBe(true); // a platform admin, for any organization
  });

  it("writes every member with their lessons, projects and certificates, and nothing private", async () => {
    const out = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(out).toEqual({ exportId: expect.stringMatching(/^[a-f0-9]{24}$/), done: true, cursor: null, files: [`exports/o1/${out.exportId}/part-0001.json.gz`], members: 4 });
    expect(audits).toEqual([{ action: "exportOrgData", by: "a1", orgId: "o1", exportId: out.exportId }]);
    const saved = files.files.get(out.files[0])!;
    expect(saved.opts).toMatchObject({ resumable: false, gzip: false, contentType: "application/gzip", metadata: { cacheControl: "private, no-store" } });

    const rows = read(out.files[0]);
    expect(rows.map((r) => r.uid)).toEqual(["a1", "t1", "u1", "u2"]); // o1's people, and not x1 of the other organization
    const amal = rows.find((r) => r.uid === "u1")!;
    expect(amal.profile).toEqual({
      name: "Amal", email: "amal@users.darsi.app", username: "amal", role: "student", group: "5A", teacherId: "t1",
      createdAt: "2026-09-01T08:00:00.000Z", lastActive: "2026-11-01T10:30:00.000Z", summary: { lessonsDone: 2 },
    });
    expect(amal.lessons).toEqual([
      { id: "ai-1-1-1", lessonId: "ai-1-1-1", unitId: "ai-1-1", accuracy: 0.9, xp: 40, completedAt: "2026-10-02T09:00:00.000Z" },
      { id: "ai-1-1-2", lessonId: "ai-1-1-2", unitId: "ai-1-1", accuracy: 1, xp: 50, completedAt: "2026-10-03T09:00:00.000Z" },
    ]);
    expect(amal.projects).toEqual([{ id: "p1", unitId: "ai-1-1", text: "My classroom robot", status: "approved", createdAt: "2026-10-04T09:00:00.000Z" }]);
    expect(amal.certificates).toEqual([{ unitId: "ai-1-1", name: "Amal", at: "2026-10-05T09:00:00.000Z" }]);
    expect(rows.find((r) => r.uid === "u2")).toMatchObject({ profile: { name: "Omar", email: null, group: null }, lessons: [{ id: "cyber-1-1-1" }], projects: [], certificates: [] });
    // Only what its admins may read under the rules: no notes, devices, plan, credits or anything else on the profile.
    expect(Object.keys(amal).sort()).toEqual(["certificates", "lessons", "profile", "projects", "uid"]);
    const text = JSON.stringify(rows);
    for (const secret of ["PRIVATE-NOTE", "PUSH-TOKEN", "notes", "plan", "mustChangePassword", "pushHour", "balance"]) expect(text).not.toContain(secret);
  });

  it("removes an older export when a new one starts, and only this organization's", async () => {
    files.files.set("exports/o1/000000000000000000000000/part-0001.json.gz", { body: Buffer.from("old"), opts: {} });
    files.files.set("exports/o2/111111111111111111111111/part-0001.json.gz", { body: Buffer.from("theirs"), opts: {} });
    const out = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(files.deleted).toEqual(["exports/o1/"]);
    expect([...files.files.keys()].sort()).toEqual([out.files[0], "exports/o2/111111111111111111111111/part-0001.json.gz"].sort());
  });

  it("goes on from the cursor in a second call, a file per call, each member once", async () => {
    for (const id of ["a1", "t1", "u1", "u2"]) db.docs.delete(`users/${id}`);
    for (let i = 0; i < 150; i++) db.docs.set(`users/m${String(i).padStart(3, "0")}`, { role: "student", orgId: "o1", name: `Pupil ${i}` });
    db.docs.set("users/a1", { role: "orgAdmin", orgId: "o1", name: "a1" }); // sorts first
    vi.useFakeTimers({ toFake: ["Date"] });
    // Each member's lessons take 5 s to read, so the first page of 100 uses up the 400 s a call may spend.
    db.onQuery = (col) => { if (col.endsWith("/progress")) vi.setSystemTime(Date.now() + 5000); };

    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(one).toMatchObject({ done: false, cursor: "m098", members: 100 });
    expect(one.files).toEqual([`exports/o1/${one.exportId}/part-0001.json.gz`]);

    const two = await exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor }));
    expect(two).toEqual({ exportId: one.exportId, done: true, cursor: null, members: 151, files: [`exports/o1/${one.exportId}/part-0001.json.gz`, `exports/o1/${one.exportId}/part-0002.json.gz`] });
    const all = [...read(two.files[0]), ...read(two.files[1])].map((r) => r.uid);
    expect(all).toHaveLength(151);
    expect(new Set(all).size).toBe(151);
    expect(all[0]).toBe("a1"); expect(all.at(-1)).toBe("m149");
    expect(files.deleted).toEqual(["exports/o1/"]); // the second call did not start over
    expect(audits.map((a) => a.action)).toEqual(["exportOrgData"]); // one export, one entry

    // The same call again (its answer never arrived): the same answer, and no third file.
    expect(await exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor }))).toEqual(two);
    expect(files.files.size).toBe(2);
  });

  // Any id-shaped cursor used to be read on from: each such call read the members again (three reads each) into one
  // more file, as often as an admin's script asked.
  it("continues only from where the last part stopped, and never after the export is done", async () => {
    for (const id of ["a1", "t1", "u1", "u2"]) db.docs.delete(`users/${id}`);
    for (let i = 0; i < 150; i++) db.docs.set(`users/m${String(i).padStart(3, "0")}`, { role: "student", orgId: "o1", name: `Pupil ${i}` });
    db.docs.set("users/a1", { role: "orgAdmin", orgId: "o1", name: "a1" });
    vi.useFakeTimers({ toFake: ["Date"] });
    db.onQuery = (col) => { if (col.endsWith("/progress")) vi.setSystemTime(Date.now() + 5000); };
    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(one).toMatchObject({ done: false, cursor: "m098", members: 100 });
    // A cursor that is not where part 1 stopped: refused, and nothing is read or written for it.
    const queries: string[] = [];
    db.onQuery = (col) => { queries.push(col); };
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: "m010" })))).toBe("bad-export");
    expect(queries).toEqual([]);
    expect(files.files.size).toBe(1);
    db.onQuery = null;
    const two = await exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor }));
    expect(two).toMatchObject({ done: true, cursor: null, members: 151 });
    expect(two.files).toHaveLength(2);
    // Done: any cursor is answered with the finished export, and no third file.
    db.onQuery = (col) => { queries.push(col); };
    expect(await exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: "m050" }))).toEqual(two);
    expect(queries).toEqual([]);
    expect(files.files.size).toBe(2);
  });

  // An erasure in the organization deletes the stamp first (account.ts wipeAccount) and then the files: a call that
  // read the erased person before that must not write them back, and one that comes after must not go on.
  it("stops when its stamp is gone: a continuing call is refused, though a part of the export is still there", async () => {
    for (let i = 0; i < 150; i++) member(`m${String(i).padStart(3, "0")}`, "student", "o1");
    vi.useFakeTimers({ toFake: ["Date"] });
    db.onQuery = (col) => { if (col === "users") vi.setSystemTime(Date.now() + 400_000); };
    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(one.done).toBe(false);
    db.onQuery = null;
    // The erasure's first step, with part 1 not yet removed (or written back by a call that was in flight).
    db.docs.delete("orgs/o1/private/export");
    const queries: string[] = [];
    db.onQuery = (col) => { queries.push(col); };
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor })))).toBe("no-export");
    expect(queries).toEqual([]); // nobody was read for it
    expect([...files.files.keys()]).toEqual(one.files);
    // A stamp that names a newer export is no licence either.
    db.docs.set("orgs/o1/private/export", { at: Date.now(), by: "root", exportId: "f".repeat(24) });
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor })))).toBe("no-export");
  });

  it("takes its file back when the stamp went while it was reading, on a first call and on a later one", async () => {
    for (let i = 0; i < 150; i++) member(`m${String(i).padStart(3, "0")}`, "student", "o1");
    vi.useFakeTimers({ toFake: ["Date"] });
    // A first call: the members are read, then the erasure deletes the stamp, then the file is saved.
    files.onSave = () => { db.docs.delete("orgs/o1/private/export"); };
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1" })))).toBe("no-export");
    expect(files.files.size).toBe(0);
    expect(db.docs.has("orgs/o1/private/export")).toBe(false);
    files.onSave = null;
    // A later call: part 1 is there, part 2 is taken back, and the next call finds no export to go on with.
    db.onQuery = (col) => { if (col === "users") vi.setSystemTime(Date.now() + 400_000); };
    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(one.done).toBe(false);
    db.onQuery = null;
    files.onSave = () => { db.docs.delete("orgs/o1/private/export"); for (const f of one.files) files.files.delete(f); };
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor })))).toBe("no-export");
    expect(files.files.size).toBe(0);
    files.onSave = null;
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor })))).toBe("no-export");
    // The admin starts a new one at once (the stamp went with the erasure).
    expect(await exportOrgData.run(as("a1", { orgId: "o1" }))).toMatchObject({ done: true, members: 154 });
  });

  it("starts at most one new export per organization every 10 minutes, for anyone; continuing one is never held back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const first = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(db.docs.get("orgs/o1/private/export")).toEqual({ at: t0, by: "a1", exportId: first.exportId });
    vi.setSystemTime(t0 + 9 * 60_000);
    // Again, by the same admin or a platform admin: refused with the time it may start, and the last export's files stay.
    for (const who of ["a1", "root"]) {
      const err = await exportOrgData.run(as(who, { orgId: "o1" })).then(() => null, (e: { code: string; details: Record<string, unknown> }) => e);
      expect(err, who).toMatchObject({ code: "resource-exhausted", details: { reason: "export-wait", retryAt: t0 + 10 * 60_000 } });
    }
    expect([...files.files.keys()]).toEqual(first.files);
    expect(audits.map((a) => a.action)).toEqual(["exportOrgData"]);
    // The export already under way goes on (its repeat answers as before).
    expect(await exportOrgData.run(as("a1", { orgId: "o1", exportId: first.exportId, cursor: "a1" }))).toMatchObject({ exportId: first.exportId });
    expect(files.files.size).toBe(1); // …and a finished export gets no second file, whatever cursor comes with it
    // Another organization is not held back by this one's.
    expect((await exportOrgData.run(as("root", { orgId: "o2" }))).done).toBe(true);
    vi.setSystemTime(t0 + 10 * 60_000);
    const second = await exportOrgData.run(as("root", { orgId: "o1" }));
    expect(second.exportId).not.toBe(first.exportId);
    expect(db.docs.get("orgs/o1/private/export")).toMatchObject({ by: "root", exportId: second.exportId });
  });

  it("a first call that fails before its first file takes the stamp back: the admin tries again at once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const stamp = () => db.docs.get("orgs/o1/private/export");
    // The old export's files can't be removed.
    files.failDelete = () => true;
    await expect(exportOrgData.run(as("a1", { orgId: "o1" }))).rejects.toThrow("could not delete");
    expect(stamp()).toBeUndefined();
    files.failDelete = null;
    // Reading the members fails part-way.
    db.onQuery = (col) => { if (col === "users") { db.onQuery = null; throw new Error("firestore unavailable"); } };
    await expect(exportOrgData.run(as("a1", { orgId: "o1" }))).rejects.toThrow("firestore unavailable");
    expect(stamp()).toBeUndefined();
    // The file itself can't be saved.
    const file = vi.spyOn(files, "file").mockImplementationOnce(() => ({ save: async () => { throw new Error("storage down"); }, delete: async () => {} }));
    await expect(exportOrgData.run(as("a1", { orgId: "o1" }))).rejects.toThrow("storage down");
    file.mockRestore();
    expect(stamp()).toBeUndefined();
    expect(files.files.size).toBe(0);
    // No wait: the next press starts, and from then on the 10 minutes count as before.
    const ok = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(ok.done).toBe(true);
    expect(stamp()).toMatchObject({ by: "a1", exportId: ok.exportId });
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1" })))).toBe("export-wait");
    expect([...files.files.keys()]).toEqual(ok.files);
  });

  it("keeps the stamp when a later call fails (its first file is there), and never takes back a newer export's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 150; i++) member(`m${String(i).padStart(3, "0")}`, "student", "o1");
    const t0 = Date.now();
    // 100 members a page: with no time left after the first page, the call stops there and a second one is needed.
    db.onQuery = (col) => { if (col === "users") vi.setSystemTime(Date.now() + 400_000); };
    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(one.done).toBe(false);
    const mine = db.docs.get("orgs/o1/private/export");
    db.onQuery = (col) => { if (col === "users") { db.onQuery = null; throw new Error("firestore unavailable"); } };
    await expect(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: one.cursor }))).rejects.toThrow("firestore unavailable");
    expect(db.docs.get("orgs/o1/private/export")).toEqual(mine);
    expect([...files.files.keys()]).toEqual(one.files);
    // A first call that fails after another export took the stamp (it can't really, inside ten minutes; the check is on the id).
    vi.setSystemTime(t0 + 20 * 60_000);
    db.onQuery = (col) => {
      if (col !== "users") return;
      db.onQuery = null;
      db.docs.set("orgs/o1/private/export", { at: Date.now(), by: "root", exportId: "f".repeat(24) });
      throw new Error("firestore unavailable");
    };
    await expect(exportOrgData.run(as("a1", { orgId: "o1" }))).rejects.toThrow("firestore unavailable");
    expect(db.docs.get("orgs/o1/private/export")).toMatchObject({ by: "root", exportId: "f".repeat(24) });
  });

  it("refuses to continue an export it cannot place", async () => {
    const one = await exportOrgData.run(as("a1", { orgId: "o1" }));
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId })))).toBe("bad-export"); // no cursor: it would start over
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: "../o2/x", cursor: "a1" })))).toBe("bad-export");
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: one.exportId, cursor: "users/a1" })))).toBe("bad-export"); // not a member's id
    expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: "0".repeat(24), cursor: "a1" })))).toBe("no-export"); // replaced or deleted
    expect(files.files.size).toBe(1);
  });

  it("starts a new export with the first member, whatever cursor came with it, and takes an id for the organization", async () => {
    const out = await exportOrgData.run(as("a1", { orgId: "o1", cursor: "t1" })); // a cursor left over from an older export
    expect(out).toMatchObject({ done: true, members: 4 });
    expect(read(out.files[0]).map((r) => r.uid)).toEqual(["a1", "t1", "u1", "u2"]);
    // A path is not an organization: no folder outside exports/{orgId}/ is ever emptied or written.
    db.docs.set("orgs/o1/private/invites", { teacher: "AAAA-AAAA-AAAA" });
    expect(await refusal(exportOrgData.run(as("root", { orgId: "o1/private/invites" })))).toBe("no-org");
    expect(files.deleted).toEqual(["exports/o1/"]);
    expect(files.files.size).toBe(1);
  });

  it("exports a suspended organization, or one being deleted, for a platform admin only; and one with no members", async () => {
    for (const status of ["suspended", "deleting"]) {
      db.docs.set("orgs/o1", { name: "Nile School", status });
      // Its own admins are frozen and couldn't download the files (Storage rules): they start nothing, continue nothing.
      expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1" }))), status).toBe("org-suspended");
      expect(await refusal(exportOrgData.run(as("a1", { orgId: "o1", exportId: "0".repeat(24), cursor: "a1" }))), status).toBe("org-suspended");
    }
    expect(files.files.size).toBe(0);
    expect(audits).toEqual([]);
    expect((await exportOrgData.run(as("root", { orgId: "o1" }))).members).toBe(4);
    db.docs.set("orgs/empty", { name: "New School", status: "active" });
    const none = await exportOrgData.run(as("root", { orgId: "empty" }));
    expect(none).toMatchObject({ done: true, cursor: null, members: 0 });
    expect(read(none.files[0])).toEqual([]);
  });
});
