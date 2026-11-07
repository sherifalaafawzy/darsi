/**
 * Capstones (TECHNICAL.md "Capstones"): every track's level-3 course ends in a capstone unit whose milestones are built
 * with real, free tools on the learner's own computer, Colab or Codespaces. The starter repositories live in one GitHub
 * organisation (darsi-org): change STARTER_ORG here if it ever moves, and every unit's link follows.
 */
export const STARTER_ORG = "https://github.com/darsi-org";
/** A milestone's starter repository (ProjectStep.starterRepo is only the repository's name). */
export const starterUrl = (repo: string) => `${STARTER_ORG}/${repo}`;
/** A GitHub repository link as learners paste it: https://github.com/owner/repo, optionally .git or a trailing slash. */
export const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
/** The most extra links a capstone submission takes (Colab, a Space, a dashboard…). */
export const MAX_LINKS = 5;
/** darsi-check.json is small; anything bigger is not what the starter's check script writes. */
export const MAX_CHECK_BYTES = 100_000;

/**
 * One deterministic check checkCapstone ran (functions/src/capstoneCore.ts CheckResult): passed (true), not passed
 * (false), or not checked (null: GitHub couldn't be reached, which is neither a pass nor the learner's fault).
 */
export interface CapCheck { id: string; ok: boolean | null; en: string; ar: string }
/** The advisory AI review stored on a capstone submission (capstoneCore.ts AiReview). Only the function writes it. */
export interface AiReview {
  status: "done" | "unavailable" | "skipped";
  scores: { criterion: number; score: number; en: string; ar: string }[];
  summary: { en: string; ar: string }; next: { en: string; ar: string }; model?: string; usd?: number; at?: string;
  /** An automatic check failed, so the function cut every score to at most 1, whatever the model said. */
  capped?: boolean;
}
/** What checkCapstone answers. */
export interface CapResult { id: string; checks: CapCheck[]; aiReview: AiReview; queue: "teacher" | "staff" }
/**
 * config/capstone (saveCapstoneConfig, on /super/plans): AI reviews on or off, how many one learner may get a day
 * (perDay), how many the whole platform may pay for in a day (maxPerDay), and how many milestones one learner may send
 * in a day (callsPerDay, which also bounds the GitHub requests one account causes).
 */
export interface CapstoneConfig { ai: boolean; perDay: number; maxPerDay: number; callsPerDay: number }
export const CAPSTONE_DEFAULTS: CapstoneConfig = { ai: true, perDay: 5, maxPerDay: 300, callsPerDay: 20 };
/** The whole numbers saveCapstoneConfig accepts for each limit, lowest and highest. */
export const CAPSTONE_BOUNDS = { perDay: [0, 50], maxPerDay: [0, 100_000], callsPerDay: [1, 200] } as const;
/** The fields checkCapstone adds to a submission (users/{uid}/submissions; admin/data.ts Submission has the rest). */
export interface CapFields { capstone?: boolean; repo?: string | null; links?: string[]; checks?: CapCheck[]; aiReview?: AiReview; queue?: "teacher" | "staff" }
