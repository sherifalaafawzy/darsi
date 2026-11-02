import { call } from "../fb";
import type { Role } from "./types";

export interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string }
export interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "error"; error?: string }

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
  passwordChanged: call<Record<string, never>, { ok: boolean }>("passwordChanged"),
  registerDevice: call<{ token: string; lang: PushLang; tz: string } & NotifyPrefs, { ok: true }>("registerDevice"),
  unregisterDevice: call<{ token: string }, { ok: true }>("unregisterDevice"),
  updateNotifyPrefs: call<{ tz: string } & NotifyPrefs, { ok: true }>("updateNotifyPrefs"),
  sendBroadcast: call<BroadcastInput, { id: string; results: BroadcastResults }>("sendBroadcast"),
  // Platform admins only (functions/src/platform.ts).
  createOrg: call<OrgDetails & { adminUid?: string }, { orgId: string }>("createOrg"),
  updateOrg: call<Partial<OrgDetails> & { orgId: string; status?: "active" | "rejected" }, { ok: boolean }>("updateOrg"),
  deleteOrg: call<{ orgId: string; confirm: string }, { members: number; units: number }>("deleteOrg"),
  setUserRole: call<{ uid: string; role: Role; orgId?: string | null }, { ok: boolean }>("setUserRole"),
  // Darsi Super (functions/src/billing.ts).
  savePlans: call<{ plans: unknown[]; economics: { usdPerCredit: number; egpPerUsd: number } }, { rev: number }>("savePlans"),
  grantCredits: call<{ uid: string; credits: number }, { ok: boolean }>("grantCredits"),
  grantSuper: call<{ uid: string; days: number; plan?: string }, { ok: boolean }>("grantSuper"),
  setOrgLicence: call<{ orgId: string; seats: number; days?: number; plan?: string }, { ok: boolean }>("setOrgLicence"),
  setSeat: call<{ orgId: string; uid: string; on: boolean }, { ok: boolean }>("setSeat"),
  fillSeats: call<{ orgId: string }, { given: number }>("fillSeats"),
  checkRevenueEvent: call<{ plan: string; currency: "EGP" | "USD" }, { sent: boolean; reason?: string; status?: number; validation?: { validationMessages?: Array<{ description: string; fieldPath?: string }> } | null }>("checkRevenueEvent"),
};

/** Usernames (for people without email) map to a hidden email domain — must match functions/src/passwords.ts. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const loginToEmail = (login: string) => (login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@${USERNAME_DOMAIN}`);
export const displayLogin = (email: string) => (email.endsWith(`@${USERNAME_DOMAIN}`) ? email.split("@")[0] : email);
