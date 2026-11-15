// The summary trigger: a deleted lesson result for an account whose profile is gone writes nothing (it used to bring
// back an empty profile and its private rows); a live account's deletion and a new account's first result still count;
// a result for an account deleted from Auth is removed; a deletion that starts while it runs is never undone.
import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(), writes: [] as string[], deleted: [] as string[], noAuth: new Set<string>(),
  /** What each transaction write set, by path. */
  sets: new Map<string, Record<string, unknown>>(),
  /** Auth emails other than the default `<uid>@Example.org`. */
  emails: new Map<string, string>(),
  /** Runs inside the transaction, before its reads: a deletion arriving meanwhile. */
  during: null as null | (() => void),
}));
const snap = (path: string) => {
  const data = m.docs.get(path);
  return { exists: data !== undefined, data: () => data, get: (f: unknown) => (typeof f === "string" ? data?.[f] : undefined), id: path.split("/").pop() };
};
vi.mock("../src/admin.js", () => ({
  db: {
    doc: (path: string) => ({ path, get: async () => snap(path), delete: async () => { m.deleted.push(path); m.docs.delete(path); } }),
    collection: (path: string) => {
      const q = { limit: () => q, get: async () => ({ docs: [...m.docs.keys()].filter((k) => k.startsWith(`${path}/`)).map(snap) }), path };
      return q;
    },
    runTransaction: async (fn: (tx: unknown) => unknown) => { m.during?.(); return fn({
      get: async (ref: { path: string; get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { path: string }, data: Record<string, unknown>) => { m.writes.push(ref.path); m.sets.set(ref.path, data); },
    }); },
  },
  auth: { getUser: async (uid: string) => { if (m.noAuth.has(uid)) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" }); return { uid, email: m.emails.get(uid) ?? `${uid}@Example.org`, displayName: "New Teacher" }; } },
}));
vi.mock("../src/courses.js", () => ({ lessonMeta: async () => ({ unitId: "ai-1-1", track: "ai", competencies: [] }) }));

const { progressChanged } = await import("../src/progress");
const result = { lessonId: "ai-1-1-1", unitId: "ai-1-1", track: "ai", accuracy: 0.8, xp: 10, seconds: 300, completedAt: "2026-11-01T10:00:00.000Z" };

beforeEach(() => { m.docs.clear(); m.sets.clear(); m.emails.clear(); m.writes = []; m.deleted = []; m.noAuth.clear(); m.during = null; });

describe("progressChanged", () => {
  it("leaves a deleted account alone when its results are deleted", async () => {
    expect(await progressChanged("demo-1", "ai-1-1-1")).toBe("account gone");
    expect(m.writes).toEqual([]);
  });

  it("still updates a live account's summary when a result is deleted", async () => {
    m.docs.set("users/u1", { role: "teacher" });
    m.docs.set("users/u1/private/summaryRows", { rows: { "ai-1-1-1": { ...result } } });
    expect(await progressChanged("u1", "ai-1-1-1")).toBe("updated");
    expect(m.writes).toEqual(["users/u1/private/summaryRows", "users/u1"]);
  });

  it("counts a new account's first result even before its profile exists, and makes that profile whole", async () => {
    m.docs.set("users/new/progress/ai-1-1-1", { ...result });
    expect(await progressChanged("new", "ai-1-1-1")).toBe("updated");
    expect(m.writes).toContain("users/new");
    // The app's own create is refused once the document exists: the profile carries what it would have written.
    expect(m.sets.get("users/new")).toMatchObject({ role: "learner", orgId: null, email: "new@example.org", name: "New Teacher", summary: { lessonsDone: 1 } });
  });

  it("makes no profile for a username login someone signed up for by hand (sec-rules-05)", async () => {
    m.docs.set("users/squat/progress/ai-1-1-1", { ...result });
    m.emails.set("squat", "khaled.omar@users.darsi.app");
    expect(await progressChanged("squat", "ai-1-1-1")).toBe("no profile");
    expect(m.writes).toEqual([]);
  });

  it("adds nothing but the summary to a profile that exists", async () => {
    m.docs.set("users/u3", { role: "student", orgId: "org1", email: "u3@x.org", name: "U3" });
    m.docs.set("users/u3/private/summaryRows", { rows: {} });
    m.docs.set("users/u3/progress/ai-1-1-1", { ...result });
    expect(await progressChanged("u3", "ai-1-1-1")).toBe("updated");
    expect(Object.keys(m.sets.get("users/u3") ?? {})).toEqual(["summary"]);
  });

  it("removes a result that arrives after the account was deleted, and writes no profile back", async () => {
    m.noAuth.add("gone1");
    m.docs.set("users/gone1/progress/ai-1-1-1", { ...result });
    expect(await progressChanged("gone1", "ai-1-1-1")).toBe("account gone");
    expect(m.deleted).toEqual(["users/gone1/progress/ai-1-1-1"]);
    expect(m.writes).toEqual([]);
  });

  it("writes nothing when the profile is deleted while it runs (the account is being deleted)", async () => {
    m.docs.set("users/u2", { role: "learner" });
    m.docs.set("users/u2/private/summaryRows", { rows: {} });
    m.docs.set("users/u2/progress/ai-1-1-1", { ...result });
    m.during = () => { m.docs.delete("users/u2"); };
    expect(await progressChanged("u2", "ai-1-1-1")).toBe("account gone");
    expect(m.writes).toEqual([]);
  });
});
