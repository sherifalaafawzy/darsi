// A video step with a light lesson (Lesson Studio) plays it first, in the teacher's language, with the MP4 as a choice.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VideoStep } from "../src/content/types";
import { unitAssetUrls } from "../src/content/load";
import { I18nProvider } from "../src/i18n";
import { setLightPlayer } from "../src/lesson/LightLesson";
import { StepView } from "../src/lesson/StepView";

const m = vi.hoisted(() => ({ createPlayer: vi.fn(), destroy: vi.fn() }));
setLightPlayer(async () => ({ createPlayer: m.createPlayer })); // App registers the real player's lazy chunk

const file = (p: string) => `https://storage.test/${encodeURIComponent(p)}`;
const step: VideoStep = {
  id: "v1", type: "video", prompt: { en: "Watch" }, title: { en: "Rules or learning?", ar: "قواعد أم تعلّم؟" },
  src: null, sources: { en: "https://storage.test/video-en.mp4", ar: "https://storage.test/video-ar.mp4" },
  duration: 169, sizeMB: 1.1, transcript: { en: "Some apps follow rules.", ar: "بعض التطبيقات تتبع قواعد." },
  checkpoint: { at: 84, atBy: { ar: 83 }, question: { id: "cp", type: "truefalse", prompt: { en: "A rule is learned." }, answer: false, explain: { en: "Rules are written." } } },
  light: {
    files: Object.fromEntries(["manifest.json", "scenes.json", "timing/en.json", "timing/ar-EG.json", "audio/en.opus", "audio/ar-EG.opus", "audio/en.m4a", "audio/ar-EG.m4a"].map((p) => [p, file(p)])),
    langs: { en: "en", ar: "ar-EG" }, sizeKB: { en: 383, ar: 385 },
  },
};
const json: Record<string, unknown> = {
  "manifest.json": { defaultLang: "en", languages: [{ code: "en" }, { code: "ar-EG" }] },
  "scenes.json": { scenes: [] },
  "timing/ar-EG.json": { lang: "ar-EG" },
  "timing/en.json": { lang: "en" },
};

beforeEach(() => {
  m.createPlayer.mockReset().mockReturnValue({ play() {}, pause() {}, destroy: m.destroy, ready: Promise.resolve() });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = decodeURIComponent(url.slice("https://storage.test/".length));
    return path in json ? new Response(JSON.stringify(json[path])) : new Response("", { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const show = (lang: "en" | "ar", onUngradedReady = vi.fn()) => {
  render(<I18nProvider lang={lang}><StepView step={step} result={null} onAnswer={() => {}} onUngradedReady={onUngradedReady} attempt={0} lessonId="l1" unitId="u1" /></I18nProvider>);
  return onUngradedReady;
};

describe("light lessons", () => {
  it("plays the light lesson in the teacher's language, with only that language and every file from Storage", async () => {
    show("ar");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(1));
    const [, pkg, opts] = m.createPlayer.mock.calls[0];
    expect(opts.lang).toBe("ar-EG");
    expect(pkg.manifest).toEqual({ defaultLang: "ar-EG", languages: [{ code: "ar-EG" }] });
    expect(pkg.timing).toEqual({ "ar-EG": { lang: "ar-EG" } });
    expect(pkg.resolve("audio/ar-EG.opus")).toBe(file("audio/ar-EG.opus"));
    expect(opts.library).toMatch(/\/lib\/$/);
  });

  it("lets the lesson go on once a quick check is answered in the player", async () => {
    const ready = show("en");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalled());
    expect(ready).not.toHaveBeenCalled();
    act(() => m.createPlayer.mock.calls[0][2].onEvent({ type: "check", id: "c1", correct: true }));
    expect(ready).toHaveBeenCalledWith(true);
  });

  it("switches to the MP4 and back", async () => {
    show("en");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Watch as a video file \(1\.1 MB\)/ }));
    expect(m.destroy).toHaveBeenCalled();
    expect(document.querySelector("video")).not.toBeNull();
    // Storage is another origin: captions from there load only with crossorigin.
    expect(document.querySelector("video")!.getAttribute("crossorigin")).toBe("anonymous");
    fireEvent.click(screen.getByRole("button", { name: /Light version \(0\.4 MB\)/ }));
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(2));
  });

  it("falls back to the MP4 when the light lesson can't load", async () => {
    const scenes = json["scenes.json"];
    delete json["scenes.json"];
    try {
      show("en");
      await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
      expect(m.createPlayer).not.toHaveBeenCalled();
    } finally { json["scenes.json"] = scenes; }
  });

  it("downloads the light lesson for offline use, not the MP4", () => {
    const urls = unitAssetUrls({ id: "u1", track: "ai", level: 1, title: { en: "U" }, summary: { en: "S" },
      lessons: [{ id: "u1-1", title: { en: "L" }, minutes: 5, steps: [step], tryTomorrow: { en: "T" }, slides: [], kit: [] }] }, "ar");
    expect(urls).toContain(file("timing/ar-EG.json"));
    expect(urls.some((u) => u.includes("audio%2Far-EG."))).toBe(true);
    expect(urls).not.toContain(file("timing/en.json"));
    expect(urls.some((u) => u.endsWith(".mp4"))).toBe(false);
    expect(urls).toContain("/lib/v1/icons.json");
  });
});
