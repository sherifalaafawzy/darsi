// The tour: which stops it makes for what is on screen (rail or bottom nav, learner or staff), right-to-left sides and
// numerals, and when it starts by itself (once per signed-in account, never for guests) or from Me.
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { I18nProvider, useI18n } from "../src/i18n";

const m = vi.hoisted(() => ({
  configs: [] as Array<Record<string, any>>,
  user: null as null | { uid: string },
  role: "teacher",
  state: { onboarded: true, toured: undefined as number | undefined },
  dispatch: vi.fn(),
  moves: [] as string[],
}));
vi.mock("driver.js", () => ({
  driver: (config: Record<string, any>) => {
    m.configs.push(config);
    return { drive: () => {}, moveNext: () => m.moves.push("next"), movePrevious: () => m.moves.push("back"), hasNextStep: () => true, hasPreviousStep: () => true, destroy: () => { m.moves.push("end"); config.onDestroyed?.(); } };
  },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: m.user, role: m.role }) }));
vi.mock("../src/state/store", () => ({ useStore: () => ({ state: m.state, dispatch: m.dispatch }) }));

const { stops, runTour, shown } = await import("../src/tour/Tour");
const { AppTour, openTour } = await import("../src/tour/Start");

// jsdom lays nothing out: anything without the hidden attribute counts as shown.
beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const w = this.closest("[hidden]") ? 0 : 40;
    return { width: w, height: w, x: 0, y: 0, top: 0, left: 0, right: w, bottom: w, toJSON: () => ({}) } as DOMRect;
  });
});
beforeEach(() => {
  document.body.innerHTML = "";
  m.configs = []; m.moves = []; m.user = null; m.role = "teacher"; m.state = { onboarded: true, toured: undefined }; m.dispatch.mockReset();
});

const links = (paths: string[], cls = "") => paths.map((p) => `<a class="${cls}" href="${p}">x</a>`).join("");
function shell({ rail, staff = [] as string[], home = true, kit = true }: { rail: boolean; staff?: string[]; home?: boolean; kit?: boolean }) {
  const tabs = ["/learn", "/downloads", "/labs", ...(kit ? ["/kit"] : []), "/me"];
  document.body.innerHTML = `<div class="app-shell">
    <nav class="nav-rail"${rail ? "" : " hidden"}><a class="rail-brand" href="/learn">Darsi</a>${links([...tabs, ...staff], "rail-item")}<button class="rail-report">r</button></nav>
    <main>${home ? `<button class="track-switch">AI</button><section class="week-card"></section><section class="unit"><article class="dr-card"></article></section>` : ""}</main>
    <div class="nav-bottom"${rail ? " hidden" : ""}>${links(tabs)}</div>
  </div><button class="bug-fab"${rail ? " hidden" : ""}>b</button>`;
}
const titles = (s = false) => stops(s).map((x) => x.title);

describe("the stops", () => {
  it("on a phone: Home, the bottom nav and the floating Report button", () => {
    shell({ rail: false });
    expect(titles()).toEqual(["tour.welcomeT", "tour.trackT", "tour.weekT", "tour.lessonT", "nav.learn", "nav.downloads", "nav.lab", "nav.kit", "nav.me", "bug.button", "tour.doneT"]);
    const me = stops().find((x) => x.title === "nav.me")!;
    expect(me.el).toContain(".nav-bottom");
    expect(me.side).toBe("top");
    expect(stops().find((x) => x.title === "bug.button")!.el).toBe(".bug-fab");
  });

  it("on a wide screen: the rail, its staff pages and its Report a problem", () => {
    shell({ rail: true, staff: ["/teach", "/admin", "/admin/content", "/org"] });
    const list = stops(true);
    expect(list.map((x) => x.title)).toEqual(["tour.welcomeT", "tour.trackT", "tour.weekT", "tour.lessonT", "nav.learn", "nav.downloads", "nav.lab", "nav.kit", "nav.me", "nav.org", "nav.teach", "nav.admin", "nav.content", "bug.button", "tour.doneT"]);
    expect(shown(list.find((x) => x.title === "nav.learn")!.el!)!.className).toBe("rail-item"); // the rail's tab, not its logo
    expect(list.find((x) => x.title === "nav.me")!.body).toBe("tour.meD"); // staff pages are in the rail, not in Me
    expect(list.find((x) => x.title === "bug.button")!.el).toBe(".rail-report");
  });

  it("tells a platform admin what Learn and the track switch hold for them: every course, not theirs from their level", () => {
    shell({ rail: true, staff: ["/super", "/super/content"] });
    const admin = stops(true, true);
    expect(admin.find((x) => x.title === "nav.learn")!.body).toBe("tour.learnAllD");
    expect(admin.find((x) => x.title === "tour.trackT")!.body).toBe("tour.trackAllD");
    expect(stops(true).find((x) => x.title === "nav.learn")!.body).toBe("tour.learnD");
  });

  it("staff on a phone hear that their pages are in Me; students have no Kit; a page without Home skips its stops", () => {
    shell({ rail: false, home: false, kit: false });
    const list = stops(true);
    expect(list.map((x) => x.title)).toEqual(["tour.welcomeT", "nav.learn", "nav.downloads", "nav.lab", "nav.me", "bug.button", "tour.doneT"]);
    expect(list.find((x) => x.title === "nav.me")!.body).toBe("tour.meStaffD");
  });
});

describe("the tour", () => {
  it("in Arabic: popovers on the mirrored side, Arabic buttons and numerals, and it ends when driver.js is done", async () => {
    shell({ rail: true });
    let t: any;
    function Grab() { t = useI18n().t; return null; }
    render(<I18nProvider lang="ar"><Grab /></I18nProvider>);
    const done = runTour({ t, dir: "rtl", staff: false });
    const c = m.configs[0];
    expect(c.nextBtnText).toBe("التالي");
    expect(c.doneBtnText).toBe("تم");
    expect(c.disableActiveInteraction).toBe(true);
    const learn = c.steps.find((s: any) => s.popover.title === "تعلّم");
    expect(learn.popover.side).toBe("left"); // the rail is on the right in Arabic
    expect(c.steps[0].element).toBeUndefined(); // the welcome sits in the middle
    // The progress line is the page's own.
    const p = { progress: document.createElement("span"), wrapper: document.createElement("div"), title: document.createElement("h2"), description: document.createElement("p"), closeButton: document.createElement("button"), nextButton: document.createElement("button") };
    c.onPopoverRender(p, { state: { activeIndex: 2 } });
    expect(p.progress.textContent).toBe(`٣ من ${new Intl.NumberFormat("ar-EG").format(c.steps.length)}`);
    expect(p.wrapper.getAttribute("dir")).toBe("rtl");
    expect(p.wrapper.getAttribute("role")).toBe("dialog");
    // The arrow keys follow the reading direction.
    expect(c.allowKeyboardControl).toBe(false);
    for (const key of ["ArrowLeft", "ArrowRight", "Escape"]) window.dispatchEvent(new KeyboardEvent("keyup", { key }));
    expect(m.moves).toEqual(["next", "back", "end"]);
    await done;
  });

  it("gives focus back when it ends: where it was, or the page's title", async () => {
    const t = ((k: string) => k) as any;
    shell({ rail: true });
    const was = document.querySelector<HTMLElement>(".track-switch")!;
    was.focus();
    let done = runTour({ t, dir: "ltr", staff: false });
    was.blur(); // the popover had it
    m.configs[0].onDestroyed();
    await done;
    expect(document.activeElement).toBe(was);
    // Started by itself (nothing focused): the page's title, made focusable for it.
    shell({ rail: true });
    document.querySelector("main")!.insertAdjacentHTML("afterbegin", `<div class="app-main"><h1>Learn</h1></div>`);
    done = runTour({ t, dir: "ltr", staff: false });
    m.configs[1].onDestroyed();
    await done;
    expect(document.activeElement?.textContent).toBe("Learn");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });
});

function Where() { const { pathname } = useLocation(); const nav = useNavigate(); return <><p data-testid="at">{pathname}</p><button type="button" onClick={() => nav("/labs")}>go to labs</button></>; }
const app = (path = "/learn") => render(
  <I18nProvider lang="en"><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><Where /><AppTour home="/admin" /></>} /></Routes></MemoryRouter></I18nProvider>,
);

describe("when it starts", () => {
  it("by itself once a signed-in person reaches the app's navigation, and marks it seen", async () => {
    m.user = { uid: "u1" };
    shell({ rail: false });
    app();
    await waitFor(() => expect(m.configs).toHaveLength(1), { timeout: 4000 });
    expect(m.dispatch).toHaveBeenCalledWith({ type: "set", patch: { toured: expect.any(Number) } });
    expect(m.configs[0].nextBtnText).toBe("Next");
  });

  it("never by itself for guests, for people who have seen it, during onboarding or in a lesson", async () => {
    const quiet = async (path = "/learn") => { const r = app(path); await new Promise((res) => setTimeout(res, 1000)); r.unmount(); };
    shell({ rail: false });
    await quiet(); // a guest
    m.user = { uid: "u1" }; m.state = { onboarded: true, toured: 1 };
    await quiet(); // seen it
    m.state = { onboarded: false, toured: undefined };
    document.body.innerHTML = '<main class="onb"></main>'; // onboarding: no navigation yet
    await quiet();
    shell({ rail: false });
    await quiet("/lesson/ai-1-1/ai-1-1-1");
    expect(m.configs).toHaveLength(0);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("not by itself before onboarding is done, even where the app's layout shows (Me), nor over an onboarding step", async () => {
    const quiet = async (path = "/learn") => { const r = app(path); await new Promise((res) => setTimeout(res, 1000)); r.unmount(); };
    m.user = { uid: "u1" }; m.state = { onboarded: false, toured: undefined };
    shell({ rail: false });
    await quiet("/me"); // "Who are you?" not answered yet
    m.state = { onboarded: true, toured: undefined };
    shell({ rail: false });
    document.body.insertAdjacentHTML("beforeend", '<section class="dr-onb">Where do you teach?</section>');
    await quiet();
    expect(m.configs).toHaveLength(0);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("not by itself with nothing to point at (no navigation on screen)", async () => {
    m.user = { uid: "u1" };
    document.body.innerHTML = '<div class="app-shell"><main></main></div>';
    const r = app("/me");
    await new Promise((res) => setTimeout(res, 1200));
    r.unmount();
    expect(m.configs).toHaveLength(0);
  });

  it("closes if its page goes while it is open", async () => {
    m.user = { uid: "u1" };
    shell({ rail: false });
    const r = app();
    await waitFor(() => expect(m.configs).toHaveLength(1), { timeout: 4000 });
    fireEvent.click(r.getByRole("button", { name: "go to labs" }));
    await waitFor(() => expect(m.moves).toContain("end"));
  });

  it("by itself for admins, who skip onboarding", async () => {
    m.user = { uid: "boss" }; m.role = "superadmin"; m.state = { onboarded: false, toured: undefined };
    shell({ rail: true, home: false, staff: ["/super"] });
    app("/super");
    await waitFor(() => expect(m.configs).toHaveLength(1), { timeout: 4000 });
  });

  it("from Me, a platform admin (who skips onboarding) goes to Learn too", async () => {
    m.user = { uid: "boss" }; m.role = "superadmin"; m.state = { onboarded: false, toured: 1 };
    shell({ rail: true });
    const r = app("/me");
    act(() => openTour());
    await waitFor(() => expect(r.getByTestId("at").textContent).toBe("/learn"));
    // Let the tour it opens start and close here, so it doesn't land in the next test.
    await waitFor(() => expect(m.configs).toHaveLength(1), { timeout: 4000 });
    act(() => m.configs[0].onDestroyed?.());
  });

  it("from Me, for anyone: it goes to Learn first", async () => {
    shell({ rail: true });
    const r = app("/me");
    act(() => openTour());
    await waitFor(() => expect(r.getByTestId("at").textContent).toBe("/learn"));
    await waitFor(() => expect(m.configs).toHaveLength(1), { timeout: 4000 });
  });
});
