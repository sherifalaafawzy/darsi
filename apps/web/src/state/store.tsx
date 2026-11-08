import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { storage } from "../platform";
import { teachStage, type Audience, type Stage, type TeachPlace, type Track } from "../content/types";
import { certCode, legacyCertCode, type EarnedCert } from "../content/cert";

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
  /** Where a teacher teaches. Legacy "secondary" is rewritten to lower secondary when the store loads. */
  teach?: TeachPlace;
  /** Teacher or student (onboarding, or Me); courses for the other audience don't show. School accounts follow their role. */
  audience?: Audience;
  /** Where a student studies (onboarding, or Me): their placement check and Home start at that stage's level. */
  stage?: Stage;
  /** The learner's tracks: Home shows one of them at a time (`track`); none chosen means every track on offer. */
  tracks: Track[];
  track?: Track;
  /** A platform admin's track on Home; none means every track. */
  adminTrack?: Track;
  weeklyLessons: number;
  levels: Partial<Record<Track, number>>;
  progress: Record<string, LessonResult>;
  notes: Record<string, string>;
  /** When each note was last edited here (ms), so the newer copy wins against the cloud. Older notes have none. */
  notesAt: Record<string, number>;
  /** Downloaded courses (Downloads): the version and language saved. "done" is a download from before both were kept. */
  downloads: Record<string, Download>;
  name: string;
  /** ISO week ("2026-W43") → lessons completed that week. Streaks count teaching weeks, not days. */
  weeks: Record<string, number>;
  installDismissedAt?: number;
  /** When the tour (tour/Start.tsx) last started on this device: it starts by itself only once per account. */
  toured?: number;
  /** Labs the learner has finished on this device (the tick on a Labs card). */
  labsDone?: Record<string, true>;
  /**
   * Certificates, by unit id, recorded the first time they are earned (Home and Me; content/cert.ts earnedCert): a replay
   * never moves their date or code, and a course republished with another lesson, or unpublished, keeps them. Signed
   * in, each is also created once in users/{uid}/certs (state/sync.ts), so a new phone gets them back.
   */
  certs?: Record<string, EarnedCert>;
  /** Chose "Continue without an account" (only meaningful in the guest store). */
  guest?: boolean;
  /**
   * The member's organization as the app shows it (state/orgBrand.ts): its name, and its logo as a small data: URL kept
   * here so it shows offline and is downloaded again only when `v` changes, and the courses it lets this member see.
   * Absent for people without an organization.
   */
  org?: OrgBrand;
  /** Anonymous usage statistics (analytics/track.ts); on unless switched off in Me. */
  analytics?: boolean;
  /** When "Reset progress on this device" last ran here (ms): another tab takes the reset instead of merging its lessons back. */
  resetAt?: number;
  /**
   * When the learning profile (LEARN_KEYS: what onboarding asks, and Me and My tracks change) last changed on this
   * device (ms). Signed in, it is kept on users/{uid} too (state/sync.ts learningSync), and the newer copy wins.
   */
  learnAt?: number;
  /** Certificates earned before codes were recorded have had theirs frozen (cert.ts legacyCertCode): see withCodes. */
  certCodes?: 1;
}
/**
 * The learning profile: onboarding's answers and what Me and My tracks change later. Signed in, it also lives on
 * users/{uid} (state/sync.ts), so a new device skips onboarding. Language and the current track stay per device.
 */
export const LEARN_KEYS = ["onboarded", "tracks", "levels", "audience", "stage", "weeklyLessons", "teach"] as const;
export type LearnKey = (typeof LEARN_KEYS)[number];
/**
 * `courses`: the course ids the organization lets this member see (content/orgCourses.ts seesFor, worked out from the org
 * document, their role and their class when it was read); absent, every course. Kept here so it holds offline.
 */
export interface OrgBrand { id: string; name: string; logo?: string; v: number; courses?: string[] }
/** A downloaded course: the catalog version and the language its files were saved in; "done" from older downloads. */
export type Download = "done" | { v: number; lang: string };
const browserLang = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
export const initialState: AppState = {
  version: 1, lang: browserLang, theme: "light", dataSaver: false, reminder: true, onboarded: false,
  tracks: [], weeklyLessons: 4, levels: {}, progress: {}, notes: {}, notesAt: {}, downloads: {}, name: "", weeks: {}, certCodes: 1,
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
  | { type: "mergeRemote"; progress?: Record<string, LessonResult>; notes?: Record<string, RemoteNote>; certs?: Record<string, EarnedCert> }
  | { type: "download"; unit: string; on: boolean; v?: number; lang?: string }
  | { type: "tabSync"; stored: AppState }
  | { type: "labDone"; id: string }
  | { type: "earnCert"; id: string; cert: EarnedCert }
  | { type: "reset" };

/**
 * Folds the cloud copy into local state; the newer copy wins (completedAt for lessons, edit time for notes).
 * A note saved before cloud sync has no time and loses to the cloud. Lessons first seen from the cloud count
 * toward the week they were completed in. Certificates are a union; where both have one, the earlier `at` wins, so its
 * date and code stay the first ones. Returns `s` itself when nothing changed, so the echo of our own write is free.
 */
export function mergeRemote(s: AppState, progress: Record<string, LessonResult> = {}, notes: Record<string, RemoteNote> = {}, certs: Record<string, EarnedCert> = {}): AppState {
  let p = s.progress, w = s.weeks, n = s.notes, at = s.notesAt, c = s.certs;
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
  for (const [id, r] of Object.entries(certs)) if (!c?.[id] || r.at < c[id].at) c = { ...c, [id]: r };
  return p === s.progress && w === s.weeks && n === s.notes && at === s.notesAt && c === s.certs ? s
    : { ...s, progress: p, weeks: w, notes: n, notesAt: at, ...(c !== s.certs ? { certs: c } : {}) };
}

/** Keep `teach` as one of the four stages. The old "secondary" (ages 12–18) becomes lower secondary. */
function withTeach(s: AppState): AppState {
  const teach = teachStage(s.teach);
  return teach === s.teach ? s : { ...s, teach };
}

/**
 * Certificates recorded before codes were (2026-11) had theirs worked out from the learner's name each time they showed,
 * so a renamed learner's codes changed. A store saved before then (no `certCodes`) keeps the code each one showed, frozen
 * at its first load since; certificates earned later get theirs when earned (earnCert).
 */
function withCodes(s: AppState): AppState {
  if (s.certCodes) return s;
  const certs = s.certs && Object.fromEntries(Object.entries(s.certs).map(([id, c]) => [id, c.code ? c : { ...c, code: legacyCertCode(id, s.name ?? "", c.at) }]));
  return { ...s, certCodes: 1, ...(certs ? { certs } : {}) };
}

/** Plain JSON values, compared by content (key order aside). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
/**
 * Another tab or window of the app on this device (the installed app beside a browser tab) saved this store: take its
 * copy, settings included, keeping the lessons, notes, finished labs and certificates only this one has (the newer
 * lesson and note win, as with the cloud: mergeRemote). Without this, a tab opened earlier wrote its whole stale state
 * over lessons finished in the other one, for a guest for good. Returns `mine` itself when nothing would change, so the
 * echo of a save ends there. "Reset progress on this device" in the other tab (a newer `resetAt`, or, from an older
 * version of the app, onboarding to do again) is taken as it is: merging this tab's lessons back in would undo it.
 */
export function syncTabs(mine: AppState, theirs: AppState): AppState {
  if (theirs?.version !== 1) return mine;
  if ((theirs.resetAt ?? 0) > (mine.resetAt ?? 0) || (mine.onboarded && !theirs.onboarded)) return withTeach({ ...initialState, ...theirs });
  const notes = Object.fromEntries(Object.entries(mine.notes).map(([id, text]) => [id, { text, at: mine.notesAt[id] ?? 0 }]));
  let next = mergeRemote(withTeach({ ...initialState, ...theirs }), mine.progress, notes, mine.certs);
  const labs = { ...mine.labsDone, ...next.labsDone };
  if (Object.keys(labs).length) next = { ...next, labsDone: labs };
  return same(next, mine) ? mine : next;
}

/** `owner`: the account whose store this is (undefined for the guest), for the codes of the certificates earned here. */
function reducer(s: AppState, a: Action, owner?: string): AppState {
  switch (a.type) {
    case "hydrate": return withTeach({ ...initialState, ...withCodes(a.state) });
    case "set": {
      const next = withTeach({ ...s, ...a.patch });
      // A change to the learning profile is dated, so the newer copy wins against the account's (state/sync.ts). A patch
      // that brings its own date is that copy arriving.
      if ("learnAt" in a.patch || LEARN_KEYS.every((k) => same(next[k], s[k]))) return next;
      return { ...next, learnAt: Date.now() };
    }
    case "completeLesson": {
      const wk = isoWeek(); const first = !s.progress[a.id];
      return { ...s, progress: { ...s.progress, [a.id]: { done: true, completedAt: new Date().toISOString(), ...a.result } }, weeks: first ? { ...s.weeks, [wk]: (s.weeks[wk] ?? 0) + 1 } : s.weeks };
    }
    case "saveNote": return { ...s, notes: { ...s.notes, [a.id]: a.text }, notesAt: { ...s.notesAt, [a.id]: Date.now() } };
    case "mergeRemote": return mergeRemote(s, a.progress, a.notes, a.certs);
    case "download": { const d = { ...s.downloads }; if (a.on) d[a.unit] = a.lang ? { v: a.v ?? 0, lang: a.lang } : "done"; else delete d[a.unit]; return { ...s, downloads: d }; }
    case "tabSync": return syncTabs(s, a.stored);
    case "labDone": return s.labsDone?.[a.id] ? s : { ...s, labsDone: { ...s.labsDone, [a.id]: true } };
    // The first record of a certificate stays: earning it again (a replay) changes nothing. Its code is set now, from
    // the course, when it was earned and the account (none for a guest), so it never changes afterwards.
    case "earnCert": return s.certs?.[a.id] ? s : { ...s, certs: { ...s.certs, [a.id]: { ...a.cert, code: a.cert.code ?? certCode(a.id, a.cert.at, owner) } } };
    // "Reset progress on this device": the learning goes (lessons, weeks, notes, levels, finished labs, certificates). The
    // settings stay (a switched-off analytics choice never turns itself back on), and so do the onboarding answers and
    // the downloads, whose files are still on the phone.
    case "reset": return { ...s, progress: {}, weeks: {}, notes: {}, notesAt: {}, levels: {}, labsDone: {}, certs: {}, resetAt: Date.now() };
  }
}

/** The guest store keeps the original key, so progress from before accounts existed is still there. */
const GUEST_KEY = "darsi:state";
/** localStorage "darsi:saved:<store key>": touched after each save, so other tabs know to read the store again. */
const SAVED_MARK = "darsi:saved:";
const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; ready: boolean } | null>(null);
const settingsOf = (s: AppState): AppState => ({ ...initialState, lang: s.lang, theme: s.theme, dataSaver: s.dataSaver, reminder: s.reminder });

/**
 * Does this account take over the guest's learning on this device? Only at the sign-in that created it here: a person
 * who learned as a guest and then made an account with sign-up or Google (both sign in at once, so the first sign-in is
 * the creation). Never an account an organization made (it carries an orgId claim from the start, and its first
 * sign-in comes later), nor a new account signing in on someone else's phone: on a shared phone or lab PC, the
 * previous guest's lessons, notes and name must not land in a pupil's school record.
 */
export function adoptsGuest(meta: { creationTime?: string; lastSignInTime?: string } | undefined, orgId: string | null, now = Date.now()): boolean {
  const created = Date.parse(meta?.creationTime ?? "");
  if (!meta || orgId || !Number.isFinite(created) || now - created >= 10 * 60e3) return false;
  const signedIn = Date.parse(meta.lastSignInTime ?? "");
  // Auth keeps both to the second; a missing sign-in time can only be the creation itself.
  return !Number.isFinite(signedIn) || Math.abs(signedIn - created) < 5000;
}

/** Accounts signed out on this device: their stores are never written again (the page reloads right after). */
const gone = new Set<string>();
/**
 * localStorage "darsi:gone:<store key>": the account signed out in some tab of this device. Another tab still open as that
 * account must not merge its copy back into the forgotten store (tabSync) before it notices the sign-out itself. Cleared
 * when the account signs in here again.
 */
const GONE_MARK = "darsi:gone:";
const signedOutHere = (scope: string, key: string) => {
  if (gone.has(scope)) return true;
  try { if (localStorage.getItem(`${GONE_MARK}${key}`)) { gone.add(scope); return true; } } catch { /* private mode */ }
  return false;
};
/**
 * Signing out on a shared device (auth/AuthProvider), once everything is in the cloud: the account's copy here keeps its
 * settings, onboarding answers and certificates, so signing in again needs no onboarding, but forgets the person's work,
 * name and organization. Sync brings progress and notes back at the next sign-in (and the weeks with them), Routed fills
 * the name in from the profile and useOrgBrand the organization.
 */
export async function forgetAccount(uid: string): Promise<void> {
  gone.add(uid);
  const key = `${GUEST_KEY}:${uid}`;
  try { localStorage.setItem(`${GONE_MARK}${key}`, "1"); } catch { /* private mode */ }
  const s = await storage.get<AppState>(key);
  if (s?.version !== 1) return;
  const { org: _org, ...rest } = s;
  await storage.set<AppState>(key, { ...rest, progress: {}, notes: {}, notesAt: {}, weeks: {}, name: "" });
}

/**
 * Local state for one person on this device: `scope` is "guest" or the account uid (remount with key={scope} to switch).
 * An account used here for the first time starts from the guest's settings; with `adoptGuest` (the account was just
 * created here: adoptsGuest) it takes over the guest's learning too, which then leaves the guest store.
 */
export function StoreProvider({ scope = "guest", adoptGuest = false, children }: { scope?: string; adoptGuest?: boolean; children: ReactNode }) {
  const key = scope === "guest" ? GUEST_KEY : `${GUEST_KEY}:${scope}`;
  // The store is remounted for another account (key = scope), so its owner never changes while it lives.
  const owned = useMemo(() => (s: AppState, a: Action) => reducer(s, a, scope === "guest" ? undefined : scope), [scope]);
  const [state, dispatch] = useReducer(owned, initialState);
  const [ready, setReady] = useReducer(() => true, false);
  useEffect(() => {
    // Signed in here again (a new mount for this account): its store may be written once more.
    if (scope !== "guest" && !gone.has(scope)) try { localStorage.removeItem(`${GONE_MARK}${key}`); } catch { /* private mode */ }
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
  useEffect(() => {
    if (!ready || signedOutHere(scope, key)) return;
    // Saved: other tabs and windows of the app on this device hear of it (the storage event), and take it in (tabSync).
    storage.set(key, state).then(() => { try { localStorage.setItem(`${SAVED_MARK}${key}`, String(Date.now())); } catch { /* private mode */ } }).catch(() => {});
  }, [key, scope, state, ready]);
  // What another tab saved: when it says so, and when this one comes back into view (a frozen tab may have missed it).
  // One read of the store each time; no polling.
  useEffect(() => {
    if (!ready) return;
    const pull = () => { if (!signedOutHere(scope, key)) storage.get<AppState>(key).then((s) => { if (s?.version === 1) dispatch({ type: "tabSync", stored: s }); }).catch(() => {}); };
    const onStorage = (e: StorageEvent) => { if (e.key === `${SAVED_MARK}${key}`) pull(); };
    const onShow = () => { if (document.visibilityState === "visible") pull(); };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onShow);
    return () => { window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onShow); };
  }, [key, scope, ready]);
  const value = useMemo(() => ({ state, dispatch, ready }), [state, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
