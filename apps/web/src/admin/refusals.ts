/**
 * Why a callable refused, in the admin's language. The functions put a stable code in the error's details
 * (`details.reason`: functions/src/index.ts, platform.ts and account.ts); the English message is only the fallback, for
 * a code this phone doesn't know yet (an older app talking to a newer server).
 */
import type { MessageKey } from "../i18n";

const WORDS: Record<string, MessageKey> = {
  // index.ts and platform.ts (organizations, members, roles)
  "self-role": "rf.selfRole", "self-remove": "rf.selfRemove", "self-password": "rf.selfPassword", "last-admin": "po.lastAdmin",
  "own-login": "acct.ownLogin", "not-member": "rf.notMember", "not-org-admin": "rf.notOrgAdmin", "not-admin": "rf.notAdmin",
  "not-super": "rf.notSuper", "org-inactive": "rf.orgInactive", "bad-role": "rf.badRole", "no-org": "rf.noOrg", "no-account": "p.notFound",
  "org-name": "rf.orgName", "confirm-name": "rf.confirmName", "batch-size": "rf.batchSize", "admin-self": "po.adminSelf", "admin-super": "po.adminIsSuper",
  // account.ts (data, deletion, suspension)
  superadmin: "po.adminIsSuper", "not-yours": "acc.notYours", renewing: "acc.renewing", missing: "p.notFound",
  // orgCourses.ts (which courses members see; content/orgCourses.ts OrgCoursesProblem)
  "courses-mode": "oc.rf.mode", "courses-list": "oc.rf.list", "courses-id": "oc.rf.id", "courses-many": "oc.rf.many",
  "courses-classes": "oc.rf.classes", "courses-class": "oc.rf.class", "courses-total": "oc.rf.total",
  // sites.ts (an organization's own web addresses: content/sites.ts SiteProblem, and manageSite's own)
  "site-host": "site.rf.host", "site-reserved": "site.rf.reserved", "site-taken": "site.rf.taken", "site-limit": "site.rf.limit",
  "site-state": "site.rf.state", "no-site": "site.rf.noSite",
};

/** The refusal's code (`details.reason`), or "". */
export const reasonOf = (e: unknown) => String((e as { details?: { reason?: unknown } } | null)?.details?.reason ?? "");
/** The server's own words, without a "FirebaseError: " prefix or the SDK's " [400]" (they may contain ": "). */
export const serverWords = (e: unknown) => String((e as { message?: string } | null)?.message ?? e).replace(/^Firebase(?:Error)?:\s*/, "").replace(/\s*\[\d{3}\]$/, "");
/** What to tell the admin: the refusal in their language when its code is known, else the server's own words. */
export function refusalText(e: unknown, t: (key: MessageKey) => string) {
  const key = WORDS[reasonOf(e)];
  return key ? t(key) : serverWords(e);
}
