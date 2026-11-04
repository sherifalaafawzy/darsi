/**
 * users/{uid}.summary from the person's progress docs: what org admins, teachers and the platform's analytics read
 * (TECHNICAL.md "Organization analytics"). Pure, so the trigger, scripts/demo-org.mjs and the tests share it.
 */
import { recentWeeks } from "./nudge.js";

export interface ProgressRow { accuracy?: unknown; xp?: unknown; seconds?: unknown; completedAt?: unknown; unitId?: unknown; track?: unknown; competencies?: unknown }
export interface Summary {
  lessonsDone: number; xp: number; avgAccuracy: number; lastActive: string | null;
  /** Lessons per competency (the evidence count), and their accuracy summed (divide by the count for the average). */
  competencies: Record<string, number>; compAcc: Record<string, number>;
  /** Lessons finished per course. */
  units: Record<string, number>;
  /** Per track: lessons, accuracy summed, seconds. */
  tracks: Record<string, { n: number; acc: number; sec: number }>;
  /** Time in finished lessons, in seconds. */
  seconds: number;
  /** Lessons per ISO week (UTC), the last 12 weeks. */
  weeks: Record<string, number>;
  lastLessonAt: string | null;
}

const num = (v: unknown, max = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function summarize(rows: ProgressRow[], now: Date | number = Date.now()): Summary {
  const competencies: Record<string, number> = {}, compAcc: Record<string, number> = {};
  const units: Record<string, number> = {};
  const tracks: Summary["tracks"] = {};
  const completed: string[] = [];
  let xp = 0, accSum = 0, seconds = 0, last = "";
  for (const p of rows) {
    const acc = num(p.accuracy, 1), sec = num(p.seconds, 86400);
    xp += num(p.xp); accSum += acc; seconds += sec;
    if (typeof p.completedAt === "string") { completed.push(p.completedAt); if (p.completedAt > last) last = p.completedAt; }
    if (typeof p.unitId === "string") units[p.unitId] = (units[p.unitId] ?? 0) + 1;
    if (typeof p.track === "string") { const t = (tracks[p.track] ??= { n: 0, acc: 0, sec: 0 }); t.n++; t.acc = r3(t.acc + acc); t.sec += sec; }
    for (const code of Array.isArray(p.competencies) ? p.competencies : []) {
      if (typeof code !== "string") continue;
      competencies[code] = (competencies[code] ?? 0) + 1;
      compAcc[code] = r3((compAcc[code] ?? 0) + acc);
    }
  }
  return {
    lessonsDone: rows.length, xp, avgAccuracy: rows.length ? accSum / rows.length : 0, lastActive: last || null,
    competencies, compAcc, units, tracks, seconds: Math.round(seconds), weeks: recentWeeks(completed, now), lastLessonAt: last || null,
  };
}

/**
 * One lesson result as the summary counts it (H2 and M1 in the security review): the numbers the person sent, typed and
 * capped, with the course, track and competencies taken from the published unit, never from the phone.
 */
export function cleanRow(d: Record<string, unknown> | undefined, meta: { unitId: string; track: string; competencies: string[] }): ProgressRow | null {
  if (!d) return null;
  return {
    accuracy: num(d.accuracy, 1), xp: num(d.xp, 100), seconds: num(d.seconds, 86400),
    ...(typeof d.completedAt === "string" ? { completedAt: d.completedAt.slice(0, 40) } : {}),
    unitId: meta.unitId, track: meta.track, competencies: meta.competencies,
  };
}
/** Whether two rows count the same (a trigger delivered twice, or a write that changed nothing the summary uses). */
// Firestore hands maps back with their keys sorted, so compare with sorted keys.
const canon = (r: ProgressRow | null | undefined) => (r ? JSON.stringify(r, Object.keys(r).sort()) : "null");
export const sameRow = (a: ProgressRow | null | undefined, b: ProgressRow | null | undefined) => canon(a) === canon(b);
