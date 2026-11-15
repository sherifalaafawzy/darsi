import { call } from "../fb";
import type { Profile, Role } from "./types";
import type { OrgCourses } from "../content/orgCourses";
import type { SiteDoc } from "../content/sites";

/** What manageSite does with an address; `orgId` adds one for an organization that didn't ask. */
export type SiteAction = { host: string } & ({ action: "request" | "cancel" | "check" | "remove" } | { action: "approve"; orgId?: string; darsi: boolean }
  | { action: "refuse"; reason?: string } | { action: "identity"; darsi: boolean });

export interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string }
/**
 * One row's outcome (functions/src/index.ts createMembers), in the order sent. "exists": the typed email has an account;
 * "taken": someone has the typed username. warning "teacherNotFound": created, but no teacher of this organization has
 * the login in its teacher column. `reason`: why a row wasn't created, for the screen to say in the admin's language
 * (`error` is the server's English).
 */
export interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "taken" | "error"; error?: string; reason?: "missingName" | "invalidEmail" | "invalidUsername" | "exists" | "taken"; warning?: "teacherNotFound" }
/** Why an account action was refused (functions/src/account.ts, the error's details.reason). */
export type AccountRefusal = "recent-login" | "renewing" | "self-staff" | "self-org" | "superadmin" | "not-yours" | "missing" | "sso-own-login" | "data-wait";

/** Push notifications (functions/src/notify.ts). Each device gets its own language; cats can each be switched off. */
/** The phone's language: notifications come in Arabic for Arabic and in English for every other language. */
export type PushLang = string;
/** Announcements from /super are written in English and Arabic; phones in other languages get the English one. */
export type BroadcastLang = "en" | "ar";
export interface NotifyCats { reminders: boolean; reviews: boolean; staff: boolean; news: boolean }
/** hourLocal 0–23 (the reminder time on this phone's clock), weeklyGoal 1–14 lessons. */
export interface NotifyPrefs { hourLocal: number; cats: NotifyCats; weeklyGoal: number }
export type BroadcastAudience = { type: "all" } | { type: "org"; orgId: string } | { type: "role"; role: "student" | "teacher" | "orgAdmin" };
export interface BroadcastInput { title: Record<BroadcastLang, string>; body: Record<BroadcastLang, string>; link?: string; audience: BroadcastAudience }
/** FCM message id per language, or null where that send failed. */
export type BroadcastResults = Record<BroadcastLang, string | null>;

export interface OrgDetails { name: string; type: string; country: string; city: string }

/** Who may join an organization with its codes (functions/src/membersCore.ts JoinPolicy): no domains means any email. */
export interface JoinPolicy { requireVerifiedEmail: boolean; allowedDomains: string[] }
/** One invite code's limits and how often it was used; null is "no limit". `expiresAt` in ms. */
export interface CodeState { expiresAt: number | null; maxUses: number | null; uses: number }
export type CodeLimits = { expiresAt?: number | null; maxUses?: number | null };
/** What a bulk action does to each chosen member (functions/src/orgMembers.ts bulkMembers). */
export type BulkAction = "remove" | "suspend" | "restore" | "resetPassword" | "setRole";
/** One person's outcome, in the order sent: `reason` is why it was refused (staff/errors.ts reasonText words it); a reset password comes back once, here. */
export interface BulkResult { uid: string; ok: boolean; reason?: string; login?: string; password?: string }
/** The retention periods, in whole days; null or left out is "never deleted" (functions/src/retention.ts). */
export type RetentionPeriods = Partial<Record<"bugReportsClosedDays" | "bugReportsAnyDays" | "analyticsDevicesDays" | "checkoutsOpenDays" | "joinAttemptsDays" | "auditDays" | "orgExportsDays", number | null>>;
export type RetentionCounts = Record<"bugReports" | "analyticsDevices" | "checkouts" | "joinAttempts" | "audit" | "orgExports", number>;
export type LegalDoc = "privacy" | "terms";

/*
 * School sign-in (functions/src/sso.ts manageSso; TECHNICAL.md "School sign-in"). The connection as the server keeps it,
 * never with its secret: the wizard (admin/SsoSetup.tsx) and the status card read it, the platform screens too.
 */
export type SsoPreset = "google" | "microsoft" | "okta" | "keycloak" | "oidc";
export type SsoTeacherRule = { kind: "email"; domains: string[]; emails: string[] } | { kind: "role"; value: string } | { kind: "group"; value: string } | { kind: "claim"; claim: string; value: string };
/** What an admin types (manageSso save checks it as functions/src/ssoCore.ts validateConfig does). */
export interface SsoFields {
  preset: SsoPreset; tenant?: string | null; domain?: string | null; oktaServer?: string | null; realm?: string | null; issuer?: string | null;
  clientId: string; authMethod?: "basic" | "post" | null; allowedDomains: string[]; openToAll: boolean; emailsVerifiedBySchool: boolean;
  teacherRule: SsoTeacherRule | null; classClaim: string | null; maxSessionDays: number; personalDevices: boolean; secretExpiresOn: string | null;
}
/** A saved connection: the fields, plus what discovery found and its revision. */
export interface SsoConn extends Required<Omit<SsoFields, "authMethod">> {
  issuer: string; authMethod: "basic" | "post"; subjectKind: "sub" | "tid-oid"; scopes: string[];
  endpoints: { authorization: string; token: string; jwks: string; endSession?: string };
  issParam: boolean; pkce: "s256" | "unadvertised"; connectionId: string; configRev: number; hasSecret: boolean;
}
/** The last test: `decision` is "signin", "signin-raise", "link-org-made", "create-student", "create-teacher", "wait" or "refuse:<code>". */
export interface SsoLastTest {
  at: number; ok: boolean; by: string | null; asStudent: boolean; decision: string; rev: number; claimsSeen: string[]; ruleValues: string[];
  email: string | null; name: string | null; emailVerified: boolean; teacher: boolean | null; cls: string | null; error?: string | null;
}
export interface SsoListing { state: "none" | "requested" | "approved" | "refused"; name?: string | null; logo?: string | null; host?: string | null; at?: number | null; by?: string | null; reason?: string | null }
export interface SsoConfig extends SsoConn {
  status: "draft" | "tested" | "on" | "off"; testedRev: number | null; studentTestRev: number | null; slug: string | null;
  listing: SsoListing; next: SsoConn | null; lastTest: SsoLastTest | null;
  /** A student's test passed at this revision; the provider's host people continue at. */
  studentTestOk: boolean; host: string;
}
/** A problem the status card shows (functions/src/ssoStore.ts noteProblem): reason → how often, when, and a hint. */
export interface SsoProblemNote { n: number; firstAt?: number; lastAt: number; hint: string | null }
export interface SsoState {
  config: SsoConfig | null;
  /** The wizard's own work in progress (never a secret), as last typed. */
  wip: { config: Record<string, unknown>; at: number; by: string } | null;
  health: { problems?: Record<string, SsoProblemNote> } | null;
  connected: number; lastSignIn: number | null; orgMadeToMatch: number; ssoOnly: number;
  callbackUrl: string; signinUrl: string | null; switchOn: boolean; ceiling: { value: number | null; default: number }; keyOk: boolean;
  /** Platform admins only: the key ring and the token signer answer. */
  keyCanary?: boolean; signerOk?: boolean | null;
}
export interface SsoDiscovered { ok: true; issuer: string; host: string; pkce: "s256" | "unadvertised"; issParam: boolean; authMethods: ("basic" | "post")[]; endSession: boolean }
/**
 * One person's school sign-in in an organization (manageSso `person`; functions/src/sso.ts personState). `state`: it
 * opens the account, an admin or a suspension blocked it (`blockedBy`), the organization removed the person, or there
 * is none. `linked`: the school's sign-in made the account ("jit"), it matched one the organization made ("org-made"),
 * the person connected their own ("self"), or an admin did ("admin-map"). `ownLogin`: the account has a password or
 * Google login besides the school; null when it is gone or isn't this organization's to ask about.
 */
export interface SsoPerson { state: "active" | "blocked" | "removed" | "none"; linked: "jit" | "org-made" | "self" | "admin-map" | null; blockedBy: "admin" | "suspension" | null; ownLogin: boolean | null }
export type SsoAction =
  | { action: "get"; orgId: string }
  | { action: "person"; orgId: string; uid: string }
  | { action: "discover"; orgId: string; preset: SsoPreset; tenant?: string | null; domain?: string | null; oktaServer?: string | null; realm?: string | null; issuer?: string | null }
  | { action: "save"; orgId: string; config: SsoFields; secret?: string; migration?: "same" | "new" }
  | { action: "save"; orgId: string; partial: true; config: Record<string, unknown> }
  | { action: "testLink" | "turnOff" | "requestListing"; orgId: string }
  | { action: "turnOn"; orgId: string; studentChecked?: boolean }
  | { action: "listing"; orgId: string; approve: boolean; reason?: string }
  | { action: "allowBack" | "block" | "unblock" | "unlink"; orgId: string; uid: string }
  | { action: "setCeiling"; orgId: string; ceiling: number | null }
  | { action: "setSwitch"; on: boolean };

export const api = {
  requestOrg: call<{ name: string; type: string; country: string; city: string; size?: number; contact?: string; reason?: string }, { orgId: string; status: string }>("requestOrg"),
  reviewOrg: call<{ orgId: string; approve: boolean; note?: string }, { status: string; inviteCodes?: { teacher: string; student: string } }>("reviewOrg"),
  joinOrg: call<{ code: string }, { orgId: string; role: Role; orgName: string }>("joinOrg"),
  regenerateInviteCode: call<{ orgId: string; role: "teacher" | "student" }, { code: string }>("regenerateInviteCode"),
  // Who may join with the codes, and each code's expiry and uses. Only `orgId`: reads them, writes nothing.
  setJoinPolicy: call<{ orgId: string; requireVerifiedEmail?: boolean; allowedDomains?: string[]; codes?: { teacher?: CodeLimits; student?: CodeLimits } }, { policy: JoinPolicy; codes: { teacher: CodeState; student: CodeState } }>("setJoinPolicy"),
  // Lets someone the organization removed join again with a code (it doesn't add them back).
  readmitMember: call<{ orgId: string; uid: string }, { ok: boolean }>("readmitMember"),
  createMembers: call<{ orgId: string; members: MemberInput[]; passwordLength?: number; mustChangePassword?: boolean; defaultRole?: Role }, { results: MemberResult[] }>("createMembers"),
  setMemberRole: call<{ orgId: string; uid: string; role: Role }, { ok: boolean }>("setMemberRole"),
  resetMemberPassword: call<{ orgId: string; uid: string }, { password: string; login: string }>("resetMemberPassword"),
  removeMember: call<{ orgId: string; uid: string }, { ok: boolean }>("removeMember"),
  // Member lifecycle (functions/src/orgMembers.ts). listMembers: a page of lean rows ("report" adds the whole summary);
  // call again with `after: next` until next is null. Rows carry `managed` and `suspended` as true/false, `createdAt` as ms.
  listMembers: call<{ orgId: string; view?: "list" | "report"; after?: string | null; limit?: number }, { members: Profile[]; next: string | null }>("listMembers"),
  // Class, teacher and name edits, audited (1 to 200 people; `name` only with one). null clears a class or teacher.
  updateMembers: call<{ orgId: string; uids: string[]; patch: { group?: string | null; teacherId?: string | null; name?: string } }, { updated: number }>("updateMembers"),
  // One action for 1 to 200 people; each person's refusal is only their own row.
  bulkMembers: call<{ orgId: string; uids: string[]; action: BulkAction; role?: Role; reason?: string; passwordLength?: number }, { results: BulkResult[] }>("bulkMembers"),
  // Locks or unlocks a login the organization made (someone with their own sign-in is removed instead).
  setMemberSuspended: call<{ orgId: string; uid: string; suspended: boolean; reason?: string }, { suspended: boolean }>("setMemberSuspended"),
  // The signed-in member leaves their organization and keeps their learning.
  leaveOrg: call<Record<string, never>, { ok: boolean }>("leaveOrg"),
  // The organization's own audit log, newest first (functions/src/audit.ts): pass `next` back as `before`; null is the end.
  orgAudit: call<{ orgId: string; before?: number | null; action?: string; uid?: string; limit?: number }, { entries: Record<string, unknown>[]; next: number | null }>("orgAudit"),
  // Everything the organization holds, written as files in steps: call again with exportId and cursor until done.
  exportOrgData: call<{ orgId: string; exportId?: string; cursor?: string | null }, { exportId: string; done: boolean; cursor: string | null; files: string[]; members: number }>("exportOrgData"),
  // Which courses the org's teachers, students and classes see (functions/src/orgCourses.ts); returns what was stored.
  setOrgCourses: call<{ orgId: string; courses: OrgCourses }, { courses: OrgCourses }>("setOrgCourses"),
  passwordChanged: call<Record<string, never>, { ok: boolean }>("passwordChanged"),
  registerDevice: call<{ token: string; lang: PushLang; tz: string } & NotifyPrefs, { ok: true }>("registerDevice"),
  unregisterDevice: call<{ token: string }, { ok: true }>("unregisterDevice"),
  updateNotifyPrefs: call<{ tz: string } & NotifyPrefs, { ok: true }>("updateNotifyPrefs"),
  sendBroadcast: call<BroadcastInput, { id: string; results: BroadcastResults }>("sendBroadcast"),
  // Platform admins only (functions/src/platform.ts).
  createOrg: call<OrgDetails & { adminUid?: string }, { orgId: string }>("createOrg"),
  // Organizations' own web addresses (functions/src/sites.ts): org admins ask (request, cancel, check); platform admins
  // approve, which connects it, refuse, change Darsi's identity, check and remove.
  manageSite: call<SiteAction, { site: SiteDoc | null; warnings?: string[] }>("manageSite"),
  // status: "suspended" freezes a working organization (with `reason`), and only "active" resumes it.
  updateOrg: call<Partial<OrgDetails> & { orgId: string; status?: "active" | "suspended" | "rejected"; reason?: string }, { ok: boolean }>("updateOrg"),
  // In steps: call again with the returned cursor (and the name, every time) until done. Members are released to
  // independent learners unless `members` is "delete-managed" (then the accounts the organization made are deleted).
  deleteOrg: call<{ orgId: string; confirm: string; members?: "release" | "delete-managed"; cursor?: string | null }, { done: boolean; cursor: string | null; processed: number; units: number }>("deleteOrg"),
  setUserRole: call<{ uid: string; role: Role; orgId?: string | null }, { ok: boolean }>("setUserRole"),
  // Data rights and abuse (functions/src/account.ts). No uid: your own account.
  exportAccountData: call<{ uid?: string }, Record<string, unknown>>("exportAccountData"),
  deleteAccount: call<{ uid?: string }, { ok: boolean }>("deleteAccount"),
  setAccountSuspended: call<{ uid: string; suspended: boolean; reason?: string }, { suspended: boolean }>("setAccountSuspended"),
  moderateSubmission: call<{ uid: string; id: string; reason?: string }, { ok: boolean; files: number }>("moderateSubmission"),
  // Darsi Super (functions/src/billing.ts).
  setSuperOn: call<{ on: boolean }, { on: boolean }>("setSuperOn"),
  savePlans: call<{ plans: unknown[]; economics: { usdPerCredit: number; egpPerUsd: number } }, { rev: number }>("savePlans"),
  grantCredits: call<{ uid: string; credits: number }, { ok: boolean }>("grantCredits"),
  // Taking Super back and removing a licence are their own flags, never an empty number field.
  grantSuper: call<{ uid: string; days: number; plan?: string; revoke?: boolean }, { ok: boolean }>("grantSuper"),
  setOrgLicence: call<{ orgId: string; seats: number; days?: number; plan?: string; remove?: boolean }, { ok: boolean }>("setOrgLicence"),
  setSeat: call<{ orgId: string; uid: string; on: boolean }, { ok: boolean }>("setSeat"),
  // `more`: seats and members are both left, so call again.
  fillSeats: call<{ orgId: string }, { given: number; more: boolean }>("fillSeats"),
  // Course access (functions/src/access.ts; results/data.ts wraps these): a grant replaces the person's earlier one.
  // `orgs`: organization ids, or "none" for people in no organization; left out is the teacher's own organization.
  grantCourseAccess: call<{ uid: string; units: string[]; orgs?: string[]; until?: number | null }, { ok: boolean; orgs?: string[] }>("grantCourseAccess"),
  revokeCourseAccess: call<{ uid: string }, { ok: boolean }>("revokeCourseAccess"),
  // `more`: a cap was reached, so there may be rows this read didn't return.
  courseResults: call<{ unitId: string }, { results: Record<string, unknown>[]; work: Record<string, unknown>[]; more?: boolean }>("courseResults"),
  // Retention (functions/src/retention.ts): the periods are saved whole; a preview counts what they cover and deletes nothing.
  saveRetention: call<{ periods: RetentionPeriods }, { periods: RetentionPeriods }>("saveRetention"),
  previewRetention: call<{ periods?: RetentionPeriods }, { counts: RetentionCounts; partial?: boolean }>("previewRetention"),
  deleteBugReport: call<{ id: string }, { ok: boolean }>("deleteBugReport"),
  // Legal pages (functions/src/legal.ts): `text` is language code to plain text; the answer is the version now published.
  saveLegal: call<{ doc: LegalDoc; text?: Record<string, string>; publish?: boolean; unpublish?: boolean }, { version: number | null }>("saveLegal"),
  acceptTerms: call<{ privacy?: number; terms?: number }, { ok: boolean; recorded?: boolean }>("acceptTerms"),
  // Google Analytics forwarding (functions/src/analytics.ts): an empty secret switches it off.
  setGaConfig: call<{ measurementId: string; apiSecret: string }, { ok: boolean }>("setGaConfig"),
  // School sign-in (functions/src/sso.ts): one callable, an action per job; the answer's shape is the action's (see
  // SsoAction and the server's contract). Refusals carry details.reason (an sso-* code, or not-org-admin and the like).
  manageSso: call<SsoAction, Record<string, unknown>>("manageSso"),
  manageOrgPage: call<{ action: "get" | "save" | "publish" | "unpublish"; orgId: string; page?: unknown }, Record<string, unknown>>("manageOrgPage"),
  checkRevenueEvent: call<{ plan: string; currency: "EGP" | "USD" }, { sent: boolean; reason?: string; status?: number; validation?: { validationMessages?: Array<{ description: string; fieldPath?: string }> } | null }>("checkRevenueEvent"),
};

/**
 * Usernames (for people without email) map to a hidden email domain: must match functions/src/usernameDomain.ts, which
 * says why it must be a domain Darsi owns with no mail. `users.darsi.app` (not Darsi's) was used until 2026-11: accounts
 * there are moved by scripts/move-username-domain.mjs, and until then they still count as username logins and sign in.
 */
export const USERNAME_DOMAIN = "users.darsiai.org";
export const LEGACY_USERNAME_DOMAINS: readonly string[] = ["users.darsi.app"];
export const USERNAME_DOMAINS: readonly string[] = [USERNAME_DOMAIN, ...LEGACY_USERNAME_DOMAINS];
export const isUsernameEmail = (email: string | null | undefined) => typeof email === "string" && USERNAME_DOMAINS.some((d) => email.toLowerCase().endsWith(`@${d}`));
export const loginToEmail = (login: string) => (login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@${USERNAME_DOMAIN}`);
export const displayLogin = (email: string) => (isUsernameEmail(email) ? email.split("@")[0] : email);
