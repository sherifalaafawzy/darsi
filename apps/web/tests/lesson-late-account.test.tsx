// A slow start (AuthProvider's 2.5 s timer) shows the app before the account arrives, and until then the catalog holds
// no organization. A link straight to one of the organization's lessons then finds no such unit: the lesson screen
// tries once more when the account arrives, and never starts a lesson that is already playing again.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

const h = vi.hoisted(() => ({ user: null as null | { uid: string }, org: false, loads: [] as string[], gate: null as Promise<void> | null, stored: (() => null) as () => unknown }));
vi.mock("../src/platform", async (orig) => ({ ...(await orig<typeof import("../src/platform")>()), storage: { get: async () => h.stored(), set: async () => {}, remove: async () => {} } }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: "student", user: h.user, offlineUid: h.user ? null : "u1", configured: true }) }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => null, forgetSettings: () => {},
  // As content/load.ts: the organization's unit is in the catalog only once the account (and its organization) is known.
  loadUnit: async (id: string) => {
    h.loads.push(id);
    // The catalog a read uses is the one it asked for when it began (content/load.ts holds that promise): an account
    // that arrives while the read is under way doesn't change what it finds.
    const org = h.org;
    if (h.gate) await h.gate;
    if (id === "uorg00001" && !org) throw new Error(`No published unit ${id}`);
    return { id, track: "ai", level: 1, title: { en: "Course" }, summary: { en: "S" }, lessons: [{
      id: "l1", title: { en: "First lesson" }, minutes: 5, tryTomorrow: { en: "T" }, slides: [], kit: [], steps: [
        { id: "s1", type: "read", prompt: { en: "Read this" }, title: { en: "Reading one" }, body: { en: "Body one" } },
        { id: "s2", type: "reflect", prompt: { en: "Think about it" } },
      ] }] };
  },
}));

const { SettingsProvider } = await import("../src/content/settings");
const { StoreProvider, initialState } = await import("../src/state/store");
const { LessonScreen } = await import("../src/screens/LessonScreen");
h.stored = () => ({ ...initialState, onboarded: true, lang: "en", tracks: ["ai"] });

const tree = (url: string) => (<I18nProvider lang="en"><SettingsProvider lang="en"><StoreProvider scope="u1">
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/lesson/:unitId/:lessonId" element={<LessonScreen />} /></Routes></MemoryRouter>
</StoreProvider></SettingsProvider></I18nProvider>);
/** The account arrives: AuthProvider publishes the user, and App's configureContent brings the organization's catalog. */
const arrive = () => { h.user = { uid: "u1" }; h.org = true; };

beforeEach(() => { h.user = null; h.org = false; h.loads = []; h.gate = null; localStorage.clear(); });

describe("a lesson opened before the account arrived", () => {
  it("an organization's lesson that wasn't found is tried once more when the account arrives, without a tap on Retry", async () => {
    const { rerender } = render(tree("/lesson/uorg00001/l1"));
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(h.loads).toEqual(["uorg00001"]);
    arrive();
    rerender(tree("/lesson/uorg00001/l1"));
    expect(await screen.findByText("Body one")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(h.loads).toEqual(["uorg00001", "uorg00001"]);
  });

  it("and also when the account arrives while the first read is still under way (the usual order on a slow start)", async () => {
    let open = () => {};
    h.gate = new Promise<void>((r) => { open = r; });
    const { rerender } = render(tree("/lesson/uorg00001/l1"));
    await waitFor(() => expect(h.loads).toEqual(["uorg00001"]));
    arrive();
    rerender(tree("/lesson/uorg00001/l1")); // signed in, and no error on screen yet
    expect(screen.queryByText("Something went wrong")).toBeNull();
    h.gate = null;
    open(); // the first read answers: no such unit, in the catalog it began with
    expect(await screen.findByText("Body one")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(h.loads).toEqual(["uorg00001", "uorg00001"]);
    // Once: a later failure waits for Retry.
    await new Promise((r) => setTimeout(r, 30));
    expect(h.loads).toHaveLength(2);
  });

  it("a lesson already playing is left alone when the account arrives: nothing is read or started again", async () => {
    const { rerender } = render(tree("/lesson/ai-1-1/l1"));
    expect(await screen.findByText("Body one")).toBeTruthy();
    arrive();
    rerender(tree("/lesson/ai-1-1/l1"));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("Body one")).toBeTruthy();
    expect(h.loads).toEqual(["ai-1-1"]);
  });

  it("a failure with the account already there waits for Retry, as before (no loop)", async () => {
    h.user = { uid: "u1" };
    render(tree("/lesson/uorg00001/l1"));
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    await waitFor(() => expect(h.loads).toEqual(["uorg00001"]));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.loads).toEqual(["uorg00001"]);
  });
});
