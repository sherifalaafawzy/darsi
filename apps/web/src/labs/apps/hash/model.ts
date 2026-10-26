/**
 * Fingerprints of data (hashing) with real SHA-256 from the phone's own crypto. The same input always gives the same
 * 64-character fingerprint; change one letter and about half the bits flip (the avalanche effect); and you can't
 * work backwards. Sites store password fingerprints, with a random salt so equal passwords don't look equal.
 */
const enc = new TextEncoder();

export async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** How many of the 256 bits differ between two fingerprints. */
export function bitsDiffer(a: string, b: string) {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
  return n;
}

export function salt() { const b = new Uint8Array(4); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
export const salted = (password: string, s: string) => sha256(`${s}:${password}`);
