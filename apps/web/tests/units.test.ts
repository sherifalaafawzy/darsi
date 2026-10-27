// Every course in content/units (the starting curriculum, published by `npm run seed`) is complete: no errors, no
// warnings (Arabic included, known competencies), and every lesson follows docs/CONTENT.md.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETENCIES } from "../src/content/competencies";
import { GRADED, type Unit } from "../src/content/types";
import { validateUnit } from "../src/content/validate";
import { LAB_METAS } from "../src/labs/catalog";
import { kitFiles, mediaPathOf, mediaPaths, withKitUrls } from "../../../scripts/lib/kits.mjs";

const DIR = join(__dirname, "../../../content/units");
const KITS = join(__dirname, "../../../content/kits");
const units = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Unit);
const codes = new Set(COMPETENCIES.map((c) => c.code));

describe.each(units.map((u) => [u.id, u] as const))("course %s", (_, unit) => {
  it("validates with no errors and no warnings", () => {
    expect(validateUnit(unit, { competencies: codes }).map((i) => `${i.level} ${i.code} lesson ${i.at.lesson} step ${i.at.step} ${i.at.field}`)).toEqual([]);
  });

  // The new curriculum keeps every rule in docs/CONTENT.md; ai-1, the first starting course, predates some of them.
  it.skipIf(unit.id === "ai-1")("follows the content rules in every lesson", () => {
    for (const l of unit.lessons) {
      const types = l.steps.map((s) => s.type);
      // Never two steps of the same type in a row; at least three question types; every graded step says why.
      types.forEach((t, i) => { if (i) expect(t, `${l.id}: two ${t} steps in a row`).not.toBe(types[i - 1]); });
      expect(new Set(types.filter((t) => GRADED.has(t))).size, `${l.id}: question types`).toBeGreaterThanOrEqual(3);
      for (const s of l.steps) if (GRADED.has(s.type)) expect(s.explain?.en, `${l.id} ${s.id}: explain`).toBeTruthy();
      expect(l.slides.map((s) => s.layout), `${l.id}: slides`).toEqual(["title", "bullets", "bullets", "activity", "questions", "exit"]);
      for (const s of l.steps) if (s.type === "lab") expect(LAB_METAS.map((m) => m.id), `${l.id}: lab ${s.tool}`).toContain(s.tool);
    }
  });

  // `npm run seed` swaps app paths for Storage URLs (scripts/lib/kits.mjs); the functions check that form when publishing.
  it("is still valid as published, with kits and media in Storage", () => {
    const url = (p: string) => `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(p)}?alt=media`;
    const media = new Map(mediaPaths(unit).map((p) => [p, url(mediaPathOf(unit.id, p, "0123456789ab"))]));
    const published = withKitUrls(unit, url, { has: (f) => existsSync(join(KITS, f)), media });
    expect(validateUnit(published, { competencies: codes }).filter((i) => i.level === "error")).toEqual([]);
    expect(JSON.stringify(published)).not.toMatch(/"\/kits\//);
  });

  // `npm run kits` builds them (English is always required; some kits exist in English only).
  it("has every kit file it names in content/kits", () => {
    expect(kitFiles(unit, (f) => existsSync(join(KITS, f))).map((k) => k.file).filter((f) => !existsSync(join(KITS, f)))).toEqual([]);
  });

  it("never uses the middle dot in Arabic", () => {
    const text = JSON.stringify(unit);
    for (const m of text.matchAll(/"ar":\s*"([^"]*)"/g)) expect(m[1]).not.toContain("·");
  });
});
