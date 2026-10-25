import type { Track } from "../content/types";
export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";
export interface Summary { lessonsDone: number; xp: number; avgAccuracy: number; lastActive: string | null; competencies: Record<string, number>; units: Record<string, number> }
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
  teach?: "primary" | "secondary" | "university";
  tracks?: Track[];
  weeklyLessons?: number;
  levels?: Partial<Record<Track, number>>;
  mustChangePassword?: boolean;
  active?: boolean;
  summary?: Summary;
  createdAt?: { seconds: number } | null;
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
  createdAt?: { seconds: number } | null;
  reviewedAt?: { seconds: number } | null;
}
export const isStaff = (r?: Role) => r === "orgAdmin" || r === "teacher" || r === "superadmin";
