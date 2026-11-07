import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allFigureUrls, buildCatalog, canManage, catalogEntry, catalogPath, figurePath, figureUrls, idAllowed, isOwner, mediaPrefix, sizeByLang, sizeMB, staleVersions, unitPath, unitPrefix, versionOf } from "../src/catalog";
import { FILES, transform } from "../scripts/copy-shared.mjs";
import type { Unit } from "../src/shared/types";
import { errorsOf, validateUnit } from "../src/shared/validate";

const root = join(__dirname, "..");
const ai1 = JSON.parse(readFileSync(join(root, "../content/retired/ai-1.json"), "utf8")) as Unit;

describe("shared copies", () => {
  it("match the web app's content types and validator", () => {
    for (const f of FILES) {
      const web = readFileSync(join(root, "../apps/web/src/content", f), "utf8");
      expect(readFileSync(join(root, "src/shared", f), "utf8"), `${f} is stale: run npm run build --prefix functions`).toBe(transform(web));
    }
  });
  it("validate the shipped unit the same way as the web app", () => {
    expect(errorsOf(validateUnit(ai1))).toEqual([]);
  });
});

describe("who may manage a unit", () => {
  const sup = { uid: "s", role: "superadmin" };
  const adminA = { uid: "a", role: "orgAdmin", orgId: "orgA" };
  const teacherA = { uid: "t", role: "teacher", orgId: "orgA" };
  const learner = { uid: "l", role: "learner" };
  it.each([
    [sup, "public", true], [sup, "orgA", true],
    [adminA, "orgA", true], [adminA, "orgB", false], [adminA, "public", false],
    [teacherA, "orgA", false], [learner, "public", false], [learner, "orgA", false],
  ])("%o on %s → %s", (c, owner, ok) => expect(canManage(c, owner)).toBe(ok));

  it("gives org units generated ids only", () => {
    expect(idAllowed("public", "ai-1")).toBe(true);
    expect(idAllowed("orgA", "uab12cd34")).toBe(true);
    expect(idAllowed("orgA", "ai-1")).toBe(false);
  });

  it("only accepts safe owner strings", () => {
    expect(isOwner("public")).toBe(true);
    expect(isOwner("Xy7_aB-9")).toBe(true);
    for (const bad of ["", "../x", "a/b", "a b", 3, null]) expect(isOwner(bad)).toBe(false);
  });
});

describe("Storage layout", () => {
  it("puts public units under content/ and org units under orgs/{orgId}/", () => {
    expect(catalogPath("public")).toBe("content/catalog.json");
    expect(unitPath("public", "u1", 3)).toBe("content/units/u1/v3.json");
    expect(catalogPath("orgA")).toBe("orgs/orgA/catalog.json");
    expect(unitPath("orgA", "u1", 1)).toBe("orgs/orgA/units/u1/v1.json");
    expect(unitPrefix("orgA", "u1")).toBe("orgs/orgA/units/u1/");
    expect(mediaPrefix("public", "u1")).toBe("content/media/u1/");
  });
  it("keeps the current and previous versions only", () => {
    const paths = [1, 2, 3, 4].map((v) => unitPath("public", "u1", v));
    expect(versionOf(paths[2])).toBe(3);
    expect(staleVersions(paths, 4)).toEqual(paths.slice(0, 2));
    expect(staleVersions(paths.slice(0, 1), 1)).toEqual([]);
  });
});

describe("catalog", () => {
  it("builds an entry the app can list and download", () => {
    const e = catalogEntry(ai1, "public", 2, 59_325);
    expect(e).toMatchObject({ id: "ai-1", track: "ai", level: 1, lessons: 3, available: true, src: "content/units/ai-1/v2.json", version: 2, owner: "public" });
    expect(e.sizeMB).toBe(sizeMB(ai1, 59_325));
    expect(e.sizeMB).toBeCloseTo(0.1 + 2.8 + 2.4 + 2.9, 5); // the JSON plus one language's videos
    expect(e).not.toHaveProperty("audience"); // a course for teachers
  });
  it("marks a course for students", () => {
    expect(catalogEntry({ ...ai1, audience: "students" }, "public", 1, 1000).audience).toBe("students");
    expect(catalogEntry({ ...ai1, audience: "teachers" }, "public", 1, 1000)).not.toHaveProperty("audience");
  });
  it("counts a light lesson instead of its MP4, since that's what a download stores", () => {
    const light = structuredClone(ai1);
    const v = light.lessons[0].steps.find((s) => s.type === "video")!;
    if (v.type === "video") v.light = { files: {}, langs: { en: "en", ar: "ar-EG" }, sizeKB: { en: 383, ar: 410 } };
    expect(sizeMB(light, 59_325)).toBeCloseTo(0.1 + 0.4 + 2.4 + 2.9, 5); // 410 KB, the larger language
  });
  it("counts each language's own kits and light lessons, and lists the largest for older phones", () => {
    const u = structuredClone(ai1);
    for (const l of u.lessons) {
      for (const s of l.steps) if (s.type === "video") { s.light = { files: {}, langs: { en: "en", ar: "ar-EG" }, sizeKB: { en: 512, ar: 512 } }; }
      l.kit = [
        { kind: "slides", title: { en: "Slides" }, pages: 1, formats: ["pdf", "pptx"], urls: {}, sizeKB: { en: { pdf: 100, pptx: 130 }, ar: { pdf: 300, pptx: 130 } } },
        { kind: "lesson-plan", title: { en: "Plan" }, pages: 1, formats: ["pdf"], urls: {}, sizeKB: { en: { pdf: 130 } } }, // Arabic falls back to English
        { kind: "video", title: { en: "Video" }, pages: 0, formats: ["mp4"], urls: {}, sizeKB: { en: { mp4: 5000 } } }, // never downloaded
      ];
    }
    const videos = u.lessons.reduce((a, l) => a + l.steps.filter((s) => s.type === "video").length, 0);
    const n = u.lessons.length;
    const by = sizeByLang(u, 100_000);
    expect(by.en).toBeCloseTo(Math.round((0.1 + videos * 0.5 + n * 360 / 1024) * 10) / 10, 5);
    expect(by.ar).toBeCloseTo(Math.round((0.1 + videos * 0.5 + n * 560 / 1024) * 10) / 10, 5);
    const e = catalogEntry(u, "public", 1, 100_000);
    expect(e.sizeByLang).toEqual(by);
    expect(e.sizeMB).toBe(by.ar);
  });
  it("counts the pictures in the text that each language downloads (the capstones' screenshots)", () => {
    const u = structuredClone(ai1);
    const shot = (name: string) => `https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fmedia%2Fcapstone-shared%2F${name}.jpg?alt=media`;
    const read = u.lessons[0].steps.find((s) => s.type === "read");
    if (read?.type !== "read") throw new Error("ai-1 has a reading");
    // English shows one picture twice; Arabic a different one, with isolate marks in its path (read past, as the app does).
    read.body = {
      en: `Open the repository.\n\n![The green Code button](${shot("code")})\n\nThen again:\n\n![The green Code button](${shot("code")})\n\n![An app path](/media/x.jpg)`,
      ar: `افتح المستودع.\n\n![زر Code الأخضر](\u2066${shot("code-ar")}\u2069)`,
    };
    expect(figureUrls(u, "en")).toEqual([shot("code")]);
    expect(figureUrls(u, "ar")).toEqual([shot("code-ar")]);
    expect(figureUrls(u, "fr")).toEqual([shot("code")]); // no French text: the English pictures
    expect(allFigureUrls(u).sort()).toEqual([shot("code"), shot("code-ar")].sort());
    const kb = { [shot("code")]: 512, [shot("code-ar")]: 1024 };
    const without = sizeByLang(u, 100_000), withPics = sizeByLang(u, 100_000, kb);
    expect(withPics.en).toBeCloseTo(without.en + 0.5, 5);
    expect(catalogEntry(u, "public", 1, 100_000, kb).sizeByLang).toEqual(withPics);
    // Only this bucket's published course media is sized; the path is decoded and checked.
    expect(figurePath(shot("code"), "darsi-f0685")).toBe("content/media/capstone-shared/code.jpg");
    expect(figurePath(`http://127.0.0.1:9199/v0/b/demo-darsi.appspot.com/o/content%2Fmedia%2Fx%2Fa.jpg?alt=media`, "demo-darsi.appspot.com")).toBe("content/media/x/a.jpg");
    expect(figurePath(shot("code"), "another-bucket")).toBeNull();
    expect(figurePath("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/submissions%2Fx%2Fy.jpg", "darsi-f0685")).toBeNull();
    expect(figurePath("https://firebasestorage.googleapis.com/v0/b/darsi-f0685/o/content%2Fmedia%2F..%2Fsecret.json", "darsi-f0685")).toBeNull();
  });
  it("orders units by track, then level, then title", () => {
    const u = (id: string, track: Unit["track"], level: number, title: string) => catalogEntry({ ...ai1, id, track, level, title: { en: title } }, "public", 1, 1000);
    const cat = buildCatalog([u("c", "cyber", 1, "A"), u("b", "ai", 2, "A"), u("a", "ai", 1, "Z"), u("d", "ai", 1, "B")]);
    expect(cat.units.map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
    expect(cat.version).toBe(1);
  });
});
