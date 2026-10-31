/** Centre and spread of a small set of marks: mean, median, mode(s), range and interquartile range. */
export const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
export function median(xs: readonly number[]) {
  const s = sorted(xs), n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/** Every value that appears most often; none when all values appear once. */
export function modes(xs: readonly number[]) {
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  const top = Math.max(0, ...c.values());
  return top < 2 ? [] : [...c].filter(([, k]) => k === top).map(([v]) => v).sort((a, b) => a - b);
}
export const range = (xs: readonly number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
/** Quartiles by the median-of-halves rule taught in school. */
export function quartiles(xs: readonly number[]) {
  const s = sorted(xs), n = s.length, h = Math.floor(n / 2);
  return { q1: median(s.slice(0, h)), q3: median(s.slice(n % 2 ? h + 1 : h)) };
}
/** Population standard deviation. */
export const sd = (xs: readonly number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
/** The class's marks out of 20; the last pupil's mark is the one the learner drags. */
export const MARKS = [9, 11, 12, 12, 13, 14, 15, 16];
export const withLast = (last: number) => [...MARKS, last];
