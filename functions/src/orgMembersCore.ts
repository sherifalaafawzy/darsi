/**
 * The pure parts of the member callables (orgMembers.ts), tested in test/orgMembers.test.ts: which accounts an
 * organization manages, what a request's arguments must look like, what a class or teacher edit changes for one
 * person, and the lean row a member list holds.
 */

import { REMOVED_MAX, withRemoved, type Removed } from "./membersCore.js";

/**
 * The removed list (orgs/{orgId}/private/removed.uids) with several more removals, kept to REMOVED_MAX like the single
 * path (index.ts removeMember, membersCore.withRemoved): the oldest are forgotten beyond it, so a school that removes
 * people in bulk year after year never grows the document towards Firestore's 1 MB.
 */
export function withRemovedAll(uids: Removed | undefined, gone: Removed, max = REMOVED_MAX): Removed {
  let out: Removed = { ...(uids ?? {}) };
  for (const [uid, entry] of Object.entries(gone)) out = withRemoved(out, uid, entry, max);
  return out;
}

/** People per bulkMembers or updateMembers call. */
export const MAX_UIDS = 200;
/** Members per listMembers page: the default, and the most one call returns. */
export const PAGE = 1000, MAX_PAGE = 2000;

export type BulkAction = "remove" | "suspend" | "restore" | "resetPassword" | "setRole";
export const BULK_ACTIONS: readonly BulkAction[] = ["remove", "suspend", "restore", "resetPassword", "setRole"];
/** Roles an organization's admin gives (never learner or platform admin). */
export type MemberRole = "student" | "teacher" | "orgAdmin";
export const MEMBER_ROLES: readonly MemberRole[] = ["student", "teacher", "orgAdmin"];

/**
 * A document id as Firestore takes it in a path: some text, at most 128 characters, no "/" (it would name another
 * document), and none of the ids Firestore itself refuses (".", "..", "__name__"), which would fail a whole call
 * instead of being nobody's.
 */
export const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/") && v === v.trim() && v !== "." && v !== ".." && !/^__.*__$/.test(v);

/**
 * An account the organization manages (it made the login, so it may lock it or reset its password; the person can't
 * leave by themself): the profile says so (`managedBy`), or, for profiles from before that field, its email is a
 * username login. A profile someone made by signing up can never hold that domain (firestore.rules, users create).
 */
export function isManaged(p: { managedBy?: unknown; email?: unknown } | undefined, orgId: string | null | undefined, domain: string): boolean {
  if (!p || !orgId) return false;
  if (typeof p.managedBy === "string" && p.managedBy) return p.managedBy === orgId;
  return typeof p.email === "string" && p.email.toLowerCase().endsWith(`@${domain}`);
}

/**
 * Whether `uid` is the organization's only admin who can sign in: true when no other admin is left, or every other
 * one is suspended. `admins`: the organization's admins now.
 */
export const onlyWorkingAdmin = (uid: string, admins: readonly { id: string; suspended?: unknown }[]) => !admins.some((a) => a.id !== uid && !a.suspended);

/** The people a call names: 1 to 200 ids, each once, in the order sent. */
export function uidList(raw: unknown): { uids: string[] } | { reason: "bad-uids" | "too-many" } {
  if (!Array.isArray(raw) || !raw.length) return { reason: "bad-uids" };
  if (raw.length > MAX_UIDS) return { reason: "too-many" };
  if (!raw.every(isId)) return { reason: "bad-uids" };
  return { uids: [...new Set(raw as string[])] };
}

export const bulkAction = (v: unknown): BulkAction | null => (BULK_ACTIONS.includes(v as BulkAction) ? (v as BulkAction) : null);
export const memberRole = (v: unknown): MemberRole | null => (MEMBER_ROLES.includes(v as MemberRole) ? (v as MemberRole) : null);

/** What a bulk action answers when the caller is among the people chosen. */
export const SELF_REASON: Record<BulkAction, string> = { remove: "self-remove", suspend: "self-suspend", restore: "self-suspend", resetPassword: "self-password", setRole: "self-role" };

/** How many members a page holds: the default for nothing (or nonsense), never more than MAX_PAGE. */
export function pageLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PAGE, n) : PAGE;
}

export interface MemberPatch { group?: string | null; teacherId?: string | null; name?: string }
export type PatchProblem = "bad-patch" | "bad-group" | "bad-teacher" | "bad-name" | "name-one";
/** A class as it is saved (the app's cleanGroup): runs of spaces made one, trimmed; "" is no class. */
const cleanGroup = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * An edit to members, checked: a class (text of at most 60 characters, or null for none), a teacher (an id, or null
 * for none) and a name (1 to 120 characters, for exactly one person: nobody renames a whole class at once). Anything
 * else in the patch is refused, so no caller believes a field it sent was saved.
 */
export function memberPatch(raw: unknown, count: number): { patch: MemberPatch } | { reason: PatchProblem } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "bad-patch" };
  const r = raw as Record<string, unknown>, patch: MemberPatch = {};
  for (const k of Object.keys(r)) if (r[k] !== undefined && k !== "group" && k !== "teacherId" && k !== "name") return { reason: "bad-patch" };
  if (r.group !== undefined) {
    if (r.group !== null && typeof r.group !== "string") return { reason: "bad-group" };
    const g = r.group === null ? "" : cleanGroup(r.group);
    if (g.length > 60) return { reason: "bad-group" };
    patch.group = g || null;
  }
  if (r.teacherId !== undefined) {
    if (r.teacherId !== null && r.teacherId !== "" && !isId(r.teacherId)) return { reason: "bad-teacher" };
    patch.teacherId = (r.teacherId as string | null) || null;
  }
  if (r.name !== undefined) {
    const n = typeof r.name === "string" ? r.name.trim() : "";
    if (!n || n.length > 120) return { reason: "bad-name" };
    if (count !== 1) return { reason: "name-one" };
    patch.name = n;
  }
  return Object.keys(patch).length ? { patch } : { reason: "bad-patch" };
}

/**
 * What a patch means for one member. `applies`: some part of it is for this person (a teacher is given to students
 * only: a teacher or an admin has none). `write`: the fields that would really change, so a class set again writes
 * nothing.
 */
export function patchFor(patch: MemberPatch, m: { role?: unknown; group?: unknown; teacherId?: unknown; name?: unknown }): { applies: boolean; write: Record<string, string | null> } {
  const write: Record<string, string | null> = {};
  let applies = false;
  if (patch.group !== undefined) { applies = true; if ((m.group ?? null) !== patch.group) write.group = patch.group; }
  if (patch.teacherId !== undefined && m.role === "student") { applies = true; if ((m.teacherId ?? null) !== patch.teacherId) write.teacherId = patch.teacherId; }
  if (patch.name !== undefined) { applies = true; if (m.name !== patch.name) write.name = patch.name; }
  return { applies, write };
}

/* ---------- The member list ---------- */

export type ListView = "list" | "report";
export const listView = (v: unknown): ListView | null => (v === undefined || v === null || v === "list" ? "list" : v === "report" ? "report" : null);

/** Everything a row needs except the summary: the only profile fields a member list reads. Never notify, levels, tracks or devices. */
const ROW_FIELDS = ["name", "email", "username", "role", "group", "teacherId", "projectsWaiting", "superSeat", "active", "mustChangePassword", "managedBy", "suspended", "lastActive", "createdAt"];
/** The fields listMembers asks Firestore for: a list takes six small parts of the summary, a report all of it. */
export const selectFor = (view: ListView): string[] => [...ROW_FIELDS, ...(view === "report" ? ["summary"] : ["summary.lessonsDone", "summary.graded", "summary.xp", "summary.avgAccuracy", "summary.lastActive", "summary.competencies"])];

export interface LeanSummary { lessonsDone: number; graded?: number; xp: number; avgAccuracy: number; lastActive: string | null; competencies: Record<string, 1> }
export interface MemberRow {
  uid: string; name: string; email: string; username: string | null; role: string; group: string | null; teacherId: string | null;
  projectsWaiting: number; superSeat: boolean; active: boolean; mustChangePassword: boolean; managed: boolean; suspended: boolean;
  /** The last sign-in, as the app wrote it (an ISO date). */
  lastActive: string | number | null;
  /** Milliseconds, never a Firestore Timestamp. */
  createdAt: number | null;
  summary?: LeanSummary | Record<string, unknown>;
}

const isStamp = (v: unknown): v is { toMillis(): number } => !!v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** A stored time as milliseconds: a Timestamp, a number already in ms, or null. */
const ms = (v: unknown): number | null => (isStamp(v) ? v.toMillis() : typeof v === "number" && Number.isFinite(v) ? v : null);
/** Any stored value as JSON: Timestamps become milliseconds, wherever they sit. */
function plain(v: unknown): unknown {
  if (isStamp(v)) return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}

/**
 * A list's part of a summary: the four figures and the last lesson's date, and which competencies have any graded
 * lesson (as {code: 1}; the counts, their accuracies, the courses, tracks and weeks stay for the report). `graded` is
 * left out when the summary has none (one from before 2026-11-06), so screens fall back to lessonsDone as they do today.
 */
export function leanSummary(s: unknown): LeanSummary | undefined {
  if (!s || typeof s !== "object") return undefined;
  const d = s as Record<string, unknown>;
  const competencies: Record<string, 1> = {};
  if (d.competencies && typeof d.competencies === "object") for (const [code, n] of Object.entries(d.competencies as Record<string, unknown>)) if (typeof n === "number" && n > 0) competencies[code] = 1;
  return {
    lessonsDone: num(d.lessonsDone), ...(typeof d.graded === "number" ? { graded: d.graded } : {}), xp: num(d.xp), avgAccuracy: num(d.avgAccuracy),
    lastActive: text(d.lastActive) || null, competencies,
  };
}

/** One member as a list holds them: named fields only, so nothing else on a profile ever reaches an admin's screen by accident. */
export function memberRow(uid: string, d: Record<string, unknown> | undefined, orgId: string, view: ListView, domain: string): MemberRow {
  const p = d ?? {};
  const summary = view === "report" ? (p.summary && typeof p.summary === "object" ? (plain(p.summary) as Record<string, unknown>) : undefined) : leanSummary(p.summary);
  return {
    uid, name: text(p.name), email: text(p.email), username: text(p.username) || null, role: text(p.role) || "learner",
    group: text(p.group) || null, teacherId: text(p.teacherId) || null, projectsWaiting: num(p.projectsWaiting),
    superSeat: p.superSeat === true, active: p.active !== false, mustChangePassword: p.mustChangePassword === true,
    managed: isManaged(p, orgId, domain), suspended: Boolean(p.suspended),
    lastActive: typeof p.lastActive === "string" && p.lastActive ? p.lastActive : ms(p.lastActive), createdAt: ms(p.createdAt),
    ...(summary ? { summary } : {}),
  };
}
