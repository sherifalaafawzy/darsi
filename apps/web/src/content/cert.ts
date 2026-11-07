/**
 * Certificates: when one is earned, what it records, and its code. Pure, and shared with the platform's certificate page
 * (admin/AllWork.tsx, a lazy chunk), so nothing here may import the Firebase SDK.
 */
import type { CatalogEntry, LocalText, ProjectStep, Track, Unit } from "./types";

/** Crockford's base 32: no I, L, O or U, so a code read aloud or copied by hand can't be mistaken. */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A 53-bit hash of a string (cyrb53): spreads well, and is the same on every device. Not a secret. */
function hash53(s: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A certificate's code: the course, then 8 characters (40 bits) from the course, the moment it was earned and the
 * account (`uid`; none for a guest), as `DRS-AI-4-1-7KQ2-M9XD`. Nothing a learner can change (their name, a replay)
 * moves it, and without the account's id it can't be worked out from what a certificate shows. The code a certificate
 * got when it was earned is kept with it (EarnedCert.code); this gives it, and the code of one recorded without.
 */
export function certCode(unitId: string, at: string, uid?: string): string {
  const t = Date.parse(at);
  let n = hash53(`${unitId}|${Number.isFinite(t) ? t : at}|${uid ?? ""}`);
  let mark = "";
  for (let i = 0; i < 8; i++) { mark += B32[n % 32]; n = Math.floor(n / 32); }
  return `DRS-${unitId.toUpperCase()}-${mark.slice(0, 4)}-${mark.slice(4)}`;
}

/**
 * The code certificates showed before 2026-11: the course, the length of the learner's name and when they finished it.
 * Only to keep the codes already shown (state/store.tsx withCodes); new certificates use certCode.
 */
export const legacyCertCode = (unitId: string, name: string, finished: string) =>
  `DRS-${unitId.toUpperCase()}-${(name || "T").length.toString(36).toUpperCase()}${new Date(finished).getTime().toString(36).slice(-4).toUpperCase()}`;

/** The code to show for a recorded certificate: the one it got when it was earned, else certCode. */
export const codeOf = (unitId: string, c: Pick<EarnedCert, "at" | "code">, uid?: string) => c.code ?? certCode(unitId, c.at, uid);

/**
 * A certificate as recorded the first time it was earned (AppState.certs): the course's title and track, when it was
 * earned, and its code (set then: state/store.tsx earnCert). Me lists these, so replaying a lesson or renaming never
 * moves the date or the code, and a course republished with another lesson, or unpublished, keeps the certificates
 * already earned. Records from before codes were kept have none (codeOf).
 */
export interface EarnedCert { title: LocalText; track: Track; at: string; code?: string }

/** Lesson results as certificates read them (AppState.progress). */
type Results = Record<string, { completedAt: string; unitId?: string }>;
/** A project the learner sent (state/myWork.ts MySubmission): which milestone, and when. */
export interface Sent { unitId?: string; lessonId: string; stepId?: string; createdAt?: string | null }

/**
 * Courses whose lessons may all be finished, from the catalog's lesson counts and the results' unitId alone, so finding
 * them downloads nothing. A result saved before results carried a unitId counts toward each course its lesson id starts
 * with; earnedCert() then checks against the course itself.
 */
export function certCandidates(units: CatalogEntry[], progress: Results): CatalogEntry[] {
  const by = new Map<string, number>();
  const legacy: string[] = [];
  for (const [id, r] of Object.entries(progress)) {
    if (r.unitId) by.set(r.unitId, (by.get(r.unitId) ?? 0) + 1);
    else legacy.push(id);
  }
  return units.filter((u) => u.available && u.lessons > 0
    && (by.get(u.id) ?? 0) + legacy.filter((id) => id.startsWith(`${u.id}-`)).length >= u.lessons);
}

/** A capstone's milestones: its project steps that take evidence (a repository, the check file, links). */
export const capstoneMilestones = (unit: Unit): { lessonId: string; stepId: string }[] =>
  unit.lessons.flatMap((l) => l.steps
    .filter((s): s is ProjectStep => s.type === "project" && !!(s as ProjectStep).evidence?.length)
    .map((s) => ({ lessonId: l.id, stepId: s.id })));

/**
 * How many of a capstone's milestones have been sent, whatever the review said since ("I'll do it in class and submit
 * later" sends nothing), and when the last of them was first sent (null if unknown or not all sent).
 */
export function milestonesSent(unit: Unit, sent: Sent[]): { sent: number; of: number; at: string | null } {
  const first = new Map<string, string | null>();
  for (const s of sent) {
    if (s.unitId && s.unitId !== unit.id) continue;
    const k = `${s.lessonId}/${s.stepId ?? ""}`;
    const at = s.createdAt ?? null, had = first.get(k);
    if (!first.has(k) || (at && (!had || at < had))) first.set(k, at ?? had ?? null);
  }
  const all = capstoneMilestones(unit);
  const hit = all.filter((m) => first.has(`${m.lessonId}/${m.stepId}`));
  const times = hit.map((m) => first.get(`${m.lessonId}/${m.stepId}`) ?? "");
  return { sent: hit.length, of: all.length, at: hit.length === all.length && hit.length > 0 && times.every(Boolean) ? times.sort().pop()! : null };
}

/**
 * The certificate for a course, if it is earned now: every current lesson finished, and for a capstone every milestone
 * sent as well (`sent`: the learner's own submissions; undefined for guests, who can't send, so they never earn one).
 * Its date is when the last lesson was finished, or for a capstone when its last milestone was sent, if that was later.
 */
export function earnedCert(unit: Unit, progress: Results, sent?: Sent[]): EarnedCert | null {
  if (!unit.lessons.length || !unit.lessons.every((l) => progress[l.id])) return null;
  let at = unit.lessons.map((l) => progress[l.id].completedAt).sort().pop()!;
  // A capstone with no milestones (one written in the editor without evidence steps) has nothing to send.
  if (unit.kind === "capstone" && capstoneMilestones(unit).length) {
    if (!sent) return null;
    const m = milestonesSent(unit, sent);
    if (m.sent < m.of) return null;
    if (m.at && m.at > at) at = m.at;
  }
  return { title: unit.title, track: unit.track, at };
}
