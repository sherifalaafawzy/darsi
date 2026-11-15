/**
 * The published courses as the server sees them: the public catalog, an organization's own, and the unit files
 * (Storage, written only by publishUnit). The progress trigger checks lesson results against them, and `collect`
 * accepts only course ids that are in them (TECHNICAL.md "Security").
 *
 * Unlike the tutor's loader, a failed read is an error here, not an empty catalog: a Storage hiccup must not make a
 * real lesson look unknown. Only a missing file (404) means "nothing published".
 *
 * Each instance keeps what it read for a while (catalogs 5 minutes, unit files 30), and a lesson result that isn't
 * counted when it arrives is never counted later (progress.ts answers "unknown lesson", and nothing sends it again).
 * So "not published" is only said from a fresh catalog: lessonMeta reads the catalogs again before it gives up, and a
 * missing unit file is never remembered.
 */
import { catalogPath, type Owner } from "./catalog.js";
import { bucket } from "./storage.js";
import { GRADED } from "./shared/types.js";

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
interface UnitFile { id: string; track: string; lessons: { id: string; competencies?: unknown; steps?: { type?: unknown }[] }[] }
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

/**
 * A published unit's file. One that is missing isn't remembered: the catalog that listed it is out of date (a newer
 * publish removed that version), or the file is about to be there, and half an hour of "no such lesson" would follow.
 */
function unitFile(src: string): Promise<UnitFile | null> {
  const key = `unit:${src}`;
  const v = cached(key, 30 * 60e3, async () => (await readJson(src)) as UnitFile | null);
  v.then((u) => { if (u === null && cache.get(key)?.v === v) cache.delete(key); }, () => {});
  return v;
}

/**
 * A catalog read less than this ago is taken as it is. Without it, every result for a lesson that really isn't
 * published (an account's old results for a retired course: buildRows asks about up to 1,000 at once; made-up ids)
 * would download the catalogs again. A course can't be published, fetched by a phone and a lesson of it finished
 * within this time, so nothing real is missed.
 */
export const CATALOG_FRESH_MS = 30e3;
/** Forgets the catalogs the person sees that are older than CATALOG_FRESH_MS; false when every one is that fresh. */
function forgetCatalogs(orgId: string | null): boolean {
  let any = false;
  for (const key of ["cat:public", ...(orgId ? [`cat:${orgId}`] : [])]) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CATALOG_FRESH_MS) continue;
    if (hit) cache.delete(key);
    any = true;
  }
  return any;
}

/**
 * `graded`: false when the lesson asks nothing that is marked right or wrong (a project or capstone stage, a reading):
 * its result then says nothing about accuracy, and the summary doesn't count it as a score (FC-06).
 */
export interface LessonMeta { unitId: string; track: string; competencies: string[]; graded?: boolean }

/** Whether a lesson has a step that is marked right or wrong (the engine's GRADED step types). */
export const lessonGraded = (lesson: { steps?: { type?: unknown }[] }) =>
  (Array.isArray(lesson.steps) ? lesson.steps : []).some((s) => GRADED.has(s?.type as never));

/** lessonMeta from what this instance holds now (or reads, when it holds nothing). */
async function findLesson(lessonId: string, orgId: string | null): Promise<LessonMeta | null> {
  const candidates = (await visibleCourses(orgId)).filter((e) => e.src && lessonId.startsWith(`${e.id}-`)).sort((a, b) => b.id.length - a.id.length);
  for (const e of candidates) {
    const unit = await unitFile(e.src!);
    const lesson = unit?.lessons?.find((l) => l.id === lessonId);
    if (unit && lesson) {
      const competencies = (Array.isArray(lesson.competencies) ? lesson.competencies : []).filter((c): c is string => typeof c === "string" && c.length <= 40).slice(0, 30);
      return { unitId: unit.id, track: unit.track, competencies, graded: lessonGraded(lesson) };
    }
  }
  return null;
}

/**
 * The unit, track and competencies of a published lesson the person can see, from the unit itself; null when no such
 * lesson is published for them. Lesson ids start with their unit's id and a dash (the validator requires it), so only
 * the matching unit file is read.
 *
 * When nothing matches (no listed course has the lesson, or a listed file is gone), the catalogs this instance holds
 * may be from before the course was published or published again: they are forgotten and it looks once more, so a
 * learner's first result for a new course is counted whichever instance receives it.
 */
export async function lessonMeta(lessonId: string, orgId: string | null): Promise<LessonMeta | null> {
  const found = await findLesson(lessonId, orgId);
  if (found || !forgetCatalogs(orgId)) return found;
  return findLesson(lessonId, orgId);
}
