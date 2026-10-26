/** Seeded random numbers (mulberry32): the same seed gives the same "random" dataset or network on every phone. */
export interface Rng { (): number; normal: () => number; int: (n: number) => number; pick: <T>(items: readonly T[]) => T }

export function rng(seed = 1): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => { const u = next() || 1e-9, v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(items: readonly T[]) => items[int(items.length)];
  return Object.assign(next, { normal, int, pick });
}
