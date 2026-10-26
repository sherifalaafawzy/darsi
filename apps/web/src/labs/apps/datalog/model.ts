/**
 * Data logger: a week of hourly soil-moisture readings from the school garden. The soil dries faster in the heat of the
 * day, jumps when the garden is watered or it rains, and a loose wire makes a few readings nonsense (glitches).
 * Summaries are only as good as the cleaning before them.
 */
import { rng } from "../../kit/rng";

export const HOURS = 24 * 7;
export interface Row { h: number; v: number }

export function week(seed = 12): Row[] {
  const r = rng(seed), out: Row[] = [];
  let m = 72;
  for (let h = 0; h < HOURS; h++) {
    const hourOfDay = h % 24, day = Math.floor(h / 24);
    const sun = hourOfDay >= 7 && hourOfDay <= 17 ? 0.35 + 0.35 * Math.sin((Math.PI * (hourOfDay - 7)) / 10) : 0.12;
    m -= sun;
    if ((day === 2 || day === 5) && hourOfDay === 8) m = Math.min(85, m + 30); // watered by the gardening club
    if (day === 4 && hourOfDay >= 15 && hourOfDay <= 17) m = Math.min(90, m + 5); // afternoon rain
    out.push({ h, v: Math.round((m + r.normal() * 0.8) * 10) / 10 });
  }
  for (const h of [30, 77, 101, 140]) out[h] = { h, v: h % 2 ? 0 : 100 }; // glitches
  return out;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

/** A glitch is impossible (0 or 100) or a lone spike: far from both the reading before and the reading after. */
export function glitches(rows: Row[]) {
  return rows.map((x, i) => {
    if (x.v <= 0 || x.v >= 100) return true;
    const before = rows[i - 1]?.v, after = rows[i + 1]?.v;
    return before !== undefined && after !== undefined && Math.abs(x.v - before) > 15 && Math.abs(x.v - after) > 15;
  });
}

export function stats(vs: number[]) {
  if (!vs.length) return { min: 0, max: 0, mean: 0, median: 0 };
  return { min: Math.min(...vs), max: Math.max(...vs), mean: vs.reduce((a, b) => a + b, 0) / vs.length, median: median(vs) };
}
export const daily = (rows: Row[], skip: boolean[]) => Array.from({ length: 7 }, (_, d) => {
  const vs = rows.filter((x, i) => Math.floor(x.h / 24) === d && !skip[i]).map((x) => x.v);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
});
/** Hours spent below the "needs water" line. */
export const dryHours = (rows: Row[], skip: boolean[], line: number) => rows.filter((x, i) => !skip[i] && x.v < line).length;

export function csv(rows: Row[], bad: boolean[]) {
  return ["hour,day,time,moisture_percent,glitch", ...rows.map((x, i) => `${x.h},${Math.floor(x.h / 24) + 1},${String(x.h % 24).padStart(2, "0")}:00,${x.v},${bad[i] ? 1 : 0}`)].join("\n");
}
