// The tutor's course cache (sfm-12): a track's search index is shared by every organization without courses of its
// own in that track, an organization's own courses still get theirs, an instance keeps a bounded number of indexes,
// and a load that fails isn't kept. Storage is a map.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorUnit } from "../src/tutorCore";

const files = vi.hoisted(() => new Map<string, unknown>());
const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  return { db: new FakeDb(), caller: () => ({ uid: "u1", role: "learner" }), str: (v: unknown) => String(v ?? "") };
});
vi.mock("../src/settings.js", () => ({ superOn: async () => true }));
vi.mock("../src/storage.js", () => ({
  bucket: () => ({ file: (p: string) => ({ download: async () => { reads.n++; if (!files.has(p)) throw new Error("No such object"); return [Buffer.from(JSON.stringify(files.get(p)))]; } }) }),
}));
vi.mock("../src/agent.js", () => ({ AgentError: class extends Error {}, askAgent: async () => null, openSession: async () => "s1" }));

const { trackIndex, cachedCount } = await import("../src/tutor");

const unit = (id: string, track = "ai"): TutorUnit => ({ id, track, level: 1, title: { en: id }, lessons: [
  { id: `${id}-1`, title: { en: "One" }, steps: [{ id: "r", type: "read", title: { en: "Words" }, body: { en: `About ${id}.` } }] },
] });

beforeEach(() => {
  files.clear();
  files.set("content/catalog.json", { units: [{ id: "ai-1-1", track: "ai", src: "content/units/ai-1-1/v1.json" }] });
  files.set("content/units/ai-1-1/v1.json", unit("ai-1-1"));
});

describe("the tutor's search indexes (sfm-12)", () => {
  it("are shared by organizations without courses of their own in the track", async () => {
    const pub = await trackIndex(unit("ai-1-1"), null, "en");
    expect(await trackIndex(unit("ai-1-1"), "orgA", "en")).toBe(pub);
    expect(await trackIndex(unit("ai-1-1"), "orgB", "en")).toBe(pub);
    // An organization with its own course in the track gets its own index, which has that course.
    files.set("orgs/orgC/catalog.json", { units: [{ id: "c-ai", track: "ai", src: "orgs/orgC/units/c-ai/v1.json" }] });
    files.set("orgs/orgC/units/c-ai/v1.json", unit("c-ai"));
    const own = await trackIndex(unit("ai-1-1"), "orgC", "en");
    expect(own).not.toBe(pub);
    expect(JSON.stringify(own)).toContain("c-ai");
    expect(JSON.stringify(pub)).not.toContain("c-ai");
  });

  it("are kept at most 24 to an instance, the least recently used dropped first", async () => {
    for (let i = 0; i < 30; i++) {
      files.set(`orgs/big${i}/catalog.json`, { units: [{ id: `b${i}`, track: "ai", src: `orgs/big${i}/units/b${i}/v1.json` }] });
      files.set(`orgs/big${i}/units/b${i}/v1.json`, unit(`b${i}`));
      await trackIndex(unit("ai-1-1"), `big${i}`, "en");
    }
    expect(cachedCount("ix")).toBeLessThanOrEqual(24);
    // The newest is still kept: asking again reads nothing.
    const before = reads.n;
    await trackIndex(unit("ai-1-1"), "big29", "en");
    expect(reads.n).toBe(before);
  });

  it("build an index once when two ask together", async () => {
    files.set("orgs/twin/catalog.json", { units: [{ id: "t1", track: "iot", src: "orgs/twin/units/t1/v1.json" }] });
    files.set("orgs/twin/units/t1/v1.json", unit("t1", "iot"));
    const before = reads.n;
    const [a, b] = await Promise.all([trackIndex(unit("t1", "iot"), "twin", "ar"), trackIndex(unit("t1", "iot"), "twin", "ar")]);
    expect(a).toBe(b);
    // The org's catalog and the course file once each (the public catalog is already kept).
    expect(reads.n - before).toBe(2);
  });
});
