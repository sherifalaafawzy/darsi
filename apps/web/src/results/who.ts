/**
 * Who can have course results (/results): university teachers, whom a platform admin gives courses on /super/access
 * (courseAccess/{uid}). Schools' org admins and students never get a grant, and a school teacher's own students are
 * on /teach, so Me shows them no "Course results" link and /results sends them back to Me.
 * Pure, with no imports: Me (startup) may use it without pulling anything in.
 */
export const mayHaveResults = (role: string | null | undefined, teach: string | null | undefined) =>
  teach === "university" && (role === "learner" || role === "teacher");
