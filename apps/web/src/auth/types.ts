import type { TeachPlace, Track } from "../content/types";
export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";
/**
 * users/{uid}.summary, written by onProgressWrite (functions/src/summary.ts). The optional fields arrived in 2026-11:
 * an older summary gains them at the person's next finished lesson.
 */
export interface Summary {
  lessonsDone: number; xp: number; avgAccuracy: number; lastActive: string | null;
  /** Lessons per competency, and their accuracy summed (divide by the count for the average). */
  competencies: Record<string, number>; compAcc?: Record<string, number>;
  units: Record<string, number>;
  tracks?: Record<string, { n: number; acc: number; sec: number }>;
  seconds?: number;
  weeks?: Record<string, number>;
  lastLessonAt?: string | null;
}
export interface Profile {
  uid: string;
  name: string;
  email: string;
  username?: string | null;
  role: Role;
  orgId?: string | null;
  group?: string | null;
  teacherId?: string | null;
  lang?: string;
  /** Where this teacher teaches. Stored on users/{uid}; the rules already allow `teach` and do not constrain its value. */
  teach?: TeachPlace;
  tracks?: Track[];
  weeklyLessons?: number;
  levels?: Partial<Record<Track, number>>;
  mustChangePassword?: boolean;
  active?: boolean;
  summary?: Summary;
  createdAt?: { seconds: number } | null;
  /** Darsi Super, mirrored from the claims by the functions (billing.writeClaims); a seat in the org's licence. */
  plan?: string | null;
  planUntil?: number | null;
  planSource?: "subscription" | "org" | null;
  superSeat?: boolean;
}
export interface Org {
  id: string;
  name: string;
  type: string;
  country?: string;
  city?: string;
  status: "pending" | "active" | "rejected";
  createdBy: string;
  inviteCodes?: { teacher: string; student: string };
  memberCount?: number;
  size?: number | null;
  contact?: string;
  reason?: string;
  reviewNote?: string;
  /** The org's logo (a Storage path under orgs/{id}/brand/) and its version, +1 per change (OrgBranding). */
  brand?: { logo: string | null; v: number } | null;
  /** A Darsi Super licence: a plan, its seats and its end (ms). */
  licence?: { plan: string; seats: number; until: number } | null;
  createdAt?: { seconds: number } | null;
  reviewedAt?: { seconds: number } | null;
}
export const isStaff = (r?: Role) => r === "orgAdmin" || r === "teacher" || r === "superadmin";
