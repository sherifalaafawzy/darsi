import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalog, canManage, catalogEntry, catalogPath, idAllowed, isOwner, mediaPrefix, sizeMB, staleVersions, unitPath, unitPrefix, versionOf } from "../src/catalog";
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
  it("orders units by track, then level, then title", () => {
    const u = (id: string, track: Unit["track"], level: number, title: string) => catalogEntry({ ...ai1, id, track, level, title: { en: title } }, "public", 1, 1000);
    const cat = buildCatalog([u("c", "cyber", 1, "A"), u("b", "ai", 2, "A"), u("a", "ai", 1, "Z"), u("d", "ai", 1, "B")]);
    expect(cat.units.map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
    expect(cat.version).toBe(1);
  });
});
