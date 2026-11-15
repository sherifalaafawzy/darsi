// The tutor's course cache (sfm-12): a track's search index is shared by every organization without courses of its
// own in that track, an organization's own courses still get theirs, an instance keeps a bounded number of indexes,
// and a load that fails isn't kept. The catalogs are honest about errors: only a missing file (Storage's 404) is an
// empty catalog, and a course whose file has gone since the catalog was read is "no such course", not an error.
// Storage is a map.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorUnit } from "../src/tutorCore";

const files = vi.hoisted(() => new Map<string, unknown>());
const reads = vi.hoisted(() => ({ n: 0, paths: [] as string[], fail: null as null | ((p: string) => boolean) }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  return { db: new FakeDb(), caller: () => ({ uid: "u1", role: "learner" }), str: (v: unknown) => String(v ?? "") };
});
vi.mock("../src/settings.js", () => ({ superOn: async () => true }));
vi.mock("../src/storage.js", () => ({
  // A missing file is Storage's 404 (an ApiError with code 404); `fail` picks reads that fail some other way.
  bucket: () => ({ file: (p: string) => ({ download: async () => {
    reads.n++; reads.paths.push(p);
    if (reads.fail?.(p)) throw Object.assign(new Error("backend unavailable"), { code: 503 });
    if (!files.has(p)) throw Object.assign(new Error("No such object"), { code: 404 });
    return [Buffer.from(JSON.stringify(files.get(p)))];
  } }) }),
}));
vi.mock("../src/agent.js", () => ({ AgentError: class extends Error {}, askAgent: async () => null, openSession: async () => "s1" }));

const { trackIndex, cachedCount, loadUnit } = await import("../src/tutor");
const readsOf = (p: string) => reads.paths.filter((x) => x === p).length;

const unit = (id: string, track = "ai"): TutorUnit => ({ id, track, level: 1, title: { en: id }, lessons: [
  { id: `${id}-1`, title: { en: "One" }, steps: [{ id: "r", type: "read", title: { en: "Words" }, body: { en: `About ${id}.` } }] },
] });

afterEach(() => { vi.useRealTimers(); reads.fail = null; });
beforeEach(() => {
  reads.paths.length = 0;
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

describe("the tutor's catalogs are honest about errors", () => {
  const cat = (org: string) => `orgs/${org}/catalog.json`, file = (org: string, id: string, v = 1) => `orgs/${org}/units/${id}/v${v}.json`;
  const publish = (org: string, ids: string[], v = 1) => {
    files.set(cat(org), { units: ids.map((id) => ({ id, track: "ai", src: file(org, id, v) })) });
    for (const id of ids) files.set(file(org, id, v), unit(id));
  };

  it("don't keep a failed read as an empty catalog: the next ask reads again", async () => {
    publish("down1", ["d1"]);
    reads.fail = (p) => p === cat("down1");
    await expect(loadUnit("d1", "down1")).rejects.toThrow(/unavailable/);
    await expect(trackIndex(unit("ai-1-1"), "down1", "en")).rejects.toThrow(/unavailable/);
    // Storage is back: the course is there at once (before, "no such course" for five minutes on this instance).
    reads.fail = null;
    expect((await loadUnit("d1", "down1"))?.id).toBe("d1");
    expect(readsOf(cat("down1"))).toBe(3);
  });

  it("read a missing catalog (404) as empty, and keep that", async () => {
    expect(await loadUnit("anything", "none1")).toBeNull();
    expect(await loadUnit("ai-1-1", "none1")).toMatchObject({ id: "ai-1-1" }); // the public courses are still there
    expect(readsOf(cat("none1"))).toBe(1);
    // A catalog file without a list of units is empty too, not an error.
    files.set(cat("odd1"), { version: 1 });
    expect(await loadUnit("anything", "odd1")).toBeNull();
  });

  it("a course unpublished since the catalog was read is null, after reading the catalogs once more", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    publish("gone1", ["g1", "g2"]);
    expect((await loadUnit("g1", "gone1"))?.id).toBe("g1"); // this instance now keeps the catalog that names g2
    // g2 is unpublished: its file goes and the catalog no longer names it.
    files.delete(file("gone1", "g2"));
    files.set(cat("gone1"), { units: [{ id: "g1", track: "ai", src: file("gone1", "g1") }] });
    vi.setSystemTime(Date.now() + 60_000); // within the five minutes the catalog is kept
    reads.paths.length = 0;
    expect(await loadUnit("g2", "gone1")).toBeNull(); // before: the file's 404 was thrown into the caller
    expect(readsOf(file("gone1", "g2"))).toBe(1);
    expect(readsOf(cat("gone1"))).toBe(1);
    expect(readsOf("content/catalog.json")).toBe(1);
    // The catalog read again is kept: asking once more reads nothing.
    reads.paths.length = 0;
    expect(await loadUnit("g2", "gone1")).toBeNull();
    expect(reads.paths).toEqual([]);
  });

  it("a course published again since the catalog was read is found at its new version", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    publish("again1", ["r0", "r1"]);
    await loadUnit("r0", "again1");
    files.delete(file("again1", "r1"));
    files.set(cat("again1"), { units: [{ id: "r0", track: "ai", src: file("again1", "r0") }, { id: "r1", track: "ai", src: file("again1", "r1", 2) }] });
    files.set(file("again1", "r1", 2), { ...unit("r1"), title: { en: "r1, second edition" } });
    vi.setSystemTime(Date.now() + 60_000);
    expect((await loadUnit("r1", "again1"))?.title.en).toBe("r1, second edition");
  });

  it("a course file that is missing right after its catalog was read is null without reading the catalog again", async () => {
    files.set(cat("fresh1"), { units: [{ id: "f1", track: "ai", src: file("fresh1", "f1") }] });
    expect(await loadUnit("f1", "fresh1")).toBeNull();
    expect(readsOf(cat("fresh1"))).toBe(1);
  });

  it("any other error reading a course file is still an error, and isn't kept", async () => {
    publish("flaky1", ["k1"]);
    reads.fail = (p) => p === file("flaky1", "k1");
    await expect(loadUnit("k1", "flaky1")).rejects.toThrow(/unavailable/);
    reads.fail = null;
    expect((await loadUnit("k1", "flaky1"))?.id).toBe("k1");
  });

  it("a track's index is built from the courses still there when one's file has gone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    publish("part1", ["p1", "p2"]);
    await loadUnit("p1", "part1");
    files.delete(file("part1", "p2")); // gone, while this instance's catalog still names it
    vi.setSystemTime(Date.now() + 60_000);
    reads.paths.length = 0;
    const ix = JSON.stringify(await trackIndex(unit("p1"), "part1", "en"));
    expect(ix).toContain("About p1.");
    expect(ix).not.toContain("About p2.");
  });
});
