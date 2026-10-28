import { render, screen, fireEvent } from "@testing-library/react";
import { Button, QuizOption, MatchPairs, OrderSteps, FillBlank, TrueFalse, LanguagePicker, Switch, DarsiRoot, UnitPath, VideoPlayer, FactCheck, TrainClassifier,
  TrackChip, TrackStylesProvider, ProgressBar, PlacementResult, TRACK_TONES, ICON_NAMES } from "../src";
import paths from "../src/icons/paths.json";
import { approximateTokens, withTemperature, classify } from "../src/components/lab";
import { applyLocale, dirFor, formatNumber } from "../src/locale";

describe("locale", () => {
  it("knows RTL languages", () => {
    expect(dirFor("ar")).toBe("rtl"); expect(dirFor("ur-PK")).toBe("rtl"); expect(dirFor("fa")).toBe("rtl");
    expect(dirFor("sw")).toBe("ltr"); expect(dirFor("fr")).toBe("ltr");
  });
  it("formats Arabic-Indic digits", () => { expect(formatNumber(80, "ar-EG")).toBe("٨٠"); });
  it("sets the page's language and direction, which the app may give for a language it added", () => {
    applyLocale("fa"); expect([document.documentElement.lang, document.documentElement.dir]).toEqual(["fa", "rtl"]);
    applyLocale("xx", "light", "rtl"); expect(document.documentElement.dir).toBe("rtl");
    applyLocale("en"); expect(document.documentElement.dir).toBe("ltr");
  });
  it("DarsiRoot sets dir from lang", () => {
    const { container } = render(<DarsiRoot lang="ar" theme="sunlight"><span>x</span></DarsiRoot>);
    const root = container.firstElementChild!;
    expect(root.getAttribute("dir")).toBe("rtl"); expect(root.getAttribute("data-theme")).toBe("sunlight");
  });
});

describe("track styles", () => {
  it("built-in tracks keep their colour and icon", () => {
    const { container } = render(<TrackChip track="iot">IoT</TrackChip>);
    const chip = container.firstElementChild!;
    expect(chip.className).toContain("dr-tr-lagoon");
    expect(chip.querySelector("path")?.getAttribute("d")).toBe(paths.iot[0]);
  });
  it("an added track gets the colour and icon the provider gives it", () => {
    const { container } = render(<TrackStylesProvider styles={{ data: { tone: "leaf", icon: "chart" } }}>
      <TrackChip track="data">Data science</TrackChip><ProgressBar track="data" value={40} ariaLabel="p" /><UnitPath track="data" nodes={[{ label: "1", state: "current" }]} />
    </TrackStylesProvider>);
    expect(container.querySelectorAll(".dr-tr-leaf")).toHaveLength(3);
    expect(screen.getByText("Data science")).toBeTruthy();
  });
  it("an unknown track falls back to a neutral colour and shows its id", () => {
    const { container } = render(<TrackChip track="robotics" />);
    expect(container.firstElementChild!.className).toContain("dr-tr-slate");
    expect(screen.getByText("robotics")).toBeTruthy();
  });
  it("placement shows as many level segments as the track has", () => {
    const { container } = render(<PlacementResult title="t" levels={[{ track: "ai", level: 2, of: 6, label: "Level 2" }]} />);
    expect(container.querySelectorAll(".dr-place-meter i")).toHaveLength(6);
    expect(container.querySelectorAll(".dr-place-meter i.on")).toHaveLength(2);
  });
  it("offers a tone for every track colour token", () => {
    expect(TRACK_TONES).toEqual(["sunbird", "lagoon", "hibiscus", "leaf", "lilac", "clay", "sky", "slate"]);
    for (const n of ["book", "code", "chart", "flask", "globe", "heart", "leaf", "palette", "undo", "redo"]) expect(ICON_NAMES).toContain(n);
  });
});

describe("Button", () => {
  it("icon-only buttons are labelled", () => {
    render(<Button iconOnly icon="close">Close lesson</Button>);
    expect(screen.getByRole("button", { name: "Close lesson" })).toBeTruthy();
  });
  it("loading disables and sets aria-busy", () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole("button"); expect(b).toHaveProperty("disabled", true); expect(b.getAttribute("aria-busy")).toBe("true");
  });
});

describe("questions", () => {
  it("multi QuizOption is a checkbox", () => {
    render(<QuizOption multi state="selected">A</QuizOption>);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });
  it("TrueFalse is a radiogroup and reports value", () => {
    const fn = vi.fn(); render(<TrueFalse onChange={fn} label="q" />);
    fireEvent.click(screen.getByRole("radio", { name: "False" })); expect(fn).toHaveBeenCalledWith(false);
  });
  it("MatchPairs pairs left then right", () => {
    const fn = vi.fn();
    render(<MatchPairs onChange={fn} left={[{ id: "t", label: "Thermometer" }]} right={[{ id: "h", label: "Heat" }]} />);
    fireEvent.click(screen.getByText("Thermometer")); fireEvent.click(screen.getByText("Heat"));
    expect(fn).toHaveBeenCalledWith({ t: "h" });
  });
  it("OrderSteps moves items with buttons", () => {
    const fn = vi.fn();
    render(<OrderSteps onChange={fn} items={[{ id: "a", label: "First" }, { id: "b", label: "Second" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Move down: First" }));
    expect(fn.mock.calls[0][0].map((x: { id: string }) => x.id)).toEqual(["b", "a"]);
  });
  it("FillBlank fills the next empty gap", () => {
    const fn = vi.fn();
    render(<FillBlank onChange={fn} parts={["A ", { blank: 0 }, " is"]} bank={["sensor", "motor"]} />);
    fireEvent.click(screen.getByText("sensor")); expect(fn).toHaveBeenCalledWith({ 0: "sensor" });
  });
});

describe("shell & settings", () => {
  it("LanguagePicker marks native names with lang/dir", () => {
    render(<LanguagePicker label="Language" value="ar" languages={[{ code: "ar", native: "العربية", english: "Arabic", dir: "rtl" }]} />);
    const el = screen.getByText("العربية"); expect(el.getAttribute("dir")).toBe("rtl"); expect(el.getAttribute("lang")).toBe("ar");
    expect(screen.getByRole("radio").getAttribute("aria-checked")).toBe("true");
  });
  it("Switch toggles", () => {
    const fn = vi.fn(); render(<Switch label="Data saver" checked={false} onChange={fn} />);
    fireEvent.click(screen.getByRole("switch")); expect(fn).toHaveBeenCalledWith(true);
  });
  it("UnitPath disables locked nodes and marks the current step", () => {
    render(<UnitPath nodes={[{ label: "One", state: "current" }, { label: "Two", state: "locked" }]} />);
    expect(screen.getByRole("button", { name: "Two" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "One" }).getAttribute("aria-current")).toBe("step");
  });
  it("Video control bar stays LTR", () => {
    const { container } = render(<div dir="rtl"><VideoPlayer title="t" duration={100} /></div>);
    expect(container.querySelector(".dr-video-bar")?.getAttribute("dir")).toBe("ltr");
  });
});

describe("VideoPlayer controls", () => {
  // jsdom has no media playback: a tiny stand-in for play/pause and the caption tracks.
  let paused = true;
  const track = { kind: "captions", mode: "showing" };
  beforeEach(() => {
    paused = true; track.mode = "showing";
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => paused });
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", { configurable: true, get: () => [track] });
    HTMLMediaElement.prototype.play = function () { paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { paused = true; this.dispatchEvent(new Event("pause")); };
  });
  const player = (extra: Partial<Parameters<typeof VideoPlayer>[0]> = {}) => render(<VideoPlayer title="t" duration={100} src="/v.mp4" {...extra} />);

  it("CC shows and hides the real caption track", () => {
    player();
    fireEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(track.mode).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Captions" }));
    expect(track.mode).toBe("showing");
  });

  it("seeks with the keyboard and reports the new time", () => {
    const at: number[] = [];
    player({ onTimeUpdate: (s) => at.push(s) });
    const seek = screen.getByRole("slider", { name: "Seek" });
    fireEvent.keyDown(seek, { key: "ArrowRight" });
    fireEvent.keyDown(seek, { key: "End" });
    expect(at).toEqual([5, 100]);
    expect(seek.getAttribute("aria-valuenow")).toBe("100");
  });

  it("steps through speeds", () => {
    player();
    fireEvent.click(screen.getByRole("button", { name: "Speed: 1×" }));
    expect(screen.getByRole("button", { name: "Speed: 1.25×" })).toBeTruthy();
  });

  it("goes full screen over the page where the Fullscreen API is missing, and Escape leaves", () => {
    const { container } = player();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    const fig = container.querySelector(".dr-video")!;
    expect(fig.classList.contains("is-full")).toBe(true);
    fireEvent.keyDown(fig, { key: "Escape" });
    expect(fig.classList.contains("is-full")).toBe(false);
  });

  it("pauses for a question and plays on once it is answered", () => {
    const { rerender } = player();
    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    expect(paused).toBe(false);
    rerender(<VideoPlayer title="t" duration={100} src="/v.mp4" checkpoint={<p>Question</p>} />);
    expect(paused).toBe(true);
    // Only the bar's button is left, and it waits for the answer.
    expect(screen.getAllByRole("button", { name: "Play" }).map((b) => (b as HTMLButtonElement).disabled)).toEqual([true]);
    rerender(<VideoPlayer title="t" duration={100} src="/v.mp4" />);
    expect(paused).toBe(false);
  });
});

describe("AI lab logic", () => {
  it("splits long words into pieces", () => { expect(approximateTokens("photosynthesis!")).toEqual(["phot", "osyn", "thes", "is", "!"]); });
  it("temperature flattens or sharpens", () => {
    const c = [{ word: "a", p: 0.8 }, { word: "b", p: 0.2 }];
    expect(withTemperature(c, 0.5)[0].p).toBeGreaterThan(0.8); expect(withTemperature(c, 2)[0].p).toBeLessThan(0.8);
  });
  it("classifier picks the class with shared words", () => {
    expect(classify("click now", [{ examples: ["meeting tuesday"] }, { examples: ["click now please"] }]).best).toBe(1);
    // Arabic vowel marks belong to their word: «سيُغلق» is one word, matched by the same word with its mark.
    expect(classify("سيُغلق حسابك", [{ examples: ["اجتماع الثلاثاء"] }, { examples: ["سيُغلق حسابك اليوم"] }]).best).toBe(1);
  });
  it("TrainClassifier shows a guess", () => {
    render(<TrainClassifier title="t" classes={[{ id: "s", label: "Safe", examples: ["meeting"] }, { id: "p", label: "Phishing", examples: ["click now"] }]} test="click here now" />);
    expect(screen.getByRole("status").textContent).toContain("Phishing");
  });
  it("FactCheck reveals the note after a verdict", () => {
    render(<FactCheck title="t" open="c" answer={[{ text: "Nile flows north to south", claim: { id: "c", verdict: "false", note: "Wrong — south to north." } }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Wrong" }));
    expect(screen.getByText("Wrong — south to north.")).toBeTruthy();
  });
});
