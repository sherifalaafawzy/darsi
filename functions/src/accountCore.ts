/**
 * The pure parts of account.ts (deleting and exporting an account's data, moderating a project), tested in
 * test/accounts.test.ts. Who may act on an account is accountActionProblem in roles.ts.
 */
import { createHash } from "node:crypto";
import { managedAccount } from "./roles.js";

/** Deleting your own account needs a sign-in this recent (seconds), so a phone left signed in can't be used for it. */
export const RECENT_SIGN_IN = 10 * 60;
/** Whether an ID token's sign-in (auth_time, in seconds) is recent enough to delete the account. */
export const recentSignIn = (authTime: unknown, nowMs = Date.now()) => nowMs / 1000 - (Number(authTime) || 0) <= RECENT_SIGN_IN;

/** How a deleted account's id appears in the payment records kept for the accounts. */
export const hashedUid = (uid: string) => `deleted-${createHash("sha256").update(uid).digest("hex").slice(0, 20)}`;

/**
 * A project file's Storage path from its download link ("…/o/submissions%2Forg%2Fuid%2F…?alt=media…"), only when it is
 * this person's project file. Anything else is not ours to delete.
 */
export function submissionPath(url: unknown, uid: string): string | null {
  if (typeof url !== "string") return null;
  const m = /\/o\/([^?#]+)/.exec(url);
  if (!m) return null;
  let path: string;
  try { path = decodeURIComponent(m[1]); } catch { return null; }
  const parts = path.split("/");
  return parts[0] === "submissions" && parts[2] === uid && parts.length >= 4 && parts.every((p) => p && p !== "." && p !== "..") ? path : null;
}

/** Every file a project's links point at: the single fileUrl (older apps) and files[]. */
export const submissionFiles = (d: Record<string, unknown> | undefined, uid: string) =>
  [d?.fileUrl, ...(Array.isArray(d?.files) ? (d!.files as { url?: unknown }[]).map((f) => f?.url) : [])].map((u) => submissionPath(u, uid)).filter((p): p is string => !!p);

/** A regular expression for "this person's file in any organization's project folder". */
export const ownFileRe = (uid: string) => new RegExp(`^submissions/[^/]+/${uid.replace(/[^A-Za-z0-9]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`)}/`);

/**
 * The tutor agent's sessions (agentSessions.ts), as Agent Runtime answers `async_list_sessions`: a list, or
 * `{sessions: [...]}`, with camelCase or snake_case keys depending on the ADK version. `updatedAt` is in ms.
 */
export interface AgentSession { id: string; updatedAt: number | null }
export function sessionsOf(output: unknown): AgentSession[] {
  const list = Array.isArray(output) ? output : Array.isArray((output as { sessions?: unknown } | null)?.sessions) ? (output as { sessions: unknown[] }).sessions : [];
  return list.flatMap((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) return [];
    const t = Number(o.lastUpdateTime ?? o.last_update_time);
    // ADK gives seconds (a float); anything already in ms is kept.
    return [{ id: o.id, updatedAt: Number.isFinite(t) && t > 0 ? Math.round(t < 1e11 ? t * 1000 : t) : null }];
  });
}

/**
 * A session's conversation for the person's export (`async_get_session`): who said what and when, and what the tutor
 * called with which arguments (its answer goes through a `reply` call). What a tool gave back is course text, not the
 * person's, so only its name is kept; the model's own thinking is left out.
 */
export function sessionEvents(session: unknown): { at: string | null; author: string; parts: Record<string, unknown>[] }[] {
  const events = (session as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const raw = (o.content as { parts?: unknown } | undefined)?.parts;
    const parts = (Array.isArray(raw) ? raw : []).flatMap((p): Record<string, unknown>[] => {
      const x = (p ?? {}) as Record<string, unknown>;
      if (x.thought) return [];
      if (typeof x.text === "string" && x.text) return [{ text: x.text }];
      const call = (x.functionCall ?? x.function_call) as { name?: unknown; args?: unknown } | undefined;
      if (call) return [{ call: String(call.name ?? ""), args: call.args ?? null }];
      const result = (x.functionResponse ?? x.function_response) as { name?: unknown } | undefined;
      return result ? [{ result: String(result.name ?? "") }] : [];
    });
    if (!parts.length) return [];
    const t = Number(o.timestamp);
    return [{ at: Number.isFinite(t) && t > 0 ? new Date(t < 1e11 ? t * 1000 : t).toISOString() : null, author: typeof o.author === "string" ? o.author : "", parts }];
  });
}

/** The deletion queue (account.ts onAccountDeletion) stops retrying an account this long after it was queued. */
export const DELETION_GIVE_UP_MS = 6 * 60 * 60 * 1000;

/**
 * Why no worker is behind a queue entry any more (account.ts onAccountDeletion runs on an entry's creation, and is
 * retried from then), or null while one still is: "held" (it waits for a person, e.g. a subscription that renews by
 * itself: the worker returned for good), "gave-up" (the worker's six hours ran out: `gaveUpAt`), or "expired" (queued
 * more than six hours ago: the next try gives up whatever the entry says). `at` is the time it was queued, a Firestore
 * Timestamp or milliseconds; an entry with none is taken as new.
 */
export function queueStopped(entry: Record<string, unknown> | undefined, now: number): "held" | "gave-up" | "expired" | null {
  if (!entry) return null;
  if (entry.held) return "held";
  if (entry.gaveUpAt) return "gave-up";
  const at = entry.at as { toMillis?: () => number } | number | null | undefined;
  const ms = typeof at === "number" ? at : typeof at?.toMillis === "function" ? at.toMillis() : NaN;
  return Number.isFinite(ms) && now - ms > DELETION_GIVE_UP_MS ? "expired" : null;
}

/**
 * Why an account queued for deletion with its organization (accountDeletions/{uid}, written by deleteOrg, and by a
 * school sign-in link for the empty school-made account it replaced: sso.ts finishLink) must not be
 * deleted after all, or null. The queue is filled only with accounts the organization managed, but the worker runs
 * later: by then the account may be a platform admin, may have become the person's own (no longer managed), or may be
 * another organization's. An account with neither a profile nor a sign-in is already gone: only leftovers remain.
 */
export function queuedDeletionProblem(orgId: string, t: { exists: boolean; hasAccount: boolean; role?: unknown; claimRole?: unknown; orgId?: unknown; managedBy?: unknown; email?: string | null }, usernameDomain = "users.darsi.app"):
  "no-org" | "superadmin" | "not-managed" | "moved" | null {
  if (!orgId) return "no-org";
  if (t.role === "superadmin" || t.claimRole === "superadmin") return "superadmin";
  if (!t.exists && !t.hasAccount) return null;
  const { managed, by } = managedAccount(t, usernameDomain);
  if (!managed) return "not-managed";
  if ((by !== null && by !== orgId) || (typeof t.orgId === "string" && t.orgId && t.orgId !== orgId)) return "moved";
  return null;
}
