// Data rights and abuse (account.ts): who may export or delete an account's data, which files are a person's project
// files, how a deleted account's payments are kept, and how recent a sign-in must be to delete your own account.
import { describe, expect, it } from "vitest";
import { hashedUid, ownFileRe, recentSignIn, RECENT_SIGN_IN, submissionFiles, submissionPath } from "../src/accountCore";
import { accountActionProblem } from "../src/roles";

const DOMAIN = "users.darsi.app";
const pupil = { uid: "p1", exists: true, role: "student", orgId: "org1", createdBy: "adm", email: "mna.abd.12345@users.darsi.app" };
const joined = { uid: "t1", exists: true, role: "teacher", orgId: "org1", email: "teacher@gmail.com" }; // joined with a code
const learner = { uid: "l1", exists: true, role: "learner", orgId: null, email: "me@gmail.com" };

describe("who may delete or export an account (FS-DELETE, feat-org-data-rights)", () => {
  it("anyone exports their own data", () => {
    for (const role of ["learner", "student", "teacher", "orgAdmin", "superadmin"]) expect(accountActionProblem("export", { uid: "x", role }, { uid: "x", exists: true, role }, DOMAIN)).toBeNull();
  });
  it("a person deletes an account they made, but not one their school made, and never while an admin", () => {
    expect(accountActionProblem("delete", { uid: "l1", role: "learner" }, learner, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", { uid: "t1", role: "teacher", orgId: "org1" }, joined, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", { uid: "p1", role: "student", orgId: "org1" }, pupil, DOMAIN)).toBe("self-org");
    expect(accountActionProblem("delete", { uid: "a1", role: "orgAdmin", orgId: "org1" }, { uid: "a1", exists: true, role: "orgAdmin", orgId: "org1" }, DOMAIN)).toBe("self-staff");
    expect(accountActionProblem("delete", { uid: "s1", role: "superadmin" }, { uid: "s1", exists: true, role: "superadmin" }, DOMAIN)).toBe("self-staff");
  });
  it("a username account left without an organization can delete itself", () => {
    expect(accountActionProblem("delete", { uid: "p2", role: "learner" }, { ...pupil, uid: "p2", orgId: null, role: "learner" }, DOMAIN)).toBeNull();
  });
  it("platform admins act for anyone but other platform admins", () => {
    const boss = { uid: "boss", role: "superadmin" };
    for (const t of [pupil, joined, learner]) for (const a of ["delete", "export"] as const) expect(accountActionProblem(a, boss, t, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", boss, { uid: "s2", exists: true, role: "superadmin" }, DOMAIN)).toBe("superadmin");
    expect(accountActionProblem("delete", boss, { uid: "orphan", exists: false }, DOMAIN)).toBeNull(); // a sign-in left without a profile
  });
  it("an org admin acts only for students and teachers their organization made", () => {
    const adm = { uid: "adm", role: "orgAdmin", orgId: "org1" };
    expect(accountActionProblem("delete", adm, pupil, DOMAIN)).toBeNull();
    expect(accountActionProblem("export", adm, pupil, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", adm, { ...pupil, role: "teacher" }, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", adm, joined, DOMAIN)).toBe("not-yours"); // their own account: remove it from the org
    expect(accountActionProblem("delete", adm, { ...pupil, orgId: "org2" }, DOMAIN)).toBe("not-yours");
    expect(accountActionProblem("delete", adm, { ...pupil, role: "orgAdmin" }, DOMAIN)).toBe("not-yours");
    expect(accountActionProblem("delete", adm, learner, DOMAIN)).toBe("not-yours");
    expect(accountActionProblem("delete", adm, { uid: "ghost", exists: false }, DOMAIN)).toBe("missing");
  });
  it("teachers and students act for nobody else", () => {
    for (const role of ["teacher", "student", "learner"]) expect(accountActionProblem("delete", { uid: "x", role, orgId: "org1" }, pupil, DOMAIN)).toBe("not-yours");
  });
});

describe("a person's project files", () => {
  const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/${encodeURIComponent(path)}?alt=media&token=t`;
  it("are links into their own folder, in any organization's", () => {
    expect(submissionPath(url("submissions/org1/p1/ai-1-1/ai-1-1-4-1730000000000-photo.jpg"), "p1")).toBe("submissions/org1/p1/ai-1-1/ai-1-1-4-1730000000000-photo.jpg");
    expect(submissionPath(url("submissions/none/p1/old.jpg"), "p1")).toBe("submissions/none/p1/old.jpg");
    expect(submissionPath("http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/submissions%2Fnone%2Fp1%2Fx.jpg?alt=media", "p1")).toBe("submissions/none/p1/x.jpg");
  });
  it("never someone else's file, a file outside the project folders, or a path that climbs out", () => {
    expect(submissionPath(url("submissions/org1/p2/x.jpg"), "p1")).toBeNull();
    expect(submissionPath(url("orgs/org1/brand/logo-abc123.png"), "p1")).toBeNull();
    expect(submissionPath(url("submissions/org1/p1/../../content/catalog.json"), "p1")).toBeNull();
    expect(submissionPath("https://evil.example/x", "p1")).toBeNull();
    expect(submissionPath(42, "p1")).toBeNull();
  });
  it("come from fileUrl and files[] alike", () => {
    expect(submissionFiles({ fileUrl: url("submissions/none/p1/a.jpg"), files: [{ url: url("submissions/none/p1/b.pdf") }, { url: "junk" }] }, "p1"))
      .toEqual(["submissions/none/p1/a.jpg", "submissions/none/p1/b.pdf"]);
    expect(submissionFiles(undefined, "p1")).toEqual([]);
  });
  it("match the leftover-file check by name, whatever the uid holds", () => {
    expect(ownFileRe("p1").test("submissions/org9/p1/u/x.jpg")).toBe(true);
    expect(ownFileRe("p1").test("submissions/org9/p10/u/x.jpg")).toBe(false);
    expect(ownFileRe("a.b").test("submissions/none/aXb/x.jpg")).toBe(false);
    expect(ownFileRe("a.b").test("submissions/none/a.b/x.jpg")).toBe(true);
  });
});

describe("what stays after a deletion", () => {
  it("payments keep a hash in place of the person's id, the same each time and never the id itself", () => {
    expect(hashedUid("p1")).toBe(hashedUid("p1"));
    expect(hashedUid("p1")).not.toContain("p1");
    expect(hashedUid("p1")).toMatch(/^deleted-[0-9a-f]{20}$/);
    expect(hashedUid("p2")).not.toBe(hashedUid("p1"));
  });
  it("deleting your own account needs a sign-in within the last 10 minutes", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(recentSignIn(now / 1000 - 60, now)).toBe(true);
    expect(recentSignIn(now / 1000 - RECENT_SIGN_IN - 1, now)).toBe(false);
    expect(recentSignIn(undefined, now)).toBe(false);
  });
});
