/**
 * Password strength, the way attackers see it. A random password's guesses grow with its length and alphabet
 * (entropy); but people's passwords aren't random, so attackers try common passwords, words, names, years and
 * keyboard runs first. Nothing typed here leaves the phone.
 */
export const COMMON = [
  "123456", "123456789", "12345678", "12345", "1234567", "111111", "000000", "123123", "654321", "666666", "121212", "112233",
  "password", "password1", "qwerty", "qwerty123", "abc123", "a123456", "iloveyou", "admin", "welcome", "letmein", "monkey", "dragon",
  "football", "sunshine", "princess", "master", "shadow", "superman", "michael", "1q2w3e4r", "zaq12wsx", "asdfgh", "secret", "school",
  "teacher", "student", "computer", "internet", "samsung", "google", "freedom", "flower", "lovely", "hello", "baseball", "soccer",
  "محمد", "احمد", "الله", "مصر", "حبيبي", "بسم الله", "١٢٣٤٥٦", "كلمةالسر", "عمر", "فاطمة", "علي", "مدرسة",
];
const WORDS = ["sun", "moon", "star", "love", "baby", "cat", "dog", "lion", "tiger", "king", "queen", "angel", "magic", "happy", "summer", "winter", "spring", "school", "class", "teacher", "pass", "word", "admin", "user", "login", "hello", "world", "family", "friend", "football", "music", "apple", "orange", "mango", "coffee", "chocolate", "shine", "sunshine", "light", "power", "super", "money", "lucky", "smile",
  // Names and pets' names are in every attacker's dictionary too (the footprint lab's Mishmish among them).
  "mohamed", "mohammed", "ahmed", "omar", "fatima", "fatma", "aisha", "mariam", "maryam", "youssef", "hassan", "amal", "lina", "sara", "nour", "mishmish"];
/** Every dictionary word an attacker tries, English and Arabic, longest first (so "sunshine" is found before "sun"). */
const DICT = [...new Set([...WORDS, ...COMMON.filter((w) => /^([a-z]+|[ء-ي]+)$/.test(w))])].sort((a, b) => b.length - a.length);
const WORD_BITS = Math.log2(50000); // picking one word from a big dictionary
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "0987654321"];
const LEET: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", "$": "s", "5": "s", "7": "t", "أ": "ا", "إ": "ا", "آ": "ا" };
/** Arabic-Indic digits are digits: the same ten choices, years and runs as 0–9. */
const western = (pw: string) => pw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

export function pools(pw: string) {
  // Arabic letters (and marks) exclude the Arabic-Indic digits ٠–٩, which count as digits.
  const p = { lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), digit: /[0-9٠-٩]/.test(pw), arabic: /[؀-ٟٮ-ۿ]/.test(pw), symbol: /[^a-zA-Z0-9؀-ۿ\s]/.test(pw), space: /\s/.test(pw) };
  const size = (p.lower ? 26 : 0) + (p.upper ? 26 : 0) + (p.digit ? 10 : 0) + (p.arabic ? 36 : 0) + (p.symbol ? 33 : 0) + (p.space ? 1 : 0);
  return { ...p, size };
}

/** log2 of the guesses a brute-force attacker needs if the password were random. */
export const bruteBits = (pw: string) => ([...pw].length ? [...pw].length * Math.log2(Math.max(2, pools(pw).size)) : 0);

export type Weakness = "common" | "word" | "year" | "keyboard" | "repeat" | "short" | "digitsOnly";
/** The patterns attackers try first, and the guesses they would need with them. */
export function analyse(typed: string) {
  const pw = western(typed), lower = pw.toLowerCase(), plain = [...lower].map((c) => LEET[c] ?? c).join("");
  const found: Weakness[] = [];
  let bits = bruteBits(pw);
  if (COMMON.includes(lower) || COMMON.includes(plain)) { found.push("common"); bits = Math.min(bits, Math.log2(COMMON.length * 20)); }
  // Find whole dictionary words in the de-leeted text; score what's left (from the original characters) as an
  // attacker would: a year, plain digits, or anything at all.
  const covered = new Array<boolean>(plain.length).fill(false);
  let nWords = 0;
  for (const w of DICT) for (let i = plain.indexOf(w); i >= 0; i = plain.indexOf(w, i + 1)) {
    if (covered.slice(i, i + w.length).some(Boolean)) continue;
    covered.fill(true, i, i + w.length); nWords++;
  }
  const isYear = /(19[5-9]\d|20[0-3]\d)/.test(pw);
  if (nWords) {
    found.push("word");
    let left = [...lower].filter((_, i) => !covered[i]).join("").replace(/[\s\-_.]+/g, ""), tail = 0;
    if (/[!@#$%&*?]$/.test(left)) { left = left.slice(0, -1); tail = Math.log2(10); } // "…2024!": a symbol at the end is the first thing tried
    const restBits = tail + (!left ? 0 : /^(19[5-9]\d|20[0-3]\d)$/.test(left) ? Math.log2(100) : /^\d+$/.test(left) ? left.length * Math.log2(10) : bruteBits(left));
    bits = Math.min(bits, nWords * WORD_BITS + restBits + (/[A-Z]/.test(pw) ? 1 : 0));
  }
  if (isYear) { found.push("year"); if (!nWords) bits -= 4; }
  if (ROWS.some((row) => { for (let i = 0; i + 4 <= row.length; i++) if (lower.includes(row.slice(i, i + 4))) return true; return false; })) { found.push("keyboard"); bits -= 8; }
  if (/(.)\1\1/.test(pw)) { found.push("repeat"); bits -= 6; }
  if (/^[0-9٠-٩]+$/.test(pw)) found.push("digitsOnly");
  if ([...pw].length < 8) found.push("short");
  return { bits: Math.max(0, bits), found };
}

/** Seconds to try half the possibilities at `perSecond` guesses a second. */
export const seconds = (bits: number, perSecond: number) => 2 ** bits / 2 / perSecond;
export const ONLINE = 10, OFFLINE = 1e10; // a website that slows guessing down; a stolen password file and a gaming graphics card

/**
 * A phrase made only of words from a generator's list (any separators): an attacker who knows the list needs
 * list size ^ words guesses, however long the text looks. Null when it isn't such a phrase.
 */
export function fromList(pw: string, list: readonly string[]) {
  const known = new Set(list.map((w) => w.toLowerCase()));
  const words = pw.toLowerCase().split(/[\s\-_.,،]+/).filter(Boolean);
  return words.length >= 2 && words.every((w) => known.has(w)) ? { words: words.length, bits: words.length * Math.log2(known.size) } : null;
}

/** A passphrase of random words, chosen with the phone's secure random numbers. */
export function passphrase(words: readonly string[], n = 5) {
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => words[x % words.length]);
}
