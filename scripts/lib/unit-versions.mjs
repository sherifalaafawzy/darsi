/**
 * The deciding part of scripts/backfill-last-version.mjs, which touches nothing, so it can be tested
 * (apps/web/tests/unit-versions.test.ts).
 *
 * A unit's version counter is units/{id}.lastVersion (functions/src/content.ts). Units published or unpublished before
 * that field existed don't have it: for an unpublished one the only record of its last version is the audit log (every
 * publish wrote {action "publishUnit", unitId, owner, version}) and whatever versioned files Storage still holds.
 */

/**
 * The version in a published unit file's name (…/units/<id>/v<n>.json, or an added language's v<n>.<lang>.json), or NaN.
 * As functions/src/catalog.ts versionOf.
 */
export const fileVersion = (name) => Number(/\/v(\d+)(?:\.[a-z0-9-]+)?\.json$/.exec(String(name))?.[1] ?? NaN);

const whole = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

/** The audit log's publishes as a map "owner/unitId" → the highest version published. Entries without all three count for nothing. */
export function auditVersions(entries) {
  const out = new Map();
  for (const e of entries) {
    const v = whole(e?.version);
    if (!v || typeof e.unitId !== "string" || !e.unitId || typeof e.owner !== "string" || !e.owner) continue;
    const key = `${e.owner}/${e.unitId}`;
    if (v > (out.get(key) ?? 0)) out.set(key, v);
  }
  return out;
}

/**
 * The counter to write on one unit, or 0 for "leave it": the highest version anything records (the live one, the audit
 * log's publishes of this owner's unit, the files still in Storage), when that is above what the unit already holds.
 * It never lowers a counter, so running it again, or after the new functions have stamped the unit, changes nothing.
 */
export function counterFor({ lastVersion, publishedVersion, audited, files = [] }) {
  const have = whole(lastVersion);
  const top = Math.max(0, whole(publishedVersion), whole(audited), ...files.map(fileVersion).filter((n) => Number.isInteger(n) && n > 0));
  return top > have ? top : 0;
}

/** Whether Storage must be asked about a unit: only one that says nothing itself (not live, no counter). */
export const needsFiles = ({ lastVersion, publishedVersion }) => !whole(lastVersion) && !whole(publishedVersion);

/**
 * Publishes the audit log holds for unit ids that have no units/{id} document now (deleted; an id made again later
 * starts from these). Nothing can be stamped for them: the retention job keeps their entries (retentionCore auditKept).
 */
export function orphans(audited, unitKeys) {
  const have = new Set(unitKeys);
  return [...audited.keys()].filter((k) => !have.has(k)).sort();
}
