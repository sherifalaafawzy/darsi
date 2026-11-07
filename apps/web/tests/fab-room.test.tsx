// The floating "Report a problem" and tutor buttons never cover the answer sheet (its explanation, its Continue) or a
// page's last controls. While the sheet shows, LessonPlayer puts its height in --sheet-h on <html>, the buttons stand
// above it (app.css --fab-end), and pages leave --fab-clear at their foot to scroll clear of them. Below 900 px they
// also step aside (bugs/Fab.tsx useFabsAside): while the page scrolls down, a checkpoint question or the sheet shows.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({ stored: null as unknown }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: "learner", user: null, configured: false }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  loadUnit: async (id: string) => ({ id, track: "ai", level: 1, title: { en: "Course" }, summary: { en: "S" }, lessons: [{
    id: "l1", title: { en: "First lesson" }, minutes: 5, tryTomorrow: { en: "T" }, slides: [], kit: [], steps: [
      { id: "s1", type: "truefalse", prompt: { en: "Apples grow on trees." }, answer: true, explain: { en: "They do: on apple trees." } },
      { id: "s2", type: "reflect", prompt: { en: "Think about it" } },
    ] }] }),
}));

const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { LessonScreen } = await import("../src/screens/LessonScreen");
const { fabsAway, useFabsAside } = await import("../src/bugs/Fab");

const open = () => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider>
  <MemoryRouter initialEntries={["/lesson/u1/l1"]}><Routes><Route path="/lesson/:unitId/:lessonId" element={<LessonScreen />} /></Routes></MemoryRouter>
</StoreProvider></SettingsProvider></I18nProvider>);

const sheetH = () => document.documentElement.style.getPropertyValue("--sheet-h");
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
let height = 240;
let observer: { cb: () => void; el?: Element; off: boolean } | null = null;

beforeEach(() => {
  h.stored = { ...initialState, onboarded: true, lang: "en", tracks: ["ai"] };
  localStorage.clear(); // a lesson in progress is kept on the phone: start each test at its first step
  height = 240; observer = null;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return (this as HTMLElement).classList.contains("dr-sheet") ? height : 0; } });
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { observer = { cb, off: false }; } observe(el: Element) { observer!.el = el; } unobserve() {} disconnect() { observer!.off = true; } });
});
afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--sheet-h");
});

describe("the floating buttons and the answer sheet", () => {
  it("publish the sheet's height while it shows, follow it as it changes, and clear it on Continue", async () => {
    open();
    fireEvent.click(await screen.findByRole("radio", { name: /True/ }));
    expect(sheetH()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(document.querySelector(".dr-sheet .dr-sheet-body")?.textContent).toBe("They do: on apple trees."));
    expect(sheetH()).toBe("240px");
    expect(observer?.el?.classList.contains("dr-sheet")).toBe(true);
    height = 310; observer!.cb(); // a longer explanation on a narrower screen
    expect(sheetH()).toBe("310px");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Think about it")).toBeTruthy();
    expect(sheetH()).toBe("");
    expect(observer!.off).toBe(true);
  });

  it("clear it when the lesson closes with the sheet open, so no other screen keeps the lift", async () => {
    const view = open();
    fireEvent.click(await screen.findByRole("radio", { name: /True/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(sheetH()).toBe("240px"));
    view.unmount();
    expect(sheetH()).toBe("");
  });
});

const css = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");
const rule = (sheet: string, selector: string) => sheet.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("the room the floating buttons get (CSS)", () => {
  it("both buttons stand on --fab-end, which rises above the answer sheet", () => {
    expect(rule(css("styles/bug-fab.css"), ".bug-fab")).toMatch(/inset-block-end: var\(--fab-end\)/);
    expect(rule(css("styles/tutor-fab.css"), ".tutor-fab")).toMatch(/inset-block-end: var\(--fab-end\)/);
    const root = rule(css("app.css"), ":root");
    expect(root).toMatch(/--sheet-h: 0px/);
    expect(root).toMatch(/--fab-end: max\([^;]*var\(--sheet-h\)/);
    expect(root).toMatch(/--fab-clear: calc\(var\(--fab-end\)/);
    // Focus moves and the light player's focus() keep controls clear of the band and the bars under it (WCAG 2.4.11).
    expect(root).toMatch(/scroll-padding-block-end: var\(--fab-clear\)/);
  });

  it("pages leave room at their foot: the lesson, the app frame, the pages with no bar, the editor's bar", () => {
    expect(rule(css("app.css"), ".lesson-body")).toMatch(/padding-block-end: max\(200px, var\(--fab-clear\)\)/);
    expect(css("app.css")).toMatch(/#root > main:not\(\.onb\) \{ padding-block-end: var\(--fab-clear\); \}/);
    expect(rule(css("styles/layout.css"), ".app-shell")).toMatch(/padding-block-end: max\([^;]*var\(--fab-clear\)\)/);
    expect(rule(css("styles/editor.css"), ".ed-bar")).toMatch(/padding-inline-start: calc\(var\(--space-3\) \+ var\(--tap-min\) \+ var\(--space-2\)\)/);
    // The landing page's main button sits where the button would float: there it closes the page instead.
    expect(css("styles/bug-fab.css")).toMatch(/#root > \.landing ~ \.bug-fab \{ position: static;/);
  });

  it("form grids style only the field in a label, so a caption stays a caption (no :is(), for Chrome 87)", () => {
    const base = css("styles/base.css");
    expect(base).not.toMatch(/\.form-grid > label > \*/);
    expect(base).toMatch(/\.form-grid > label > input, \.form-grid > label > select, \.form-grid > label > textarea \{ inline-size: 100%; \}/);
  });
});

describe("the floating buttons step aside on phones (bugs/Fab.tsx useFabsAside)", () => {
  it("go while the page scrolls down, come back when it scrolls up, and always show at its top and its end", () => {
    expect(fabsAway(false, 400, 2000, 40)).toBe(true); // down
    expect(fabsAway(true, 380, 2000, -20)).toBe(false); // up
    expect(fabsAway(false, 400, 2000, 6)).toBe(false); // a finger's jitter
    expect(fabsAway(true, 400, 2000, -6)).toBe(true);
    expect(fabsAway(true, 8, 2000, 40)).toBe(false); // the top
    expect(fabsAway(true, 1999, 2000, 40)).toBe(false); // the end: every page leaves --fab-clear there
    expect(fabsAway(false, 0, 0, 0)).toBe(false); // a page that doesn't scroll
  });

  const fabs = () => document.documentElement.dataset.fabs ?? "";
  function Probe({ path }: { path: string }) { useFabsAside(path); return null; }
  const scrollTo = (y: number) => { Object.defineProperty(window, "scrollY", { configurable: true, value: y }); fireEvent.scroll(window); };
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; }); // at once, nothing left pending
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    scrollTo(0);
  });
  afterEach(() => {
    delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    scrollTo(0);
  });

  it("mark <html> as the page scrolls, and start each new page with them shown", () => {
    const view = render(<Probe path="/learn" />);
    expect(fabs()).toBe("");
    scrollTo(300);
    expect(fabs()).toBe("away");
    scrollTo(250);
    expect(fabs()).toBe("");
    scrollTo(900);
    expect(fabs()).toBe("away");
    scrollTo(2200); // the end (3000 - 800)
    expect(fabs()).toBe("");
    scrollTo(1500);
    scrollTo(1900);
    expect(fabs()).toBe("away");
    view.rerender(<Probe path="/me" />);
    expect(fabs()).toBe("");
    view.unmount();
    expect(fabs()).toBe("");
  });

  it("while the answer sheet shows: the Report button goes and the tutor's sits in the sheet (data-fabs=sheet)", async () => {
    const view = render(<Probe path="/lesson/u1/l1" />);
    document.documentElement.style.setProperty("--sheet-h", "240px");
    await waitFor(() => expect(fabs()).toBe("sheet"));
    scrollTo(300); scrollTo(100); // scrolling the step doesn't bring the Report button back over the chosen answer
    expect(fabs()).toBe("sheet");
    document.documentElement.style.removeProperty("--sheet-h");
    await waitFor(() => expect(fabs()).toBe(""));
    view.unmount();
  });

  it("on a lesson screen, go while a video's checkpoint question shows", async () => {
    const fig = document.body.appendChild(document.createElement("figure"));
    fig.className = "dr-video";
    const view = render(<Probe path="/lesson/u1/l1" />);
    expect(fabs()).toBe("");
    fig.className = "dr-video has-checkpoint";
    await waitFor(() => expect(fabs()).toBe("away"));
    fig.className = "dr-video";
    await waitFor(() => expect(fabs()).toBe(""));
    view.unmount();
    fig.remove();
  });

  it("CSS: below 900 px only; reachable by keyboard and by the tour; the tutor docks in the sheet's head", () => {
    const bug = css("styles/bug-fab.css"), tutor = css("styles/tutor-fab.css");
    expect(bug).toMatch(/@media \(max-width: 899px\) \{\s*\[data-fabs\] \.bug-fab \{ opacity: 0; transform: scale\(0\.5\); pointer-events: none; \}/);
    expect(bug).toMatch(/\[data-fabs\] \.bug-fab:focus-visible, \[data-fabs\] \.bug-fab\.driver-active-element \{ opacity: 1; transform: none; pointer-events: auto; \}/);
    expect(bug).toMatch(/#root > \.landing ~ \.bug-fab \{[^}]*opacity: 1; transform: none; pointer-events: auto; \}/);
    expect(tutor).toMatch(/@media \(max-width: 899px\) \{\s*\[data-fabs="away"\] \.tutor-fab \{ opacity: 0;/);
    expect(tutor).toMatch(/\[data-fabs="sheet"\] \.tutor-fab \{[^}]*inset-block-end: calc\(var\(--sheet-h\) - 3px - var\(--space-4\) - 20px - var\(--tap-min\) \/ 2\)/);
  });
});
