import { render, screen, fireEvent } from "@testing-library/react";
import { Button, QuizOption, MatchPairs, OrderSteps, FillBlank, TrueFalse, LanguagePicker, Switch, DarsiRoot, UnitPath, VideoPlayer, FactCheck, TrainClassifier } from "../src";
import { approximateTokens, withTemperature, classify } from "../src/components/lab";
import { dirFor, formatNumber } from "../src/locale";

describe("locale", () => {
  it("knows RTL languages", () => {
    expect(dirFor("ar")).toBe("rtl"); expect(dirFor("ur-PK")).toBe("rtl"); expect(dirFor("fa")).toBe("rtl");
    expect(dirFor("sw")).toBe("ltr"); expect(dirFor("fr")).toBe("ltr");
  });
  it("formats Arabic-Indic digits", () => { expect(formatNumber(80, "ar-EG")).toBe("٨٠"); });
  it("DarsiRoot sets dir from lang", () => {
    const { container } = render(<DarsiRoot lang="ar" theme="sunlight"><span>x</span></DarsiRoot>);
    const root = container.firstElementChild!;
    expect(root.getAttribute("dir")).toBe("rtl"); expect(root.getAttribute("data-theme")).toBe("sunlight");
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

describe("AI lab logic", () => {
  it("splits long words into pieces", () => { expect(approximateTokens("photosynthesis!")).toEqual(["phot", "osyn", "thes", "is", "!"]); });
  it("temperature flattens or sharpens", () => {
    const c = [{ word: "a", p: 0.8 }, { word: "b", p: 0.2 }];
    expect(withTemperature(c, 0.5)[0].p).toBeGreaterThan(0.8); expect(withTemperature(c, 2)[0].p).toBeLessThan(0.8);
  });
  it("classifier picks the class with shared words", () => {
    expect(classify("click now", [{ examples: ["meeting tuesday"] }, { examples: ["click now please"] }]).best).toBe(1);
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
