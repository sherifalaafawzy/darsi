/**
 * Course access (out/project-work/PLAN.md): a platform admin lets a university teacher read the student results and
 * project submissions of chosen courses. courseAccess/{uid} holds the grant. Only the audited callables write one
 * (grantCourseAccess, revokeCourseAccess), and the results are read by the courseResults callable, which keeps the rows
 * of the grant's organizations: the rules refuse a grant written from here and every collection-group read of other
 * people's lessons and projects (functions/src/access.ts; firebase/firestore.rules "Course access").
 */
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { call } from "../fb";
import { api } from "../auth/api";

/** In a grant's `orgs`: people who belong to no organization (functions/src/access.ts NO_ORG). */
export const NO_ORG = "none";
/**
 * `orgs`: the organizations whose students the teacher may see (ids, or NO_ORG), fixed when the grant is saved: with
 * none chosen, the server stores the teacher's own organization of that moment. Absent or empty (a grant from before
 * they were stored) means nobody, until it is saved again. `until`: when the access ends (ms); absent or null is "until removed".
 */
export interface Grant { uid: string; units: string[]; orgs?: string[]; until?: number | null; name?: string; email?: string; grantedBy?: string }
export interface ResultRow { uid: string; lessonId: string; accuracy: number; completedAt?: string }
export interface FileRef { url: string; name: string; type?: string }
export interface StudentWork {
  id: string; uid: string; lessonId: string; stepId?: string; text: string; final?: boolean; explain?: string; aiUse?: string; name?: string;
  fileUrl?: string | null; fileName?: string | null; files?: FileRef[]; createdAt?: { seconds: number } | null;
}
/** `more`: the server reached a cap (2,000 results, 500 projects), so there may be rows this read didn't return. */
export interface CourseData { results: ResultRow[]; work: StudentWork[]; more?: boolean }

/** A stored end time as ms, whatever wrote it (the callable stores a number; a script may have stored a Timestamp). */
const untilOf = (v: unknown): number | null =>
  typeof v === "number" ? v : v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null;
const grantOf = (uid: string, d: Record<string, unknown> | undefined): Grant => {
  const { units, orgs, until, ...rest } = d ?? {};
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { ...(rest as Partial<Grant>), uid, units: list(units), ...(list(orgs).length ? { orgs: list(orgs) } : {}), until: untilOf(until) };
};
export { ended } from "./who";

/** The signed-in teacher's own grant (the rules let them read it, and nobody else's). */
export async function myGrant(uid: string): Promise<Grant | null> {
  const s = await getDoc(doc(db, "courseAccess", uid));
  return s.exists() ? grantOf(uid, s.data()) : null;
}

/**
 * A course's lesson results and project work, as the server lets this person see them: final projects first, then the
 * newest. A refusal (`no-grant`: the course isn't in the grant, or the grant ended) is thrown; staff/errors.ts words it.
 */
export async function courseResults(unitId: string): Promise<CourseData> {
  const r = await api.courseResults({ unitId });
  // The server sends a field a row doesn't have as null (JSON has no "absent"); the screens' types say absent.
  const rows = <T,>(v: unknown) => (Array.isArray(v) ? v : []).map((x) => Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, f]) => f !== null)) as T);
  const results = rows<ResultRow>(r.results), work = rows<StudentWork>(r.work);
  // The server sorts already; sorting again keeps the order right whatever answered.
  return { results, work: work.sort((a, b) => Number(!!b.final) - Number(!!a.final) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)), more: r.more === true };
}

/* ---------- Platform admin: grants ---------- */
export async function allGrants(): Promise<Grant[]> {
  return (await getDocs(collection(db, "courseAccess"))).docs.map((d) => grantOf(d.id, d.data()));
}
/** Every organization that can have students, by name: read once, for choosing whose students a grant covers. */
export async function allOrgs(): Promise<{ id: string; name: string }[]> {
  return (await getDocs(collection(db, "orgs"))).docs
    .map((d) => { const o = d.data() as { name?: unknown; status?: unknown }; return { id: d.id, name: String(o.name ?? ""), status: String(o.status ?? "") }; })
    .filter((o) => o.status !== "pending" && o.status !== "rejected")
    .map(({ id, name }) => ({ id, name: name || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * The account with this email, as Auth knows it (findAccount on the server; H1 in the security review), with whether
 * its email is verified. Refuses when more than one profile claims the email: one of them is not who they say.
 */
export class ClaimedEmail extends Error { constructor() { super("claimed"); } }
export async function findUser(email: string): Promise<{ uid: string; name: string; email: string; teach?: string; emailVerified: boolean } | null> {
  const { account, profiles } = await call<{ login: string }, { account: { uid: string; name: string; email: string; teach: string | null; emailVerified: boolean } | null; profiles: number }>("findAccount")({ login: email.trim().toLowerCase() });
  if (profiles > 1) throw new ClaimedEmail();
  return account ? { uid: account.uid, name: account.name, email: account.email, emailVerified: account.emailVerified, ...(account.teach ? { teach: account.teach } : {}) } : null;
}
/**
 * Gives or replaces a person's grant, through the audited callable (who gave it is the caller, as the server knows
 * them). No organizations: the key is left out, which the server reads as "their own organization".
 */
export const saveGrant = (g: Grant) =>
  api.grantCourseAccess({ uid: g.uid, units: g.units, ...(g.orgs?.length ? { orgs: g.orgs } : {}), until: g.until ?? null });
export const removeGrant = (uid: string) => api.revokeCourseAccess({ uid });
