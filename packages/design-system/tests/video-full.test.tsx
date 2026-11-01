import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VideoPlayer, formatVideoTime, timeForDigit } from "../src";

interface Cue { text: string }
interface FakeTrack {
  kind: string;
  mode: string;
  language: string;
  label: string;
  activeCues: Cue[];
  oncuechange: null | (() => void);
}

describe("VideoPlayer full screen on iPhone", () => {
  const ios = HTMLVideoElement.prototype as HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void };
  afterEach(() => {
    delete ios.webkitEnterFullscreen;
    delete ios.webkitExitFullscreen;
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });

  it("keeps playback inline until full screen is asked for", () => {
    render(<VideoPlayer title="t" duration={10} src="/v.mp4" />);
    expect(document.querySelector("video")!.hasAttribute("playsinline")).toBe(true);
  });

  it("calls webkitEnterFullscreen when element full screen is missing, and the events drive the button", () => {
    const enter = vi.fn();
    const exit = vi.fn();
    ios.webkitEnterFullscreen = enter;
    ios.webkitExitFullscreen = exit;
    const { container } = render(<VideoPlayer title="t" duration={10} src="/v.mp4" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(enter).toHaveBeenCalledOnce();
    // Native full screen is the system player, not the fixed page.
    expect(container.querySelector(".dr-video")!.classList.contains("is-full")).toBe(false);
    const video = document.querySelector("video")!;
    act(() => { video.dispatchEvent(new Event("webkitbeginfullscreen")); });
    const leave = screen.getByRole("button", { name: "Exit full screen" });
    expect(leave.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(leave);
    expect(exit).toHaveBeenCalledOnce();
    act(() => { video.dispatchEvent(new Event("webkitendfullscreen")); });
    expect(screen.getByRole("button", { name: "Full screen" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("fixes the player over the viewport and locks scrolling when neither full screen API exists", () => {
    const { container } = render(<VideoPlayer title="t" duration={10} src="/v.mp4" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    const fig = container.querySelector(".dr-video")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(fig, { key: "Escape" });
    expect(fig.classList.contains("is-full")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("VideoPlayer full screen without the Fullscreen API", () => {
  const screenOf = (w: number, h: number) => {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
  };
  it("covers the page and turns the video to landscape on an upright phone", () => {
    screenOf(390, 844);
    const { container } = render(<VideoPlayer title="t" duration={100} src="v.mp4" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    const fig = container.querySelector("figure")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    expect(fig.classList.contains("is-turned")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(fig.classList.contains("is-full")).toBe(false);
    expect(fig.classList.contains("is-turned")).toBe(false);
  });
  it("stays as it is on a screen that is already landscape", () => {
    screenOf(844, 390);
    const { container } = render(<VideoPlayer title="t" duration={100} src="v.mp4" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    const fig = container.querySelector("figure")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    expect(fig.classList.contains("is-turned")).toBe(false);
  });
});

describe("video time helpers", () => {
  it("formats a clock and maps the digit keys onto tenths", () => {
    expect(formatVideoTime(0)).toBe("0:00");
    expect(formatVideoTime(65)).toBe("1:05");
    expect(formatVideoTime(3661)).toBe("1:01:01");
    expect(formatVideoTime(Number.NaN)).toBe("0:00");
    expect(timeForDigit(0, 200)).toBe(0);
    expect(timeForDigit(5, 200)).toBe(100);
    expect(timeForDigit(9, 80)).toBe(72);
  });
});

describe("YouTube-style video controls", () => {
  let paused = true;
  let tracks: FakeTrack[] = [];
  const en: FakeTrack = { kind: "captions", mode: "showing", language: "en", label: "English", activeCues: [], oncuechange: null };
  const ar: FakeTrack = { kind: "captions", mode: "disabled", language: "ar", label: "العربية", activeCues: [], oncuechange: null };
  let bufferedEnd = 0;

  beforeEach(() => {
    paused = true;
    bufferedEnd = 0;
    en.mode = "showing"; en.activeCues = []; en.oncuechange = null;
    ar.mode = "disabled"; ar.activeCues = []; ar.oncuechange = null;
    tracks = [en, ar];
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => paused });
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", { configurable: true, get: () => tracks });
    Object.defineProperty(HTMLMediaElement.prototype, "buffered", { configurable: true, get: () => ({ length: bufferedEnd ? 1 : 0, end: () => bufferedEnd }) });
    HTMLMediaElement.prototype.play = function () { paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { paused = true; this.dispatchEvent(new Event("pause")); };
  });
  afterEach(() => { vi.useRealTimers(); });

  const player = (extra: Partial<Parameters<typeof VideoPlayer>[0]> = {}) =>
    render(<VideoPlayer title="Passwords" duration={100} src="/v.mp4" current={40} {...extra} />);

  it("draws custom controls, a buffered range and a hover time, with no native bar", () => {
    const { container } = player();
    const video = document.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(false);
    expect(container.querySelector(".dr-video-scrim")).toBeTruthy();
    expect(container.querySelector(".dr-video-bigplay")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Play" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
    const seek = screen.getByRole("slider", { name: "Seek" });
    expect(seek.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".dr-video-time")!.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".dr-video-time")!.textContent).toBe("0:40 / 1:40");

    bufferedEnd = 70;
    act(() => { video.dispatchEvent(new Event("progress")); });
    expect(container.querySelector(".dr-video-buffered")!.getAttribute("style")).toContain("70%");

    seek.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 8, width: 100, height: 8, x: 0, y: 0, toJSON() { return {}; } });
    fireEvent.pointerMove(seek, { clientX: 25 });
    expect(container.querySelector(".dr-video-preview")!.textContent).toBe("0:25");
    expect(seek.classList.contains("is-hot")).toBe(true);
  });

  it("plays, pauses, shows a spinner while buffering, and hides the centre button while playing", () => {
    const { container } = player();
    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    expect(paused).toBe(false);
    expect(container.querySelector(".dr-video-bigplay")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    const video = document.querySelector("video")!;
    act(() => { video.dispatchEvent(new Event("waiting")); });
    expect(screen.getByRole("status").textContent).toContain("Loading");
    act(() => { video.dispatchEvent(new Event("playing")); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the controls after three seconds of playback and brings them back on hover", () => {
    vi.useFakeTimers();
    const { container } = player();
    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    const fig = container.querySelector(".dr-video")!;
    expect(fig.classList.contains("is-idle")).toBe(false);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(fig.classList.contains("is-idle")).toBe(true);
    fireEvent.pointerMove(fig, { pointerType: "mouse" });
    expect(fig.classList.contains("is-idle")).toBe(false);
  });

  it("seeks, changes volume and captions, and goes full screen from the keyboard", () => {
    const at: number[] = [];
    const { container } = player({ onTimeUpdate: (s) => at.push(s) });
    const fig = container.querySelector(".dr-video")!;
    fireEvent.keyDown(fig, { key: "l" });
    fireEvent.keyDown(fig, { key: "j" });
    fireEvent.keyDown(fig, { key: "ArrowRight" });
    fireEvent.keyDown(fig, { key: "5" });
    fireEvent.keyDown(fig, { key: "Home" });
    expect(at).toEqual([50, 40, 45, 50, 0]);

    const volume = screen.getByRole("slider", { name: "Volume" });
    fireEvent.keyDown(volume, { key: "ArrowDown" });
    expect(volume.getAttribute("aria-valuenow")).toBe("95");
    fireEvent.keyDown(fig, { key: "m" });
    expect(screen.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(fig, { key: "c" });
    expect(screen.getByRole("button", { name: "Captions" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(fig, { key: "k" });
    expect(paused).toBe(false);
    fireEvent.keyDown(fig, { key: "f" });
    expect(fig.classList.contains("is-full")).toBe(true);
    fireEvent.keyDown(fig, { key: "Escape" });
    expect(fig.classList.contains("is-full")).toBe(false);
  });

  it("picks a caption language from the settings menu and shows that track's line", () => {
    player({ caption: "Poster line" });
    expect(screen.getByText("Poster line")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Captions/ }));
    expect(screen.getByRole("menuitemradio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "العربية" }));
    expect(ar.mode).toBe("hidden");
    expect(en.mode).toBe("disabled");
    ar.activeCues = [{ text: "كلمة المرور" }];
    act(() => { ar.oncuechange?.(); });
    expect(screen.getByText("كلمة المرور")).toBeTruthy();
    expect(screen.queryByText("Poster line")).toBeNull();
  });

  it("double-taps the left of the picture to jump back, and a single tap does not play", () => {
    vi.useFakeTimers();
    const at: number[] = [];
    const { container } = player({ onTimeUpdate: (s) => at.push(s) });
    const stage = container.querySelector(".dr-video-stage")!;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 112, width: 200, height: 112, x: 0, y: 0, toJSON() { return {}; } });
    fireEvent.pointerUp(stage, { pointerType: "touch", clientX: 20, clientY: 40 });
    fireEvent.pointerUp(stage, { pointerType: "touch", clientX: 30, clientY: 40 });
    expect(at).toEqual([30]);
    expect(container.querySelector(".dr-video-seekflash")!.textContent).toBe("−10");
    expect(paused).toBe(true);
    act(() => { vi.advanceTimersByTime(280); });
  });

  it("turns an upright phone sideways when full screen has to cover the page", () => {
    const height = window.innerHeight, width = window.innerWidth;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    try {
      const { container } = player();
      fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
      expect(container.querySelector(".dr-video")!.classList.contains("is-turned")).toBe(true);
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });

  it("seeks along the screen's height when the player is turned sideways (clientY, not clientX)", () => {
    const height = window.innerHeight, width = window.innerWidth;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    const turnedRect = () => ({ left: 0, top: 0, right: 8, bottom: 100, width: 8, height: 100, x: 0, y: 0, toJSON() { return {}; } });
    try {
      const { container } = player();
      fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
      expect(container.querySelector(".dr-video")!.classList.contains("is-turned")).toBe(true);
      const seek = screen.getByRole("slider", { name: "Seek" });
      seek.getBoundingClientRect = turnedRect;
      // clientX is the bar's thickness here; only clientY says how far along it the finger is.
      fireEvent.pointerMove(seek, { clientX: 4, clientY: 25 });
      expect(container.querySelector(".dr-video-preview")!.textContent).toBe("0:25");
      fireEvent.pointerMove(seek, { clientX: 4, clientY: 60 });
      expect(container.querySelector(".dr-video-preview")!.textContent).toBe("1:00");
      // Right to left, the bar is turned the other way (rotate(-90deg)): it starts at the bottom.
      document.documentElement.setAttribute("dir", "rtl");
      fireEvent.pointerMove(seek, { clientX: 4, clientY: 25 });
      expect(container.querySelector(".dr-video-preview")!.textContent).toBe("1:15");
    } finally {
      document.documentElement.removeAttribute("dir");
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    }
  });
  it("keeps motion optional: the reduced-motion rule covers the player's fades", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".dr-video-scrim");
    expect(css).not.toMatch(/\.dr-video[^{]*\{[^}]*font-size:\s*(?:[0-9]|1[01])px/);
  });
});
