// Projects waiting for a review, counted onto the person's profile (waiting.ts) so /teach and /admin show who has work
// waiting without reading anyone's submissions: a recount (a review can be set back to "submitted"), never a profile
// brought back for a deleted account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  subs: new Map<string, { status: string }[]>(),
  profiles: new Set<string>(),
  updates: [] as { path: string; data: Record<string, unknown> }[],
  queries: [] as string[],
}));
vi.mock("../src/admin.js", () => ({
  db: {
    collection: (path: string) => ({
      where: (field: string, op: string, value: string) => ({
        count: () => ({
          get: async () => {
            m.queries.push(`${path} ${field} ${op} ${value}`);
            const uid = path.split("/")[1];
            return { data: () => ({ count: (m.subs.get(uid) ?? []).filter((s) => s.status === value).length }) };
          },
        }),
      }),
    }),
    doc: (path: string) => ({
      update: async (data: Record<string, unknown>) => {
        if (!m.profiles.has(path.split("/")[1])) throw Object.assign(new Error("5 NOT_FOUND"), { code: 5 });
        m.updates.push({ path, data });
      },
    }),
  },
}));
vi.mock("firebase-functions/v2", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { recountWaiting } = await import("../src/waiting");

beforeEach(() => { m.subs.clear(); m.profiles.clear(); m.updates = []; m.queries = []; });

describe("recountWaiting", () => {
  it("counts the projects still waiting and writes the number on the profile", async () => {
    m.profiles.add("s1");
    m.subs.set("s1", [{ status: "submitted" }, { status: "approved" }, { status: "submitted" }, { status: "revise" }]);
    expect(await recountWaiting("s1")).toBe(2);
    expect(m.queries).toEqual(["users/s1/submissions status == submitted"]);
    expect(m.updates).toEqual([{ path: "users/s1", data: { projectsWaiting: 2 } }]);
  });

  it("goes back to zero once everything is reviewed, and up again when a review is reopened", async () => {
    m.profiles.add("s1");
    m.subs.set("s1", [{ status: "approved" }]);
    expect(await recountWaiting("s1")).toBe(0);
    m.subs.set("s1", [{ status: "submitted" }]);
    expect(await recountWaiting("s1")).toBe(1);
    expect(m.updates.map((u) => u.data.projectsWaiting)).toEqual([0, 1]);
  });

  it("leaves a deleted account alone (no profile is created)", async () => {
    m.subs.set("gone", [{ status: "submitted" }]);
    expect(await recountWaiting("gone")).toBeNull();
    expect(m.updates).toEqual([]);
  });
});
