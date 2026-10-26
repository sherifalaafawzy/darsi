/**
 * Mistakes and thresholds: a detector gives each case a score; above the threshold it raises the alarm. Moving the
 * threshold trades false alarms for misses. Which mistake is worse depends on the job, so the best threshold does too.
 */
import { rng } from "../../kit/rng";

export type Job = "smoke" | "spam";
export interface Case { score: number; real: boolean }

/** 30 real cases and 30 harmless ones whose scores overlap, as with any real detector. */
export function cases(job: Job): Case[] {
  const r = rng(job === "smoke" ? 31 : 47), out: Case[] = [];
  const clamp = (x: number) => Math.min(0.99, Math.max(0.01, x));
  for (let i = 0; i < 30; i++) out.push({ score: clamp(0.64 + r.normal() * 0.15), real: true }, { score: clamp(0.36 + r.normal() * 0.15), real: false });
  return out;
}

/** What each mistake costs: a missed fire is far worse than a false alarm; a hidden real email is worse than a spam. */
export const COST: Record<Job, { miss: number; falseAlarm: number }> = { smoke: { miss: 20, falseAlarm: 1 }, spam: { miss: 1, falseAlarm: 5 } };

export function confusion(cs: Case[], t: number) {
  let hit = 0, miss = 0, falseAlarm = 0, quiet = 0;
  for (const c of cs) { const alarm = c.score >= t; if (c.real) alarm ? hit++ : miss++; else alarm ? falseAlarm++ : quiet++; }
  return { hit, miss, falseAlarm, quiet };
}
export const cost = (job: Job, m: ReturnType<typeof confusion>) => m.miss * COST[job].miss + m.falseAlarm * COST[job].falseAlarm;

/** The threshold (in steps of 0.01) with the lowest total cost; the middle one of any tie. */
export function best(job: Job, cs: Case[]) {
  const ts = Array.from({ length: 101 }, (_, i) => i / 100), costs = ts.map((t) => cost(job, confusion(cs, t)));
  const low = Math.min(...costs), at = ts.filter((_, i) => costs[i] === low);
  return at[Math.floor(at.length / 2)];
}

/** The ROC curve: share of real cases caught against share of harmless cases flagged, for every threshold. */
export const roc = (cs: Case[]) => Array.from({ length: 101 }, (_, i) => {
  const m = confusion(cs, 1 - i / 100);
  return [m.falseAlarm / Math.max(1, m.falseAlarm + m.quiet), m.hit / Math.max(1, m.hit + m.miss)] as const;
});
