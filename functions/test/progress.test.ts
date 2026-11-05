// The summary trigger: a deleted lesson result for an account whose profile is gone writes nothing (it used to bring
// back an empty profile and its private rows); a live account's deletion and a new account's first result still count.
import { describe, expect, it, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), writes: [] as string[] }));
const snap = (path: string) => {
  const data = m.docs.get(path);
  return { exists: data !== undefined, data: () => data, get: (f: unknown) => (typeof f === "string" ? data?.[f] : undefined), id: path.split("/").pop() };
};
vi.mock("../src/admin.js", () => ({
  db: {
    doc: (path: string) => ({ path, get: async () => snap(path) }),
    collection: (path: string) => {
      const q = { limit: () => q, get: async () => ({ docs: [...m.docs.keys()].filter((k) => k.startsWith(`${path}/`)).map(snap) }), path };
      return q;
    },
    runTransaction: async (fn: (tx: unknown) => unknown) => fn({
      get: async (ref: { path: string; get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { path: string }) => { m.writes.push(ref.path); },
    }),
  },
}));
vi.mock("../src/courses.js", () => ({ lessonMeta: async () => ({ unitId: "ai-1-1", track: "ai", competencies: [] }) }));

const { progressChanged } = await import("../src/progress");
const result = { lessonId: "ai-1-1-1", unitId: "ai-1-1", track: "ai", accuracy: 0.8, xp: 10, seconds: 300, completedAt: "2026-11-01T10:00:00.000Z" };

beforeEach(() => { m.docs.clear(); m.writes = []; });

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

  it("counts a new account's first result even before its profile exists", async () => {
    m.docs.set("users/new/progress/ai-1-1-1", { ...result });
    expect(await progressChanged("new", "ai-1-1-1")).toBe("updated");
    expect(m.writes).toContain("users/new");
  });
});
