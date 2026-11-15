/**
 * What to tell a staff member when something failed, always in their language and never the server's or the SDK's raw
 * English ("Missing or insufficient permissions.", "internal"). In order:
 *   1. the callable's own refusal code (`details.reason`), worded here or in admin/refusals.ts;
 *   2. the Firebase or Storage SDK's error code, as a sentence that says what to do next;
 *   3. one generic sentence.
 * The raw text goes to console.error, which bugs/log.ts keeps, so "Report a problem" still carries it.
 * Staff code only: nothing on the startup path imports this folder.
 *
 * admin/refusals.ts's words live in admin/strings, which this file does not load: /results is for university teachers,
 * who would download 25 KB of admin strings for nothing. Every admin screen registers them itself (import "./strings"),
 * and where they are not there (`said` below) the code's sentence is used instead of a bare key.
 */
import { languageOf, type MessageKey } from "../i18n";
import { reasonOf, refusalText, serverWords } from "../admin/refusals";
import { k, type StaffKey } from "./strings";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Refusal codes worded here: the ones the functions gained with suspension, bulk member actions, join policy, course
 * access, retention and legal pages. These win over admin/refusals.ts where both know a code: there "recent-login"
 * speaks only of making a platform admin, and the same code also guards deleting an account.
 */
const REASONS: Record<string, StaffKey> = {
  // index.ts and orgMembers.ts (an organization's state, its codes and join policy, its members)
  "org-suspended": "st.rf.orgSuspended", "org-deleting": "st.rf.orgDeleting", "code-expired": "st.rf.codeExpired", "code-used-up": "st.rf.codeUsedUp",
  removed: "st.rf.removed", "email-unverified": "st.rf.emailUnverified", "email-domain": "st.rf.emailDomain", "bad-policy": "st.rf.badPolicy",
  "not-in-org": "st.rf.notInOrg", managed: "st.rf.managed", "self-suspend": "st.rf.selfSuspend", "platform-suspended": "st.rf.platformSuspended",
  "not-suspended": "st.rf.notSuspended", "too-many": "st.rf.tooMany", "bad-action": "st.rf.badAction", "bad-teacher": "st.rf.badTeacher",
  // A bulkMembers row that failed for a reason of the server's own.
  failed: "st.rf.failed",
  // billing.ts (licences, seats, credits)
  "no-licence": "st.rf.noLicence", "seats-full": "st.rf.seatsFull", "bad-seats": "st.rf.badSeats", "bad-days": "st.rf.badDays",
  "bad-credits": "st.rf.badCredits", "bad-args": "st.rf.badArgs",
  // admin.ts, account.ts and platform.ts (who is calling)
  "recent-login": "st.rf.recentLogin", disabled: "st.rf.disabled", "bad-status": "st.rf.badStatus",
  // access.ts (course access)
  "no-grant": "st.rf.noGrant", "bad-units": "st.rf.badUnits", "bad-orgs": "st.rf.badOrgs", "bad-until": "st.rf.badUntil", "try-again": "st.rf.tryAgain",
  // content.ts (the course editor's publish, unpublish and delete)
  "bad-unit-id": "st.rf.badUnitId", "no-unit": "st.rf.noUnit", "no-owner": "st.rf.noOwner", "not-unit-admin": "st.rf.notUnitAdmin",
  "draft-id": "st.rf.draftId", "draft-invalid": "st.rf.draftInvalid", "catalog-pending": "st.rf.catalogPending",
  // retention.ts, legal.ts and analytics.ts (bad-ga-secret: an API secret over 100 characters, apart from a bad ID)
  "bad-periods": "st.rf.badPeriods", "no-report": "st.rf.noReport", "legal-text": "st.rf.legalText", "legal-version": "st.rf.legalVersion", "bad-ga": "st.rf.badGa",
  "legal-doc": "st.rf.legalDoc", "legal-file": "st.rf.legalFile", "bad-ga-secret": "st.rf.badGaSecret",
  // Worded here too (admin/refusals.ts has words for some): screens outside the admin chunk (/org, /results) don't
  // load the admin strings, and these reach them.
  "no-org": "st.rf.noOrg", "no-account": "st.rf.noAccount", "not-super": "st.rf.notSuper",
  // index.ts: joining, asking to register, a request reviewed, a first password
  "bad-code": "st.rf.badCode", "in-org": "st.rf.inOrg", "too-many-tries": "st.rf.tooManyTries", reserved: "st.rf.reserved",
  "pending-request": "st.rf.pendingRequest", reviewed: "st.rf.reviewed", "requester-in-org": "st.rf.requesterInOrg", "requester-staff": "st.rf.requesterStaff",
  "password-unchanged": "st.rf.passwordUnchanged",
  // platform.ts and orgExport.ts (deleting an organization in steps, exporting it). "bad-members": no valid choice for
  // the members was sent. "delete-option": the deletion was started with the other choice; with the stored one in the
  // refusal's details it is named (detailed() below). "export-wait" names the time a new export may start the same way;
  // here are the words for an answer without those details (a bulk row, an older server).
  "delete-option": "st.rf.deleteOption", "bad-members": "st.rf.badMembers", "bad-cursor": "st.rf.badCursor", "export-wait": "st.rf.exportWaitSoon", "bad-export": "st.rf.badExport",
  // account.ts: one download of an account's data every ten minutes (the person page's "Download their data").
  "data-wait": "st.rf.dataWait",
  "bad-page": "st.rf.badPage",
  "page-too-long": "st.rf.pageTooLong",
  "page-problems": "st.rf.pageProblems",
  // orgMembers.ts and orgMembersCore.ts (the people a call names, an edit of them). The ones only a changed or older
  // app could send get "something was missing".
  "bad-uids": "st.rf.badUids", "bad-patch": "st.rf.badPatch", "bad-group": "st.rf.badGroup", "bad-name": "st.rf.badName", "name-one": "st.rf.nameOne",
  "bad-suspended": "st.rf.badArgs", "bad-view": "st.rf.badArgs", "bad-after": "st.rf.badArgs", "signed-out": "st.err.unauthenticated",
  // access.ts, content.ts and sites.ts ("site-taken": admin/refusals.ts words it too, for the screens with the admin strings)
  "bad-unit": "st.rf.badUnit", changed: "st.rf.changed", "site-action": "st.rf.badAction", "site-taken": "st.rf.siteTaken",
  // School sign-in (sso.ts, ssoStore.ts and their hooks in index.ts, orgMembers.ts, platform.ts, account.ts, payments.ts),
  // where staff meet it outside the sign-in screens: a password reset for an account only the school's sign-in opens,
  // an action a personal account must do from its own login, and a change that would leave no admin a way in.
  "sso-login": "st.rf.ssoLogin", "sso-own-login": "st.rf.ssoOwnLogin", "sso-last-way-in": "st.rf.ssoLastWayIn",
};

/** deleteOrg's two choices for the members (functions/src/platform.ts MembersOption), each named in its own sentence. */
const DELETE_OPTIONS: Record<string, StaffKey> = { release: "st.rf.deleteOptionRelease", "delete-managed": "st.rf.deleteOptionManaged" };
/** The locale for a time in a sentence when the caller passed none: the page's language (<html lang>, set by applyLocale). */
const pageLocale = () => languageOf((typeof document !== "undefined" && document.documentElement.lang) || "en").numerals;

/**
 * SDK codes, with their prefix ("functions/", "firestore/") taken off; Storage's and Auth's keep theirs. A code not
 * here gets the generic sentence.
 */
const CODES: Record<string, StaffKey> = {
  "permission-denied": "st.err.permissionDenied", unavailable: "st.err.unavailable", "not-found": "st.err.notFound",
  "resource-exhausted": "st.err.resourceExhausted", "deadline-exceeded": "st.err.deadlineExceeded", unauthenticated: "st.err.unauthenticated",
  "failed-precondition": "st.err.failedPrecondition", internal: "st.err.internal", "invalid-argument": "st.err.invalidArgument",
  "storage/unauthorized": "st.err.storageUnauthorized", "storage/unauthenticated": "st.err.unauthenticated", "storage/object-not-found": "st.err.notFound",
  "storage/quota-exceeded": "st.err.storageQuota", "storage/retry-limit-exceeded": "st.err.storageRetry",
  "auth/network-request-failed": "st.err.unavailable", "auth/requires-recent-login": "st.rf.recentLogin",
};
/** What a dropped connection looks like: a callable that never reached the server comes back as "internal". */
const NETWORK = new Set(["", "internal", "unavailable", "deadline-exceeded", "storage/retry-limit-exceeded", "auth/network-request-failed"]);
/** A map's own entry only: a code named like something every object has ("constructor", "toString") is not one. */
const own = (map: Record<string, StaffKey>, code: string | null | undefined): StaffKey | undefined =>
  code && Object.prototype.hasOwnProperty.call(map, code) ? map[code] : undefined;

/** The SDK's error code without "functions/" or "firestore/" ("storage/…" and "auth/…" keep theirs), or "". */
export const codeOf = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c.replace(/^(?:functions|firestore)\//, "") : "";
};

/**
 * admin/refusals.ts's own words for this refusal, when it knows the code (its map is private: ask which key it would
 * use) and the admin strings are registered. t() answers a key it has no string for with the key itself, isolated in
 * a right-to-left language: that is "not registered", and null here.
 */
function oldWords(e: unknown, t: T): string | null {
  let key: unknown = "";
  refusalText(e, (x) => { key = x; return ""; });
  // Not a string: its map answered a code like "constructor" with what every object has.
  if (typeof key !== "string" || !key) return null;
  const said = t(key as MessageKey);
  return said.replace(/[\u2066-\u2069]/g, "") === key ? null : said;
}

/**
 * A refusal code's words: for a row of a bulk answer ({ uid, ok: false, reason }), which is no thrown error. A code
 * neither this file nor admin/refusals.ts knows gets the generic sentence.
 */
export function reasonText(reason: string | null | undefined, t: T): string {
  const mine = own(REASONS, reason);
  if (mine) return t(k(mine));
  return (reason ? oldWords({ details: { reason } }, t) : null) ?? t(k("st.err.generic"));
}

/**
 * The refusals whose words need what the server sent along (`details`): which choice a deletion was started with
 * (`members`), and when a new export may start (`retryAt`, ms). Null for any other refusal, and for these without their
 * detail: the plain words then.
 */
function detailed(e: unknown, t: T, locale?: string): string | null {
  const d = (e as { details?: { reason?: unknown; members?: unknown; retryAt?: unknown } } | null)?.details;
  if (d?.reason === "delete-option") {
    const key = own(DELETE_OPTIONS, typeof d.members === "string" ? d.members : null);
    return key ? t(k(key)) : null;
  }
  if (d?.reason === "export-wait" && typeof d.retryAt === "number" && Number.isFinite(d.retryAt)) {
    try { return t(k("st.rf.exportWait"), { time: new Intl.DateTimeFormat(locale || pageLocale(), { timeStyle: "short" }).format(new Date(d.retryAt)) }); }
    catch { return null; } // a locale or a time Intl refuses: the plain words
  }
  return null;
}

/**
 * What to show for a failed read, write or callable. Logs the raw error once per call. `locale` (useI18n().locale) is
 * for the refusals that name a time; without it the page's own language is used.
 */
export function errorText(e: unknown, t: T, locale?: string): string {
  const reason = reasonOf(e), code = codeOf(e);
  console.error("[staff]", reason || code || "error", serverWords(e));
  const told = detailed(e, t, locale);
  if (told) return told;
  const mine = own(REASONS, reason);
  if (mine) return t(k(mine));
  const old = oldWords(e, t);
  if (old) return old;
  // Offline, the SDK says "internal" or "unavailable": say the thing the person can fix.
  if (NETWORK.has(code) && typeof navigator !== "undefined" && navigator.onLine === false) return t(k("st.err.offline"));
  return t(k(own(CODES, code) ?? "st.err.generic"));
}
