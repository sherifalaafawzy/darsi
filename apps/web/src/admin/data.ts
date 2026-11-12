import { call } from "../fb";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { average, collection, collectionGroup, count, doc, documentId, getAggregateFromServer, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, updateDoc, where, type Query, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import { db, storage } from "../firebase";
import type { Org, Profile, Role } from "../auth/types";
import type { EarnedCert, Sent } from "../content/cert";
import type { SiteDoc } from "../content/sites";
import { api, USERNAME_DOMAIN } from "../auth/api";

export interface ProgressDoc { lessonId: string; unitId: string; track: string; accuracy: number; xp: number; seconds: number; completedAt: string; competencies?: string[] }
type ByLang<T> = Partial<Record<"en" | "ar", T>>;
/** broadcasts/{id}: written by the sendBroadcast function, readable by platform admins. */
export interface Broadcast { id: string; title?: ByLang<string>; body?: ByLang<string>; link?: string; audience?: { type: "all" | "org" | "role"; orgId?: string; role?: string }; sentBy?: string; sentAt?: { seconds: number } | null; results?: ByLang<string | null> }
export interface Submission { id: string; lessonId: string; unitId: string; text: string; fileUrl?: string | null; fileName?: string | null; status: "submitted" | "approved" | "revise"; score?: number; feedback?: string; createdAt?: { seconds: number } | null; orgId?: string | null;
  /** The project step it answers, a final project's or capstone milestone's explanation and AI use, and every file (admin/WorkBody.tsx shows them). */
  stepId?: string; final?: boolean; explain?: string; aiUse?: string; files?: { url: string; name: string; type?: string }[] }

/*
 * Staff screens read once when they open, and again through reload() after their own writes or a Refresh button.
 * There are no live listeners (TECHNICAL.md "Constraints"): a listener on an org's members would push every lesson any
 * student finishes to every open admin or teacher screen. The `fresh` reads below never show one person's or one
 * organization's data while another's loads. An organization's whole member list is the exception to "when they
 * open": it is read in pages through a callable and shared between screens (useMembers below).
 */
const listOf = async <T,>(path: string, ...c: QueryConstraint[]) =>
  (await getDocs(query(collection(db, path), ...c))).docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }) as T);
/** By name, with nameless profiles (a sign-up whose profile write lost a race) last instead of left out (orderBy drops them). */
export const byName = (a: { name?: string | null }, b: { name?: string | null }) => Number(!a.name) - Number(!b.name) || (a.name ?? "").localeCompare(b.name ?? "");

export const useOrg = (orgId?: string | null) => useOnce<Org | null>(orgId ? async () => {
  const s = await getDoc(doc(db, "orgs", orgId));
  return s.exists() ? ({ id: s.id, ...s.data() } as Org) : null;
} : null, [orgId], true);

/* ---------- An organization's members (TECHNICAL.md) ---------- */

/** "list": lean rows (enough for the dashboard, seats and course pickers). "report": the same rows with each whole summary. */
export type MembersView = "list" | "report";
/**
 * The member list as every staff screen holds it. `data` is set only once every page has arrived (sorted by name):
 * tiles, counts, reports and exports are worked out from it and never from `partial`, the rows so far, which are only
 * for showing and searching while a long list loads. A reload keeps `data` on the screen (`refreshing`) until the new
 * list is whole, and one that fails keeps it beside the `error`.
 */
export interface MembersQ {
  data?: Profile[]; partial: Profile[]; loaded: number; complete: boolean; loading: boolean; refreshing: boolean; error?: Error;
  /** When `data` was read (ms), 0 before. */
  at: number;
  /** Reads this organization's members again, for every screen showing them. */
  reload: () => void;
  /** The screen's own change, put into the rows without a read: one person's fields (or several people's), or people gone. */
  patch: (uid: string | readonly string[], fields: Partial<Profile>) => void;
  remove: (uid: string | readonly string[]) => void;
}
type MembersSnap = Omit<MembersQ, "reload" | "patch" | "remove">;
/** `buf`: the rows of the read in flight; `run` counts reads, so an older one that answers late changes nothing. */
interface MembersEntry { snap: MembersSnap; subs: Set<() => void>; run: number; buf: Profile[] | null }

/** One listMembers call's worth: 5,000 members are five calls of lean rows, not 5,000 whole profiles. */
export const MEMBERS_PAGE = 1000;
/**
 * A list nobody is looking at is read again when a screen next opens, once it is this old: an installed app can stay
 * open for days, and the dashboard's "active this week" must not be last week's. Never while a screen shows it (that
 * would be polling): Refresh is for that.
 */
export const MEMBERS_MAX_AGE = 10 * 60_000;
const NO_ROWS: Profile[] = [];
const IDLE: MembersSnap = { partial: NO_ROWS, loaded: 0, complete: false, loading: false, refreshing: false, at: 0 };
const WAITING: MembersSnap = { ...IDLE, loading: true };
const VIEWS: readonly MembersView[] = ["list", "report"];
/**
 * What was read, per organization and view, for as long as the page lives: the dashboard, the courses page, the report
 * and the platform's organization page share it, so going from one to the next reads nothing. In memory only. Whoever
 * can reach a screen that asks for an organization's members is allowed them by the server, so the key needs no account.
 */
const MEMBERS = new Map<string, MembersEntry>();
const mkey = (orgId: string, view: MembersView) => `${view}:${orgId}`;
const put = (e: MembersEntry, snap: MembersSnap) => { e.snap = snap; for (const cb of [...e.subs]) cb(); };
const listed = (uid: string | readonly string[]) => new Set(typeof uid === "string" ? [uid] : uid);

/** Reads every page, one after another (the cursor is the last id of a full page; the page after an exactly full last one is empty). */
function readMembers(orgId: string, view: MembersView) {
  const key = mkey(orgId, view);
  if (!MEMBERS.has(key)) MEMBERS.set(key, { snap: WAITING, subs: new Set(), run: 0, buf: null });
  const e = MEMBERS.get(key)!, run = ++e.run;
  e.buf = [];
  put(e, e.snap.data ? { ...e.snap, refreshing: true, error: undefined } : WAITING);
  void (async () => {
    let after: string | null = null;
    do {
      const r: { members: Profile[]; next: string | null } = await api.listMembers({ orgId, view, after, limit: MEMBERS_PAGE });
      if (e.run !== run) return;
      // A row doesn't carry the organization it was asked for: screens that take a Profile expect it.
      e.buf = [...(e.buf ?? []), ...r.members.map((m) => ({ ...m, orgId }))];
      after = r.next;
      if (!e.snap.data && after) put(e, { ...WAITING, partial: e.buf, loaded: e.buf.length });
    } while (after);
    const data = [...(e.buf ?? [])].sort(byName);
    e.buf = null;
    put(e, { data, partial: data, loaded: data.length, complete: true, loading: false, refreshing: false, at: Date.now() });
  })().catch((error: Error) => {
    if (e.run !== run) return;
    e.buf = null;
    put(e, e.snap.data ? { ...e.snap, refreshing: false, error } : { ...IDLE, error });
  });
}

/** Reads an organization's members again, for every screen showing them; a view nobody shows is only forgotten. */
export function reloadMembers(orgId: string) {
  for (const view of VIEWS) {
    const e = MEMBERS.get(mkey(orgId, view));
    if (!e) continue;
    if (e.subs.size) readMembers(orgId, view);
    else { e.run++; MEMBERS.delete(mkey(orgId, view)); }
  }
}
/**
 * Forgets the members read for one organization, or for all, so the next screen reads them again: for a change made
 * elsewhere that the rows can't follow by a patch (accounts made by Add people or an import, a sign-out). A list a
 * screen is showing stays: that screen's Refresh reads it again.
 */
export function forgetMembers(orgId?: string) {
  for (const [key, e] of [...MEMBERS]) {
    if ((orgId && !VIEWS.some((v) => key === mkey(orgId, v))) || e.subs.size) continue;
    e.run++; MEMBERS.delete(key);
  }
}
/** A change the screen itself just made, put into the rows already read (and into a read in flight): no read. */
export function patchMembers(orgId: string, uid: string | readonly string[], fields: Partial<Profile>) {
  const ids = listed(uid);
  const on = (rows: Profile[]) => rows.map((m) => (ids.has(m.uid) ? { ...m, ...fields } : m));
  for (const view of VIEWS) {
    const e = MEMBERS.get(mkey(orgId, view));
    if (!e) continue;
    if (e.buf) e.buf = on(e.buf);
    if (!e.snap.partial.some((m) => ids.has(m.uid))) continue;
    // A new name has a new place in the list.
    const partial = e.snap.data && "name" in fields ? on(e.snap.partial).sort(byName) : on(e.snap.partial);
    put(e, { ...e.snap, partial, ...(e.snap.data ? { data: partial } : {}) });
  }
}
/** People who left the organization (removed, deleted): out of the rows already read, without a read. */
export function dropMembers(orgId: string, uid: string | readonly string[]) {
  const ids = listed(uid);
  for (const view of VIEWS) {
    const e = MEMBERS.get(mkey(orgId, view));
    if (!e) continue;
    if (e.buf) e.buf = e.buf.filter((m) => !ids.has(m.uid));
    if (!e.snap.partial.some((m) => ids.has(m.uid))) continue;
    const partial = e.snap.partial.filter((m) => !ids.has(m.uid));
    put(e, { ...e.snap, partial, loaded: partial.length, ...(e.snap.data ? { data: partial } : {}) });
  }
}

/**
 * An organization's members, through the listMembers callable in pages of MEMBERS_PAGE, read once and shared (MEMBERS
 * above). A "list" screen is also served by a "report" already read or on its way: its rows hold everything a list's do.
 */
export function useMembers(orgId?: string | null, view: MembersView = "list"): MembersQ {
  // Only while this screen has no list of its own to show: a list on screen never turns back into "loading" because
  // a report started to load beside it.
  const report = orgId && view === "list" && !MEMBERS.get(mkey(orgId, "list"))?.snap.data ? MEMBERS.get(mkey(orgId, "report"))?.snap : undefined;
  const as: MembersView = report && (report.data || report.loading) ? "report" : view;
  const subscribe = useCallback((cb: () => void) => {
    if (!orgId) return () => {};
    const had = MEMBERS.get(mkey(orgId, as));
    // Nothing read yet; or nobody was looking and the last read failed (with or without an older list beside it), or
    // the list has grown old.
    if (!had || (had.subs.size === 0 && !had.snap.loading && !had.snap.refreshing && (!had.snap.data || had.snap.error !== undefined || Date.now() - had.snap.at > MEMBERS_MAX_AGE))) readMembers(orgId, as);
    const e = MEMBERS.get(mkey(orgId, as))!;
    e.subs.add(cb);
    return () => { e.subs.delete(cb); };
  }, [orgId, as]);
  const snap = useSyncExternalStore(subscribe, () => (orgId ? MEMBERS.get(mkey(orgId, as))?.snap ?? WAITING : IDLE));
  const reload = useCallback(() => { if (orgId) reloadMembers(orgId); }, [orgId]);
  const patch = useCallback((uid: string | readonly string[], fields: Partial<Profile>) => { if (orgId) patchMembers(orgId, uid, fields); }, [orgId]);
  const remove = useCallback((uid: string | readonly string[]) => { if (orgId) dropMembers(orgId, uid); }, [orgId]);
  return useMemo(() => ({ ...snap, reload, patch, remove }), [snap, reload, patch, remove]);
}

export const useMyStudents = (orgId?: string | null, teacherUid?: string) =>
  useOnce<Profile[]>(orgId && teacherUid ? async () => (await listOf<Profile>("users", where("orgId", "==", orgId), where("teacherId", "==", teacherUid))).sort(byName) : null, [orgId, teacherUid], true);
/** An organization's teachers and admins (who can be a student's teacher): one read, not the whole member list. */
export const useOrgStaff = (orgId?: string | null) =>
  useOnce<Profile[]>(orgId ? async () => (await listOf<Profile>("users", where("orgId", "==", orgId), where("role", "in", ["teacher", "orgAdmin"]))).sort(byName) : null, [orgId], true);
export const usePerson = (uid?: string) => useOnce<Profile | null>(uid ? async () => {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? ({ uid: s.id, ...s.data() } as Profile) : null;
} : null, [uid], true);
export const useProgress = (uid?: string) => useOnce<ProgressDoc[]>(uid ? () => listOf<ProgressDoc>(`users/${uid}/progress`) : null, [uid], true);
export const useSubmissions = (uid?: string) => useOnce<Submission[]>(uid ? () => listOf<Submission>(`users/${uid}/submissions`, orderBy("createdAt", "desc")) : null, [uid], true);
/** users/{uid}/certs/{unitId}: a certificate as first earned (state/sync.ts), kept after its course is unpublished. */
export interface CertDoc extends EarnedCert { id: string }
export const useCerts = (uid?: string) => useOnce<CertDoc[]>(uid ? () => listOf<CertDoc>(`users/${uid}/certs`) : null, [uid], true);
export const useOrgsByStatus = (status: Org["status"], enabled: boolean) =>
  useOnce<Org[]>(enabled ? () => listOf<Org>("orgs", where("status", "==", status), orderBy("createdAt", "desc")) : null, [status, enabled], true);
export const useMyOrgRequests = (uid?: string) => useOnce<Org[]>(uid ? () => listOf<Org>("orgs", where("createdBy", "==", uid)) : null, [uid], true);

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

/**
 * The accounts an admin made in their organization since `since` (ms, this phone's clock), read once: after an import
 * call whose answer was lost, the rows it may have made (admin/AddPeople.tsx). Two equality filters, no extra index.
 */
export async function madeSince(orgId: string, by: string, since: number): Promise<Profile[]> {
  const made = await listOf<Profile>("users", where("orgId", "==", orgId), where("createdBy", "==", by));
  return made.filter((p) => (p.createdAt?.seconds ?? 0) * 1000 >= since);
}

/** Days since an ISO date string, or Infinity. */
export const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
/** A class as it is saved: spaces trimmed and runs of spaces made one, at most 60 characters (the rules' limit), or null. */
export const cleanGroup = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60) || null;

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

/**
 * One read, again on reload(): admins' screens stay off live listeners too. With `fresh`, data read for other deps
 * (the previous person or organization) is never returned, and a failed reload keeps what was already shown.
 * `loading`: the first read for these deps hasn't answered yet, so a screen shows that, not "nobody" or "0" (an empty
 * list that was only still loading led an admin towards importing the same people twice). A reload keeps what is shown.
 */
function useOnce<T>(load: (() => Promise<T>) | null, deps: unknown[], fresh = false): { data?: T; error?: Error; loading: boolean; reload: () => void } {
  const [n, setN] = useState(0);
  const key = JSON.stringify(deps);
  const [s, setS] = useState<{ data?: T; error?: Error; key?: string }>({});
  useEffect(() => {
    if (!load) return;
    let live = true;
    Promise.resolve().then(load).then((data) => { if (live) setS({ data, key }); },
      (error: Error) => { if (live) setS((p) => (fresh && p.key === key ? { data: p.data, error, key } : { error, key })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  const loading = load !== null && s.key !== key;
  return fresh && s.key !== key ? { loading, reload } : { data: s.data, error: s.error, loading, reload };
}

/** A page of a list: its rows and the document the next page starts after (null: this list has no cursor). */
type Page<T> = { rows: T[]; last: QueryDocumentSnapshot | null };
const pageOf = async <T,>(q: Query, row: (d: QueryDocumentSnapshot) => T): Promise<Page<T>> => {
  const { docs } = await getDocs(q);
  return { rows: docs.map(row), last: docs[docs.length - 1] ?? null };
};
/** The constraints that end a paged query: after the last row shown (when there is one), `n` more. */
const next = (after: QueryDocumentSnapshot | null, n: number): QueryConstraint[] => [...(after ? [startAfter(after)] : []), limit(n)];
/**
 * A list its screen shows `max` rows of, where "Show more" raises `max`: the first read asks for `max`, and each raise
 * reads only the rows after the last one shown and appends them (the screens used to ask for the whole longer list
 * again: 300 rows shown and "Show more" read 350, of which 300 were already on the screen). A raise after a page that
 * came back short reads nothing: the list has ended. reload() reads what is shown again from the top, in one query.
 * Like useOnce without `fresh`: other deps keep the older rows on screen until theirs arrive (`loading` says so).
 */
function usePaged<T>(read: ((after: QueryDocumentSnapshot | null, n: number) => Promise<Page<T>>) | null, deps: unknown[], max: number): { data?: T[]; error?: Error; loading: boolean; reload: () => void } {
  const [n, setN] = useState(0);
  const key = JSON.stringify(deps);
  const [s, setS] = useState<{ data?: T[]; error?: Error; key?: string }>({});
  // What the last read left: for which list (deps and reload count), its rows, where it ended and how many were asked for.
  const at = useRef<(Page<T> & { id: string; max: number }) | null>(null);
  useEffect(() => {
    if (!read) return;
    const id = `${key}#${n}`, had = at.current?.id === id ? at.current : null;
    if (had && max > had.max && had.rows.length < had.max) return; // already at its end
    const more = had && had.last && max > had.max ? had : null;
    let live = true;
    Promise.resolve().then(() => read(more ? more.last : null, more ? max - more.rows.length : max)).then((p) => {
      if (!live) return;
      const rows = more ? [...more.rows, ...p.rows] : p.rows;
      at.current = { id, rows, last: p.last ?? more?.last ?? null, max };
      setS({ data: rows, key });
    }, (error: Error) => { if (live) setS((p) => (p.key === key ? { ...p, error } : { error, key })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, max, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data: s.data, error: s.error, loading: read !== null && s.key !== key, reload };
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

/** What a username login looks like (auth/api.ts loginToEmail): a search for one also asks Auth (findAccount). */
const LOGIN = /^[a-z0-9._-]{3,}$/i;
const namesFrom = async (s: string, max: number) => (await getDocs(query(collection(db, "users"), orderBy("name"), where("name", ">=", s), where("name", "<=", `${s}`), limit(max))))
  .docs.map((d) => ({ uid: d.id, ...d.data() }) as Profile);
/**
 * Accounts, most recently active first; or, searching, the account with that exact email or username (resolved by Auth,
 * as the org page's "Add a person" does) and accounts whose name starts with the text, as typed or with a capital first
 * letter (Firestore compares names as written).
 */
export const usePeople = (search: string, max = 50) => usePaged<Profile>(async (after, n) => {
  const s = search.trim();
  // Everyone, a page at a time ("Show more" reads the next 50 only). A search is one answer, with no cursor.
  if (!s) return pageOf(query(collection(db, "users"), orderBy("lastActive", "desc"), ...next(after, n)), (d) => ({ uid: d.id, ...d.data() }) as Profile);
  const email = s.includes("@");
  const [account, ...named] = await Promise.all([
    email || LOGIN.test(s) ? findByEmail(email ? s : `${s}@${USERNAME_DOMAIN}`) : Promise.resolve([]),
    ...(email ? [] : [...new Set([s, s.charAt(0).toLocaleUpperCase() + s.slice(1)])].map((x) => namesFrom(x, max))),
  ]);
  // The account's own profile, for the table's lessons and activity (Auth's answer has only its name and role).
  const full = await Promise.all(account.map(async (a) => { const d = await getDoc(doc(db, "users", a.uid)); return d.exists() ? ({ uid: d.id, ...d.data() } as Profile) : a; }));
  const seen = new Set<string>();
  return { rows: [...full, ...named.flat()].filter((p) => !seen.has(p.uid) && !!seen.add(p.uid)).slice(0, max), last: null };
}, [search], max);

/** A project with the account it belongs to (users/{uid}/submissions). */
export interface AnySubmission extends Submission { uid: string }
/** Every project anyone submitted, for platform admins: newest first, `waiting` only those not reviewed yet. */
export const useAllSubmissions = (waiting: boolean, max: number) => usePaged<AnySubmission>((after, n) =>
  pageOf(query(collectionGroup(db, "submissions"), ...(waiting ? [where("status", "==", "submitted")] : []), orderBy("createdAt", "desc"), ...next(after, n)),
    (d) => ({ ...d.data(), id: d.id, uid: d.ref.parent.parent!.id }) as AnySubmission), [waiting], max);

/** Accounts that finished at least one lesson, most lessons first (platform admins: the certificates page). */
export const useLearners = (max: number) => usePaged<Profile>((after, n) =>
  pageOf(query(collection(db, "users"), where("summary.lessonsDone", ">", 0), orderBy("summary.lessonsDone", "desc"), ...next(after, n)), (d) => ({ uid: d.id, ...d.data() }) as Profile), [], max);

/** Names already read, for as long as the page lives: "Show more" and a review's re-read ask only for the new people's. */
const NAMES = new Map<string, string>();
/**
 * Some accounts' names (the projects page names whose project each is; the ledger, who paid). Each name is read once
 * per page load: `data` holds the names known so far, and grows as the missing ones arrive. reload() reads these again.
 */
export function useNames(uids: string[]): { data?: Record<string, string>; error?: Error; loading: boolean; reload: () => void } {
  const key = uids.join(",");
  const [n, setN] = useState(0);
  const [s, setS] = useState<{ tick: number; key?: string; error?: Error }>({ tick: 0 });
  const asked = useRef(uids);
  asked.current = uids;
  useEffect(() => {
    const missing = asked.current.filter((uid) => !NAMES.has(uid));
    if (!missing.length) return;
    let live = true;
    Promise.resolve().then(() => Promise.all(missing.map((uid) => getDoc(doc(db, "users", uid))))).then((docs) => {
      docs.forEach((d, i) => NAMES.set(missing[i], (d.get("name") as string | undefined) ?? ""));
      if (live) setS((p) => ({ tick: p.tick + 1 }));
    }, (error: Error) => { if (live) setS((p) => ({ tick: p.tick + 1, key, error })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const reload = useCallback(() => { for (const uid of asked.current) NAMES.delete(uid); setN((x) => x + 1); }, []);
  const data = useMemo(() => {
    const known = uids.filter((uid) => NAMES.has(uid));
    return known.length ? Object.fromEntries(known.map((uid) => [uid, NAMES.get(uid)!])) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.tick, n]);
  const error = s.key === key ? s.error : undefined;
  return { data, error, loading: !error && uids.some((uid) => !NAMES.has(uid)), reload };
}

/** When someone finished a course: the time of their last lesson in it (ISO), or null. */
export async function finishedAt(uid: string, unitId: string): Promise<string | null> {
  const rows = await getDocs(query(collection(db, "users", uid, "progress"), where("unitId", "==", unitId)));
  return rows.docs.map((d) => d.get("completedAt") as string | undefined).filter((x): x is string => typeof x === "string").sort().pop() ?? null;
}

/** The projects someone sent for one course, as content/cert.ts reads them (platform admins: a capstone's milestones). */
export async function sentFor(uid: string, unitId: string): Promise<Sent[]> {
  const rows = await getDocs(query(collection(db, "users", uid, "submissions"), where("unitId", "==", unitId)));
  return rows.docs.map((d) => {
    const at = d.get("createdAt") as { seconds?: number } | null | undefined;
    return { unitId, lessonId: String(d.get("lessonId") ?? ""), stepId: (d.get("stepId") as string | undefined) || undefined, createdAt: typeof at?.seconds === "number" ? new Date(at.seconds * 1000).toISOString() : null };
  });
}

/** The Google Analytics stream collect forwards to (config/analytics), set on /super/analytics. */
export interface GaConfig { measurementId: string; apiSecret: string }
export const useGaConfig = () => useOnce(async () => {
  const s = await getDoc(doc(db, "config", "analytics"));
  return (s.exists() ? s.data() : { measurementId: "", apiSecret: "" }) as GaConfig;
}, []);
/**
 * Saved by the setGaConfig callable, which checks the two values, records who changed them and writes the audit entry
 * (the browser used to write config/analytics itself). `_uid` is kept for the screens that still pass it: the server
 * takes the caller from the request.
 */
export const saveGaConfig = (_uid: string, c: GaConfig) => api.setGaConfig({ measurementId: c.measurementId.trim(), apiSecret: c.apiSecret.trim() });

/** The org's invite codes (orgs/{orgId}/private/invites; its admins only). Codes from before 2026-11 sit on the org itself. */
export const useInvites = (orgId?: string | null) => useOnce(orgId ? async () => {
  const [priv, org] = await Promise.all([getDoc(doc(db, "orgs", orgId, "private", "invites")), getDoc(doc(db, "orgs", orgId))]);
  const old = org.get("inviteCodes") as { teacher?: string; student?: string } | undefined;
  return { teacher: (priv.get("teacher") ?? old?.teacher) as string | undefined, student: (priv.get("student") ?? old?.student) as string | undefined };
} : null, [orgId]);
/**
 * Who suspended an organization and why (orgs/{orgId}/private/suspension, platform admins only; updateOrg writes it).
 * Organizations suspended before 2026-11-12 kept it on the org document (`suspended.reason`), which the screen still reads.
 */
export const useOrgSuspension = (orgId?: string | null) => useOnce(orgId ? async () => {
  const s = await getDoc(doc(db, "orgs", orgId, "private", "suspension"));
  return { reason: s.get("reason") as string | undefined };
} : null, [orgId]);

/**
 * What an organization's requester told platform admins privately (orgs/{orgId}/private/request: its admins and platform
 * admins only). Requests from before 2026-11 kept it on the org document, until scripts/migrate-org-requests.mjs.
 */
export const useOrgRequest = (orgId?: string | null) => useOnce(orgId ? async () => {
  const s = await getDoc(doc(db, "orgs", orgId, "private", "request"));
  // Whether the requester's email was confirmed when they asked (requestOrg records it since 2026-11; older requests
  // don't say, and the screen then says nothing either).
  const verified = s.get("emailVerified") as unknown;
  return { contact: s.get("contact") as string | undefined, reason: s.get("reason") as string | undefined, emailVerified: typeof verified === "boolean" ? verified : undefined };
} : null, [orgId]);

/**
 * Whether organization `orgId` manages this account, as the server decides (functions/src/orgMembersCore.ts isManaged,
 * roles.ts managedAccount): the profile's `managedBy` when it has one, else a username login. Who made the profile
 * (`createdBy`) says nothing: an admin can add someone with their own email, and that account is theirs. A listMembers
 * row carries no `managedBy`, only the server's answer for the organization listed (`managed`).
 */
export function managedByOrg(p: { managedBy?: string | null; managed?: boolean; email?: string | null }, orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  if (typeof p.managedBy === "string" && p.managedBy) return p.managedBy === orgId;
  if (typeof p.managed === "boolean") return p.managed;
  return !!p.email?.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);
}

/** Every organization, newest first (platform admins: /super/orgs). One read, again on reload(). */
/** Organizations' web addresses (sites/{host}): one organization's, or every one (platform admins only). */
export const useSites = (orgId?: string | null, enabled = true) => useOnce<SiteDoc[]>(enabled ? () => (orgId ? listOf<SiteDoc>("sites", where("orgId", "==", orgId)) : listOf<SiteDoc>("sites")) : null, [orgId ?? "", enabled]);
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
/** Find accounts by exact email or username login (through Auth, findAccount), else by the start of their name (platform admins). */
export async function findPeople(q: string): Promise<(Profile & { emailVerified?: boolean; claimed?: number })[]> {
  const s = q.trim();
  if (!s) return [];
  if (s.includes("@")) return findByEmail(s);
  const byLogin = LOGIN.test(s) ? await findByEmail(`${s}@${USERNAME_DOMAIN}`) : [];
  return byLogin.length ? byLogin : findByName(s);
}

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
export const useBugReports = (onlyNew: boolean, max: number) => usePaged<BugReport>((after, n) =>
  pageOf(query(collection(db, "bugReports"), ...(onlyNew ? [where("status", "==", "new")] : []), orderBy("createdAt", "desc"), ...next(after, n)), (d) => ({ ...d.data(), id: d.id }) as BugReport), [onlyNew], max);
export const setBugStatus = (id: string, status: BugReport["status"], uid: string) =>
  updateDoc(doc(db, "bugReports", id), { status, statusBy: uid, statusAt: serverTimestamp() });
/** "Share feedback" as stored by sendFeedback (functions/src/feedback.ts); platform admins only (rules). */
export interface FeedbackDoc {
  id: string; status: "new" | "read" | "archived"; rating: number; text: string; topic: string | null; path: string;
  unitId: string | null; source: "button" | "course"; lang: string | null; createdAt?: { seconds: number } | null;
  user: { uid: string; email: string | null; name: string | null; role: string; orgId: string | null } | null;
}
/** Feedback, newest first: the new ones, or all of it. Read once when the page opens, a page at a time. */
export const useFeedback = (onlyNew: boolean, max: number) => usePaged<FeedbackDoc>((after, n) =>
  pageOf(query(collection(db, "feedback"), ...(onlyNew ? [where("status", "==", "new")] : []), orderBy("createdAt", "desc"), ...next(after, n)), (d) => ({ ...d.data(), id: d.id }) as FeedbackDoc), [onlyNew], max);
export const setFeedbackStatus = (id: string, status: FeedbackDoc["status"], uid: string) =>
  updateDoc(doc(db, "feedback", id), { status, statusBy: uid, statusAt: serverTimestamp() });
/**
 * The figures above the list: how many, and the average, in all and in the last 30 days, and how many gave each number
 * of stars. Aggregation queries (counted on the server: no documents are downloaded), read once when the page opens.
 */
export const useFeedbackSummary = (since: number) => useOnce(async () => {
  const all = collection(db, "feedback");
  const recent = query(all, where("createdAt", ">=", new Date(since)));
  const [a, r, ...stars] = await Promise.all([
    getAggregateFromServer(all, { n: count(), avg: average("rating") }),
    getAggregateFromServer(recent, { n: count(), avg: average("rating") }),
    ...[1, 2, 3, 4, 5].map((s) => getCountFromServer(query(all, where("rating", "==", s)))),
  ]);
  return {
    all: { n: a.data().n, avg: a.data().avg ?? null },
    recent: { n: r.data().n, avg: r.data().avg ?? null },
    stars: stars.map((s) => s.data().count),
  };
}, [since]);
/** A report's screenshot, for platform admins only (storage rules); loaded when someone opens it. */
export async function bugShotUrl(path: string): Promise<string> {
  const [{ getDownloadURL, ref }, s] = await Promise.all([import("firebase/storage"), storage()]);
  return getDownloadURL(ref(s, path));
}
