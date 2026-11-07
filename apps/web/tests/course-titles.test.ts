// admin/courseTitles.json: every course in content/units and content/retired by id, so staff screens name a course
// that is no longer published (54 were unpublished live) instead of showing its raw id. Written by
// apps/web/scripts/course-titles.mjs: when this fails after a course was added, renamed or retired, run that again.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import titles from "../src/admin/courseTitles.json";
import { courseTitle, knownCourse } from "../src/admin/courseTitles";

const ROOT = resolve(__dirname, "../../..");
const sources = ["content/units", "content/retired"].flatMap((dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(ROOT, dir, f), "utf8")) as { id: string; track: string; level: number; title: { en: string; ar?: string } }));
const map = titles as Record<string, { title: { en: string; ar?: string }; track: string; level: number }>;
const L = (x?: { en: string; ar?: string }) => x?.en ?? "";

describe("course titles for staff screens", () => {
  it("covers every course in content/units and content/retired, with its current title, track and level", () => {
    expect(sources.length).toBeGreaterThan(50);
    for (const u of sources) {
      // A published source wins over a retired one with the same id (the script reads content/units first).
      if (!map[u.id]) throw new Error(`${u.id} is missing from admin/courseTitles.json: run node apps/web/scripts/course-titles.mjs`);
      if (sources.find((x) => x.id === u.id) !== u) continue;
      expect({ id: u.id, ...map[u.id] }).toEqual({ id: u.id, title: { en: u.title.en, ...(u.title.ar ? { ar: u.title.ar } : {}) }, track: u.track, level: u.level });
    }
    expect(Object.keys(map).sort()).toEqual([...new Set(sources.map((u) => u.id))].sort());
  });

  it("names a published course from the catalog, one unpublished since from the sources, and anything else by its id", () => {
    const catalog = [{ id: "ai-1-1", title: { en: "AI basics (live)" } }];
    expect(courseTitle("ai-1-1", catalog, L)).toEqual({ text: "AI basics (live)", gone: false, known: true });
    expect(courseTitle("data-s1", catalog, L)).toEqual({ text: map["data-s1"].title.en, gone: true, known: true });
    expect(courseTitle("org-own-7", catalog, L)).toEqual({ text: "org-own-7", gone: true, known: false });
    // While the catalog loads, nothing is said to be gone.
    expect(courseTitle("data-s1", undefined, L).gone).toBe(false);
    expect(knownCourse("constructor")).toBeUndefined();
  });

  it("is imported only by staff chunks, never by startup code", () => {
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /courseTitles/.test(readFileSync(p, "utf8"))) users.push(p.slice(join(ROOT, "apps/web/src").length + 1).replace(/\\/g, "/"));
      }
    };
    walk(join(ROOT, "apps/web/src"));
    expect(users.length).toBeGreaterThan(0);
    for (const f of users) expect(f).toMatch(/^(admin|results)\//);
  });
});
