import type { Profile } from "../auth/types";

/**
 * Projects waiting for a review on the staff lists (/teach, /admin): the count the submission triggers keep on each
 * profile (functions/src/waiting.ts), so the lists, which read their people's profiles anyway, need no extra reads.
 */
export const waitingOf = (m: Pick<Profile, "projectsWaiting">) => (typeof m.projectsWaiting === "number" && m.projectsWaiting > 0 ? m.projectsWaiting : 0);
/** Everyone's waiting projects together, and how many people sent them. */
export function waitingTotals(people: Pick<Profile, "projectsWaiting">[]) {
  return { projects: people.reduce((a, m) => a + waitingOf(m), 0), people: people.filter((m) => waitingOf(m) > 0).length };
}
/** The "To review" sort: people with the most projects waiting first, then by name. */
export const byWaiting = (a: Pick<Profile, "projectsWaiting" | "name">, b: Pick<Profile, "projectsWaiting" | "name">) =>
  waitingOf(b) - waitingOf(a) || (a.name ?? "").localeCompare(b.name ?? "");
