import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_TRACKS } from "../src/content/tracks";
import { AUDIENCES, type Placement } from "../src/content/types";
import { placementBank, placementNext, placementProgress, type PlaceState } from "../src/screens/Onboarding";
import { arabicStrings, isolatesOverLines, isolatesPair, reisolate } from "../../../scripts/lib/isolates.mjs";

// The onboarding check (public/content/placement.json): every track it covers has three questions for each audience
// and level, in English and Arabic, each with a right answer and an explanation.
const placement = JSON.parse(readFileSync(join(__dirname, "../public/content/placement.json"), "utf8")) as Placement;
const questions = placement.questions;
const texts = (q: Placement["questions"][number]) => [q.prompt, q.explain, ...(q.type === "choice" ? q.options.map((o) => o.text) : [])];

describe("placement.json", () => {
  it("is version 5, with unique ids", () => {
    expect(placement.version).toBe(5);
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
        const n = questions.filter((q) => !q.teach && q.track === track && q.audience === audience && q.level === level).length;
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

  it("has three university questions for teachers at the top level of every built-in track", () => {
    for (const t of BUILTIN_TRACKS) {
      const uni = questions.filter((q) => q.teach === "university" && q.track === t.id);
      expect(uni.length, t.id).toBe(3);
      for (const q of uni) { expect(q.audience, q.id).toBe("teachers"); expect(q.level, q.id).toBe(t.levels); }
    }
  });

  it("asks university questions at the top level only of university teachers", () => {
    const first = <T,>(q: T[]) => q;
    for (const t of BUILTIN_TRACKS) {
      const uni = placementBank(questions, t.id, "teachers", t.levels, first, true);
      const school = placementBank(questions, t.id, "teachers", t.levels, first);
      expect(uni[t.levels - 1].every((q) => q.teach === "university"), t.id).toBe(true);
      expect(uni[t.levels - 1].length, t.id).toBe(2);
      expect(school.flat().some((q) => q.teach), t.id).toBe(false);
      expect(uni.slice(0, -1).flat().some((q) => q.teach), t.id).toBe(false);
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

  it("offers three or four different answers, which the check labels A to D", () => {
    for (const q of questions) if (q.type === "choice") {
      expect(q.options.length, q.id).toBeLessThanOrEqual(4);
      for (const lang of ["en", "ar"] as const) expect(new Set(q.options.map((o) => o.text[lang])).size, `${q.id} ${lang}`).toBe(q.options.length);
    }
  });

  it("shows code longer than a phrase as a snippet (a loop on one line is not Python)", () => {
    for (const q of questions) {
      if (q.snippet) {
        expect(["python", "sql"], q.id).toContain(q.snippet.lang);
        expect(q.snippet.text.trim(), q.id).toBeTruthy();
      }
      expect(q.prompt.en, q.id).not.toMatch(/\bfor \w+ in [^:]+:\s*(if|while|for)\b/);
    }
  });

  it("keeps code and formulas in Arabic text in left-to-right isolates", () => {
    const strings = arabicStrings(JSON.parse(JSON.stringify(placement)), "placement") as [string, string, unknown][];
    expect(strings.flatMap(([path, text]) => [
      ...(reisolate(text) !== text ? [`${path}: needs isolates (scripts/lib/isolates.mjs reisolate)`] : []),
      ...(!isolatesPair(text) ? [`${path}: isolates don't pair up`] : []),
      ...isolatesOverLines(text).map(() => `${path}: an isolate holds a line break`),
    ])).toEqual([]);
  });

  it("is the same as the track files (content/placement) for every question they hold", () => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const track of ["code", "data", "agents", "opt", "aisec", "data-science"]) {
      const file = JSON.parse(readFileSync(join(__dirname, `../../../content/placement/${track}.json`), "utf8")) as Pick<Placement, "questions">;
      for (const q of file.questions) expect(byId.get(q.id), q.id).toEqual(q);
    }
  });
});

describe("the check's progress bar", () => {
  // Every way through one track: from each start level, any run of right and wrong answers.
  const walks = (start: number, top: number) => {
    const out: boolean[][] = [];
    const go = (s: PlaceState, path: boolean[]) => {
      for (const ok of [true, false]) {
        const r = placementNext(s, ok, top);
        if ("level" in r) out.push([...path, ok]); else go(r.state, [...path, ok]);
      }
    };
    go({ level: start, asked: 0 }, []);
    return out;
  };

  it("starts empty, only ever moves forward, and fills a track's share only when the next track starts", () => {
    const top = 4, tracks = 3;
    for (let start = 1; start <= top; start++) for (const path of walks(start, top)) for (let ti = 0; ti < tracks; ti++) {
      const bar = path.map((_, i) => placementProgress(ti, tracks, i + 1, start, top));
      expect(bar[0]).toBeCloseTo((ti / tracks) * 100); // a university teacher's first question is no longer at 75%
      for (let i = 1; i < bar.length; i++) expect(bar[i]).toBeGreaterThan(bar[i - 1]); // a miss no longer shrinks it
      expect(bar[bar.length - 1]).toBeLessThan(((ti + 1) / tracks) * 100);
    }
  });
});
