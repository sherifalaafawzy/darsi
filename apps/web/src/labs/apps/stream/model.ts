/**
 * Streams and batches: a river-level sensor sends one reading a minute for three hours. The river is steady, then
 * rises after rain upstream and crosses the 2 m warning line. The readings are noisy, and splashes (a wave, a floating
 * branch, a passing boat's wake) look like a flood for a few minutes.
 * - Stream: every reading is handled as it arrives; the alert watches the average of the last `w` readings.
 * - Batch: the readings are handled together every `b` minutes; the alert watches each batch's average.
 * Bigger windows and longer batches hide the splashes but raise the alarm later. An alert rings once, then waits
 * until the level drops back well below the line.
 */
import { rng } from "../../kit/rng";

export const MINUTES = 180;
export const LINE = 2;
/** The alert rings again only after the level falls this far below the line. */
const REARM = 0.15;
/** An alert this close to the line (or above it) counts as the real one, early or late. */
const NEAR = 0.1;
const SPLASHES: Record<number, number> = { 35: 0.95, 70: 0.85, 71: 0.6, 100: 0.9, 101: 0.85, 102: 0.8, 103: 0.7 };

/** The river's real level (m) at minute t: steady at 1.2 m, rising from minute 80. */
export const river = (t: number) => (t < 80 ? 1.2 : Math.min(2.7, 1.2 + 0.016 * (t - 80) + 0.00004 * (t - 80) ** 2));
export const TRUE_CROSS = Array.from({ length: MINUTES }, (_, t) => t).find((t) => river(t) >= LINE)!;

export function readings(seed = 4): number[] {
  const r = rng(seed);
  return Array.from({ length: MINUTES }, (_, t) => Math.round((river(t) + r.normal() * 0.05 + (SPLASHES[t] ?? 0)) * 100) / 100);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** The average of the last w readings at every minute (fewer at the start). */
export const moving = (xs: number[], w: number) => xs.map((_, t) => mean(xs.slice(Math.max(0, t - w + 1), t + 1)));
/** Each batch's average, reported at the minute the batch ends: [minute, average]. */
export function batchMeans(xs: number[], b: number): [number, number][] {
  const out: [number, number][] = [];
  for (let end = b; end <= xs.length; end += b) out.push([end - 1, mean(xs.slice(end - b, end))]);
  return out;
}

/** The minutes an alert rings, watching a series of [minute, level]. */
export function alerts(series: [number, number][]): number[] {
  const out: number[] = [];
  let armed = true;
  for (const [t, v] of series) {
    if (armed && v >= LINE) { out.push(t); armed = false; } else if (!armed && v < LINE - REARM) armed = true;
  }
  return out;
}

export type Mode = "stream" | "batch";
export function judge(xs: number[], mode: Mode, size: number) {
  const series: [number, number][] = mode === "stream" ? moving(xs, size).map((v, t) => [t, v]) : batchMeans(xs, size);
  const at = alerts(series);
  const isFalse = (t: number) => river(t) < LINE - NEAR;
  const real = at.find((t) => !isFalse(t)) ?? null;
  return { series, alerts: at.map((t) => ({ t, false: isFalse(t) })), falseAlarms: at.filter(isFalse).length, real, delay: real === null ? null : real - TRUE_CROSS, wakeups: mode === "stream" ? xs.length : Math.floor(xs.length / size) };
}
