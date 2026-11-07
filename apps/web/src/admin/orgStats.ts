/**
 * An organization's people, summed up for its report (admin/OrgReport.tsx). Everything comes from users/*.summary,
 * which the org admin's member list already holds, so the report costs no extra reads. Pure, for the tests.
 */
import { scoredOf, type Profile } from "../auth/types";
import { isoWeek } from "../state/store";
import { strength } from "../content/competencies";
import type { Framework, StandardItem } from "../content/standards";

type Person = Profile & { lastActive?: string | null };
const DAY = 864e5;

/** The last time this person did anything: signed in (lastActive) or finished a lesson. */
export const lastSeen = (p: Person) => [p.lastActive, p.summary?.lastActive].filter((x): x is string => typeof x === "string").sort().pop() ?? null;
const daysAgo = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);

/**
 * Where a person stands: not started (no lesson yet), inactive (nothing for 14 days), needs support (average score
 * under 60% over 3 graded lessons or more: a project lesson is no score), or on track.
 */
export type Status = "notStarted" | "inactive" | "support" | "onTrack";
export function statusOf(p: Person, now = Date.now()): Status {
  const s = p.summary;
  if (!s?.lessonsDone) return "notStarted";
  if (daysAgo(lastSeen(p), now) > 14) return "inactive";
  if (scoredOf(s) >= 3 && s.avgAccuracy < 0.6) return "support";
  return "onTrack";
}

export interface Filter { audience: "students" | "teachers" | "all"; group?: string; teacher?: string }
export function filterPeople(members: Person[], f: Filter): Person[] {
  return members.filter((m) => (f.audience === "all" ? m.role === "student" || m.role === "teacher" : f.audience === "students" ? m.role === "student" : m.role === "teacher")
    && (!f.group || (m.group ?? "") === f.group) && (!f.teacher || m.teacherId === f.teacher));
}

export function totals(people: Person[], now = Date.now()) {
  // Accuracy over people with a graded lesson (FC-06).
  const withLessons = people.filter((p) => scoredOf(p.summary));
  const status: Record<Status, number> = { notStarted: 0, inactive: 0, support: 0, onTrack: 0 };
  for (const p of people) status[statusOf(p, now)]++;
  return {
    people: people.length,
    active7: people.filter((p) => daysAgo(lastSeen(p), now) < 7).length,
    active30: people.filter((p) => daysAgo(lastSeen(p), now) < 30).length,
    lessons: people.reduce((a, p) => a + (p.summary?.lessonsDone ?? 0), 0),
    seconds: people.reduce((a, p) => a + (p.summary?.seconds ?? 0), 0),
    avgAccuracy: withLessons.length ? withLessons.reduce((a, p) => a + (p.summary?.avgAccuracy ?? 0), 0) / withLessons.length : null,
    status,
  };
}

/** Lessons finished per ISO week, the last 12 weeks, oldest first. */
export function weekly(people: Person[], now = Date.now()) {
  return Array.from({ length: 12 }, (_, i) => {
    const wk = isoWeek(new Date(now - (11 - i) * 7 * DAY));
    return { week: wk, v: people.reduce((a, p) => a + (p.summary?.weeks?.[wk] ?? 0), 0) };
  });
}

export function byTrack(people: Person[]) {
  const out: Record<string, { people: number; lessons: number; graded: number; acc: number; sec: number }> = {};
  for (const p of people) for (const [tr, x] of Object.entries(p.summary?.tracks ?? {})) {
    const o = (out[tr] ??= { people: 0, lessons: 0, graded: 0, acc: 0, sec: 0 });
    // acc sums the graded lessons (g); summaries from before it have none, so all n count.
    o.people++; o.lessons += x.n; o.graded += x.g ?? x.n; o.acc += x.acc; o.sec += x.sec;
  }
  return Object.entries(out).map(([track, o]) => ({ track, people: o.people, lessons: o.lessons, avgAccuracy: o.graded ? o.acc / o.graded : null, seconds: o.sec }))
    .sort((a, b) => b.lessons - a.lessons);
}

/**
 * Per course people have lessons in: how many started it, and how many finished every lesson (lessons = the course's
 * lesson count, from the catalog). A course no longer in it has no known size: `completed` is null (shown "—"), not 0.
 */
export function byCourse(people: Person[], courses: Array<{ id: string; lessons: number }>) {
  const size = new Map(courses.map((c) => [c.id, c.lessons]));
  const ids = [...new Set(people.flatMap((p) => Object.keys(p.summary?.units ?? {})))];
  return ids.map((id) => {
    const done = people.map((p) => p.summary?.units?.[id] ?? 0), of = size.get(id);
    return { id, started: done.filter((n) => n > 0).length, completed: of ? done.filter((n) => n >= of).length : null };
  }).filter((c) => c.started > 0).sort((a, b) => b.started - a.started || a.id.localeCompare(b.id));
}

export function byGroup(people: Person[], now = Date.now()) {
  const groups = [...new Set(people.map((p) => p.group ?? ""))].sort();
  return groups.map((g) => ({ group: g, ...totals(people.filter((p) => (p.group ?? "") === g), now) }));
}

/** One person's evidence for a standard item: lessons that count for it, and their average score (if known). */
export function itemEvidence(p: Person, item: StandardItem) {
  let n = 0, acc = 0, accN = 0;
  for (const c of item.codes) {
    const k = p.summary?.competencies?.[c] ?? 0;
    n += k;
    const a = p.summary?.compAcc?.[c];
    if (k && typeof a === "number") { acc += a; accN += k; }
  }
  return { n, level: strength(n), acc: accN ? acc / accN : null };
}

/**
 * A framework's items over a group of people: how many have any evidence, how many are at each strength (0 not yet,
 * 1 emerging, 2 developing, 3 secure: lessons that count for it), and the average score on those lessons.
 */
export function standardsReport(people: Person[], fw: Framework) {
  return fw.items.map((item) => {
    const levels = [0, 0, 0, 0];
    let acc = 0, accN = 0;
    for (const p of people) {
      const e = itemEvidence(p, item);
      levels[e.level]++;
      if (e.acc !== null) { acc += e.acc; accN++; }
    }
    return { item, levels, reached: people.length - levels[0], avgAccuracy: accN ? acc / accN : null };
  });
}

/**
 * Each teacher: their own learning (lessons, score, the items of `fw` they are secure in, last seen) beside their
 * students' (how many, active this week, lessons, average score, how many need support).
 */
export function byTeacher(members: Person[], fw: Framework, now = Date.now()) {
  return members.filter((m) => m.role === "teacher").map((t) => {
    const students = members.filter((m) => m.role === "student" && m.teacherId === t.uid);
    const own = t.summary;
    return {
      teacher: t,
      own: { lessons: own?.lessonsDone ?? 0, avgAccuracy: scoredOf(own) ? own!.avgAccuracy : null, seconds: own?.seconds ?? 0,
        secure: fw.items.filter((it) => itemEvidence(t, it).level === 3).length, reached: fw.items.filter((it) => itemEvidence(t, it).n > 0).length, last: lastSeen(t) },
      students: totals(students, now),
    };
  }).sort((a, b) => (a.teacher.name ?? "").localeCompare(b.teacher.name ?? ""));
}
