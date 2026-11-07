/**
 * Cloud copy of a signed-in person's learning: users/{uid}/progress/{lessonId}, users/{uid}/notes/{lessonId} and
 * users/{uid}/certs/{unitId} (certificates as first earned, so a new phone gets them back even after their course is
 * unpublished). Built for cheap phones on expensive, patchy data: no live listeners and no polling. The three
 * collections are read once per sign-in (and once more when the connection returns, if that first read only reached the
 * offline cache), and only what changed is written. Writes made offline wait in Firestore's local queue and go out when
 * the phone reconnects.
 */
import { useEffect, useReducer, useRef } from "react";
import { firebaseReady } from "../firebase-config";
import { loadFirebase } from "../fb";
import { loadCatalog, loadUnit } from "../content/load";
import { STAGES, teachStage, type Stage, type Track } from "../content/types";
import type { EarnedCert } from "../content/cert";
import { LEARN_KEYS, same, useStore, type AppState, type LearnKey, type LessonResult, type RemoteNote } from "./store";

export interface Remote {
  progress: Record<string, LessonResult>;
  notes: Record<string, RemoteNote>;
  certs: Record<string, EarnedCert>;
  /** Lessons and notes read from the server at least once, not only from the offline cache. */
  synced: boolean;
  /** The same for certificates, which are read on their own: a failed read of them never holds lessons and notes back. */
  certsSynced: boolean;
}
type Meta = Pick<LessonResult, "unitId" | "track" | "competencies">;
type Raw = { id: string; data: Record<string, unknown> };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
const empty = (): Remote => ({ progress: {}, notes: {}, certs: {}, synced: false, certsSynced: false });

/**
 * Which local entries to write: missing from the cloud copy, or newer here. Until the cloud copy has come from the
 * server, only entries made since `since` (this session) are written, so a stale copy on this phone never
 * overwrites newer work from another device. A certificate is written only if the cloud lacks it (the rules take it
 * once and never again) and the rules would take it (certDoc).
 */
export function toPush(s: Pick<AppState, "progress" | "notes" | "notesAt" | "certs">, r: Remote, since: number): { progress: string[]; notes: string[]; certs: string[] } {
  const progress = Object.entries(s.progress).filter(([id, l]) => {
    const x = r.progress[id];
    return x ? l.completedAt > x.completedAt : r.synced || Date.parse(l.completedAt) >= since;
  }).map(([id]) => id);
  const notes = Object.entries(s.notes).filter(([id, text]) => {
    const x = r.notes[id], at = s.notesAt[id] ?? 0;
    return x ? text !== x.text && at > x.at : text.trim() !== "" && (r.synced || at >= since);
  }).map(([id]) => id);
  const certs = Object.entries(s.certs ?? {})
    .filter(([id, c]) => !r.certs[id] && (r.certsSynced || Date.parse(c.at) >= since) && certDoc(id, c) !== null).map(([id]) => id);
  return { progress, notes, certs };
}

/** The progress doc the security rules accept: accuracy 0–1, xp an int 0–100, and no undefined fields. */
export function progressDoc(id: string, l: LessonResult, meta: Meta = {}): Record<string, unknown> {
  const d: Record<string, unknown> = { lessonId: id, accuracy: clamp(l.accuracy, 0, 1), xp: Math.round(clamp(l.xp, 0, 100)), seconds: Math.round(clamp(l.seconds, 0, 864e5)), completedAt: l.completedAt };
  const unitId = l.unitId ?? meta.unitId, track = l.track ?? meta.track, competencies = l.competencies ?? meta.competencies;
  if (unitId) d.unitId = unitId;
  if (track) d.track = track;
  if (competencies?.length) d.competencies = competencies;
  return d;
}

export const remoteProgress = (docs: Raw[]): Record<string, LessonResult> => Object.fromEntries(docs.filter((d) => typeof d.data.completedAt === "string").map(({ id, data: d }) => [id, {
  done: true as const, accuracy: Number(d.accuracy) || 0, xp: Number(d.xp) || 0, seconds: Number(d.seconds) || 0, completedAt: d.completedAt as string,
  ...(typeof d.unitId === "string" ? { unitId: d.unitId } : {}), ...(typeof d.track === "string" ? { track: d.track as Track } : {}),
  ...(Array.isArray(d.competencies) ? { competencies: d.competencies as string[] } : {}),
}]));
export const remoteNotes = (docs: Raw[]): Record<string, RemoteNote> =>
  Object.fromEntries(docs.filter((d) => typeof d.data.text === "string").map(({ id, data: d }) => [id, { text: d.text as string, at: Number(d.updatedAt) || 0 }]));
/** Certificates as recorded in the cloud; a doc without an English title, a track or a date is left out. */
export const remoteCerts = (docs: Raw[]): Record<string, EarnedCert> => Object.fromEntries(docs.flatMap(({ id, data: d }) => {
  const t = d.title as Record<string, unknown> | null;
  if (typeof d.at !== "string" || typeof d.track !== "string" || !t || typeof t !== "object" || typeof t.en !== "string") return [];
  const title = Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string")) as EarnedCert["title"];
  return [[id, { title, track: d.track as Track, at: d.at, ...(typeof d.code === "string" && CODE.test(d.code) ? { code: d.code } : {}) }]];
}));
/** A certificate's code as the rules take it (cert.ts certCode, or one from before: legacyCertCode). */
const CODE = /^DRS-[A-Z0-9-]{1,86}$/;

/** users/{uid}/certs/{unitId}: the course ids the rules take. */
const CERT_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const utf8 = new TextEncoder();
const size = (s: string) => utf8.encode(s).length;
/**
 * The certificate doc the security rules take, or null if they never would: a course id of 2–64 lowercase letters,
 * digits and dashes; only `title`, `track`, `at` and `code`; `title` 1–30 languages of text, the language codes joined by
 * commas at most 300 long and the texts together at most 6,000; `track` at most 24 and `at` at most 40; `code` "DRS-" and
 * up to 86 capitals, digits and dashes, or none. Lengths are counted in UTF-8 bytes, never fewer than the rules'
 * characters. A language that doesn't fit is left out, never cut, English first; a code that doesn't fit is left out.
 */
export function certDoc(id: string, c: EarnedCert): { title: Record<string, string>; track: string; at: string; code?: string } | null {
  if (!CERT_ID.test(id) || typeof c?.track !== "string" || !c.track || size(c.track) > 24 || typeof c.at !== "string" || !c.at || size(c.at) > 40
    || !c.title || typeof c.title !== "object") return null;
  const title: Record<string, string> = {};
  let n = 0, keys = -1, texts = 0;
  for (const [lang, text] of Object.entries(c.title).sort(([a], [b]) => Number(b === "en") - Number(a === "en"))) {
    if (!lang || typeof text !== "string" || n >= 30 || keys + 1 + size(lang) > 300 || texts + size(text) > 6000) continue;
    title[lang] = text; n++; keys += 1 + size(lang); texts += size(text);
  }
  if (typeof title.en !== "string") return null;
  return { title, track: c.track, at: c.at, ...(typeof c.code === "string" && CODE.test(c.code) ? { code: c.code } : {}) };
}

/** lessonId → unit, track and competencies, for lessons finished before results carried them. Loaded only when needed. */
let index: Promise<Record<string, Meta>> | null = null;
function lessonIndex() {
  index ??= loadCatalog()
    .then((c) => Promise.all(c.units.filter((u) => u.available).map((u) => loadUnit(u.id).catch(() => null))))
    .then((units) => Object.fromEntries(units.flatMap((u) => (u ? u.lessons.map((l) => [l.id, { unitId: u.id, track: u.track, competencies: l.competencies }]) : []))))
    .catch((e) => { index = null; throw e; });
  return index;
}

const raw = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }): Raw[] => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
const warn = (e: unknown) => console.warn("Darsi sync:", e);

/** Keeps the signed-in person's progress, notes and certificates in the cloud (admins and teachers read them there). */
export function useCloudSync(uid?: string) {
  const { state, dispatch, ready } = useStore();
  const on = Boolean(uid && ready && firebaseReady);
  // The cloud copy lives in a ref: the screen never shows it, so reading it costs no re-render. `pulled` re-runs the push once per read.
  const remote = useRef<Remote>(empty());
  const since = useRef(0);
  const sent = useRef(new Set<string>());
  const [pulled, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!on) return;
    let live = true, certsCached = false;
    remote.current = empty(); since.current = Date.now(); sent.current.clear();
    const pull = async () => {
      // Signed-in only, so the SDK is already loading; nothing here reaches a guest's startup bundle.
      const [{ db }, { collection, getDocs }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      const read = (name: string) => getDocs(collection(db, "users", uid!, name));
      // Certificates are read on their own: if that read fails or is refused, lessons and notes still sync.
      const [p, n, c] = await Promise.all([read("progress"), read("notes"), read("certs").catch((e: unknown) => { warn(e); return null; })]);
      if (!live) return;
      const was = remote.current;
      certsCached = !!c?.metadata.fromCache;
      remote.current = {
        progress: remoteProgress(raw(p)), notes: remoteNotes(raw(n)), certs: c ? remoteCerts(raw(c)) : was.certs,
        synced: was.synced || (!p.metadata.fromCache && !n.metadata.fromCache), certsSynced: was.certsSynced || (!!c && !c.metadata.fromCache),
      };
      dispatch({ type: "mergeRemote", progress: remote.current.progress, notes: remote.current.notes, certs: remote.current.certs });
      bump();
    };
    // A read that reached only the offline cache is made again when the connection returns; a refused one isn't.
    const retry = () => { if (!remote.current.synced || (certsCached && !remote.current.certsSynced)) pull().catch(warn); };
    pull().catch(warn);
    window.addEventListener("online", retry);
    return () => { live = false; window.removeEventListener("online", retry); };
  }, [on, uid, dispatch]);

  const { progress, notes, notesAt, certs } = state;
  useEffect(() => {
    if (!on) return;
    const plan = toPush({ progress, notes, notesAt, certs }, remote.current, since.current);
    const ps = plan.progress.filter((id) => !sent.current.has(`p:${id}@${progress[id].completedAt}`));
    const ns = plan.notes.filter((id) => !sent.current.has(`n:${id}@${notesAt[id] ?? 0}`));
    // A certificate is sent at most once a session: the rules never take a second write, so a refusal is the end of it.
    const cs = plan.certs.filter((id) => !sent.current.has(`c:${id}`)).map((id) => [id, certs![id]] as const);
    if (!ps.length && !ns.length && !cs.length) return;
    ps.forEach((id) => sent.current.add(`p:${id}@${progress[id].completedAt}`));
    ns.forEach((id) => sent.current.add(`n:${id}@${notesAt[id] ?? 0}`));
    cs.forEach(([id]) => sent.current.add(`c:${id}`));
    (async () => {
      const [{ db }, { doc, setDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      const meta: Record<string, Meta> = ps.some((id) => !progress[id].unitId) ? await lessonIndex().catch(() => ({})) : {};
      for (const id of ps) {
        setDoc(doc(db, "users", uid!, "progress", id), progressDoc(id, progress[id], meta[id])).catch(warn);
        remote.current.progress[id] = progress[id];
      }
      for (const id of ns) {
        const n = { text: notes[id], at: notesAt[id] || Date.now() };
        setDoc(doc(db, "users", uid!, "notes", id), { text: n.text, updatedAt: n.at }).catch(warn);
        remote.current.notes[id] = n;
      }
      // Last, so nothing about a certificate can hold up a lesson or a note.
      for (const [id, c] of cs) {
        setDoc(doc(db, "users", uid!, "certs", id), certDoc(id, c)!).catch(warn);
        remote.current.certs[id] = c;
      }
    })().catch(warn);
    // `pulled` re-runs this after each read: entries held back until the server copy was known can go now.
  }, [on, uid, progress, notes, notesAt, certs, pulled]);
}

/* ---------- The learning profile: users/{uid} ---------- */

type Learning = { [K in LearnKey]?: AppState[K] };
const isMap = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

/**
 * The learning profile as users/{uid} holds it, each field checked (anything odd counts as missing), and when it last
 * changed there (`learnAt`, ms; 0 if never). Tracks an organization or a platform admin set there count too.
 */
export function learningOf(p: Record<string, unknown>): { values: Learning; at: number } {
  const v: Learning = {};
  if (p.onboarded === true) v.onboarded = true;
  if (Array.isArray(p.tracks) && p.tracks.length <= 30 && p.tracks.every((x) => typeof x === "string" && x.length > 0 && x.length <= 24)) v.tracks = [...new Set(p.tracks as string[])];
  if (isMap(p.levels)) v.levels = Object.fromEntries(Object.entries(p.levels).filter(([k, n]) => k.length <= 24 && isInt(n, 1, 12))) as Record<Track, number>;
  if (p.audience === "teachers" || p.audience === "students") v.audience = p.audience;
  if (STAGES.includes(p.stage as Stage)) v.stage = p.stage as Stage;
  if (isInt(p.weeklyLessons, 1, 100)) v.weeklyLessons = p.weeklyLessons;
  const teach = teachStage(typeof p.teach === "string" ? p.teach : null);
  if (teach) v.teach = teach;
  return { values: v, at: typeof p.learnAt === "number" && Number.isFinite(p.learnAt) && p.learnAt > 0 ? p.learnAt : 0 };
}

/** This device's learning profile, without what it has no answer for (a school account's audience, a student's `teach`). */
function learningHere(s: AppState): Learning {
  const v: Learning = { onboarded: s.onboarded, tracks: s.tracks, levels: s.levels, weeklyLessons: s.weeklyLessons };
  if (s.audience) v.audience = s.audience;
  if (s.stage) v.stage = s.stage;
  const teach = teachStage(s.teach);
  if (teach) v.teach = teach;
  return v;
}

/**
 * What to copy between this device and the account's learning profile on users/{uid} (`profile` as last read; null
 * before that, or if there is none), so a new device skips onboarding and every device keeps the same tracks and levels:
 * - not onboarded here: all of the profile's answers if it has them (onboarded with them); else only the tracks someone
 *   chose there (an organization) and where they teach, which onboarding then starts from;
 * - onboarded here, and the profile has answers at least as new (`learnAt`; the same date with other values means
 *   someone else, an admin, edited it): take what differs;
 * - onboarded here and newer here, or the profile has no answers yet: write what differs, and only that, dated.
 * Nothing when they agree, so the echo of a write ends there. The language and the current track stay per device.
 */
export function learningSync(s: AppState, profile: Record<string, unknown> | null, now = Date.now()): { pull?: Partial<AppState>; push?: Record<string, unknown> } {
  if (!profile) return {};
  const { values: there, at } = learningOf(profile);
  const mine = s.learnAt ?? 0;
  if (!s.onboarded) {
    if (there.onboarded) return { pull: { ...there, learnAt: at } };
    const pull: Partial<AppState> = {};
    if (there.tracks?.length && !s.tracks.length) pull.tracks = there.tracks;
    if (there.teach && !teachStage(s.teach)) pull.teach = there.teach;
    return Object.keys(pull).length ? { pull: { ...pull, learnAt: mine } } : {};
  }
  const here = learningHere(s);
  if (there.onboarded && at >= mine) {
    const pull = Object.fromEntries(LEARN_KEYS.filter((k) => there[k] !== undefined && !same(there[k], here[k])).map((k) => [k, there[k]])) as Partial<AppState>;
    return Object.keys(pull).length || at !== mine ? { pull: { ...pull, learnAt: at } } : {};
  }
  const diff = LEARN_KEYS.filter((k) => here[k] !== undefined && !same(here[k], there[k]));
  if (!diff.length) return {};
  // A device onboarded before profiles were kept has no date of its own: the first write dates both copies.
  const when = mine || now;
  return { push: { ...Object.fromEntries(diff.map((k) => [k, here[k]])), learnAt: when }, ...(mine ? {} : { pull: { learnAt: when } }) };
}

/**
 * Keeps a signed-in account's learning profile (LEARN_KEYS) the same on each of its devices (learningSync). It works
 * from the profile AuthProvider already reads at sign-in, so it reads nothing itself, and it writes only what changed.
 * `profileReady`: that read has answered (the profile, or that there is none).
 */
export function useLearningSync(uid: string | undefined, profile: Record<string, unknown> | null, profileReady: boolean) {
  const { state, dispatch, ready } = useStore();
  const on = Boolean(uid && ready && profileReady && firebaseReady);
  const sent = useRef("");
  const { onboarded, tracks, levels, audience, stage, weeklyLessons, teach, learnAt } = state;
  useEffect(() => {
    if (!on) return;
    const plan = learningSync(state, profile);
    if (plan.pull) dispatch({ type: "set", patch: plan.pull });
    const push = plan.push;
    if (!push) return;
    // Already on its way: the profile's echo of that write hasn't come back yet (or the write was refused; the next
    // change tries again, never a loop).
    const key = `${uid}:${JSON.stringify(push)}`;
    if (key === sent.current) return;
    sent.current = key;
    (async () => {
      const [{ db }, { doc, updateDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      // updateDoc replaces each field whole: a level or a track removed here goes from the profile too.
      await updateDoc(doc(db, "users", uid!), push);
    })().catch(warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, uid, profile, onboarded, tracks, levels, audience, stage, weeklyLessons, teach, learnAt, dispatch]);
}
