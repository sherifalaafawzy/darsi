/**
 * Which automatic nudge (if any) a person gets today. Pure: no Firebase imports, so it is unit-tested directly.
 * At most one automatic nudge per local day, never on a day they already learned, and silence after 21 quiet days.
 */

export type NudgeKind = "daily0" | "daily1" | "daily2" | "weekGoal" | "streak" | "comeback7" | "comeback21";
export interface Nudge { kind: NudgeKind; n?: number }
export interface NudgeInput {
  tz: string;
  lastLessonAt: string | null;
  createdAt: string | null;
  /** ISO week (UTC) → lessons completed that week. */
  weeks: Record<string, number>;
  weeklyGoal: number;
  lastAutoAt?: string | null;
  comeback7At?: string | null;
  comeback21At?: string | null;
}

const DAY = 864e5;

export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}
const safeTz = (tz: string) => (isValidTz(tz) ? tz : "UTC");

/** Milliseconds for an ISO string, or null when it is missing or not a date. */
export function parseTime(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || !iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    partsCache.set(tz, f);
  }
  return f;
}
/** The wall clock in `tz` at instant `ms`. */
export function wallClock(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) if (type !== "literal") p[type] = Number(value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}
/** Offset of `tz` from UTC at instant `ms`, in milliseconds (Kolkata: +5.5 h). */
export function tzOffset(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}
/** Calendar day in `tz`, as "YYYY-MM-DD". */
export function localDay(ms: number, tz: string): string {
  const w = wallClock(ms, tz);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}
/** A day number (days since 1970-01-01) for the calendar day in `tz`: differences are whole local days. */
function dayNumber(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.year, w.month - 1, w.day) / DAY;
}
/** 1 on January 1st in `tz`. */
export function localDayOfYear(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return (Date.UTC(w.year, w.month - 1, w.day) - Date.UTC(w.year, 0, 1)) / DAY + 1;
}

/**
 * The UTC hour at which the scheduler should nudge someone who chose `hourLocal` in `tz`, for today (in `tz`).
 * It is the first whole UTC hour at or after hourLocal:00 local time, so half-hour zones are never early:
 * 18:00 in Asia/Kolkata (12:30 UTC) gives 13. DST is handled because the offset is taken on the day itself.
 */
export function utcHourFor(hourLocal: number, tz: string, now: Date | number = Date.now()): number {
  const zone = safeTz(tz);
  const ms = typeof now === "number" ? now : now.getTime();
  const w = wallClock(ms, zone);
  const wall = Date.UTC(w.year, w.month - 1, w.day, hourLocal);
  const t1 = wall - tzOffset(wall, zone);
  let t = wall - tzOffset(t1, zone); // second pass settles the offset on a DST change day
  // hourLocal:00 skipped by a spring-forward gap: use the moment just after the gap, never before it.
  if (wallClock(t, zone).hour !== hourLocal) t = Math.max(t, t1);
  return new Date(Math.ceil(t / 36e5) * 36e5).getUTCHours();
}

/** ISO 8601 week of the UTC date, e.g. "2026-W43". Same algorithm as the app's isoWeek, in UTC. */
export function isoWeek(d: Date | number = Date.now()): string {
  const x = new Date(d);
  const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y) / DAY + 1) / 7)).padStart(2, "0")}`;
}

/** Lessons per ISO week (UTC) for the `keep` weeks ending with `now`'s week. Older or unparsable dates are dropped. */
export function recentWeeks(dates: Iterable<string | null | undefined>, now: Date | number = Date.now(), keep = 12): Record<string, number> {
  const base = new Date(now).getTime();
  const wanted = new Set(Array.from({ length: keep }, (_, i) => isoWeek(base - i * 7 * DAY)));
  const out: Record<string, number> = {};
  for (const iso of dates) {
    const t = parseTime(iso);
    if (t === null) continue;
    const wk = isoWeek(t);
    if (wanted.has(wk)) out[wk] = (out[wk] ?? 0) + 1;
  }
  return out;
}

/** Consecutive weeks (ending this or last week) with at least half the goal: the app's streakWeeks rule. */
export function streakWeeks(weeks: Record<string, number>, weeklyGoal: number, now: Date | number = Date.now()): number {
  const goal = Math.max(1, Math.ceil(weeklyGoal / 2));
  let t = new Date(now).getTime(), n = 0;
  if ((weeks[isoWeek(t)] ?? 0) < goal) t -= 7 * DAY;
  while ((weeks[isoWeek(t)] ?? 0) >= goal) { n++; t -= 7 * DAY; }
  return n;
}

const clampGoal = (g: number) => (Number.isFinite(g) ? Math.min(14, Math.max(1, Math.round(g))) : 4);

/** The rules from the push contract, in order. Returns null when today should stay quiet. */
export function pickNudge(input: NudgeInput, now: Date | number = Date.now()): Nudge | null {
  const tz = safeTz(input.tz);
  const nowMs = new Date(now).getTime();
  const today = localDay(nowMs, tz);
  const lastAuto = parseTime(input.lastAutoAt);
  const lastLesson = parseTime(input.lastLessonAt);

  // 1. One automatic nudge per local day.
  if (lastAuto !== null && localDay(lastAuto, tz) === today) return null;
  // 2. They already learned today.
  if (lastLesson !== null && localDay(lastLesson, tz) === today) return null;

  // 3. Comebacks: a flag only counts if it is newer than the last lesson, so learning again resets it.
  const since = lastLesson ?? parseTime(input.createdAt);
  const days = since === null ? Infinity : dayNumber(nowMs, tz) - dayNumber(since, tz);
  const sent = (flag: string | null | undefined) => {
    const t = parseTime(flag);
    return t !== null && (lastLesson === null || t > lastLesson);
  };
  if (days >= 21) return sent(input.comeback21At) ? null : { kind: "comeback21" };
  if (days >= 7) return sent(input.comeback7At) ? null : { kind: "comeback7" };

  // 4. The weekly goal, near the end of the ISO week (Saturday or Sunday, UTC). Only when it's really within reach
  // (at most half the goal left): the message says "You're close", which isn't true with 10 of 12 lessons to go.
  const goal = clampGoal(input.weeklyGoal);
  const weeks = input.weeks ?? {};
  const thisWeek = Number(weeks[isoWeek(nowMs)]) || 0;
  const left = goal - thisWeek;
  const utcDay = new Date(nowMs).getUTCDay();
  if (left > 0 && left <= Math.ceil(goal / 2) && (utcDay === 6 || utcDay === 0)) return { kind: "weekGoal", n: left };

  // 5. A running streak of weeks.
  const streak = streakWeeks(weeks, goal, nowMs);
  if (streak >= 2 && thisWeek < goal) return { kind: "streak", n: streak };

  // 6. A gentle daily reminder, rotating by local day of the year.
  return { kind: `daily${localDayOfYear(nowMs, tz) % 3}` as NudgeKind };
}
