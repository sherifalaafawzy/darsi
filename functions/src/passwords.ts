import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I) — passwords are often read aloud or copied from paper.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%*?";

/** Cryptographically random password with at least one lower, upper, digit and symbol. */
export function generatePassword(length = 10): string {
  const n = Math.max(8, Math.min(32, Math.floor(length)));
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  const chars = [LOWER, UPPER, DIGIT, SYMBOL].map((set) => set[randomInt(set.length)]);
  while (chars.length < n) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

/** Short human-friendly invite code, e.g. "K7Q-2MXP". */
export function generateCode(): string {
  const set = UPPER + DIGIT;
  const pick = (k: number) => Array.from({ length: k }, () => set[randomInt(set.length)]).join("");
  return `${pick(3)}-${pick(4)}`;
}

/** People without email log in with a username; Firebase Auth needs an email, so we map it to a hidden domain. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const isValidUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(u);

/** Username suggestion from a name in any script, with a random suffix: "amina.bello.4821". */
export function suggestUsername(name: string): string {
  const latin = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 24);
  return `${latin || "user"}.${randomInt(1000, 10000)}`;
}
