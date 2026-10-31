/** Scatter plots: Pearson correlation and the least-squares line y = a + b·x. */
export interface P { x: number; y: number }
const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
export function correlation(ps: readonly P[]) {
  if (ps.length < 2) return 0;
  const mx = avg(ps.map((p) => p.x)), my = avg(ps.map((p) => p.y));
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of ps) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
export function fitLine(ps: readonly P[]) {
  const mx = avg(ps.map((p) => p.x)), my = avg(ps.map((p) => p.y));
  let sxy = 0, sxx = 0;
  for (const p of ps) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}
/** Mean absolute miss of a line on the points. */
export const meanMiss = (ps: readonly P[], l: { slope: number; intercept: number }) => avg(ps.map((p) => Math.abs(p.y - (l.intercept + l.slope * p.x))));
export type Strength = "strong+" | "weak+" | "none" | "weak-" | "strong-";
export const strength = (r: number): Strength => (r >= 0.7 ? "strong+" : r >= 0.3 ? "weak+" : r > -0.3 ? "none" : r > -0.7 ? "weak-" : "strong-");
/** Hours of study per week (x) and marks out of 20 (y) for ten pupils. */
export const STUDY: P[] = [[1, 8], [2, 9], [2, 11], [3, 10], [4, 12], [5, 13], [5, 15], [6, 14], [7, 16], [8, 17]].map(([x, y]) => ({ x, y }));
