// The governance panels: an organization's activity log (admin/OrgActivity) and join rules (admin/OrgPolicy), the
// platform's legal pages, retention periods and status (admin/LegalAdmin, RetentionAdmin, PlatformStatus), and deleting
// a problem report (admin/Bugs). Callables and Firestore reads are stand-ins; nothing reaches a backend.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import en from "../src/admin/governance-strings/en.json";
import ar from "../src/admin/governance-strings/ar.json";

const m = vi.hoisted(() => ({
  api: {
    orgAudit: vi.fn(), setJoinPolicy: vi.fn(), readmitMember: vi.fn(), manageSso: vi.fn(), saveLegal: vi.fn(),
    saveRetention: vi.fn(), previewRetention: vi.fn(), deleteBugReport: vi.fn(),
  },
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  gets: [] as string[],
  wait: null as Promise<void> | null,
  audit: [] as Record<string, unknown>[],
  queries: 0,
  downloads: [] as { blob: Blob; name: string }[],
  reports: [] as unknown[],
  reload: vi.fn(),
  setStatus: vi.fn(),
  forgot: [] as unknown[],
}));
vi.mock("../src/firebase", () => ({ db: {}, auth: {}, storage: vi.fn(), firebaseReady: true }));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, ...p: string[]) => p.join("/"),
  orderBy: () => ({}), limit: () => ({}), where: () => ({}),
  query: (name: string) => name,
  getDocs: async () => { m.queries++; return { docs: m.audit.map((r, i) => ({ id: `a${i}`, data: () => r })) }; },
  // `m.wait`: a read sent now is answered only when it resolves, with what was stored when it was sent (a slow connection).
  getDoc: async (path: string) => { m.gets.push(path); const d = m.docs[path], w = m.wait; if (w) await w; return { id: path.split("/").pop(), exists: () => !!d, data: () => d, get: (f: string) => d?.[f] }; },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "boss" }, role: "superadmin", orgId: null }) }));
vi.mock("../src/auth/api", async (orig) => ({ ...(await orig<typeof import("../src/auth/api")>()), api: m.api }));
vi.mock("../src/admin/importer", async (orig) => ({ ...(await orig<typeof import("../src/admin/importer")>()), downloadBlob: (blob: Blob, name: string) => { m.downloads.push({ blob, name }); } }));
vi.mock("../src/admin/data", async (orig) => ({
  ...(await orig<typeof import("../src/admin/data")>()),
  useBugReports: () => ({ data: m.reports, reload: m.reload }),
  forgetMembers: (...a: unknown[]) => { m.forgot.push(a); },
  setBugStatus: (...a: unknown[]) => m.setStatus(...a),
  bugShotUrl: async (p: string) => `https://storage.test/${p}`,
}));

const { OrgActivity } = await import("../src/admin/OrgActivity");
const { OrgPolicy } = await import("../src/admin/OrgPolicy");
const { LegalAdmin } = await import("../src/admin/LegalAdmin");
const { RetentionAdmin } = await import("../src/admin/RetentionAdmin");
const { PlatformStatus, jobState, JOBS } = await import("../src/admin/PlatformStatus");
const { BugsPage } = await import("../src/admin/Bugs");
const { csvText, detailText, actionLabel, actionWords } = await import("../src/admin/auditLog");

const show = (ui: React.ReactNode, lang = "en", at = "/admin") => render(<I18nProvider lang={lang}><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></I18nProvider>);
const bytes = (blob: Blob) => new Promise<Uint8Array>((done) => { const fr = new FileReader(); fr.onload = () => done(new Uint8Array(fr.result as ArrayBuffer)); fr.readAsArrayBuffer(blob); });
/** A callable's refusal as the SDK throws it. */
const refusal = (code: string, reason: string, message = "server words") => Object.assign(new Error(message), { code: `functions/${code}`, details: { reason } });
const HOUR = 3600e3;

beforeEach(() => {
  for (const f of Object.values(m.api)) f.mockReset();
  m.docs = {}; m.gets = []; m.wait = null; m.audit = []; m.queries = 0; m.downloads = []; m.reports = []; m.forgot = [];
  m.reload.mockClear(); m.setStatus.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {}); // errorText logs the raw error; the tests read the screen
});
afterEach(() => { vi.restoreAllMocks(); });

describe("the panels' strings", () => {
  it("has every string in English and Arabic, with no middle dot in Arabic", () => {
    expect(Object.keys(ar)).toEqual(Object.keys(en));
    for (const [key, text] of Object.entries(ar)) {
      expect(text, key).not.toContain("·");
      expect(text.trim(), key).not.toBe("");
      // The same placeholders as the English.
      expect([...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort(), key).toEqual([...(en as Record<string, string>)[key].matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort());
    }
  });

  it("has words for every action the functions write to the audit log", () => {
    const dir = resolve(__dirname, "../../../functions/src");
    const src = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
    // audit("name", …), note("name", …) (sites.ts; sso.ts's job names its steps the same way) and the names chosen with
    // ? : before a call. Dotted names too: school sign-in's are "sso.turnOn", "sso.join"…
    const NAME = /"([A-Za-z]+(?:\.[A-Za-z]+)*)"/g;
    const names = new Set([...src.matchAll(/\b(?:audit|note)\(\s*"([A-Za-z]+(?:\.[A-Za-z]+)*)"/g)].map((x) => x[1]));
    // Every name in a choice made inside the call: audit(approve ? "sso.listingApproved" : "sso.listingRefused", …).
    // What a condition compares with (action === "block" ? …) is no name.
    for (const call of src.matchAll(/\baudit\(([^,;\n]*\?[^,;\n]*),/g)) for (const x of call[1].replace(/[!=]==?\s*"[^"]*"/g, "").matchAll(NAME)) names.add(x[1]);
    for (const extra of ["approveOrg", "rejectOrg", "suspendOrg", "resumeOrg", "updateOrg", "siteLost", "siteLive", "approveSite", "siteIdentity", "orgRebrand"]) names.add(extra);
    expect(names.size).toBeGreaterThan(60);
    // The scan itself reads dotted names and the ones chosen in the call.
    for (const seen of ["sso.save", "sso.test", "sso.testLink", "sso.turnOn", "sso.turnOff", "sso.requestListing", "sso.listingApproved", "sso.listingRefused", "sso.allowBack",
      "sso.block", "sso.unblock", "sso.unlink", "sso.setCeiling", "sso.switch", "sso.join", "sso.link", "sso.autoLink", "sso.teacher", "suspendOrg", "siteLost", "approveSite"]) expect(names.has(seen), seen).toBe(true);
    expect([...names].some((a) => a.startsWith("sso") && !a.startsWith("sso."))).toBe(false); // never cut at the dot
    const missing = [...names].filter((a) => !(`gv.act.${a}` in en)).sort();
    // A new audited action needs its words in admin/governance-strings (en and ar), or the log shows its raw id.
    expect(missing).toEqual([]);
  });

  it("words a dotted action in both languages, and shows the raw id of one it doesn't know", () => {
    const t = (lang: Record<string, string>) => (key: string) => lang[key] ?? key;
    expect(actionWords("sso.turnOn", t(en))).toBe("School sign-in turned on");
    expect(actionLabel("sso.listingRefused", t(en))).toBe("Listing in the school finder refused");
    expect(actionWords("sso.turnOn", t(ar))).toBe("تشغيل تسجيل الدخول عبر المدرسة");
    expect(actionWords("sso.join", t(ar))).toMatch(/[\u0600-\u06ff]/);
    expect(actionWords("sso.somethingNew", t(en))).toBeNull();
    expect(actionLabel("sso.somethingNew", t(en))).toBe("sso.somethingNew");
    // A name that only starts like one: not the words of "sso.turnOn".
    expect(actionWords("sso", t(en))).toBeNull();
    expect(actionWords("sso.turnOn.extra", t(en))).toBeNull();
  });
});

describe("the shared pieces", () => {
  it("writes CSV that Excel reads as UTF-8 and never runs as a formula", () => {
    const text = csvText([["Name", "Note"], ["أمينة", '=HYPERLINK("x")'], ["a \"b\"", "⁨isolated⁩"]]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).split("\r\n")).toEqual(['"Name","Note"', '"أمينة","\'=HYPERLINK(""x"")"', '"a ""b""","isolated"']);
  });
  it("shows an entry's details as short pairs, and the raw id of an action it has no words for", () => {
    expect(detailText({ uid: "x", role: "teacher", gone: null, empty: "", n: 0, list: ["a", "b"] })).toBe('uid: x, role: teacher, n: 0, list: ["a","b"]');
    expect(detailText({ uids: "u".repeat(300) })).toHaveLength("uids: ".length + 121);
    expect(actionLabel("notAnAction", (key) => key)).toBe("notAnAction");
    expect(actionLabel("constructor", (key) => key)).toBe("constructor");
  });
});

describe("an organization's activity log", () => {
  const first = {
    entries: [
      { id: "e1", action: "setMemberRole", by: "u1", byName: "Amina Bello", at: 1793700000000, orgId: "o1", uid: "s1", role: "teacher", rid: "ab12cd34" },
      { id: "e2", action: "resetMemberPassword", by: "u2", byName: "Kofi Mensah", at: 1793690000000, orgId: "o1", uid: "s2" },
      { id: "e3", action: "futureThing", by: "sitesJob", byName: "", at: 1793680000000, orgId: "o1" },
    ],
    next: 1793680000000.25,
  };
  const table = () => within(screen.getByRole("table"));

  it("lists entries in words, pages with the callable's cursor, filters by action and downloads a CSV", async () => {
    m.api.orgAudit.mockResolvedValueOnce(first);
    show(<OrgActivity orgId="o1" />);
    expect(await within(await screen.findByRole("table")).findByText("Role changed")).toBeTruthy();
    expect(m.api.orgAudit).toHaveBeenCalledWith({ orgId: "o1", limit: 50 });
    expect(table().getByText("Password reset")).toBeTruthy();
    expect(table().getByText("Amina Bello")).toBeTruthy();
    // No name and no account: something Darsi did by itself. An action without words shows its id.
    expect(table().getByText("Darsi (automatic)")).toBeTruthy();
    expect(table().getByText("futureThing")).toBeTruthy();
    // The details leave out what the row already says (and the organization, the same on every row).
    expect(table().getByText("uid: s1, role: teacher, rid: ab12cd34")).toBeTruthy();
    expect(screen.getByText(/The log starts on/)).toBeTruthy();

    // The next page starts at the answer's `next`.
    m.api.orgAudit.mockResolvedValueOnce({ entries: [{ id: "e4", action: "removeMember", by: "u1", byName: "Amina Bello", at: 1793600000000, orgId: "o1", uid: "s3" }], next: null });
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await table().findByText("Member removed")).toBeTruthy();
    expect(m.api.orgAudit).toHaveBeenLastCalledWith({ orgId: "o1", limit: 50, before: 1793680000000.25 });
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.getByText("Entries shown: 4")).toBeTruthy();

    // The CSV is what is on the screen, with a byte-order mark, and no address column from anywhere.
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(m.downloads[0].name).toBe("darsi-activity-o1.csv");
    const raw = await bytes(m.downloads[0].blob);
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(raw).split("\r\n");
    expect(lines[0]).toBe('"When","Who","Account ID","Action","Action ID","Details"');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe(`"${new Date(1793700000000).toISOString()}","Amina Bello","u1","Role changed","setMemberRole","uid: s1, role: teacher, rid: ab12cd34"`);
    expect(lines.join("\n")).not.toMatch(/\bip\b/);

    // The action filter is the callable's: it reads again from the newest entry, and the other actions stay on offer.
    m.api.orgAudit.mockResolvedValueOnce({ entries: [first.entries[1]], next: null });
    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "resetMemberPassword" } });
    await waitFor(() => expect(m.api.orgAudit).toHaveBeenLastCalledWith({ orgId: "o1", limit: 50, action: "resetMemberPassword" }));
    await waitFor(() => expect(table().queryByText("Role changed")).toBeNull());
    expect(table().getByText("Password reset")).toBeTruthy();
    expect(within(screen.getByRole("combobox", { name: "Action" })).getByRole("option", { name: "Role changed" })).toBeTruthy();

    // In the Person menu people go by name, and a job says which job it is (two could both read "Darsi (automatic)").
    const person = within(screen.getByRole("combobox", { name: "Person" }));
    expect(person.getByRole("option", { name: "Amina Bello" })).toBeTruthy();
    expect(person.getByRole("option", { name: /^Darsi \(automatic\) \(.?sitesJob.?\)$/ })).toBeTruthy();

    // And by person: what they did or what was done to them.
    m.api.orgAudit.mockResolvedValueOnce({ entries: [], next: null });
    fireEvent.change(screen.getByRole("combobox", { name: "Person" }), { target: { value: "u1" } });
    await waitFor(() => expect(m.api.orgAudit).toHaveBeenLastCalledWith({ orgId: "o1", limit: 50, action: "resetMemberPassword", uid: "u1" }));
    expect(await screen.findByText("Nothing matches these filters.")).toBeTruthy();
  });

  it("shows an empty state, not an error, for an organization with no entries yet", async () => {
    m.api.orgAudit.mockResolvedValue({ entries: [], next: null });
    show(<OrgActivity orgId="o1" />);
    expect(await screen.findByText("No changes recorded yet.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect((screen.getByRole("button", { name: "Download CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Show more under an empty page when the scan stopped at its cap", async () => {
    m.api.orgAudit.mockResolvedValueOnce({ entries: [], next: 1793000000000 });
    show(<OrgActivity orgId="o1" />);
    expect(await screen.findByText(/Nothing matches in the entries read so far/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });

  it("says a refusal in the admin's language, with Retry", async () => {
    m.api.orgAudit.mockRejectedValueOnce(refusal("permission-denied", "not-org-admin"));
    show(<OrgActivity orgId="o1" />, "ar");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("server words");
    m.api.orgAudit.mockResolvedValueOnce(first);
    fireEvent.click(within(alert).getByRole("button"));
    // Labels and dates follow the admin's language.
    expect(await within(await screen.findByRole("table")).findByText("تغيير الدور")).toBeTruthy();
    expect(table().getByText("إعادة تعيين كلمة المرور")).toBeTruthy();
    expect(table().getByText("درسي (تلقائي)")).toBeTruthy();
  });
});

describe("an organization's join rules", () => {
  const stored = () => {
    m.docs["orgs/o1/private/invites"] = { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF", policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu"] }, limits: {}, uses: { student: 7 } };
    m.docs["orgs/o1/private/removed"] = { uids: { r1: { at: 1793700000000, name: "Sara Ali" }, r2: { at: 1793600000000, name: "Omar Said" } } };
  };
  const group = (name: string) => within(screen.getByRole("group", { name }));

  it("saves domains and an expiry, sending only what changed, and shows what the server stored", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    expect(await screen.findByText("school.edu")).toBeTruthy();
    expect(m.gets.sort()).toEqual(["orgs/o1/private/invites", "orgs/o1/private/removed"]);
    expect(group("Student code").getByText("Used so far: 7")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save the join rules" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    // A domain is cleaned as the server would; one that isn't a domain is said at the field.
    const box = screen.getByLabelText("Add a domain");
    fireEvent.change(box, { target: { value: "not a domain" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("That doesn't look like a domain. Write it like school.edu.")).toBeTruthy();
    fireEvent.change(box, { target: { value: " @Uni.Example.org " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByText("uni.example.org")).toBeTruthy();
    // Domains without confirmed addresses prove little: the screen says so.
    expect(screen.getByText(/proves nothing about its domain/)).toBeTruthy();

    fireEvent.change(group("Student code").getByLabelText("Last day it works (optional)"), { target: { value: "2099-12-31" } });
    fireEvent.change(group("Teacher code").getByLabelText("Most people who may use it (optional)"), { target: { value: "0" } });
    expect(group("Teacher code").getByText("A whole number, 1 or more.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(group("Teacher code").getByLabelText("Most people who may use it (optional)"), { target: { value: "40" } });
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();

    const expiresAt = new Date(2099, 11, 31, 23, 59, 59, 999).getTime();
    m.api.setJoinPolicy.mockResolvedValueOnce({
      policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu", "uni.example.org"] },
      codes: { teacher: { expiresAt: null, maxUses: 40, uses: 0 }, student: { expiresAt, maxUses: null, uses: 7 } },
    });
    fireEvent.click(save);
    expect(await screen.findByText("Join rules saved.")).toBeTruthy();
    // Not requireVerifiedEmail (unchanged), and no limit that wasn't touched.
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1", allowedDomains: ["school.edu", "uni.example.org"], codes: { teacher: { maxUses: 40 }, student: { expiresAt } } });
    expect(save.disabled).toBe(true);
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
    expect((group("Student code").getByLabelText("Last day it works (optional)") as HTMLInputElement).value).toBe("2099-12-31");
  });

  // An Arabic keyboard's number pad types ٠–٩ (a Persian one ۰–۹), which /^\d+$/ doesn't match (admin/typedNumber.ts).
  it("takes a limit typed in the digits an Arabic keyboard types", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />, "ar");
    await screen.findByText("school.edu");
    const most = (name: string) => group(name).getByLabelText("أقصى عدد لمن يستخدمونه (اختياري)") as HTMLInputElement;
    fireEvent.change(most("رمز الطلاب"), { target: { value: "٣٠" } });
    expect(most("رمز الطلاب").value).toBe("30");
    expect(screen.queryByText("عدد صحيح، ١ أو أكثر.")).toBeNull();
    fireEvent.change(most("رمز المعلمين"), { target: { value: "۴۵" } });
    // Still a whole number of 1 or more, whatever the digits.
    fireEvent.change(most("رمز المعلمين"), { target: { value: "٠" } });
    expect(group("رمز المعلمين").getByText("عدد صحيح، ١ أو أكثر.")).toBeTruthy();
    fireEvent.change(most("رمز المعلمين"), { target: { value: "۴۵" } });
    const save = screen.getByRole("button", { name: "احفظ قواعد الانضمام" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    m.api.setJoinPolicy.mockResolvedValueOnce({
      policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu"] },
      codes: { teacher: { expiresAt: null, maxUses: 45, uses: 0 }, student: { expiresAt: null, maxUses: 30, uses: 7 } },
    });
    fireEvent.click(save);
    expect(await screen.findByText("حُفظت قواعد الانضمام.")).toBeTruthy();
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1", codes: { teacher: { maxUses: 45 }, student: { maxUses: 30 } } });
  });

  it("shows a refusal in words and keeps what was typed", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    fireEvent.click(await screen.findByRole("switch", { name: /Require a confirmed email address/ }));
    m.api.setJoinPolicy.mockRejectedValueOnce(refusal("invalid-argument", "bad-policy"));
    fireEvent.click(screen.getByRole("button", { name: "Save the join rules" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Check the email domains/);
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1", requireVerifiedEmail: true });
    expect(screen.getByRole("switch", { name: /Require a confirmed email address/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("lets a removed person back in: the school's sign-in is asked first, then the codes", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    expect(removed.getByText("Sara Ali")).toBeTruthy();
    expect(removed.getAllByText(/^Removed on /)).toHaveLength(2);
    expect(removed.getByText(/or through your school's sign-in, until you let them back in/)).toBeTruthy();
    // Someone with no school sign-in: the server changes nothing there and says so; the codes let her in again.
    const order: string[] = [];
    m.api.manageSso.mockImplementationOnce(async () => { order.push("allowBack"); return { allowed: false, rejoined: false }; });
    m.api.readmitMember.mockImplementationOnce(async () => { order.push("readmit"); return { ok: true }; });
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    expect((await removed.findByRole("status")).textContent).toMatch(/^.Sara Ali. can join with a code again\.$/);
    expect(order).toEqual(["allowBack", "readmit"]);
    expect(m.api.manageSso).toHaveBeenCalledWith({ action: "allowBack", orgId: "o1", uid: "r1" });
    expect(m.api.readmitMember).toHaveBeenCalledWith({ orgId: "o1", uid: "r1" });
    expect(m.forgot).toEqual([]);
    // She left the list; the other person is still on it.
    expect(removed.queryByRole("button", { name: /Sara Ali/ })).toBeNull();
    expect(removed.getByRole("button", { name: /Omar Said/ })).toBeTruthy();
  });

  it("an account the school's sign-in made goes back in as a student, and the row says so", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    m.api.manageSso.mockResolvedValueOnce({ allowed: true, rejoined: true });
    // allowBack took her off the removed list itself: a failure of the clean-up doesn't undo what was done.
    m.api.readmitMember.mockRejectedValueOnce(refusal("unavailable", ""));
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    expect((await removed.findByRole("status")).textContent).toMatch(/^.Sara Ali. is back in the organization as a student, and your school's sign-in opens the account again\.$/);
    expect(removed.queryByRole("button", { name: /Sara Ali/ })).toBeNull();
    expect(removed.queryByRole("alert")).toBeNull();
    // A member again: the member lists already read are read again when next opened.
    expect(m.forgot).toEqual([["o1"]]);
  });

  it("a person's own account that was connected is only allowed back, by both ways in", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    m.api.manageSso.mockResolvedValueOnce({ allowed: true, rejoined: false });
    m.api.readmitMember.mockResolvedValueOnce({ ok: true });
    fireEvent.click(removed.getByRole("button", { name: /Omar Said/ }));
    expect((await removed.findByRole("status")).textContent).toMatch(/^.Omar Said. can join with a code again, and your school's sign-in no longer keeps them out\.$/);
    expect(m.forgot).toEqual([]);
    expect(removed.queryByRole("button", { name: /Omar Said/ })).toBeNull();
  });

  it("when the school's sign-in can't be let back, nothing else is done and the person stays on the list", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    for (const [reason, words] of [
      ["sso-other-org", /^.Sara Ali. belongs to another organization now, so they can't be let back in here\. They stay on this list\.$/],
      ["sso-staff", /^.Sara Ali. is a platform admin, and platform admins never use a school's sign-in\. They stay on this list\.$/],
      ["sso-org-inactive", /^This organization isn't active, so nobody can be let back in\.$/],
      ["org-suspended", /suspended/],
    ] as const) {
      m.api.manageSso.mockRejectedValueOnce(refusal("failed-precondition", reason, "RAW SERVER WORDS"));
      fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
      await waitFor(() => expect(removed.getByRole("alert").textContent).toMatch(words));
      expect(removed.getByRole("alert").textContent).not.toContain("RAW SERVER WORDS");
    }
    // A failure of the service: the shared words, and still no half-done readmission.
    m.api.manageSso.mockRejectedValueOnce(refusal("unavailable", ""));
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    await waitFor(() => expect(removed.getByRole("alert").textContent).toMatch(/can't be reached right now/));
    expect(m.api.readmitMember).not.toHaveBeenCalled();
    expect(removed.getByRole("button", { name: /Sara Ali/ })).toBeTruthy();
    expect((removed.getByRole("button", { name: /Sara Ali/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a failure of the codes' half keeps the row, to try again", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    m.api.manageSso.mockResolvedValue({ allowed: false, rejoined: false });
    m.api.readmitMember.mockRejectedValueOnce(refusal("unavailable", ""));
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    await waitFor(() => expect(removed.getByRole("alert").textContent).toMatch(/can't be reached right now/));
    expect(removed.getByRole("button", { name: /Sara Ali/ })).toBeTruthy();
    m.api.readmitMember.mockResolvedValueOnce({ ok: true });
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    expect((await removed.findByRole("status")).textContent).toMatch(/can join with a code again\.$/);
  });

  it("a server from before the school's sign-in answered 'nothing to let back' still lets the codes in", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    const removed = within(await screen.findByRole("region", { name: "People who were removed" }));
    m.api.manageSso.mockRejectedValueOnce(refusal("not-found", "no-account"));
    m.api.readmitMember.mockResolvedValueOnce({ ok: true });
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    expect((await removed.findByRole("status")).textContent).toMatch(/^.Sara Ali. can join with a code again\.$/);
  });

  it("says the results in Arabic, with the name isolated", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />, "ar");
    const removed = within(await screen.findByRole("region", { name: ar["gv.pol.removedTitle"] }));
    m.api.manageSso.mockResolvedValueOnce({ allowed: true, rejoined: true });
    m.api.readmitMember.mockResolvedValueOnce({ ok: true });
    fireEvent.click(removed.getByRole("button", { name: /Sara Ali/ }));
    expect((await removed.findByRole("status")).textContent).toBe("عاد \u2068Sara Ali\u2069 إلى المؤسسة بصفة طالب، وعاد تسجيل الدخول عبر المدرسة يفتح الحساب.");
    m.api.manageSso.mockRejectedValueOnce(refusal("failed-precondition", "sso-other-org"));
    fireEvent.click(removed.getByRole("button", { name: /Omar Said/ }));
    await waitFor(() => expect(removed.getByRole("alert").textContent).toBe("ينتمي \u2068Omar Said\u2069 إلى مؤسسة أخرى الآن، فلا يمكن السماح بعودته إلى هنا. يبقى في هذه القائمة."));
  });

  it("starts empty for an organization with no rules and nobody removed", async () => {
    show(<OrgPolicy orgId="o1" />);
    expect(await screen.findByText("No domains: any email address can join.")).toBeTruthy();
    expect(screen.getByText("Nobody has been removed.")).toBeTruthy();
    // No code yet: nothing to limit.
    expect(group("Teacher code").getByText(/has no such code yet/)).toBeTruthy();
  });

  it("offers the limits of an organization's codes that still sit on the organization (not migrated yet)", async () => {
    m.docs["orgs/o1"] = { name: "Old School", inviteCodes: { teacher: "OLDT-0000", student: "OLDS-0000" } };
    // setJoinPolicy with only the organization reads the codes as they are, and writes nothing.
    m.api.setJoinPolicy.mockResolvedValueOnce({
      policy: { requireVerifiedEmail: false, allowedDomains: [] },
      codes: { teacher: { expiresAt: null, maxUses: 30, uses: 4 }, student: { expiresAt: null, maxUses: null, uses: 12 } },
    });
    show(<OrgPolicy orgId="o1" />);
    expect(await screen.findByText("Used so far: 12")).toBeTruthy();
    expect(group("Student code").getByText("Used so far: 12")).toBeTruthy();
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1" });
    expect((group("Teacher code").getByLabelText("Most people who may use it (optional)") as HTMLInputElement).value).toBe("30");
    expect(group("Teacher code").queryByText(/has no such code yet/)).toBeNull();
  });

  it("reads no more than its two documents for a migrated organization", async () => {
    stored();
    show(<OrgPolicy orgId="o1" />);
    await screen.findByText("school.edu");
    expect(m.gets).not.toContain("orgs/o1");
    expect(m.api.setJoinPolicy).not.toHaveBeenCalled();
  });

  it("shows a code made new since it was read as the server starts it: no last day, no limit, no uses", async () => {
    const expiresAt = new Date(2099, 11, 31, 23, 59, 59, 999).getTime();
    m.docs["orgs/o1/private/invites"] = { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF", policy: { requireVerifiedEmail: false, allowedDomains: [] },
      limits: { student: { expiresAt, maxUses: 200 }, teacher: { maxUses: 30 } }, uses: { student: 37, teacher: 4 } };
    const tree = (renewed: { role: "teacher" | "student"; n: number } | null) => <I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><OrgPolicy orgId="o1" renewed={renewed} /></MemoryRouter></I18nProvider>;
    const view = render(tree(null));
    expect(await screen.findByText("Used so far: 37")).toBeTruthy();
    const last = (name: string) => group(name).getByLabelText("Last day it works (optional)") as HTMLInputElement;
    const most = (name: string) => group(name).getByLabelText("Most people who may use it (optional)") as HTMLInputElement;
    expect(last("Student code").value).toBe("2099-12-31");
    expect(most("Student code").value).toBe("200");
    // Typed and not saved, on the other code: it stays.
    fireEvent.change(most("Teacher code"), { target: { value: "45" } });
    const reads = m.gets.length;

    // The Invite tab made a new student code (regenerateInviteCode): the old one's limits and uses went with it.
    view.rerender(tree({ role: "student", n: 1 }));
    await waitFor(() => expect(group("Student code").getByText("Used so far: 0")).toBeTruthy());
    expect(last("Student code").value).toBe("");
    expect(most("Student code").value).toBe("");
    expect(group("Student code").getByRole("status").textContent).toBe(en["gv.pol.renewed"]);
    expect(group("Teacher code").queryByRole("status")).toBeNull();
    expect(most("Teacher code").value).toBe("45");
    expect(group("Teacher code").getByText("Used so far: 4")).toBeTruthy();
    expect(m.gets.length).toBe(reads); // nothing was read again

    // Saving sends the teacher's limit only: the student code's empty limits are what is stored, not a change.
    m.api.setJoinPolicy.mockResolvedValueOnce({ policy: { requireVerifiedEmail: false, allowedDomains: [] }, codes: { teacher: { expiresAt: null, maxUses: 45, uses: 4 }, student: { expiresAt: null, maxUses: null, uses: 0 } } });
    fireEvent.click(screen.getByRole("button", { name: "Save the join rules" }));
    expect(await screen.findByText("Join rules saved.")).toBeTruthy();
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1", codes: { teacher: { maxUses: 45 } } });
    expect(group("Student code").queryByRole("status")).toBeNull();

    // A new teacher code while a limit typed for it waits: with nothing else changed, the form is as stored again.
    view.rerender(tree({ role: "teacher", n: 2 }));
    await waitFor(() => expect(group("Teacher code").getByText("Used so far: 0")).toBeTruthy());
    expect(most("Teacher code").value).toBe("");
    expect((screen.getByRole("button", { name: "Save the join rules" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
    // A limit typed for a code and not saved yet goes onto its new code when saved.
    fireEvent.change(most("Teacher code"), { target: { value: "60" } });
    view.rerender(tree({ role: "teacher", n: 3 }));
    await waitFor(() => expect(group("Teacher code").getByRole("status")).toBeTruthy());
    expect(most("Teacher code").value).toBe("60");
    m.api.setJoinPolicy.mockResolvedValueOnce({ policy: { requireVerifiedEmail: false, allowedDomains: [] }, codes: { teacher: { expiresAt: null, maxUses: 60, uses: 0 }, student: { expiresAt: null, maxUses: null, uses: 0 } } });
    fireEvent.click(screen.getByRole("button", { name: "Save the join rules" }));
    await waitFor(() => expect(m.api.setJoinPolicy).toHaveBeenLastCalledWith({ orgId: "o1", codes: { teacher: { maxUses: 60 } } }));
  });

  it("says a new code has no limits in Arabic", async () => {
    stored();
    const tree = (renewed: { role: "teacher" | "student"; n: number } | null) => <I18nProvider lang="ar"><MemoryRouter initialEntries={["/admin"]}><OrgPolicy orgId="o1" renewed={renewed} /></MemoryRouter></I18nProvider>;
    const view = render(tree(null));
    await screen.findByRole("group", { name: ar["gv.pol.studentCode"] });
    view.rerender(tree({ role: "student", n: 1 }));
    await waitFor(() => expect(group(ar["gv.pol.studentCode"]).getByRole("status").textContent).toBe("هذا رمز جديد: يبدأ بلا يوم أخير وبلا حد أقصى. حدِّدهما هنا من جديد إن أردت."));
  });

  // The dashboard's Refresh (and people removed on its People tab) raise `refresh`: the two documents are read once
  // more. Before, the panel kept what it read when its tab was first opened, so someone removed since was missing
  // from "People who were removed", their only place to be let back in, until the whole page was loaded again.
  it("reads again when asked: the removed list and the uses are the new ones, and what is typed and not saved stays (r5-staff-ui-r5)", async () => {
    m.docs["orgs/o1/private/invites"] = { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF", policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu"] }, limits: { teacher: { maxUses: 30 } }, uses: { student: 7 } };
    m.docs["orgs/o1/private/removed"] = { uids: {} };
    const tree = (refresh: number) => <I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><OrgPolicy orgId="o1" refresh={refresh} /></MemoryRouter></I18nProvider>;
    const view = render(tree(0));
    expect(await screen.findByText("Nobody has been removed.")).toBeTruthy();
    expect(m.gets).toHaveLength(2); // the first read only: a count of 0 asks for nothing more
    const most = (name: string) => group(name).getByLabelText("Most people who may use it (optional)") as HTMLInputElement;
    // Typed and not saved: a domain.
    fireEvent.change(screen.getByLabelText("Add a domain"), { target: { value: "uni.example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const save = screen.getByRole("button", { name: "Save the join rules" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    // Meanwhile, on the server: a student was removed on the People tab, three more joined with the code, and
    // another admin gave the teacher code a new limit.
    m.docs["orgs/o1/private/removed"] = { uids: { r9: { at: 1793700000000, name: "Sara Ali" } } };
    m.docs["orgs/o1/private/invites"] = { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF", policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu"] }, limits: { teacher: { maxUses: 50 } }, uses: { student: 10 } };
    view.rerender(tree(1));
    expect(await screen.findByText("Sara Ali")).toBeTruthy();
    // On a phone the row is a card: the person across its top, the date and the button a line each (base.css .data-table).
    expect(Array.from(screen.getByText("Sara Ali").closest("tr")!.querySelectorAll("td")).map((c) => c.getAttribute("data-cell"))).toEqual(["main", "row", "row"]);
    // The name is inside a box of the page's direction (a bare <bdi> as the cell's flex item takes its own text's
    // direction: a Latin name on an Arabic card then started at the far end).
    expect(screen.getByText("Sara Ali").closest("td")!.firstElementChild!.tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: /^Let .Sara Ali. back in$/ })).toBeTruthy();
    expect(screen.queryByText("Nobody has been removed.")).toBeNull();
    expect(m.gets).toHaveLength(4); // one more read of the two documents, no listener
    expect(group("Student code").getByText("Used so far: 10")).toBeTruthy();
    expect(most("Teacher code").value).toBe("50"); // not touched here: what is stored now
    // The domain typed is still there and still unsaved, and Save sends it alone (nothing else differs from what is stored now).
    expect(screen.getByText("uni.example.org")).toBeTruthy();
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    expect(save.disabled).toBe(false);
    m.api.setJoinPolicy.mockResolvedValueOnce({ policy: { requireVerifiedEmail: false, allowedDomains: ["school.edu", "uni.example.org"] }, codes: { teacher: { expiresAt: null, maxUses: 50, uses: 0 }, student: { expiresAt: null, maxUses: null, uses: 10 } } });
    fireEvent.click(save);
    expect(await screen.findByText("Join rules saved.")).toBeTruthy();
    expect(m.api.setJoinPolicy).toHaveBeenCalledWith({ orgId: "o1", allowedDomains: ["school.edu", "uni.example.org"] });

    // The same count again (any other re-render of the dashboard) reads nothing.
    view.rerender(tree(1));
    await Promise.resolve();
    expect(m.gets).toHaveLength(4);
    // Let back in from the list just read, then read again with nobody on it: the list follows.
    m.docs["orgs/o1/private/removed"] = { uids: {} };
    view.rerender(tree(2));
    expect(await screen.findByText("Nobody has been removed.")).toBeTruthy();
    expect(m.gets).toHaveLength(6);
  });

  // Refresh, then "New code" before the read is answered (a slow connection): the answer was read before the new code,
  // and landing after it would show the old code's limit and uses again, which is what `renewed` is there to prevent.
  it("a code made new while a read asked for is still out: the older answer never puts the old code's limits back", async () => {
    const old = { teacher: "AAAA-BBBB-CCCC", student: "DDDD-EEEE-FFFF", policy: { requireVerifiedEmail: false, allowedDomains: [] }, limits: { student: { maxUses: 200 } }, uses: { student: 37 } };
    m.docs["orgs/o1/private/invites"] = old;
    const tree = (refresh: number, renewed: { role: "teacher" | "student"; n: number } | null) => <I18nProvider lang="en"><MemoryRouter initialEntries={["/admin"]}><OrgPolicy orgId="o1" refresh={refresh} renewed={renewed} /></MemoryRouter></I18nProvider>;
    const view = render(tree(0, null));
    expect(await screen.findByText("Used so far: 37")).toBeTruthy();
    const most = () => group("Student code").getByLabelText("Most people who may use it (optional)") as HTMLInputElement;
    expect(most().value).toBe("200");

    // Refresh: the read is sent, and its answer is slow.
    let land!: () => void;
    m.wait = new Promise<void>((r) => { land = r; });
    view.rerender(tree(1, null));
    await waitFor(() => expect(m.gets).toHaveLength(4));
    // Meanwhile a new student code is made: on the server it has no limit and no uses.
    m.wait = null;
    m.docs["orgs/o1/private/invites"] = { ...old, student: "GGGG-HHHH-JJJJ", limits: {}, uses: {} };
    view.rerender(tree(1, { role: "student", n: 1 }));
    await waitFor(() => expect(group("Student code").getByText("Used so far: 0")).toBeTruthy());
    expect(most().value).toBe("");
    await waitFor(() => expect(m.gets).toHaveLength(6)); // asked once more, after the new code
    // The slow answer (the old code's) arrives now: it is not shown.
    land();
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(group("Student code").getByText("Used so far: 0")).toBeTruthy());
    expect(most().value).toBe("");
    expect(screen.queryByText("Used so far: 37")).toBeNull();
    // A new code with no read out asks for nothing.
    view.rerender(tree(1, { role: "teacher", n: 2 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(m.gets).toHaveLength(6);
  });

  it("asks before leaving with unsaved changes", async () => {
    stored();
    show(<><Link to="/admin/elsewhere">Elsewhere</Link><OrgPolicy orgId="o1" /></>);
    fireEvent.click(await screen.findByRole("switch", { name: /Require a confirmed email address/ }));
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Stay here" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("switch", { name: /Require a confirmed email address/ }).getAttribute("aria-checked")).toBe("true");
    // Leaving drops the change: the panel may stay mounted behind another tab, and must not go on holding taps.
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: /Require a confirmed email address/ }).getAttribute("aria-checked")).toBe("false"));
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("the legal pages", () => {
  const stored = () => { m.docs["config/legal"] = { privacy: { draft: { en: "Old privacy text", ar: "نص قديم", fr: "Texte" }, published: { version: 2, at: 1793700000000, by: "x" }, lastVersion: 2 } }; };
  const doc = (name: string) => within(screen.getByRole("group", { name }));

  it("publishes only after the confirmation, and shows the new version", async () => {
    stored();
    show(<LegalAdmin />);
    expect(await screen.findByText(/^Published: version 2, /)).toBeTruthy();
    expect(m.gets).toEqual(["config/legal"]);
    // The wording is the lawyer's, said plainly; the screen offers none.
    expect(screen.getByText("Darsi supplies no wording. The text of both pages must come from your organization's lawyer.")).toBeTruthy();
    expect(doc("Terms of use").getByText(/^Not published/)).toBeTruthy();
    expect((doc("Terms of use").getByLabelText("Terms of use: English text") as HTMLTextAreaElement).value).toBe("");
    // A language this screen doesn't edit stays in the draft.
    expect(doc("Privacy notice").getByText(/other languages \(.*fr.*\)/)).toBeTruthy();

    const box = doc("Privacy notice").getByLabelText("Privacy notice: English text") as HTMLTextAreaElement;
    expect(box.value).toBe("Old privacy text");
    expect(box.getAttribute("dir")).toBe("auto");
    fireEvent.change(box, { target: { value: "New privacy text" } });
    fireEvent.click(doc("Privacy notice").getByRole("button", { name: "Publish" }));
    const ask = screen.getByRole("alertdialog", { name: "Publish this version of the Privacy notice?" });
    expect(within(ask).getByText("Everyone will see this version; new sign-ups will be asked to accept it.")).toBeTruthy();
    expect(m.api.saveLegal).not.toHaveBeenCalled();
    // Cancelled: nothing is sent, and the text stays.
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.saveLegal).not.toHaveBeenCalled();
    expect(box.value).toBe("New privacy text");

    m.api.saveLegal.mockResolvedValueOnce({ version: 3 });
    fireEvent.click(doc("Privacy notice").getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Published as version 3.")).toBeTruthy();
    expect(m.api.saveLegal).toHaveBeenCalledWith({ doc: "privacy", text: { en: "New privacy text", ar: "نص قديم" }, publish: true });
    expect(doc("Privacy notice").getByText(/^Published: version 3, /)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Nothing was read again for it.
    expect(m.gets).toEqual(["config/legal"]);
  });

  it("saves a draft without publishing, and needs English before Publish", async () => {
    stored();
    show(<LegalAdmin />);
    const terms = () => doc("Terms of use");
    await screen.findByText(/^Published: version 2, /);
    expect((terms().getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
    expect((terms().getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(terms().queryByRole("button", { name: "Unpublish" })).toBeNull();
    fireEvent.change(terms().getByLabelText("Terms of use: Arabic text"), { target: { value: "شروط" } });
    expect(terms().getByText(/Write the English text before publishing/)).toBeTruthy();
    m.api.saveLegal.mockResolvedValueOnce({ version: null });
    fireEvent.click(terms().getByRole("button", { name: "Save draft" }));
    expect(await terms().findByText("Draft saved. Nothing changed for readers.")).toBeTruthy();
    expect(m.api.saveLegal).toHaveBeenCalledWith({ doc: "terms", text: { en: "", ar: "شروط" } });
    expect(terms().getByText(/^Not published/)).toBeTruthy();
  });

  it("unpublishes after a question, and says a refusal in words", async () => {
    stored();
    show(<LegalAdmin />);
    await screen.findByText(/^Published: version 2, /);
    const privacy = () => doc("Privacy notice");
    m.api.saveLegal.mockRejectedValueOnce(refusal("internal", "legal-file"));
    fireEvent.click(privacy().getByRole("button", { name: "Unpublish" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Unpublish the Privacy notice?" })).getByRole("button", { name: "Unpublish" }));
    // "legal-file": the change is recorded but the public page wasn't written. Said as that (not as a generic
    // failure), and what shows as published stays what readers still see; doing it again writes the page.
    const failed = (await privacy().findByRole("alert")).textContent ?? "";
    expect(failed).not.toContain("server words");
    expect(failed).toMatch(/^This was recorded, but the public page could not be updated/);
    expect(privacy().getByText(/^Published: version 2, /)).toBeTruthy();
    m.api.saveLegal.mockResolvedValueOnce({ version: null });
    fireEvent.click(privacy().getByRole("button", { name: "Unpublish" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Unpublish" }));
    expect(await privacy().findByText("Unpublished. The draft is kept.")).toBeTruthy();
    expect(m.api.saveLegal).toHaveBeenLastCalledWith({ doc: "privacy", unpublish: true });
    expect(privacy().getByText(/^Not published/)).toBeTruthy();
  });

  it("treats a publish whose public page wasn't written as saved but not yet shown", async () => {
    stored();
    show(<LegalAdmin />);
    await screen.findByText(/^Published: version 2, /);
    const privacy = () => doc("Privacy notice");
    fireEvent.change(privacy().getByLabelText("Privacy notice: English text"), { target: { value: "Newer text" } });
    m.api.saveLegal.mockRejectedValueOnce(refusal("internal", "legal-file"));
    fireEvent.click(privacy().getByRole("button", { name: "Publish" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Publish" }));
    expect((await privacy().findByRole("alert")).textContent).toMatch(/^This was recorded, but the public page could not be updated/);
    // The draft did get saved (the server writes it before the page), so nothing is unsaved any more; readers still see version 2.
    expect(privacy().queryByText("You have unsaved changes.")).toBeNull();
    expect((privacy().getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(privacy().getByText(/^Published: version 2, /)).toBeTruthy();
    expect((privacy().getByLabelText("Privacy notice: English text") as HTMLTextAreaElement).value).toBe("Newer text");
  });

  it("guards unsaved text, and tells whoever hides the section", async () => {
    stored();
    const onAsk = vi.fn();
    show(<><Link to="/super/people">People</Link><LegalAdmin onAsk={onAsk} /></>, "en", "/super");
    fireEvent.change(await screen.findByLabelText("Privacy notice: Arabic text"), { target: { value: "نص جديد" } });
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(onAsk).toHaveBeenCalled();
    // Leaving puts the box back to the saved draft.
    fireEvent.click(within(ask).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect((screen.getByLabelText("Privacy notice: Arabic text") as HTMLTextAreaElement).value).toBe("نص قديم"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("the retention periods", () => {
  const stored = () => {
    m.docs["config/retention"] = { periods: { auditDays: 365, joinAttemptsDays: 0 } };
    m.docs["stats/jobs"] = { retentionJob: { at: Date.now() - HOUR, ok: false, stopped: true, deleted: { bugReports: 4, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 }, failed: ["orgExports"] } };
  };
  const ANY = "Problem reports of any status: days kept";
  const typed = (over: Record<string, number>) => ({ bugReportsClosedDays: null, bugReportsAnyDays: null, analyticsDevicesDays: null, checkoutsOpenDays: null, joinAttemptsDays: null, auditDays: 365, orgExportsDays: null, ...over });
  const zero = { bugReports: 0, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 };

  it("guards unsaved periods as the legal pages do, and tells whoever hides the section", async () => {
    stored();
    const onAsk = vi.fn();
    show(<><Link to="/super/people">People</Link><RetentionAdmin onAsk={onAsk} /></>, "en", "/super");
    fireEvent.change(await screen.findByLabelText(ANY), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(onAsk).toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Stay here" }));
    expect((screen.getByLabelText(ANY) as HTMLInputElement).value).toBe("90");
    // Leaving puts the fields back to what is saved: the section stays mounted behind another one.
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect((screen.getByLabelText(ANY) as HTMLInputElement).value).toBe(""));
    expect(m.api.saveRetention).not.toHaveBeenCalled();
  });

  it("holds no tap while hidden with nobody to show it", async () => {
    stored();
    show(<><Link to="/super/people">People</Link><div hidden><RetentionAdmin /></div></>, "en", "/super");
    fireEvent.change(await screen.findByLabelText(ANY), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("link", { name: "People" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("shows the counts before saving, and saves nothing when cancelled", async () => {
    stored();
    show(<RetentionAdmin />);
    const any = await screen.findByLabelText(ANY) as HTMLInputElement;
    expect(m.gets.sort()).toEqual(["config/retention", "stats/jobs"]);
    // Every field is empty unless a period was saved: the screen chooses none. A stored 0 is "never", as the job reads it.
    expect(any.value).toBe("");
    expect((screen.getByLabelText("Audit entries: days kept") as HTMLInputElement).value).toBe("365");
    expect((screen.getByLabelText("Join tries: days kept") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByPlaceholderText("Kept until deleted by hand")).toHaveLength(7);
    // The last run, from the job's heartbeat.
    expect(screen.getByText(/^Last clean-up: /)).toBeTruthy();
    expect(screen.getByText("It deleted: problem reports: 4")).toBeTruthy();
    expect(screen.getByText(/These kinds failed.*export files/)).toBeTruthy();
    expect(screen.getByText(/It ran out of time/)).toBeTruthy();

    const save = screen.getByRole("button", { name: "Check and save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(any, { target: { value: "4000" } });
    expect(screen.getByText("A whole number of days from 1 to 3,650, or empty.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(any, { target: { value: "30" } });

    m.api.previewRetention.mockResolvedValueOnce({ counts: { ...zero, bugReports: 12, audit: 3 }, partial: false });
    fireEvent.click(save);
    expect(await screen.findByText("This would delete 12 now: problem reports, with their screenshots")).toBeTruthy();
    expect(screen.getByText("This would delete 3 now: audit entries")).toBeTruthy();
    expect(screen.queryByText(/analytics device IDs$/)).toBeNull();
    expect(m.api.previewRetention).toHaveBeenCalledWith({ periods: typed({ bugReportsAnyDays: 30 }) });
    expect(m.api.saveRetention).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog", { name: "Save these periods?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Nothing was saved.")).toBeTruthy();
    expect(m.api.saveRetention).not.toHaveBeenCalled();
    expect(any.value).toBe("30");

    // Again, and this time yes.
    m.api.previewRetention.mockResolvedValueOnce({ counts: { ...zero, bugReports: 12 }, partial: false });
    m.api.saveRetention.mockResolvedValueOnce({ periods: typed({ bugReportsAnyDays: 30 }) });
    fireEvent.click(save);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save and let the clean-up delete them" }));
    expect(await screen.findByText("Periods saved.")).toBeTruthy();
    expect(m.api.saveRetention).toHaveBeenCalledWith({ periods: typed({ bugReportsAnyDays: 30 }) });
    expect(save.disabled).toBe(true);
  });

  it("saves at once when nothing would be deleted, and asks when the count ran out of time", async () => {
    stored();
    show(<RetentionAdmin />);
    const any = await screen.findByLabelText(ANY);
    fireEvent.change(any, { target: { value: "90" } });
    m.api.previewRetention.mockResolvedValueOnce({ counts: zero });
    m.api.saveRetention.mockResolvedValueOnce({ periods: typed({ bugReportsAnyDays: 90 }) });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    expect(await screen.findByText("Periods saved.")).toBeTruthy();
    expect(screen.getByText("Nothing would be deleted now.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.change(any, { target: { value: "60" } });
    m.api.previewRetention.mockResolvedValueOnce({ counts: zero, partial: true });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/the real numbers may be higher/)).toBeTruthy();
    expect(m.api.saveRetention).toHaveBeenCalledTimes(1);
  });

  it("drops a count that arrives after the periods were typed again, and saves only what was counted", async () => {
    stored();
    show(<RetentionAdmin />);
    const any = await screen.findByLabelText(ANY) as HTMLInputElement;
    fireEvent.change(any, { target: { value: "30" } });
    let answer!: (v: unknown) => void;
    m.api.previewRetention.mockReturnValueOnce(new Promise((ok) => { answer = ok; }));
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    await waitFor(() => expect(m.api.previewRetention).toHaveBeenCalledTimes(1));
    // Typed again while the count for 30 days is on its way: that count says nothing about 1 day.
    fireEvent.change(any, { target: { value: "1" } });
    answer({ counts: zero, partial: false });
    await waitFor(() => expect((screen.getByRole("button", { name: "Check and save" }) as HTMLButtonElement).getAttribute("aria-busy")).not.toBe("true"));
    expect(m.api.saveRetention).not.toHaveBeenCalled();
    expect(screen.queryByText("Nothing would be deleted now.")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Counted again for what is typed now; the yes saves exactly the periods that count was for.
    m.api.previewRetention.mockResolvedValueOnce({ counts: { ...zero, bugReports: 40 }, partial: false });
    m.api.saveRetention.mockResolvedValueOnce({ periods: typed({ bugReportsAnyDays: 1 }) });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    expect(m.api.previewRetention).toHaveBeenLastCalledWith({ periods: typed({ bugReportsAnyDays: 1 }) });
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save and let the clean-up delete them" }));
    expect(await screen.findByText("Periods saved.")).toBeTruthy();
    expect(m.api.saveRetention).toHaveBeenCalledTimes(1);
    expect(m.api.saveRetention).toHaveBeenCalledWith({ periods: typed({ bugReportsAnyDays: 1 }) });
  });

  // An Arabic keyboard's number pad types ٠–٩ (a Persian one ۰–۹): the same periods, counted and saved as numbers.
  it("takes periods typed in the digits an Arabic keyboard types", async () => {
    stored();
    show(<RetentionAdmin />, "ar");
    const any = await screen.findByLabelText("بلاغات المشكلات أيًّا كانت حالتها: أيام الاحتفاظ") as HTMLInputElement;
    const save = screen.getByRole("button", { name: "افحص ثم احفظ" }) as HTMLButtonElement;
    fireEvent.change(any, { target: { value: "٤٠٠٠" } });
    expect(screen.getByText("عدد صحيح من الأيام من ١ إلى ٣٬٦٥٠، أو فارغ.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(any, { target: { value: "٣٠" } });
    expect(any.value).toBe("30");
    expect(screen.queryByText("عدد صحيح من الأيام من ١ إلى ٣٬٦٥٠، أو فارغ.")).toBeNull();
    expect(save.disabled).toBe(false);
    m.api.previewRetention.mockResolvedValueOnce({ counts: zero, partial: false });
    m.api.saveRetention.mockResolvedValueOnce({ periods: typed({ bugReportsAnyDays: 30 }) });
    fireEvent.click(save);
    expect(await screen.findByText("حُفظت المدد.")).toBeTruthy();
    expect(m.api.previewRetention).toHaveBeenCalledWith({ periods: typed({ bugReportsAnyDays: 30 }) });
    expect(m.api.saveRetention).toHaveBeenCalledWith({ periods: typed({ bugReportsAnyDays: 30 }) });
  });

  it("saves nothing when the count itself fails", async () => {
    show(<RetentionAdmin />);
    fireEvent.change(await screen.findByLabelText(ANY), { target: { value: "30" } });
    expect(screen.getByText("The clean-up hasn't run yet.")).toBeTruthy();
    m.api.previewRetention.mockRejectedValueOnce(refusal("invalid-argument", "bad-periods"));
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Each period is a whole number of days/);
    expect(m.api.saveRetention).not.toHaveBeenCalled();
  });
});

describe("the platform's status", () => {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  it("knows when a job is late", () => {
    const now = Date.now();
    expect(JOBS.map((j) => [j.id, j.lateMs / HOUR])).toEqual([["statsJob", 26], ["dailyNudges", 2], ["sitesJob", 0.5], ["retentionJob", 26], ["ssoJob", 26]]);
    // Every job listed has its name and its interval in both languages.
    for (const j of JOBS) for (const d of [en, ar] as Record<string, string>[]) { expect(d[`gv.stat.job.${j.id}`]).toBeTruthy(); expect(d[`gv.stat.every.${j.id}`]).toBeTruthy(); }
    expect(jobState({ at: now - 25 * HOUR, ok: true }, 26 * HOUR, now)).toBe("ok");
    expect(jobState({ at: now - 27 * HOUR, ok: true }, 26 * HOUR, now)).toBe("late");
    expect(jobState({ at: now - HOUR, ok: false }, 26 * HOUR, now)).toBe("failed");
    expect(jobState({ at: now - HOUR / 4, ok: true, complete: false }, 2 * HOUR, now)).toBe("incomplete");
    expect(jobState(undefined, HOUR, now)).toBe("never");
    expect(jobState({ ok: true }, HOUR, now)).toBe("never");
  });

  it("marks late jobs, lists errors by build, what needs attention and the CSP counts, read once", async () => {
    const now = Date.now();
    m.docs["stats/jobs"] = {
      statsJob: { at: now - 72 * HOUR, ok: true }, dailyNudges: { at: now - HOUR / 6, ok: true, complete: false },
      sitesJob: { at: now - HOUR / 12, ok: true, checked: 3, live: 3 }, retentionJob: { at: now - HOUR, ok: false, error: "quota exceeded" },
      // School sign-in's daily job (functions/src/sso.ts): a step that failed, with which one and the error's kind.
      ssoJob: { at: now - 2 * HOUR, ok: false, sessions: 4, revoked: 1, resealed: 0, moved: 0, kids: ["k1"], error: "org o1: unavailable" },
    };
    m.docs["stats/csp"] = { "script-src-elem": 28, "img-src": 2, at: now - HOUR };
    m.docs[`analytics/${day(now)}`] = { errBuild: { dev: 3, "b-old": 9, other: 1 }, err: { n: 13, k: { error: 13 } } };
    m.docs[`analytics/${day(now - 24 * HOUR)}`] = { errBuild: { "b-old": 2 }, err: { n: 2 } };
    m.audit = [
      { action: "setUserRole", by: "x", uid: "y", at: { seconds: 1793700000 } },
      { action: "siteLost", by: "sitesJob", orgId: "o1", host: "learn.school.edu", status: "problem", ip: "203.0.113.9", at: { seconds: 1793690000 } },
      { action: "paymentUnmatched", by: "webhook", provider: "paymob", ref: "p-1", why: "no-checkout", at: { seconds: 1793680000 } },
    ];
    show(<PlatformStatus />);
    const row = (name: RegExp) => within(screen.getByText(name).closest("tr")!);
    expect(await screen.findByText("Scheduled jobs")).toBeTruthy();
    expect(screen.getByText("dev", { selector: "p code" })).toBeTruthy(); // this build (build.ts: "dev" in tests)

    // A run three days ago is late, whatever it said then; the others say why.
    expect(row(/^Daily statistics/).getByText("Late")).toBeTruthy();
    expect(row(/^Hourly reminders/).getByText("Late: the last run didn't finish")).toBeTruthy();
    expect(row(/^Web address checks/).getByText("On time")).toBeTruthy();
    expect(row(/^Nightly clean-up/).getByText("Late: the last run failed")).toBeTruthy();
    expect(row(/^Nightly clean-up/).getByText("quota exceeded")).toBeTruthy();
    expect(row(/^School sign-in upkeep/).getByText("(every day)")).toBeTruthy();
    expect(row(/^School sign-in upkeep/).getByText("Late: the last run failed")).toBeTruthy();
    expect(row(/^School sign-in upkeep/).getByText("org o1: unavailable")).toBeTruthy();

    // Errors by build, today and yesterday; the build open here is marked.
    const old = within(screen.getByText("b-old").closest("tr")!);
    expect(old.getByText("9")).toBeTruthy();
    expect(old.getByText("2")).toBeTruthy();
    expect(within(screen.getByText("dev", { selector: "td code" }).closest("tr")!).getByText("this build")).toBeTruthy();
    expect(within(screen.getByText("Other builds").closest("tr")!).getByText("1")).toBeTruthy();
    expect(within(screen.getByText("All errors").closest("tr")!).getByText("13")).toBeTruthy();

    // Only the entries someone should act on, in words.
    expect(screen.getByText("Web address stopped working")).toBeTruthy();
    expect(screen.getByText("orgId: o1, host: learn.school.edu, status: problem")).toBeTruthy();
    expect(screen.getByText("Payment without a matching checkout")).toBeTruthy();
    expect(screen.queryByText("Role or organization changed")).toBeNull();

    expect(within(screen.getByText("script-src-elem").closest("tr")!).getByText("28")).toBeTruthy();

    // On a phone each row is a card whose first cell (the job, the build, the directive) goes across its top without
    // a label (base.css .data-table). A job's last run and state (it can carry an error) keep a line each; counts
    // pair up under their labels. The attention list starts with a date, not a name: no hint.
    const hints = (el: HTMLElement) => Array.from(el.closest("tr")!.querySelectorAll("td")).map((c) => c.getAttribute("data-cell"));
    expect(hints(screen.getByText(/^Nightly clean-up/))).toEqual(["main", "row", "row"]);
    expect(hints(screen.getByText("b-old"))).toEqual(["main", null, null]);
    expect(hints(screen.getByText("All errors"))).toEqual(["main", null, null]);
    expect(hints(screen.getByText("script-src-elem"))).toEqual(["main", null]);
    // A card's first line starts where the page's lines start: what is left-to-right whatever the page (a build's id,
    // a directive) is inside a box of the page's direction, never the cell's own flex item (base.css td > :first-child).
    for (const code of ["b-old", "script-src-elem"]) {
      const cell = screen.getByText(code).closest("td")!;
      expect(cell.firstElementChild!.tagName).toBe("SPAN");
      expect(cell.firstElementChild!.hasAttribute("dir")).toBe(false);
    }
    expect(hints(screen.getByText("Web address stopped working"))).toEqual([null, null, null]);
    expect(screen.getByText(/Last report: /)).toBeTruthy();

    // Read once; Refresh reads once more.
    expect(m.gets.sort()).toEqual([`analytics/${day(now - 24 * HOUR)}`, `analytics/${day(now)}`, "stats/csp", "stats/jobs"].sort());
    expect(m.queries).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(m.queries).toBe(2));
    expect(m.gets).toHaveLength(8);
  });

  it("says so when nothing has run and nothing was reported", async () => {
    show(<PlatformStatus />, "ar");
    expect(await screen.findByText("المهام المجدولة")).toBeTruthy();
    expect(screen.getAllByText("متأخرة: لم تعمل قط")).toHaveLength(JOBS.length);
    expect(screen.getByText(/^صيانة تسجيل الدخول عبر المدرسة/).closest("tr")!.textContent).toContain("(كل يوم)");
    expect(screen.getByText("لم يُبلَّغ عن أخطاء اليوم ولا أمس.")).toBeTruthy();
    expect(screen.getByText("لا شيء يحتاج إلى انتباه.")).toBeTruthy();
    expect(screen.getByText("لا تقارير حتى الآن.")).toBeTruthy();
  });
});

describe("deleting a problem report", () => {
  const report = { id: "b1", status: "new", text: "The quiz froze", url: "https://darsiai.org/learn", path: "/learn", createdAt: { seconds: 1793700000 }, user: null, shot: { path: "bugReports/b1.jpg", bytes: 1000, type: "image/jpeg", w: 750, h: 1624 }, details: {} };
  const bugs = (lang = "en") => show(<BugsPage />, lang, "/super/bugs");

  it("deletes after the confirmation, and says so on the page", async () => {
    m.reports = [report];
    bugs();
    fireEvent.click(screen.getByRole("button", { name: "Delete report" }));
    const ask = screen.getByRole("alertdialog", { name: "Delete this report?" });
    expect(within(ask).getByText("The report and its screenshot are removed for good.")).toBeTruthy();
    expect(m.api.deleteBugReport).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.api.deleteBugReport).not.toHaveBeenCalled();

    m.api.deleteBugReport.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete report" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete for good" }));
    expect(await screen.findByText("The report and its screenshot were deleted.")).toBeTruthy();
    expect(m.api.deleteBugReport).toHaveBeenCalledWith({ id: "b1" });
    expect(m.reload).toHaveBeenCalledTimes(1);
  });

  it("shows a failure in the admin's language, not the server's words", async () => {
    m.reports = [report];
    bugs("ar");
    m.api.deleteBugReport.mockRejectedValueOnce(refusal("not-found", "no-report", "That report is not there."));
    fireEvent.click(screen.getByRole("button", { name: "احذف البلاغ" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "أتريد حذف هذا البلاغ؟" })).getByRole("button", { name: "احذف نهائيًا" }));
    expect((await screen.findByRole("alert")).textContent).toBe("هذا البلاغ لم يعد موجودًا. أعد تحميل القائمة.");
    expect(screen.queryByText(/That report is not there/)).toBeNull();
    expect(m.reload).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("holds the other buttons while a status is being saved, and words a failed save", async () => {
    m.reports = [report];
    bugs();
    let fail!: (e: unknown) => void;
    m.setStatus.mockReturnValueOnce(new Promise((_, no) => { fail = no; }));
    fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Close it" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Delete report" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close it" }));
    expect(m.setStatus).toHaveBeenCalledTimes(1);
    fail(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Your account isn't allowed to do this/);
    expect((screen.getByRole("button", { name: "Close it" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
