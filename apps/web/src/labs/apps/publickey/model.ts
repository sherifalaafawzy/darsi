/**
 * Locks and keys: RSA with tiny primes, computed exactly with BigInt. Anyone can lock (encrypt) with the public key
 * (n, e); only the private key d unlocks. Signing is the reverse: lock with d, and anyone can check with e. Real keys
 * use primes hundreds of digits long, so n can't be split back into p and q.
 */
export const PRIMES = [41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

export function modpow(base: bigint, exp: bigint, mod: bigint) {
  let r = 1n, b = base % mod, e = exp;
  while (e > 0n) { if (e & 1n) r = (r * b) % mod; b = (b * b) % mod; e >>= 1n; }
  return r;
}
/** The inverse of a modulo m (a × d ≡ 1), by the extended Euclidean algorithm. */
export function modinv(a: bigint, m: bigint) {
  let [r0, r1, s0, s1] = [a, m, 1n, 0n];
  while (r1 !== 0n) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return ((s0 % m) + m) % m;
}
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

export function keys(p: number, q: number) {
  const n = BigInt(p * q), phi = BigInt((p - 1) * (q - 1));
  const e = [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n].find((x) => x < phi && gcd(x, phi) === 1n)!;
  return { n, phi, e, d: modinv(e, phi) };
}
export type Keys = ReturnType<typeof keys>;

export const lock = (m: bigint, k: Keys) => modpow(m, k.e, k.n);
export const unlock = (c: bigint, k: Keys) => modpow(c, k.d, k.n);
export const sign = (m: bigint, k: Keys) => modpow(m, k.d, k.n);
export const check = (m: bigint, sig: bigint, k: Keys) => modpow(sig, k.e, k.n) === m % k.n;

/** Each character as its number (Unicode code point). */
export const codes = (text: string) => [...text].map((c) => BigInt(c.codePointAt(0)!));
/** How many divisions trial division needs to split n: what an attacker must do to find d. */
export function crackSteps(n: bigint) { let k = 0; for (let f = 2n; f * f <= n; f++) { k++; if (n % f === 0n) return k; } return k; }
