/**
 * What the two views of the audit log share (an organization's own, admin/OrgActivity.tsx, through the orgAudit
 * callable; the platform's, admin/Ledger.tsx, straight from Firestore): the words for each action, an entry's details
 * as short "key: value" pairs, reading a page at a time with a cursor, and the CSV of what is on the screen.
 */
import { useMemo, useState } from "react";
import type { MessageKey } from "../i18n";
import { useRead, type Read } from "../staff/LoadState";
import { downloadBlob, plainText } from "./importer";
import { isGovKey, k } from "./governanceStrings";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const PAGE = 50;
/**
 * A build-time day as AUDIT_SINCE takes it: a real calendar day written "YYYY-MM-DD", or null for anything else (unset,
 * empty, a typo such as "2026-13-01"), so a bad value says "the day it was introduced" rather than "Invalid Date".
 */
export function auditSince(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  const day = raw.trim();
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : null;
}
/**
 * The day organizations' logs begin (ISO, "2026-11-12"): entries written before the functions passed `orgId` belong to
 * no organization's log (TECHNICAL.md), and nothing was migrated. The release sets it at build
 * time (`VITE_AUDIT_SINCE=2026-11-12` in apps/web/.env.local or the build's environment; it is a constant in the
 * bundle, no read). Unset: the screen says "the day it was introduced" without a date.
 */
export const AUDIT_SINCE: string | null = auditSince(import.meta.env.VITE_AUDIT_SINCE);

/** Account ids (Firebase Auth's) among the values: who acted and whom it was for. "sitesJob" or "webhook" is no account. */
export const isUid = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9]{20,40}$/.test(x);

/**
 * An action's words (governance-strings "gv.act.<id>", one per action the functions write: functions/src audit(…)),
 * or null for one this build doesn't know: the screen then shows the raw id, left to right, rather than nothing.
 */
export function actionWords(action: string, t: T): string | null {
  const key = `gv.act.${action}`;
  return isGovKey(key) ? t(k(key)) : null;
}
export const actionLabel = (action: string, t: T) => actionWords(action, t) ?? action;

/** The longest one value is shown at: a bulk action's 200 account ids would otherwise fill the screen. The CSV has all of it. */
const CUT = 120;
/**
 * An entry's other fields as "key: value, key: value": text as it is, anything else as JSON. Empty ones are left out.
 * Keys stay the functions' own names (they are what a support request quotes), so the whole is shown left to right.
 */
export function detailText(rest: Record<string, unknown>, cut = CUT): string {
  return Object.entries(rest).flatMap(([key, v]) => {
    if (v === null || v === undefined || v === "") return [];
    const s = typeof v === "string" ? v : JSON.stringify(v) ?? "";
    return [`${key}: ${s.length > cut ? `${s.slice(0, cut)}…` : s}`];
  }).join(", ");
}

/**
 * Rows as CSV text: every cell quoted, and one that starts with = + - @ (or a tab or return) gets a leading ' so a
 * spreadsheet shows it as text instead of running it as a formula. The byte-order mark comes first: Excel reads the
 * file as UTF-8 (Arabic names) only with it. The screens' invisible direction marks are taken out.
 */
export function csvText(rows: unknown[][]): string {
  const esc = (v: unknown) => { const s = String(plainText(v) ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
export const downloadCsv = (name: string, rows: unknown[][]) => downloadBlob(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }), name);

export interface Page<R, C> { rows: R[]; next: C | null }
export interface Pages<R> {
  /** The first page's read, with every row read so far as its data: what LoadState takes. */
  q: Read<R[]>;
  /** Is there (maybe) more? Offer "Show more" whenever true, also under an empty list. */
  hasMore: boolean;
  more: () => void;
  moreBusy: boolean;
  moreError?: unknown;
}
/**
 * A list read one page at a time, each page starting after the last one's cursor (never a growing limit, which reads
 * the first pages again each time). `deps` are the filters the server applies: other filters start again from the
 * first page, and so does reload(). One-shot reads only.
 */
export function usePages<R, C>(load: (cursor: C | null) => Promise<Page<R, C>>, deps: unknown[]): Pages<R> {
  const first = useRead(() => load(null), deps);
  // The later pages belong to one first page (the very object): a reload or other filters bring a new one, and these go.
  const [extra, setExtra] = useState<{ of: Page<R, C>; rows: R[]; next: C | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ of: Page<R, C>; error: unknown } | null>(null);
  const head = first.data;
  const mine = extra && extra.of === head ? extra : null;
  const rows = useMemo(() => (head ? [...head.rows, ...(mine?.rows ?? [])] : undefined), [head, mine]);
  const next = mine ? mine.next : head?.next ?? null;
  const more = () => {
    if (!head || next === null || busy) return;
    setBusy(true); setError(null);
    load(next).then(
      (p) => setExtra((e) => ({ of: head, rows: [...(e && e.of === head ? e.rows : []), ...p.rows], next: p.next })),
      (e: unknown) => setError({ of: head, error: e }),
    ).finally(() => setBusy(false));
  };
  return { q: { data: rows, error: first.error, loading: first.loading, reload: first.reload }, hasMore: next !== null, more, moreBusy: busy, moreError: error && error.of === head ? error.error : undefined };
}
