// @vitest-environment node
// Every course in content/units (the starting curriculum, published by `npm run seed`) is complete: no errors, no
// warnings (Arabic included, known competencies), and every lesson follows docs/CONTENT.md.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETENCIES } from "../src/content/competencies";
import { GRADED, type Unit } from "../src/content/types";
import { validateUnit } from "../src/content/validate";
import { LAB_METAS } from "../src/labs/catalog";
import { figurePaths, kitFiles, mediaPathOf, mediaPaths, withKitUrls } from "../../../scripts/lib/kits.mjs";
import { arabicStrings, isolatesOverLines, isolatesPair, reisolate } from "../../../scripts/lib/isolates.mjs";
import { figureOf } from "../src/content/figure";
import { runInNode } from "./code/node";

const DIR = join(__dirname, "../../../content/units");
const KITS = join(__dirname, "../../../content/kits");
const PACKS = join(__dirname, "../../../content/packs");
const units = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Unit);
const codes = new Set(COMPETENCIES.map((c) => c.code));
/**
 * Code and formulas in Arabic text sit in left-to-right isolates exactly as `node scripts/isolate-code.mjs --fix` puts
 * them (a half-isolated formula fails too), the isolates pair up, and none holds a line break.
 */
const isolateProblems = (strings: [string, string, unknown][]) => strings.flatMap(([path, text]) => [
  ...(reisolate(text) !== text ? [`${path}: run node scripts/isolate-code.mjs --fix`] : []),
  ...(!isolatesPair(text) ? [`${path}: isolates don't pair up`] : []),
  ...isolatesOverLines(text).map(() => `${path}: an isolate holds a line break`),
]);

describe.each(units.map((u) => [u.id, u] as const))("course %s", (_, unit) => {
  it("validates with no errors and no warnings", () => {
    expect(validateUnit(unit, { competencies: codes }).map((i) => `${i.level} ${i.code} lesson ${i.at.lesson} step ${i.at.step} ${i.at.field}`)).toEqual([]);
  });

  it("follows the content rules in docs/CONTENT.md in every lesson", () => {
    for (const l of unit.lessons) {
      const types = l.steps.map((s) => s.type);
      // Never two steps of the same type in a row; at least three question types; every graded step says why.
      if (unit.kind !== "capstone") types.forEach((t, i) => { if (i) expect(t, `${l.id}: two ${t} steps in a row`).not.toBe(types[i - 1]); });
      if (unit.kind !== "capstone") expect(new Set(types.filter((t) => GRADED.has(t))).size, `${l.id}: question types`).toBeGreaterThanOrEqual(3); // capstones: no quizzes, no score
      for (const s of l.steps) if (GRADED.has(s.type)) expect(s.explain?.en, `${l.id} ${s.id}: explain`).toBeTruthy();
      if (unit.kind === "capstone") expect(l.slides.length, `${l.id}: slides`).toBeGreaterThanOrEqual(3); // own kit deck shape
      else expect(l.slides.map((s) => s.layout), `${l.id}: slides`).toEqual(["title", "bullets", "bullets", "activity", "questions", "exit"]);
      for (const s of l.steps) if (s.type === "lab") expect(LAB_METAS.map((m) => m.id), `${l.id}: lab ${s.tool}`).toContain(s.tool);
    }
  });

  // Code runs as learners' phones run it (tests/code/node.ts): every solution passes its tests, no starter does.
  it("has code steps whose solution passes and whose starter doesn't", async () => {
    for (const l of unit.lessons) for (const s of l.steps) {
      if (s.type !== "code") continue;
      const req = (code: string) => (s.lang === "sql" ? { lang: s.lang, code, setup: s.setup, solution: s.solution } : { lang: s.lang, code, tests: s.tests, files: s.files });
      const sol = await runInNode(req(s.solution));
      expect(sol.filter((r) => !r.passed), `${l.id} ${s.id}: the solution fails`).toEqual([]);
      expect((await runInNode(req(s.starter))).every((r) => r.passed), `${l.id} ${s.id}: the starter already passes`).toBe(false);
    }
  });

  // `npm run seed` swaps app paths for Storage URLs (scripts/lib/kits.mjs); the functions check that form when publishing.
  it("is still valid as published, with kits and media in Storage", () => {
    const url = (p: string) => `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(p)}?alt=media`;
    const media = new Map(mediaPaths(unit).map((p) => [p, url(mediaPathOf(unit.id, p, "0123456789ab"))]));
    const published = withKitUrls(unit, url, { has: (f) => existsSync(join(KITS, f)), media });
    expect(validateUnit(published, { competencies: codes }).filter((i) => i.level === "error")).toEqual([]);
    expect(JSON.stringify(published)).not.toMatch(/"\/kits\//);
    // Pictures in the text point at Storage too, and the app shows them (content/figure.ts); no /media/ path is left.
    const shown = published.lessons.flatMap((l) => l.steps.flatMap((s) => (s.type === "read" ? [s.body] : s.type === "project" ? (s.setup ?? []).map((x) => x.body) : [])))
      .flatMap((t) => Object.values(t).flatMap((v) => (v ?? "").split(/\n\s*\n/))).map((p) => figureOf(p, "test")).filter(Boolean);
    expect(shown.length).toBeGreaterThanOrEqual(figurePaths(unit).length);
    expect(shown.filter((f) => !f!.src.startsWith("https://"))).toEqual([]);
    expect(JSON.stringify(published)).not.toMatch(/\(\/[⁦-⁩]?media\//);
  });

  // `npm run kits` builds them (English is always required; some kits exist in English only).
  it("has every kit file it names in content/kits", () => {
    expect(kitFiles(unit, (f) => existsSync(join(KITS, f))).map((k) => k.file).filter((f) => !existsSync(join(KITS, f)))).toEqual([]);
  });

  it("never uses the middle dot in Arabic", () => {
    const text = JSON.stringify(unit);
    for (const m of text.matchAll(/"ar":\s*"([^"]*)"/g)) expect(m[1]).not.toContain("·");
  });

  // Beside Arabic-Indic digits the Greek ε is drawn like ٤ («٤ε» reads «٤٤»): write «إبسلون» (docs/curriculum/ar-lingo.md).
  it("never puts a bare ε next to an Arabic-Indic digit in Arabic", () => {
    expect(arabicStrings(JSON.parse(JSON.stringify(unit))).filter(([, t]) => /[٠-٩]\s?ε|ε\s?[٠-٩]/.test(t)).map(([p]) => p)).toEqual([]);
  });

  it("keeps code and formulas in Arabic text in left-to-right isolates (node scripts/isolate-code.mjs --fix)", () => {
    expect(isolateProblems(arabicStrings(JSON.parse(JSON.stringify(unit))))).toEqual([]);
  });
});

// Course packs (content/packs) are printed in the Arabic course-pack PDF: their code and formulas need isolates too.
describe.each(readdirSync(PACKS).filter((f) => f.endsWith(".json")).map((f) => [f] as const))("course pack %s", (f) => {
  const pack = JSON.parse(readFileSync(join(PACKS, f), "utf8"));
  it("keeps code and formulas in Arabic text in left-to-right isolates (node scripts/isolate-code.mjs --fix)", () => {
    expect(isolateProblems(arabicStrings(pack, f))).toEqual([]);
  });
  it("never uses the middle dot in Arabic", () => {
    for (const m of JSON.stringify(pack).matchAll(/"ar":\s*"([^"]*)"/g)) expect(m[1]).not.toContain("·");
  });
  // build-kits prints a criterion's levels[0..3] under Excellent, Good, Developing and Not yet: the best work comes first.
  it("lists each rubric criterion's levels best first", () => {
    const weakest = /^(none|vague|missing|incorrect|unclear|wrong|weak|fails|does not|not |one run|out(side)? of scope)/i;
    for (const r of pack.rubric ?? []) expect(r.levels[0].en, `${f}: ${r.name.en}`).not.toMatch(weakest);
  });
});
