import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import type { Org, Profile } from "../auth/types";

export interface ProgressDoc { lessonId: string; unitId: string; track: string; accuracy: number; xp: number; seconds: number; completedAt: string; competencies?: string[] }
export interface Submission { id: string; lessonId: string; unitId: string; text: string; fileUrl?: string | null; fileName?: string | null; status: "submitted" | "approved" | "revise"; score?: number; feedback?: string; createdAt?: { seconds: number } | null; orgId?: string | null }

function useLive<T>(subscribe: ((set: (v: T) => void, fail: (e: Error) => void) => () => void) | null, deps: unknown[]): { data?: T; error?: Error } {
  const [s, setS] = useState<{ data?: T; error?: Error }>({});
  useEffect(() => {
    if (!subscribe) return;
    setS({});
    return subscribe((data) => setS({ data }), (error) => setS({ error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}
const listOf = <T,>(path: string, ...c: QueryConstraint[]) => (set: (v: T[]) => void, fail: (e: Error) => void) =>
  onSnapshot(query(collection(db, path), ...c), (snap) => set(snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }) as T)), fail);

export const useOrg = (orgId?: string | null) =>
  useLive<Org | null>(orgId ? (set, fail) => onSnapshot(doc(db, "orgs", orgId), (s) => set(s.exists() ? ({ id: s.id, ...s.data() } as Org) : null), fail) : null, [orgId]);
export const useMembers = (orgId?: string | null) => useLive<Profile[]>(orgId ? listOf<Profile>("users", where("orgId", "==", orgId), orderBy("name")) : null, [orgId]);
export const useMyStudents = (orgId?: string | null, teacherUid?: string) =>
  useLive<Profile[]>(orgId && teacherUid ? listOf<Profile>("users", where("orgId", "==", orgId), where("teacherId", "==", teacherUid), orderBy("name")) : null, [orgId, teacherUid]);
export const usePerson = (uid?: string) =>
  useLive<Profile | null>(uid ? (set, fail) => onSnapshot(doc(db, "users", uid), (s) => set(s.exists() ? ({ uid: s.id, ...s.data() } as Profile) : null), fail) : null, [uid]);
export const useProgress = (uid?: string) => useLive<ProgressDoc[]>(uid ? listOf<ProgressDoc>(`users/${uid}/progress`) : null, [uid]);
export const useSubmissions = (uid?: string) => useLive<Submission[]>(uid ? listOf<Submission>(`users/${uid}/submissions`, orderBy("createdAt", "desc")) : null, [uid]);
export const useOrgsByStatus = (status: Org["status"], enabled: boolean) => useLive<Org[]>(enabled ? listOf<Org>("orgs", where("status", "==", status), orderBy("createdAt", "desc")) : null, [status, enabled]);
export const useMyOrgRequests = (uid?: string) => useLive<Org[]>(uid ? listOf<Org>("orgs", where("createdBy", "==", uid)) : null, [uid]);

/** Days since an ISO date string, or Infinity. */
export const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
