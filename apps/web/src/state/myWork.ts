/**
 * A learner's own projects as their reviewers left them: users/{uid}/submissions (the security rules let the owner read
 * them). One getDocs when Me or a project step opens, never a listener and never polling; signed-in learners only, so
 * guests never load Firebase. Only startup screens import this module (Me, Home, the project step): the SDK is reached
 * through loadFirebase() and a dynamic import, as in state/sync.ts, and a lazy chunk that imported this module would split
 * the startup bundle (CLAUDE.md).
 */
import { useEffect, useState } from "react";
import { loadFirebase } from "../fb";
import type { AiReview, CapCheck } from "../content/capstone";

export type ReviewStatus = "submitted" | "approved" | "revise";
/** One project as the learner sees it: what they sent it for, and where its review stands. */
export interface MySubmission {
  id: string; unitId: string; lessonId: string; stepId: string;
  status: ReviewStatus;
  /** The reviewer's words, as typed (a teacher, an org admin or the Darsi team). */
  feedback: string;
  /** When it was sent (ISO); null while the server hasn't stamped it yet. */
  createdAt: string | null;
  /** A capstone milestone, with the automatic checks and the advisory AI review checkCapstone stored. */
  capstone: boolean; checks?: CapCheck[]; aiReview?: AiReview | null;
}

const STATUSES: ReviewStatus[] = ["submitted", "approved", "revise"];
const iso = (v: unknown): string | null => {
  if (typeof v === "string") return Number.isNaN(Date.parse(v)) ? null : v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString();
  if (v && typeof (v as { seconds?: unknown }).seconds === "number") return new Date((v as { seconds: number }).seconds * 1000).toISOString();
  return null;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A submission document as the learner's screens use it; null for one without a lesson. */
export function toMySubmission(id: string, d: Record<string, unknown>): MySubmission | null {
  const lessonId = str(d.lessonId);
  if (!lessonId) return null;
  const status = STATUSES.includes(d.status as ReviewStatus) ? (d.status as ReviewStatus) : "submitted";
  return {
    id, lessonId, unitId: str(d.unitId), stepId: str(d.stepId), status, feedback: str(d.feedback).trim(), createdAt: iso(d.createdAt),
    capstone: d.capstone === true,
    ...(Array.isArray(d.checks) ? { checks: d.checks as CapCheck[] } : {}),
    ...(d.aiReview && typeof d.aiReview === "object" ? { aiReview: d.aiReview as AiReview } : {}),
  };
}

/** Newest first; one the server hasn't stamped yet was just sent, so it is the newest. */
const sentAt = (s: MySubmission) => s.createdAt ?? "￿";
export const newestFirst = (a: MySubmission, b: MySubmission) => (sentAt(a) < sentAt(b) ? 1 : sentAt(a) > sentAt(b) ? -1 : 0);

/** The latest submission for each project step (lesson and step), newest first. */
export function latestPerStep(list: MySubmission[]): MySubmission[] {
  const seen = new Set<string>();
  return [...list].sort(newestFirst).filter((s) => { const k = `${s.lessonId}/${s.stepId}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The newest submission for one project step, if any. */
export const latestFor = (list: MySubmission[], lessonId: string, stepId: string) =>
  [...list].sort(newestFirst).find((s) => s.lessonId === lessonId && (!s.stepId || s.stepId === stepId));

/** Me reads this many of the newest projects (a capstone milestone carries its check file, so not more). */
export const MY_WORK_MAX = 20;
export interface MyWork { list: MySubmission[] }
export type MyWorkFilter = { lessonId: string } | { unitId: string } | undefined;

const memo = new Map<string, Promise<MyWork>>();
const keyOf = (uid: string, by: MyWorkFilter) => `${uid}|${by && "lessonId" in by ? `l:${by.lessonId}` : by ? `u:${by.unitId}` : ""}`;
/** Read again next time: this phone just sent a project, so what was read before is out of date. */
export const forgetMyWork = () => memo.clear();

/**
 * One read of the learner's own projects: one lesson's or one course's (equality on a single field, so no composite
 * index), or the newest MY_WORK_MAX. `cached`: the copy read earlier in this session will do (Home's capstone check);
 * otherwise read now (Me and the project step show where reviews stand).
 */
export function readMyWork(uid: string, by?: MyWorkFilter, cached = false): Promise<MyWork> {
  const key = keyOf(uid, by);
  const had = memo.get(key);
  if (cached && had) return had;
  const p = (async () => {
    const [{ db }, { collection, getDocs, limit, orderBy, query, where }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
    const col = collection(db, "users", uid, "submissions");
    const q = by && "lessonId" in by ? query(col, where("lessonId", "==", by.lessonId))
      : by ? query(col, where("unitId", "==", by.unitId))
      : query(col, orderBy("createdAt", "desc"), limit(MY_WORK_MAX));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => toMySubmission(d.id, d.data())).filter((s): s is MySubmission => !!s).sort(newestFirst);
    return { list };
  })();
  memo.set(key, p);
  p.catch(() => { if (memo.get(key) === p) memo.delete(key); });
  return p;
}

/**
 * The learner's projects for a screen: read once when it opens (`uid` undefined: nothing, e.g. a guest), again when the
 * connection comes back if that read failed, and again when `again` changes. No listener.
 */
export function useMyWork(uid: string | undefined, by?: MyWorkFilter, opts: { cached?: boolean; again?: number } = {}): { data?: MyWork; error?: Error } {
  const [s, setS] = useState<{ data?: MyWork; error?: Error; key?: string }>({});
  const key = uid ? keyOf(uid, by) : "";
  useEffect(() => {
    if (!uid) { setS({}); return; }
    let live = true, done = false;
    const read = () => readMyWork(uid, by, opts.cached).then((data) => { done = true; if (live) setS({ data, key }); }, (error: Error) => { if (live) setS((x) => ({ ...x, error, key })); });
    void read();
    const retry = () => { if (!done) void read(); };
    window.addEventListener("online", retry);
    return () => { live = false; window.removeEventListener("online", retry); };
    // `by` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.cached, opts.again]);
  return s.key === key ? { data: s.data, error: s.error } : {};
}
