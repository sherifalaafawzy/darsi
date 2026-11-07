/**
 * Course editor: where published units live in Storage, who may publish them, and what goes into catalog.json.
 * Pure (no Admin SDK) so it can be unit-tested; content.ts does the I/O.
 *
 *   owner "public" → content/catalog.json, content/units/{id}/v{n}.json, content/media/{id}/…   (anyone reads)
 *   owner {orgId}  → orgs/{orgId}/catalog.json, orgs/{orgId}/units/{id}/v{n}.json, …/media/…   (that org's members)
 */
import type { CatalogEntry, Unit } from "./shared/types.js";
import { runtimesOf, RUNTIMES } from "./shared/runtimes.js";
import { BUILTIN_TRACKS } from "./shared/tracks.js";

export type Owner = "public" | string;
export interface Caller { uid: string; role: string; orgId?: string }

const OWNER = /^[A-Za-z0-9_-]{1,128}$/;
export const isOwner = (v: unknown): v is Owner => typeof v === "string" && OWNER.test(v);

/** Org units always have generated ids ("u" + 8), so they can never shadow a built-in or public unit; public units may keep any id. */
export const ORG_UNIT_ID = /^u[a-z0-9]{8}$/;
export const idAllowed = (owner: Owner, unitId: string) => owner === "public" || ORG_UNIT_ID.test(unitId);

/** Platform admins manage everything; an org admin manages only their own org's units. */
export const canManage = (c: Caller, owner: Owner) => c.role === "superadmin" || (owner !== "public" && c.role === "orgAdmin" && c.orgId === owner);

export const prefix = (owner: Owner) => (owner === "public" ? "content" : `orgs/${owner}`);
export const catalogPath = (owner: Owner) => `${prefix(owner)}/catalog.json`;
export const unitPrefix = (owner: Owner, unitId: string) => `${prefix(owner)}/units/${unitId}/`;
export const unitPath = (owner: Owner, unitId: string, version: number) => `${unitPrefix(owner, unitId)}v${version}.json`;
export const mediaPrefix = (owner: Owner, unitId: string) => `${prefix(owner)}/media/${unitId}/`;
export const versionOf = (path: string) => Number(/\/v(\d+)\.json$/.exec(path)?.[1] ?? NaN);
/** Versions to delete after publishing `current`: all but the current and the previous one (a device holding the old catalog still loads). */
export const staleVersions = (paths: string[], current: number) => paths.filter((p) => versionOf(p) < current - 1);

/** A size kept per language, read the way the app picks the file: that language, then English, then the largest. */
const inLang = (by: Partial<Record<string, number>> | undefined, lang: string) => {
  if (!by) return undefined;
  const n = by[lang] ?? by.en ?? Math.max(...Object.values(by).map(Number).filter(Number.isFinite));
  return Number.isFinite(n) ? Number(n) : undefined;
};
type Kit = Unit["lessons"][number]["kit"][number];

/**
 * Pictures in a unit's text, as the app saves them with a download (apps/web/src/content/load.ts unitAssetUrls and
 * content/figure.ts): a paragraph that is only ![caption](link) in a read step's body or a capstone milestone's setup
 * tab, in that language (English when the text has none), with a published link (an app /media/ path is never one).
 * Arabic text may hold isolate marks inside the path; they are read past.
 */
const MARKS = /[\u2066-\u2069\u202A-\u202E]/g;
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
function figureTexts(unit: Unit): Record<string, string | undefined>[] {
  return unit.lessons.flatMap((l) => l.steps.flatMap((s) => (s.type === "read" ? [s.body] : s.type === "project" ? (s.setup ?? []).map((x) => x.body) : [])));
}
const figuresIn = (text: string | undefined) => (text ?? "").split(/\n\s*\n/).flatMap((para) => {
  const m = para.trim().replace(MARKS, "").match(FIGURE);
  return m && !m[2].startsWith("/") ? [m[2]] : [];
});
/** The pictures a learner in `lang` downloads with the unit (each once). */
export const figureUrls = (unit: Unit, lang: string) => [...new Set(figureTexts(unit).flatMap((t) => figuresIn(t[lang] ?? t.en)))];
/** Every language's pictures (each once): what publishing sizes. */
export const allFigureUrls = (unit: Unit) => [...new Set(figureTexts(unit).flatMap((t) => Object.values(t).flatMap((v) => figuresIn(v))))];
/**
 * A picture's Storage path, from its download link in this bucket ("…/v0/b/<bucket>/o/content%2Fmedia%2F…"), the only
 * pictures the app shows from Storage; null for anything else.
 */
export function figurePath(url: string, bucket: string): string | null {
  const m = /^https?:\/\/[^/]+\/v0\/b\/([^/]+)\/o\/([^?#]+)/.exec(url);
  if (!m || m[1] !== bucket) return null;
  let path: string;
  try { path = decodeURIComponent(m[2]); } catch { return null; }
  return path.startsWith("content/media/") && !path.split("/").some((p) => p === "" || p === "." || p === "..") ? path : null;
}
const kitKB = (k: Kit, lang: string, fmt: Kit["formats"][number]) =>
  inLang(Object.fromEntries(Object.entries(k.sizeKB ?? {}).flatMap(([l, m]) => (m?.[fmt] != null ? [[l, m[fmt]]] : []))), lang) ?? 0;

/**
 * Download size shown before a download (the brand book: sizes before every download), per language: what the app's
 * download fetches (unitAssetUrls) — the JSON, each video step's light lesson (or its MP4 when it has none), the kits'
 * files (not video kits), the pictures in the text and the code runtimes. Languages are those the light lessons and
 * kits record, and English. `figureKB`: each picture's size by its link (content.ts reads them from Storage when
 * publishing); a picture without one counts nothing.
 */
export function sizeByLang(unit: Unit, jsonBytes: number, figureKB: Record<string, number> = {}): Record<string, number> {
  const langs = new Set(["en"]);
  for (const l of unit.lessons) {
    for (const s of l.steps) if (s.type === "video") for (const x of Object.keys(s.light?.sizeKB ?? {})) langs.add(x);
    for (const k of l.kit) for (const x of Object.keys(k.sizeKB ?? {})) langs.add(x);
  }
  // Code steps need their language's runtime, once.
  const runtimeMB = runtimesOf(unit.lessons.flatMap((l) => l.steps)).reduce((a, lang) => a + RUNTIMES[lang].sizeMB, 0);
  const out: Record<string, number> = {};
  for (const lang of langs) {
    let mb = jsonBytes / 1e6 + runtimeMB;
    for (const l of unit.lessons) {
      for (const s of l.steps) if (s.type === "video") mb += s.light?.sizeKB ? (inLang(s.light.sizeKB, lang) ?? 0) / 1024 : s.sizeMB || 0;
      for (const k of l.kit) if (k.kind !== "video") for (const fmt of k.formats) if (fmt !== "mp4") mb += kitKB(k, lang, fmt) / 1024;
    }
    for (const url of figureUrls(unit, lang)) mb += (Number(figureKB[url]) || 0) / 1024;
    out[lang] = Math.max(0.1, Math.round(mb * 10) / 10);
  }
  return out;
}
/** The largest language's download: what phones that don't read `sizeByLang` show. */
export const sizeMB = (unit: Unit, jsonBytes: number, figureKB: Record<string, number> = {}) => Math.max(...Object.values(sizeByLang(unit, jsonBytes, figureKB)));

export function catalogEntry(unit: Unit, owner: Owner, version: number, jsonBytes: number, figureKB: Record<string, number> = {}): CatalogEntry {
  const by = sizeByLang(unit, jsonBytes, figureKB);
  return {
    id: unit.id, track: unit.track, level: unit.level, title: unit.title, summary: unit.summary,
    lessons: unit.lessons.length, sizeMB: Math.max(...Object.values(by)), sizeByLang: by, available: true,
    src: unitPath(owner, unit.id, version), version, owner,
    // Phones show teachers' and students' courses apart; teachers' courses (the default) carry no field.
    ...(unit.audience === "students" ? { audience: "students" as const } : {}),
    // University courses carry `teach`, so phones show them to university teachers only.
    ...(unit.teach === "university" ? { teach: "university" as const } : {}),
    // A track's capstone is listed after the other courses of its level.
    ...(unit.kind === "capstone" ? { kind: "capstone" as const } : {}),
  };
}

/**
 * catalog.json for one owner from the entries stored on each published unit, ordered by track (the order platform
 * admins set; unknown tracks last), then level (a capstone after the other courses of its level) and title.
 */
const BUILTIN_ORDER = Object.fromEntries(BUILTIN_TRACKS.map((t) => [t.id, t.order]));
export function buildCatalog(entries: CatalogEntry[], order: Record<string, number> = BUILTIN_ORDER) {
  const units = [...entries].sort((a, b) => (order[a.track] ?? 999) - (order[b.track] ?? 999) || a.level - b.level || Number(a.kind === "capstone") - Number(b.kind === "capstone") || a.title.en.localeCompare(b.title.en) || a.id.localeCompare(b.id));
  return { version: 1, units };
}
