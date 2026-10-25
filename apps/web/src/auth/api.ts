import { call } from "../fb";
import type { Role } from "./types";

export interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string }
export interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "error"; error?: string }

/** Push notifications (functions/src/notify.ts). Each device gets its own language; cats can each be switched off. */
export type PushLang = "en" | "ar";
export interface NotifyCats { reminders: boolean; reviews: boolean; staff: boolean; news: boolean }
/** hourLocal 0–23 (the reminder time on this phone's clock), weeklyGoal 1–14 lessons. */
export interface NotifyPrefs { hourLocal: number; cats: NotifyCats; weeklyGoal: number }
export type BroadcastAudience = { type: "all" } | { type: "org"; orgId: string } | { type: "role"; role: "student" | "teacher" | "orgAdmin" };
export interface BroadcastInput { title: Record<PushLang, string>; body: Record<PushLang, string>; link?: string; audience: BroadcastAudience }
/** FCM message id per language, or null where that send failed. */
export type BroadcastResults = Record<PushLang, string | null>;

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
};

/** Usernames (for people without email) map to a hidden email domain — must match functions/src/passwords.ts. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const loginToEmail = (login: string) => (login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@${USERNAME_DOMAIN}`);
export const displayLogin = (email: string) => (email.endsWith(`@${USERNAME_DOMAIN}`) ? email.split("@")[0] : email);
