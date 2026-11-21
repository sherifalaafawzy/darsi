// /results for a university teacher (results/CourseResults.tsx): a grant whose end date has passed is said as such
// instead of offering courses that would only answer `no-grant`; Retry says it is under way and keeps the focus; and
// the course names follow the catalog when content/load forgets it (an app left open, a course published meanwhile).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import appEn from "../src/i18n/en.json";
import appAr from "../src/i18n/ar.json";

type Grant = { uid: string; units: string[]; until?: number | null };
const m = vi.hoisted(() => ({
  auth: { user: { uid: "t1" }, role: "learner", orgId: null, profile: { teach: "university" }, profileReady: true } as Record<string, unknown>,
  myGrant: vi.fn<(uid: string) => Promise<Grant | null>>(),
  courseResults: vi.fn<(unitId: string) => Promise<unknown>>(),
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/results/data", () => ({ myGrant: m.myGrant, courseResults: m.courseResults }));

const { CourseResults } = await import("../src/results/CourseResults");
const { useCatalog, useOnce } = await import("../src/results/async");

const DAY = 864e5;
const titles = { "ai-s4": "Train your own model", "iot-s4": "A sensor network" };
const catalog = (names: Record<string, string> = titles) => ({ version: 1, units: Object.entries(names).map(([id, en]) => ({ id, title: { en } })) });
type Loader = import("../src/results/async").ContentLoader;
/** What App passes in (CONTENT): the fakes' answers are only as much of a catalog or unit as the page reads. */
const content = (over: Partial<{ loadCatalog: () => Promise<unknown>; subscribe: (f: () => void) => () => void }> = {}): Loader => ({
  loadCatalog: vi.fn(async () => catalog()), loadUnit: async () => ({ id: "ai-s4", lessons: [] }), ...over,
}) as unknown as Loader;
const page = (c = content(), lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><CourseResults content={c} /></MemoryRouter></I18nProvider>);
const deferred = <T,>() => { let done!: (v: T) => void, fail!: (e: unknown) => void; const p = new Promise<T>((r, j) => { done = r; fail = j; }); return { p, done, fail }; };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  m.myGrant.mockReset(); m.courseResults.mockReset();
  m.courseResults.mockResolvedValue({ results: [], work: [] });
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

describe("a grant whose end date has passed", () => {
  it("says the access ended, on which day, and offers no course to pick (nothing is asked of the server)", async () => {
    const until = new Date(2026, 9, 30, 23, 59, 59, 999).getTime(); // the 30th, as /super/access stores "until the 30th"
    m.myGrant.mockResolvedValue({ uid: "t1", units: ["ai-s4", "iot-s4"], until });
    page();
    expect(await screen.findByRole("heading", { name: "Your access has ended" })).toBeTruthy();
    expect(screen.getByText(/ended on October 30, 2026\. A Darsi admin can give it to you again\./)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(m.courseResults).not.toHaveBeenCalled();
  });

  it("in Arabic, with the date in Arabic", async () => {
    m.myGrant.mockResolvedValue({ uid: "t1", units: ["ai-s4"], until: Date.now() - DAY });
    page(content(), "ar");
    expect(await screen.findByRole("heading", { name: "انتهت صلاحية اطلاعك" })).toBeTruthy();
    expect(screen.getByText(/من جديد\./).textContent).toMatch(/[٠-٩]/);
    expect(m.courseResults).not.toHaveBeenCalled();
  });

  it("a grant still running, or with no end, shows its courses as before", async () => {
    m.myGrant.mockResolvedValue({ uid: "t1", units: ["ai-s4", "iot-s4"], until: Date.now() + DAY });
    page();
    const pick = await screen.findByRole("combobox", { name: "Course" });
    await waitFor(() => expect(pick.textContent).toContain("Train your own model"));
    expect(screen.queryByText("Your access has ended")).toBeNull();
    await waitFor(() => expect(m.courseResults).toHaveBeenCalledWith("ai-s4"));
  });
});

describe("Retry", () => {
  it("shows that it is retrying, keeps the focus on the button, and a second press sends nothing more", async () => {
    const again = deferred<Grant | null>();
    m.myGrant.mockRejectedValueOnce(Object.assign(new Error("RAW SDK WORDS"), { code: "unavailable" })).mockReturnValueOnce(again.p);
    page();
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert").textContent).not.toContain("RAW SDK WORDS");
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(retry.getAttribute("aria-busy")).toBe("true"));
    expect(document.activeElement).toBe(retry); // the same button, still on the page
    expect(screen.getByRole("alert")).toBeTruthy(); // the note stays: no page-wide spinner in its place
    fireEvent.click(retry);
    expect(m.myGrant).toHaveBeenCalledTimes(2);
    await act(async () => { again.done({ uid: "t1", units: ["ai-s4"] }); });
    expect(await screen.findByRole("combobox", { name: "Course" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a retry that fails again stops spinning and says why", async () => {
    const offline = () => Object.assign(new Error("x"), { code: "unavailable" });
    m.myGrant.mockResolvedValue({ uid: "t1", units: ["ai-s4"] });
    const again = deferred<unknown>();
    m.courseResults.mockReset();
    m.courseResults.mockRejectedValueOnce(offline()).mockReturnValueOnce(again.p);
    page();
    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    await waitFor(() => expect(retry.getAttribute("aria-busy")).toBe("true"));
    await act(async () => { again.fail(offline()); });
    await waitFor(() => expect(retry.hasAttribute("aria-busy")).toBe(false));
    expect(screen.getByRole("button", { name: "Retry" })).toBe(retry);
  });
});

describe("the catalog follows content/load", () => {
  it("re-reads the course names when the catalog is forgotten, keeping the old ones meanwhile", async () => {
    let tell = () => {};
    const unsubscribe = vi.fn();
    const next = deferred<unknown>();
    const loadCatalog = vi.fn().mockResolvedValueOnce(catalog()).mockReturnValueOnce(next.p);
    m.myGrant.mockResolvedValue({ uid: "t1", units: ["ai-s4"] });
    const { unmount } = page(content({ loadCatalog, subscribe: (f) => { tell = f; return unsubscribe; } }));
    const pick = await screen.findByRole("combobox", { name: "Course" });
    await waitFor(() => expect(pick.textContent).toBe("Train your own model"));
    act(() => tell());
    expect(loadCatalog).toHaveBeenCalledTimes(2);
    expect(pick.textContent).toBe("Train your own model"); // still shown while the new list is on its way
    await act(async () => { next.done(catalog({ "ai-s4": "Train and test your own model" })); });
    expect(pick.textContent).toBe("Train and test your own model");
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("a re-read that fails keeps the list it had", async () => {
    let tell = () => {};
    function Names({ c }: { c: Parameters<typeof useCatalog>[0] }) { const q = useCatalog(c); return <p>{q.data ? q.data.units.map((u) => u.title.en).join(", ") : q.error ? "failed" : "loading"}</p>; }
    const loadCatalog = vi.fn().mockResolvedValueOnce(catalog()).mockRejectedValueOnce(new Error("offline"));
    render(<Names c={content({ loadCatalog, subscribe: (f) => { tell = f; return () => {}; } })} />);
    expect(await screen.findByText("Train your own model, A sensor network")).toBeTruthy();
    await act(async () => { tell(); });
    expect(loadCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Train your own model, A sensor network")).toBeTruthy();
  });

  it("without a subscription (an older App) it reads once, as before", async () => {
    function Names({ c }: { c: Parameters<typeof useCatalog>[0] }) { const q = useCatalog(c); return <p>{q.loading ? "loading" : "ready"}</p>; }
    const c = content();
    const { rerender } = render(<Names c={c} />);
    expect(await screen.findByText("ready")).toBeTruthy();
    rerender(<Names c={{ ...c }} />); // a new object with the same functions reads nothing again
    expect(c.loadCatalog).toHaveBeenCalledTimes(1);
  });
});

it("useOnce: another key never shows the previous one's data", async () => {
  const reads: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred<string>(), b: deferred<string>() };
  function Show({ id }: { id: string }) { const q = useOnce(() => reads[id].p, [id]); return <p>{q.loading ? "loading" : String(q.data)}</p>; }
  const { rerender } = render(<Show id="a" />);
  await act(async () => { reads.a.done("A"); });
  expect(screen.getByText("A")).toBeTruthy();
  rerender(<Show id="b" />);
  expect(screen.getByText("loading")).toBeTruthy();
  await act(async () => { reads.b.done("B"); });
  expect(screen.getByText("B")).toBeTruthy();
});

it("the new /results strings exist in English and Arabic", () => {
  const en = appEn as Record<string, string>, ar = appAr as Record<string, string>;
  for (const key of ["results.ended", "results.endedBody"]) {
    expect(en[key]).toBeTruthy();
    expect(ar[key]).toBeTruthy();
    expect(ar[key].replace(/\{\w+\}/g, "")).not.toMatch(/[A-Za-z]{3}|·/); // no English left, no "·"
  }
  expect(ar["results.endedBody"]).toContain("{date}");
});
