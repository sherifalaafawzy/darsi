/**
 * Retention, the pure part (retention.ts; TECHNICAL.md). The owner decides how long each kind of
 * record is kept: a period is a whole number of days, and a category without one is never touched. Nothing here
 * chooses a period, and there is no default: an empty configuration deletes nothing.
 */
export const DAY = 86400e3;
/** About ten years: a longer period is a typing mistake, and "keep for ever" is simply no period. */
export const MAX_DAYS = 3650;

/** The periods a platform admin may set, in days. */
export const PERIOD_KEYS = ["bugReportsClosedDays", "bugReportsAnyDays", "analyticsDevicesDays", "checkoutsOpenDays", "joinAttemptsDays", "auditDays", "orgExportsDays"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export type Periods = Record<PeriodKey, number | null>;

/** What the job counts and reports by: both problem-report periods delete from the one `bugReports` category. */
export const CATEGORIES = ["bugReports", "analyticsDevices", "checkouts", "joinAttempts", "audit", "orgExports"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Counts = Record<Category, number>;
export const zeroCounts = (): Counts => ({ bugReports: 0, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 });

const isPeriod = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_DAYS;
const noPeriods = (): Periods => ({ bugReportsClosedDays: null, bugReportsAnyDays: null, analyticsDevicesDays: null, checkoutsOpenDays: null, joinAttemptsDays: null, auditDays: null, orgExportsDays: null });

/**
 * What an admin sent, checked: each period a whole number of days from 1 to MAX_DAYS, or null (never delete); a key
 * left out is null. Anything else (0, a fraction, text, a key this code doesn't know) refuses the whole save with
 * null, so a typing mistake can never become a clean-up nobody meant.
 */
export function validatePeriods(v: unknown): Periods | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out = noPeriods();
  for (const [k, days] of Object.entries(v as Record<string, unknown>)) {
    if (!(PERIOD_KEYS as readonly string[]).includes(k)) return null;
    if (days === null || days === undefined) continue;
    if (!isPeriod(days)) return null;
    out[k as PeriodKey] = days;
  }
  return out;
}

/**
 * The stored periods as the job reads them: only a valid period counts. A missing document, a missing key, null, 0 or
 * anything a person edited in by hand that isn't a whole number of days all mean "never touch this category".
 */
export function activePeriods(stored: unknown): Periods {
  const out = noPeriods();
  if (!stored || typeof stored !== "object") return out;
  for (const k of PERIOD_KEYS) { const v = (stored as Record<string, unknown>)[k]; if (isPeriod(v)) out[k] = v; }
  return out;
}

/**
 * The moment (ms) before which each category's records go; a category without a period has no entry. Phones' last
 * day is a "yyyy-mm-dd" text (analytics.ts countDevice), so its cut-off is the UTC day of that moment.
 */
export interface Cutoffs {
  bugReportsClosed?: number; bugReportsAny?: number; analyticsDevices?: string;
  checkoutsOpen?: number; joinAttempts?: number; audit?: number; orgExports?: number;
}
export function cutoffs(periods: Partial<Record<PeriodKey, number | null>>, now: number): Cutoffs {
  const at = (k: PeriodKey) => (isPeriod(periods[k]) ? now - (periods[k] as number) * DAY : undefined);
  const out: Cutoffs = {
    bugReportsClosed: at("bugReportsClosedDays"), bugReportsAny: at("bugReportsAnyDays"),
    analyticsDevices: at("analyticsDevicesDays") === undefined ? undefined : new Date(at("analyticsDevicesDays")!).toISOString().slice(0, 10),
    checkoutsOpen: at("checkoutsOpenDays"), joinAttempts: at("joinAttemptsDays"), audit: at("auditDays"), orgExports: at("orgExportsDays"),
  };
  for (const k of Object.keys(out) as (keyof Cutoffs)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** A stored time as ms: a Firestore Timestamp, a Date, a number or an ISO text; null for anything else. */
export function millis(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis(): number }).toMillis();
  return null;
}
/** Older than the cut-off; a record without a readable time is never old (it stays). */
export const before = (v: unknown, cut: number | undefined) => { const t = millis(v); return cut !== undefined && t !== null && t < cut; };

/** A problem report someone dealt with: only these go by the "closed" period. A new or reopened one waits for the other. */
export const reportClosed = (status: unknown) => status === "fixed" || status === "closed";
/** A checkout nobody paid: left open, or failed at the provider. Paid and refunded ones are the accounts' records. */
export const checkoutAbandoned = (status: unknown) => status === "open" || status === "failed";
/**
 * Audit entries the audit period never deletes:
 * - `publishUnit`: every publish of a unit (content.ts publishDraft). They are the only record of a unit's version
 *   counter when units/{id} doesn't hold it (content.ts lastVersionOf): a unit unpublished before `lastVersion` was
 *   kept, or deleted and made again under the same id. Without them such a unit's next publish would start again at
 *   v1, and unit files are immutable and cached for good on phones: a phone that still holds the old v1.json would
 *   show last year's lessons as the new course. They hold a unit id, a version and who published.
 * - `paymentUnmatched`: money a provider took that matched no checkout (payments.ts unmatched). There is no payments/
 *   document for it, so the entry is Darsi's only record of that money: a provider reference, a checkout id, an amount
 *   and a currency, nothing personal. (`paymentUnapplied` needs no exception: billing.ts recordPayment keeps
 *   payments/{id} with the status "unapplied", which retention never touches.)
 * What stays of a kept entry is what it is kept for: once it is older than the audit period, the address and request
 * id of the call that wrote it are taken off (retention.ts, the trimming source; AUDIT_TRIMMED).
 */
export const auditKept = (action: unknown) => action === "publishUnit" || action === "paymentUnmatched";
/** What a kept audit entry loses once it is older than the audit period: where the call came from (admin.ts audit). */
export const AUDIT_TRIMMED = ["ip", "rid"] as const;
/** A report's screenshot, only where reportBug puts them: a path that points anywhere else is left alone. */
export const shotPath = (p: unknown): string | null => (typeof p === "string" && /^bugReports\/[^/]+$/.test(p) && !p.includes("..") ? p : null);
