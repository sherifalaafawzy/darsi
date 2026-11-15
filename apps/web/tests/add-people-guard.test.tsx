// Adding and importing people without losing work (ad-forms-safety): the one-time passwords can't be left behind by a
// stray tap (Back, a nav link, a reload) until they were downloaded or printed; a download that can't load the Excel
// code falls back to CSV; and the import preview says where it stops and can list every row that needs fixing.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import en from "../src/admin/forms-strings/en.json";
import ar from "../src/admin/forms-strings/ar.json";

const m = vi.hoisted(() => ({
  api: { createMembers: vi.fn() },
  /** What reached the browser as a download: the file's name and its text (CSV) or its type (Excel). */
  files: [] as Array<{ name: string; blob: Blob }>,
  /** The Excel chunk: works unless a test makes it fail (offline, a build since replaced). */
  xlsx: vi.fn(async (..._a: unknown[]): Promise<Blob> => new Blob(["xlsx"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })),
  template: vi.fn(async (): Promise<Blob> => new Blob(["tpl"])),
  /** admin/data.ts forgetMembers: the member lists the dashboard read, forgotten after accounts were made. */
  forget: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, firebaseReady: true, call: () => vi.fn() }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "admin1" }, role: "orgAdmin", orgId: "o1" }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), madeSince: async () => [], forgetMembers: (...a: unknown[]) => m.forget(...a) }));
vi.mock("../src/admin/importer", async (orig) => ({
  ...(await orig<typeof import("../src/admin/importer")>()),
  credentialsXlsx: (...a: unknown[]) => m.xlsx(...a),
  templateXlsx: () => m.template(),
  downloadBlob: (blob: Blob, name: string) => { m.files.push({ name, blob }); },
}));

const { AddPeople, ImportPeople, Results } = await import("../src/admin/AddPeople");
const { credentialsCsv, csvText, parseCsv } = await vi.importActual<typeof import("../src/admin/importer")>("../src/admin/importer");

/** The page beside a nav link, as in the app: /admin is the dashboard Back leads to, /learn what the link opens. */
const page = (ui: ReactNode, { lang = "en", url = "/admin/add" } = {}) => render(
  <I18nProvider lang={lang}><MemoryRouter initialEntries={[url]}>
    <nav><Link to="/learn">Go to Learn</Link></nav>
    <Routes>
      <Route path="/admin" element={<p>The dashboard</p>} />
      <Route path="/learn" element={<p>The Learn page</p>} />
      <Route path="*" element={ui} />
    </Routes>
  </MemoryRouter></I18nProvider>,
);
const created = (members: Array<{ name: string; username?: string }>) => ({ results: members.map((x, k) => ({ row: k + 1, name: x.name, login: x.username ?? "amina.b", password: `pw-${k + 1}`, uid: `u${k + 1}`, status: "created" })) });
/** Adds one person by hand and waits for the results, with their one-time password. */
const addOne = async () => {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Amina Bello" } });
  fireEvent.click(screen.getByRole("button", { name: "Create accounts" }));
  await screen.findByText("Accounts ready");
  await act(async () => {}); // the leave guard starts in an effect, after the results are on the page
};
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));
const link = () => fireEvent.click(screen.getByRole("link", { name: "Go to Learn" }));
const question = () => screen.queryByRole("alertdialog");
const unload = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

beforeEach(() => {
  vi.clearAllMocks();
  m.files = [];
  m.api.createMembers.mockImplementation(async ({ members }: { members: Array<{ name: string; username?: string }> }) => created(members));
  vi.spyOn(console, "error").mockImplementation(() => {}); // the staff kit logs the raw error it words
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});
afterEach(() => vi.restoreAllMocks());

describe("the one-time passwords can't be left behind", () => {
  it("holds Back and a nav link until 'Leave anyway', and asks the browser to confirm a reload", async () => {
    page(<AddPeople />);
    await addOne();
    expect(screen.getAllByText("pw-1").length).toBeGreaterThan(0);
    expect(unload()).toBe(true);
    back();
    expect(screen.queryByText("The dashboard")).toBeNull();
    const ask = question()!;
    expect(ask.textContent).toContain("Leave without the passwords?");
    expect(ask.textContent).toContain("haven't been printed or downloaded yet");
    // The safe answer has the focus; Stay closes the question and nothing was lost.
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Stay" }));
    fireEvent.click(within(ask).getByRole("button", { name: "Stay" }));
    expect(question()).toBeNull();
    expect(screen.getAllByText("pw-1").length).toBeGreaterThan(0);
    link();
    expect(screen.queryByText("The Learn page")).toBeNull();
    fireEvent.click(within(question()!).getByRole("button", { name: "Leave anyway" }));
    expect(screen.getByText("The Learn page")).toBeTruthy();
  });

  it("Back goes through the same question on the import page, and 'Leave anyway' goes back", async () => {
    page(<ImportPeople />, { url: "/admin/import" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["name,username\nAmina Bello,amina.b"], "people.csv", { type: "text/csv" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Create 1 account" }));
    await screen.findByText("Accounts ready");
    back();
    expect(question()).toBeTruthy();
    fireEvent.click(within(question()!).getByRole("button", { name: "Leave anyway" }));
    expect(screen.getByText("The dashboard")).toBeTruthy();
  });

  it("after a download nothing is held any more", async () => {
    page(<AddPeople />);
    await addOne();
    const button = screen.getByRole("button", { name: "Download credentials (Excel)" });
    // The button says what the file holds, to sighted people and to screen readers.
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe(en["fm.pw.fileHint"]);
    fireEvent.click(button);
    await waitFor(() => expect(m.files.map((f) => f.name)).toEqual([expect.stringMatching(/^darsi-accounts-\d{4}-\d\d-\d\d\.xlsx$/)]));
    // What the workbook is made from: the password is there, and never anything createMembers was sent.
    expect((m.xlsx.mock.calls[0][0] as Array<Record<string, unknown>>)[0]).toMatchObject({ name: "Amina Bello", login: "amina.b", password: "pw-1", status: "Created" });
    expect(m.api.createMembers.mock.calls[0][0]).not.toHaveProperty("members.0.password");
    await waitFor(() => expect(unload()).toBe(false));
    link();
    expect(question()).toBeNull();
    expect(screen.getByText("The Learn page")).toBeTruthy();
  });

  it("'Download first' in the question downloads and keeps the person on the page, free to leave", async () => {
    page(<AddPeople />);
    await addOne();
    back();
    fireEvent.click(within(question()!).getByRole("button", { name: "Download first" }));
    await waitFor(() => expect(m.files).toHaveLength(1));
    await waitFor(() => expect(question()).toBeNull());
    expect(screen.getByText("Accounts ready")).toBeTruthy();
    back();
    expect(screen.getByText("The dashboard")).toBeTruthy();
  });

  it("printing the slips counts as kept, even if the print dialog was cancelled (the page can't know)", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    page(<AddPeople />);
    await addOne();
    fireEvent.click(screen.getByRole("button", { name: "Print login slips" }));
    expect(print).toHaveBeenCalled();
    back();
    expect(question()).toBeNull();
    expect(screen.getByText("The dashboard")).toBeTruthy();
  });

  it("asks nothing when the results hold no password (everything failed or already existed)", async () => {
    m.api.createMembers.mockResolvedValue({ results: [{ row: 1, name: "Amina Bello", login: "amina@school.org", status: "exists", reason: "exists" }] });
    page(<AddPeople />);
    await addOne();
    expect(unload()).toBe(false);
    link();
    expect(question()).toBeNull();
    expect(screen.getByText("The Learn page")).toBeTruthy();
  });

  it("asks again for passwords that 'Try the rest again' added after a download", async () => {
    const row = (n: number) => ({ row: n, name: `Pupil ${n}`, login: `pupil.${n}`, password: `pw-${n}`, uid: `u${n}`, status: "created" as const });
    const ui = (rows: ReturnType<typeof row>[]) => (
      <I18nProvider lang="en"><MemoryRouter initialEntries={["/admin/import"]}>
        <nav><Link to="/learn">Go to Learn</Link></nav>
        <Routes><Route path="/learn" element={<p>The Learn page</p>} /><Route path="*" element={<Results results={rows} />} /></Routes>
      </MemoryRouter></I18nProvider>
    );
    const view = render(ui([row(1)]));
    fireEvent.click(screen.getByRole("button", { name: "Download credentials (Excel)" }));
    await waitFor(() => expect(unload()).toBe(false));
    view.rerender(ui([row(1), row(2)]));
    await waitFor(() => expect(unload()).toBe(true));
    link();
    expect(question()).toBeTruthy();
    expect(screen.queryByText("The Learn page")).toBeNull();
  });

  it("asks in Arabic, with nothing left in English and no middle dot", async () => {
    m.api.createMembers.mockResolvedValue({ results: [{ row: 1, name: "منى", login: "mona.a", password: "pw-1", uid: "u1", status: "created" }] });
    page(<AddPeople />, { lang: "ar" });
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "منى" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحسابات" }));
    await screen.findAllByText("pw-1");
    link();
    const ask = question()!;
    expect(ask.textContent).toContain(ar["fm.pw.title"]);
    expect(within(ask).getAllByRole("button").map((b) => b.textContent)).toEqual([ar["fm.leave.go"], ar["fm.pw.download"], ar["fm.leave.stay"]]);
    expect(ask.textContent).not.toMatch(/[A-Za-z·]/);
  });
});

describe("downloads that can't load the Excel code", () => {
  const broken = () => new TypeError("Failed to fetch dynamically imported module: https://darsiai.org/assets/exceljs-abc.js");

  it("falls back to CSV with the passwords, says so, and counts as downloaded", async () => {
    m.xlsx.mockRejectedValueOnce(broken());
    // A name that would run as a formula in Excel, and a password that starts with @ (the server's symbols include it).
    m.api.createMembers.mockResolvedValue({ results: [{ row: 1, name: "=HYPERLINK(\"http://evil\")", login: "amina.b@users.darsi.app", password: "@Kp7!xQ2mz", uid: "u1", status: "created" }] });
    page(<AddPeople />);
    await addOne();
    fireEvent.click(screen.getByRole("button", { name: "Download credentials (Excel)" }));
    await waitFor(() => expect(m.files).toHaveLength(1));
    const { name, blob } = m.files[0];
    expect(name).toMatch(/^darsi-accounts-\d{4}-\d\d-\d\d\.csv$/);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const rows = parseCsv((await blob.text()).replace(/^﻿/, ""));
    expect(rows[0]).toEqual(["#", "Name", "Login", "Password", "Role", "Group", "Status"]);
    // The name is kept as text by a leading '; the login is as people type it; the password is exactly as made.
    expect(rows[1]).toEqual(["1", "'=HYPERLINK(\"http://evil\")", "amina.b", "@Kp7!xQ2mz", "Student", "", "Created"]);
    expect((await screen.findByRole("status")).textContent).toBe(en["fm.pw.csvInstead"]);
    expect(screen.queryByRole("alert")).toBeNull();
    link();
    expect(screen.getByText("The Learn page")).toBeTruthy();
  });

  it("writes the CSV with a byte-order mark first, CRLF rows and quoted cells, and never touches a password", () => {
    const labels = { row: "#", name: "الاسم", login: "الدخول", password: "كلمة المرور", role: "الدور", group: "الفصل", status: "الحالة" };
    const text = credentialsCsv([{ row: 3, name: "منى \"مها\" علي", login: "mona.a", password: "-Ab3$xy,z", role: "طالب", group: "٧ أ", status: "تم" }], labels);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).split("\r\n")).toEqual([
      "\"#\",\"الاسم\",\"الدخول\",\"كلمة المرور\",\"الدور\",\"الفصل\",\"الحالة\"",
      "\"3\",\"منى \"\"مها\"\" علي\",\"mona.a\",\"-Ab3$xy,z\",\"طالب\",\"٧ أ\",\"تم\"",
    ]);
    // Without row numbers the password is one column earlier, and still written as it is.
    expect(credentialsCsv([{ name: "A", login: "a", password: "+pw", status: "ok" }], labels).split("\r\n")[1]).toBe("\"A\",\"a\",\"+pw\",\"\",\"\",\"ok\"");
    // Everywhere else a leading = + - @ gets a ' (and the screens' invisible direction marks are dropped).
    expect(csvText([["=1", "+1", "-1", "@x", "⁨Nile⁩", 7]]).slice(1)).toBe("\"'=1\",\"'+1\",\"'-1\",\"'@x\",\"Nile\",\"7\"");
  });

  it("shows the download button busy while the file is made, and an alert only if nothing could be downloaded", async () => {
    let done!: (b: Blob) => void;
    m.xlsx.mockImplementationOnce(() => new Promise<Blob>((res) => { done = res; }));
    page(<AddPeople />);
    await addOne();
    const button = screen.getByRole("button", { name: "Download credentials (Excel)" });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
    await act(async () => { done(new Blob(["x"])); });
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why the template couldn't be downloaded, in the admin's language", async () => {
    m.template.mockRejectedValueOnce(broken());
    const view = page(<ImportPeople />, { url: "/admin/import" });
    fireEvent.click(screen.getByRole("button", { name: "Download a template" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Something went wrong and this didn't go through/);
    expect(screen.queryByText(/dynamically imported/)).toBeNull();
    expect(m.files).toHaveLength(0);
    // A second try that works clears it.
    fireEvent.click(screen.getByRole("button", { name: "Download a template" }));
    await waitFor(() => expect(m.files.map((f) => f.name)).toEqual(["darsi-people-template.xlsx"]));
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
    // Offline, it says the thing the person can fix; in Arabic too.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    m.template.mockRejectedValueOnce(broken());
    page(<ImportPeople />, { url: "/admin/import", lang: "ar" });
    fireEvent.click(screen.getByRole("button", { name: "تنزيل نموذج" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^أنت غير متصل بالإنترنت/);
  });

  it("says a file it can't open in the admin's language, not the parser's English", async () => {
    page(<ImportPeople />, { url: "/admin/import", lang: "ar" });
    // Not a workbook at all: ExcelJS throws its own English.
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["not a zip"], "people.xlsx")] } });
    expect((await screen.findByRole("alert", undefined, { timeout: 10_000 })).textContent).toBe(ar["fm.cantRead"]);
  });
});

describe("the import preview", () => {
  /** 1,500 people; the one on the sheet's row 450 has an email that isn't one. */
  const sheet = ["name,email,role", ...Array.from({ length: 1500 }, (_, i) => `Pupil ${i + 1},${i + 2 === 450 ? "not-an-email" : `p${i + 1}@school.org`},student`)].join("\n");
  const open = async () => {
    page(<ImportPeople />, { url: "/admin/import" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File([sheet], "people.csv", { type: "text/csv" })] } });
    await screen.findByText("1,500 people found");
  };
  const dataRows = () => screen.getAllByRole("row").length - 1;

  it("says it shows the first 200 of 1,500, and shows more when asked", async () => {
    await open();
    expect(dataRows()).toBe(200);
    expect(screen.getByText("Showing the first 200 of 1,500.")).toBeTruthy();
    expect(screen.queryByText("Pupil 449")).toBeNull(); // row 450 is not among the first 200
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(dataRows()).toBe(400);
    expect(screen.getByText("Showing the first 400 of 1,500.")).toBeTruthy();
  });

  it("'Rows to fix only' lists the error on row 450, however far down it is", async () => {
    await open();
    expect(screen.getByText(/^Rows to fix \(they will be skipped\): 1$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Rows to fix only" }));
    expect(dataRows()).toBe(1);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByText("450")).toBeTruthy();
    expect(row.getByText("Pupil 449")).toBeTruthy();
    expect(row.getByText("invalid email")).toBeTruthy();
    expect(screen.queryByText(/^Showing the first/)).toBeNull();
    // Back to everyone.
    fireEvent.click(screen.getByRole("switch", { name: "Rows to fix only" }));
    expect(dataRows()).toBe(200);
    // Only the good rows are created, as before.
    expect(screen.getByRole("button", { name: "Create 1,499 accounts" })).toBeTruthy();
  });

  it("downloads the rows to fix as CSV, with their row in the sheet and what is wrong", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Download rows to fix (CSV)" }));
    expect(m.files.map((f) => f.name)).toEqual(["darsi-rows-to-fix.csv"]);
    const text = await m.files[0].blob.text();
    expect(parseCsv(text.replace(/^﻿/, ""))).toEqual([
      ["#", "Name", "Login", "Role", "Group", "What to fix"],
      ["450", "Pupil 449", "not-an-email", "Student", "", "invalid email"],
    ]);
  });

  it("offers neither the toggle nor the file when no row needs fixing, and no 'first 200' line for a short sheet", async () => {
    page(<ImportPeople />, { url: "/admin/import" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["name,username\nAmina Bello,amina.b\nOmar Said,omar.s"], "people.csv", { type: "text/csv" })] } });
    await screen.findByText("2 people found");
    expect(screen.queryByRole("switch", { name: "Rows to fix only" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download rows to fix (CSV)" })).toBeNull();
    expect(screen.queryByText(/^Showing the first/)).toBeNull();
  });
});

describe("after Add people, and a password reset's results", () => {
  it("forgets the members the dashboard read, so it reads them once when it opens again", async () => {
    page(<AddPeople />);
    await addOne();
    expect(m.forget).toHaveBeenCalledWith("o1");
  });

  it("forgets them after a failed call too: a call whose answer was lost may have made accounts", async () => {
    m.api.createMembers.mockRejectedValue(Object.assign(new Error("internal"), { code: "functions/internal" }));
    page(<AddPeople />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Amina Bello" } });
    fireEvent.click(screen.getByRole("button", { name: "Create accounts" }));
    await waitFor(() => expect(m.forget).toHaveBeenCalledWith("o1"));
  });

  const resets = [
    { row: 1, name: "Amina Bello", login: "amina.b@users.darsi.app", password: "pw-1", uid: "u1", status: "created" as const, role: "student" },
    { row: 2, name: "Omar Said", login: "omar.s@users.darsi.app", uid: "u2", status: "error" as const, error: "refused", role: "student" },
  ];

  it("words new passwords as a reset, on the page and in the downloaded sheet, never as accounts created", async () => {
    page(<Results results={resets} reset />, { url: "/admin/home" });
    expect(screen.getByRole("heading", { name: "New passwords" })).toBeTruthy();
    expect(screen.getByText("1 password reset")).toBeTruthy();
    expect(screen.getByText("1 not reset")).toBeTruthy();
    expect(screen.queryByText("Accounts ready")).toBeNull();
    expect(screen.queryByText(/created/i)).toBeNull();
    expect(screen.getByText("Password reset")).toBeTruthy(); // the row's status
    fireEvent.click(screen.getByRole("button", { name: "Download credentials (Excel)" }));
    await waitFor(() => expect(m.files.length).toBe(1));
    expect(m.files[0].name).toMatch(/^darsi-new-passwords-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [rows, , opts] = m.xlsx.mock.calls[0] as [Array<{ status: string }>, unknown, { sheet: string }];
    expect(rows[0].status).toBe("Password reset");
    expect(opts.sheet).toBe("New passwords");
  });

  it("marks a reset row by itself too, and says it in Arabic", () => {
    page(<Results results={[{ ...resets[0], reset: true }]} />, { lang: "ar", url: "/admin/home" });
    expect(screen.getByRole("heading", { name: "كلمات المرور الجديدة" })).toBeTruthy();
    expect(screen.getByText("أُعيد تعيين كلمة المرور", { selector: "td" })).toBeTruthy();
  });

  it("keeps the created wording for accounts made now", async () => {
    page(<AddPeople />);
    await addOne();
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.queryByText("Password reset")).toBeNull();
  });
});

describe("the forms' strings", () => {
  it("has every string in English and in Arabic, with the same variables, and no middle dot in Arabic", () => {
    expect(Object.keys(ar)).toEqual(Object.keys(en));
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(vars(ar[key]), key).toEqual(vars(en[key]));
      expect(ar[key], key).not.toContain("·");
      expect(ar[key], key).toMatch(/[؀-ۿ]/);
    }
  });
});
