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

/**
 * Invite code: 12 characters from 32 with no look-alikes, in groups of 4 ("K7QP-2MXR-9DHA"), about 60 bits, so
 * guessing one is hopeless (joinOrg also limits failed tries). Typed on phones, read aloud, or opened as a link.
 */
export function generateCode(): string {
  const set = UPPER + DIGIT;
  const pick = (k: number) => Array.from({ length: k }, () => set[randomInt(set.length)]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

/**
 * A typed code as it is stored: upper case, spaces and dashes ignored, regrouped. Codes made before 2026-11 have 7
 * characters ("K7Q-2MXP") and keep working until an admin makes new ones. null: not a code at all.
 */
export function normalizeCode(input: unknown): string | null {
  const s = typeof input === "string" ? input.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (s.length === 12) return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  if (s.length === 7) return `${s.slice(0, 3)}-${s.slice(3)}`;
  return null;
}

/** People without email log in with a username; Firebase Auth needs an email, so we map it to a hidden domain. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const isValidUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(u);

/**
 * Arabic letters (and the Persian and Urdu ones) in Latin, so a pupil's login carries their name: «منى عبد الرحمن»
 * → "mna abd alrhmn". Consonants as Egyptians write names in Latin (ج g, ذ z, ة a, ى a); short vowels aren't written
 * in Arabic, so none are guessed; و is "w" at the start of a word and "o" inside it (محمود → mhmod). Hamza seats,
 * tatweel and harakat are dropped, and anything else in the Arabic block separates words.
 */
const AR: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "e", "آ": "a", "ٱ": "a", "ى": "a", "ة": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "g", "ح": "h",
  "خ": "kh", "د": "d", "ذ": "z", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ي": "y", "ء": "", "ئ": "", "ؤ": "",
  "پ": "p", "چ": "ch", "ژ": "zh", "گ": "g", "ک": "k", "ی": "y", "ٹ": "t", "ڈ": "d", "ڑ": "r", "ں": "n", "ہ": "h", "ھ": "h", "ے": "e",
};
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩", FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function transliterate(name: string): string {
  return name.normalize("NFKC") // presentation forms (ﻻ) become plain letters
    .replace(/[ً-ٰٟـ]/g, "") // harakat, dagger alif, tatweel
    .replace(/(^|[^؀-ۿ])و/g, "$1w").replace(/و/g, "o") // و
    .replace(/[؀-ۿ]/g, (ch) => {
      const d = AR_DIGITS.includes(ch) ? AR_DIGITS.indexOf(ch) : FA_DIGITS.indexOf(ch);
      return d >= 0 ? String(d) : AR[ch] ?? " ";
    });
}

/**
 * Username suggestion from a name in any script, with a random suffix: "amina.bello.48213", «منى عبد الرحمن» →
 * "mna.abd.27561". The first two parts of the name keep logins short to type on a phone. The suffix (5 digits, or 6
 * after "user." for a name with no letter we can write in Latin) leaves tens of thousands of logins per name, and
 * createMembers draws again when one is taken. (It was 4 digits, and every Arabic name was "user.": 9,000 logins for
 * the whole platform, so large imports refused people as "Already exists".)
 */
export function suggestUsername(name: string): string {
  const latin = transliterate(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).slice(0, 2).join(".").slice(0, 24).replace(/\.+$/, "");
  return latin ? `${latin}.${randomInt(10000, 100000)}` : `user.${randomInt(100000, 1000000)}`;
}
