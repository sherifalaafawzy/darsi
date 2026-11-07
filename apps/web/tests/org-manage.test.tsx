import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Org, Profile, Role } from "../src/auth/types";
import { I18nProvider } from "../src/i18n";

// A platform admin's org page (OrgManage): removing or demoting someone asks first, the only admin stays, an added
// person's row says so at once, and deleting the organization is confirmed on the page the admin lands on.
const m = vi.hoisted(() => ({
  api: { setUserRole: vi.fn(async () => ({})), deleteOrg: vi.fn(async () => ({})), updateOrg: vi.fn() },
  found: [] as unknown[],
  changed: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "me" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  findPeople: async () => m.found, useAllOrgs: () => ({ data: [], reload: vi.fn() }),
}));

const { OrgManage, OrgsAdmin } = await import("../src/admin/OrgsAdmin");

const org: Org = { id: "o1", name: "Nile School", type: "school", status: "active", createdBy: "u1" };
const member = (uid: string, name: string, role: Role): Profile => ({ uid, name, email: `${uid}@users.darsi.app`, role, orgId: "o1" });
const page = (members: Profile[], lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={["/super/orgs/o1"]}>
  <Routes>
    <Route path="/super/orgs/:orgId" element={<OrgManage org={org} members={members} onChanged={m.changed} />} />
    <Route path="/super/orgs" element={<OrgsAdmin />} />
  </Routes>
</MemoryRouter></I18nProvider>);
const rowOf = (name: string) => screen.getByRole("link", { name: new RegExp(name) }).closest("tr")!;

beforeEach(() => { vi.clearAllMocks(); m.found = []; });

describe("an organization's members", () => {
  it("asks before removing someone, and does nothing on Cancel", async () => {
    page([member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.click(rowOf("Sara").querySelector("button")!);
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Remove .*Sara.* from this organization\? They are signed out on every device/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(rowOf("Sara").querySelector("button")!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).find((b) => b.closest("[role=alert]"))!);
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "learner" }));
    expect(m.changed).toHaveBeenCalled();
  });

  it("asks before an admin loses the role, but changes a student to a teacher at once", async () => {
    page([member("a1", "Amina", "orgAdmin"), member("a2", "Omar", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.change(rowOf("Sara").querySelector("select")!, { target: { value: "teacher" } });
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "s1", role: "teacher", orgId: "o1" }));
    m.api.setUserRole.mockClear();
    fireEvent.change(rowOf("Omar").querySelector("select")!, { target: { value: "teacher" } });
    expect(m.api.setUserRole).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Change .*Omar.*'s role to teacher\? They stop being an admin/);
    fireEvent.click(screen.getByRole("button", { name: "Change the role" }));
    await waitFor(() => expect(m.api.setUserRole).toHaveBeenCalledWith({ uid: "a2", role: "teacher", orgId: "o1" }));
  });

  it("keeps the organization's only admin", () => {
    page([member("a1", "Amina", "orgAdmin"), member("s1", "Sara", "student")]);
    fireEvent.click(rowOf("Amina").querySelector("button")!);
    fireEvent.change(rowOf("Amina").querySelector("select")!, { target: { value: "student" } });
    expect(screen.getAllByText("This is the organization's only admin. Make someone else its admin first.").length).toBeGreaterThan(0);
    expect(m.api.setUserRole).not.toHaveBeenCalled();
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
    await waitFor(() => expect(m.api.deleteOrg).toHaveBeenCalledWith({ orgId: "o1", confirm: "Nile School" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Nile School.* was deleted\. Its members are now independent learners\./);
    expect(m.changed).not.toHaveBeenCalled();
  });
});
