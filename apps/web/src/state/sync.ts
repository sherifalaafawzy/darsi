/**
 * Cloud copy of a signed-in person's learning: users/{uid}/progress/{lessonId} and users/{uid}/notes/{lessonId}.
 * Built for cheap phones on expensive, patchy data: no live listeners and no polling. Both collections are read once
 * per sign-in (and once more when the connection returns, if that first read only reached the offline cache), and only
 * what changed is written. Writes made offline wait in Firestore's local queue and go out when the phone reconnects.
 */
import { useEffect, useReducer, useRef } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db, firebaseReady } from "../firebase";
import { loadCatalog, loadUnit } from "../content/load";
import type { Track } from "../content/types";
import { useStore, type AppState, type LessonResult, type RemoteNote } from "./store";

export interface Remote {
  progress: Record<string, LessonResult>;
  notes: Record<string, RemoteNote>;
  /** Read from the server at least once, not only from the offline cache. */
  synced: boolean;
}
type Meta = Pick<LessonResult, "unitId" | "track" | "competencies">;
type Raw = { id: string; data: Record<string, unknown> };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));

/**
 * Which local entries to write: missing from the cloud copy, or newer here. Until the cloud copy has come from the
 * server, only entries made since `since` (this session) are written, so a stale copy on this phone never
 * overwrites newer work from another device.
 */
export function toPush(s: Pick<AppState, "progress" | "notes" | "notesAt">, r: Remote, since: number): { progress: string[]; notes: string[] } {
  const progress = Object.entries(s.progress).filter(([id, l]) => {
    const x = r.progress[id];
    return x ? l.completedAt > x.completedAt : r.synced || Date.parse(l.completedAt) >= since;
  }).map(([id]) => id);
  const notes = Object.entries(s.notes).filter(([id, text]) => {
    const x = r.notes[id], at = s.notesAt[id] ?? 0;
    return x ? text !== x.text && at > x.at : text.trim() !== "" && (r.synced || at >= since);
  }).map(([id]) => id);
  return { progress, notes };
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

/** Keeps the signed-in person's progress and notes in the cloud (admins and teachers read them there). */
export function useCloudSync(uid?: string) {
  const { state, dispatch, ready } = useStore();
  const on = Boolean(uid && ready && firebaseReady);
  // The cloud copy lives in a ref: the screen never shows it, so reading it costs no re-render. `pulled` re-runs the push once per read.
  const remote = useRef<Remote>({ progress: {}, notes: {}, synced: false });
  const since = useRef(0);
  const sent = useRef(new Set<string>());
  const [pulled, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!on) return;
    let live = true;
    remote.current = { progress: {}, notes: {}, synced: false }; since.current = Date.now(); sent.current.clear();
    const pull = async () => {
      const [p, n] = await Promise.all([getDocs(collection(db, "users", uid!, "progress")), getDocs(collection(db, "users", uid!, "notes"))]);
      if (!live) return;
      remote.current = { progress: remoteProgress(raw(p)), notes: remoteNotes(raw(n)), synced: remote.current.synced || (!p.metadata.fromCache && !n.metadata.fromCache) };
      dispatch({ type: "mergeRemote", progress: remote.current.progress, notes: remote.current.notes });
      bump();
    };
    const retry = () => { if (!remote.current.synced) pull().catch(warn); };
    pull().catch(warn);
    window.addEventListener("online", retry);
    return () => { live = false; window.removeEventListener("online", retry); };
  }, [on, uid, dispatch]);

  const { progress, notes, notesAt } = state;
  useEffect(() => {
    if (!on) return;
    const plan = toPush({ progress, notes, notesAt }, remote.current, since.current);
    const ps = plan.progress.filter((id) => !sent.current.has(`p:${id}@${progress[id].completedAt}`));
    const ns = plan.notes.filter((id) => !sent.current.has(`n:${id}@${notesAt[id] ?? 0}`));
    if (!ps.length && !ns.length) return;
    ps.forEach((id) => sent.current.add(`p:${id}@${progress[id].completedAt}`));
    ns.forEach((id) => sent.current.add(`n:${id}@${notesAt[id] ?? 0}`));
    (async () => {
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
    })().catch(warn);
    // `pulled` re-runs this after each read: entries held back until the server copy was known can go now.
  }, [on, uid, progress, notes, notesAt, pulled]);
}
