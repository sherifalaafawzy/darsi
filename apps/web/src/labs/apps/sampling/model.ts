/** Sampling: how sample means wobble around the true mean, how bigger samples wobble less, and how a biased way of choosing misses. */
import { rng, type Rng } from "../../kit/rng";

export interface Pupil { minutes: number; nearGate: boolean }
/** 400 pupils' journey times; pupils near the gate live close (short journeys). */
export function population(seed = 3): Pupil[] {
  const r = rng(seed);
  return Array.from({ length: 400 }, () => { const near = r() < 0.35; return { nearGate: near, minutes: Math.round(near ? 4 + r() * 10 : 10 + r() * 40) }; });
}
export const meanOf = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
export const sdOf = (xs: readonly number[]) => { const m = meanOf(xs); return Math.sqrt(meanOf(xs.map((x) => (x - m) ** 2))); };
/** A sample of n pupils without replacement: from everyone (random) or only from those near the gate (biased). */
export function draw(pop: readonly Pupil[], n: number, biased: boolean, r: Rng) {
  const pool = pop.filter((p) => !biased || p.nearGate).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = r.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(n, pool.length)).map((p) => p.minutes);
}
/** The means of many samples: their spread is how far one survey can be trusted. */
export function sampleMeans(pop: readonly Pupil[], n: number, k: number, biased: boolean, seed = 1) {
  const r = rng(seed);
  return Array.from({ length: k }, () => meanOf(draw(pop, n, biased, r)));
}
