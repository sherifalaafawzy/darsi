// A chunk that won't load, or a screen that throws, must never blank the app (src/app/AppBoundary.tsx):
// - a page's failure stays in the page: the nav around it stays, Retry asks the network again, and moving to another
//   page clears it;
// - what no page boundary caught shows a card that needs no provider at all, in the page's language;
// - every failure is told once, as a "darsi:app-error" window event;
// - nothing reloads by itself.
import { Suspense, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { OPEN_REPORT } from "../src/bugs/log";
import en from "../src/app/strings/en.json";
import ar from "../src/app/strings/ar.json";
import { APP_ERROR, AppBoundary, isChunkError, lazyRetry, RouteBoundary, tellAppError, type AppErrorDetail } from "../src/app/AppBoundary";

// The report sheet's chunk: a stand-in that still asks for the i18n provider, as the real sheet does.
vi.mock("../src/bugs/Report", async () => {
  const { useI18n } = await import("../src/i18n");
  return {
    capture: async () => null,
    ReportSheet: ({ about, uid, getToken, onClose }: { about: { who: string | null; account: unknown; learner: Record<string, unknown> }; uid: string | null; getToken: unknown; onClose: () => void }) => {
      const { t } = useI18n();
      return (
        <div role="dialog">
          <p>{t("bug.button")}: {String(about.learner.crashed)}</p>
          <p data-testid="sender">{JSON.stringify({ uid, who: about.who, account: about.account, token: typeof getToken === "function" })}</p>
          <button type="button" onClick={onClose}>Close the sheet</button>
        </div>
      );
    },
  };
});

// One lab's app breaks while it renders (labs have their own boundary, labs/loader.tsx).
vi.mock("../src/labs/apps/activation/index.tsx", () => ({ default: () => { throw new Error("the lab broke"); } }));

const setOnline = (v: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => v });
const reload = vi.fn();
let events: AppErrorDetail[] = [];
const heard = (e: Event) => { events.push((e as CustomEvent<AppErrorDetail>).detail); };
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  events = []; reload.mockReset();
  window.addEventListener(APP_ERROR, heard);
  vi.stubGlobal("location", { ...location, reload });
  logged = vi.spyOn(console, "error").mockImplementation(() => {}); // React and the boundary both log what was caught
});
afterEach(() => {
  window.removeEventListener(APP_ERROR, heard);
  setOnline(true); vi.unstubAllGlobals(); logged.mockRestore();
  document.documentElement.lang = "en";
});

/** The app's frame as components/Layout.tsx builds it: the nav, then the page inside a boundary. */
function Shell() {
  return (
    <>
      <nav aria-label="Main"><Link to="/a">Page A</Link><Link to="/b">Page B</Link></nav>
      <RouteBoundary><Suspense fallback={<p>Loading</p>}><Outlet /></Suspense></RouteBoundary>
    </>
  );
}
const open = (at: string, routes: ReactNode) => render(
  <I18nProvider lang="en"><MemoryRouter initialEntries={[at]}><Routes><Route element={<Shell />}>{routes}</Route></Routes></MemoryRouter></I18nProvider>,
);
const page = (title: string) => ({ default: () => <h1>{title}</h1> });

describe("a page whose chunk won't load", () => {
  it("offline: says it isn't on the phone yet, keeps the nav, and Retry asks again and shows the page", async () => {
    setOnline(false);
    // Any rejected import counts, whatever words the browser used.
    const load = vi.fn<() => Promise<{ default: () => ReactNode }>>().mockRejectedValueOnce(new Error("no such file")).mockResolvedValue(page("The page"));
    const Page = lazyRetry(load);
    open("/a", <Route path="a" element={<Page />} />);
    expect(await screen.findByText(en["shell.notSaved"])).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(events).toEqual([expect.objectContaining({ chunk: true, name: "Error", message: "no such file" })]);
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: "no such file" }));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "The page" })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("online and the site answers: this copy is out of date, and Reload is a button (never by itself)", async () => {
    setOnline(true);
    const fetch = vi.fn(async () => new Response(null, { headers: { "Content-Type": "text/javascript" } }));
    vi.stubGlobal("fetch", fetch);
    const Page = lazyRetry(() => Promise.reject<{ default: () => ReactNode }>(new TypeError("Failed to fetch dynamically imported module: /assets/Page-old.js")));
    open("/a", <Route path="a" element={<Page />} />);
    expect(await screen.findByText(en["shell.outdated"])).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ method: "HEAD", cache: "no-store" }));
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    // The tap can wait for the new version to finish saving (up to 15 s): the button says it is working.
    expect(screen.getByRole("button", { name: "Reload" }).getAttribute("aria-busy")).toBe("true");
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("online with nothing getting through (a Wi-Fi sign-in page): not saved yet, never Reload", async () => {
    setOnline(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })));
    const Page = lazyRetry(() => Promise.reject<{ default: () => ReactNode }>(new Error("nope")));
    open("/a", <Route path="a" element={<Page />} />);
    expect(await screen.findByText(en["shell.notSaved"])).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("opened from another page it is asked for once (no loop); moving on clears it, and coming back asks again", async () => {
    setOnline(false);
    const load = vi.fn<() => Promise<{ default: () => ReactNode }>>().mockRejectedValue(new Error("gone"));
    const Broken = lazyRetry(load);
    const Fine = lazyRetry(async () => page("Page B is fine"));
    open("/b", <><Route path="a" element={<Broken />} /><Route path="b" element={<Fine />} /></>);
    expect(await screen.findByRole("heading", { name: "Page B is fine" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Page A" }));
    expect(await screen.findByText(en["shell.notSaved"])).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    expect(load).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);

    fireEvent.click(screen.getByRole("link", { name: "Page B" }));
    expect(await screen.findByRole("heading", { name: "Page B is fine" })).toBeTruthy();
    expect(screen.queryByText(en["shell.notSaved"])).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Page A" }));
    expect(await screen.findByText(en["shell.notSaved"])).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("knows a failed import by each browser's words, for lazy components made elsewhere", () => {
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://darsiai.org/assets/Cms-abc.js"))).toBe(true); // Chrome
    expect(isChunkError(new TypeError("error loading dynamically imported module: https://darsiai.org/assets/Cms-abc.js"))).toBe(true); // Firefox
    expect(isChunkError(new TypeError("Importing a module script failed."))).toBe(true); // Safari
    expect(isChunkError(new Error("Unable to preload CSS for /assets/Cms-abc.css"))).toBe(true); // Vite
    expect(isChunkError(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
  });
});

describe("a page that throws while it renders", () => {
  it("says so in the page's place with Retry, Reload and Report; the nav stays", async () => {
    let broken = true;
    const Flaky = () => { if (broken) throw new Error("boom"); return <h1>Fine now</h1>; };
    open("/a", <Route path="a" element={<Flaky />} />);
    expect(await screen.findByRole("heading", { name: en["shell.pageError"] })).toBeTruthy();
    expect(screen.getByText("Your progress is safe. Try again in a moment.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(events).toEqual([expect.objectContaining({ chunk: false, name: "Error", message: "boom" })]);

    const asked = vi.fn();
    window.addEventListener(OPEN_REPORT, asked);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    window.removeEventListener(OPEN_REPORT, asked);
    expect(asked).toHaveBeenCalledTimes(1);

    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Fine now" })).toBeTruthy();
  });

  it("one broken page doesn't block the others", async () => {
    const Broken = () => { throw new Error("boom"); };
    open("/a", <><Route path="a" element={<Broken />} /><Route path="b" element={<h1>Page B is fine</h1>} /></>);
    expect(await screen.findByRole("heading", { name: en["shell.pageError"] })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Page B" }));
    expect(await screen.findByRole("heading", { name: "Page B is fine" })).toBeTruthy();
    expect(screen.queryByText(en["shell.pageError"])).toBeNull();
  });
});

describe("the whole app failing (AppBoundary)", () => {
  const Boom = () => { throw new Error("whole app"); };

  it("shows a card with no provider around it, in Arabic on an Arabic page, and Reload reloads", async () => {
    document.documentElement.lang = "ar";
    render(<AppBoundary><Boom /></AppBoundary>);
    expect(screen.getByRole("heading", { name: ar["shell.crashT"] })).toBeTruthy();
    expect(screen.getByText(ar["shell.crashB"]).closest("[lang]")?.getAttribute("dir")).toBe("rtl");
    expect(screen.queryByText(en["shell.crashT"])).toBeNull();
    expect(events).toEqual([expect.objectContaining({ chunk: false, message: "whole app" })]);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: ar["shell.reload"] }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("in English on an English page; in both when the page's language is neither (Arabic in the phone's font)", () => {
    document.documentElement.lang = "en";
    const a = render(<AppBoundary><Boom /></AppBoundary>);
    expect(screen.getByRole("heading", { name: en["shell.crashT"] })).toBeTruthy();
    expect(screen.queryByText(ar["shell.crashT"])).toBeNull();
    a.unmount();
    document.documentElement.lang = "fr";
    render(<AppBoundary><Boom /></AppBoundary>);
    expect(screen.getByRole("heading", { name: en["shell.crashT"] })).toBeTruthy();
    const arabic = screen.getByRole("heading", { name: ar["shell.crashT"] }).closest("[lang]")!;
    expect(arabic.getAttribute("lang")).toBe("ar");
    expect(arabic.className).toBe("dr-other-script");
  });

  it("can still report the problem: its own sheet, since the app's button went with the app", async () => {
    const view = render(<AppBoundary><Boom /></AppBoundary>);
    expect(screen.queryByRole("button", { name: en["shell.report"] })).toBeNull(); // no loader handed in: no button
    view.unmount();
    render(<AppBoundary report={() => import("../src/bugs/Report")}><Boom /></AppBoundary>);
    fireEvent.click(screen.getByRole("button", { name: en["shell.report"] }));
    expect((await screen.findByRole("dialog")).textContent).toContain("Report a problem: Error: whole app");
    // No account handed in (a guest): the report is anonymous.
    expect(JSON.parse(screen.getByTestId("sender").textContent!)).toEqual({ uid: null, who: null, account: null, token: false });
    fireEvent.click(screen.getByRole("button", { name: "Close the sheet" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: en["shell.crashT"] })).toBeTruthy();
  });

  it("the report still says whose it is: the account App hands in, with its token; only the uid when offline", async () => {
    const getToken = async () => "token";
    const signedIn = render(<AppBoundary report={() => import("../src/bugs/Report")} who={{ uid: "u1", name: "Mona", getToken }}><Boom /></AppBoundary>);
    fireEvent.click(screen.getByRole("button", { name: en["shell.report"] }));
    await screen.findByRole("dialog");
    expect(JSON.parse(screen.getByTestId("sender").textContent!)).toEqual({ uid: "u1", who: "Mona", account: { uid: "u1" }, token: true });
    signedIn.unmount();
    // Signed in on this device, offline before the SDK loaded: no token to send, and the report says so.
    render(<AppBoundary report={() => import("../src/bugs/Report")} who={{ uid: "u2", name: null, offline: true, getToken: null }}><Boom /></AppBoundary>);
    fireEvent.click(screen.getByRole("button", { name: en["shell.report"] }));
    await screen.findByRole("dialog");
    expect(JSON.parse(screen.getByTestId("sender").textContent!)).toEqual({ uid: "u2", who: "u2", account: { uid: "u2", offline: true }, token: false });
  });

  it("says so when the report can't open (its chunk isn't on this phone, and it's offline)", async () => {
    render(<AppBoundary report={() => Promise.reject(new Error("offline"))}><Boom /></AppBoundary>);
    fireEvent.click(screen.getByRole("button", { name: en["shell.report"] }));
    expect(await screen.findByText(en["shell.reportFailed"])).toBeTruthy();
    expect(screen.queryByRole("button", { name: en["shell.report"] })).toBeNull();
    expect(screen.getByRole("button", { name: en["shell.reload"] })).toBeTruthy();
  });

  it("leaves a healthy app alone", () => {
    render(<AppBoundary><h1>All good</h1></AppBoundary>);
    expect(screen.getByRole("heading", { name: "All good" })).toBeTruthy();
    expect(events).toEqual([]);
  });
});

describe("telling the rest of the app (darsi:app-error)", () => {
  it("tells each error once: Vite's preload event and the boundary see the same rejected import", () => {
    const failed = new TypeError("Failed to fetch dynamically imported module: /assets/Tutor-abc.js");
    tellAppError(failed, true); // main.tsx, on vite:preloadError
    tellAppError(failed); // the boundary, when the import's rejection reaches it
    expect(events).toEqual([{ name: "TypeError", message: failed.message, stack: expect.any(String), chunk: true }]);
    tellAppError("a string thrown");
    expect(events[1]).toMatchObject({ name: "Error", message: "a string thrown", chunk: false });
  });

  it("a lab that fails inside its own boundary is told too", async () => {
    setOnline(false);
    const { LabEmbed } = await import("../src/labs/loader");
    render(<I18nProvider lang="en"><LabEmbed id="activation" /></I18nProvider>);
    expect(await screen.findByText(/isn.t on your phone yet/)).toBeTruthy();
    expect(events).toEqual([expect.objectContaining({ chunk: false, message: "the lab broke" })]);
  });
});

describe("the shell's own strings", () => {
  it("are in English and Arabic, with no middle dot in Arabic", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(ar)) {
      expect(text, key).toBeTruthy();
      expect(text, key).not.toContain("·");
      expect(text, key).toMatch(/[؀-ۿ]/);
    }
  });
});
