/**
 * Who can have course results (/results): university teachers, whom a platform admin gives courses on /super/access
 * (courseAccess/{uid}). Schools' org admins and students never get a grant, and a school teacher's own students are
 * on /teach, so Me shows them no "Course results" link and /results sends them back to Me.
 * Pure, with no imports: Me (startup) may use it without pulling anything in.
 */
export const mayHaveResults = (role: string | null | undefined, teach: string | null | undefined) =>
  teach === "university" && (role === "learner" || role === "teacher");
/**
 * Has this grant's end passed? The server decides (courseResults answers `no-grant`); this keeps an ended grant from
 * looking live: /super/access says "Ended on …", and /results says the access ended instead of offering its courses.
 */
export const ended = (g: { until?: number | null }, now = Date.now()) => g.until != null && g.until <= now;
