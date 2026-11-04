/**
 * The published courses as the server sees them: the public catalog, an organization's own, and the unit files
 * (Storage, written only by publishUnit). The progress trigger checks lesson results against them, and `collect`
 * accepts only course ids that are in them (TECHNICAL.md "Security").
 *
 * Unlike the tutor's loader, a failed read is an error here, not an empty catalog: a Storage hiccup must not make a
 * real lesson look unknown. Only a missing file (404) means "nothing published".
 */
import { catalogPath, type Owner } from "./catalog.js";
import { bucket } from "./storage.js";

const cache = new Map<string, { at: number; v: Promise<unknown> }>();
/** The value for `key`, loaded at most every `ms`; a failed load is forgotten at once so the next call tries again. */
function cached<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as Promise<T>;
  const v = load();
  cache.set(key, { at: Date.now(), v });
  v.catch(() => { if (cache.get(key)?.v === v) cache.delete(key); });
  if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, 500)) cache.delete(k);
  return v;
}

async function readJson(path: string): Promise<unknown | null> {
  try { return JSON.parse((await bucket().file(path).download())[0].toString("utf8")); }
  catch (e) { if ((e as { code?: number }).code === 404) return null; throw e; }
}

export interface CourseEntry { id: string; track: string; src?: string; version?: number }
interface UnitFile { id: string; track: string; lessons: { id: string; competencies?: unknown }[] }
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;

/** One owner's catalog ("public" or an orgId): its published units. */
export function catalogOf(owner: Owner): Promise<CourseEntry[]> {
  if (!OWNER.test(owner)) return Promise.resolve([]);
  return cached(`cat:${owner}`, 5 * 60e3, async () => {
    const c = (await readJson(catalogPath(owner))) as { units?: CourseEntry[] } | null;
    return (c?.units ?? []).filter((u) => typeof u?.id === "string" && typeof u.track === "string");
  });
}

/** The courses a person can see: the public ones and their organization's. */
export async function visibleCourses(orgId: string | null): Promise<CourseEntry[]> {
  const [pub, org] = await Promise.all([catalogOf("public"), orgId ? catalogOf(orgId) : Promise.resolve([])]);
  return [...pub, ...org];
}

const unitFile = (src: string) => cached(`unit:${src}`, 30 * 60e3, async () => (await readJson(src)) as UnitFile | null);

export interface LessonMeta { unitId: string; track: string; competencies: string[] }

/**
 * The unit, track and competencies of a published lesson the person can see, from the unit itself; null when no such
 * lesson is published for them. Lesson ids start with their unit's id and a dash (the validator requires it), so only
 * the matching unit file is read.
 */
export async function lessonMeta(lessonId: string, orgId: string | null): Promise<LessonMeta | null> {
  const candidates = (await visibleCourses(orgId)).filter((e) => e.src && lessonId.startsWith(`${e.id}-`)).sort((a, b) => b.id.length - a.id.length);
  for (const e of candidates) {
    const unit = await unitFile(e.src!);
    const lesson = unit?.lessons?.find((l) => l.id === lessonId);
    if (unit && lesson) {
      const competencies = (Array.isArray(lesson.competencies) ? lesson.competencies : []).filter((c): c is string => typeof c === "string" && c.length <= 40).slice(0, 30);
      return { unitId: unit.id, track: unit.track, competencies };
    }
  }
  return null;
}
