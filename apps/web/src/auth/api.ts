import { call } from "../fb";
import type { Role } from "./types";
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
export type AccountRefusal = "recent-login" | "renewing" | "self-staff" | "self-org" | "superadmin" | "not-yours" | "missing";

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

export const api = {
  requestOrg: call<{ name: string; type: string; country: string; city: string; size?: number; contact?: string; reason?: string }, { orgId: string; status: string }>("requestOrg"),
  reviewOrg: call<{ orgId: string; approve: boolean; note?: string }, { status: string; inviteCodes?: { teacher: string; student: string } }>("reviewOrg"),
  joinOrg: call<{ code: string }, { orgId: string; role: Role; orgName: string }>("joinOrg"),
  regenerateInviteCode: call<{ orgId: string; role: "teacher" | "student" }, { code: string }>("regenerateInviteCode"),
  createMembers: call<{ orgId: string; members: MemberInput[]; passwordLength?: number; mustChangePassword?: boolean; defaultRole?: Role }, { results: MemberResult[] }>("createMembers"),
  setMemberRole: call<{ orgId: string; uid: string; role: Role }, { ok: boolean }>("setMemberRole"),
  resetMemberPassword: call<{ orgId: string; uid: string }, { password: string; login: string }>("resetMemberPassword"),
  removeMember: call<{ orgId: string; uid: string }, { ok: boolean }>("removeMember"),
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
  updateOrg: call<Partial<OrgDetails> & { orgId: string; status?: "active" | "rejected" }, { ok: boolean }>("updateOrg"),
  deleteOrg: call<{ orgId: string; confirm: string }, { members: number; units: number }>("deleteOrg"),
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
  fillSeats: call<{ orgId: string }, { given: number }>("fillSeats"),
  checkRevenueEvent: call<{ plan: string; currency: "EGP" | "USD" }, { sent: boolean; reason?: string; status?: number; validation?: { validationMessages?: Array<{ description: string; fieldPath?: string }> } | null }>("checkRevenueEvent"),
};

/** Usernames (for people without email) map to a hidden email domain — must match functions/src/passwords.ts. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const loginToEmail = (login: string) => (login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@${USERNAME_DOMAIN}`);
export const displayLogin = (email: string) => (email.endsWith(`@${USERNAME_DOMAIN}`) ? email.split("@")[0] : email);
