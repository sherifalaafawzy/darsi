/**
 * Rules for changing the tracks list and for cleaning up a deleted unit's media. Pure (no Admin SDK) so they can be
 * unit-tested; settings.ts and content.ts do the I/O.
 */
import type { TrackDef } from "./shared/types.js";

export interface UnitRef { id: string; track: string; level: number }
export interface TrackConflict { track: string; reason: "removed" | "levels"; units: string[] }

/**
 * What stops `next` replacing `prev`: a track that units still use was removed, or now has fewer levels than one of
 * its units. Only tracks that were set up before count, so a unit with a stray track never blocks unrelated changes.
 */
export function trackConflicts(prev: TrackDef[], next: TrackDef[], units: UnitRef[]): TrackConflict[] {
  const before = new Set(prev.map((t) => t.id));
  const after = new Map(next.map((t) => [t.id, t]));
  const out = new Map<string, TrackConflict>();
  const flag = (track: string, reason: TrackConflict["reason"], unit: string) => {
    const key = `${track}:${reason}`;
    if (!out.has(key)) out.set(key, { track, reason, units: [] });
    out.get(key)!.units.push(unit);
  };
  for (const u of units) {
    if (!before.has(u.track)) continue;
    const t = after.get(u.track);
    if (!t) flag(u.track, "removed", u.id);
    else if (u.level > t.levels) flag(u.track, "levels", u.id);
  }
  return [...out.values()];
}

/**
 * Of a deleted unit's media files, the ones another unit's draft still links to (a duplicated unit shares its media).
 * Download URLs carry the object path percent-encoded, so both spellings are matched.
 */
export function mediaStillUsed(files: string[], otherDrafts: string[]): Set<string> {
  const used = new Set<string>();
  for (const f of files) {
    const enc = encodeURIComponent(f);
    if (otherDrafts.some((d) => d.includes(enc) || d.includes(f))) used.add(f);
  }
  return used;
}
