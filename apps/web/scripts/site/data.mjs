/**
 * What the public pages are made from (TECHNICAL.md "Public pages"), all read when the site is built:
 * - The published courses: the live catalog (content/catalog.json in Storage) says which courses are public now, and
 *   each course's page is written from its published file (content/units/<id>/v<n>.json), the very file learners get.
 *   Published files never change (a new version is a new file), so they are kept in a cache folder by version and a
 *   rebuild downloads only what was republished. The repository's content/units/ is only the fallback for builds that
 *   aren't releases (no network): it may hold work not yet published.
 * - Tracks: the app's built-in tracks (src/content/tracks.ts) with the live settings' names, levels, order and hidden flag.
 * - Labs (src/labs/apps/<id>/meta.ts), competencies (src/content/competencies.ts), the shelves, school stages (i18n),
 *   and each track's three points from the home page (src/landing/content.ts): the app's own words.
 * TypeScript sources are read with the TypeScript compiler (type-only imports), so this runs under plain Node too.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const WEB = resolve(here, "../..");
export const ROOT = resolve(WEB, "../..");
export const BUCKET = "darsi-f0685";
export const storageUrl = (path) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
export const CACHE = join(WEB, "node_modules/.cache/darsi-site");

const require = createRequire(import.meta.url);
/** A TypeScript module whose only imports are types, as a JavaScript module (its exports). */
export async function loadTs(file) {
  const ts = require("typescript");
  const src = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false }, fileName: file });
  if (/^\s*import\s+(?!type\b)/m.test(outputText)) throw new Error(`${file} imports code; only type imports can be read here`);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${encodeURIComponent(pathToFileURL(file).href)}`);
}

async function fetchJson(url, ms = 10000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
function keep(file, value) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); }

/**
 * The published courses and the settings. `source`: "live" (Storage, with the cache for what it already has), or a
 * folder holding catalog.json, settings.json and units/<id>.json (tests, and builds that mustn't touch the network),
 * or "repo": every course in content/units (never a release: they may not be published).
 * `strict`: a release; refuse to fall back to the repository's unpublished sources.
 */
export async function loadPublished({ source = "live", strict = false, cache = CACHE, log = console.log } = {}) {
  if (source === "repo") return fromRepo(log);
  if (source !== "live") {
    const dir = resolve(source);
    const catalog = readJson(join(dir, "catalog.json"));
    const settings = existsSync(join(dir, "settings.json")) ? readJson(join(dir, "settings.json")) : null;
    const units = publicEntries(catalog).map((e) => readJson(join(dir, "units", `${e.id}.json`)));
    return { catalog, settings, units, from: dir };
  }
  let catalog, settings, from = "live";
  try {
    [catalog, settings] = await Promise.all([fetchJson(storageUrl("content/catalog.json")), fetchJson(storageUrl("content/settings.json")).catch(() => null)]);
    keep(join(cache, "catalog.json"), catalog);
    if (settings) keep(join(cache, "settings.json"), settings);
  } catch (e) {
    if (!existsSync(join(cache, "catalog.json"))) {
      if (strict) throw new Error(`public pages: the live catalog couldn't be read (${e.message}) and there is no cached copy. A release needs it.`);
      log(`public pages: no live catalog (${e.message}); using the repository's course sources, which may hold unpublished work`);
      return fromRepo(log);
    }
    log(`public pages: no live catalog (${e.message}); using the copy from the last build`);
    catalog = readJson(join(cache, "catalog.json"));
    settings = existsSync(join(cache, "settings.json")) ? readJson(join(cache, "settings.json")) : null;
    from = "cache";
  }
  const units = [];
  for (const e of publicEntries(catalog)) {
    const file = join(cache, "units", e.id, `v${e.version}.json`);
    if (existsSync(file)) { units.push(readJson(file)); continue; }
    try {
      if (from !== "live") throw new Error("offline");
      const u = await fetchJson(storageUrl(e.src ?? `content/units/${e.id}/v${e.version}.json`), 30000);
      keep(file, u);
      units.push(u);
    } catch (err) {
      if (strict) throw new Error(`public pages: course ${e.id} v${e.version} couldn't be read (${err.message})`);
      const repo = join(ROOT, "content/units", `${e.id}.json`);
      if (!existsSync(repo)) { log(`public pages: skipping ${e.id} (no published file, no source)`); continue; }
      log(`public pages: ${e.id} from the repository source (its published file couldn't be read)`);
      units.push(readJson(repo));
    }
  }
  return { catalog, settings, units, from };
}

/** Courses everyone may open: Darsi's own (an organization's courses are its members' only). */
export const publicEntries = (catalog) => (catalog?.units ?? []).filter((e) => (!e.owner || e.owner === "public") && e.available !== false);

function fromRepo(log) {
  const dir = join(ROOT, "content/units");
  const units = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson(join(dir, f)));
  log(`public pages: ${units.length} courses from content/units (not a release)`);
  const catalog = { version: 1, units: units.map((u) => ({ id: u.id, track: u.track, level: u.level, title: u.title, summary: u.summary, lessons: u.lessons.length, owner: "public", ...(u.audience ? { audience: u.audience } : {}), ...(u.teach ? { teach: u.teach } : {}) })) };
  return { catalog, settings: null, units, from: "repo" };
}

/** The app's own data the pages describe. */
export async function loadAppData() {
  const src = join(WEB, "src");
  const [{ BUILTIN_TRACKS }, { COMPETENCIES }, { CATEGORIES }, { landing }, { RUNTIMES }] = await Promise.all([
    loadTs(join(src, "content/tracks.ts")), loadTs(join(src, "content/competencies.ts")), loadTs(join(src, "labs/categories.ts")), loadTs(join(src, "landing/content.ts")),
    loadTs(join(src, "content/runtimes.ts")),
  ]);
  const appsDir = join(src, "labs/apps");
  const metas = [];
  for (const d of readdirSync(appsDir, { withFileTypes: true })) {
    const f = join(appsDir, d.name, "meta.ts");
    if (d.isDirectory() && existsSync(f)) metas.push((await loadTs(f)).meta);
  }
  const shelf = new Map(CATEGORIES.map((c, i) => [c.id, { ...c, rank: i }]));
  const labs = metas.map((m) => ({ ...m, track: shelf.get(m.category)?.track ?? "ai" }))
    .sort((a, b) => (shelf.get(a.category)?.rank ?? 99) - (shelf.get(b.category)?.rank ?? 99) || a.order - b.order || a.id.localeCompare(b.id));
  const i18n = { en: readJson(join(src, "i18n/en.json")), ar: readJson(join(src, "i18n/ar.json")) };
  const stages = Object.fromEntries(["en", "ar"].map((lang) => [lang, Object.fromEntries(["primary", "lower", "upper", "university"].map((s) => [s, { name: i18n[lang][`stage.${s}`], ages: i18n[lang][`stage.${s}D`] }]))]));
  return {
    builtinTracks: BUILTIN_TRACKS,
    competencies: new Map(COMPETENCIES.map((c) => [c.code, c])),
    categories: CATEGORIES,
    labs: new Map(labs.map((l) => [l.id, l])),
    stages,
    trackCopy: new Map(landing.tracks.items.map((t) => [t.track, t])),
    // The code runtimes a lesson downloads once (Python, SQL), with their sizes.
    runtimes: RUNTIMES,
  };
}

/** The tracks as phones see them: built-ins with the published names, levels and order; hidden ones left out. */
export function mergeTracks(builtin, published) {
  const out = new Map();
  for (const t of published ?? []) {
    const b = builtin.find((x) => x.id === t.id);
    out.set(t.id, b ? { ...t, icon: b.icon, tone: b.tone, builtIn: true, ...(t.levelNames?.some((n) => n?.en) ? {} : { levelNames: b.levelNames }) } : { ...t, builtIn: false });
  }
  for (const b of builtin) if (!out.has(b.id)) out.set(b.id, b);
  return [...out.values()].filter((t) => !t.hidden).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Everything the page writers take. */
export async function loadSiteData(opts = {}) {
  const [pub, app] = await Promise.all([loadPublished(opts), loadAppData()]);
  const tracks = mergeTracks(app.builtinTracks, pub.settings?.tracks);
  const visible = new Set(tracks.map((t) => t.id));
  const catalog = new Map(publicEntries(pub.catalog).map((e) => [e.id, e]));
  return { ...app, tracks, units: pub.units.filter((u) => visible.has(u.track)), catalog, from: pub.from, settings: pub.settings };
}
