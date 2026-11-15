import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { I18nProvider } from "../src/i18n";

// /super's records (admin/Ledger.tsx): the audit log with its filters, the payments ledger, and the platform sections
// behind the same switch, each read only when it is opened.
const UID = "AbCdEfGhIjKlMnOpQrStUvWx1234";
type Part = { type: string; f?: string; v?: unknown; c?: { id: string }; n?: number };
type Q = { name: string; parts: Part[] };
const m = vi.hoisted(() => ({
  queries: [] as { name: string; parts: { type: string; f?: string; v?: unknown; c?: { id: string }; n?: number }[] }[],
  gets: [] as string[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  docs: {} as Record<string, Record<string, unknown>>,
  downloads: [] as { blob: Blob; name: string }[],
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn() }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  where: (f: string, _op: string, v: unknown) => ({ type: "where", f, v }),
  orderBy: (f: string) => ({ type: "orderBy", f }),
  startAfter: (c: { id: string }) => ({ type: "startAfter", c }),
  limit: (n: number) => ({ type: "limit", n }),
  query: (name: string, ...parts: Part[]) => ({ name, parts }),
  // A small stand-in for the query: the equality filters, then the cursor, then the limit.
  getDocs: async (q: Q) => {
    m.queries.push(q);
    let all = (m.rows[q.name] ?? []).map((r, i) => ({ id: `d${i}`, data: () => r }));
    for (const p of q.parts) if (p.type === "where") all = all.filter((d) => d.data()[p.f!] === p.v);
    const after = q.parts.find((p) => p.type === "startAfter")?.c;
    if (after) all = all.slice(all.findIndex((d) => d.id === after.id) + 1);
    return { docs: all.slice(0, q.parts.find((p) => p.type === "limit")?.n ?? all.length) };
  },
  getDoc: async (path: string) => { m.gets.push(path); const d = m.docs[path]; return { id: path.split("/").pop(), exists: () => !!d, data: () => d, get: (f: string) => d?.[f] }; },
}));
vi.mock("../src/admin/data", async (orig) => ({ ...(await orig<typeof import("../src/admin/data")>()), useNames: () => ({ data: { [UID]: "Amina Bello" } }) }));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: (blob: Blob, name: string) => { m.downloads.push({ blob, name }); } }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: {} }));

const { Ledger } = await import("../src/admin/Ledger");
const page = (lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter><Ledger /></MemoryRouter></I18nProvider>);
const auditQueries = () => m.queries.filter((q) => q.name === "audit");
// The words for an action are in the table and in the Action menu: these look in the table.
const table = () => within(screen.getByRole("table"));
const inTable = async (text: string) => within(await screen.findByRole("table")).findByText(text);
const bytes = (blob: Blob) => new Promise<Uint8Array>((done) => { const fr = new FileReader(); fr.onload = () => done(new Uint8Array(fr.result as ArrayBuffer)); fr.readAsArrayBuffer(blob); });

beforeEach(() => {
  m.queries = []; m.gets = []; m.downloads = [];
  m.docs = { "orgs/o1": { name: "Nile School" } };
  m.rows = {
    audit: [
      { action: "setUserRole", by: UID, uid: "x", role: "teacher", at: { seconds: 1793700000 } },
      { action: "regenerateInviteCode", by: UID, orgId: "o1", role: "student", at: { seconds: 1793600000 } },
      { action: "siteLost", by: "sitesJob", orgId: "o2", host: "learn.school.edu", at: { seconds: 1793500000 } },
      { action: "somethingNew", by: UID, at: { seconds: 1793400000 } },
    ],
    payments: [{ provider: "paymob", kind: "subscription", plan: "super-month", uid: UID, amount: 150, currency: "EGP", status: "refunded", at: { seconds: 1793700000 } }],
  };
});

describe("records for platform admins", () => {
  it("an organization opened from the log comes Back to the Records tab", async () => {
    const At = () => <p data-testid="back">{(useLocation().state as { back?: string } | null)?.back}</p>;
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/super?tab=records"]}><Routes>
      <Route path="/super" element={<Ledger />} /><Route path="/super/orgs/:id" element={<At />} />
    </Routes></MemoryRouter></I18nProvider>);
    // A seat licence's payment names the organization, not a person.
    m.rows.payments = [{ provider: "paymob", kind: "licence", plan: "seats", orgId: "o2", amount: 900, currency: "EGP", status: "paid", at: { seconds: 1793700000 } }];
    fireEvent.click(screen.getByRole("button", { name: "Payments" }));
    fireEvent.click(await screen.findByRole("link", { name: "o2" }));
    expect(screen.getByTestId("back").textContent).toBe("/super?tab=records");
  });

  it("reads nothing until a list is opened, then shows who did what in words", async () => {
    page();
    expect(m.queries).toEqual([]);
    expect(m.gets).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    expect(await inTable("Role or organization changed")).toBeTruthy();
    expect(m.queries.map((q) => q.name)).toEqual(["audit"]);
    // No organization chosen: no condition on it, the newest 50 by time.
    expect(m.queries[0].parts).toEqual([{ type: "orderBy", f: "at" }, { type: "limit", n: 50 }]);
    expect(screen.getAllByRole("link", { name: "Amina Bello" })[0].getAttribute("href")).toBe(`/super/people/${UID}`);
    expect(screen.getByText("uid: x, role: teacher")).toBeTruthy();
    expect(table().getByText("New invite code made")).toBeTruthy();
    // An action this build has no words for still shows, as its id.
    expect(table().getByText("somethingNew")).toBeTruthy();
    // The raw id stays within reach of the words.
    expect(table().getByText("Role or organization changed").getAttribute("title")).toBe("setUserRole");
  });

  it("puts the chosen organization into the query, picked by name or typed as an id", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    await inTable("New invite code made");
    // The organizations seen in the log are offered by name (read once each).
    const pick = screen.getByRole("combobox", { name: "Organization" });
    await within(pick).findByRole("option", { name: "Nile School" });
    expect(m.gets.filter((p) => p === "orgs/o1")).toHaveLength(1);
    fireEvent.change(pick, { target: { value: "o1" } });
    await waitFor(() => expect(auditQueries()).toHaveLength(2));
    expect(auditQueries()[1].parts).toEqual([{ type: "where", f: "orgId", v: "o1" }, { type: "orderBy", f: "at" }, { type: "limit", n: 50 }]);
    await waitFor(() => expect(table().queryByText("Role or organization changed")).toBeNull());
    expect(table().getByText("New invite code made")).toBeTruthy();
    // The other organizations stay in the menu while one is chosen.
    expect(within(pick).getByRole("option", { name: "o2" })).toBeTruthy();

    // An id nobody listed: typed, then Enter.
    const box = screen.getByRole("searchbox", { name: "Or an organization ID" });
    fireEvent.change(box, { target: { value: " o9 " } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(auditQueries()).toHaveLength(3));
    expect(auditQueries()[2].parts[0]).toEqual({ type: "where", f: "orgId", v: "o9" });
    expect(await screen.findByText("Nothing matches these filters.")).toBeTruthy();
  });

  it("filters the loaded entries by action and by person without reading again", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    await inTable("Role or organization changed");
    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "siteLost" } });
    expect(table().getByText("Web address stopped working")).toBeTruthy();
    expect(table().queryByText("Role or organization changed")).toBeNull();
    expect(screen.getByText("Entries shown: 1")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Person" }), { target: { value: "sitesJob" } });
    expect(table().getByText("Web address stopped working")).toBeTruthy();
    expect(table().queryByText("New invite code made")).toBeNull();
    expect(auditQueries()).toHaveLength(1);
  });

  it("shows more with a cursor after the last entry, never a larger limit", async () => {
    m.rows.audit = Array.from({ length: 60 }, (_, i) => ({ action: "setUserRole", by: UID, n: i, at: { seconds: 1793700000 - i } }));
    page();
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    expect(await screen.findByText("Entries shown: 50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Entries shown: 60")).toBeTruthy();
    expect(auditQueries()).toHaveLength(2);
    expect(auditQueries()[1].parts).toEqual([{ type: "orderBy", f: "at" }, { type: "startAfter", c: expect.objectContaining({ id: "d49" }) }, { type: "limit", n: 50 }]);
    // The second page was the last one.
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("downloads what is shown as a CSV that starts with a byte-order mark", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Activity log" }));
    await inTable("Role or organization changed");
    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "setUserRole" } });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(m.downloads).toHaveLength(1);
    expect(m.downloads[0].name).toBe("darsi-activity.csv");
    const raw = await bytes(m.downloads[0].blob);
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(raw).split("\r\n");
    expect(lines[0]).toBe('"When","Who","Account ID","Action","Action ID","Organization ID","Details"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"Amina Bello","${UID}","Role or organization changed","setUserRole","","uid: x, role: teacher"`);
  });

  it("names the actions and the sections in Arabic", async () => {
    page("ar");
    expect(screen.getByRole("button", { name: "الصفحات القانونية" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الاحتفاظ بالبيانات" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "سجل النشاط" }));
    expect(await inTable("تغيير الدور أو المؤسسة")).toBeTruthy();
    expect(table().getByText("إنشاء رمز دعوة جديد")).toBeTruthy();
    expect(table().getByText("توقّف عنوان الموقع عن العمل")).toBeTruthy();
    expect(within(screen.getByRole("combobox", { name: "الإجراء" })).getByRole("option", { name: "تغيير الدور أو المؤسسة" })).toBeTruthy();
  });

  it("lists payments with their amount and status, in Arabic too", async () => {
    page("ar");
    fireEvent.click(screen.getByRole("button", { name: "المدفوعات" }));
    expect(await screen.findByText("مستردّة")).toBeTruthy();
    expect(screen.getByText(/١٥٠/)).toBeTruthy();
    expect(m.queries.map((q) => q.name)).toEqual(["payments"]);
    expect(m.queries[0].parts).toEqual([{ type: "orderBy", f: "at" }, { type: "limit", n: 50 }]);
  });

  it("mounts the platform sections only when chosen, and keeps an editor's text while another section shows", async () => {
    m.docs["config/legal"] = { privacy: { draft: { en: "Old text" } } };
    page();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Activity log", "Payments", "Legal pages", "Data retention", "Status"]);
    fireEvent.click(screen.getByRole("button", { name: "Legal pages" }));
    const box = await screen.findByLabelText("Privacy notice: English text");
    expect(m.gets).toEqual(["config/legal"]);
    fireEvent.change(box, { target: { value: "Typed and not saved" } });
    // Status reads its own documents, and only now.
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(await screen.findByText("Scheduled jobs")).toBeTruthy();
    expect(m.gets).toContain("stats/jobs");
    expect(m.gets).toContain("stats/csp");
    expect(box.isConnected && box.closest("[hidden]")).toBeTruthy(); // hidden, not gone
    fireEvent.click(screen.getByRole("button", { name: "Legal pages" }));
    expect((screen.getByLabelText("Privacy notice: English text") as HTMLTextAreaElement).value).toBe("Typed and not saved");
    // Coming back read nothing again.
    expect(m.gets.filter((p) => p === "config/legal")).toHaveLength(1);
    expect(screen.queryByText("Scheduled jobs")).toBeNull();
  });

  it("shows the retention periods again, with their question, when someone leaves with unsaved ones behind another section", async () => {
    m.docs["config/retention"] = { periods: { auditDays: 365 } };
    render(<I18nProvider lang="en"><MemoryRouter initialEntries={["/super"]}><Link to="/super/people">People</Link><Ledger /></MemoryRouter></I18nProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Data retention" }));
    const field = await screen.findByLabelText("Problem reports of any status: days kept");
    fireEvent.change(field, { target: { value: "90" } });
    // Another section: the periods stay mounted, hidden, as typed.
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(await screen.findByText("Scheduled jobs")).toBeTruthy();
    expect(field.isConnected && field.closest("[hidden]")).toBeTruthy();
    // On the way out the link is held, and the section that asks is on the screen again (it let the tap through before).
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(ask.closest("[hidden]")).toBeNull();
    expect(screen.getByRole("button", { name: "Data retention" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Scheduled jobs")).toBeNull();
    fireEvent.click(within(ask).getByRole("button", { name: "Stay here" }));
    expect((screen.getByLabelText("Problem reports of any status: days kept") as HTMLInputElement).value).toBe("90");
  });
});
