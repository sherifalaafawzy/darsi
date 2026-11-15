// A lesson's video from Lesson Studio (scripts/lib/studio-media.mjs, used by scripts/import-media.mjs): English and Arabic
// always, and French, Spanish, German or Portuguese when Lesson Studio has voiced and rendered them.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lightLang, type VideoStep } from "../src/content/types";
import { EXTRA_LANGS, sceneTimes, storyboard, studioMedia, videoLangs } from "../../../scripts/lib/studio-media.mjs";

const ID = "x-1-1-1";
let root: string, studio: string;
const put = (p: string, data: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "darsi-"));
  studio = join(root, "studio");
  const d = join(studio, "content", "darsi");
  put(join(d, "source", `${ID.toUpperCase()}.json`), { video: {
    scenes: [{ n: 1, start: "0:00", narration: "Hello there." }, { n: 2, start: "0:10", narration: "Which first?" }],
    chapters: [{ at: "0:00", label: "Start" }, { at: "0:10", label: "Check" }], checkpoints: [{ prompt: "Which first?" }],
  } });
  const overlay = (a: string, b: string) => ({ title: "t", scenes: { 1: { narration: a }, 2: { narration: b } }, checkpoints: [] });
  put(join(d, ID, "ar-EG.json"), overlay("أهلًا.", "أنهي الأول؟"));
  put(join(d, ID, "fr.json"), overlay("Bonjour.", "Lequel d’abord?"));
  put(join(d, ID, "es.json"), overlay("Hola.", "¿Cuál primero?"));
  // Scene 2 asks a quick check, so the MP4 holds still after it (scenes after it start later).
  put(join(d, "lessons", ID, "scenes.json"), { scenes: [{ id: "s01", check: { id: "c" } }, { id: "s02" }] });
  const langs: [string, number, boolean][] = [["en", 10, true], ["ar-EG", 11, true], ["fr", 12, true], ["es", 13, false]];
  for (const [sl, first, narrated] of langs) {
    put(join(d, "lessons", ID, "timing", `${sl}.json`), { scenes: [{ start: 0, end: first }, { start: first, end: first + 9 }] });
    const v = join(studio, "out", "videos", ID, sl);
    put(join(v, "video.json"), { narrated, seconds: first + 9 + 4, checks: [{ at: first }] });
    put(join(v, "240p.mp4"), "x".repeat(1000 * first));
    put(join(v, "captions.vtt"), "WEBVTT\n");
    const pkg = join(studio, "out", "packages", ID);
    put(join(pkg, "timing", `${sl}.json`), "{}");
    put(join(pkg, "audio", `${sl}.opus`), "a".repeat(2048));
    put(join(pkg, "captions", `${sl}.vtt`), "WEBVTT\n");
  }
  put(join(studio, "out", "packages", ID, "manifest.json"), "{}");
  put(join(studio, "out", "packages", ID, "scenes.json"), "{}");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("a lesson's video in more languages", () => {
  it("takes every language Lesson Studio voiced and rendered, under Darsi's codes, and leaves out the rest", () => {
    expect(EXTRA_LANGS).toEqual({ fr: "fr", es: "es", de: "de", pt: "pt-BR" });
    // Spanish has a storyboard and a timing, but its video isn't narrated yet.
    expect(videoLangs(studio, ID)).toEqual({ en: "en", ar: "ar-EG", fr: "fr" });
    const m = studioMedia(root, studio, ID, ID);
    expect(Object.keys(m.sources)).toEqual(["en", "ar", "fr"]);
    expect(m.sources.fr).toBe(`/media/${ID}/video-fr.mp4`);
    expect(m.captions.fr).toBe(`/media/${ID}/captions-fr.vtt`);
    expect(existsSync(join(root, "content", "media", ID, "video-fr.mp4"))).toBe(true);
    expect(m.light.langs).toEqual({ en: "en", ar: "ar-EG", fr: "fr" });
    expect(Object.keys(m.light.sizeKB)).toEqual(["en", "ar", "fr"]);
    expect(m.light.files["timing/fr.json"]).toBe(`/media/${ID}/light/timing/fr.json`);
    expect(m.light.files["captions/fr.vtt"]).toBeUndefined();
    // The longest language, and the largest file.
    expect(m.duration).toBe(25);
    expect(m.sizeMB).toBe(0);
  });

  it("times each language's scenes in its own video, holds included", () => {
    const at = sceneTimes(studio, ID, videoLangs(studio, ID));
    expect(at).toEqual({ en: [0, 14], ar: [0, 15], fr: [0, 16] });
    // Without the languages, English and Arabic as before.
    expect(Object.keys(sceneTimes(studio, ID))).toEqual(["en", "ar"]);
  });

  it("reads every translation of the storyboard, by Darsi language", () => {
    const { arabic, overlays } = storyboard(studio, ID);
    expect(Object.keys(overlays)).toEqual(["ar", "fr", "es"]);
    expect(overlays.ar).toBe(arabic);
    expect(overlays.fr!.scenes[2]!.narration).toBe("Lequel d’abord?");
  });

  it("plays the page language's light lesson when the step has it, else the English one", () => {
    const step = { light: { files: {}, langs: { en: "en", ar: "ar-EG", fr: "fr", pt: "pt-BR" } } } as unknown as VideoStep;
    expect(lightLang(step, "fr")).toBe("fr");
    expect(lightLang(step, "pt")).toBe("pt-BR");
    expect(lightLang(step, "de")).toBe("en");
    expect(lightLang(step, "ar")).toBe("ar-EG");
  });
});
