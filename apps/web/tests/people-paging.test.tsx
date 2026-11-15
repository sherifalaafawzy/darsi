// The organization's member list (admin/data.ts useMembers): read through the listMembers callable a page at a time,
// kept for the page's lifetime and shared between screens, complete before anything is counted, and changed in place
// after the dashboard's own actions. The callables and Firestore are fakes; the hook and the dashboard are real.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Profile } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";
import enStaff from "../src/staff/strings/en.json";

type Page = { members: Profile[]; next: string | null };
const m = vi.hoisted(() => ({
  org: { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" } as Record<string, unknown>,
  // Every listMembers call, with the promise's own resolve and reject: the test answers each page when it wants to.
  calls: [] as Array<{ data: { orgId: string; view?: string; after?: string | null; limit?: number }; answer: (p: unknown) => void; fail: (e: unknown) => void }>,
  api: { listMembers: vi.fn(), updateMembers: vi.fn(), bulkMembers: vi.fn(), setGaConfig: vi.fn(), regenerateInviteCode: vi.fn() },
  names: {} as Record<string, string>, nameReads: [] as string[],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, firebaseReady: true, call: () => vi.fn(), storage: async () => ({}) }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  getDoc: async (path: string) => { m.nameReads.push(path); const uid = path.split("/")[1]; return { id: uid, exists: () => uid in m.names, get: (f: string) => (f === "name" ? m.names[uid] : undefined) }; },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/OrgActivity", () => ({ OrgActivity: () => null }));
vi.mock("../src/admin/OrgPolicy", () => ({ OrgPolicy: () => null }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useOrg: () => ({ data: m.org, loading: false, reload: vi.fn() }),
  useInvites: () => ({ data: {}, loading: false, reload: vi.fn() }),
}));

const { AdminHome } = await import("../src/admin/AdminHome");
const { forgetMembers, MEMBERS_MAX_AGE, saveGaConfig, useMembers, useNames } = await import("../src/admin/data");

const person = (i: number, o: Partial<Profile> = {}): Profile => ({ uid: `u${String(i).padStart(4, "0")}`, name: `Pupil ${String(i).padStart(4, "0")}`, email: `p${i}@users.darsiai.org`, role: "student", ...o });
const people = (from: number, n: number, o: Partial<Profile> = {}) => Array.from({ length: n }, (_, i) => person(from + i, o));
const dashboard = (url = "/admin") => render(<I18nProvider lang="en"><MemoryRouter initialEntries={[url]}><AdminHome /></MemoryRouter></I18nProvider>);
const answer = (i: number, page: Page) => act(async () => { m.calls[i].answer(page); });
const linked = () => within(screen.getByRole("table")).getAllByRole("link").length;
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

/** What another screen sees of the same list: the hook alone. */
let seen: ReturnType<typeof useMembers> | undefined;
function Probe({ orgId = "o1", view }: { orgId?: string; view?: "list" | "report" }) {
  seen = useMembers(orgId, view);
  return <p>{seen.data ? `whole: ${seen.data.length}` : seen.error ? "failed" : `so far: ${seen.loaded}`}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.calls = []; m.names = {}; m.nameReads = []; seen = undefined;
  m.org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "admin1" };
  m.api.listMembers.mockImplementation((data: (typeof m.calls)[number]["data"]) => new Promise((answer, fail) => { m.calls.push({ data, answer, fail }); }));
  // Nothing is on screen between tests, so everything read is forgotten: each test starts with an empty page.
  forgetMembers();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("the member list in pages", () => {
  it("reads page after page, shows how far it is, and counts only once the last page is in", async () => {
    dashboard();
    // One call at a time, each from where the last one ended; lean rows, 1,000 a page.
    expect(m.calls.map((c) => c.data)).toEqual([{ orgId: "o1", view: "list", after: null, limit: 1000 }]);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    await answer(0, { members: [...people(0, 119), person(119, { role: "teacher", name: "Grace Adeyemi" })], next: "u0119" });
    expect(m.calls.map((c) => c.data.after)).toEqual([null, "u0119"]);
    expect(screen.getByRole("status").textContent).toBe("People loaded so far: 120. The numbers show when the whole list is here.");
    // No tile and no coverage from part of the list.
    expect(document.querySelector(".tile")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Capability coverage" })).toBeNull();
    await answer(1, { members: people(120, 100), next: "u0219" });
    expect(screen.getByRole("status").textContent).toMatch(/^People loaded so far: 220\./);
    expect(document.querySelector(".tile")).toBeNull();
    // Meanwhile People shows the rows so far, to look at and search, but nothing to tick, export or count.
    openTab("People");
    expect(linked()).toBe(100);
    expect(screen.getByText("Showing 100 of 220")).toBeTruthy();
    expect(screen.queryByLabelText("Select everyone matching")).toBeNull();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Search by name, email or group"), { target: { value: "grace" } });
    expect(linked()).toBe(1);
    fireEvent.change(screen.getByLabelText("Search by name, email or group"), { target: { value: "" } });
    await answer(2, { members: people(220, 30), next: null });
    expect(m.calls).toHaveLength(3);
    // The whole list: 100 rows drawn, then more; everything can be ticked and exported.
    expect(linked()).toBe(100);
    expect(screen.getByText("Showing 100 of 250")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(linked()).toBe(200);
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(linked()).toBe(250);
    expect(screen.getByLabelText("Select everyone matching")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(false);
    openTab("Overview");
    const members = screen.getByText("Members", { selector: ".tile span" }).closest(".tile") as HTMLElement;
    expect(within(members).getByText("250")).toBeTruthy();
    expect(within(members).getAllByRole("listitem").map((x) => x.textContent)).toEqual(["Teachers: 1", "Students: 249", "Admins: 0"]);
    expect(screen.getByRole("heading", { name: "Capability coverage" })).toBeTruthy();
  });

  it("follows an exactly full last page to the empty one after it", async () => {
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 3), next: "u0002" });
    expect(screen.getByText("so far: 3")).toBeTruthy();
    await answer(1, { members: [], next: null });
    expect(screen.getByText("whole: 3")).toBeTruthy();
    expect(seen).toMatchObject({ complete: true, loading: false, loaded: 3 });
    expect(seen!.data!.every((p) => p.orgId === "o1")).toBe(true); // a row is given the organization it was asked for
  });

  it("gives a second screen the list already read: no new call, also while the first is still reading", async () => {
    const first = render(<I18nProvider lang="en"><Probe /><Probe /></I18nProvider>);
    expect(m.calls).toHaveLength(1); // two screens, one read
    await answer(0, { members: people(0, 5), next: null });
    expect(screen.getAllByText("whole: 5")).toHaveLength(2);
    first.unmount();
    // The dashboard opened afterwards (from the courses page, the report, a person's page): nothing is read.
    dashboard();
    expect(m.calls).toHaveLength(1);
    expect(within(screen.getByText("Members", { selector: ".tile span" }).closest(".tile") as HTMLElement).getByText("5")).toBeTruthy();
  });

  it("serves a list screen from a report already read, and reads a report of its own for a report screen", async () => {
    const report = render(<I18nProvider lang="en"><Probe view="report" /></I18nProvider>);
    expect(m.calls[0].data).toMatchObject({ view: "report" });
    await answer(0, { members: people(0, 4), next: null });
    report.unmount();
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    expect(screen.getByText("whole: 4")).toBeTruthy();
    expect(m.calls).toHaveLength(1);
    // The other way round a list isn't enough (its summaries are cut down): the report reads its own.
    forgetMembers();
  });

  it("never gives a report screen a list's cut-down rows", async () => {
    const list = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 4), next: null });
    list.unmount();
    render(<I18nProvider lang="en"><Probe view="report" /></I18nProvider>);
    expect(screen.getByText("so far: 0")).toBeTruthy();
    expect(m.calls.map((c) => c.data.view)).toEqual(["list", "report"]);
  });

  it("keeps another organization's list apart", async () => {
    render(<I18nProvider lang="en"><Probe orgId="o1" /><Probe orgId="o2" /></I18nProvider>);
    expect(m.calls.map((c) => c.data.orgId)).toEqual(["o1", "o2"]);
    await answer(1, { members: people(0, 2), next: null });
    expect(screen.getByText("so far: 0")).toBeTruthy();
    expect(screen.getByText("whole: 2")).toBeTruthy();
  });

  it("changes a row in place after the dashboard's own action, without a read", async () => {
    m.api.updateMembers.mockResolvedValue({ updated: 1 });
    dashboard("/admin?tab=people");
    await answer(0, { members: [person(1, { name: "Amina Bello" }), person(2, { name: "Omar Said", group: "6B" })], next: null });
    fireEvent.click(screen.getByLabelText("Select Amina Bello"));
    fireEvent.change(screen.getByPlaceholderText("Class (choose or type)"), { target: { value: "9 Z" } });
    fireEvent.click(screen.getByRole("button", { name: "Set class" }));
    await waitFor(() => expect(m.api.updateMembers).toHaveBeenCalledWith({ orgId: "o1", uids: ["u0001"], patch: { group: "9 Z" } }));
    const row = screen.getByRole("link", { name: /Amina Bello/ }).closest("tr") as HTMLElement;
    await waitFor(() => expect(row.querySelector('td[data-label="Group"]')?.textContent).toBe("9 Z"));
    expect(m.calls).toHaveLength(1); // the 5,000-member list was read again after every such action
  });

  it("takes removed people out of the list, and the numbers follow, without a read", async () => {
    m.api.bulkMembers.mockResolvedValue({ results: [{ uid: "u0001", ok: true }] });
    dashboard("/admin?tab=people");
    await answer(0, { members: people(1, 3), next: null });
    fireEvent.click(screen.getByLabelText("Select Pupil 0001"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Yes, remove" }));
    expect(await screen.findByText("Removed from the organization: 1.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Pupil 0001/ })).toBeNull();
    expect(linked()).toBe(2);
    expect(m.calls).toHaveLength(1);
    openTab("Overview");
    expect(within(screen.getByText("Members", { selector: ".tile span" }).closest(".tile") as HTMLElement).getByText("2")).toBeTruthy();
  });

  it("patches and removes through the hook: one person or several, and a new name finds its place", async () => {
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: [person(1, { name: "Amina" }), person(2, { name: "Bola" }), person(3, { name: "Chidi" })], next: null });
    act(() => { seen!.patch("u0001", { name: "Zainab" }); });
    expect(seen!.data!.map((p) => p.name)).toEqual(["Bola", "Chidi", "Zainab"]);
    act(() => { seen!.patch(["u0002", "u0003"], { group: "7 A" }); });
    expect(seen!.data!.map((p) => p.group)).toEqual(["7 A", "7 A", undefined]);
    act(() => { seen!.remove(["u0002", "u0001"]); });
    expect(seen!.data!.map((p) => p.uid)).toEqual(["u0003"]);
    expect(seen).toMatchObject({ loaded: 1, complete: true });
    expect(m.calls).toHaveLength(1);
  });

  it("says a first page that failed, with Retry, and never '0' or 'No people yet'", async () => {
    dashboard();
    await act(async () => { m.calls[0].fail(Object.assign(new Error("Missing or insufficient permissions."), { code: "functions/permission-denied" })); });
    const note = screen.getByRole("alert");
    expect(note.textContent).toBe(`${enStaff["st.err.permissionDenied"]}Retry`);
    expect(document.querySelector(".tile")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    openTab("People");
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(screen.getByRole("tabpanel", { name: "People" })).getByRole("alert")).toBeTruthy();
    // Retry reads again, from the first page.
    fireEvent.click(within(screen.getByRole("tabpanel", { name: "People" })).getByRole("button", { name: "Retry" }));
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].data).toMatchObject({ after: null });
    await answer(1, { members: people(0, 2), next: null });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(linked()).toBe(2);
  });

  it("drops the rows of a read that failed part-way, and starts again on Retry", async () => {
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 3), next: "u0002" });
    await act(async () => { m.calls[1].fail(new Error("offline")); });
    expect(screen.getByText("failed")).toBeTruthy();
    expect(seen).toMatchObject({ complete: false, loading: false, loaded: 0, partial: [] });
    act(() => { seen!.reload(); });
    expect(m.calls[2].data).toMatchObject({ after: null });
  });

  it("keeps the list on screen during Refresh, and beside the reason when the refresh fails", async () => {
    dashboard("/admin?tab=people");
    await answer(0, { members: people(0, 2), next: null });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(m.calls).toHaveLength(2);
    expect(linked()).toBe(2); // not "Loading…": what was read stays until the new list is whole
    await act(async () => { m.calls[1].fail(Object.assign(new Error("unavailable"), { code: "functions/unavailable" })); });
    expect(linked()).toBe(2);
    expect(screen.getByRole("alert").textContent).toContain(enStaff["st.stale"]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await answer(2, { members: people(0, 3), next: null });
    expect(linked()).toBe(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tries again when a screen next opens a list whose last refresh failed, showing the older list meanwhile", async () => {
    const first = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 2), next: null });
    act(() => { seen!.reload(); });
    await act(async () => { m.calls[1].fail(Object.assign(new Error("unavailable"), { code: "functions/unavailable" })); });
    expect(seen).toMatchObject({ complete: true, refreshing: false });
    expect(seen!.error).toBeTruthy();
    first.unmount();
    // Opened again a moment later: not the old failure with nothing tried, but a new read (the list is not old yet).
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    expect(m.calls).toHaveLength(3);
    expect(screen.getByText("whole: 2")).toBeTruthy();
    expect(seen).toMatchObject({ refreshing: true, error: undefined });
    await answer(2, { members: people(0, 3), next: null });
    expect(screen.getByText("whole: 3")).toBeTruthy();
  });

  it("reads once more when the organization counts another number of members than a list read earlier", async () => {
    const earlier = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 3), next: null });
    earlier.unmount();
    // People were made since (Add people, an import, a join by code): the organization, read now, says 5.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    m.org = { ...m.org, memberCount: 5 };
    dashboard();
    expect(m.calls).toHaveLength(2);
    await answer(1, { members: people(0, 4), next: null });
    // Still not 5 (the count itself can be off): it is not read again and again.
    expect(m.calls).toHaveLength(2);
    expect(within(screen.getByText("Members", { selector: ".tile span" }).closest(".tile") as HTMLElement).getByText("4")).toBeTruthy();
  });

  it("reads a list nobody was looking at again once it is old, and never one a screen is showing", async () => {
    const first = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    await answer(0, { members: people(0, 2), next: null });
    const read = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(read + MEMBERS_MAX_AGE + 1);
    // Still on screen: time passing reads nothing (that would be polling), nor does a second screen beside it.
    const beside = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    expect(m.calls).toHaveLength(1);
    first.unmount(); beside.unmount();
    // Opened again a moment after it was read: nothing.
    clock.mockReturnValue(read + 1000);
    const soon = render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    expect(m.calls).toHaveLength(1);
    soon.unmount();
    clock.mockReturnValue(read + MEMBERS_MAX_AGE + 1);
    render(<I18nProvider lang="en"><Probe /></I18nProvider>);
    expect(m.calls).toHaveLength(2);
    expect(screen.getByText("whole: 2")).toBeTruthy(); // the older list stays until the new one is whole
  });
});

describe("names and the Google Analytics settings", () => {
  function Names({ uids }: { uids: string[] }) {
    const names = useNames(uids);
    return <p>{names.data ? uids.map((u) => names.data![u] ?? "?").join(", ") : "…"}</p>;
  }

  it("reads each account's name once per page load", async () => {
    m.names = { a: "Amina", b: "Bola", c: "Chidi" };
    const first = render(<Names uids={["a", "b"]} />);
    expect(await screen.findByText("Amina, Bola")).toBeTruthy();
    expect(m.nameReads).toEqual(["users/a", "users/b"]);
    // "Show more" adds a person: only theirs is read, and the names already there stay meanwhile.
    first.rerender(<Names uids={["a", "b", "c"]} />);
    expect(screen.getByText("Amina, Bola, ?")).toBeTruthy();
    expect(await screen.findByText("Amina, Bola, Chidi")).toBeTruthy();
    expect(m.nameReads).toEqual(["users/a", "users/b", "users/c"]);
    first.unmount();
    // Another screen, the same people: nothing is read.
    render(<Names uids={["c", "a"]} />);
    expect(screen.getByText("Chidi, Amina")).toBeTruthy();
    expect(m.nameReads).toHaveLength(3);
  });

  it("saves the Google Analytics settings through the callable, trimmed", async () => {
    m.api.setGaConfig.mockResolvedValue({ ok: true });
    await saveGaConfig("root", { measurementId: " G-ABC123 ", apiSecret: " s3cret " });
    expect(m.api.setGaConfig).toHaveBeenCalledWith({ measurementId: "G-ABC123", apiSecret: "s3cret" });
  });
});
