/**
 * Course translations for the languages platform admins added (fr, es, de, pt…), kept beside the courses:
 * content/i18n/units/<lang>/<unitId>.json = { "<path>": { "en": <the English it was made from>, "t": <translation> } }.
 * A path is where the text sits in the unit ("lessons.0.steps.3.prompt"); the value has the English's shape (a string,
 * or a list such as a fill-in sentence with its {blank} objects). `apply()` adds `t` under the language only where the
 * unit's English is still exactly `en`, so a sentence rewritten since shows in English until it is translated again.
 *
 *   node scripts/unit-i18n.mjs                         coverage per language (and translations gone stale)
 *   node scripts/unit-i18n.mjs sources <dir> [ids…]    what to translate: <dir>/<unitId>.json = [{ p, en }]
 *   node scripts/unit-i18n.mjs missing <lang> <dir> [ids…]   only what <lang> lacks or has stale
 *   node scripts/unit-i18n.mjs assemble <lang> <dir>   <dir>/<unitId>.json = { "<path>": translation } → the files above
 *
 * A university course's pack (content/packs/<unitId>.json: syllabus, problems, lab, rubric) is translated the same way in
 * pack-<unitId>.json beside it; build-kits applies it to the course-pack PDF.
 *
 * scripts/seed-content.mjs and apps/web/scripts/build-kits.mjs apply them, so drafts, published courses and kits carry
 * every translated language. English and Arabic are written in the unit itself and never come from here.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const UNITS = join(ROOT, "content/units");
export const DIR = join(ROOT, "content/i18n/units");
export const PACKS = join(ROOT, "content/packs");

/** Fields keyed by language that hold files, times or sizes, not text. */
const NOT_TEXT = new Set(["sources", "captions", "light", "atBy", "sizeKB", "files", "poster", "langs"]);
const PATHLIKE = /^(\/|https?:|data:)|\.(json|mp4|vtt|m4a|pdf|pptx|png|jpe?g|svg|webp)$/i;
const isLocal = (x) => x && typeof x === "object" && !Array.isArray(x) && "en" in x && "ar" in x;
const textual = (v) => (typeof v === "string" ? v.trim() !== "" && !PATHLIKE.test(v.trim()) : Array.isArray(v) && v.some((e) => typeof e === "string" && e.trim()));

/** Every translatable text in a unit: [path, English]. */
export function localNodes(unit) {
  const out = [];
  const walk = (x, path, key) => {
    if (NOT_TEXT.has(key)) return;
    if (isLocal(x)) { if (textual(x.en)) out.push([path, x.en]); return; }
    if (Array.isArray(x)) x.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), key));
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, path ? `${path}.${k}` : k, k);
  };
  walk(unit, "", "");
  return out;
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Same shape as the English: a string for a string, a list of the same length with objects (blanks) in place. */
export function sameShape(en, t) {
  if (typeof en === "string") return typeof t === "string" && t.trim() !== "";
  if (!Array.isArray(en) || !Array.isArray(t) || t.length !== en.length) return false;
  return en.every((e, i) => (typeof e === "string" ? typeof t[i] === "string" : same(e, t[i])));
}

export function readOverlay(lang, unitId) {
  const f = join(DIR, lang, `${unitId}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
}
export const overlayLangs = () => (existsSync(DIR) ? readdirSync(DIR).filter((d) => /^[a-z]{2,3}(-[a-z0-9]+)?$/.test(d)) : []);

/**
 * The unit (or, with `name` "pack-<id>", its course pack) with every language's translations added where its English
 * hasn't changed. Returns a copy.
 */
export function apply(unit, langs = overlayLangs(), name = unit.id) {
  const u = structuredClone(unit);
  const stats = {};
  for (const lang of langs) {
    if (lang === "en" || lang === "ar") continue;
    const o = readOverlay(lang, name);
    let done = 0, stale = 0;
    for (const [p, entry] of Object.entries(o)) {
      const node = get(u, p);
      if (!isLocal(node)) { stale++; continue; }
      if (!same(node.en, entry.en) || !sameShape(node.en, entry.t)) { stale++; continue; }
      // Text the unit already has in this language wins: a video's transcript written by import-media from its
      // narration matches what the video says; a translation of the English would not.
      if (node[lang] === undefined) node[lang] = entry.t;
      done++;
    }
    stats[lang] = { done, stale };
  }
  return { unit: u, stats };
}

const unitIds = (ids) => (ids.length ? ids : readdirSync(UNITS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
/** A unit, or "pack-<id>" for its course pack. */
const readUnit = (id) => JSON.parse(readFileSync(id.startsWith("pack-") ? join(PACKS, `${id.slice(5)}.json`) : join(UNITS, `${id}.json`), "utf8"));
const withPacks = (ids) => ids.flatMap((id) => (existsSync(join(PACKS, `${id}.json`)) ? [id, `pack-${id}`] : [id]));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "sources" || cmd === "missing") {
    const lang = cmd === "missing" ? rest.shift() : null;
    const out = rest.shift();
    if (!out) { console.error("Usage: unit-i18n.mjs sources <dir> [ids…] | missing <lang> <dir> [ids…]"); process.exit(1); }
    mkdirSync(out, { recursive: true });
    let n = 0, chars = 0;
    for (const id of withPacks(unitIds(rest))) {
      const unit = readUnit(id);
      const o = lang ? readOverlay(lang, id) : {};
      const list = localNodes(unit).filter(([p, en]) => !lang || !(o[p] && same(o[p].en, en))).map(([p, en]) => ({ p, en }));
      if (!list.length) continue;
      writeFileSync(join(out, `${id}.json`), JSON.stringify(list, null, 1) + "\n");
      n += list.length; chars += JSON.stringify(list.map((x) => x.en)).length;
    }
    console.log(`${n} texts (~${chars} characters) in ${out}`);
  } else if (cmd === "labels") {
    // A course text that quotes a Labs button or label ("press “Run”") should use the label the lab shows in that
    // language (apps/web/public/content/phrases/<lang>/lab-*.json); what a lab computes on stays English (labData).
    const lang = rest[0];
    if (!lang) { console.error("Usage: unit-i18n.mjs labels <lang> [--write]"); process.exit(1); }
    const { labData, readLang } = await import(new URL("../apps/web/scripts/phrases.mjs", import.meta.url).href);
    const data = new Set(Object.values(labData()).flatMap((d) => [...d.exact]));
    const labels = new Map();
    for (const [area, dict] of Object.entries(readLang(lang))) if (area === "labs" || area.startsWith("lab-")) for (const [en, t] of Object.entries(dict)) if (en !== t && !data.has(en) && en.length <= 60) labels.set(en, t);
    const Q = /([“"«„‘]\s?)([^“”"«»„‘’]{1,60}?)(\s?[”"»“’])/g;
    let changed = 0;
    for (const f of existsSync(join(DIR, lang)) ? readdirSync(join(DIR, lang)) : []) {
      const o = JSON.parse(readFileSync(join(DIR, lang, f), "utf8"));
      let touched = false;
      const fix = (s) => (typeof s !== "string" ? s : s.replace(Q, (m, a, q, b) => { const t = labels.get(q); if (!t) return m; changed++; touched = true; return `${a}${t}${b}`; }));
      for (const e of Object.values(o)) e.t = Array.isArray(e.t) ? e.t.map(fix) : fix(e.t);
      if (touched && rest.includes("--write")) writeFileSync(join(DIR, lang, f), JSON.stringify(o, null, 1) + "\n");
    }
    console.log(`  ${lang}: ${changed} quoted lab labels ${rest.includes("--write") ? "now in" : "to put in"} ${lang}`);
  } else if (cmd === "assemble") {
    const [lang, from] = rest;
    if (!lang || !from) { console.error("Usage: unit-i18n.mjs assemble <lang> <dir>"); process.exit(1); }
    mkdirSync(join(DIR, lang), { recursive: true });
    for (const f of readdirSync(from).filter((x) => x.endsWith(".json"))) {
      const id = f.slice(0, -5);
      const unit = readUnit(id);
      const nodes = new Map(localNodes(unit));
      const t = JSON.parse(readFileSync(join(from, f), "utf8"));
      const o = readOverlay(lang, id);
      let added = 0; const bad = [];
      for (const [p, v] of Object.entries(t)) {
        const en = nodes.get(p);
        if (en === undefined) { bad.push(`${p}: no such text`); continue; }
        if (!sameShape(en, v)) { bad.push(`${p}: shape differs from the English`); continue; }
        o[p] = { en, t: v }; added++;
      }
      const sorted = Object.fromEntries([...nodes.keys()].filter((p) => o[p]).map((p) => [p, o[p]]));
      writeFileSync(join(DIR, lang, `${id}.json`), JSON.stringify(sorted, null, 1) + "\n");
      console.log(`  ${lang}/${id}: ${added} added${bad.length ? `, ${bad.length} refused: ${bad.slice(0, 3).join("; ")}` : ""}`);
    }
  } else {
    const ids = unitIds([]);
    for (const lang of overlayLangs()) {
      let total = 0, done = 0, stale = 0, units = 0;
      for (const id of ids) {
        const unit = readUnit(id);
        const o = readOverlay(lang, id);
        if (!Object.keys(o).length) continue;
        units++;
        const r = apply(unit, [lang]).stats[lang];
        total += localNodes(unit).length; done += r.done; stale += r.stale;
      }
      console.log(`  ${lang}: ${units} courses, ${done}/${total} texts translated, ${stale} stale`);
    }
  }
}
