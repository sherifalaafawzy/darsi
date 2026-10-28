/**
 * The three built-in tracks, and how published settings change them. Shared with the Cloud Functions
 * (functions/scripts/copy-shared.mjs copies it into functions/src/shared/), so the editor, the app and saveSettings
 * agree on the rules.
 *
 * Built-in tracks always exist: Labs, placement and the shipped units use them. Settings may rename them, hide them
 * or give them more levels, but never remove them or change their colour and icon (the brand book gives each
 * built-in track its colour).
 */
import type { TrackDef } from "./types";

export const MAX_LEVELS = 12;
/** The four levels of every built-in track, from beginner to advanced (docs/CURRICULUM.md says what each means). */
export const LEVEL_NAMES = [
  { en: "Beginner", ar: "مبتدئ" }, { en: "Elementary", ar: "أساسي" }, { en: "Intermediate", ar: "متوسط" }, { en: "Advanced", ar: "متقدم" },
];
export const BUILTIN_TRACKS: TrackDef[] = [
  { id: "ai", name: { en: "AI", ar: "الذكاء الاصطناعي" }, icon: "ai", tone: "sunbird", levels: 4, levelNames: LEVEL_NAMES, order: 0, builtIn: true },
  { id: "iot", name: { en: "IoT", ar: "إنترنت الأشياء" }, icon: "iot", tone: "lagoon", levels: 4, levelNames: LEVEL_NAMES, order: 1, builtIn: true },
  { id: "cyber", name: { en: "Cyber security", ar: "الأمن السيبراني" }, icon: "cyber", tone: "hibiscus", levels: 4, levelNames: LEVEL_NAMES, order: 2, builtIn: true },
];
const BUILTIN = new Map(BUILTIN_TRACKS.map((t) => [t.id, t]));

/** The tracks to use: published ones in their order, with every built-in present and keeping its colour and icon. */
export function mergeTracks(published?: TrackDef[] | null): TrackDef[] {
  const out = new Map<string, TrackDef>();
  for (const t of published ?? []) {
    const b = BUILTIN.get(t.id);
    // A built-in track saved without level names (settings from before they existed) keeps the built-in ones.
    out.set(t.id, b ? { ...t, icon: b.icon, tone: b.tone, builtIn: true, ...(t.levelNames?.some((n) => n?.en) ? {} : { levelNames: b.levelNames }) } : { ...t, builtIn: false });
  }
  for (const b of BUILTIN_TRACKS) if (!out.has(b.id)) out.set(b.id, b);
  return [...out.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Track id → number of levels, for validateUnit's `tracks` option. */
export const levelsByTrack = (tracks: TrackDef[]) => new Map(tracks.map((t) => [t.id, t.levels] as const));
