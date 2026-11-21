/**
 * What a built app loads at startup, and what its service worker precaches: the parts of scripts/check-bundle.mjs that
 * can be tested (apps/web/tests/check-bundle.test.ts). Nothing here builds anything; it only reads a build directory.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * 1024 bytes, the unit of every startup figure in CLAUDE.md ("startup 8 files, 224.0 KB gzipped"), so a new measurement
 * compares with the old ones. (Vite's own build report counts 1000 bytes to the kB and reads about 2% higher.)
 */
export const KB = 1024;

/**
 * A static import or re-export of another built file: `import{a as b}from"./x.js"`, `import"./x.js"`,
 * `export{a}from"./x.js"`. A lazy `import("./x.js")` has a bracket before the quote and never matches.
 */
const STATIC_IMPORT = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\bfrom\s*)?["'](\.{1,2}\/[^"'\n]+?\.js)["']/g;

/** The files a built chunk imports statically, as paths from the build directory. */
export function staticImports(code, file) {
  const out = [];
  for (const m of code.matchAll(STATIC_IMPORT)) out.push(posix.normalize(posix.join(posix.dirname(file), m[1])));
  return out;
}

const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag)?.[1];
const local = (url) => (url && url.startsWith("/") && !url.startsWith("//") ? url.slice(1).split(/[?#]/)[0] : undefined);

/**
 * The startup files of a build: index.html's module script (the entry), its modulepreload links, and every file those
 * import statically, each with its size gzipped. The Chrome 61 build (nomodule, "-legacy") is left out: modern phones
 * never request it. Also, for the report only, the stylesheets index.html links and its plain scripts (`<script src>`
 * with no type, like /boot.js): every phone loads those before the app too, but they are not in the budget.
 */
export function startup(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const tags = html.match(/<(?:script|link)\b[^>]*>/g) ?? [];
  const entries = [], preloads = [], css = [], plain = [];
  for (const tag of tags) {
    if (tag.startsWith("<script")) {
      // A lookbehind, so the legacy entry's data-src is not read as a src.
      const src = local(/(?<![\w-])src\s*=\s*["']([^"']+)["']/.exec(tag)?.[1]);
      if (!src || /\bnomodule\b/.test(tag)) continue;
      if (/\btype\s*=\s*["']module["']/.test(tag)) entries.push(src);
      else if (!/\btype\s*=/.test(tag)) plain.push(src);
    } else {
      const href = local(attr(tag, "href")), rel = attr(tag, "rel");
      if (href && rel === "modulepreload") preloads.push(href);
      if (href && rel === "stylesheet") css.push(href);
    }
  }
  if (entries.length !== 1) throw new Error(`index.html should have one module script with a src; found ${entries.length}`);
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const path = join(dir, file);
    // A name inside a string that looked like an import: only real files of the build count.
    if (!existsSync(path)) return;
    const buf = readFileSync(path);
    seen.set(file, { file, bytes: buf.length, gzip: gzipSync(buf).length });
    for (const next of staticImports(buf.toString("utf8"), file)) visit(next);
  };
  visit(entries[0]);
  for (const p of preloads) visit(p);
  const files = [...seen.values()].sort((a, b) => b.gzip - a.gzip);
  const sized = (file) => { const buf = readFileSync(join(dir, file)); return { file, bytes: buf.length, gzip: gzipSync(buf).length }; };
  const there = (list) => list.filter((f) => existsSync(join(dir, f))).map(sized);
  return { entry: entries[0], files, gzip: files.reduce((s, f) => s + f.gzip, 0), css: there(css), scripts: there(plain) };
}

/** The URLs sw.js precaches (Workbox writes them as {url:"…",revision:…} entries). */
export function precached(dir) {
  const sw = readFileSync(join(dir, "sw.js"), "utf8");
  return [...sw.matchAll(/\{\s*"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** LAZY_SCREENS as apps/web/vite.config.ts lists it, read from its text (the file itself does not load under plain Node). */
export function lazyScreens(viteConfig) {
  const m = /const LAZY_SCREENS\s*=\s*\[([^\]]*)\]/.exec(viteConfig);
  const names = m ? [...m[1].matchAll(/["']([\w-]+)["']/g)].map((x) => x[1]) : [];
  if (!names.length) throw new Error("LAZY_SCREENS not found in apps/web/vite.config.ts: update scripts/lib/bundle.mjs to wherever the list moved");
  return names;
}

/**
 * The files the precache must leave out. These repeat ON_DEMAND in apps/web/vite.config.ts (which imports Vite and its
 * plugins and reads files as it loads, so it cannot be imported here); keep the two in step. The screens come from that
 * file's own LAZY_SCREENS list.
 */
export function onDemandPatterns(screens) {
  return [
    { what: "a lab app", re: /(?:^|\/)lab-[^/]*\.js$/ },
    { what: "the code steps or their sandbox", re: /(?:^|\/)(?:CodeSteps|sandbox)-[^/]*\.(?:js|css)$/ },
    { what: "Darsi Tiny", re: /(?:^|\/)tinylm-[^/]*\.js$/ },
    { what: "the Firebase SDK", re: /(?:^|\/)firebase-(?:extra-)?[\w-]{8}\.(?:js|css)$/ },
    { what: "exceljs", re: /(?:^|\/)exceljs[^/]*\.js$/ },
    { what: "a light-lesson technology pack", re: /(?:^|\/)lessonstudio-pack-[^/]*\.js$/ },
    { what: "the Chrome 61 build", re: /-legacy/ },
    { what: "a staff or first-visit screen (LAZY_SCREENS)", re: new RegExp(`(?:^|/)(?:${screens.join("|")})-[^/]*\\.(?:js|css)$`) },
  ];
}

/**
 * Check a build against the budget. Returns the measurements and a list of problems (empty when the build passes).
 * `has`: a text one of the startup files must contain (the Firebase project id, for a release).
 */
export function checkBundle(dir, budget, { screens, has } = {}) {
  const problems = [];
  const s = startup(dir);
  const kb = s.gzip / KB;
  if (s.files.length > budget.maxFiles) problems.push(`startup is ${s.files.length} files; the budget is ${budget.maxFiles}`);
  if (kb > budget.maxGzipKB) problems.push(`startup is ${kb.toFixed(1)} KB gzipped; the budget is ${budget.maxGzipKB} KB`);
  // Guests never load the Firebase SDK: none of its chunks ("firebase-…", vite.config.ts) may be a startup file.
  for (const f of s.files) if (/firebase-/.test(posix.basename(f.file))) problems.push(`the Firebase SDK is in the startup files: ${f.file}`);
  const urls = precached(dir);
  if (!urls.length) problems.push("sw.js lists no precached files (has the service worker's format changed?)");
  const patterns = onDemandPatterns(screens ?? []);
  const lazy = [];
  for (const url of urls) {
    const hit = patterns.find((p) => p.re.test(url));
    if (hit) { lazy.push(url); problems.push(`sw.js precaches ${url}, which should load on demand (${hit.what})`); }
  }
  if (has !== undefined && !s.files.some((f) => readFileSync(join(dir, f.file), "utf8").includes(has))) problems.push(`no startup file contains "${has}": this build was not made with that project's settings`);
  return { startup: s, kb, precache: urls, problems };
}
