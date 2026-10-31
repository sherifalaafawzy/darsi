/**
 * A small school timetable as a constraint problem. Each lesson needs a period (its domain: the periods still
 * possible). Rules shrink domains: a teacher can't be in two places at once, a class can't have two lessons at once,
 * and some people or rooms are away. Propagation removes impossible periods; when it can't decide, search guesses the
 * lesson with the fewest periods left, propagates again, and undoes the guess at a dead end. This is how CP-SAT and
 * other constraint solvers work.
 */
export const PERIODS = 4;
export const CLASSES = ["5A", "5B", "6A"] as const;
export type Klass = (typeof CLASSES)[number];
export type Subject = "maths" | "science" | "english" | "art";
export type Teacher = "musa" | "huda" | "ali" | "rana";
export interface Lesson { klass: Klass; subject: Subject; teacher: Teacher }

export const LESSONS: Lesson[] = [
  { klass: "5A", subject: "maths", teacher: "musa" },
  { klass: "5A", subject: "science", teacher: "huda" },
  { klass: "5A", subject: "english", teacher: "ali" },
  { klass: "5A", subject: "art", teacher: "rana" },
  { klass: "5B", subject: "maths", teacher: "musa" },
  { klass: "5B", subject: "science", teacher: "huda" },
  { klass: "5B", subject: "english", teacher: "ali" },
  { klass: "5B", subject: "art", teacher: "rana" },
  { klass: "6A", subject: "maths", teacher: "musa" },
  { klass: "6A", subject: "science", teacher: "huda" },
  { klass: "6A", subject: "english", teacher: "ali" },
  { klass: "6A", subject: "art", teacher: "rana" },
];

/** Rules that remove periods from some lessons before the search starts (for a teacher, a subject, a class or one
 *  lesson). Periods are 0-based here. */
export interface Rule { id: string; teacher?: Teacher; subject?: Subject; klass?: Klass; allowed: number[] }
export const applies = (r: Rule, l: Lesson) => (!r.teacher || r.teacher === l.teacher) && (!r.subject || r.subject === l.subject) && (!r.klass || r.klass === l.klass);
export const RULES: Rule[] = [
  { id: "huda", teacher: "huda", allowed: [0, 1, 2] }, // Ms Huda leaves after period 3
  { id: "test", klass: "6A", subject: "maths", allowed: [0] }, // 6A's maths test is in period 1
  { id: "art", subject: "art", allowed: [0, 1, 3] }, // the art room holds an exam in period 3
  { id: "lab", subject: "science", allowed: [1, 2, 3] }, // the lab is busy in period 1
];
/** With these two, propagation alone can't finish: search guesses 8 times and meets 3 dead ends. Adding "art" makes it
 *  easier (2 guesses); adding "lab" makes it impossible (science needs 3 periods but only 2 are left). */
export const DEFAULT_RULES = ["huda", "test"];
export const rulesOf = (ids: readonly string[]) => RULES.filter((r) => ids.includes(r.id));

/** Two lessons clash if they share a teacher or a class. */
export const clash = (a: Lesson, b: Lesson) => a.teacher === b.teacher || a.klass === b.klass;
export const neighbours = (lessons: readonly Lesson[]) => lessons.map((a, i) => lessons.flatMap((b, j) => (i !== j && clash(a, b) ? [j] : [])));

/** Domains as bit sets: bit p set = period p is still possible. */
export type Domains = number[];
export const has = (d: number, p: number) => (d >> p) & 1;
export const size = (d: number) => { let n = 0; for (let p = 0; p < PERIODS; p++) n += has(d, p); return n; };
export const only = (d: number) => { for (let p = 0; p < PERIODS; p++) if (d === 1 << p) return p; return -1; };
const ALL = (1 << PERIODS) - 1;

export type Step =
  | { kind: "rule"; rule: string; removed: [number, number][]; d: Domains; fixed: number[] }
  | { kind: "prune"; from: number; period: number; removed: [number, number][]; d: Domains; fixed: number[] }
  | { kind: "guess"; lesson: number; period: number; d: Domains; fixed: number[] }
  | { kind: "dead"; lesson: number; d: Domains; fixed: number[] }
  | { kind: "clash"; lesson: number; period: number; with: number; d: Domains; fixed: number[] }
  | { kind: "undo"; lesson: number; period: number; d: Domains; fixed: number[] }
  | { kind: "done"; d: Domains; fixed: number[] }
  | { kind: "none"; d: Domains; fixed: number[] };

export interface Trace { steps: Step[]; guesses: number; undos: number; removed: number; solution: number[] | null; capped: boolean }

/**
 * Solves the timetable, recording every step. `propagate`: remove impossible periods after each decision (otherwise
 * just try periods in order and check for clashes, plain backtracking). `fixed[i]` is the period lesson i is decided
 * for (−1: not yet).
 */
export function solve(lessons: readonly Lesson[], rules: readonly Rule[], propagate = true, maxSteps = 4000): Trace {
  const nb = neighbours(lessons), n = lessons.length, steps: Step[] = [];
  const t: Trace = { steps, guesses: 0, undos: 0, removed: 0, solution: null, capped: false };
  let d: Domains = new Array(n).fill(ALL);
  const none = () => new Array<number>(n).fill(-1);
  for (const rule of rules) {
    const mask = rule.allowed.reduce((m, p) => m | (1 << p), 0), removed: [number, number][] = [];
    d = d.map((x, i) => {
      if (!applies(rule, lessons[i])) return x;
      for (let p = 0; p < PERIODS; p++) if (has(x, p) && !(mask & (1 << p))) removed.push([i, p]);
      return x & mask;
    });
    if (removed.length) { t.removed += removed.length; steps.push({ kind: "rule", rule: rule.id, removed, d: d.slice(), fixed: none() }); }
  }
  const full = () => steps.length >= maxSteps;

  if (!propagate) {
    // Plain backtracking: lessons in order, periods in order, check the lessons already placed.
    const fixed = none();
    const go = (i: number): boolean => {
      if (full()) { t.capped = true; return false; }
      if (i === n) return true;
      for (let p = 0; p < PERIODS; p++) {
        if (!has(d[i], p)) continue;
        t.guesses++; fixed[i] = p;
        steps.push({ kind: "guess", lesson: i, period: p, d: d.slice(), fixed: fixed.slice() });
        const other = nb[i].find((j) => fixed[j] === p);
        if (other === undefined) { if (go(i + 1)) return true; if (t.capped) return false; }
        else steps.push({ kind: "clash", lesson: i, period: p, with: other, d: d.slice(), fixed: fixed.slice() });
        fixed[i] = -1; t.undos++;
        steps.push({ kind: "undo", lesson: i, period: p, d: d.slice(), fixed: fixed.slice() });
      }
      return false;
    };
    const ok = go(0);
    if (ok) { t.solution = fixed.slice(); steps.push({ kind: "done", d: d.slice(), fixed }); }
    else if (!t.capped) steps.push({ kind: "none", d: d.slice(), fixed: none() });
    return t;
  }

  /** Each lesson with one period left takes it away from its neighbours, until nothing changes. False on a dead end. */
  const settle = (dom: Domains, queue: number[]): boolean => {
    const done = new Set<number>();
    for (let i = 0; i < n; i++) if (only(dom[i]) >= 0 && !queue.includes(i)) queue.push(i);
    while (queue.length) {
      const i = queue.shift()!;
      if (done.has(i)) continue;
      done.add(i);
      const p = only(dom[i]);
      if (p < 0) continue;
      const removed: [number, number][] = [];
      for (const j of nb[i]) if (has(dom[j], p)) { dom[j] &= ~(1 << p); removed.push([j, p]); if (only(dom[j]) >= 0) queue.push(j); }
      if (removed.length) { t.removed += removed.length; steps.push({ kind: "prune", from: i, period: p, removed, d: dom.slice(), fixed: fixedOf(dom) }); }
      const empty = removed.find(([j]) => dom[j] === 0);
      if (empty) { steps.push({ kind: "dead", lesson: empty[0], d: dom.slice(), fixed: fixedOf(dom) }); return false; }
    }
    return true;
  };
  const fixedOf = (dom: Domains) => dom.map(only);
  const go = (dom: Domains): Domains | null => {
    if (full()) { t.capped = true; return null; }
    // The undecided lesson with the fewest periods left (the most constrained one first).
    let pick = -1;
    for (let i = 0; i < n; i++) if (size(dom[i]) > 1 && (pick < 0 || size(dom[i]) < size(dom[pick]))) pick = i;
    if (pick < 0) return dom;
    for (let p = 0; p < PERIODS; p++) {
      if (!has(dom[pick], p)) continue;
      const next = dom.slice(); next[pick] = 1 << p;
      t.guesses++;
      steps.push({ kind: "guess", lesson: pick, period: p, d: next.slice(), fixed: fixedOf(next) });
      if (settle(next, [pick])) { const res = go(next); if (res) return res; if (t.capped) return null; }
      t.undos++;
      steps.push({ kind: "undo", lesson: pick, period: p, d: dom.slice(), fixed: fixedOf(dom) });
    }
    return null;
  };
  const start = d.slice();
  if (start.some((x) => x === 0)) { steps.push({ kind: "dead", lesson: start.findIndex((x) => x === 0), d: start, fixed: fixedOf(start) }); steps.push({ kind: "none", d: start, fixed: fixedOf(start) }); return t; }
  const res = settle(start, []) ? go(start) : null;
  if (res) { t.solution = fixedOf(res); steps.push({ kind: "done", d: res, fixed: fixedOf(res) }); }
  else if (!t.capped) steps.push({ kind: "none", d: start, fixed: none() });
  return t;
}

/** True if no two clashing lessons share a period and every lesson keeps its rules. */
export function valid(lessons: readonly Lesson[], rules: readonly Rule[], periods: readonly number[]) {
  return lessons.every((l, i) => periods[i] >= 0 && periods[i] < PERIODS && rules.every((r) => !applies(r, l) || r.allowed.includes(periods[i])))
    && lessons.every((a, i) => lessons.every((b, j) => i === j || !clash(a, b) || periods[i] !== periods[j]));
}
