// The admin's Courses panel (admin/OrgCourses.tsx) follows the catalog when content/load forgets it (the page left open
// and come back to, a course published from the editor meanwhile): the new course shows, what the admin had ticked
// stays, and the list stays on screen while the new one is on its way. The real content/load, with fetch and Cache
// Storage faked, as in catalog-refresh.test.tsx.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Org } from "../src/auth/types";
import type { CatalogEntry } from "../src/content/types";
import { fakeCaches, json } from "./stubs/caches";

const h = vi.hoisted(() => ({ storageJSON: vi.fn(async (_path: string): Promise<unknown> => null) }));
vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ role: "orgAdmin", orgId: "o1", user: { uid: "me" }, configured: false }) }));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true, call: vi.fn(), storageJSON: h.storageJSON }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: { setOrgCourses: vi.fn() } }));

const { forgetCatalog } = await import("../src/content/load");
const { I18nProvider } = await import("../src/i18n");
const { OrgCoursesPanel } = await import("../src/admin/OrgCourses");

const CATALOG = `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent("content/catalog.json")}?alt=media`;
const entry = (id: string): CatalogEntry => ({ id, track: "ai", level: 1, title: { en: `Course ${id}` }, summary: { en: "S" }, lessons: 1, sizeMB: 1,
  available: true, src: `content/units/${id}/v1.json`, version: 1, owner: "public" });
const site = { units: ["ai-a", "ai-b"], hold: null as null | Promise<void> };
let reads = 0;
const fetchMock = vi.fn(async (u: string) => {
  if (u !== CATALOG) return new Response("", { status: 404 });
  reads++;
  if (site.hold) await site.hold;
  return json({ version: 1, units: site.units.map(entry) });
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const org = (over: Partial<Org> = {}) => ({ id: "o1", name: "Nile School", status: "active", ...over }) as Org;

beforeEach(() => {
  vi.stubGlobal("caches", fakeCaches(location.origin));
  vi.stubGlobal("fetch", fetchMock);
  // Wide: the grid of checkboxes (every column at once).
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  site.units = ["ai-a", "ai-b"]; site.hold = null; reads = 0;
  h.storageJSON.mockClear();
  forgetCatalog();
});
afterEach(() => { vi.unstubAllGlobals(); delete (window as { matchMedia?: unknown }).matchMedia; });

it("a course published while the page is open shows when the catalog is forgotten, and what was ticked stays", async () => {
  render(<I18nProvider lang="en"><MemoryRouter><OrgCoursesPanel org={org()} members={[]} /></MemoryRouter></I18nProvider>);
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: /Choose which courses each group sees/ }));
  await settle();
  const grid = screen.getByRole("table");
  expect(within(grid).getByText("Course ai-a")).toBeTruthy();
  // The admin unticks one course for all teachers.
  const box = within(grid).getAllByRole("checkbox", { name: /Course ai-a/ })[0] as HTMLInputElement;
  fireEvent.click(box);
  expect(box.checked).toBe(false);
  expect(reads).toBe(1);

  let open!: () => void;
  site.hold = new Promise((r) => { open = r; });
  site.units = ["ai-a", "ai-b", "ai-new"];
  act(() => forgetCatalog());
  await settle();
  expect(reads).toBe(2);
  expect(within(grid).getByText("Course ai-b")).toBeTruthy(); // the list stays while the new one is on its way
  expect(screen.queryByText("Course ai-new")).toBeNull();
  await act(async () => { open(); });
  await settle();
  expect(within(screen.getByRole("table")).getByText("Course ai-new")).toBeTruthy();
  expect((within(screen.getByRole("table")).getAllByRole("checkbox", { name: /Course ai-a/ })[0] as HTMLInputElement).checked).toBe(false);
  expect(h.storageJSON).not.toHaveBeenCalled(); // an org admin's catalog already holds their own courses
});

it("a platform admin's org page adds that organization's own catalog, read once, and another organization starts afresh", async () => {
  h.storageJSON.mockImplementation(async (path: string) => (path === "orgs/o2/catalog.json" ? { version: 1, units: [{ ...entry("ai-mine"), owner: "o2" }] } : null));
  const { rerender } = render(<I18nProvider lang="en"><MemoryRouter><OrgCoursesPanel key="o2" org={org({ id: "o2" })} members={[]} /></MemoryRouter></I18nProvider>);
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: /Choose which courses each group sees/ }));
  await settle();
  expect(within(screen.getByRole("table")).getByText("Course ai-mine")).toBeTruthy();
  expect(h.storageJSON).toHaveBeenCalledTimes(1);
  act(() => forgetCatalog());
  await settle();
  expect(within(screen.getByRole("table")).getByText("Course ai-mine")).toBeTruthy();
  rerender(<I18nProvider lang="en"><MemoryRouter><OrgCoursesPanel org={org({ id: "o3" })} members={[]} /></MemoryRouter></I18nProvider>);
  await settle();
  expect(screen.queryByText("Course ai-mine")).toBeNull();
  expect(h.storageJSON).toHaveBeenLastCalledWith("orgs/o3/catalog.json");
});
