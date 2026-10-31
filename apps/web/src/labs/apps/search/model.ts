/**
 * Searching a sorted list, as guess-the-number. Linear search checks 1, 2, 3… in turn; binary search always tries the
 * middle of what is left and throws half away. For n numbers that is up to n steps against about log₂ n.
 */
export const SIZES = [10, 100, 1000] as const;
export type Answer = "higher" | "lower" | "found";

export const judge = (secret: number, guess: number): Answer => (guess === secret ? "found" : guess < secret ? "higher" : "lower");
/** What is left of [lo, hi] after a guess and its answer. */
export const narrow = (lo: number, hi: number, guess: number, a: Answer): [number, number] =>
  a === "higher" ? [Math.max(lo, guess + 1), hi] : a === "lower" ? [lo, Math.min(hi, guess - 1)] : [guess, guess];
/** The middle of what is left (the guess binary search makes). */
export const middle = (lo: number, hi: number) => Math.floor((lo + hi) / 2);

/** Every guess binary search makes for a secret in 1…n. */
export function binaryGuesses(n: number, secret: number): number[] {
  let lo = 1, hi = n;
  const out: number[] = [];
  while (lo <= hi) {
    const g = middle(lo, hi);
    out.push(g);
    const a = judge(secret, g);
    if (a === "found") break;
    [lo, hi] = narrow(lo, hi, g, a);
  }
  return out;
}
/** Linear search checks 1, 2, 3… so it needs as many steps as the secret itself. */
export const linearSteps = (secret: number) => secret;
/** A typed whole number, in Western, Arabic-Indic or Persian digits; null if it isn't one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[,٬\s]/g, "");
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** The race: both searches take one step at this rate (steps a second), so linear search takes about 6 seconds. */
export const racePace = (secret: number) => Math.max(2, secret / 6);

/** The most steps each can need for n numbers. */
export const worstLinear = (n: number) => n;
export const worstBinary = (n: number) => Math.floor(Math.log2(n)) + 1;
