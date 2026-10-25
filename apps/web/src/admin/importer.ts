/**
 * Excel/CSV import: read a sheet, guess which column is which, validate rows, produce members for createMembers.
 * Pure functions (no Firebase) so they are unit tested.
 */
import type { MemberInput } from "../auth/api";
import type { Role } from "../auth/types";

export type Field = "name" | "firstName" | "lastName" | "email" | "username" | "role" | "group" | "teacherEmail" | "lang";
export const FIELDS: Field[] = ["name", "firstName", "lastName", "email", "username", "role", "group", "teacherEmail", "lang"];

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s_\-.:]+/g, " ").trim();
/** Header synonyms in English, Arabic and French (extend for new languages). */
const SYNONYMS: Record<Field, string[]> = {
  name: ["name", "full name", "fullname", "student name", "teacher name", "الاسم", "الاسم الكامل", "اسم الطالب", "اسم المعلم", "nom complet", "nom et prénom", "nom"],
  firstName: ["first name", "firstname", "given name", "الاسم الأول", "prénom"],
  lastName: ["last name", "lastname", "surname", "family name", "اسم العائلة", "اللقب", "nom de famille"],
  email: ["email", "e mail", "email address", "mail", "البريد", "البريد الإلكتروني", "الإيميل", "courriel", "adresse email"],
  username: ["username", "user name", "login", "user id", "اسم المستخدم", "identifiant"],
  role: ["role", "type", "position", "الدور", "الصفة", "النوع", "rôle", "fonction"],
  group: ["group", "class", "classroom", "section", "grade", "department", "الصف", "الفصل", "الشعبة", "المجموعة", "القسم", "classe", "groupe"],
  teacherEmail: ["teacher email", "teacher", "teacher e mail", "بريد المعلم", "المعلم", "email enseignant", "enseignant"],
  lang: ["language", "lang", "اللغة", "langue"],
};

export type Mapping = Partial<Record<Field, number>>;

/** Guess the column for each field from the header row. Exact synonym matches win over partial ones. */
export function detectMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  const h = headers.map((x) => norm(String(x ?? "")));
  for (const pass of ["exact", "partial"] as const) {
    for (const f of FIELDS) {
      if (m[f] !== undefined) continue;
      const i = h.findIndex((col, idx) => !used.has(idx) && col && SYNONYMS[f].some((s) => (pass === "exact" ? col === norm(s) : col.includes(norm(s)) && norm(s).length > 3)));
      if (i >= 0) { m[f] = i; used.add(i); }
    }
  }
  // A plain "name" column next to first/last makes no sense: prefer the full name.
  if (m.name !== undefined) { delete m.firstName; delete m.lastName; }
  return m;
}

const ROLE_WORDS: Record<string, Role> = {
  student: "student", pupil: "student", learner: "student", طالب: "student", طالبة: "student", تلميذ: "student", élève: "student", etudiant: "student", étudiant: "student",
  teacher: "teacher", instructor: "teacher", lecturer: "teacher", معلم: "teacher", معلمة: "teacher", مدرس: "teacher", مدرسة: "teacher", أستاذ: "teacher", enseignant: "teacher", professeur: "teacher",
  admin: "orgAdmin", administrator: "orgAdmin", "org admin": "orgAdmin", مشرف: "orgAdmin", مدير: "orgAdmin", administrateur: "orgAdmin",
};
export const parseRole = (v: string, fallback: Role): Role => ROLE_WORDS[norm(v)] ?? fallback;

export interface RowCheck { member: MemberInput; errors: string[]; warnings: string[]; row: number }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/i;

/** Turn sheet rows into members and flag problems (missing name, bad email, duplicates). */
export function buildMembers(rows: unknown[][], mapping: Mapping, opts: { defaultRole: Role; hasHeader: boolean }): RowCheck[] {
  const cell = (r: unknown[], f: Field) => { const i = mapping[f]; if (i === undefined) return ""; const v = r[i]; return v == null ? "" : String(typeof v === "object" && v && "text" in v ? (v as { text: string }).text : v).trim(); };
  const out: RowCheck[] = [];
  const seen = new Map<string, number>();
  rows.slice(opts.hasHeader ? 1 : 0).forEach((r, idx) => {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) return;
    const row = idx + (opts.hasHeader ? 2 : 1);
    const name = cell(r, "name") || [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ");
    const email = cell(r, "email").toLowerCase();
    const username = cell(r, "username").toLowerCase();
    const roleRaw = cell(r, "role");
    const member: MemberInput = { name, role: roleRaw ? parseRole(roleRaw, opts.defaultRole) : opts.defaultRole };
    if (email) member.email = email;
    if (username) member.username = username;
    const g = cell(r, "group"); if (g) member.group = g;
    const te = cell(r, "teacherEmail").toLowerCase(); if (te) member.teacherEmail = te;
    const lg = cell(r, "lang").toLowerCase(); if (lg) member.lang = lg.startsWith("ar") || lg.includes("عرب") ? "ar" : lg.startsWith("fr") ? "fr" : "en";
    const errors: string[] = [], warnings: string[] = [];
    if (!name) errors.push("name");
    if (email && !EMAIL.test(email)) errors.push("email");
    if (username && !USERNAME.test(username)) errors.push("username");
    if (!email && !username) warnings.push("autoUsername");
    if (roleRaw && !ROLE_WORDS[norm(roleRaw)]) warnings.push("role");
    const key = email || username;
    if (key) { if (seen.has(key)) errors.push("duplicate"); else seen.set(key, row); }
    out.push({ member, errors, warnings, row });
  });
  return out;
}

/** Read .xlsx or .csv into rows (ExcelJS is loaded only when an admin opens the importer). */
export async function readSheet(file: File): Promise<{ sheets: string[]; rows: (sheet: number) => unknown[][] }> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    const text = await file.text();
    const rows = parseCsv(text.replace(/^﻿/, ""));
    return { sheets: [file.name], rows: () => rows };
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheets = wb.worksheets.map((w) => w.name);
  return {
    sheets,
    rows: (i) => {
      const ws = wb.worksheets[i]; const out: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => { const vals = row.values as unknown[]; out.push(vals.slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v))); });
      return out;
    },
  };
}

/** Small RFC 4180 CSV parser (quotes, commas, semicolons, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Credentials workbook to hand out (download once; passwords are never stored by Darsi in readable form). */
export async function credentialsXlsx(rows: { name: string; login: string; password?: string; role?: string; group?: string; status: string }[], labels: Record<string, string>): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "Darsi";
  const ws = wb.addWorksheet("Accounts");
  ws.columns = [
    { header: labels.name, key: "name", width: 32 }, { header: labels.login, key: "login", width: 34 }, { header: labels.password, key: "password", width: 18 },
    { header: labels.role, key: "role", width: 14 }, { header: labels.group, key: "group", width: 16 }, { header: labels.status, key: "status", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Template with the expected columns (EN headers + an Arabic example row). */
export async function templateXlsx(): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("People");
  ws.addRow(["name", "email", "username", "role", "group", "teacher_email", "language"]).font = { bold: true };
  ws.addRow(["Amina Bello", "amina.bello@school.org", "", "teacher", "Grade 7", "", "en"]);
  ws.addRow(["منى عبد الرحمن", "", "mona.ar", "student", "الصف السابع", "amina.bello@school.org", "ar"]);
  ws.columns.forEach((c) => { c.width = 24; });
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
