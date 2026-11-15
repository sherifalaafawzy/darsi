// Fixes from the release walk-through of the staff screens: charts that call their tallest bar a total, refusals said
// in the admin's language, exported files with invisible marks, and /results as a dead end.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n";
import adminEn from "../src/admin/strings/en.json";
import adminAr from "../src/admin/strings/ar.json";
import appEn from "../src/i18n/en.json";
import appAr from "../src/i18n/ar.json";

const m = vi.hoisted(() => ({
  auth: { user: { uid: "t1" }, role: "teacher", orgId: "o1", profile: { teach: "primary" } as { teach?: string } | null, profileReady: true } as Record<string, unknown>,
  grant: null as null | { uid: string; units: string[] },
}));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: () => m.auth }));
vi.mock("../src/results/data", () => ({ myGrant: async () => m.grant, courseResults: async () => ({ results: [], work: [] }) }));

const { Bars } = await import("../src/admin/charts");
const { buildMembers, credentialsXlsx, plainText } = await import("../src/admin/importer");
const { refusalText, reasonOf } = await import("../src/admin/refusals");
const { CourseResults } = await import("../src/results/CourseResults");
const { mayHaveResults } = await import("../src/results/who");

const ui = (node: ReactNode, lang = "en") => render(<I18nProvider lang={lang}><MemoryRouter>{node}</MemoryRouter></I18nProvider>);
const week = (v: number[]) => v.map((x, i) => ({ key: `w${i}`, label: `W${i + 1}`, v: x }));

describe("charts", () => {
  it("caption the busiest week as such, never as if it were a total", () => {
    ui(<Bars data={week([3, 32, 5])} label="Lessons" per="week" empty="Nothing yet" />);
    expect(screen.getByText("Busiest week: 32")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Lessons. Busiest week: 32");
    expect(screen.queryByText("40")).toBeNull(); // the sum is no figure of its own
  });
  it("say there is nothing yet instead of a flat chart captioned '1'", () => {
    ui(<Bars data={week([0, 0, 0])} label="Lessons" per="week" empty="No lessons finished in these 12 weeks." />);
    expect(screen.getByText("No lessons finished in these 12 weeks.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/Busiest/)).toBeNull();
  });
  it("name the busiest day in Arabic with Arabic digits", () => {
    ui(<Bars data={week([386, 12])} label="الهواتف" per="day" empty="" />, "ar");
    expect(screen.getByText("أكثر الأيام نشاطًا: ٣٨٦")).toBeTruthy();
  });
});

describe("refusals", () => {
  const fnSource = (f: string) => readFileSync(join(__dirname, "../../../functions/src", f), "utf8");
  const reasons = (src: string) => [...src.matchAll(/reason: "([a-z-]+)"/g)].map((x) => x[1]);
  it("every refusal in the organization and platform functions carries a stable reason code", () => {
    for (const f of ["index.ts", "platform.ts"]) {
      const src = fnSource(f);
      const throws = src.match(/throw new HttpsError\(/g) ?? [];
      const withReason = src.match(/throw new HttpsError\([^;]*\{ reason: [^;]*\);/g) ?? [];
      expect(withReason.length, f).toBe(throws.length);
    }
    for (const r of ["self-role", "self-remove", "self-password", "last-admin", "own-login", "not-member"]) expect(reasons(fnSource("index.ts") + fnSource("platform.ts"))).toContain(r);
  });
  it("puts the ones staff screens meet in the admin's language, with the English words as the fallback", () => {
    const tr = (dict: Record<string, string>) => (k: string) => dict[k] ?? `MISSING ${k}`;
    const en = tr({ ...appEn, ...adminEn } as Record<string, string>), ar = tr({ ...appAr, ...adminAr } as Record<string, string>);
    const err = (reason: string) => Object.assign(new Error("FirebaseError: English words [400]"), { details: { reason } });
    for (const r of ["self-role", "self-remove", "self-password", "last-admin", "own-login", "not-member", "not-org-admin", "not-admin", "not-super", "org-inactive", "bad-role", "no-org", "no-account", "org-name", "confirm-name", "batch-size", "admin-self", "admin-super", "superadmin", "not-yours", "renewing", "missing"]) {
      expect(refusalText(err(r), en as never), r).not.toMatch(/MISSING|English words/);
      expect(refusalText(err(r), ar as never), r).not.toMatch(/MISSING|English words/);
      expect(refusalText(err(r), ar as never), r).toMatch(/[\u0600-\u06FF]{3}/);
    }
    expect(refusalText(err("from-a-newer-server"), en as never)).toBe("English words");
    expect(reasonOf(null)).toBe("");
  });
});

describe("exported files", () => {
  it("leave out the invisible marks names are wrapped in on screen", () => {
    expect(plainText("⁨data-s1⁩ (no longer offered)")).toBe("data-s1 (no longer offered)");
    expect(plainText(7)).toBe(7);
  });
  it("give the credentials workbook a sheet in the admin's language, right to left for Arabic, and no marks", async () => {
    const blob = await credentialsXlsx([{ row: 2, name: "⁨منى⁩", login: "mona.ar", password: "pw", role: "طالب", group: "", status: "أُنشئ" }],
      { row: "#", name: "الاسم", login: "الدخول", password: "كلمة المرور", role: "الدور", group: "الفصل", status: "الحالة" }, { sheet: "الحسابات", rtl: true });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("الحسابات");
    expect(ws.views[0]?.rightToLeft).toBe(true);
    expect(ws.getCell("B2").value).toBe("منى");
  });
  it("don't promise a made-up username for a row that won't be created (no name)", () => {
    const rows = buildMembers([["name", "email", "class"], ["", "", "7A"], ["Sara", "", "7A"]], { name: 0, email: 1, group: 2 }, { defaultRole: "student", hasHeader: true });
    expect(rows[0]).toMatchObject({ errors: ["name"], warnings: [] });
    expect(rows[1]).toMatchObject({ errors: [], warnings: ["autoUsername"] });
  });
});

describe("course results (/results)", () => {
  const CONTENT = { loadCatalog: async () => ({ version: 1, units: [] }) as never, loadUnit: async () => { throw new Error("none"); } };
  const routes = () => ui(<Routes><Route path="/" element={<CourseResults content={CONTENT} />} /><Route path="/me" element={<p>Me page</p>} /></Routes>);

  it("is only for university teachers", () => {
    expect(mayHaveResults("learner", "university")).toBe(true);
    expect(mayHaveResults("teacher", "university")).toBe(true);
    expect(mayHaveResults("teacher", "primary")).toBe(false);
    expect(mayHaveResults("orgAdmin", "university")).toBe(false);
    expect(mayHaveResults("student", undefined)).toBe(false);
  });
  it("sends a school teacher with no access back to Me instead of a dead end", async () => {
    m.auth = { user: { uid: "t1" }, role: "teacher", orgId: "o1", profile: { teach: "primary" }, profileReady: true }; m.grant = null;
    routes();
    expect(await screen.findByText("Me page")).toBeTruthy();
  });
  it("still tells a university teacher waiting for access what will happen", async () => {
    m.auth = { user: { uid: "u1" }, role: "learner", orgId: null, profile: { teach: "university" }, profileReady: true }; m.grant = null;
    routes();
    expect(await screen.findByText("No courses yet")).toBeTruthy();
  });
});
