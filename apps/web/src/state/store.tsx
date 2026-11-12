import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button, UpdateToast } from "@darsi/design-system";
import { isQuotaError, persistStorage, storage } from "../platform";
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
  /** Courses whose "How was this course?" on Home was answered or put aside (unit id → when, ms): asked once each. */
  feedbackAsked?: Record<string, number>;
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
 * `sso`: the organization's school sign-in is on, so Me shows its row (and only then loads the row's chunk).
 */
export interface OrgBrand { id: string; name: string; logo?: string; v: number; courses?: string[]; sso?: boolean }
/** A downloaded course: the catalog version and the language its files were saved in; "done" from older downloads. */
export type Download = "done" | { v: number; lang: string };
// A first visit's language: the address's ?lang=ar or ?lang=en (the home page's two versions for search engines, seo.ts),
// else the browser's.
const urlLang = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lang") : null;
const browserLang = urlLang === "ar" || urlLang === "en" ? urlLang : typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
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

const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/**
 * What the device held, made safe to take in (at load, and from another tab): a field of the wrong kind (damage, a write
 * cut short, an older bug) takes its default instead of throwing in the first screen or reducer that reads it. Never
 * throws; returns `s` itself when nothing was wrong.
 */
export function sane(s: AppState): AppState {
  const fix: Record<string, unknown> = {};
  for (const k of ["progress", "notes", "notesAt", "weeks", "levels", "downloads"] as const) if (k in s && !plain(s[k])) fix[k] = {};
  for (const k of ["certs", "labsDone"] as const) if (s[k] !== undefined && !plain(s[k])) fix[k] = undefined;
  if ("tracks" in s && !Array.isArray(s.tracks)) fix.tracks = [];
  return Object.keys(fix).length ? ({ ...s, ...fix } as AppState) : s;
}

/** The guest store keeps the original key, so progress from before accounts existed is still there. */
const GUEST_KEY = "darsi:state";
/**
 * What the device holds under a store key, three ways: null when nothing was ever saved there; the state, when it is one
 * this version reads; a rejection when the read failed (IndexedDB blocked, broken or busy) or what is there isn't a
 * version-1 store (a newer version's, or damage). The last must never be taken for "nothing": the blank state would then
 * be saved over the person's work, and a guest's progress lives only here.
 */
async function readStore(key: string): Promise<AppState | null> {
  const s = await storage.get<unknown>(key);
  if (s === undefined || s === null) return null;
  if (!plain(s) || s.version !== 1) throw new Error(`unreadable store: ${key}`);
  return sane(s as unknown as AppState);
}
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
 * The project drafts typed as a guest (lesson/ProjectView) become the account's, when the account takes over the guest's
 * learning (adoptsGuest): the guest was told to create an account to send their work. A step the account already has a
 * draft for keeps it. The keys are lesson/engine.ts draftKey's, "darsi-project-draft:<scope>:<lessonId>:<stepId>", and
 * from before drafts had a scope "darsi-project-draft:<lessonId>:<stepId>" (the guest's when it was never sent). They
 * are spelled out here, not imported: a module this file newly imports is cut out of the startup file into a file of
 * its own (measured twice: with lesson/engine, and with a module holding only these keys, 9 startup files instead of 8).
 * tests/drafts.test.tsx holds the two spellings together.
 */
export function adoptDrafts(scope: string): void {
  try {
    const all = "darsi-project-draft:", from = `${all}guest:`;
    // The keys first: writing while walking localStorage by index can skip some.
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k?.startsWith(all));
    for (const key of keys) {
      const text = localStorage.getItem(key);
      if (text === null) continue;
      let rest: string | null = null;
      if (key.startsWith(from)) rest = key.slice(from.length);
      else if (key.slice(all.length).split(":").length === 2) {
        let by: unknown;
        try { by = (JSON.parse(text) as { sentBy?: unknown } | null)?.sentBy; } catch { /* unreadable: nobody sent it */ }
        if (!by) rest = key.slice(all.length);
      }
      if (rest === null) continue;
      const mine = `${all}${scope}:${rest}`;
      if (localStorage.getItem(mine) === null) localStorage.setItem(mine, text);
      localStorage.removeItem(key);
    }
  } catch { /* blocked, or full: what couldn't move stays the guest's */ }
}

/**
 * localStorage "darsi:unsent:<uid>": this account finished a lesson or saved a note on this device that the cloud has not
 * acknowledged yet. Set by StoreProvider as the change is made (an account's store only, offline too), and by loadStore
 * when a new account takes over lessons or notes a guest made here; cleared by
 * state/sync.ts useCloudSync once a server read and the write acks show nothing is left to send. Its value is unique per
 * change, so a clear only removes the mark it saw: a lesson finished while a push was on its way keeps it.
 * A session the server ends (AuthProvider sessionEnded) and Sign out keep the account's local store while it is set, and
 * the next sign-in of that account here sends what it holds. It lives here, not in sync.ts, because sync.ts imports this
 * file (a cycle), and a new import into this file splits the startup bundle (adoptDrafts says how).
 * Private mode (localStorage throws): no mark, as before.
 */
const UNSENT = "darsi:unsent:";
export const unsent = {
  get(uid: string): string | null { try { return localStorage.getItem(`${UNSENT}${uid}`); } catch { return null; } },
  mark(uid: string) { try { localStorage.setItem(`${UNSENT}${uid}`, `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`); } catch { /* private mode */ } },
  /** Removes the mark only if it is still `seen` (unsent.get when the push began). */
  clear(uid: string, seen: string | null) {
    try { if (seen !== null && localStorage.getItem(`${UNSENT}${uid}`) === seen) localStorage.removeItem(`${UNSENT}${uid}`); } catch { /* private mode */ }
  },
};
/** What a project draft holds that was typed, not chosen (lesson/ProjectView Draft): one of these with words is work. */
const TYPED = ["text", "explain", "aiHow", "repo", "links", "check"];
/**
 * Whether `uid` has work on this device that the cloud lacks: the unsent mark, and with `drafts` also a project draft
 * with something typed in it that was never sent (a capstone milestone sent from here has `sentAt`, and counts again
 * once it was changed after that: `editedAt`, which ProjectView stamps on every change). Drafts never go to
 * the cloud by themselves (the person sends them), so what ends a session counts them, Sign out and the server alike:
 * the account's copy stays on the device for its next sign-in here (TECHNICAL.md "What a phone keeps"). "Leave
 * <organization>" (sync.ts flushSync) asks only about lessons and notes. Keys as adoptDrafts spells them. An unreadable
 * draft counts as work.
 */
export function hasUnsent(uid: string, drafts = false): boolean {
  if (unsent.get(uid) !== null) return true;
  if (!drafts) return false;
  try {
    const prefix = `darsi-project-draft:${uid}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      let d: Record<string, unknown> | null;
      try { d = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown> | null; } catch { return true; }
      if (!d || typeof d !== "object") continue;
      const sent = typeof d.sentAt === "number" && d.sentAt > 0;
      if (sent && !(typeof d.editedAt === "number" && d.editedAt > (d.sentAt as number))) continue;
      if (TYPED.some((f) => typeof d![f] === "string" && (d![f] as string).trim() !== "")) return true;
    }
  } catch { /* storage blocked: nothing can be read, so nothing is known to be unsent */ }
  return false;
}

/**
 * Loads under way, by store key. A second effect run for the same store (React's StrictMode in development) joins the
 * first: two loads side by side could each run the guest adoption, the later one finding the guest store already emptied.
 */
const loads = new Map<string, Promise<AppState | null>>();
/**
 * The state a store starts from: its own copy; else, for an account used here for the first time, the guest's settings,
 * or with `adoptGuest` the guest's learning too; else null (nothing stored: the blank state). Rejects when the device's
 * copy couldn't be read (readStore).
 */
function loadStore(key: string, scope: string, adoptGuest: boolean): Promise<AppState | null> {
  let load = loads.get(key);
  if (load) return load;
  load = (async () => {
    const own = await readStore(key);
    if (own || scope === "guest") return own;
    let guest: AppState | null = null;
    // Only the guest's settings are wanted: an unreadable guest store costs a new account nothing. Adopting, the person's
    // learning is in it, so that is a failed load too (they try again) rather than an account that starts without it.
    try { guest = await readStore(GUEST_KEY); } catch (e) { if (adoptGuest) throw e; }
    if (!guest) return null;
    if (!adoptGuest) return settingsOf(guest);
    const mine: AppState = { ...guest, guest: false };
    // The guest's lessons and notes are the account's now, and the cloud has none of them: sync holds them back until
    // its first server read, so they are not in Firestore's queue either. Unsent, then (Sign out and an ended session
    // keep them), until sync says the cloud has them. Marked before the write: a full phone keeps them only in memory.
    if (Object.keys(mine.progress).length || Object.values(mine.notes).some((t) => typeof t === "string" && t.trim() !== "")) unsent.mark(scope);
    // The account's copy is written before the guest's learning is cleared: a crash, a closed tab or a full phone in
    // between leaves it in at least one of the two. (It used to be cleared first, with the account's copy only in memory.)
    if (!signedOutHere(scope, key)) try {
      await storage.set(key, mine);
      adoptDrafts(scope); // the project they typed as a guest, told to make an account to send it
      await storage.set(GUEST_KEY, settingsOf(guest));
    } catch { /* full or blocked: the guest's copy stays; the first save tries the account's again */ }
    return mine;
  })();
  loads.set(key, load);
  const done = () => { if (loads.get(key) === load) loads.delete(key); };
  load.then(done, done);
  return load;
}

/** Said once per page load: the phone is full (the save effect). */
let saidFull = false;
/**
 * Once per page load, after the first lesson finished in it: ask the browser to keep this site's storage when the phone
 * runs low (platform persistStorage; until now only a Download tap asked). A guest's progress lives only here. Best
 * effort, and never in the way of the lesson being recorded.
 */
let askedToKeep = false;
const keepStorage = () => {
  if (askedToKeep) return;
  askedToKeep = true;
  void Promise.resolve().then(() => persistStorage()).catch(() => {});
};

/**
 * In place of the app when this person's store couldn't be read. Both languages at once, as index.html's boot fallback:
 * the language is a setting inside the store that didn't open (and the i18n provider sits under it). Arabic is in the
 * phone's own font (dr-other-script), so an English page doesn't fetch the Arabic web fonts for it.
 * `again`: Retry was tried and failed too, so the way on without saving is offered (a browser with no storage at all,
 * a store only a newer version reads): nothing is written, so nothing is lost by it.
 */
function LoadFailed({ again, onRetry, onSkip }: { again: boolean; onRetry: () => void; onSkip: () => void }) {
  return (
    <main className="auth-shell">
      <div className="auth-card" role="alert">
        <h1 lang="en" dir="ltr">Your saved progress couldn’t be opened</h1>
        <p lang="en" dir="ltr">Nothing was changed or deleted. Try again. If it keeps happening, close this app and open it again.</p>
        <h1 lang="ar" dir="rtl" className="dr-other-script">تعذّر فتح تقدّمك المحفوظ</h1>
        <p lang="ar" dir="rtl" className="dr-other-script">لم يتغيّر شيء ولم يُحذف شيء. حاول مرة أخرى، وإذا تكرّر ذلك فأغلق التطبيق وافتحه من جديد.</p>
        <Button block icon="sync" onClick={onRetry}><span lang="en">Try again</span> / <span lang="ar" className="dr-other-script">حاول مرة أخرى</span></Button>
        {again && <>
          <p lang="en" dir="ltr">You can carry on without it, but what you do now won’t be kept on this device.</p>
          <p lang="ar" dir="rtl" className="dr-other-script">يمكنك المتابعة من دونه، لكنّ ما تفعله الآن لن يُحفظ على هذا الجهاز.</p>
          <Button block variant="ghost" onClick={onSkip}><span lang="en">Carry on without saving</span> / <span lang="ar" className="dr-other-script">تابع دون حفظ</span></Button>
        </>}
      </div>
    </main>
  );
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
  // "failed": the device's copy couldn't be read. The app isn't shown (LoadFailed is) and nothing is saved, or the blank
  // state would be written over the person's work. "unsaved": they carried on anyway; this visit is never saved.
  const [phase, setPhase] = useState<"loading" | "ready" | "failed" | "unsaved">("loading");
  const [tries, setTries] = useState(0);
  const [full, setFull] = useState(false);
  const ready = phase === "ready" || phase === "unsaved";
  useEffect(() => {
    let live = true;
    // Signed in here again (a new mount for this account): its store may be written once more.
    if (scope !== "guest" && !gone.has(scope)) try { localStorage.removeItem(`${GONE_MARK}${key}`); } catch { /* private mode */ }
    // One read per mount and per Retry tap: a store that fails every time (no storage in this browser) never loops.
    loadStore(key, scope, adoptGuest).then(
      (s) => { if (!live) return; if (s) dispatch({ type: "hydrate", state: s }); setPhase("ready"); },
      () => { if (live) setPhase("failed"); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries]);
  useEffect(() => {
    if (phase !== "ready" || signedOutHere(scope, key)) return;
    // Saved: other tabs and windows of the app on this device hear of it (the storage event), and take it in (tabSync).
    storage.set(key, state).then(() => { try { localStorage.setItem(`${SAVED_MARK}${key}`, String(Date.now())); } catch { /* private mode */ } })
      // A full phone is said once (the person can free space before the next lesson); any other failure stays silent.
      .catch((e) => { if (!saidFull && isQuotaError(e)) { saidFull = true; setFull(true); } });
  }, [key, scope, state, phase]);
  // What another tab saved: when it says so, and when this one comes back into view (a frozen tab may have missed it).
  // One read of the store each time; no polling.
  useEffect(() => {
    if (phase !== "ready") return;
    const pull = () => { if (!signedOutHere(scope, key)) storage.get<AppState>(key).then((s) => { if (s?.version === 1) dispatch({ type: "tabSync", stored: sane(s) }); }).catch(() => {}); };
    const onStorage = (e: StorageEvent) => { if (e.key === `${SAVED_MARK}${key}`) pull(); };
    const onShow = () => { if (document.visibilityState === "visible") pull(); };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onShow);
    return () => { window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onShow); };
  }, [key, scope, phase]);
  // The first lesson finished in this visit (a new one, not a replay): ask the browser to keep this site's storage.
  const latest = useRef(state);
  latest.current = state;
  const send = useCallback((a: Action) => {
    if (a.type === "completeLesson" && !latest.current.progress[a.id]) keepStorage();
    // An account's lesson or note: unsent until sync says the cloud has it (marked before the state changes, so a push
    // that starts after this sees the mark). A guest's work lives only here and is never forgotten for a session.
    if (scope !== "guest" && (a.type === "completeLesson" || a.type === "saveNote")) unsent.mark(scope);
    dispatch(a);
  }, [scope]);
  const value = useMemo(() => ({ state, dispatch: send, ready }), [state, ready, send]);
  if (phase === "failed") return <LoadFailed again={tries > 0} onRetry={() => { setPhase("loading"); setTries((n) => n + 1); }} onSkip={() => setPhase("unsaved")} />;
  return (
    <Ctx.Provider value={value}>
      {children}
      {full && <UpdateToast floating actionLabel="OK" onAction={() => setFull(false)}>
        <span lang="en" dir="ltr">This phone is full. Your last lesson may not be saved: free some space.</span>{" "}
        <span lang="ar" dir="rtl" className="dr-other-script">ذاكرة هذا الهاتف ممتلئة، وقد لا يُحفظ آخر درس. أفرغ بعض المساحة.</span>
      </UpdateToast>}
    </Ctx.Provider>
  );
}
export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
