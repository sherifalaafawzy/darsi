// Inline code and formulas in Arabic course text: "[14, 74]", "check()", "V = I × R" read in the wrong order on a
// right-to-left page unless they sit in a left-to-right isolate (U+2066 … U+2069, invisible). Used by
// scripts/isolate-code.mjs (which adds them) and tests/units.test.ts (which requires them). The lesson engine ignores
// isolates when it compares answers. The runs start from Lesson Studio's player (packages/player/src/bidi.ts) and also
// take what course text has and video text doesn't: quoted strings and JSON ("yes", {"day":"monday"}), names_with_
// underscores, == and !=, formulas such as =SUM(B2:B9), and tokens such as <|tools|>.
export const LRI = "⁦";
export const PDI = "⁩";
// Isolates authors place by hand (first-strong U+2068, right-to-left U+2067) close with the same PDI.
const OPENS = new Set([LRI, "⁧", "⁨"]);
const ARABIC = /[؀-ۿ]/;

// Left-to-right runs: Latin words, numbers, codes and small formulas, across spaces and operators. A word may open with
// brackets, quotes or an operator glued to it (=SUM, >=5), or be a short quoted symbol ("?", ",") or string ("Stopped: ").
// A string literal inside a word keeps its spaces: input("Mark? ").
const CHARS = "A-Za-z0-9._\\-/:@#'’\"%+×*=<>≤≥≠–−^()\\[\\]{},⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿⁱ°₀₁₂₃₄₅₆₇₈₉!?|&$";
const LITERAL = `"[^"\\n؀-ۿ]{1,40}"`;
const WORD = `(?:${LITERAL}|[(\\[{°"'=<>≤≥|.]*[A-Za-z0-9_$]|'[^'\\s؀-ۿ]{1,8}')(?:${LITERAL}|[${CHARS}_])*`;
const RUN = new RegExp(`${WORD}(?:(?:\\s*(?:[=<>≤≥≠≈±+\\-−×÷⋅*/^–→!%]+|&&|\\|\\|)\\s*|\\s*[,;:]\\s+|\\s+)${WORD})*`, "g");
// A run needs an isolate when it holds brackets, quotes or operators (a plain word or number is laid out fine), or when
// it starts with a number joined to a word: after Arabic, "2-opt" shows as "opt-2".
const CODEY = /[()[\]{}"'=+*/<>#%×÷−≤≥≠≈^→|]|^[0-9][0-9.,]*[-–][A-Za-z]/;
// Media paths and links kept per language are not text.
const PATH = /^(?:https?:\/\/\S*|\.{0,2}\/\S*|\S+\.(?:mp4|webm|vtt|pdf|pptx|json|png|jpe?g|webp|svg|opus|mp3))$/i;

/** True when the whole string already sits in one isolate. */
const wrapped = (text) => {
  const t = text.trim();
  if (!OPENS.has(t[0]) || !t.endsWith(PDI)) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (OPENS.has(t[i])) depth++;
    else if (t[i] === PDI && --depth === 0 && i < t.length - 1) return false;
  }
  return true;
};

/** The pieces of code in an Arabic string that need an isolate, as [start, end) offsets. Code already isolated is skipped. */
export function codePieces(text) {
  let masked = "";
  let depth = 0;
  for (const ch of text) {
    if (OPENS.has(ch)) { depth++; masked += "\u0001"; }
    else if (ch === PDI) { depth = Math.max(0, depth - 1); masked += "\u0001"; }
    else masked += depth ? "\u0001".repeat(ch.length) : ch;
  }
  // A string with no Arabic letters (an option such as "sum(marks) / len(marks)") is code as a whole.
  if (!ARABIC.test(text)) {
    const t = text.trim();
    if (!t || PATH.test(t) || wrapped(t) || !/[A-Za-z0-9]/.test(masked) || !CODEY.test(t)) return [];
    const start = text.indexOf(t);
    return [[start, start + t.length]];
  }
  const out = [];
  for (const m of masked.matchAll(RUN)) {
    const [start, end] = trim(masked, m.index, m.index + m[0].length);
    const run = masked.slice(start, end);
    // Prose brackets around a plain word or number are fine: "(LED)", "(30)".
    if (/^\([A-Za-z0-9][A-Za-z0-9 .\-]*\)$/.test(run)) continue;
    if (run && CODEY.test(run)) out.push([start, end]);
  }
  return out;
}

/**
 * [start, end) of text without what belongs to the sentence: spaces, ending punctuation, unmatched brackets and quotes.
 * An isolate placed earlier (old) keeps its ending punctuation («⁦What is your PIN?⁩») and a run of bare brackets (⁦( [ {⁩).
 */
function trim(text, start, end, old = false) {
  const was = [start, end];
  const run = () => text.slice(start, end);
  const count = (re) => (run().match(re) ?? []).length;
  for (let again = true; again;) {
    again = false;
    const tail = (old ? /\s+$/ : /[\s.,:;!?،؛؟]+$/).exec(run());
    if (tail) { end -= tail[0].length; again = true; }
    if (/[)\]}]$/.test(run()) && count(/[([{]/g) < count(/[)\]}]/g)) { end--; again = true; }
    if (/["']$/.test(run()) && count(new RegExp(text[end - 1], "g")) % 2) { end--; again = true; }
  }
  for (let again = true; again;) {
    again = false;
    const lead = /^(?:\s+|[:،,;.](?=\s))+/.exec(run());
    if (lead) { start += lead[0].length; again = true; }
    if (/^[([{]/.test(run()) && count(/[([{]/g) > count(/[)\]}]/g)) { start++; again = true; }
    if (/^["']/.test(run()) && count(new RegExp(text[start], "g")) % 2) { start++; again = true; }
  }
  if (old && !/[A-Za-z0-9]/.test(run())) return was;
  return [start, Math.max(start, end)];
}

/** The string without its left-to-right isolates (the ones this file adds), keeping hand-placed U+2067/U+2068 ones. */
export function stripIsolates(text) {
  const stack = [];
  const drop = new Set();
  [...text].forEach((ch, i) => {
    if (OPENS.has(ch)) stack.push([ch, i]);
    else if (ch === PDI && stack.length) { const [open, at] = stack.pop(); if (open === LRI) drop.add(at).add(i); }
  });
  return [...text].filter((_, i) => !drop.has(i)).join("");
}

/** The isolates paired: every opener has its PDI and no PDI is left over. */
export function isolatesPair(text) {
  let depth = 0;
  for (const ch of text) {
    if (OPENS.has(ch)) depth++;
    else if (ch === PDI && --depth < 0) return false;
  }
  return depth === 0;
}

/** The string with each piece of code isolated. */
export function isolateCode(text) {
  return wrap(text, codePieces(text));
}

const wrap = (text, pieces) => {
  let out = text;
  for (const [s, e] of [...pieces].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + LRI + out.slice(s, e) + PDI + out.slice(e);
  return out;
};

/**
 * The string isolated again with the current rules: its left-to-right isolates are worked out afresh, and an earlier
 * one (placed by hand, or by older rules) stays only where it doesn't overlap a new piece, without prose punctuation
 * at its edges. So half-isolated code ("⁦m.add(p[c⁩, "science"] <= 3)") is mended, and isolates the rules wouldn't
 * add («⁦What is your PIN?⁩») stay.
 */
export function reisolate(text) {
  const base = stripIsolates(text);
  const fresh = codePieces(base);
  // Where the old LRI isolates sit in the stripped text.
  const old = [];
  const stack = [];
  let at = 0;
  for (const ch of text) {
    if (OPENS.has(ch)) { stack.push([ch, at]); if (ch !== LRI) at += ch.length; continue; }
    if (ch === PDI && stack.length) {
      const [open, start] = stack.pop();
      if (open === LRI) { old.push([start, at]); continue; }
    }
    at += ch.length;
  }
  const kept = [];
  for (const [os, oe] of old) {
    const [s, e] = trim(base, os, oe, true);
    if (s < e && !fresh.some(([fs, fe]) => fs < e && s < fe) && !kept.some(([ks, ke]) => ks < e && s < ke)) kept.push([s, e]);
  }
  return wrap(base, [...fresh, ...kept]);
}

/** Every string in a unit's Arabic fields, with its path: [path, text, set(newText)]. */
export function arabicStrings(unit) {
  const out = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === "ar" || k === "ar-EG") && typeof x === "string") out.push([`${path}.${k}`, x, (t) => { v[k] = t; }]);
      else if ((k === "ar" || k === "ar-EG") && Array.isArray(x)) x.forEach((s, i) => { if (typeof s === "string") out.push([`${path}.${k}[${i}]`, s, (t) => { x[i] = t; }]); });
      else walk(x, `${path}.${k}`);
    }
  };
  walk(unit, unit.id);
  return out;
}
