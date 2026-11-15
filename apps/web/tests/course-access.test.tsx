// /super/access: a platform admin gives a university teacher read access to chosen courses' results. Grants go
// through the audited callables (grantCourseAccess, revokeCourseAccess), name the organizations they cover and may end.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import staffEn from "../src/staff/strings/en.json";
import staffAr from "../src/staff/strings/ar.json";

type Docs = { id: string; data: Record<string, unknown> }[];
const m = vi.hoisted(() => ({
  auth: { user: { uid: "admin1" }, role: "superadmin" } as Record<string, unknown>,
  grants: [] as { id: string; data: Record<string, unknown> }[],
  orgs: [] as { id: string; data: Record<string, unknown> }[],
  orgsFail: null as Error | null,
  findAccount: vi.fn(async (_: unknown): Promise<unknown> => ({ account: { uid: "t1", name: "Dr Amal", email: "amal@uni.edu", teach: "university", emailVerified: true }, profiles: 1 })),
  grant: vi.fn(async (_: unknown): Promise<unknown> => ({ ok: true })),
  revoke: vi.fn(async (_: unknown): Promise<unknown> => ({ ok: true })),
  other: vi.fn(async (_: unknown): Promise<unknown> => ({})),
  setDoc: vi.fn(), deleteDoc: vi.fn(),
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/firebase", () => ({ db: {} }));
vi.mock("../src/fb", () => ({
  loadFirebase: async () => ({ db: {} }),
  call: (name: string) => ({ findAccount: m.findAccount, grantCourseAccess: m.grant, revokeCourseAccess: m.revoke } as Record<string, typeof m.other>)[name] ?? m.other,
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => name, doc: (...p: unknown[]) => p, getDoc: async () => ({ exists: () => false }),
  getDocs: async (name: string) => {
    if (name === "orgs" && m.orgsFail) throw m.orgsFail;
    return { docs: (name === "orgs" ? m.orgs : m.grants).map((d) => ({ id: d.id, data: () => d.data })) };
  },
  // The page must never write a grant itself any more (the rules refuse it): these would throw the test if called.
  setDoc: m.setDoc, deleteDoc: m.deleteDoc, serverTimestamp: () => "now",
}));

const { CourseAccess } = await import("../src/results/CourseAccess");

const CONTENT = {
  loadCatalog: async () => ({ version: 1, units: [
    { id: "ai-s4", title: { en: "Train your own model", ar: "درّب نموذجك" }, audience: "students" },
    { id: "iot-s4", title: { en: "A sensor network", ar: "شبكة حساسات" }, audience: "students" },
    { id: "ai-4-1", title: { en: "Leading AI at school" } },
  ] }) as never,
  loadUnit: async () => { throw new Error("not used"); },
};
const ORGS: Docs = [
  { id: "o-nile", data: { name: "Nile University", status: "active" } },
  { id: "o-cairo", data: { name: "Cairo Polytechnic", status: "suspended" } },
  { id: "o-wait", data: { name: "Still waiting", status: "pending" } },
];
const page = (lang = "en") => render(<I18nProvider lang={lang}><CourseAccess content={CONTENT} /></I18nProvider>);
const refusal = (reason: string, code = "functions/permission-denied") => Object.assign(new Error("Server English that must never show."), { code, details: { reason } });
/** Finds the teacher (by Enter) and waits for the form. */
async function found() {
  const email = screen.getByLabelText("Their email") as HTMLInputElement;
  fireEvent.change(email, { target: { value: " Amal@Uni.edu " } });
  fireEvent.submit(email.form!);
  return screen.findByRole("heading", { name: "Dr Amal" });
}

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  m.grants = []; m.orgs = ORGS; m.orgsFail = null;
  for (const f of [m.findAccount, m.grant, m.revoke, m.other, m.setDoc, m.deleteDoc]) f.mockClear();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { logged.mockRestore(); vi.useRealTimers(); });

describe("finding the teacher", () => {
  it("is a real form: Enter in the email field finds, and the button says it is busy meanwhile", async () => {
    let done!: (v: unknown) => void;
    m.findAccount.mockImplementationOnce(() => new Promise((r) => { done = r; }));
    page();
    const email = screen.getByLabelText("Their email") as HTMLInputElement;
    const find = screen.getByRole("button", { name: "Find" }) as HTMLButtonElement;
    expect(find.type).toBe("submit");
    expect(email.form).toBe(find.form); // so the browser's Enter submits it
    fireEvent.change(email, { target: { value: " Amal@Uni.edu " } });
    fireEvent.submit(email.form!);
    expect(m.findAccount).toHaveBeenCalledWith({ login: "amal@uni.edu" });
    expect(find.getAttribute("aria-busy")).toBe("true");
    fireEvent.submit(email.form!); // Enter again while it looks: one request
    expect(m.findAccount).toHaveBeenCalledTimes(1);
    done({ account: { uid: "t1", name: "Dr Amal", email: "amal@uni.edu", teach: "university", emailVerified: true }, profiles: 1 });
    expect(await screen.findByRole("heading", { name: "Dr Amal" })).toBeTruthy();
    expect(find.getAttribute("aria-busy")).toBeNull();
  });

  it("says nobody has that email as an alert, and words a refusal in the admin's language", async () => {
    m.findAccount.mockImplementationOnce(async () => ({ account: null, profiles: 0 }));
    page("ar");
    const email = screen.getByLabelText("بريده الإلكتروني") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "x@y.z" } });
    fireEvent.submit(email.form!);
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    m.findAccount.mockImplementationOnce(async () => { throw refusal("disabled"); });
    fireEvent.submit(email.form!);
    expect(await screen.findByText(staffAr["st.rf.disabled"])).toBeTruthy();
    expect(screen.queryByText(/Server English/)).toBeNull();
  });
});

describe("giving access", () => {
  it("lists every working organization once, plus people in none, and says what choosing none means", async () => {
    page();
    await found();
    const group = screen.getByRole("group", { name: staffEn["st.acc.orgs"] });
    // The organization is the one they belong to when the grant is saved, and it does not follow them afterwards.
    expect(within(group).getByText(/the organization they belong to when you save/)).toBeTruthy();
    expect(within(group).getByText(/stays so if they later leave it or join another/)).toBeTruthy();
    expect((await within(group).findAllByRole("checkbox")).map((c) => c.textContent)).toEqual(["People in no organization", "Cairo Polytechnic", "Nile University"]);
    // Student courses only, as before.
    expect(screen.getByRole("checkbox", { name: /Train your own model/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Leading AI at school/ })).toBeNull();
  });

  it("saves the courses, the organizations and the end date through grantCourseAccess, never with a write of its own", async () => {
    page();
    await found();
    fireEvent.click(screen.getByRole("checkbox", { name: /Train your own model/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Nile University" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "People in no organization" }));
    fireEvent.change(screen.getByLabelText(staffEn["st.acc.until"]), { target: { value: "2031-06-30" } });
    const save = screen.getByRole("button", { name: "Save access" });
    fireEvent.click(save);
    expect(save.getAttribute("aria-busy")).toBe("true");
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    // The last day is included: its last millisecond, on this device's clock.
    expect(m.grant).toHaveBeenCalledWith({ uid: "t1", units: ["ai-s4"], orgs: ["o-nile", "none"], until: new Date(2031, 5, 30, 23, 59, 59, 999).getTime() });
    expect(m.setDoc).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Dr Amal" })).toBeNull();
  });

  it("with no organization and no date chosen sends neither: the server stores the teacher's own organization of that moment, until removed", async () => {
    page();
    await found();
    fireEvent.click(screen.getByRole("checkbox", { name: /A sensor network/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await screen.findByText("Saved.");
    expect(m.grant).toHaveBeenCalledWith({ uid: "t1", units: ["iot-s4"], until: null });
  });

  it("opens the teacher's grant as it is, and shows a refused save in the admin's language with the form kept", async () => {
    m.grants = [{ id: "t1", data: { units: ["iot-s4"], orgs: ["o-cairo"], until: new Date(2031, 0, 15, 23, 59, 59, 999).getTime(), name: "Dr Amal", email: "amal@uni.edu" } }];
    m.grant.mockImplementationOnce(async () => { throw refusal("bad-until", "functions/invalid-argument"); });
    page();
    const granted = await screen.findByRole("table");
    // On a phone the row is a card: the teacher across its top, the two lists (they can be long) a line each, and the
    // end date beside Remove (base.css .data-table).
    expect(Array.from(granted.querySelectorAll("tbody tr td")).map((c) => c.getAttribute("data-cell"))).toEqual(["main", "row", "row", null, null]);
    await found();
    expect(screen.getByRole("checkbox", { name: /A sensor network/ }).getAttribute("aria-checked")).toBe("true");
    expect((await screen.findByRole("checkbox", { name: "Cairo Polytechnic" })).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText(staffEn["st.acc.until"]) as HTMLInputElement).value).toBe("2031-01-15");
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    expect(await screen.findByText(staffEn["st.rf.badUntil"])).toBeTruthy();
    expect(screen.queryByText(/Server English/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Dr Amal" })).toBeTruthy();
  });

  it("still saves when the organizations can't be read: the error has Retry, and the grant keeps to the teacher's own", async () => {
    m.orgsFail = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    page();
    await found();
    const group = screen.getByRole("group", { name: staffEn["st.acc.orgs"] });
    expect(await within(group).findByText(staffEn["st.err.permissionDenied"])).toBeTruthy();
    m.orgsFail = null;
    fireEvent.click(within(group).getByRole("button", { name: "Retry" }));
    expect(await within(group).findByRole("checkbox", { name: "Nile University" })).toBeTruthy();
  });
});

describe("who has access", () => {
  const GRANTS: Docs = [
    { id: "t1", data: { units: ["ai-s4", "iot-s4"], orgs: ["o-nile", "none", "o-gone"], until: new Date(2031, 5, 30, 23, 59, 59, 999).getTime(), name: "Dr Amal", email: "amal@uni.edu" } },
    { id: "t2", data: { units: ["ai-s4"], name: "Dr Omar", email: "omar@uni.edu" } }, // a grant from before organizations and end dates
    { id: "t3", data: { units: ["ai-s4"], until: Date.UTC(2020, 0, 5), name: "Dr Lina" } },
  ];

  it("shows each grant's courses, organizations and end, with a named column for the actions", async () => {
    m.grants = GRANTS;
    page();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Teacher", "Courses", "Organizations", "Ends", "Actions"]);
    const [amal, omar, lina] = within(table).getAllByRole("row").slice(1);
    await within(amal).findByText("Nile University");
    expect(within(amal).getByText("People in no organization")).toBeTruthy();
    expect(within(amal).getByText("o-gone")).toBeTruthy(); // an organization deleted since: its id, not a blank
    expect(amal.textContent).toContain("Train your own model");
    expect(amal.textContent).toContain(new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(2031, 5, 30)));
    // No organizations stored: the server reads nothing for it, and the list says so instead of "their own organization".
    expect(within(omar).getByText("None set, so they see no one. Save this access again to set them.")).toBeTruthy();
    expect(within(omar).getByText("Until removed")).toBeTruthy();
    expect(lina.textContent).toContain("Ended on");
  });

  it("says Nobody yet only when the list was read and is empty, never over a read that failed", async () => {
    const view = page();
    expect(await screen.findByText("Nobody yet.")).toBeTruthy();
    view.unmount();
    m.grants = undefined as never; // getDocs then throws: the read failed
    page();
    expect((await screen.findByRole("alert")).textContent).toContain(staffEn["st.err.generic"]);
    expect(screen.queryByText("Nobody yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("asks before removing, removes through revokeCourseAccess, and puts the focus on what happened", async () => {
    m.grants = GRANTS;
    page();
    const table = await screen.findByRole("table");
    const remove = within(within(table).getAllByRole("row")[1]).getByRole("button", { name: "Remove" });
    remove.focus();
    fireEvent.click(remove);
    expect(m.revoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Remove .*Dr Amal.*'s access\?/ });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(remove);
    expect(m.revoke).not.toHaveBeenCalled();

    fireEvent.click(remove);
    m.grants = GRANTS.slice(1);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    const said = await screen.findByText(staffEn["st.acc.removed"]);
    expect(m.revoke).toHaveBeenCalledWith({ uid: "t1" });
    expect(m.deleteDoc).not.toHaveBeenCalled();
    expect(said.getAttribute("role")).toBe("status");
    expect(document.activeElement).toBe(said);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await vi.waitFor(() => expect(screen.queryByText("Dr Amal")).toBeNull());
    expect(screen.getByText("Dr Omar")).toBeTruthy();
  });

  it("shows a failed removal in the admin's language, inside the question, and keeps the grant listed", async () => {
    m.grants = GRANTS;
    m.revoke.mockImplementationOnce(async () => { throw refusal("not-super"); });
    page("ar");
    const table = await screen.findByRole("table");
    fireEvent.click(within(within(table).getAllByRole("row")[1]).getByRole("button", { name: "أزِل" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "أزِل" }));
    const why = await within(dialog).findByRole("alert");
    // staff/errors.ts's own words for "not-super" (they win over admin/refusals.ts's, which this page also loads).
    expect(why.textContent).toBe(staffAr["st.rf.notSuper"]);
    expect(screen.queryByText(/Server English/)).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(within(table).getByText("Dr Amal")).toBeTruthy();
    // And the SDK's own failure, when the server never answered.
    m.revoke.mockImplementationOnce(async () => { throw Object.assign(new Error("internal"), { code: "functions/unavailable" }); });
    fireEvent.click(within(dialog).getByRole("button", { name: "أزِل" }));
    expect(await within(dialog).findByText(staffAr["st.err.unavailable"])).toBeTruthy();
  });
});

describe("someone who is not a platform admin", () => {
  it("sees that it is not theirs, and nothing is read", () => {
    m.auth = { user: { uid: "t1" }, role: "teacher" };
    page();
    expect(screen.getByText("Only Darsi platform admins can give course access.")).toBeTruthy();
    expect(screen.queryByLabelText("Their email")).toBeNull();
    m.auth = { user: { uid: "admin1" }, role: "superadmin" };
  });
});
