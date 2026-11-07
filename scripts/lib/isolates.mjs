// Inline code and formulas in Arabic course text: "[14, 74]", "check()", "V = I × R", "θ = 3 − 0.1 × 6" read in the
// wrong order on a right-to-left page unless they sit in a left-to-right isolate (U+2066 … U+2069, invisible). Used by
// scripts/isolate-code.mjs (which adds them) and tests/units.test.ts (which requires them). The lesson engine ignores
// isolates when it compares answers. The runs start from Lesson Studio's player (packages/player/src/bidi.ts) and also
// take what course text has and video text doesn't: quoted strings and JSON ("yes", {"day":"monday"}), names_with_
// underscores, == and !=, formulas such as =SUM(B2:B9) or softmax(QKᵀ/√d)V, and tokens such as <|tools|>.
export const LRI = "⁦";
export const PDI = "⁩";
// Isolates authors place by hand (first-strong U+2068, right-to-left U+2067) close with the same PDI.
const OPENS = new Set([LRI, "⁧", "⁨"]);
const ARABIC = /[؀-ۿ]/;

// Left-to-right runs: Latin words, numbers, codes and formulas, across spaces and operators, never across a line break
// (a line break ends every isolate on screen, so one that spans lines scrambles both). A word may open with brackets,
// quotes, a sign or an operator glued to it (=SUM, >=5, −1, √d, ∂L), or be a short quoted symbol ("?", ","), a string
// ("Stopped: ") or a slice ([::-1]). A string literal inside a word keeps its spaces: input("Mark? "). After the first
// word an empty container is a word too, so the comma in TOOLS.get(agent, []) doesn't end the run.
// Formulas: Greek letters, combining marks (x̄, p̂), modifier letters and sub- and superscripts (Aᵀy, Cᵢ, gᵃ, Σⱼ, n²),
// ℓ and the number sets, primes (s′), norms (‖w‖₁), the maths operators (∂ ∇ ∑ √ ∞ ∈ ≡ ⋅ ≤), ± ÷ and the Arabic
// percent sign (30٪).
const MATHS = "Ͱ-Ͽ̀-ͯᴀ-ᶿⱼ⁰-₟ℓℕℚℝℤ′-‴‖∀-⋿±÷¬٪";
// The backslash is in a word for Windows paths (.venv\Scripts\activate), and so is an ellipsis: min(key=…).
const CHARS = `A-Za-z0-9._\\-/:@#'’"%+×*=<>≤≥≠–−^()\\[\\]{},²³¹°!?|&$…\\\\${MATHS}`;
const SP = "[^\\S\\n]";
const LITERAL = `"[^"\\n؀-ۿ]{1,40}"`;
const SLICE = "\\[-?\\w*:[\\w:-]*\\]";
// √ only opens a word ("√d", "√(0.25/100)"), so «√(١٠ × ٣٠)» stays Arabic maths.
const FIRST = "[A-Za-z0-9_$Ͱ-Ͽℓ∂∇∑]";
const WORD = `(?:${LITERAL}|${SLICE}|[(\\[{°"'=<>≤≥|‖.√∂∇∑−-]*${FIRST}|'[^'\\s؀-ۿ]{1,8}')(?:${LITERAL}|[${CHARS}])*`;
const NEXT = `(?:${WORD}|(?:\\(\\)|\\[\\]|\\{\\})[${CHARS}]*)`;
// Operators join words, spaces or not: a single & and | too (mask >> i & 1), and an ellipsis (k = 0 if ... else 1,
// UPDATE … SET). An Arabic-Indic number that ends the formula belongs to it (k = ١); one the formula goes on from is
// Arabic maths, laid out right to left as it is (r = ١٧ ÷ √(١٠ × ٣٠)).
const OP = `(?:[=<>≤≥≠≈±+\\-−×÷⋅*/^–→!%&|≡∈∉∝~]+|\\.\\.\\.|…)`;
const AR_NUMBER = `[٠-٩][٠-٩٫٬]*(?![٠-٩٫٬]|${SP}*${OP})`;
// ← joins only letters (θ ← (1 − 2η)θ): Arabic text uses it for "then" («إيميل ← Continue», «8 ← 4 ← 2»).
const ARROW = `(?<=[A-Za-zͰ-Ͽ̀-ͯ²³¹⁰-₟)\\]])${SP}*←${SP}*(?=[A-Za-zͰ-Ͽ(√∂∇])`;
// A plain space after a sentence's end (". ", "! ", "? ") doesn't join: «⁦1/1 = 1⁩. ε الأصغر».
const JOIN = `(?:${SP}*${OP}${SP}*(?:${NEXT}|${AR_NUMBER})|${SP}*[,;:]${SP}+${NEXT}|(?<![.!?])${SP}+${NEXT}|${ARROW}${NEXT})`;
// After Arabic, a run may open with an operator that applies to the code after it: «يجعل ⁦% len(route)⁩»، «دون ⁦& 1⁩».
// Not a single slash: «4.096 فولت / 4096» is units.
const OP_FIRST = `(?:(?<=(?:^|[؀-ۿ])${SP}*)(?:%|&|\\||\\^|\\*\\*?|//)${SP}+(?=[A-Za-z0-9_(]))?`;
const RUN = new RegExp(`${OP_FIRST}${WORD}${JOIN}*`, "g");
// A Python header keeps its colon (for i in range(6):, else:); a lone "if:" is prose.
const KEYWORDS = "for|if|elif|while|def|with|except|class";
const HEADER = new RegExp(`^(?:(?:${KEYWORDS})\\b.*\\S|else|try|finally|except):$`);
// "mask: for i in range(6):" is a word, then the header; "if x: return y" stays one statement.
const BEFORE_HEADER = new RegExp(`:${SP}+(?=(?:${KEYWORDS}|else|try|finally)\\b)`, "g");
const STATEMENT = new RegExp(`^${SP}*(?:${KEYWORDS}|else|try|finally|return|lambda)\\b`);
// A run needs an isolate when it holds brackets, quotes, operators or maths symbols (a plain word or number is laid out
// fine), when it starts with a sign or a dot (−1, .venv: after Arabic they show as 1−, venv.), when it ends with a
// glued ! (n!, P@ssw0rd!), when it is a Python header, when it is numbers apart (program output "5 7" shows as "7 5"),
// or when it starts with a number joined to a word: after Arabic, "2-opt" shows as "opt-2".
const CODEY = new RegExp(`[()[\\]{}"'=+*/<>#%×÷−^→|&\\\\←′″‖±∀-⋿]|^[−-][0-9A-Za-zͰ-Ͽ]|^\\.[A-Za-z]|[A-Za-z0-9)\\]]!$|(?:^|${SP})[0-9][0-9.]*${SP}+[0-9]|^[0-9][0-9.,]*[-–][A-Za-z]|${HEADER.source}`);
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
    // A line break ends every isolate on screen.
    else if (ch === "\n") { depth = 0; masked += ch; }
    else masked += depth ? "\u0001".repeat(ch.length) : ch;
  }
  // A string with no Arabic letters (an option such as "sum(marks) / len(marks)") is code as a whole, line by line.
  if (!ARABIC.test(text)) {
    const out = [];
    let at = 0;
    for (const line of text.split("\n")) {
      const t = line.trim();
      const m = masked.slice(at, at + line.length);
      if (t && !PATH.test(t) && !wrapped(t) && /[A-Za-z0-9]/.test(m) && CODEY.test(t)) out.push([at + line.indexOf(t), at + line.indexOf(t) + t.length]);
      at += line.length + 1;
    }
    return out;
  }
  const out = [];
  // A line with no Arabic letters inside Arabic text is a command or a line of code ("ollama serve > /tmp/x.log 2>&1 &"
  // in setup steps): one isolate for the whole line, or the symbols at its ends land on the wrong side. A list's number
  // stays outside, as below.
  const whole = [];
  {
    let at = 0;
    for (const line of masked.split("\n")) {
      const lead = /^[^\S\n]*(?:[0-9]+[.)][^\S\n]+)?/.exec(line)[0].length;
      const t = line.slice(lead).trimEnd();
      if (t && !ARABIC.test(line) && !line.includes("\u0001") && /[A-Za-z]/.test(t) && !PATH.test(t) && CODEY.test(t)) {
        const [s, e] = trim(masked, at + lead, at + lead + t.length);
        if (e > s && CODEY.test(masked.slice(s, e))) whole.push([s, e]);
      }
      at += line.length + 1;
    }
  }
  out.push(...whole);
  for (const m of masked.matchAll(RUN)) {
    if (whole.some(([a, b]) => a < m.index + m[0].length && m.index < b)) continue;
    // A word and a Python header after it are two pieces: "mask: for i in range(6):".
    const cuts = [m.index];
    for (const c of m[0].matchAll(BEFORE_HEADER)) if (!STATEMENT.test(masked.slice(cuts[cuts.length - 1], m.index + c.index))) cuts.push(m.index + c.index + 1);
    cuts.push(m.index + m[0].length);
    for (let k = 0; k + 1 < cuts.length; k++) {
      let [start, end] = trim(masked, cuts[k], cuts[k + 1]);
      // A list's number stays with the list: "4) Public → Create" at the start of a line.
      const lineStart = masked.lastIndexOf("\n", start - 1) + 1;
      const marker = /^[0-9]+[.)][^\S\n]+/.exec(masked.slice(start, end));
      if (marker && !masked.slice(lineStart, start).trim()) [start, end] = trim(masked, start + marker[0].length, end);
      const run = masked.slice(start, end);
      // Prose brackets around a plain word or number are fine: "(LED)", "(30)", "(Ω)", and so is a lone operator that
      // trimming left.
      if (/^\([A-Za-z0-9Ͱ-Ͽ][A-Za-z0-9Ͱ-Ͽ .\-]*\)$/.test(run) || !/[A-Za-z0-9Ͱ-Ͽ]/.test(run)) continue;
      if (CODEY.test(run)) out.push([start, end]);
    }
  }
  // A comparison operator named on its own between Arabic words, as a symbol: «تشمل >= العدد»، «من نوع ≥ وكلفة»، «و< لا
  // يُبقي». Right to left it is mirrored (≥ shows as ≤, >= as =<), so it needs an isolate too. Arabic maths with an
  // operand is meant to mirror and stays as it is: a number or a one-letter variable beside it («س ≥ ٥»، «… ≥ ١٠٠»),
  // or glued to it («≥٨٠٪»). So does an operator among other symbols («& < > "», already in a hand-placed isolate).
  for (const m of masked.matchAll(LONE_OP)) {
    const start = m.index + m[1].length, end = m.index + m[0].length;
    if (out.some(([a, b]) => a < end && start < b)) continue;
    // With a proclitic glued to it («و<») the symbol is named, whatever comes before.
    if (!m[1] && !namesSymbol(/(\S*)[^\S\n]*$/.exec(masked.slice(0, m.index))[1])) continue;
    if (!namesSymbol(/^[^\S\n]*(\S*)/.exec(masked.slice(end))[1])) continue;
    out.push([start, end]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// A comparison operator standing alone: after a space, a line's start, an opening quote or bracket, or a one-letter
// proclitic (و ف ب ل ك), and before a space, the end or punctuation. "=" and "==" aren't mirrored.
const LONE_OP = /(?<=^|[\s«"(])([وفبلك]?)(?:<=|>=|!=|<>|<|>|≤|≥|≠)(?=$|[\s،؛؟.,:;!?»")])/gm;
/**
 * A neighbour that leaves the operator a named symbol: nothing (the line's start or end, or only punctuation), or an
 * Arabic word, which may be another operator named with its proclitic («و< و>»). Not an operand: a number (Latin or
 * Arabic-Indic), a one-letter variable, code (Latin letters, or an isolate, masked as U+0001), an ellipsis, or other
 * symbols.
 */
const namesSymbol = (word) => {
  const w = word.replace(/^[«"(]+|[»")،؛؟.,:;!?]+$/g, "");
  return !w || (ARABIC.test(w) && !/[0-9٠-٩A-Za-z\u0001…]/.test(w) && !/^[؀-ۿ]$/.test(w));
};

/**
 * In s: the first opening bracket it doesn't close and the last closing one it doesn't open (offsets, or -1). Brackets
 * inside a string literal don't count: split("{").
 */
function unpaired(s) {
  const open = [];
  let orphan = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === '"' || (c === "'" && !/[A-Za-z]/.test(s[i - 1] ?? ""))) && s.indexOf(c, i + 1) > i) { i = s.indexOf(c, i + 1); continue; }
    if (c === "(" || c === "[" || c === "{") open.push(i);
    else if (c === ")" || c === "]" || c === "}") {
      const want = { ")": "(", "]": "[", "}": "{" }[c];
      if (open.length && s[open[open.length - 1]] === want) open.pop();
      else orphan = i;
    }
  }
  return { open: open.length ? open[0] : -1, orphan };
}

/**
 * [start, end) of text without what belongs to the sentence: spaces, ending punctuation, unmatched brackets and quotes.
 * A ! glued to a word is kept (n!, P@ssw0rd!), and so is a Python header's colon. A run also ends before an opening
 * bracket it doesn't close, so a citation's bracket stays with the sentence: «⁦NIST AI 100-2⁩ (Vassilev وآخرون، ٢٠٢٤)».
 * An isolate placed earlier (old) keeps its ending punctuation («⁦What is your PIN?⁩») and a run of bare brackets (⁦( [ {⁩).
 */
function trim(text, start, end, old = false) {
  const was = [start, end];
  const run = () => text.slice(start, end);
  const count = (re) => (run().match(re) ?? []).length;
  const ending = () => {
    const r = run();
    const c = r[r.length - 1];
    if (c === undefined) return false;
    if (/\s/.test(c)) return true;
    if (old) return false;
    if (c === "!") return !/[A-Za-z0-9)\]Ͱ-Ͽ]/.test(r[r.length - 2] ?? "");
    if (c === ":") return !HEADER.test(r.trimStart());
    return /[.,;?،؛؟…]/.test(c);
  };
  for (let again = true; again;) {
    again = false;
    while (ending()) { end--; again = true; }
    if (/[)\]}]$/.test(run()) && count(/[([{]/g) < count(/[)\]}]/g)) { end--; again = true; }
    if (/["']$/.test(run()) && count(new RegExp(text[end - 1], "g")) % 2) { end--; again = true; }
    const lead = /^(?:\s+|[:،,;.](?=\s))+/.exec(run());
    if (lead) { start += lead[0].length; again = true; }
    if (/^[([{]/.test(run()) && count(/[([{]/g) > count(/[)\]}]/g)) { start++; again = true; }
    if (/^["']/.test(run()) && count(new RegExp(text[start], "g")) % 2) { start++; again = true; }
    // Brackets the run doesn't pair belong to the sentence: it ends before an opening one and starts after a closing one.
    const { open, orphan } = unpaired(run());
    if (open > 0) { end = start + open; again = true; }
    else if (orphan >= 0 && orphan < end - start - 1) { start += orphan + 1; again = true; }
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

/** The isolates that hold a line break, as their text: none should (a line break ends every isolate on screen). */
export function isolatesOverLines(text) {
  const out = [];
  const stack = [];
  [...text].forEach((ch, i, all) => {
    if (OPENS.has(ch)) stack.push(i);
    else if (ch === PDI && stack.length) { const at = stack.pop(); const inside = all.slice(at + 1, i).join(""); if (inside.includes("\n")) out.push(inside); }
  });
  return out;
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
 * one (placed by hand, or by older rules) stays only where it doesn't overlap a new piece or a line break, without prose
 * punctuation or an unclosed bracket at its edges. So half-isolated code ("⁦m.add(p[c⁩, "science"] <= 3)", "θ ⁦= 3⁩")
 * is mended, and isolates the rules wouldn't add («⁦What is your PIN?⁩») stay.
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
    if (base.slice(os, oe).includes("\n")) continue;
    const [s, e] = trim(base, os, oe, true);
    // Half a formula that goes on in Arabic-Indic digits ("⁦r =⁩ ١٧ ÷ …") goes; "⁦SELECT *⁩" and «⁦>=⁩» stay.
    if (/[A-Za-z0-9Ͱ-Ͽ]/.test(base.slice(s, e)) && /[=<>≤≥≠≈±+\-−×÷⋅*/^]$/.test(base.slice(s, e)) && /^[^\S\n]*[٠-٩]/.test(base.slice(e))) continue;
    if (s < e && !fresh.some(([fs, fe]) => fs < e && s < fe) && !kept.some(([ks, ke]) => ks < e && s < ke)) kept.push([s, e]);
  }
  return wrap(base, [...fresh, ...kept]);
}

/**
 * Every string in a unit's Arabic fields, with its path: [path, text, set(newText)]. Also reads course packs
 * (content/packs, which have no id: pass `root`).
 */
export function arabicStrings(unit, root = unit.id) {
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
  walk(unit, root);
  return out;
}
