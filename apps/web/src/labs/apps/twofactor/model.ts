/**
 * Two-step sign-in with real one-time codes (TOTP, RFC 6238), the kind authenticator apps show. The phone and the
 * website share a secret; every 30 seconds both compute HMAC-SHA1(secret, time step) and keep six digits of it. A
 * thief with the password still needs the phone.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes: Uint8Array) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function newSecret() { const b = new Uint8Array(20); crypto.getRandomValues(b); return b; }
export const STEP = 30;
export const counter = (unixSeconds: number) => Math.floor(unixSeconds / STEP);

/** The code for one time step: HMAC-SHA1, then "dynamic truncation" to a number, then the last `digits` digits. */
export async function hotp(secret: Uint8Array<ArrayBuffer>, count: number, digits = 6) {
  const msg = new Uint8Array(8);
  let c = count;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}
export const totp = (secret: Uint8Array<ArrayBuffer>, unixSeconds: number, digits = 6) => hotp(secret, counter(unixSeconds), digits);

/** Accepts the current code or the one just before or after, since phone clocks drift a little. */
export async function verify(secret: Uint8Array<ArrayBuffer>, code: string, unixSeconds: number) {
  for (const d of [0, -1, 1]) if ((await hotp(secret, counter(unixSeconds) + d)) === code.trim()) return true;
  return false;
}
