/**
 * Course editor: where published units live in Storage, who may publish them, and what goes into catalog.json.
 * Pure (no Admin SDK) so it can be unit-tested; content.ts does the I/O.
 *
 *   owner "public" → content/catalog.json, content/units/{id}/v{n}.json, content/media/{id}/…   (anyone reads)
 *   owner {orgId}  → orgs/{orgId}/catalog.json, orgs/{orgId}/units/{id}/v{n}.json, …/media/…   (that org's members)
 */
import type { CatalogEntry, Unit } from "./shared/types.js";

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

/**
 * Download size shown before a download (the brand book: sizes before every download): the JSON plus one language's
 * videos. A download stores a video step's light lesson instead of its MP4 when it has one (unitAssetUrls in the app).
 */
export function sizeMB(unit: Unit, jsonBytes: number) {
  const stepMB = (s: Unit["lessons"][number]["steps"][number]) => s.type !== "video" ? 0
    : s.light?.sizeKB ? Math.max(0, ...Object.values(s.light.sizeKB).map(Number).filter(Number.isFinite)) / 1024 : s.sizeMB || 0;
  const videoMB = unit.lessons.reduce((a, l) => a + l.steps.reduce((b, s) => b + stepMB(s), 0), 0);
  return Math.max(0.1, Math.round((jsonBytes / 1e6 + videoMB) * 10) / 10);
}

export function catalogEntry(unit: Unit, owner: Owner, version: number, jsonBytes: number): CatalogEntry {
  return {
    id: unit.id, track: unit.track, level: unit.level, title: unit.title, summary: unit.summary,
    lessons: unit.lessons.length, sizeMB: sizeMB(unit, jsonBytes), available: true,
    src: unitPath(owner, unit.id, version), version, owner,
  };
}

/**
 * catalog.json for one owner from the entries stored on each published unit, ordered by track (the order platform
 * admins set; unknown tracks last), then level and title.
 */
export function buildCatalog(entries: CatalogEntry[], order: Record<string, number> = { ai: 0, iot: 1, cyber: 2 }) {
  const units = [...entries].sort((a, b) => (order[a.track] ?? 999) - (order[b.track] ?? 999) || a.level - b.level || a.title.en.localeCompare(b.title.en) || a.id.localeCompare(b.id));
  return { version: 1, units };
}
