/**
 * Which courses an organization's members see (TECHNICAL.md "Course visibility in organizations"). Its admins and
 * platform admins save the choice here; the security rules let no client write the org document's `courses` field,
 * since every member's phone reads it. The checks and the stored form are the web app's (shared/orgCourses.ts).
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, db, freshCaller, str } from "./admin.js";
import { checkOrgCourses, ORG_COURSES_MAX, type OrgCoursesProblem } from "./shared/orgCourses.js";

/** The English fallback for each refusal; the admin screens show their own words for the code (admin/refusals.ts). */
const WORDS: Record<OrgCoursesProblem, string> = {
  "courses-mode": "courses.mode must be \"all\" or \"chosen\".",
  "courses-list": "Each list of courses must be a list of course ids.",
  "courses-id": "A course id is not valid.",
  "courses-many": `A list can hold at most ${ORG_COURSES_MAX.list} courses.`,
  "courses-classes": `Courses can be chosen for at most ${ORG_COURSES_MAX.groups} classes.`,
  "courses-class": "A class name is not valid.",
  "courses-total": `At most ${ORG_COURSES_MAX.total} course choices in all. Give courses to all teachers or all students instead of class by class.`,
};

/** { orgId, courses }: { mode: "all" } or { mode: "chosen", teachers, students, groups }. Returns what was stored. */
export const setOrgCourses = onCall(async (req) => {
  const c = await freshCaller(req);
  const orgId = str(req.data?.orgId, 128);
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.", { reason: "no-org" });
  if (!(c.role === "superadmin" || (c.role === "orgAdmin" && c.orgId === orgId))) {
    throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  }
  const checked = checkOrgCourses(req.data?.courses);
  if ("problem" in checked) throw new HttpsError("invalid-argument", WORDS[checked.problem], { reason: checked.problem });
  const ref = db.doc(`orgs/${orgId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const courses = checked.value;
  await ref.update({ courses });
  // Counts, not the lists themselves: enough to see who narrowed what, without copying the lists into the log.
  await audit("setOrgCourses", c.uid, courses.mode === "all" ? { orgId, mode: "all" }
    : { orgId, mode: "chosen", teachers: courses.teachers.length, students: courses.students.length, groups: Object.keys(courses.groups).length });
  return { courses };
});
