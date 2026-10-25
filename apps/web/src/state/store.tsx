import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { storage } from "../platform";
import type { Track } from "../content/types";

/** unitId, track and competencies go to the cloud progress doc (admins' summaries); entries saved before cloud sync lack them. */
export interface LessonResult { done: true; accuracy: number; xp: number; seconds: number; completedAt: string; unitId?: string; track?: Track; competencies?: string[] }
/** A note as stored in users/{uid}/notes/{lessonId}: `at` is its updatedAt in ms. */
export interface RemoteNote { text: string; at: number }
export interface AppState {
  version: 1;
  lang: string;
  theme: "light" | "sunlight";
  dataSaver: boolean;
  reminder: boolean;
  onboarded: boolean;
  teach?: "primary" | "secondary" | "university";
  tracks: Track[];
  weeklyLessons: number;
  levels: Partial<Record<Track, number>>;
  progress: Record<string, LessonResult>;
  notes: Record<string, string>;
  /** When each note was last edited here (ms), so the newer copy wins against the cloud. Older notes have none. */
  notesAt: Record<string, number>;
  downloads: Record<string, "done">;
  name: string;
  /** ISO week ("2026-W43") → lessons completed that week. Streaks count teaching weeks, not days. */
  weeks: Record<string, number>;
  installDismissedAt?: number;
  /** Chose "Continue without an account" (only meaningful in the guest store). */
  guest?: boolean;
}
const browserLang = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
export const initialState: AppState = {
  version: 1, lang: browserLang, theme: "light", dataSaver: false, reminder: true, onboarded: false,
  tracks: [], weeklyLessons: 4, levels: {}, progress: {}, notes: {}, notesAt: {}, downloads: {}, name: "", weeks: {},
};

export const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 864e5 + 1) / 7)).padStart(2, "0")}`;
};
/** Consecutive weeks (ending this or last week) where the weekly goal was met; missing a week pauses, never punishes. */
export function streakWeeks(s: AppState, now = new Date()): number {
  const goal = Math.max(1, Math.ceil(s.weeklyLessons / 2));
  let n = 0; const d = new Date(now);
  if ((s.weeks[isoWeek(d)] ?? 0) < goal) d.setDate(d.getDate() - 7);
  while ((s.weeks[isoWeek(d)] ?? 0) >= goal) { n++; d.setDate(d.getDate() - 7); }
  return n;
}

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "set"; patch: Partial<AppState> }
  | { type: "completeLesson"; id: string; result: Omit<LessonResult, "done" | "completedAt"> }
  | { type: "saveNote"; id: string; text: string }
  | { type: "mergeRemote"; progress?: Record<string, LessonResult>; notes?: Record<string, RemoteNote> }
  | { type: "download"; unit: string; on: boolean }
  | { type: "reset" };

/**
 * Folds the cloud copy into local state; the newer copy wins (completedAt for lessons, edit time for notes).
 * A note saved before cloud sync has no time and loses to the cloud. Lessons first seen from the cloud count
 * toward the week they were completed in. Returns `s` itself when nothing changed, so the echo of our own write is free.
 */
export function mergeRemote(s: AppState, progress: Record<string, LessonResult> = {}, notes: Record<string, RemoteNote> = {}): AppState {
  let p = s.progress, w = s.weeks, n = s.notes, at = s.notesAt;
  for (const [id, r] of Object.entries(progress)) {
    const l = p[id];
    if (l && r.completedAt < l.completedAt) continue;
    if (l && r.completedAt === l.completedAt) {
      if (!l.unitId && r.unitId) p = { ...p, [id]: { ...l, unitId: r.unitId, track: r.track, competencies: r.competencies } };
      continue;
    }
    p = { ...p, [id]: r };
    if (!l) { const wk = isoWeek(new Date(r.completedAt)); w = { ...w, [wk]: (w[wk] ?? 0) + 1 }; }
  }
  for (const [id, r] of Object.entries(notes)) {
    if (n[id] === r.text) { if ((at[id] ?? 0) < r.at) at = { ...at, [id]: r.at }; continue; }
    if (n[id] !== undefined && (at[id] ?? 0) >= r.at) continue;
    n = { ...n, [id]: r.text }; at = { ...at, [id]: r.at };
  }
  return p === s.progress && w === s.weeks && n === s.notes && at === s.notesAt ? s : { ...s, progress: p, weeks: w, notes: n, notesAt: at };
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "hydrate": return { ...initialState, ...a.state };
    case "set": return { ...s, ...a.patch };
    case "completeLesson": {
      const wk = isoWeek(); const first = !s.progress[a.id];
      return { ...s, progress: { ...s.progress, [a.id]: { done: true, completedAt: new Date().toISOString(), ...a.result } }, weeks: first ? { ...s.weeks, [wk]: (s.weeks[wk] ?? 0) + 1 } : s.weeks };
    }
    case "saveNote": return { ...s, notes: { ...s.notes, [a.id]: a.text }, notesAt: { ...s.notesAt, [a.id]: Date.now() } };
    case "mergeRemote": return mergeRemote(s, a.progress, a.notes);
    case "download": { const d = { ...s.downloads }; if (a.on) d[a.unit] = "done"; else delete d[a.unit]; return { ...s, downloads: d }; }
    case "reset": return { ...initialState, lang: s.lang, theme: s.theme };
  }
}

/** The guest store keeps the original key, so progress from before accounts existed is still there. */
const GUEST_KEY = "darsi:state";
const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; ready: boolean } | null>(null);
const settingsOf = (s: AppState): AppState => ({ ...initialState, lang: s.lang, theme: s.theme, dataSaver: s.dataSaver, reminder: s.reminder });

/**
 * Local state for one person on this device: `scope` is "guest" or the account uid (remount with key={scope} to switch).
 * An account used here for the first time starts from the guest's settings; with `adoptGuest` (a brand-new account)
 * it takes over the guest's learning too, which then leaves the guest store.
 */
export function StoreProvider({ scope = "guest", adoptGuest = false, children }: { scope?: string; adoptGuest?: boolean; children: ReactNode }) {
  const key = scope === "guest" ? GUEST_KEY : `${GUEST_KEY}:${scope}`;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useReducer(() => true, false);
  useEffect(() => {
    (async () => {
      const own = await storage.get<AppState>(key);
      if (own?.version === 1) return dispatch({ type: "hydrate", state: own });
      const guest = scope === "guest" ? undefined : await storage.get<AppState>(GUEST_KEY);
      if (guest?.version !== 1) return;
      dispatch({ type: "hydrate", state: adoptGuest ? { ...guest, guest: false } : settingsOf(guest) });
      if (adoptGuest) await storage.set(GUEST_KEY, settingsOf(guest));
    })().catch(() => {}).finally(setReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (ready) storage.set(key, state).catch(() => {}); }, [key, state, ready]);
  const value = useMemo(() => ({ state, dispatch, ready }), [state, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
