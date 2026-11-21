#!/usr/bin/env node
/**
 * Writes Darsi's public pages (TECHNICAL.md "Public pages"): static HTML for search engines and AI answer engines,
 * complete without JavaScript, in English (/courses/…) and Arabic (/ar/courses/…).
 * - vite.config.ts runs it after every build (publicPages), into the build folder.
 * - By hand:  node apps/web/scripts/site/build.mjs --out <folder> [--source live|repo|<folder>]
 *   writes the pages and their assets into an empty folder, to look at without building the app.
 *
 * Pages: every published course, every track with courses, the course list, the feature pages and the "why" pages.
 * Also sitemap-pages.xml (every page, both languages), site-pages.json (the list, for tests and llms.txt) and 404.html.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, WEB, loadSiteData } from "./data.mjs";
import { courseModel, coursePage, coursesIndex, orderCourses, trackPage, trackSlug } from "./course.mjs";
import { FEATURE_KEYS, featurePage, featuresIndex } from "./features.mjs";
import { WHY_KEYS, whyPage } from "./why.mjs";
import { PAGE_ROOTS, SITE_URL } from "./roots.mjs";
import { layout, notFound, pathOf, urlOf } from "./render.mjs";
import { LANGS } from "./strings.mjs";
import { esc, pick } from "./util.mjs";

/** The design system's font files the pages use: Latin for every page, Arabic only for Arabic pages (pages.css). */
const FONTS = [
  ["Baloo 2", 700, "baloo-2-latin-700-normal", "latin"],
  ["Noto Sans", "100 900", "noto-sans-latin-wght-normal", "latin"],
  ["Baloo Bhaijaan 2", 700, "baloo-bhaijaan-2-arabic-700-normal", "arabic"],
  ["Noto Sans Arabic", "100 900", "noto-sans-arabic-arabic-wght-normal", "arabic"],
];
const TOKENS = join(ROOT, "packages/design-system/src/tokens/tokens.css");
const FONT_SRC = join(ROOT, "packages/design-system/assets/fonts");

/** The unicode-range of each script, as the design system's own @font-face rules give it. */
function ranges() {
  const css = readFileSync(TOKENS, "utf8");
  const of = (file) => /unicode-range:\s*([^;]+);/.exec(css.split("\n").find((l) => l.includes(`${file}.woff2`)) ?? "")?.[1];
  return { latin: of("noto-sans-latin-wght-normal"), arabic: of("noto-sans-arabic-arabic-wght-normal") };
}

/**
 * The stylesheet: the light theme's tokens and the spacing and radius tokens, the four font faces, then pages.css.
 * Font files are the app's own (same hashed names, so a phone that has the app has them); a folder without a build
 * gets copies.
 */
export function stylesheet(outDir) {
  const tokens = readFileSync(TOKENS, "utf8");
  const blocks = [...tokens.matchAll(/^:root(?:, \[data-theme="light"\])? \{[\s\S]*?^\}/gm)].map((m) => m[0]);
  const assets = join(outDir, "assets");
  mkdirSync(assets, { recursive: true });
  const have = readdirSync(assets);
  const r = ranges();
  const faces = FONTS.map(([family, weight, file, script]) => {
    let name = have.find((f) => f.startsWith(`${file}-`) && f.endsWith(".woff2"));
    if (!name) { name = `${file}-site.woff2`; copyFileSync(join(FONT_SRC, `${file}.woff2`), join(assets, name)); }
    return `@font-face{font-family:"${family}";src:url("/assets/${name}") format("woff2");font-weight:${weight};font-style:normal;font-display:swap;unicode-range:${r[script]}}`;
  });
  const own = readFileSync(join(WEB, "src/styles/pages.css"), "utf8");
  const css = [...faces, ...blocks, own].join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n").replace(/\s*([{};,])\s*/g, "$1").replace(/;}/g, "}").trim();
  const name = `site-${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`;
  writeFileSync(join(assets, name), css);
  return `/assets/${name}`;
}

/** The brand mark, inline (no request): the design system's own SVG. */
const mark = () => readFileSync(join(ROOT, "packages/design-system/assets/logos/darsi-mark.svg"), "utf8")
  .replace("<svg ", '<svg aria-hidden="true" focusable="false" ').replace(/\s*width="64" height="64"/, "");

/** Every page this data makes, in both languages: [{ slug, en, ar }]. */
export function makePages(data) {
  const models = orderCourses(data.units.map((u) => courseModel(u, data)), data.tracks);
  // Every visible track has a page, with or without courses now: the home page links to each.
  const tracks = data.tracks;
  const slugs = new Set(["courses", ...tracks.map((t) => trackSlug(t.id)), ...models.map((m) => `courses/${m.id}`),
    ...(FEATURE_KEYS.length ? ["features", ...FEATURE_KEYS.map((k) => `features/${k}`)] : []), ...WHY_KEYS.map((k) => (k === "index" ? "why-darsi" : `why-darsi/${k}`))]);
  // Track pages and course pages share /courses/<id>/: a course may never take a track's id.
  for (const m of models) if (tracks.some((t) => t.id === m.id)) throw new Error(`public pages: course ${m.id} has the same address as a track`);
  const ctx = { has: (slug) => slugs.has(slug) };
  const out = [];
  const both = (make) => { const pages = Object.fromEntries(LANGS.map((lang) => [lang, make(lang)])); out.push({ slug: pages.en.slug, ...pages }); };
  both((lang) => coursesIndex(lang, data, models));
  for (const t of tracks) both((lang) => trackPage(t, lang, data, models, ctx));
  for (const m of models) both((lang) => coursePage(m, lang, data, models, ctx));
  if (FEATURE_KEYS.length) both((lang) => featuresIndex(lang, data, models));
  for (const k of FEATURE_KEYS) both((lang) => featurePage(k, lang, data, models));
  for (const k of WHY_KEYS) both((lang) => whyPage(k, lang, data, models));
  for (const p of out) {
    if (!PAGE_ROOTS.includes(p.slug.split("/")[0])) throw new Error(`public pages: ${p.slug} is outside ${PAGE_ROOTS.join(", ")} (roots.mjs)`);
    if (p.en.slug !== p.ar.slug) throw new Error(`public pages: ${p.en.slug} and ${p.ar.slug} differ`);
  }
  return { pages: out, models, ctx };
}

/** sitemap-pages.xml: each page in both languages, each naming the other. */
export function sitemap(pages) {
  const alt = (slug) => LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(slug, l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(slug, "en")}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.flatMap((p) => LANGS.map((l) => `<url><loc>${urlOf(p.slug, l)}</loc>${alt(p.slug)}</url>`)).join("\n")}
</urlset>
`;
}

/** Write everything into outDir. Returns what was written. */
export async function buildSite({ outDir, data, log = console.log }) {
  const out = resolve(outDir);
  const { pages, models } = makePages(data);
  const css = stylesheet(out);
  const ctx = { css, mark: mark(), has: () => true };
  const slugs = new Set(pages.map((p) => p.slug));
  ctx.has = (slug) => slugs.has(slug);
  for (const p of pages) for (const lang of LANGS) {
    const file = join(out, pathOf(p.slug, lang), "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, layout(p[lang], ctx));
  }
  writeFileSync(join(out, "sitemap-pages.xml"), sitemap(pages));
  writeFileSync(join(out, "404.html"), notFound(ctx));
  // /ar/ alone: the Arabic home page is the app's (/?lang=ar). Hosting turns /ar into /ar/ (a folder), and this sends
  // people on, with no script; search engines read an immediate refresh as a redirect, and noindex keeps it out.
  writeFileSync(join(out, "ar", "index.html"), `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>درسي</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=/?lang=ar">
<link rel="canonical" href="${SITE_URL}/?lang=ar">
<link rel="stylesheet" href="${esc(css)}">
</head>
<body class="pp"><main class="pp-main"><p><a href="/?lang=ar">افتح «درسي» بالعربية</a></p></main></body>
</html>
`);
  const list = pages.map((p) => ({ slug: p.slug, kind: p.en.kind, title: { en: p.en.title, ar: p.ar.title }, h1: { en: p.en.h1, ar: p.ar.h1 }, description: { en: p.en.description, ar: p.ar.description } }));
  writeFileSync(join(out, "site-pages.json"), JSON.stringify({ site: SITE_URL, from: data.from, courses: models.map((m) => m.id), pages: list }));
  log(`public pages: ${pages.length * LANGS.length} pages (${models.length} courses, from ${data.from}), ${css}`);
  return { pages, models, css };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const outDir = arg("--out");
  if (!outDir) { console.error("usage: node apps/web/scripts/site/build.mjs --out <folder> [--source live|repo|<folder>]"); process.exit(2); }
  const data = await loadSiteData({ source: arg("--source", "live") });
  await buildSite({ outDir, data });
  // The favicon and icons the pages link to, so the folder can be served on its own.
  for (const f of ["favicon.svg", "robots.txt"]) if (existsSync(join(WEB, "public", f)) && !existsSync(join(outDir, f))) copyFileSync(join(WEB, "public", f), join(outDir, f));
}
export { esc, pick };
