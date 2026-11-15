// Data rights and abuse (account.ts): who may export or delete an account's data, which files are a person's project
// files, how a deleted account's payments are kept, and how recent a sign-in must be to delete your own account.
import { describe, expect, it } from "vitest";
import { DELETION_GIVE_UP_MS, hashedUid, ownFileRe, queuedDeletionProblem, queueStopped, recentSignIn, RECENT_SIGN_IN, sessionEvents, sessionsOf, submissionFiles, submissionPath } from "../src/accountCore";
import { accountActionProblem, managedAccount } from "../src/roles";

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

// Which accounts are an organization's to manage (be-account-privacy): the profile's managedBy, or a username login
// from before that field. createdBy alone (an admin typed the person's real email) gives the organization nothing.
describe("accounts an organization manages", () => {
  const adm = { uid: "adm", role: "orgAdmin", orgId: "org1" }, other = { uid: "adm2", role: "orgAdmin", orgId: "org2" };
  const invited = { uid: "t2", exists: true, role: "teacher", orgId: "org1", createdBy: "adm", email: "amal@school.example" }; // the admin typed her real email
  const looked = { ...invited, uid: "t3", managedBy: "org1" }; // a typed email the school says it manages

  it("a username account: its own organization's admin may delete and export it, another organization's may not", () => {
    for (const t of [pupil, { ...pupil, managedBy: "org1" }, { ...pupil, createdBy: undefined }]) for (const a of ["delete", "export"] as const) {
      expect(accountActionProblem(a, adm, t, DOMAIN)).toBeNull();
      expect(accountActionProblem(a, other, t, DOMAIN)).toBe("not-yours");
    }
    expect(accountActionProblem("delete", { uid: "p1", role: "student", orgId: "org1" }, { ...pupil, managedBy: "org1" }, DOMAIN)).toBe("self-org");
  });
  it("an account the admin only made with the person's real email is the person's own: the admin can't delete or export it, the person can delete it", () => {
    expect(accountActionProblem("delete", adm, invited, DOMAIN)).toBe("not-yours");
    expect(accountActionProblem("export", adm, invited, DOMAIN)).toBe("not-yours");
    expect(accountActionProblem("delete", { uid: "t2", role: "teacher", orgId: "org1" }, invited, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", { uid: "boss", role: "superadmin" }, invited, DOMAIN)).toBeNull(); // a platform admin still handles a request
  });
  it("managedBy says which organization: that one's admin acts, and the person asks them", () => {
    expect(accountActionProblem("delete", adm, looked, DOMAIN)).toBeNull();
    expect(accountActionProblem("export", adm, looked, DOMAIN)).toBeNull();
    expect(accountActionProblem("delete", { uid: "t3", role: "teacher", orgId: "org1" }, looked, DOMAIN)).toBe("self-org");
    expect(accountActionProblem("delete", adm, { ...looked, role: "orgAdmin" }, DOMAIN)).toBe("not-yours");
  });
  it("managedBy naming another organization gives this one nothing, username login or not", () => {
    for (const t of [{ ...looked, managedBy: "org2" }, { ...pupil, managedBy: "org2" }]) {
      expect(accountActionProblem("delete", adm, t, DOMAIN)).toBe("not-yours"); // a member here, managed elsewhere
      expect(accountActionProblem("export", adm, t, DOMAIN)).toBe("not-yours");
      expect(accountActionProblem("delete", other, t, DOMAIN)).toBe("not-yours"); // it manages the account, but it isn't its member
    }
    // Managed, and in an organization: still not the person's to delete.
    expect(accountActionProblem("delete", { uid: "t3", role: "teacher", orgId: "org1" }, { ...looked, managedBy: "org2" }, DOMAIN)).toBe("self-org");
  });
  it("only a non-empty string counts as managedBy", () => {
    expect(managedAccount({ managedBy: "org1", email: "a@b.example" }, DOMAIN)).toEqual({ managed: true, by: "org1" });
    for (const managedBy of [undefined, null, "", true, 7, {}]) {
      expect(managedAccount({ managedBy, email: "a@b.example" }, DOMAIN)).toEqual({ managed: false, by: null });
      expect(managedAccount({ managedBy, email: "MNA.abd.1@Users.Darsi.App" }, DOMAIN)).toEqual({ managed: true, by: null });
    }
  });
});

describe("an account queued for deletion with its organization (onAccountDeletion)", () => {
  const username = "mna.abd.12345@users.darsi.app";
  const t = { exists: true, hasAccount: true, role: "learner", orgId: null, email: username };
  it("is deleted when the organization managed it", () => {
    expect(queuedDeletionProblem("org1", t, DOMAIN)).toBeNull(); // an older username account
    expect(queuedDeletionProblem("org1", { ...t, managedBy: "org1", email: "amal@school.example" }, DOMAIN)).toBeNull();
    expect(queuedDeletionProblem("org1", { ...t, orgId: "org1", role: "student" }, DOMAIN)).toBeNull(); // not yet moved out
    expect(queuedDeletionProblem("org1", { exists: false, hasAccount: false }, DOMAIN)).toBeNull(); // already gone: leftovers only
  });
  it("is left alone when it is a platform admin, the person's own, or another organization's by now", () => {
    expect(queuedDeletionProblem("org1", { ...t, role: "superadmin" }, DOMAIN)).toBe("superadmin");
    expect(queuedDeletionProblem("org1", { ...t, claimRole: "superadmin" }, DOMAIN)).toBe("superadmin");
    expect(queuedDeletionProblem("org1", { ...t, email: "amal@school.example" }, DOMAIN)).toBe("not-managed");
    expect(queuedDeletionProblem("org1", { exists: false, hasAccount: true, email: "amal@school.example" }, DOMAIN)).toBe("not-managed");
    expect(queuedDeletionProblem("org1", { ...t, managedBy: "org2" }, DOMAIN)).toBe("moved");
    expect(queuedDeletionProblem("org1", { ...t, orgId: "org2", role: "student" }, DOMAIN)).toBe("moved");
    expect(queuedDeletionProblem("", t, DOMAIN)).toBe("no-org");
  });
  it("an entry no worker is behind any more: held, given up, or past the worker's six hours", () => {
    const now = Date.UTC(2026, 10, 11), ts = (ms: number) => ({ toMillis: () => ms });
    expect(queueStopped(undefined, now)).toBeNull();
    expect(queueStopped({ orgId: "org1", by: "root", at: ts(now - 60_000) }, now)).toBeNull(); // its worker is trying
    expect(queueStopped({ at: ts(now - DELETION_GIVE_UP_MS) }, now)).toBeNull(); // the worker gives up after, not at
    expect(queueStopped({ at: now - 5 * 3600e3, startedAt: 1, wiped: true }, now)).toBeNull();
    expect(queueStopped({ at: ts(now - 60_000), held: "renewing" }, now)).toBe("held");
    expect(queueStopped({ at: ts(now - 60_000), gaveUpAt: ts(now) }, now)).toBe("gave-up");
    expect(queueStopped({ at: ts(now - DELETION_GIVE_UP_MS - 1) }, now)).toBe("expired");
    expect(queueStopped({ at: now - 7 * 3600e3 }, now)).toBe("expired"); // milliseconds, as older entries and tests write it
    // No time, or one still being written (a server timestamp not yet set): taken as new.
    expect(queueStopped({ orgId: "org1" }, now)).toBeNull();
    expect(queueStopped({ at: null }, now)).toBeNull();
    expect(queueStopped({ at: "yesterday" }, now)).toBeNull();
  });
});

describe("the tutor agent's sessions (agentSessions.ts)", () => {
  it("are read from either shape Agent Runtime answers with, with the last use in ms", () => {
    expect(sessionsOf({ sessions: [{ id: "s1", lastUpdateTime: 1762000000.5 }, { id: "s2", last_update_time: 1762000001 }, { id: "" }, null, { id: "s3" }] }))
      .toEqual([{ id: "s1", updatedAt: 1762000000500 }, { id: "s2", updatedAt: 1762000001000 }, { id: "s3", updatedAt: null }]);
    expect(sessionsOf([{ id: "s4", lastUpdateTime: 1762000000000 }])).toEqual([{ id: "s4", updatedAt: 1762000000000 }]);
    for (const junk of [undefined, null, "x", {}, { sessions: "no" }]) expect(sessionsOf(junk)).toEqual([]);
  });
  it("give the conversation for an export: what was said and called, not what a tool returned or the model thought", () => {
    const events = sessionEvents({ id: "s1", events: [
      { author: "user", timestamp: 1762000000, content: { parts: [{ text: "What is training data?" }] } },
      { author: "darsi_tutor", timestamp: 1762000002, content: { parts: [{ thought: true, text: "let me look" }, { functionCall: { name: "search_course", args: { query: "training data" } } }] } },
      { author: "darsi_tutor", content: { parts: [{ function_response: { name: "search_course", response: { hits: ["course text"] } } }] } },
      { author: "darsi_tutor", content: { parts: [{ function_call: { name: "reply", args: { answer: "The examples a model learns from." } } }] } },
      { author: "darsi_tutor", content: { parts: [{ thought: true, text: "done" }] } }, // nothing to show
      { author: "darsi_tutor" },
    ] });
    expect(events).toEqual([
      { at: new Date(1762000000000).toISOString(), author: "user", parts: [{ text: "What is training data?" }] },
      { at: new Date(1762000002000).toISOString(), author: "darsi_tutor", parts: [{ call: "search_course", args: { query: "training data" } }] },
      { at: null, author: "darsi_tutor", parts: [{ result: "search_course" }] },
      { at: null, author: "darsi_tutor", parts: [{ call: "reply", args: { answer: "The examples a model learns from." } }] },
    ]);
    expect(JSON.stringify(events)).not.toContain("course text");
    expect(sessionEvents(null)).toEqual([]);
    expect(sessionEvents({ events: "none" })).toEqual([]);
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
