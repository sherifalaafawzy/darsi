import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_TRACKS } from "../src/content/tracks";
import { AUDIENCES, type Placement } from "../src/content/types";

// The onboarding check (public/content/placement.json): every track it covers has three questions for each audience
// and level, in English and Arabic, each with a right answer and an explanation.
const placement = JSON.parse(readFileSync(join(__dirname, "../public/content/placement.json"), "utf8")) as Placement;
const questions = placement.questions;
const texts = (q: Placement["questions"][number]) => [q.prompt, q.explain, ...(q.type === "choice" ? q.options.map((o) => o.text) : [])];

describe("placement.json", () => {
  it("is version 4, with unique ids", () => {
    expect(placement.version).toBe(4);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it("asks only about built-in tracks, for an audience, at a level the track has", () => {
    const tracks = new Map(BUILTIN_TRACKS.map((t) => [t.id, t.levels]));
    for (const q of questions) {
      expect(tracks.has(q.track), q.id).toBe(true);
      expect(AUDIENCES, q.id).toContain(q.audience);
      expect(q.level, q.id).toBeGreaterThanOrEqual(1);
      expect(q.level, q.id).toBeLessThanOrEqual(tracks.get(q.track)!);
    }
  });

  it("has three questions for every audience and level of each track it covers", () => {
    for (const track of new Set(questions.map((q) => q.track))) {
      const levels = BUILTIN_TRACKS.find((t) => t.id === track)!.levels;
      for (const audience of AUDIENCES) for (let level = 1; level <= levels; level++) {
        const n = questions.filter((q) => q.track === track && q.audience === audience && q.level === level).length;
        expect(n, `${track} ${audience} level ${level}`).toBe(3);
      }
    }
  });

  it("covers every built-in track, and includes every question of the track files", () => {
    expect(new Set(questions.map((q) => q.track))).toEqual(new Set(BUILTIN_TRACKS.map((t) => t.id)));
    const ids = new Set(questions.map((q) => q.id));
    for (const track of ["code", "data", "agents", "opt", "aisec", "data-science"]) {
      const file = JSON.parse(readFileSync(join(__dirname, `../../../content/placement/${track}.json`), "utf8")) as Pick<Placement, "questions">;
      for (const q of file.questions) {
        expect(ids.has(q.id), q.id).toBe(true);
        expect(q.track, q.id).toBe(track);
      }
    }
  });

  it("has a right answer, and every text in English and Arabic", () => {
    for (const q of questions) {
      expect(["choice", "truefalse"], q.id).toContain(q.type);
      if (q.type === "choice") {
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
        expect(q.options.map((o) => o.id), q.id).toContain(q.answer);
      } else expect(typeof q.answer, q.id).toBe("boolean");
      for (const t of texts(q)) {
        expect(t?.en?.trim(), q.id).toBeTruthy();
        expect(t?.ar?.trim(), q.id).toBeTruthy();
        expect(t!.ar, `${q.id}: "·" reads as a zero in Arabic`).not.toContain("·");
      }
    }
  });
});
