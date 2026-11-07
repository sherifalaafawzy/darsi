/**
 * The pure parts of account.ts (deleting and exporting an account's data, moderating a project), tested in
 * test/accounts.test.ts. Who may act on an account is accountActionProblem in roles.ts.
 */
import { createHash } from "node:crypto";

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
