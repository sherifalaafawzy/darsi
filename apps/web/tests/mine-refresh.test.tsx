// A member whose organization chose their courses (content/mine.ts useUnitsWhen) sees a catalog read again after
// load.ts forgets it (forgetCatalog: the app came back after a long while), as Home does: a course published since
// brings its track into the tracks they can pick. Nothing is read for someone whose organization chose nothing.
// The real content/load.ts, with fetch and Cache Storage faked (as tests/catalog-refresh.test.tsx).
import { act, render, screen } from "@testing-library/react";
import type { CatalogEntry } from "../src/content/types";
import { fakeCaches, json } from "./stubs/caches";

const h = vi.hoisted(() => ({ stored: null as unknown }));
vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored, set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: "student", user: null, configured: false }) }));

const { forgetCatalog, forgetSettings } = await import("../src/content/load");
const { SettingsProvider } = await import("../src/content/settings");
const { I18nProvider } = await import("../src/i18n");
const { StoreProvider, initialState } = await import("../src/state/store");
const { useMine } = await import("../src/content/mine");

const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media`;
const entry = (id: string): CatalogEntry => ({ id, track: id.split("-")[0], level: 1, title: { en: id }, summary: { en: "" }, lessons: 1, sizeMB: 1, available: true, src: `content/units/${id}/v1.json`, version: 1, audience: "students" });
const site = { units: ["ai-s1"] };
let catalogReads = 0;
const fetchMock = vi.fn(async (u: string) => {
  if (u === url("content/catalog.json")) { catalogReads++; return json({ version: 1, units: site.units.map(entry) }); }
  return new Response("", { status: 404 });
});

function Offered() { return <p data-testid="offered">{useMine().offered.map((t) => t.id).join(" ")}</p>; }
const show = () => render(<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider><Offered /></StoreProvider></SettingsProvider></I18nProvider>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(() => {
  vi.stubGlobal("caches", fakeCaches(location.origin));
  vi.stubGlobal("fetch", fetchMock);
  site.units = ["ai-s1"]; catalogReads = 0;
  forgetCatalog(); forgetSettings();
});
afterEach(() => vi.unstubAllGlobals());

describe("the courses an organization chose for a member", () => {
  it("are read again when the catalog is forgotten: a course published since adds its track", async () => {
    h.stored = { ...initialState, onboarded: true, lang: "en", org: { id: "o1", name: "Nile School", v: 1, courses: ["ai-s1", "cyber-s1"] } };
    show();
    await settle();
    expect(screen.getByTestId("offered").textContent).toBe("ai");
    site.units = ["ai-s1", "cyber-s1"];
    act(() => forgetCatalog());
    await settle();
    expect(screen.getByTestId("offered").textContent).toBe("ai cyber");
    expect(catalogReads).toBe(2);
  });

  it("nothing is read for a member whose organization chose nothing", async () => {
    h.stored = { ...initialState, onboarded: true, lang: "en", org: { id: "o1", name: "Nile School", v: 1 } };
    show();
    await settle();
    act(() => forgetCatalog());
    await settle();
    expect(catalogReads).toBe(0);
  });
});
