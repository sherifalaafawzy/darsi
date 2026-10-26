/**
 * Course editor storage (rules: firebase/firestore.rules, "Course editor"). One-shot reads only: editors reload a list
 * when they open it, never through a live listener. units/{id} is the light record lists read; unitDrafts/{id} holds
 * the content. Both are saved in one batch, and every save bumps `rev` so two editors can't overwrite each other.
 */
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, where, writeBatch, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { Lesson, LocalText, Track, TrackDef, Unit } from "../content/types";
import { mergeTracks } from "../content/tracks";
import { copyLesson } from "./ids";

export interface UnitMeta {
  id: string; owner: string; title: LocalText; track: Track; level: number; lessonCount: number; rev: number;
  /** Lesson titles (units saved before this was added have none until their next save). */
  lessons?: { id: string; title: LocalText }[];
  updatedAt?: Timestamp | null; updatedBy?: string;
  /** Set by the publishUnit function: the live version, and the draft rev it was made from. */
  published?: { version: number; rev?: number; at?: Timestamp | null; by?: string } | null;
}
export type Status = "draft" | "live" | "changed";
export const statusOf = (m: Pick<UnitMeta, "rev" | "published">): Status => (!m.published ? "draft" : m.published.rev === m.rev ? "live" : "changed");

/** Firestore refuses `undefined`; the editor leaves optional fields undefined. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The light record lists read: no step content, but each lesson's title so the list can show them. */
const metaOf = (u: Unit) => ({ title: plain(u.title), track: u.track, level: u.level, lessonCount: u.lessons.length, lessons: u.lessons.map((l) => ({ id: l.id, title: plain(l.title) })) });

/** The list record of a unit just created here, so the list can show it without reading it back. */
export const freshMeta = (owner: string, u: Unit): UnitMeta => ({ id: u.id, owner, ...metaOf(u), rev: 1, updatedAt: null, published: null });

export async function listUnits(owner: string): Promise<UnitMeta[]> {
  const snap = await getDocs(query(collection(db, "units"), where("owner", "==", owner), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UnitMeta);
}

export async function getUnit(id: string): Promise<{ meta: UnitMeta; unit: Unit } | null> {
  const [m, d] = await Promise.all([getDoc(doc(db, "units", id)), getDoc(doc(db, "unitDrafts", id))]);
  if (!m.exists() || !d.exists()) return null;
  return { meta: { id, ...m.data() } as UnitMeta, unit: d.data().unit as Unit };
}

/** Platform admins only (the rules let them read any unit, even one that doesn't exist yet). */
export async function unitExists(id: string) { return (await getDoc(doc(db, "units", id))).exists(); }

export async function createUnit(owner: string, unit: Unit, uid: string) {
  const b = writeBatch(db);
  b.set(doc(db, "units", unit.id), { owner, ...metaOf(unit), rev: 1, updatedAt: serverTimestamp(), updatedBy: uid, published: null });
  b.set(doc(db, "unitDrafts", unit.id), { owner, rev: 1, unit: plain(unit) });
  await b.commit();
}

/** Saves the draft as rev + 1. A refusal while someone else saved meanwhile is reported as "conflict". */
export async function saveUnit(unit: Unit, rev: number, uid: string): Promise<{ rev: number } | { conflict: true }> {
  const b = writeBatch(db);
  b.update(doc(db, "units", unit.id), { ...metaOf(unit), rev: rev + 1, updatedAt: serverTimestamp(), updatedBy: uid });
  b.update(doc(db, "unitDrafts", unit.id), { rev: rev + 1, unit: plain(unit) });
  try { await b.commit(); return { rev: rev + 1 }; }
  catch (e) {
    const now = (await getDoc(doc(db, "units", unit.id)).catch(() => null))?.get("rev");
    if (typeof now === "number" && now !== rev) return { conflict: true };
    throw e;
  }
}

/** Appends a copy of `lesson` (new id) to another unit's draft, as a normal save of that unit. */
export async function copyLessonTo(targetId: string, lesson: Lesson, uid: string): Promise<{ title: LocalText } | { conflict: true } | null> {
  const r = await getUnit(targetId);
  if (!r) return null;
  const res = await saveUnit({ ...r.unit, lessons: [...r.unit.lessons, copyLesson(lesson, r.unit)] }, r.meta.rev, uid);
  return "conflict" in res ? res : { title: r.unit.title };
}

/** Platform settings as saved (config/settings; platform admins only), with the built-in tracks filled in. */
export async function getSettings(): Promise<{ rev: number; tracks: TrackDef[] }> {
  const s = await getDoc(doc(db, "config", "settings"));
  return { rev: Number(s.get("rev")) || 0, tracks: mergeTracks(s.exists() ? (s.get("tracks") as TrackDef[]) : null) };
}

export interface TrackUse { id: string; title: LocalText; level: number }
/** Every owner's units by track, so the Tracks page can say what a change would strand (platform admins read them all). */
export async function unitsByTrack(): Promise<Map<string, TrackUse[]>> {
  const out = new Map<string, TrackUse[]>();
  for (const d of (await getDocs(collection(db, "units"))).docs) {
    const track = String(d.get("track") ?? "");
    out.set(track, [...(out.get(track) ?? []), { id: d.id, title: d.get("title") as LocalText, level: Number(d.get("level")) || 1 }]);
  }
  return out;
}
