/**
 * Course editor storage (rules: firebase/firestore.rules, "Course editor"). One-shot reads only: editors reload a list
 * when they open it, never through a live listener. units/{id} is the light record lists read; unitDrafts/{id} holds
 * the content. Both are saved in one batch, and every save bumps `rev` so two editors can't overwrite each other.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Timestamp } from "firebase/firestore";
import { db, storageJSON } from "../firebase";
import { audienceOf, type Audience, type LanguageDef, type Lesson, type LocalText, type Track, type TrackDef, type Unit } from "../content/types";
import { mergeTracks } from "../content/tracks";
import { copyLesson } from "./ids";

export interface UnitMeta {
  id: string; owner: string; title: LocalText; track: Track; level: number; lessonCount: number; rev: number;
  /** Units saved before audiences existed have none: they are for teachers. */
  audience?: Audience;
  /** Lesson titles (units saved before this was added have none until their next save). */
  lessons?: { id: string; title: LocalText }[];
  updatedAt?: Timestamp | null; updatedBy?: string;
  /** Set by the publishUnit function: the live version, and the draft rev it was made from. */
  published?: { version: number; rev?: number; at?: Timestamp | null; by?: string } | null;
  /**
   * Set by the editor: draft rev `rev` holds exactly what published version `version` holds (the author brought that
   * version back, or undid their changes). Any later save moves the rev on, and any publish the version, so a stale
   * mark never counts.
   */
  same?: { version: number; rev: number } | null;
}
export type Status = "draft" | "live" | "changed";
export const statusOf = (m: Pick<UnitMeta, "rev" | "published"> & { same?: UnitMeta["same"] }): Status =>
  (!m.published ? "draft" : m.published.rev === m.rev || (m.same?.rev === m.rev && m.same.version === m.published.version) ? "live" : "changed");

/** JSON with every object's keys sorted: two drafts are the same content whatever order Firestore or an edit left their keys in. */
export function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
}

/** Firestore refuses `undefined`; the editor leaves optional fields undefined. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The light record lists read: no step content, but each lesson's title so the list can show them. */
const metaOf = (u: Unit) => ({ title: plain(u.title), track: u.track, level: u.level, audience: audienceOf(u), lessonCount: u.lessons.length, lessons: u.lessons.map((l) => ({ id: l.id, title: plain(l.title) })) });

/** The list record of a unit just created here, so the list can show it without reading it back. */
export const freshMeta = (owner: string, u: Unit): UnitMeta => ({ id: u.id, owner, ...metaOf(u), rev: 1, updatedAt: null, published: null });

export async function listUnits(owner: string): Promise<UnitMeta[]> {
  const snap = await getDocs(query(collection(db, "units"), where("owner", "==", owner), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UnitMeta);
}

/** The active organizations, by name: whose own courses a platform admin can open (one read, platform admins only). */
export async function listOrgs(): Promise<{ id: string; name: string }[]> {
  const snap = await getDocs(query(collection(db, "orgs"), where("status", "==", "active")));
  return snap.docs.map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) })).sort((a, b) => a.name.localeCompare(b.name));
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

/**
 * Saves the draft as rev + 1. A refusal while someone else saved meanwhile is reported as "conflict". `same`: the
 * published version this draft is identical to, marked so lists show it as published (UnitMeta.same). Rules that
 * don't know the mark yet refuse it; the draft is then saved without it.
 */
export async function saveUnit(unit: Unit, rev: number, uid: string, same?: number): Promise<{ rev: number } | { conflict: true }> {
  const b = writeBatch(db);
  b.update(doc(db, "units", unit.id), { ...metaOf(unit), rev: rev + 1, updatedAt: serverTimestamp(), updatedBy: uid, ...(same ? { same: { version: same, rev: rev + 1 } } : {}) });
  b.update(doc(db, "unitDrafts", unit.id), { rev: rev + 1, unit: plain(unit) });
  try { await b.commit(); return { rev: rev + 1 }; }
  catch (e) {
    const now = (await getDoc(doc(db, "units", unit.id)).catch(() => null))?.get("rev");
    if (typeof now === "number" && now !== rev) return { conflict: true };
    if (same) return saveUnit(unit, rev, uid);
    throw e;
  }
}

/**
 * Marks a draft that nobody changed as identical to published version `version` (found by comparing the two), as a
 * save of the same content (its "Updated" date stays). Best effort: null when refused (someone saved meanwhile, or
 * rules without the mark).
 */
export async function markSame(unitId: string, rev: number, version: number, uid: string): Promise<{ rev: number } | null> {
  const b = writeBatch(db);
  b.update(doc(db, "units", unitId), { rev: rev + 1, updatedBy: uid, same: { version, rev: rev + 1 } });
  b.update(doc(db, "unitDrafts", unitId), { rev: rev + 1 });
  try { await b.commit(); return { rev: rev + 1 }; } catch { return null; }
}

/** Where a published version lives in Storage (functions/src/catalog.ts unitPath). */
export const publishedPath = (owner: string, unitId: string, version: number) => `${owner === "public" ? "content" : `orgs/${owner}`}/units/${unitId}/v${version}.json`;
/**
 * A published version of a unit, as learners got it: publishUnit writes the draft as it was saved, so putting it back
 * in the draft loses nothing. The live version and the one before it are kept (catalog.ts staleVersions); unpublishing
 * deletes them all. Read through the SDK: org units are for that org's members only (storage.rules).
 */
export async function readPublished(owner: string, unitId: string, version: number): Promise<Unit> {
  const u = (await storageJSON(publishedPath(owner, unitId, version))) as Unit | null;
  if (!u || typeof u !== "object" || u.id !== unitId || !Array.isArray(u.lessons)) throw new Error(`v${version} is not this unit`);
  return u;
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

/** A language platform admins are adding (translations/{code}): its details and its UI strings, saved as drafts. */
export interface TranslationDraft extends LanguageDef {
  messages: Record<string, string>;
  rev: number;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
  /** Set by publishLanguage: the live pack's version and the draft rev it was made from. */
  published?: { version: number; rev?: number; at?: Timestamp | null; by?: string } | null;
}
export const translationStatus = (d: Pick<TranslationDraft, "rev" | "published">): Status => statusOf(d);

export async function listTranslations(): Promise<TranslationDraft[]> {
  return (await getDocs(collection(db, "translations"))).docs.map((d) => ({ ...d.data(), code: d.id }) as TranslationDraft);
}
export async function getTranslation(code: string): Promise<TranslationDraft | null> {
  const d = await getDoc(doc(db, "translations", code));
  return d.exists() ? ({ ...d.data(), code } as TranslationDraft) : null;
}
const draftFields = (d: LanguageDef & { messages: Record<string, string> }) =>
  ({ native: d.native.trim(), english: d.english.trim(), dir: d.dir, numerals: d.numerals.trim(), messages: d.messages });
export async function createTranslation(d: LanguageDef, uid: string) {
  await setDoc(doc(db, "translations", d.code), { code: d.code, ...draftFields({ ...d, messages: {} }), rev: 1, updatedAt: serverTimestamp(), updatedBy: uid });
}
/** Saves as rev + 1; refused (and reported as "conflict") when someone else saved meanwhile. */
export async function saveTranslation(d: LanguageDef & { messages: Record<string, string> }, rev: number, uid: string): Promise<{ rev: number } | { conflict: true }> {
  try { await updateDoc(doc(db, "translations", d.code), { ...draftFields(d), rev: rev + 1, updatedAt: serverTimestamp(), updatedBy: uid }); return { rev: rev + 1 }; }
  catch (e) {
    const now = (await getDoc(doc(db, "translations", d.code)).catch(() => null))?.get("rev");
    if (typeof now === "number" && now !== rev) return { conflict: true };
    throw e;
  }
}
/** Only while unpublished (the rules refuse otherwise). */
export const deleteTranslation = (code: string) => deleteDoc(doc(db, "translations", code));
