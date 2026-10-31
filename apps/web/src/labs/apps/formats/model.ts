/**
 * File formats: the same attendance records written three ways, and how many bytes each costs to send.
 * - CSV: the column names once, then one line per record.
 * - JSON: every record repeats every column's name ("date":, "class":…).
 * - Columns (the idea behind Parquet): each column stored together, and a value repeated in a row written once with
 *   its count (run-length), so dates and classes cost almost nothing.
 * Compression is real gzip (CompressionStream), measured on the phone.
 */
import { rng } from "../../kit/rng";

export type Size = "class" | "school" | "term";
export const SIZES: Record<Size, { pupils: number; days: number }> = { class: { pupils: 35, days: 20 }, school: { pupils: 420, days: 20 }, term: { pupils: 420, days: 60 } };
export type Format = "csv" | "json" | "cols";
export const FORMATS: Format[] = ["csv", "json", "cols"];
/** Typical speeds on a busy network, in bits per second. */
export type Net = "2g" | "3g" | "4g";
export const NETS: Record<Net, number> = { "2g": 50_000, "3g": 1_000_000, "4g": 8_000_000 };

export interface Rec { date: string; class: string; pupil: string; status: "present" | "absent" | "late" }
const CLASSES = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B"];
const PER_CLASS = 35;

/** School days (Monday to Friday) from Monday 2 March 2026. */
export function schoolDays(n: number): string[] {
  const out: string[] = [];
  for (let d = Date.UTC(2026, 2, 2); out.length < n; d += 864e5) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) out.push(new Date(d).toISOString().slice(0, 10)); }
  return out;
}

/** One record per pupil per school day, sorted by day then class, as a register would be kept. */
export function records(size: Size, seed = 7): Rec[] {
  const { pupils, days } = SIZES[size], r = rng(seed), out: Rec[] = [];
  const keen = Array.from({ length: pupils }, () => 0.82 + r() * 0.17); // each pupil's usual chance of coming
  for (const date of schoolDays(days))
    for (let p = 0; p < pupils; p++) {
      const x = r();
      out.push({ date, class: CLASSES[Math.floor(p / PER_CLASS)], pupil: `P${String(p + 1).padStart(4, "0")}`, status: x < keen[p] ? "present" : x < keen[p] + 0.03 ? "late" : "absent" });
    }
  return out;
}

export const toCsv = (rs: Rec[]) => ["date,class,pupil,status", ...rs.map((x) => `${x.date},${x.class},${x.pupil},${x.status}`)].join("\n") + "\n";
export const toJson = (rs: Rec[]) => JSON.stringify(rs);

/** Run-length: "present*12" for twelve in a row. */
export function runs(vs: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < vs.length;) { let j = i; while (j < vs.length && vs[j] === vs[i]) j++; out.push(j - i > 1 ? `${vs[i]}*${j - i}` : vs[i]); i = j; }
  return out.join(",");
}
export const toColumns = (rs: Rec[]) => (["date", "class", "pupil", "status"] as const).map((k) => `${k}|${runs(rs.map((x) => x[k]))}`).join("\n") + "\n";

export const write = (f: Format, rs: Rec[]) => (f === "csv" ? toCsv(rs) : f === "json" ? toJson(rs) : toColumns(rs));
export const bytes = (s: string) => new TextEncoder().encode(s).length;

/** gzip size in bytes, or null where the browser can't compress (CompressionStream is missing before Safari 16.4). */
export async function gzipBytes(s: string): Promise<number | null> {
  if (typeof CompressionStream === "undefined") return null;
  const data = new TextEncoder().encode(s);
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } });
  const reader = src.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) return n; n += value.byteLength; }
}

/** Seconds to download on a network, at its typical speed. */
export const seconds = (b: number, net: Net) => (b * 8) / NETS[net];
