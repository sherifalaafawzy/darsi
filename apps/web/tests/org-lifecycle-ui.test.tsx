import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Org } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// An organization's lifecycle on a platform admin's screens, with the callables and Storage replaced:
// - deleting it in the server's resumable steps (deleteOrg is called until `done`, with the cursor each time), with
//   the choice of what happens to its people, a failure that keeps the progress, and an organization found "deleting";
// - suspending (asked first, with a reason) and resuming;
// - its data as files (exportOrgData until `done`, then each part through the Storage SDK).
const m = vi.hoisted(() => ({
  api: { setUserRole: vi.fn(), deleteOrg: vi.fn(), updateOrg: vi.fn(), exportOrgData: vi.fn(), createOrg: vi.fn() },
  changed: vi.fn(),
  getBlob: vi.fn(),
  saved: [] as Array<{ blob: unknown; name: string }>,
  suspension: vi.fn((_id?: string | null) => ({ data: null as { reason?: string } | null, reload: () => {} })),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(async () => ({})), firebaseReady: true }));
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => path, getBlob: m.getBlob }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), findPeople: async () => [], useAllOrgs: () => ({ data: [], reload: vi.fn() }), useOrgSuspension: (id?: string | null) => m.suspension(id) }));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: (blob: unknown, name: string) => { m.saved.push({ blob, name }); } }));

const { OrgManage } = await import("../src/admin/OrgsAdmin");
const { OrgExport } = await import("../src/admin/OrgExport");

const org: Org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u1" };
type Part = "details" | "status" | "people" | "delete";
const Where = () => { const l = useLocation(); return <p data-testid="at">{l.pathname}{(l.state as { done?: string } | null)?.done ?? ""}</p>; };
const part = (which: Part | undefined, o: Org = org, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={["/super/orgs/o1"]}>
  <Routes>
    <Route path="/super/orgs/:orgId" element={<OrgManage part={which} org={o} members={[]} onChanged={m.changed} />} />
    <Route path="*" element={<Where />} />
  </Routes>
</MemoryRouter></I18nProvider>);
/** A call the test answers when it chooses, to look at the screen in between. */
const defer = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
type Step = { done: boolean; cursor: string | null; processed: number; units: number };
const steps = (n: number) => { const d = Array.from({ length: n }, () => defer<Step>()); let i = 0; m.api.deleteOrg.mockImplementation(() => d[i++].promise); return d; };
const refused = (reason: string, more: Record<string, unknown> = {}) => Object.assign(new Error("refused"), { code: "functions/aborted", details: { reason, ...more } });
const typeName = (name = "Nile School") => fireEvent.change(screen.getByLabelText(/Type .Nile School. to confirm/), { target: { value: name } });
const here = () => screen.queryByRole("heading", { name: "Delete this organization" }) !== null;

beforeEach(() => { vi.clearAllMocks(); m.api.deleteOrg.mockReset(); m.api.updateOrg.mockReset(); m.api.exportOrgData.mockReset(); m.getBlob.mockReset(); m.saved = []; m.suspension.mockImplementation(() => ({ data: null, reload: () => {} })); });

describe("deleting an organization in steps", () => {
  it("offers the choice of what happens to its people, releasing them unless the admin chooses otherwise", () => {
    part("delete");
    const group = screen.getByRole("radiogroup", { name: "What happens to its people" });
    const [release, managed] = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(release.checked).toBe(true);
    expect(managed.checked).toBe(false);
    // One sentence each on what happens.
    expect(group.textContent).toMatch(/Release its people.*Everyone keeps their account and their learning/);
    expect(group.textContent).toMatch(/Delete the accounts the organization made.*username logins.*deleted with their data.*Everyone else is released/);
  });

  it("with \"delete the accounts it made\", calls deleteOrg until done, passing the cursor each time, and leaves only at the end", async () => {
    const d = steps(3);
    part("delete");
    fireEvent.click(screen.getByRole("radio", { name: /Delete the accounts the organization made/ }));
    typeName();
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(1));
    expect(m.api.deleteOrg.mock.calls[0][0]).toEqual({ orgId: "o1", confirm: "Nile School", members: "delete-managed" });
    expect("cursor" in m.api.deleteOrg.mock.calls[0][0]).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Deleting. Keep this page open until it finishes. People handled so far: 0");

    d[0].resolve({ done: false, cursor: "u100", processed: 100, units: 0 });
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(2));
    expect(m.api.deleteOrg.mock.calls[1][0]).toEqual({ orgId: "o1", confirm: "Nile School", members: "delete-managed", cursor: "u100" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/People handled so far: 100$/));
    expect(here()).toBe(true); // not done: still on its page

    d[1].resolve({ done: false, cursor: "u200", processed: 100, units: 0 });
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(3));
    expect(m.api.deleteOrg.mock.calls[2][0]).toEqual({ orgId: "o1", confirm: "Nile School", members: "delete-managed", cursor: "u200" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/People handled so far: 200$/));
    expect(here()).toBe(true);
    expect(screen.queryByTestId("at")).toBeNull();

    d[2].resolve({ done: true, cursor: null, processed: 30, units: 2 });
    // The list says what happened to its people: not "all independent learners" when some accounts are being deleted.
    expect((await screen.findByTestId("at")).textContent).toMatch(/^\/super\/orgs.*Nile School.* was deleted\. The accounts it made are being deleted/);
    expect(m.api.deleteOrg).toHaveBeenCalledTimes(3);
    expect(m.changed).not.toHaveBeenCalled();
  });

  it("a failure in the middle keeps the progress, offers Continue and resumes from the cursor the server named", async () => {
    const d = steps(3);
    part("delete");
    fireEvent.click(screen.getByRole("radio", { name: /Delete the accounts the organization made/ }));
    typeName();
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(1));
    d[0].resolve({ done: false, cursor: "u100", processed: 100, units: 0 });
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(2));
    // The second call got one page further (to u200) before a member failed: the place before that page.
    d[1].reject(refused("delete-retry", { failed: 2, cursor: "u200" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/The deletion stopped before the end\. Nothing is lost: press Continue/);
    expect(alert.textContent).toMatch(/Some members could not be released/); // the server's reason, in the admin's language
    expect(here()).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("People handled so far: 100");
    // The choice it started with stays, and the button now continues.
    expect((screen.getByRole("radio", { name: /Delete the accounts the organization made/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(3));
    expect(m.api.deleteOrg.mock.calls[2][0]).toEqual({ orgId: "o1", confirm: "Nile School", members: "delete-managed", cursor: "u200" });
    expect(screen.queryByRole("alert")).toBeNull();
    d[2].resolve({ done: true, cursor: null, processed: 30, units: 0 });
    expect((await screen.findByTestId("at")).textContent).toMatch(/^\/super\/orgs/);
  });

  it("a dropped connection resumes from the last place it reached", async () => {
    const d = steps(3);
    part("delete");
    typeName();
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(1));
    d[0].resolve({ done: false, cursor: "u100", processed: 100, units: 0 });
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(2));
    d[1].reject(Object.assign(new Error("internal"), { code: "functions/unavailable" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/The service can't be reached right now/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledTimes(3));
    expect(m.api.deleteOrg.mock.calls[2][0]).toEqual({ orgId: "o1", confirm: "Nile School", members: "release", cursor: "u100" });
    d[2].resolve({ done: true, cursor: null, processed: 4, units: 0 });
    // Released, nobody deleted: the message the list always gave.
    expect((await screen.findByTestId("at")).textContent).toMatch(/Nile School.* was deleted\. Its members are now independent learners\./);
  });

  it("stops instead of asking for ever when the server makes no progress", async () => {
    m.api.deleteOrg.mockResolvedValue({ done: false, cursor: null, processed: 0, units: 0 });
    part("delete");
    typeName();
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/The deletion stopped before the end/);
    expect(m.api.deleteOrg.mock.calls.length).toBeLessThanOrEqual(4);
    expect(here()).toBe(true);
  });

  it("an answer without `done` (a server from before the steps) counts as finished", async () => {
    m.api.deleteOrg.mockResolvedValue({ ok: true });
    part("delete");
    typeName();
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    expect((await screen.findByTestId("at")).textContent).toMatch(/^\/super\/orgs/);
    expect(m.api.deleteOrg).toHaveBeenCalledTimes(1);
  });

  describe("an organization found \"deleting\" (the page was closed half-way)", () => {
    const leaving = { ...org, status: "deleting", deletingMembers: "delete-managed", deletingReleased: 120, deletingQueued: 30 } as Org;

    it("says the deletion is in progress and offers Continue, behind the typed name like the start", async () => {
      m.api.deleteOrg.mockResolvedValue({ done: true, cursor: null, processed: 12, units: 1 });
      part("delete", leaving);
      expect(screen.getByText("Deletion in progress")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("People handled so far: 150");
      expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
      const go = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
      expect(go.disabled).toBe(true);
      // The form can't be sent round the disabled button either.
      fireEvent.submit(go.closest("form")!);
      typeName("nile school");
      expect(go.disabled).toBe(true);
      fireEvent.submit(go.closest("form")!);
      expect(m.api.deleteOrg).not.toHaveBeenCalled();
      // What it started with: shown, and not to be changed half-way.
      const managed = screen.getByRole("radio", { name: /Delete the accounts the organization made/ }) as HTMLInputElement;
      expect(managed.checked).toBe(true);
      expect(managed.disabled).toBe(true);
      typeName();
      fireEvent.click(go);
      await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledWith({ orgId: "o1", confirm: "Nile School", members: "delete-managed" }));
      expect((await screen.findByTestId("at")).textContent).toMatch(/^\/super\/orgs/);
    });

    it("continues with the choice the deletion started with, even when it started while this page was open", async () => {
      m.api.deleteOrg.mockResolvedValue({ done: true, cursor: null, processed: 3, units: 0 });
      const tree = (o: Org) => <I18nProvider lang="en"><MemoryRouter initialEntries={["/super/orgs/o1"]}>
        <Routes>
          <Route path="/super/orgs/:orgId" element={<OrgManage part="delete" org={o} members={[]} onChanged={m.changed} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter></I18nProvider>;
      // Open on an active organization (this page would release); another screen then starts deleting its accounts.
      const { rerender } = render(tree(org));
      expect((screen.getByRole("radio", { name: /Release its people/ }) as HTMLInputElement).checked).toBe(true);
      rerender(tree(leaving));
      const managed = screen.getByRole("radio", { name: /Delete the accounts the organization made/ }) as HTMLInputElement;
      expect(managed.checked).toBe(true);
      expect(managed.disabled).toBe(true);
      typeName();
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledWith({ orgId: "o1", confirm: "Nile School", members: "delete-managed" }));
    });

    it("has nothing else to change: details, status and members say only that it is being deleted", () => {
      for (const which of ["details", "status", "people"] as const) {
        const { unmount } = part(which, leaving);
        expect(screen.getByText("Deletion in progress")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByRole("textbox")).toBeNull();
        unmount();
      }
    });

    it("as one panel, shows only the deletion to continue", () => {
      part(undefined, leaving);
      expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
      expect(screen.queryByRole("searchbox")).toBeNull();
    });

    it("says it in Arabic", () => {
      part("delete", leaving, "ar");
      expect(screen.getByText("الحذف جارٍ")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("عدد من عولجوا حتى الآن: ١٥٠");
      expect(screen.getByRole("button", { name: "متابعة" })).toBeTruthy();
    });
  });
});

describe("suspending and resuming an organization", () => {
  it("asks first, with a reason, then sends status \"suspended\"", async () => {
    m.api.updateOrg.mockResolvedValue({ ok: true, staff: 4, failed: 0 });
    part("status");
    expect(screen.getByText("This organization is active.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(m.api.updateOrg).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Suspend .*Nile School.*\?/);
    expect(ask.textContent).toMatch(/Its admins and teachers lose their staff access at once\. Its members keep learning\./);
    // The safe action has the focus: Enter on a question that just appeared suspends nothing.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    fireEvent.change(within(ask).getByLabelText("Reason (kept in the log)"), { target: { value: "  Contract ended  " } });
    fireEvent.click(within(ask).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledWith({ orgId: "o1", status: "suspended", reason: "Contract ended" }));
    expect((await screen.findByRole("status")).textContent).toBe("Suspended. Its admins and teachers have lost their staff access.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.changed).toHaveBeenCalled(); // the page reads the organization again
  });

  it("does nothing on Cancel, and sends no reason when none was typed", async () => {
    m.api.updateOrg.mockResolvedValue({ ok: true });
    part("status");
    const suspend = screen.getByRole("button", { name: "Suspend" });
    suspend.focus();
    fireEvent.click(suspend);
    expect(suspend.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.updateOrg).not.toHaveBeenCalled();
    // The button stayed on the page while the question was open, so the keyboard is back where it was.
    expect(document.activeElement).toBe(suspend);
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledTimes(1));
    expect(m.api.updateOrg.mock.calls[0][0]).toStrictEqual({ orgId: "o1", status: "suspended" });
  });

  it("says when some staff accounts could not be frozen yet", async () => {
    m.api.updateOrg.mockResolvedValue({ ok: true, staff: 9, failed: 2 });
    part("status");
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Suspended\..*Staff accounts that could not be updated just now: 2\. They follow by themselves within six hours\./);
  });

  it("a refusal is said in the admin's language, and nothing claims it was suspended", async () => {
    m.api.updateOrg.mockRejectedValue(refused("bad-status"));
    part("status");
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Suspend" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Only an active organization can be suspended/);
    expect(m.changed).not.toHaveBeenCalled();
  });

  it("a suspended one shows since when and why, and Resume sends status \"active\"", async () => {
    m.api.updateOrg.mockResolvedValue({ ok: true });
    const at = Date.UTC(2026, 10, 3, 12) / 1000;
    // The other parts of the page never read the note.
    for (const p of ["details", "delete", "people"] as const) part(p, { ...org, status: "suspended", suspended: { at: { seconds: at } } }).unmount();
    expect(m.suspension.mock.calls.every(([id]) => id == null)).toBe(true);
    // The reason is the platform's note (private/suspension), read once: the org document holds only the time.
    m.suspension.mockImplementation((id?: string | null) => ({ data: id === "o1" ? { reason: "Contract ended" } : null, reload: vi.fn() }));
    part("status", { ...org, status: "suspended", suspended: { at: { seconds: at } } });
    const note = screen.getByText(/This organization is suspended\./);
    expect(note.textContent).toMatch(/Suspended since Nov 3, 2026\./);
    expect(note.textContent).toMatch(/Reason: .*Contract ended/);
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledTimes(1));
    expect(m.api.updateOrg.mock.calls[0][0]).toStrictEqual({ orgId: "o1", status: "active" });
    expect((await screen.findByRole("status")).textContent).toBe("Resumed. Its admins and teachers have their staff access back.");
    expect(m.changed).toHaveBeenCalled();
  });

  it("one waiting for approval or rejected can be made active, and is never offered Suspend", async () => {
    m.api.updateOrg.mockResolvedValue({ ok: true });
    part("status", { ...org, status: "rejected" });
    expect(screen.getByText("Status: Rejected.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make active" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledWith({ orgId: "o1", status: "active" }));
  });

  it("asks in Arabic", () => {
    part("status", org, "ar");
    fireEvent.click(screen.getByRole("button", { name: "أوقِف المؤسسة" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/هل توقف .*Nile School.*؟/);
    expect(within(ask).getByLabelText("السبب (يُحفظ في السجل)")).toBeTruthy();
  });
});

describe("an organization's data as files", () => {
  const P1 = "exports/o1/e1/part-0001.json.gz", P2 = "exports/o1/e1/part-0002.json.gz";
  const panel = (lang = "en") => render(<I18nProvider lang={lang}><OrgExport org={org} /></I18nProvider>);
  // The status line says the progress first: wait for what it says in the end.
  const said = (text: string) => waitFor(() => expect(screen.getByRole("status").textContent).toBe(text));
  const twoSteps = () => m.api.exportOrgData
    .mockResolvedValueOnce({ exportId: "e1", done: false, cursor: "u100", files: [P1], members: 100 })
    .mockResolvedValueOnce({ exportId: "e1", done: true, cursor: null, files: [P1, P2], members: 130 });

  it("says what the export holds and what it never does", () => {
    panel();
    const hint = screen.getByText(/Downloads every member's profile/).textContent!;
    expect(hint).toMatch(/profile, lesson results, projects and certificates/);
    expect(hint).toMatch(/Private notes and payments are never included/);
  });

  it("calls exportOrgData until done, then downloads each file through Storage", async () => {
    twoSteps();
    m.getBlob.mockImplementation(async (path: string) => `blob of ${path}`);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    await said("Done. Members exported: 130, files downloaded: 2.");
    expect(m.api.exportOrgData).toHaveBeenCalledTimes(2);
    expect(m.api.exportOrgData.mock.calls[0][0]).toStrictEqual({ orgId: "o1" });
    expect(m.api.exportOrgData.mock.calls[1][0]).toStrictEqual({ orgId: "o1", exportId: "e1", cursor: "u100" });
    expect(m.getBlob.mock.calls.map((c) => c[0])).toEqual([P1, P2]);
    const day = new Date().toISOString().slice(0, 10);
    expect(m.saved).toEqual([
      { blob: `blob of ${P1}`, name: `darsi-Nile-School-${day}-part-0001.json.gz` },
      { blob: `blob of ${P2}`, name: `darsi-Nile-School-${day}-part-0002.json.gz` },
    ]);
  });

  it("shows how far it is while the server writes the files", async () => {
    const second = defer<unknown>();
    m.api.exportOrgData.mockResolvedValueOnce({ exportId: "e1", done: false, cursor: "u100", files: [P1], members: 100 }).mockImplementationOnce(() => second.promise);
    m.getBlob.mockResolvedValue("b");
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Preparing the files. Members exported so far: 100"));
    expect(m.getBlob).not.toHaveBeenCalled(); // nothing is downloaded from an export that is not whole
    second.resolve({ exportId: "e1", done: true, cursor: null, files: [P1], members: 100 });
    await waitFor(() => expect(m.saved).toHaveLength(1));
  });

  it("a download that fails says so in the admin's language, and can be tried again without a second export", async () => {
    twoSteps();
    m.getBlob.mockResolvedValueOnce("b1").mockRejectedValueOnce(Object.assign(new Error("Firebase Storage: User does not have permission to access 'exports/o1/e1/part-0002.json.gz'. (storage/unauthorized)"), { code: "storage/unauthorized" }));
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^A file could not be downloaded\. Your account isn't allowed to open or save this file/);
    expect(alert.textContent).not.toMatch(/Firebase Storage/); // never the SDK's own English
    expect(m.saved).toHaveLength(1);
    m.getBlob.mockResolvedValue("b");
    fireEvent.click(screen.getByRole("button", { name: "Download the files again" }));
    await said("Done. Members exported: 130, files downloaded: 2.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(m.api.exportOrgData).toHaveBeenCalledTimes(2); // the two steps of the one export
    expect(m.saved).toHaveLength(3);
  });

  it("an export the server refuses says why, and downloads nothing", async () => {
    m.api.exportOrgData.mockRejectedValue(Object.assign(new Error("gone"), { code: "functions/not-found", details: { reason: "no-export" } }));
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/This export is no longer there/);
    expect(m.getBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Download the files again" })).toBeNull();
  });

  it("says when a new export can start in the app's language, whatever <html lang> says", async () => {
    const retryAt = new Date(2026, 10, 12, 14, 35).getTime();
    m.api.exportOrgData.mockRejectedValue(Object.assign(new Error("wait"), { code: "functions/resource-exhausted", details: { reason: "export-wait", retryAt } }));
    const was = document.documentElement.lang;
    document.documentElement.lang = "en"; // the page's own language hasn't followed the app's (or was never set)
    try {
      panel("ar");
      fireEvent.click(screen.getByRole("button", { name: "صدّر البيانات" }));
      const time = new Intl.DateTimeFormat("ar-EG", { timeStyle: "short" }).format(new Date(retryAt));
      expect(time).not.toBe(new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(new Date(retryAt)));
      expect((await screen.findByRole("alert")).textContent).toBe(`بدأ تصدير لهذه المؤسسة قبل دقائق. يمكن بدء تصدير جديد عند الساعة ${time}.`);
    } finally { document.documentElement.lang = was; }
  });

  it("an organization with no members downloads nothing and says so", async () => {
    // The server always writes a first part: an empty list here.
    m.api.exportOrgData.mockResolvedValue({ exportId: "e1", done: true, cursor: null, files: [P1], members: 0 });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    await said("This organization has no members, so there is nothing to download.");
    expect(m.getBlob).not.toHaveBeenCalled();
    expect(m.saved).toEqual([]);
    expect(screen.queryByRole("button", { name: "Download the files again" })).toBeNull();
  });

  it("stops instead of asking for ever when the server does not move on", async () => {
    m.api.exportOrgData.mockResolvedValue({ exportId: "e1", done: false, cursor: "u100", files: [P1], members: 100 });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Export the data" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(m.api.exportOrgData).toHaveBeenCalledTimes(2);
    expect(m.getBlob).not.toHaveBeenCalled();
  });

  it("is worded in Arabic", async () => {
    m.api.exportOrgData.mockResolvedValue({ exportId: "e1", done: true, cursor: null, files: [P1], members: 0 });
    panel("ar");
    expect(screen.getByRole("heading", { name: "تصدير بيانات هذه المؤسسة" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "صدّر البيانات" }));
    await said("لا أعضاء في هذه المؤسسة، فلا شيء للتنزيل.");
  });
});
