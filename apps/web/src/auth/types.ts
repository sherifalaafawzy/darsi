import type { Audience, Stage, TeachPlace, Track } from "../content/types";
export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";
/**
 * users/{uid}.summary, written by onProgressWrite (functions/src/summary.ts). The optional fields arrived in 2026-11:
 * an older summary gains them at the person's next finished lesson.
 */
export interface Summary {
  lessonsDone: number; xp: number; avgAccuracy: number; lastActive: string | null;
  /**
   * Lessons with questions marked right or wrong: avgAccuracy, compAcc and tracks' acc are taken over these only (a
   * project lesson is done, not scored). Summaries from before 2026-11-06 lack it: count lessonsDone (scoredOf).
   */
  graded?: number;
  /** Graded lessons per competency, and their accuracy summed (divide by the count for the average). */
  competencies: Record<string, number>; compAcc?: Record<string, number>;
  units: Record<string, number>;
  /** Per track: lessons, accuracy summed over the `g` graded ones (older summaries: over all n), seconds. */
  tracks?: Record<string, { n: number; acc: number; sec: number; g?: number }>;
  seconds?: number;
  weeks?: Record<string, number>;
  lastLessonAt?: string | null;
}
/** How many of a summary's lessons have a score (graded): its accuracy means something only above 0. */
export const scoredOf = (s: Summary | null | undefined) => (s ? (s.graded ?? s.lessonsDone ?? 0) : 0);
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
  /**
   * The learning profile (state/sync.ts learningSync): onboarding's answers, kept here so a new device skips onboarding.
   * `teach` is where a teacher teaches; `learnAt` when the person last changed any of it (ms), so the newer copy wins.
   */
  onboarded?: boolean;
  teach?: TeachPlace;
  audience?: Audience;
  stage?: Stage;
  tracks?: Track[];
  weeklyLessons?: number;
  levels?: Partial<Record<Track, number>>;
  learnAt?: number;
  mustChangePassword?: boolean;
  active?: boolean;
  summary?: Summary;
  /** Projects waiting for a review, counted by the submission triggers (functions/src/waiting.ts); staff lists show it. */
  projectsWaiting?: number;
  createdAt?: { seconds: number } | null;
  /** Darsi Super, mirrored from the claims by the functions (billing.writeClaims); a seat in the org's licence. */
  plan?: string | null;
  planUntil?: number | null;
  planSource?: "subscription" | "org" | null;
  /** A card (Stripe) subscription that renews by itself ("on"), or whose renewal was cancelled while it still runs ("off"). */
  planRenewal?: "on" | "off" | null;
  superSeat?: boolean;
  /**
   * An account its organization made (a username login): `managedBy` is that organization's id on the profile itself;
   * `managed` is the same answer worked out by the server for a listMembers row (which never carries `managedBy`).
   */
  managedBy?: string | null;
  managed?: boolean;
  /**
   * Locked out. On the profile: when, by whom and why, and `byOrg` when an organization's admin did it (only that
   * organization restores it; without it a platform admin did). A listMembers row says only true or false.
   */
  suspended?: boolean | { at?: { seconds: number } | number | null; by?: string; reason?: string; byOrg?: string } | null;
  /**
   * School sign-in (functions/src/sso.ts). An account the school's sign-in made has `sso: true` and `createdBy: "sso"`,
   * no email, and `ssoEmail`, the address the school vouched for. Any account connected to a school sign-in has
   * `ssoLinkedAt` (ms). All server-written.
   */
  sso?: boolean;
  ssoEmail?: string | null;
  ssoLinkedAt?: number | null;
  createdBy?: string | null;
  /** The published privacy notice and terms versions this person accepted (acceptTerms; server-written). */
  terms?: { privacy?: number; terms?: number; at?: { seconds: number } | number | null } | null;
}
export interface Org {
  id: string;
  name: string;
  type: string;
  country?: string;
  city?: string;
  /** "suspended": its admins and teachers are frozen until a platform admin resumes it; "deleting": deleteOrg is part-way. */
  status: "pending" | "active" | "rejected" | "suspended" | "deleting";
  /** While suspended: when, by which platform admin and why (updateOrg). */
  suspended?: { at?: { seconds: number } | null; by?: string; reason?: string } | null;
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
  /** Which courses its members see (content/orgCourses.ts readOrgCourses): absent or { mode: "all" } is every course. setOrgCourses only. */
  courses?: unknown;
  /** Its own web address and whether Darsi's identity shows there (TECHNICAL.md "Organization sites"). setOrgSite only. */
  site?: { host: string; darsi: boolean } | null;
  /** Its school sign-in (manageSso): on or off, its slug (/signin?school=<slug>), and whether the school finder lists it. */
  sso?: { on?: boolean; slug?: string; listed?: boolean } | null;
  /** How many members school sign-in may make (a platform admin's; none: the licence's seats × 1.5, or 2,000). */
  ssoCeiling?: number | null;
  createdAt?: { seconds: number } | null;
  reviewedAt?: { seconds: number } | null;
}
export const isStaff = (r?: Role) => r === "orgAdmin" || r === "teacher" || r === "superadmin";
