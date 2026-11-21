import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Org, Profile, Role } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// A platform admin's org page (OrgManage): removing someone or changing a role asks first, the only admin stays, an added
// person's row says so at once, and deleting the organization is confirmed on the page the admin lands on.
// Then one job at a time (`part`, for the org page's tabs), and /super/orgs itself: the list and the new one, in tabs.
// The members are the one list of them on the page: 100 rows at a time, mended in place after a change (`onMember`).
// Suspending, resuming, the deletion's steps and the export are in tests/org-lifecycle-ui.test.tsx.
const m = vi.hoisted(() => ({
  api: { setUserRole: vi.fn(async () => ({})), deleteOrg: vi.fn(async () => ({ done: true, cursor: null, processed: 1, units: 0 })), updateOrg: vi.fn(), createOrg: vi.fn(async () => ({ orgId: "n1" })) },
  found: [] as unknown[],
  changed: vi.fn(),
  orgs: [] as unknown[],
  useAllOrgs: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  findPeople: async () => m.found, useAllOrgs: m.useAllOrgs,
}));

const { OrgManage, OrgsAdmin } = await import("../src/admin/OrgsAdmin");

const org: Org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u1" };
const member = (uid: string, name: string, role: Role): Profile => ({ uid, name, email: `${uid}@users.darsiai.org`, role, orgId: "o1" });
const page = (members: Profile[], lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={["/super/orgs/o1"]}>
  <Routes>
    <Route path="/super/orgs/:orgId" element={<OrgManage org={org} members={members} onChanged={m.changed} />} />
    <Route path="/super/orgs" element={<OrgsAdmin />} />
  </Routes>
</MemoryRouter></I18nProvider>);
const rowOf = (name: string) => screen.getByRole("link", { name: new RegExp(name) }).closest("tr")!;

beforeEach(() => { vi.clearAllMocks(); m.found = []; m.orgs = []; m.useAllOrgs.mockImplementation(() => ({ data: m.orgs, reload: vi.fn() })); });

describe("an organization's members", () => {
  it("asks before removing someone, and does nothing on Cancel", async () => {
    page([member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.click(rowOf("Sara").querySelector("button")!);
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Remove .*Sara.* from this organization\? They are signed out on every device/);
    // The question opens on the safe answer: a second Enter or Space never removes anyone.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).not.toBe(within(ask).getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(rowOf("Sara").querySelector("button")!);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "learner" }));
    expect(m.changed).toHaveBeenCalled();
  });

  // A change of role signs the person out and can leave students without their teacher: the row's select never does
  // it by itself (on Windows an arrow key on a focused select is a change), as the organization's own person page.
  it("asks before any role change, with Cancel in focus; Escape drops it", async () => {
    page([member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]);
    const select = () => rowOf("Sara").querySelector("select") as HTMLSelectElement;
    select().focus();
    fireEvent.change(select(), { target: { value: "orgAdmin" } });
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toMatch(/Change .*Sara.*'s role to admin\?\s*They are signed out and sign in again with the new role\./);
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Cancel" }));
    // The select shows what was asked for while the question is open, and the member's own role once it is dropped.
    expect(select().value).toBe("orgAdmin");
    fireEvent.keyDown(ask, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(select().value).toBe("student");
    // The keyboard is back on the select that asked.
    expect(document.activeElement).toBe(select());
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    fireEvent.change(select(), { target: { value: "orgAdmin" } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "orgAdmin", orgId: "o1" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before an admin loses the role, in the words for that", async () => {
    page([member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.change(rowOf("Omar").querySelector("select")!, { target: { value: "teacher" } });
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Change .*Omar.*'s role to teacher\? They stop being an admin/);
    fireEvent.click(screen.getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "a2", role: "teacher", orgId: "o1" }));
  });

  it("asks in Arabic, the name kept apart from the sentence", () => {
    page([member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student")], "ar");
    fireEvent.change(rowOf("Sara").querySelector("select")!, { target: { value: "teacher" } });
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toContain("أتريد تغيير دور ⁨Sara⁩ إلى «");
    expect(ask.textContent).toContain("سيُسجَّل خروجه ثم يسجّل الدخول بالدور الجديد.");
    expect(m.api.setUserRole).not.toHaveBeenCalled();
  });

  it("keeps the organization's only admin", () => {
    page([member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.click(rowOf("Amina").querySelector("button")!);
    fireEvent.change(rowOf("Amina").querySelector("select")!, { target: { value: "student" } });
    expect(screen.getAllByText("This is the organization's only admin. Make someone else its admin first.").length).toBeGreaterThan(0);
    expect(m.api.setUserRole).not.toHaveBeenCalled();
  });
});

describe("the one list of members", () => {
  const many = (n: number) => [member("a1", "Amina", "orgAdmin"), ...Array.from({ length: n - 1 }, (_, i) => member(`s${i}`, `Student ${String(i).padStart(3, "0")}`, "student"))];
  const dataRows = () => screen.getAllByRole("row").length - 1; // without the header

  it("shows 100 rows, then 100 more on request", () => {
    page(many(230));
    expect(dataRows()).toBe(100);
    expect(screen.getByText("Showing 100 of 230")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(dataRows()).toBe(200);
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(dataRows()).toBe(230);
    expect(screen.queryByRole("button", { name: "Show 100 more" })).toBeNull();
  });

  it("finds someone in a long list by name, login or class", () => {
    page([...many(150), { ...member("z9", "Zeinab", "teacher"), group: "7C" }]);
    expect(screen.queryByText("Zeinab")).toBeNull(); // past the first 100
    const box = screen.getByRole("searchbox", { name: "Search by name, email or group" });
    fireEvent.change(box, { target: { value: "zein" } });
    expect(dataRows()).toBe(1);
    expect(screen.getByText("Zeinab")).toBeTruthy();
    fireEvent.change(box, { target: { value: "7c" } });
    expect(dataRows()).toBe(1);
    fireEvent.change(box, { target: { value: "nobody at all" } });
    expect(screen.getByText("Nobody matches your search.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("has no search for a short list (the Add panel's search stays the only one)", () => {
    page([member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student")]);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  });

  it("tells the page which member changed, so it mends its list instead of reading everyone again", async () => {
    const onMember = vi.fn();
    render(<I18nProvider lang="en"><MemoryRouter>
      <OrgManage part="people" org={org} members={[member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student"), member("s2", "Omar", "student")]} onChanged={m.changed} onMember={onMember} />
    </MemoryRouter></I18nProvider>);
    // On a phone the row is a card (base.css .data-table): the person across its top, class and lessons as a pair,
    // and the role's select and Remove each on a line of their own, as before.
    expect(Array.from(rowOf("Sara").querySelectorAll("td")).map((c) => c.getAttribute("data-cell"))).toEqual(["main", "row", null, null, "row"]);
    fireEvent.change(rowOf("Sara").querySelector("select")!, { target: { value: "teacher" } });
    fireEvent.click(screen.getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(onMember).toHaveBeenCalledWith("s1", { role: "teacher" }));
    fireEvent.click(within(rowOf("Omar")).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onMember).toHaveBeenCalledWith("s2", null));
    expect(m.changed).not.toHaveBeenCalled();
  });

  it("says how many people have loaded while the list is arriving, and never \"No people yet\"", () => {
    render(<I18nProvider lang="ar"><MemoryRouter><OrgManage part="people" org={org} members={[]} loading loaded={250} onChanged={m.changed} /></MemoryRouter></I18nProvider>);
    const said = screen.getByRole("status");
    expect(said.textContent).toBe("عدد من حُمّلوا حتى الآن: ٢٥٠");
    expect(said.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows why the list could not be read in its place", () => {
    render(<I18nProvider lang="en"><MemoryRouter><OrgManage part="people" org={org} members={[]} failed={<p role="alert">Could not read them</p>} onChanged={m.changed} /></MemoryRouter></I18nProvider>);
    expect(screen.getByRole("alert").textContent).toBe("Could not read them");
    expect(screen.queryByText("No people yet")).toBeNull();
  });
});

describe("adding a person", () => {
  it("shows them as already here once added, so the button can't send it again", async () => {
    m.found = [{ uid: "p9", name: "Layla", email: "layla@gmail.com", role: "learner", orgId: null }];
    page([member("a1", "Amina", "orgAdmin")]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "layla@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const add = await screen.findByRole("button", { name: /Add as/ });
    expect(screen.getByText("Independent learner")).toBeTruthy(); // a role on its own is capitalised (rn.*)
    fireEvent.click(add);
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "p9", role: "student", orgId: "o1" }));
    expect(await screen.findByText("Already here")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Add as/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("deleting the organization", () => {
  it("lands on the organizations with a message that it was deleted", async () => {
    page([member("a1", "Amina", "orgAdmin")]);
    fireEvent.change(screen.getByLabelText(/Type .Nile School. to confirm/), { target: { value: "Nile School" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete organization" }));
    // The choice the admin did not touch: its people are released, nobody's account is deleted.
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledWith({ orgId: "o1", confirm: "Nile School", members: "release" }));
    // While it runs the panel's own status line says how far it is: wait for the list's message, on the page it lands on.
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Nile School.* was deleted\. Its members are now independent learners\./));
    expect(m.changed).not.toHaveBeenCalled();
  });
});

describe("one job at a time (the org page's tabs)", () => {
  const Where = () => { const l = useLocation(); return <p data-testid="at">{l.pathname}{(l.state as { done?: string } | null)?.done ?? ""}</p>; };
  const part = (which: "details" | "people" | "delete", members: Profile[] = [member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]) =>
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/super/orgs/o1"]}>
      <Routes>
        <Route path="/super/orgs/:orgId" element={<OrgManage part={which} org={org} members={members} onChanged={m.changed} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter></I18nProvider>);
  const heads = () => screen.getAllByRole("heading").map((h) => `${h.tagName} ${h.textContent}`);

  it("details: only the organization's details, saved by themselves", async () => {
    part("details");
    expect(heads()).toEqual(["H3 Details"]);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Aswan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledWith({ orgId: "o1", name: "Nile School", type: "school", country: "", city: "Aswan" }));
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(m.changed).toHaveBeenCalled();
  });

  // The Settings panel holds this form and Look (OrgBranding), which saves the name too and has the page read the
  // organization again. The form kept the name it started with, and its own Save sent that older name back.
  it("details: follows a name saved elsewhere on the page (Look), and keeps what is being typed", async () => {
    const tree = (o: Org) => <I18nProvider lang="en"><MemoryRouter><OrgManage part="details" org={o} members={[]} onChanged={m.changed} /></MemoryRouter></I18nProvider>;
    const view = render(tree(org));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Aswan" } });
    view.rerender(tree({ ...org, name: "Nile Valley School" }));
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe("Nile Valley School");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Aswan");
    // The same organization read again (any other reload): nothing typed is lost.
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile Valley Language School" } });
    view.rerender(tree({ ...org, name: "Nile Valley School" }));
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe("Nile Valley Language School");
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Nile Valley School" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m.api.updateOrg).toHaveBeenCalledWith({ orgId: "o1", name: "Nile Valley School", type: "school", country: "", city: "Aswan" }));
    // Its own save, read back: "Saved." stays and the form is what was saved.
    view.rerender(tree({ ...org, name: "Nile Valley School", city: "Aswan" }));
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Aswan");
  });

  it("people: finding and adding someone, then every member, each with its own message", async () => {
    m.found = [{ uid: "p9", name: "Layla", email: "layla@gmail.com", role: "learner", orgId: null }];
    part("people");
    expect(heads()).toEqual(["H3 Add a person", "H3 Members"]);
    expect(screen.queryByLabelText("City")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
    const [addPanel, membersPanel] = ["Add a person", "Members"].map((name) => screen.getByRole("heading", { name }).closest("section")!);
    // Adding someone is answered in the Add panel.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "layla@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: /Add as/ }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "p9", role: "student", orgId: "o1" }));
    await waitFor(() => expect(addPanel.querySelector("[role=status]")?.textContent).toMatch(/Layla is now .*student here/));
    expect(membersPanel.querySelector("[role=status]")).toBeNull();
    // A member's role change is asked and answered in the Members panel; removing asks first too.
    fireEvent.change(rowOf("Sara").querySelector("select")!, { target: { value: "teacher" } });
    fireEvent.click(within(membersPanel).getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "teacher", orgId: "o1" }));
    await waitFor(() => expect(membersPanel.querySelector("[role=status]")?.textContent).toMatch(/Sara.*role changed/));
    expect(addPanel.querySelector("[role=status]")).toBeNull();
    fireEvent.click(rowOf("Sara").querySelector("button")!);
    expect(within(membersPanel).getByRole("alertdialog").textContent).toMatch(/Remove .*Sara.* from this organization\?/);
  });

  it("people: keeps the organization's only admin, said beside the members", () => {
    part("people", [member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.click(rowOf("Amina").querySelector("button")!);
    expect(screen.getByRole("heading", { name: "Members" }).closest("section")!.querySelector("[role=status]")?.textContent).toBe("This is the organization's only admin. Make someone else its admin first.");
    expect(m.api.setUserRole).not.toHaveBeenCalled();
  });

  it("delete: only deleting it, behind its typed name, landing on the organizations", async () => {
    part("delete");
    expect(heads()).toEqual(["H3 Delete this organization"]);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    const go = screen.getByRole("button", { name: "Delete organization" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type .Nile School. to confirm/), { target: { value: "Nile School" } });
    fireEvent.click(go);
    // The choice the admin did not touch: its people are released, nobody's account is deleted.
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledWith({ orgId: "o1", confirm: "Nile School", members: "release" }));
    expect((await screen.findByTestId("at")).textContent).toMatch(/^\/super\/orgs.*Nile School.* was deleted\./);
  });

  it("gives two parts on one page their own state (Settings shows details and delete)", async () => {
    m.api.updateOrg.mockRejectedValueOnce(new Error("offline"));
    render(<I18nProvider lang="en"><MemoryRouter><OrgManage part="details" org={org} members={[]} onChanged={m.changed} /><OrgManage part="delete" org={org} members={[]} onChanged={m.changed} /></MemoryRouter></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const said = await screen.findAllByRole("status");
    expect(said).toHaveLength(1);
    expect(said[0].closest("section")!.querySelector("h3")!.textContent).toBe("Details");
  });
});

describe("the organizations page (/super/orgs)", () => {
  const Where = () => <p data-testid="at">{useLocation().pathname}</p>;
  const list = (at = "/super/orgs", lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}>
    <Routes>
      <Route path="/super/orgs" element={<OrgsAdmin />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter></I18nProvider>);
  const three = [
    { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u", city: "Aswan", country: "Egypt", memberCount: 40 },
    { id: "o2", name: "Atlas University", type: "university", status: "pending", createdBy: "u", city: "Rabat", country: "Morocco" },
    { id: "o3", name: "Hope NGO", type: "ngo", status: "active", createdBy: "u", city: "Cairo", country: "Egypt" },
  ];

  it("opens on every organization, with the new one a tab away", () => {
    m.orgs = three;
    list();
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["All organizations", "New organization"]);
    expect(screen.getByRole("tab", { name: "All organizations" }).getAttribute("aria-selected")).toBe("true");
    // On a phone each organization is a card with its name across the top; type, status and members are labelled pairs.
    expect(Array.from(screen.getByRole("link", { name: /Nile School/ }).closest("tr")!.querySelectorAll("td")).map((c) => c.getAttribute("data-cell"))).toEqual(["main", null, null, null]);
    expect(screen.getByRole("link", { name: /Atlas University/ }).getAttribute("href")).toBe("/super/orgs/o2");
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByLabelText("Organization name")).toBeNull(); // the form is under its own tab
    fireEvent.click(screen.getByRole("tab", { name: "New organization" }));
    expect(screen.getByLabelText("Organization name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create organization" })).toBeTruthy();
  });

  it("finds an organization by its name, city or country", () => {
    m.orgs = three;
    list();
    const box = screen.getByRole("searchbox", { name: "Search by name, country or city" });
    const names = () => screen.queryAllByRole("link").map((a) => a.querySelector("strong")?.textContent).filter(Boolean);
    fireEvent.change(box, { target: { value: "egypt" } });
    expect(names()).toEqual(["Nile School", "Hope NGO"]);
    fireEvent.change(box, { target: { value: " rabat " } });
    expect(names()).toEqual(["Atlas University"]);
    fireEvent.change(box, { target: { value: "hope" } });
    expect(names()).toEqual(["Hope NGO"]);
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(names()).toEqual([]);
    expect(screen.getByText("No organization matches your search.")).toBeTruthy();
    fireEvent.change(box, { target: { value: "" } });
    expect(names()).toHaveLength(3);
  });

  it("says each organization's status in words, the suspended and the ones being deleted too", () => {
    m.orgs = [...three, { id: "o4", name: "Frozen School", type: "school", status: "suspended", createdBy: "u" }, { id: "o5", name: "Leaving School", type: "school", status: "deleting", createdBy: "u" }];
    list();
    const statusOf = (name: string) => within(screen.getByRole("link", { name: new RegExp(name) }).closest("tr")!).getAllByRole("cell")[2].textContent;
    expect(statusOf("Nile School")).toBe("Active");
    expect(statusOf("Atlas University")).toBe("Waiting for approval");
    expect(statusOf("Frozen School")).toBe("Suspended");
    expect(statusOf("Leaving School")).toBe("Being deleted");
  });

  it("says them in Arabic", () => {
    m.orgs = [{ id: "o4", name: "Frozen School", type: "school", status: "suspended", createdBy: "u" }, { id: "o5", name: "Leaving School", type: "school", status: "deleting", createdBy: "u" }];
    list("/super/orgs", "ar");
    expect(screen.getByText("موقوفة")).toBeTruthy();
    expect(screen.getByText("قيد الحذف")).toBeTruthy();
  });

  it("a list that could not be read says why with Retry, and shows no spinner under it", () => {
    const reload = vi.fn();
    m.useAllOrgs.mockImplementation(() => ({ error: Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }), reload }));
    const { container } = list();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Your account isn't allowed to do this/);
    expect(alert.textContent).not.toMatch(/insufficient permissions/); // never the SDK's own English
    expect(container.querySelector(".loading")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalled();
  });

  it("with none yet, says so and offers no search", () => {
    list();
    expect(screen.getByText("No active organizations yet.")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("opened at the new one, reads no organizations until the list is opened", () => {
    m.orgs = three;
    list("/super/orgs?tab=new");
    expect(screen.getByLabelText("Organization name")).toBeTruthy();
    expect(m.useAllOrgs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "All organizations" }));
    expect(m.useAllOrgs).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Nile School/ })).toBeTruthy();
  });

  it("keeps a half-filled form while the list is looked at", () => {
    list("/super/orgs?tab=new");
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Delta College" } });
    fireEvent.click(screen.getByRole("tab", { name: "All organizations" }));
    fireEvent.click(screen.getByRole("tab", { name: "New organization" }));
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe("Delta College");
  });

  it("opens the new organization's page once it is created", async () => {
    list("/super/orgs?tab=new");
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Delta College" } });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(m.api.createOrg).toHaveBeenCalledWith({ name: "Delta College", type: "school", country: "", city: "" }));
    expect((await screen.findByTestId("at")).textContent).toBe("/super/orgs/n1");
  });

  it("names its tabs in Arabic", () => {
    list("/super/orgs", "ar");
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["كل المؤسسات", "مؤسسة جديدة"]);
  });
});
