import { call } from "../fb";
import type { Role } from "./types";

export interface MemberInput { name: string; email?: string; username?: string; role?: Role; group?: string; teacherEmail?: string; lang?: string }
export interface MemberResult { row: number; name: string; login: string; password?: string; uid?: string; status: "created" | "exists" | "error"; error?: string }

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
};

/** Usernames (for people without email) map to a hidden email domain — must match functions/src/passwords.ts. */
export const USERNAME_DOMAIN = "users.darsi.app";
export const loginToEmail = (login: string) => (login.includes("@") ? login.trim().toLowerCase() : `${login.trim().toLowerCase()}@${USERNAME_DOMAIN}`);
export const displayLogin = (email: string) => (email.endsWith(`@${USERNAME_DOMAIN}`) ? email.split("@")[0] : email);
