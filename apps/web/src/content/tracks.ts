/**
 * The nine built-in tracks, and how published settings change them. Shared with the Cloud Functions
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
  { en: "Beginner", ar: "مبتدئ", fr: "Débutant", es: "Principiante", de: "Einsteiger", pt: "Iniciante", ur: "ابتدائی" },
  { en: "Elementary", ar: "أساسي", fr: "Élémentaire", es: "Elemental", de: "Grundlagen", pt: "Básico", ur: "بنیادی" },
  { en: "Intermediate", ar: "متوسط", fr: "Intermédiaire", es: "Intermedio", de: "Mittelstufe", pt: "Intermediário", ur: "درمیانہ" },
  { en: "Advanced", ar: "متقدم", fr: "Avancé", es: "Avanzado", de: "Fortgeschritten", pt: "Avançado", ur: "اعلیٰ" },
];
export const BUILTIN_TRACKS: TrackDef[] = [
  { id: "ai", name: { en: "AI", ar: "الذكاء الاصطناعي", fr: "IA", es: "IA", de: "KI", pt: "IA", ur: "مصنوعی ذہانت" }, icon: "ai", tone: "sunbird", levels: 4, levelNames: LEVEL_NAMES, order: 0, builtIn: true },
  { id: "iot", name: { en: "IoT", ar: "إنترنت الأشياء", fr: "IoT", es: "IoT", de: "IoT", pt: "IoT", ur: "IoT" }, icon: "iot", tone: "lagoon", levels: 4, levelNames: LEVEL_NAMES, order: 1, builtIn: true },
  { id: "cyber", name: { en: "Cyber security", ar: "الأمن السيبراني", fr: "Cybersécurité", es: "Ciberseguridad", de: "Cybersicherheit", pt: "Cibersegurança", ur: "سائبر سیکیورٹی" }, icon: "cyber", tone: "hibiscus", levels: 4, levelNames: LEVEL_NAMES, order: 2, builtIn: true },
  { id: "code", name: { en: "Programming", ar: "البرمجة", fr: "Programmation", es: "Programación", de: "Programmieren", pt: "Programação", ur: "پروگرامنگ" }, icon: "code", tone: "sky", levels: 4, levelNames: LEVEL_NAMES, order: 3, builtIn: true },
  { id: "data", name: { en: "Data engineering", ar: "هندسة البيانات", fr: "Ingénierie des données", es: "Ingeniería de datos", de: "Data Engineering", pt: "Engenharia de dados", ur: "ڈیٹا انجینئرنگ" }, icon: "chart", tone: "leaf", levels: 4, levelNames: LEVEL_NAMES, order: 4, builtIn: true },
  { id: "agents", name: { en: "AI agents", ar: "وكلاء الذكاء الاصطناعي", fr: "Agents IA", es: "Agentes de IA", de: "KI-Agenten", pt: "Agentes de IA", ur: "AI ایجنٹس" }, icon: "agent", tone: "lilac", levels: 4, levelNames: LEVEL_NAMES, order: 5, builtIn: true },
  { id: "opt", name: { en: "Optimization", ar: "الحلول المثلى", fr: "Optimisation", es: "Optimización", de: "Optimierung", pt: "Otimização", ur: "آپٹیمائزیشن" }, icon: "peak", tone: "clay", levels: 4, levelNames: LEVEL_NAMES, order: 6, builtIn: true },
  { id: "aisec", name: { en: "AI security", ar: "أمن الذكاء الاصطناعي", fr: "Sécurité de l’IA", es: "Seguridad de la IA", de: "KI-Sicherheit", pt: "Segurança de IA", ur: "AI سیکیورٹی" }, icon: "aisec", tone: "slate", levels: 4, levelNames: LEVEL_NAMES, order: 7, builtIn: true },
  { id: "data-science", name: { en: "Data science", ar: "علم البيانات", fr: "Science des données", es: "Ciencia de datos", de: "Data Science", pt: "Ciência de dados", ur: "ڈیٹا سائنس" }, icon: "target", tone: "lagoon", levels: 4, levelNames: LEVEL_NAMES, order: 8, builtIn: true },
];
const BUILTIN = new Map(BUILTIN_TRACKS.map((t) => [t.id, t]));

/** The tracks to use: published ones in their order, with every built-in present and keeping its colour and icon. */
export function mergeTracks(published?: TrackDef[] | null): TrackDef[] {
  const out = new Map<string, TrackDef>();
  for (const t of published ?? []) {
    const b = BUILTIN.get(t.id);
    // A built-in track saved without level names (settings from before they existed) keeps the built-in ones.
    // Names left as built in keep the built-in translations for languages the settings don't have (added languages).
    out.set(t.id, b ? {
      ...t, icon: b.icon, tone: b.tone, builtIn: true, name: t.name?.en === b.name.en ? { ...b.name, ...t.name } : t.name,
      levelNames: t.levelNames?.some((n) => n?.en) ? t.levelNames.map((n, i) => (b.levelNames?.[i] && n?.en === b.levelNames[i].en ? { ...b.levelNames[i], ...n } : n)) : b.levelNames,
    } : { ...t, builtIn: false });
  }
  for (const b of BUILTIN_TRACKS) if (!out.has(b.id)) out.set(b.id, b);
  return [...out.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Track id → number of levels, for validateUnit's `tracks` option. */
export const levelsByTrack = (tracks: TrackDef[]) => new Map(tracks.map((t) => [t.id, t.levels] as const));
