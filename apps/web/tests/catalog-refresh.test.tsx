// An app left open for days still sees what was published or unpublished meanwhile (content/load.ts, content/settings.tsx):
// the catalog and the settings are read again when the app comes back to the front, or back online, once they are more
// than ten minutes old. One conditional read on an event, never a timer; what is on the screen stays until the new
// list answers. fetch and Cache Storage are fakes here; only the clock (Date) is faked, so nothing waits ten minutes.
import { act, render, screen } from "@testing-library/react";
import type { CatalogEntry } from "../src/content/types";
import { fakeCaches, json } from "./stubs/caches";

vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));

const { configureContent, forgetCatalog, forgetSettings, loadCatalog, loadPlacement, loadUnit, setOrgReader, STALE_MS, subscribeCatalog, useAsync } = await import("../src/content/load");
const { useCatalog } = await import("../src/results/async");
const { SettingsProvider, useSuperOn, useTracks } = await import("../src/content/settings");
const { I18nProvider } = await import("../src/i18n");

const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media`;
const entry = (id: string): CatalogEntry => ({ id, track: "ai", level: 1, title: { en: id }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1 });
const MIN = 60e3;

/** What the site would answer now, and how often each file was asked for. */
const site = { units: ["ai-1-1"], settings: { version: 1, tracks: [] } as Record<string, unknown>, down: false, hold: null as null | Promise<void> };
let reads: { catalog: number; settings: number; other: number };
const fetchMock = vi.fn(async (u: string) => {
  const file = u === url("content/catalog.json") ? "catalog" : u === url("content/settings.json") ? "settings" : "other";
  reads[file]++;
  if (site.hold) await site.hold;
  if (site.down) throw new TypeError("Failed to fetch");
  return file === "catalog" ? json({ version: 1, units: site.units.map(entry) }) : file === "settings" ? json(site.settings) : json({ version: 1, tracks: {} });
});

let visible = true, online = true;
const show = (v: boolean) => act(() => { visible = v; document.dispatchEvent(new Event("visibilitychange")); });
const connect = (on: boolean) => act(() => { online = on; if (on) window.dispatchEvent(new Event("online")); });
/** Lets the reads in flight answer and the screen take them in. Real time (a timeout, not testing-library's interval). */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

let renders = 0;
function Courses({ id = "courses" }: { id?: string }) {
  renders++;
  const { data, error } = useAsync(loadCatalog, []);
  return <p data-testid={id}>{error ? "error" : data ? data.units.map((u) => u.id).join(" ") || "none" : "loading"}</p>;
}
const shown = (id = "courses") => screen.getByTestId(id).textContent;

let intervals: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T08:00:00Z"));
  vi.stubGlobal("caches", fakeCaches(location.origin));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  visible = true; online = true; renders = 0;
  site.units = ["ai-1-1"]; site.settings = { version: 1, tracks: [] }; site.down = false; site.hold = null;
  reads = { catalog: 0, settings: 0, other: 0 };
  // The module keeps one catalog and one settings read for the whole page: each test starts without them, and as
  // someone without an organization.
  configureContent({ orgId: null, signedIn: true });
  forgetCatalog(); forgetSettings();
  localStorage.clear();
  intervals = vi.spyOn(globalThis, "setInterval");
});
afterEach(() => {
  // Nothing here ever polls: every re-read came from an event.
  expect(intervals).not.toHaveBeenCalled();
  intervals.mockRestore();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("the catalog in an app left open", () => {
  it("is read again once when the app comes back after 11 minutes, and the screen shows the new list", async () => {
    render(<Courses />);
    await settle();
    expect(shown()).toBe("ai-1-1");
    expect(reads.catalog).toBe(1);
    show(false);
    site.units = ["ai-1-1", "cyber-4-1"]; // published while the app was in the background
    later(11 * MIN);
    show(true);
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("ai-1-1 cyber-4-1");
    // Coming back again a moment later reads nothing: the list is new.
    show(false); show(true);
    await settle();
    expect(reads.catalog).toBe(2);
  });

  it("reads nothing when the app comes back after 5 minutes", async () => {
    render(<Courses />);
    await settle();
    site.units = ["ai-1-1", "cyber-4-1"];
    show(false); later(5 * MIN); show(true);
    connect(true);
    await settle();
    expect(reads.catalog).toBe(1);
    expect(shown()).toBe("ai-1-1");
    expect(STALE_MS).toBe(10 * MIN);
  });

  it("forgetCatalog() makes every screen that shows the catalog read it again, in one read", async () => {
    render(<><Courses /><Courses id="again" /></>);
    await settle();
    expect(reads.catalog).toBe(1);
    site.units = ["iot-4-1"]; // ai-1-1 was unpublished
    act(() => forgetCatalog());
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("iot-4-1");
    expect(shown("again")).toBe("iot-4-1");
  });

  it("the pages that get content from App (Course results, Course access) read it again too, through subscribeCatalog", async () => {
    // As App.tsx's CONTENT: these pages can't import content/load (results/async.ts says why).
    const content = { loadCatalog, loadUnit, subscribe: subscribeCatalog };
    function Results() { const { data } = useCatalog(content); return <p data-testid="results">{data ? data.units.map((u) => u.id).join(" ") || "none" : "loading"}</p>; }
    const { unmount } = render(<Results />);
    await settle();
    expect(shown("results")).toBe("ai-1-1");
    site.units = ["ai-1-1", "iot-4-1"]; // the editor published iot-4-1
    act(() => forgetCatalog());
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown("results")).toBe("ai-1-1 iot-4-1");
    // Left: forgetting the catalog reads nothing for a page that is gone.
    unmount();
    act(() => forgetCatalog());
    await settle();
    expect(reads.catalog).toBe(2);
  });

  it("keeps showing the list it has until the new one answers (never an empty Home)", async () => {
    render(<Courses />);
    await settle();
    let answer = () => {};
    site.hold = new Promise<void>((r) => { answer = r; });
    site.units = ["ai-1-1", "cyber-4-1"];
    // No copy to fall back on after 2.5 s here: the read really is still on its way.
    vi.stubGlobal("caches", undefined);
    act(() => forgetCatalog());
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("ai-1-1"); // not "loading"
    answer();
    await settle();
    expect(shown()).toBe("ai-1-1 cyber-4-1");
  });

  it("keeps the list it has when the new read fails", async () => {
    vi.stubGlobal("caches", undefined); // no saved copy either: the read itself fails
    render(<Courses />);
    await settle();
    expect(shown()).toBe("ai-1-1");
    site.down = true;
    act(() => forgetCatalog());
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("ai-1-1"); // not "error"
  });

  it("changes nothing on the screen when the new read says the same", async () => {
    render(<Courses />);
    await settle();
    const before = renders, was = await loadCatalog();
    show(false); later(11 * MIN); show(true);
    await settle();
    expect(reads.catalog).toBe(2);
    expect(await loadCatalog()).toBe(was); // the very same list object: memos that hold it stay
    // One render for the re-read starting (the version moved), none for its answer.
    expect(renders - before).toBe(1);
  });

  it("offline when it comes back: waits, and reads when the connection returns", async () => {
    render(<Courses />);
    await settle();
    site.units = ["ai-1-1", "cyber-4-1"];
    show(false); connect(false); later(11 * MIN); show(true);
    await settle();
    expect(reads.catalog).toBe(1); // the copy it already shows is all an offline read could give
    connect(true);
    await settle();
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("ai-1-1 cyber-4-1");
  });

  it("with no screen showing the catalog, reads nothing until one asks", async () => {
    await loadCatalog();
    show(false); later(11 * MIN); show(true);
    await settle();
    expect(reads.catalog).toBe(1);
    site.units = ["opt-4-1"];
    expect((await loadCatalog()).units.map((u) => u.id)).toEqual(["opt-4-1"]);
    expect(reads.catalog).toBe(2);
  });

  it("leaves other useAsync calls alone", async () => {
    let runs = 0;
    const other = () => { runs++; return loadPlacement().then(() => "placement"); };
    function Other() { const { data } = useAsync(other, []); return <p data-testid="other">{data ?? "loading"}</p>; }
    render(<><Courses /><Other /></>);
    await settle();
    expect(shown("other")).toBe("placement");
    act(() => forgetCatalog());
    await settle();
    expect(runs).toBe(1);
    expect(reads.catalog).toBe(2);
  });
});

// A slow start (AuthProvider's 2.5 s timer) shows Home before the account, and so its organization, arrives. Nothing
// remounts when it does (the store is that account's either way), so the catalog itself has to say it changed.
describe("an organization that arrives after a screen asked for the catalog", () => {
  const orgUnit = { ...entry("uorg00001"), src: "orgs/o1/units/uorg00001/v1.json" };
  const orgRead = vi.fn(async (_path: string) => ({ version: 1, units: [orgUnit] }) as unknown);
  beforeEach(() => { orgRead.mockClear(); setOrgReader(orgRead); });

  it("has the screen read again, behind what it shows, and the organization's courses appear without leaving it", async () => {
    render(<><Courses /><Courses id="again" /></>);
    await settle();
    expect(shown()).toBe("ai-1-1");
    expect(orgRead).not.toHaveBeenCalled();
    // As App does while it renders, once the account is published: never a state change during that render.
    configureContent({ orgId: "o1", signedIn: true });
    expect(shown()).toBe("ai-1-1"); // not "loading"
    await settle();
    expect(orgRead).toHaveBeenCalledWith("orgs/o1/catalog.json");
    expect(reads.catalog).toBe(2);
    expect(shown()).toBe("ai-1-1 uorg00001");
    expect(shown("again")).toBe("ai-1-1 uorg00001");
    // App says the same on every render: nothing more is read.
    configureContent({ orgId: "o1", signedIn: true });
    await settle();
    expect(reads.catalog).toBe(2);
    expect(orgRead).toHaveBeenCalledTimes(1);
  });

  it("and leaves again the same way (the account left its organization in another tab)", async () => {
    configureContent({ orgId: "o1", signedIn: true });
    render(<Courses />);
    await settle();
    expect(shown()).toBe("ai-1-1 uorg00001");
    configureContent({ orgId: null, signedIn: true });
    await settle();
    expect(shown()).toBe("ai-1-1");
  });

  it("known before any screen asked (the usual start): one read, and no render more than without an organization", async () => {
    const { unmount } = render(<Courses />);
    await settle();
    unmount();
    const plain = renders;
    forgetCatalog();
    configureContent({ orgId: "o1", signedIn: true }); // nothing has asked since the catalog was forgotten
    render(<Courses />);
    await settle();
    expect(reads.catalog).toBe(2); // one each
    expect(shown()).toBe("ai-1-1 uorg00001");
    expect(renders - plain).toBe(plain);
  });
});

describe("the settings in an app left open", () => {
  function Probe() { return <p data-testid="settings">{useSuperOn().on ? "super on" : "super off"} {useTracks().all.length}</p>; }
  const app = () => render(<I18nProvider lang="en"><SettingsProvider lang="en"><Probe /></SettingsProvider></I18nProvider>);

  it("are read again once after 11 minutes away, so Super switched off for everyone is seen", async () => {
    app();
    await settle();
    expect(reads.settings).toBe(1);
    expect(shown("settings")).toMatch(/^super on/);
    show(false);
    site.settings = { version: 2, tracks: [], super: false };
    later(11 * MIN);
    show(true);
    await settle();
    expect(reads.settings).toBe(2);
    expect(shown("settings")).toMatch(/^super off/);
    show(false); show(true);
    await settle();
    expect(reads.settings).toBe(2);
  });

  it("are not read again after 5 minutes, and offline they wait for the connection", async () => {
    app();
    await settle();
    show(false); later(5 * MIN); show(true);
    await settle();
    expect(reads.settings).toBe(1);
    connect(false); later(6 * MIN); show(false); show(true);
    await settle();
    expect(reads.settings).toBe(1);
    connect(true);
    await settle();
    expect(reads.settings).toBe(2);
  });

  it("keep what the app has when the new read gets no answer", async () => {
    site.settings = { version: 2, tracks: [], super: false };
    vi.stubGlobal("caches", undefined);
    app();
    await settle();
    expect(shown("settings")).toMatch(/^super off/);
    site.down = true;
    show(false); later(11 * MIN); show(true);
    await settle();
    expect(reads.settings).toBe(2);
    expect(shown("settings")).toMatch(/^super off/);
  });
});
