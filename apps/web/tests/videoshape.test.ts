import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import en from "../src/i18n/en.json";
import ar from "../src/i18n/ar.json";
import { I18nProvider } from "../src/i18n";
import { fitStage, saveVideoShape, videoShape } from "../src/lesson/LightLesson";
import { StepView } from "../src/lesson/StepView";
import type { VideoStep } from "../src/content/types";

// Videos are landscape by default; the learner can turn them to portrait, and the choice is kept on the phone.
describe("video shape", () => {
  beforeEach(() => localStorage.clear());

  it("is landscape unless the learner turned it", () => {
    expect(videoShape()).toBe("landscape");
    saveVideoShape("portrait");
    expect(videoShape()).toBe("portrait");
    saveVideoShape("landscape");
    expect(videoShape()).toBe("landscape");
  });

  it("draws the 16:9 stage at full width by default, even on an upright phone", () => {
    const el = document.createElement("div");
    el.style.maxInlineSize = "100px";
    expect(fitStage(el)).toBe("landscape");
    expect(el.style.maxInlineSize).toBe("");
  });

  it("gives portrait whenever it is chosen, on any screen, never narrower than 16rem", () => {
    const el = document.createElement("div");
    const was = window.innerHeight;
    try {
      for (const h of [1200, 900, 664, 375]) { // tall phone, tablet, iPhone Chrome with its bars, a phone turned sideways
        Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
        expect(fitStage(el, "portrait")).toBe("portrait");
        expect(parseFloat(el.style.maxInlineSize)).toBeGreaterThanOrEqual(256);
      }
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 1200 });
      fitStage(el, "portrait");
      expect(el.style.maxInlineSize).toBe(`${Math.floor(((1200 - 0 - 15.5 * 16) * 9) / 16)}px`); // as wide as fits
      expect(fitStage(el, "landscape")).toBe("landscape");
      expect(el.style.maxInlineSize).toBe("");
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: was });
    }
  });
});

const KEYS = [
  "video.play", "video.pause", "video.captions", "video.captionsOff", "video.seek", "video.speed", "video.speedNormal",
  "video.fullscreen", "video.exitFullscreen", "video.toPortrait", "video.toLandscape", "video.mute", "video.unmute",
  "video.volume", "video.settings", "video.loading",
];

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("video strings", () => {
  it("ships the same video labels in English and Arabic, and Arabic never uses a middot", () => {
    const enKeys = Object.keys(en).filter((k) => k.startsWith("video."));
    const arKeys = Object.keys(ar).filter((k) => k.startsWith("video."));
    expect(arKeys.sort()).toEqual(enKeys.sort());
    for (const k of KEYS) expect(enKeys).toContain(k);
    for (const k of enKeys) {
      const key = k as keyof typeof en;
      expect(en[key].length).toBeGreaterThan(0);
      expect(ar[key].length).toBeGreaterThan(0);
      expect(ar[key]).not.toContain("·");
      expect(placeholders(ar[key])).toEqual(placeholders(en[key]));
    }
  });
});

describe("lesson MP4 shape", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => true });
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", { configurable: true, get: () => [] });
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
  });

  const step: VideoStep = {
    id: "v", type: "video", prompt: { en: "Watch", ar: "شاهد" },
    title: { en: "Passwords", ar: "كلمات المرور" },
    src: "/media/v-{lang}.mp4", duration: 90, sizeMB: 1.2,
    transcript: { en: "Use a long password.", ar: "استخدم كلمة مرور طويلة." },
    captions: { en: "/c-en.vtt", ar: "/c-ar.vtt" },
  };

  const show = (lang: "en" | "ar") => render(createElement(I18nProvider, {
    lang,
    children: createElement(StepView, { step, result: null, onAnswer: () => {}, onUngradedReady: () => {}, attempt: 0, lessonId: "l", unitId: "u" }),
  }));

  it("renders the YouTube-shaped controls and keeps the timeline left to right", () => {
    show("en");
    expect(screen.getByRole("slider", { name: en["video.seek"] })).toBeTruthy();
    expect(screen.getByRole("slider", { name: en["video.volume"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: en["video.settings"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: en["video.mute"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: en["video.captions"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: en["video.fullscreen"] })).toBeTruthy();
    expect(document.querySelector(".dr-video-bigplay")).toBeTruthy();
    expect(document.querySelector(".dr-video-scrim")).toBeTruthy();
    expect(document.querySelector(".dr-video-scrub")!.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector(".dr-video-time")!.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector("video")!.hasAttribute("controls")).toBe(false);
    expect([...document.querySelectorAll("track")].map((t) => t.getAttribute("srclang"))).toEqual(["en", "ar"]);
  });

  it("uses Arabic labels, with the Arabic captions listed first, and still keeps the timeline left to right", () => {
    show("ar");
    expect(screen.getByRole("button", { name: ar["video.settings"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: ar["video.mute"] })).toBeTruthy();
    expect(screen.getByRole("slider", { name: ar["video.seek"] })).toBeTruthy();
    expect(document.querySelector(".dr-video-scrub")!.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector(".dr-video-time")!.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector(".dr-video-time")!.textContent).not.toContain("·");
    expect([...document.querySelectorAll("track")].map((t) => t.getAttribute("srclang"))).toEqual(["ar", "en"]);
    expect(document.querySelector("track[srclang=ar]")!.getAttribute("label")).toBe("العربية");
  });
});
