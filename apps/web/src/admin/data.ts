import { call } from "../fb";
import { useCallback, useEffect, useState } from "react";
import { collection, collectionGroup, doc, documentId, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type QueryConstraint } from "firebase/firestore";
import { db, storage } from "../firebase";
import type { Org, Profile, Role } from "../auth/types";

export interface ProgressDoc { lessonId: string; unitId: string; track: string; accuracy: number; xp: number; seconds: number; completedAt: string; competencies?: string[] }
type ByLang<T> = Partial<Record<"en" | "ar", T>>;
/** broadcasts/{id}: written by the sendBroadcast function, readable by platform admins. */
export interface Broadcast { id: string; title?: ByLang<string>; body?: ByLang<string>; link?: string; audience?: { type: "all" | "org" | "role"; orgId?: string; role?: string }; sentBy?: string; sentAt?: { seconds: number } | null; results?: ByLang<string | null> }
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

/** The last 20 announcements, newest first. A log, so it is read once (and again via reload() after a send), not live. */
export function useBroadcasts(enabled: boolean): { data?: Broadcast[]; error?: Error; reload: () => void } {
  const [n, setN] = useState(0);
  const [s, setS] = useState<{ data?: Broadcast[]; error?: Error }>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // The query is built inside the promise, so a setup problem shows as an error instead of breaking the screen.
    Promise.resolve().then(() => getDocs(query(collection(db, "broadcasts"), orderBy("sentAt", "desc"), limit(20))))
      .then((snap) => { if (live) setS({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Broadcast) }); }, (error: Error) => { if (live) setS({ error }); });
    return () => { live = false; };
  }, [enabled, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...s, reload };
}

/** Days since an ISO date string, or Infinity. */
export const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);

/* ---------- Platform analytics (/super/analytics; TECHNICAL.md "Analytics") ---------- */

/** stats/overview as statsJob and refreshStats write it (functions/src/analyticsCore.ts `Overview`). */
export interface OrgStats { name: string; country?: string; members: number; teachers: number; students: number; active7: number; active30: number; lessons: number; xp: number; avgAccuracy: number | null }
export interface Overview {
  at: string;
  users: { total: number; byRole: Record<string, number>; new7: number; new30: number; active7: number; active30: number; withLessons: number };
  lessons: number; xp: number; avgAccuracy: number | null; weeks: Record<string, number>;
  orgs: Record<string, OrgStats>; orgsByStatus: Record<string, number>;
  /** Darsi Super (billingCore.superStats); absent in an overview counted before 2026-11. */
  super?: { individuals: number; byPlan: Record<string, number>; bySource: Record<string, number>; orgs: number; seats: number; seatsUsed: number };
}
/** analytics/{yyyy-mm-dd}: the day's event counts from the collect function (nested maps of numbers). */
export type DayCounts = { day: string } & { [k: string]: unknown };

/** One read, again on reload(): admins' screens stay off live listeners too. */
function useOnce<T>(load: (() => Promise<T>) | null, deps: unknown[]): { data?: T; error?: Error; reload: () => void } {
  const [n, setN] = useState(0);
  const [s, setS] = useState<{ data?: T; error?: Error }>({});
  useEffect(() => {
    if (!load) return;
    let live = true;
    Promise.resolve().then(load).then((data) => { if (live) setS({ data }); }, (error: Error) => { if (live) setS({ error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...s, reload: useCallback(() => setN((x) => x + 1), []) };
}

export const useOverview = () => useOnce(async () => {
  const s = await getDoc(doc(db, "stats", "overview"));
  return s.exists() ? (s.data() as Overview) : null;
}, []);

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** The last `days` days of event counts, oldest first (days without events are missing). */
export const useDays = (days: number) => useOnce(async () => {
  const from = dayKey(new Date(Date.now() - (days - 1) * 864e5));
  const snap = await getDocs(query(collection(db, "analytics"), where(documentId(), ">=", from), orderBy(documentId())));
  return snap.docs.map((d) => ({ ...d.data(), day: d.id }) as DayCounts);
}, [days]);

/** Phones that used Darsi today, in the last 7 days and in the last 30 (guests included), counted on the server. */
export const useActiveDevices = () => useOnce(async () => {
  const since = (n: number) => getCountFromServer(query(collection(db, "analyticsDevices"), where("last", ">=", dayKey(new Date(Date.now() - (n - 1) * 864e5)))))
    .then((r) => r.data().count);
  const [d1, d7, d30] = await Promise.all([since(1), since(7), since(30)]);
  return { d1, d7, d30 };
}, []);

/** Accounts, most recently active first, or by name when searching (prefix, as typed). */
export const usePeople = (search: string, max = 50) => useOnce(async () => {
  const s = search.trim();
  const q = s
    ? query(collection(db, "users"), orderBy("name"), where("name", ">=", s), where("name", "<=", `${s}`), limit(max))
    : query(collection(db, "users"), orderBy("lastActive", "desc"), limit(max));
  return (await getDocs(q)).docs.map((d) => ({ uid: d.id, ...d.data() }) as Profile);
}, [search, max]);

/** A project with the account it belongs to (users/{uid}/submissions). */
export interface AnySubmission extends Submission { uid: string }
/** Every project anyone submitted, for platform admins: newest first, `waiting` only those not reviewed yet. */
export const useAllSubmissions = (waiting: boolean, max: number) => useOnce(async () => {
  const q = query(collectionGroup(db, "submissions"), ...(waiting ? [where("status", "==", "submitted")] : []), orderBy("createdAt", "desc"), limit(max));
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id, uid: d.ref.parent.parent!.id }) as AnySubmission);
}, [waiting, max]);

/** Accounts that finished at least one lesson, most lessons first (platform admins: the certificates page). */
export const useLearners = (max: number) => useOnce(async () =>
  (await getDocs(query(collection(db, "users"), where("summary.lessonsDone", ">", 0), orderBy("summary.lessonsDone", "desc"), limit(max)))).docs
    .map((d) => ({ uid: d.id, ...d.data() }) as Profile), [max]);

/** Some accounts' names, read once (the projects page names whose project each is). */
export const useNames = (uids: string[]) => useOnce(uids.length ? async () => {
  const docs = await Promise.all(uids.map((uid) => getDoc(doc(db, "users", uid))));
  return Object.fromEntries(docs.map((d) => [d.id, (d.get("name") as string | undefined) ?? ""]));
} : null, [uids.join(",")]);

/** When someone finished a course: the time of their last lesson in it (ISO), or null. */
export async function finishedAt(uid: string, unitId: string): Promise<string | null> {
  const rows = await getDocs(query(collection(db, "users", uid, "progress"), where("unitId", "==", unitId)));
  return rows.docs.map((d) => d.get("completedAt") as string | undefined).filter((x): x is string => typeof x === "string").sort().pop() ?? null;
}

/** The Google Analytics stream collect forwards to (config/analytics), set on /super/analytics. */
export interface GaConfig { measurementId: string; apiSecret: string }
export const useGaConfig = () => useOnce(async () => {
  const s = await getDoc(doc(db, "config", "analytics"));
  return (s.exists() ? s.data() : { measurementId: "", apiSecret: "" }) as GaConfig;
}, []);
export const saveGaConfig = (uid: string, c: GaConfig) =>
  setDoc(doc(db, "config", "analytics"), { measurementId: c.measurementId.trim(), apiSecret: c.apiSecret.trim(), updatedAt: serverTimestamp(), updatedBy: uid });

/** The org's invite codes (orgs/{orgId}/private/invites; its admins only). Codes from before 2026-11 sit on the org itself. */
export const useInvites = (orgId?: string | null) => useOnce(orgId ? async () => {
  const [priv, org] = await Promise.all([getDoc(doc(db, "orgs", orgId, "private", "invites")), getDoc(doc(db, "orgs", orgId))]);
  const old = org.get("inviteCodes") as { teacher?: string; student?: string } | undefined;
  return { teacher: (priv.get("teacher") ?? old?.teacher) as string | undefined, student: (priv.get("student") ?? old?.student) as string | undefined };
} : null, [orgId]);

/** Every organization, newest first (platform admins: /super/orgs). One read, again on reload(). */
export const useAllOrgs = () => useOnce(async () => (await getDocs(query(collection(db, "orgs"), orderBy("createdAt", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }) as Org), []);
/**
 * An account by its exact email or username login, resolved by Auth on the server (functions/src/platform.ts
 * findAccount): a profile's own `email` is only what its owner typed, so it is never what admins look people up by
 * (H1 in the security review). `profiles` > 1 means more than one profile claims that email.
 */
export interface FoundAccount { uid: string; email: string; emailVerified: boolean; name: string; username: string | null; role: Role; orgId: string | null; teach: string | null; provider: string }
export const findAccount = (login: string) => call<{ login: string }, { account: FoundAccount | null; profiles: number }>("findAccount")({ login: login.trim().toLowerCase() });
/** An account by its exact email or login (platform admins), as a profile row with `emailVerified`; [] when none, or when several profiles claim it. */
export const findByEmail = async (email: string): Promise<(Profile & { emailVerified?: boolean; claimed?: number })[]> => {
  const { account, profiles } = await findAccount(email);
  if (!account) return [];
  return [{ uid: account.uid, name: account.name, email: account.email, username: account.username, role: account.role, orgId: account.orgId, emailVerified: account.emailVerified, claimed: profiles } as Profile & { emailVerified: boolean; claimed: number }];
};
/** Accounts whose name starts with what was typed (platform admins). */
export const findByName = async (name: string) => (await getDocs(query(collection(db, "users"), orderBy("name"), where("name", ">=", name.trim()), where("name", "<=", `${name.trim()}`), limit(10)))).docs.map((d) => ({ uid: d.id, ...d.data() }) as Profile);

/* ---------- Darsi Super (docs/SUPER.md) ---------- */
export interface PlanDef { id: string; name: { en: string; ar: string }; kind: "individual" | "seat" | "credits"; period: "month" | "year"; prices: { EGP?: number; USD?: number }; credits: number; active: boolean }
/** What a tutor credit costs Darsi at the provider (USD) and the EGP rate (functions/src/billingCore.ts Economics). */
export interface Economics { usdPerCredit: number; egpPerUsd: number }
/** config/plans as a platform admin saved them (the Plans page). */
export const usePlansConfig = () => useOnce(async () => {
  const s = await getDoc(doc(db, "config", "plans"));
  return { plans: (s.get("plans") as PlanDef[] | undefined) ?? [], economics: (s.get("economics") as Economics | undefined) ?? null };
}, []);
/** A person's tutor credits (credits/{uid}). */
export const useCredits = (uid?: string) => useOnce(uid ? async () => (await getDoc(doc(db, "credits", uid))).data() as { plan: number; planUntil: number; packs: number } | undefined : null, [uid]);
/** A person's own subscription (theirs, or any for platform admins). */
export const useSubscription = (uid?: string) => useOnce(uid ? async () => {
  const s = await getDoc(doc(db, "subscriptions", uid));
  return s.exists() ? (s.data() as { plan: string; status: string; currentPeriodEnd: number; source: string }) : null;
} : null, [uid]);

/** A problem report (functions/src/bugs.ts), as /super/bugs reads it. `details` is whatever the phone gathered. */
export interface BugReport {
  id: string; status: "new" | "fixed" | "closed"; text: string; url: string; path: string; createdAt?: { seconds: number } | null;
  user: { uid: string; email: string | null; name: string | null; role: string; orgId: string | null; plan: string | null; provider: string | null } | null;
  shot: { path: string; bytes: number; type: string; w: number | null; h: number | null } | null;
  details: Record<string, unknown>; server?: { ua: string; lang: string }; statusBy?: string; statusAt?: { seconds: number } | null;
}
/** Problem reports, newest first: the new ones, or all of them. Read once when the page opens. */
export const useBugReports = (onlyNew: boolean, max: number) => useOnce(async () => {
  const q = query(collection(db, "bugReports"), ...(onlyNew ? [where("status", "==", "new")] : []), orderBy("createdAt", "desc"), limit(max));
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }) as BugReport);
}, [onlyNew, max]);
export const setBugStatus = (id: string, status: BugReport["status"], uid: string) =>
  updateDoc(doc(db, "bugReports", id), { status, statusBy: uid, statusAt: serverTimestamp() });
/** A report's screenshot, for platform admins only (storage rules); loaded when someone opens it. */
export async function bugShotUrl(path: string): Promise<string> {
  const [{ getDownloadURL, ref }, s] = await Promise.all([import("firebase/storage"), storage()]);
  return getDownloadURL(ref(s, path));
}
