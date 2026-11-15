#!/usr/bin/env node
/**
 * Phrases (src/i18n/phrases.ts, files in public/content/phrases/<lang>/<area>.json): what each added language
 * translates outside the UI strings, and what it is missing.
 *
 *   node apps/web/scripts/phrases.mjs                   coverage of every language in src/i18n/phrases/<lang>/
 *   node apps/web/scripts/phrases.mjs sources <dir>     the English to translate, one <area>.json array per area
 *   node apps/web/scripts/phrases.mjs missing <lang> <dir>   only what <lang> has no translation for yet
 *
 * Areas:
 *   labs        the Labs catalogue and kit: shelf names, every app's title and summary, the kit's words, and app files
 *               other apps import (agentloop/lab-agents, inject/lab-tiny…).
 *   lab-<id>    one app's own words: the English side of every { en, ar } table in labs/apps/<id>/ (not meta.ts).
 *               A function string whose body is a template that only fills in its arguments is keyed with markers:
 *               (n, s) => `${n} of ${s}` → "{0} of {1}". Any other function stays English (useS, labs/kit/strings.ts).
 *   placement   every English text in public/content/placement.json (the onboarding check).
 *   landing     every t("English", "Arabic") pair in src/landing/content.ts (the home page).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// A path, not new URL(".."): under the test runner (jsdom) URL is jsdom's, which fileURLToPath refuses.
const WEB = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(WEB, "package.json"));
const ts = require("typescript");
const SRC = join(WEB, "src");
const LABS = join(SRC, "labs");
const PHRASES = join(WEB, "public/content/phrases");

const wordy = (s) => typeof s === "string" && (s.match(/\p{L}/gu)?.length ?? 0) >= 2;
const walkDir = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walkDir(p, out); else if (/\.tsx?$/.test(f)) out.push(p); } return out; };
const parse = (f) => ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const strip = (e) => { while (e && (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isTypeAssertionExpression?.(e))) e = e.expression; return e; };

/** The text a function string returns for the markers {0}, {1}…, or undefined when it does more than fill them in. */
function templateKey(fn) {
  const body = strip(fn.body);
  const params = fn.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
  if (ts.isNoSubstitutionTemplateLiteral(body) || ts.isStringLiteral(body)) return body.text;
  if (!ts.isTemplateExpression(body)) return undefined;
  let s = body.head.text;
  for (const span of body.templateSpans) {
    const e = strip(span.expression);
    const i = ts.isIdentifier(e) ? params.indexOf(e.text) : -1;
    if (i < 0) return undefined;
    s += `{${i}}` + span.literal.text;
  }
  return s;
}

/** Every English string in one value of a { en, ar } table. */
function collect(e, out) {
  e = strip(e);
  if (!e) return;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { if (wordy(e.text)) out.add(e.text); return; }
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) { const k = templateKey(e); if (wordy(k)) out.add(k); return; }
  if (ts.isObjectLiteralExpression(e)) { for (const p of e.properties) if (ts.isPropertyAssignment(p)) collect(p.initializer, out); else if (ts.isMethodDeclaration(p)) { const k = templateKey(p); if (wordy(k)) out.add(k); } return; }
  if (ts.isArrayLiteralExpression(e)) { for (const x of e.elements) collect(x, out); return; }
}

/** The English of every object with both `en` and `ar` in a file. */
function fileStrings(f) {
  const out = new Set();
  const sf = parse(f);
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(node.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(sf).replace(/^["']|["']$/g, ""), p.initializer]));
      if (props.has("en") && props.has("ar")) { collect(props.get("en"), out); return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function sources() {
  const areas = {};
  const add = (area, set) => { areas[area] ??= new Set(); for (const s of set) areas[area].add(s); };
  // App files other apps import go with the catalogue, so each app finds them whichever loads first.
  const shared = new Set();
  const appFiles = walkDir(join(LABS, "apps"));
  for (const f of appFiles) {
    const text = readFileSync(f, "utf8");
    const own = relative(join(LABS, "apps"), f).split(sep)[0];
    for (const m of text.matchAll(/from "\.\.\/([\w-]+)\/([\w.-]+)"/g)) if (m[1] !== own) shared.add(join(LABS, "apps", m[1], m[2]));
  }
  const isShared = (f) => shared.has(f.replace(/\.tsx?$/, ""));
  for (const f of walkDir(join(LABS, "kit"))) add("labs", fileStrings(f));
  add("labs", fileStrings(join(LABS, "categories.ts")));
  for (const f of appFiles) {
    const id = relative(join(LABS, "apps"), f).split(sep)[0];
    add(f.endsWith(`${sep}meta.ts`) || isShared(f) ? "labs" : `lab-${id}`, fileStrings(f));
  }
  // The onboarding check.
  const pl = new Set();
  const walkJson = (x) => { if (Array.isArray(x)) x.forEach(walkJson); else if (x && typeof x === "object") { if (typeof x.en === "string" && "ar" in x) { if (wordy(x.en)) pl.add(x.en); } else Object.values(x).forEach(walkJson); } };
  walkJson(JSON.parse(readFileSync(join(WEB, "public/content/placement.json"), "utf8")));
  add("placement", pl);
  // The home page: t("English", "Arabic").
  const lp = new Set();
  const sf = parse(join(SRC, "landing/content.ts"));
  const visit = (n) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "t" && n.arguments.length === 2) { const a = strip(n.arguments[0]); if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && wordy(a.text)) lp.add(a.text); } ts.forEachChild(n, visit); };
  visit(sf);
  add("landing", lp);
  // A string the catalogue already carries needn't be translated again for each app.
  for (const [a, set] of Object.entries(areas)) if (a.startsWith("lab-")) { for (const s of areas.labs) set.delete(s); if (!set.size) delete areas[a]; }
  return Object.fromEntries(Object.entries(areas).sort(([a], [b]) => a.localeCompare(b)).map(([a, s]) => [a, [...s]]));
}

/**
 * What a lab computes on, per area: string literals outside its { en, ar } tables (Darsi Tiny's example requests, ids,
 * replies) and the English of UPPER_CASE { en, ar } constants (CORPUS, PROMPTS, SECRET…). For every language but
 * Arabic the lab runs on that English, so a translation must keep it: a phrase that IS such a string stays identical,
 * and one that quotes it (“…”, "…", «…», ‘…’) must quote it unchanged. checkData() lists the phrases that don't.
 */
export function labData() {
  const out = {};
  const appsDir = join(LABS, "apps");
  for (const f of walkDir(appsDir)) {
    if (f.endsWith(`${sep}meta.ts`)) continue;
    const id = relative(appsDir, f).split(sep)[0];
    const set = (out[`lab-${id}`] ??= { exact: new Set(), text: [] });
    const sf = parse(f);
    const visit = (node, inTable) => {
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map(node.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(sf).replace(/^["']|["']$/g, ""), p.initializer]));
        if (props.has("en") && props.has("ar")) {
          const decl = node.parent && ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(sf) : "";
          if (/^[A-Z][A-Z0-9_]+$/.test(decl) && decl !== "S") { const en = new Set(); collect(props.get("en"), en); for (const s of en) { set.exact.add(s); set.text.push(s); } }
          return; // a table: display text, translated
        }
      }
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !inTable && wordy(node.text) && /\s/.test(node.text.trim())) {
        const p = node.parent;
        // Not imports, types or JSX attributes (class names, aria): those are code.
        if (!ts.isImportDeclaration(p) && !ts.isLiteralTypeNode(p) && !ts.isJsxAttribute(p) && !ts.isExportDeclaration(p)) { set.exact.add(node.text); set.text.push(node.text); }
      }
      ts.forEachChild(node, (c) => visit(c, inTable));
    };
    visit(sf, false);
  }
  return out;
}
const QUOTED = /[“"«‘]\s*([^“”"«»‘’]{2,120}?)\s*[”"»’]/g;
/** Phrases that translate what a lab computes on: [area, English, translation, the part that must stay as written]. */
export function checkData(lang) {
  const data = labData();
  const have = readLang(lang);
  const bad = [];
  for (const [area, dict] of Object.entries(have)) {
    const d = data[area];
    if (!d) continue;
    const lower = d.text.map((t) => t.toLowerCase());
    for (const [k, v] of Object.entries(dict)) {
      if (d.exact.has(k) && v !== k) { bad.push([area, k, v, k]); continue; }
      for (const m of k.matchAll(QUOTED)) {
        const q = m[1];
        const isData = d.exact.has(q) || (/[A-Za-z]/.test(q) && lower.some((t) => new RegExp(`(^|[^\\p{L}])${q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(t)));
        if (isData && !v.includes(q)) bad.push([area, k, v, q]);
      }
    }
  }
  return bad;
}

const marks = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(" ");
export function readLang(lang) {
  const d = join(PHRASES, lang);
  if (!existsSync(d)) return {};
  return Object.fromEntries(readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(d, f), "utf8"))]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, a, b] = process.argv.slice(2);
  const src = sources();
  if (cmd === "sources" || cmd === "missing") {
    const lang = cmd === "missing" ? a : null;
    const out = cmd === "missing" ? b : a;
    if (!out || (cmd === "missing" && !lang)) { console.error("Usage: phrases.mjs sources <dir> | missing <lang> <dir>"); process.exit(1); }
    mkdirSync(out, { recursive: true });
    const have = lang ? readLang(lang) : {};
    let n = 0, chars = 0;
    for (const [area, list] of Object.entries(src)) {
      const left = list.filter((s) => !have[area]?.[s]);
      if (!left.length) continue;
      writeFileSync(join(out, `${area}.json`), JSON.stringify(left, null, 1) + "\n");
      n += left.length; chars += left.reduce((x, s) => x + s.length, 0);
    }
    console.log(`${n} strings (${chars} characters) in ${out}`);
  } else {
    const langs = existsSync(PHRASES) ? readdirSync(PHRASES).filter((d) => statSync(join(PHRASES, d)).isDirectory()) : [];
    const total = Object.values(src).reduce((x, l) => x + l.length, 0);
    console.log(`${total} English strings in ${Object.keys(src).length} areas.`);
    for (const lang of langs) {
      const have = readLang(lang);
      let done = 0, stale = 0; const bad = [];
      for (const [area, list] of Object.entries(src)) for (const s of list) if (have[area]?.[s]) { done++; if (marks(s) !== marks(have[area][s])) bad.push(`${area}: ${s}`); }
      for (const [area, dict] of Object.entries(have)) for (const k of Object.keys(dict)) if (!src[area]?.includes(k)) stale++;
      const data = checkData(lang);
      console.log(`  ${lang}: ${done}/${total} translated, ${stale} no longer used${bad.length ? `, ${bad.length} with wrong markers` : ""}${data.length ? `, ${data.length} translating what a lab computes on` : ""}`);
      for (const x of bad.slice(0, 10)) console.log(`    markers differ: ${x}`);
      if (cmd === "data") for (const [area, k, , q] of data) console.log(`    ${area}: keep “${q}” in: ${k.slice(0, 90)}`);
    }
  }
}
