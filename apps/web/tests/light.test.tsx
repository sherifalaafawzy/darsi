// A video step with a light lesson (Lesson Studio) plays it first, in the teacher's language, with the MP4 as a choice.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VideoStep } from "../src/content/types";
import { unitAssetUrls } from "../src/content/load";
import { I18nProvider } from "../src/i18n";
import { prefetchLightPacks, setLightPlayer } from "../src/lesson/LightLesson";
import { StepView } from "../src/lesson/StepView";

const m = vi.hoisted(() => ({ createPlayer: vi.fn(), destroy: vi.fn(), packsUsed: vi.fn((): string[] => []), prefetchPacks: vi.fn(async (_ids: readonly string[]) => {}) }));
setLightPlayer(async () => ({ createPlayer: m.createPlayer, packsUsed: m.packsUsed, prefetchPacks: m.prefetchPacks })); // App registers the real player's lazy chunk

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

  it("gives the player a lesson step's words: its check's button keeps watching and its end is the video's", async () => {
    // The player's own "Continue" sat beside the lesson's Continue, which skips the rest of the video, and its end card
    // said "Lesson complete" after step 1. The player fills {n} and {m} in the lesson language's digits.
    show("en");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(1));
    expect(m.createPlayer.mock.calls[0][2].labels).toEqual({ next: "Keep watching", done: "Video finished", score: "Quick checks right: {n} of {m}" });
    cleanup();
    show("ar");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(2));
    expect(m.createPlayer.mock.calls[1][2].labels).toEqual({ next: "تابع المشاهدة", done: "انتهى الفيديو", score: "الإجابات الصحيحة: {n} من {m}" });
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

  it("keeps the light lesson's place while the transcript is open, and says the transcript's state", async () => {
    // Opening the transcript removed the player, so closing it started the video again at 0:00, checks unanswered.
    const pause = vi.fn();
    const setOrient = vi.fn();
    m.createPlayer.mockReturnValue({ play() {}, pause, setOrient, destroy: m.destroy, ready: Promise.resolve() });
    show("en");
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(1));
    m.destroy.mockClear();
    const host = m.createPlayer.mock.calls[0][0] as HTMLElement;
    const toggle = screen.getByRole("button", { name: "Transcript" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)!.textContent).toContain("Some apps follow rules.");
    expect(host.hidden).toBe(true);
    expect(pause).toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(host.hidden).toBe(false);
    expect(setOrient).toHaveBeenCalledWith("landscape");
    expect(m.createPlayer).toHaveBeenCalledTimes(1);
    expect(m.destroy).not.toHaveBeenCalled();
  });

  it("loads nothing for a light lesson that opens on its transcript until the learner closes it", async () => {
    // No MP4 for this step, so the transcript shows first.
    render(<I18nProvider lang="en"><StepView step={{ ...step, sources: undefined }} result={null} onAnswer={() => {}} onUngradedReady={() => {}} attempt={0} lessonId="l1" unitId="u1" /></I18nProvider>);
    expect(screen.getByText("Some apps follow rules.")).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.createPlayer).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Transcript" }));
    await waitFor(() => expect(m.createPlayer).toHaveBeenCalledTimes(1));
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

  it("saves the packs a course's light lessons draw with, and only those", async () => {
    m.packsUsed.mockReturnValueOnce(["science", "code"]);
    await prefetchLightPacks({ lessons: [{ steps: [step] }] });
    expect(m.prefetchPacks).toHaveBeenCalledWith(["science", "code"]);
    // Lessons without packs, or without a light lesson, leave them on the server.
    await prefetchLightPacks({ lessons: [{ steps: [step] }] });
    await prefetchLightPacks({ lessons: [{ steps: [{ ...step, light: undefined }] }] });
    expect(m.prefetchPacks).toHaveBeenCalledTimes(1);
  });
});
