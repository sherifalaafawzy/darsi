/**
 * Deciding with numbers, two classic tools. A weighted decision matrix: score each option on each criterion, weigh
 * the criteria by what matters, add up. Expected value: when the outcome is uncertain, weigh each outcome's payoff by
 * its chance and pick the option that is best on average.
 */
export const OPTIONS = ["museum", "farm", "science"] as const;
export const CRITERIA = ["cost", "learning", "travel", "safety"] as const;
export type Option = (typeof OPTIONS)[number];
export type Criterion = (typeof CRITERIA)[number];
export type Scores = Record<Option, Record<Criterion, number>>;

/** 1–5, higher is better (for cost: cheaper; for travel: shorter). */
export const SCORES: Scores = {
  museum: { cost: 3, learning: 4, travel: 2, safety: 5 },
  farm: { cost: 5, learning: 3, travel: 3, safety: 4 },
  science: { cost: 2, learning: 5, travel: 4, safety: 4 },
};
export const WEIGHTS: Record<Criterion, number> = { cost: 3, learning: 4, travel: 2, safety: 5 };

/** Each option's weighted total as a share of the best possible (all 5s). */
export function totals(scores: Scores, weights: Record<Criterion, number>): Record<Option, number> {
  const wsum = CRITERIA.reduce((s, c) => s + weights[c], 0) || 1;
  return Object.fromEntries(OPTIONS.map((o) => [o, CRITERIA.reduce((s, c) => s + weights[c] * scores[o][c], 0) / (5 * wsum)])) as Record<Option, number>;
}
export const winner = (t: Record<Option, number>) => OPTIONS.reduce((b, o) => (t[o] > t[b] ? o : b), OPTIONS[0]);

/** Sports day: outside or in the hall? How good each would be (0–10) if it stays dry or rains. */
export interface Payoff { outsideDry: number; outsideRain: number; hallDry: number; hallRain: number }
export const PAYOFF: Payoff = { outsideDry: 10, outsideRain: 2, hallDry: 6, hallRain: 6 };
export const ev = (p: number, x: Payoff) => ({ outside: (1 - p) * x.outsideDry + p * x.outsideRain, hall: (1 - p) * x.hallDry + p * x.hallRain });
/** The chance of rain at which both choices are equally good, or null if one is always better. */
export function breakEven(x: Payoff) {
  const a = x.outsideDry - x.hallDry, b = x.hallRain - x.outsideRain;
  if (a + b === 0) return null;
  const p = a / (a + b);
  return p > 0 && p < 1 ? p : null;
}
