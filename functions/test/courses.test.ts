// The published courses as the server sees them (courses.ts), which decide whether a lesson result is counted
// (progress.ts): a result that looks unknown when it arrives is never counted later, so "not published" must not come
// from what an instance happened to remember. A missing unit file is not remembered, and before giving up the catalogs
// are read again (unless they were read in the last 30 seconds, so results for lessons that really aren't published
// don't download the catalog every time).
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Storage: path → JSON; how often each path was downloaded; paths whose next download fails (a hiccup, not a 404). */
const store = vi.hoisted(() => ({ files: new Map<string, unknown>(), reads: new Map<string, number>(), broken: new Set<string>() }));
vi.mock("../src/storage.js", () => ({
  bucket: () => ({ file: (path: string) => ({ download: async () => {
    store.reads.set(path, (store.reads.get(path) ?? 0) + 1);
    if (store.broken.has(path)) throw Object.assign(new Error("Backend error"), { code: 503 });
    if (!store.files.has(path)) throw Object.assign(new Error(`No such object: ${path}`), { code: 404 });
    return [Buffer.from(JSON.stringify(store.files.get(path)))];
  } }) }),
}));
vi.useFakeTimers({ toFake: ["Date"] });

type Courses = typeof import("../src/courses");
let courses: Courses;
const reads = (path: string) => store.reads.get(path) ?? 0;
const PUBLIC = "content/catalog.json", ORG = "orgs/o1/catalog.json";
const unit = (id: string, lessons = [1, 2]) => ({
  id, track: "ai",
  lessons: lessons.map((n) => ({ id: `${id}-${n}`, competencies: ["AI.1", 7, "x".repeat(41)], steps: [{ type: n === 1 ? "choice" : "read" }] })),
});
/** Publishes `id` at `version` for an owner: the unit file, and the owner's catalog listing it (with what it listed). */
function publish(id: string, version = 1, catalog = PUBLIC) {
  const src = `${catalog.replace("catalog.json", "")}units/${id}/v${version}.json`;
  store.files.set(src, unit(id));
  const was = ((store.files.get(catalog) as { units: { id: string }[] } | undefined)?.units ?? []).filter((u) => u.id !== id);
  store.files.set(catalog, { version: 1, units: [...was, { id, track: "ai", src, version }] });
  return src;
}

beforeEach(async () => {
  store.files.clear(); store.reads.clear(); store.broken.clear();
  vi.setSystemTime(new Date("2026-11-11T08:00:00Z"));
  // Each test gets an instance that remembers nothing.
  vi.resetModules();
  courses = await import("../src/courses");
});

describe("lessonMeta", () => {
  it("finds a published lesson's unit, track, competencies and whether it is marked, for everyone or for its organization", async () => {
    publish("ai-1-1");
    publish("uab12cd34", 2, ORG);
    expect(await courses.lessonMeta("ai-1-1-1", null)).toEqual({ unitId: "ai-1-1", track: "ai", competencies: ["AI.1"], graded: true });
    expect(await courses.lessonMeta("ai-1-1-2", null)).toMatchObject({ unitId: "ai-1-1", graded: false });
    expect(await courses.lessonMeta("uab12cd34-1", "o1")).toMatchObject({ unitId: "uab12cd34" });
    // Another organization's course, or no organization: not theirs to count.
    expect(await courses.lessonMeta("uab12cd34-1", null)).toBeNull();
    expect(await courses.lessonMeta("uab12cd34-1", "o2")).toBeNull();
  });

  it("keeps what it read: one catalog and one unit file for many results", async () => {
    const src = publish("ai-1-1");
    for (let i = 0; i < 5; i++) expect(await courses.lessonMeta("ai-1-1-1", null)).toBeTruthy();
    expect(reads(PUBLIC)).toBe(1);
    expect(reads(src)).toBe(1);
  });

  it("does not remember a missing unit file", async () => {
    const src = publish("ai-1-1");
    const file = store.files.get(src);
    store.files.delete(src);
    expect(await courses.lessonMeta("ai-1-1-1", null)).toBeNull();
    // The file is there a moment later: the next result finds it, instead of half an hour of "unknown lesson".
    store.files.set(src, file);
    expect(await courses.lessonMeta("ai-1-1-1", null)).toMatchObject({ unitId: "ai-1-1" });
    expect(reads(src)).toBe(2);
    // Now it is remembered.
    await courses.lessonMeta("ai-1-1-2", null);
    expect(reads(src)).toBe(2);
  });

  it("finds a lesson published after this instance read the catalog, on its second look", async () => {
    publish("ai-1-1");
    expect(await courses.lessonMeta("ai-1-1-1", "o1")).toBeTruthy(); // reads both catalogs; the organization has none yet
    // New courses are published, for everyone and by the organization; a learner fetches one and finishes its first
    // lesson a few minutes later, while this instance still holds the catalogs from before (it keeps them 5 minutes).
    vi.advanceTimersByTime(60_000);
    publish("cyber-4-1");
    publish("uab12cd34", 1, ORG);
    vi.advanceTimersByTime(120_000);
    expect(await courses.lessonMeta("cyber-4-1-1", "o1")).toEqual({ unitId: "cyber-4-1", track: "ai", competencies: ["AI.1"], graded: true });
    expect(await courses.lessonMeta("uab12cd34-1", "o1")).toMatchObject({ unitId: "uab12cd34" });
    expect([reads(PUBLIC), reads(ORG)]).toEqual([2, 2]);
  });

  it("looks again when the version the catalog listed is gone (the course was published again since)", async () => {
    const v1 = publish("ai-1-1", 1);
    expect(await courses.catalogOf("public")).toHaveLength(1); // this instance holds the catalog, not the unit file
    vi.advanceTimersByTime(40_000);
    // Published twice more: v3 is listed, and v1 was deleted (the current and the previous version are kept).
    publish("ai-1-1", 2);
    const v3 = publish("ai-1-1", 3);
    store.files.delete(v1);
    expect(await courses.lessonMeta("ai-1-1-1", null)).toMatchObject({ unitId: "ai-1-1" });
    expect(reads(v1)).toBe(1);
    expect(reads(v3)).toBe(1);
    expect(reads(PUBLIC)).toBe(2);
  });

  it("reads the catalogs again at most every 30 seconds for lessons that really aren't published", async () => {
    publish("ai-1-1");
    await courses.lessonMeta("ai-1-1-1", "o1");
    expect([reads(PUBLIC), reads(ORG)]).toEqual([1, 1]);
    // An account's old results for a retired course (the summary is rebuilt from up to 1,000 of them), or made-up ids.
    for (let i = 0; i < 50; i++) expect(await courses.lessonMeta(`ai-9-9-${i}`, "o1")).toBeNull();
    expect([reads(PUBLIC), reads(ORG)]).toEqual([1, 1]);
    vi.advanceTimersByTime(courses.CATALOG_FRESH_MS + 1);
    for (let i = 0; i < 50; i++) expect(await courses.lessonMeta(`ai-9-9-${i}`, "o1")).toBeNull();
    expect([reads(PUBLIC), reads(ORG)]).toEqual([2, 2]);
  });

  it("says a Storage hiccup is an error, not an unknown lesson, and tries again next time", async () => {
    const src = publish("ai-1-1");
    store.broken.add(PUBLIC);
    await expect(courses.lessonMeta("ai-1-1-1", null)).rejects.toThrow("Backend error");
    store.broken.clear();
    store.broken.add(src);
    await expect(courses.lessonMeta("ai-1-1-1", null)).rejects.toThrow("Backend error");
    store.broken.clear();
    expect(await courses.lessonMeta("ai-1-1-1", null)).toMatchObject({ unitId: "ai-1-1" });
    // No catalog at all (nothing published yet) is nothing published, not an error.
    store.files.clear();
    vi.advanceTimersByTime(6 * 60_000);
    expect(await courses.lessonMeta("ai-1-1-9", null)).toBeNull();
  });
});
