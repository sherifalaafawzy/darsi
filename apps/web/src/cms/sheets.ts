/**
 * Translations as a spreadsheet, for translators who work offline or in a team: one row per UI string with its key,
 * the English and Arabic text for reference, and a column for the language. ExcelJS loads only when used
 * (admin/importer.ts), and CSV needs nothing extra.
 */
import { readSheet } from "../admin/importer";

export type Strings = Readonly<Record<string, string>>;
/** Header row, then one row per English key. */
export const sheetRows = (code: string, en: Strings, ar: Strings, messages: Strings): string[][] =>
  [["key", "English", "Arabic", code], ...Object.keys(en).map((k) => [k, en[k], ar[k] ?? "", messages[k] ?? ""])];

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export async function sheetXlsx(rows: string[][]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "Darsi";
  const ws = wb.addWorksheet("Strings");
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 48; c.alignment = { wrapText: true, vertical: "top" }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX });
}
/** UTF-8 with a byte-order mark, so Excel opens Arabic and other scripts correctly. */
export function sheetCsv(rows: string[][]): Blob {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return new Blob([String.fromCharCode(0xfeff) + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/**
 * Reads translations back from rows: the key column is the one headed "key" (else the first), and the text column the
 * one headed with the language's code or name (else the last). Empty cells are skipped, so a partial sheet never
 * erases work. Returns what it found; the caller keeps only keys the app has.
 */
export function rowsToMessages(rows: unknown[][], names: string[]): { messages: Record<string, string>; rows: number } {
  const header = (rows[0] ?? []).map((v) => String(v ?? "").trim().toLowerCase());
  const wanted = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const keyCol = Math.max(0, header.indexOf("key"));
  let textCol = header.findIndex((h) => wanted.includes(h));
  if (textCol < 0) textCol = header.length - 1;
  const messages: Record<string, string> = {};
  for (const r of rows.slice(1)) {
    const key = String(r[keyCol] ?? "").trim(), text = String(r[textCol] ?? "").trim();
    if (key && text) messages[key] = text;
  }
  return { messages, rows: Math.max(0, rows.length - 1) };
}

export async function readTranslations(file: File, names: string[]) {
  const sheet = await readSheet(file);
  return rowsToMessages(sheet.rows(0), names);
}
