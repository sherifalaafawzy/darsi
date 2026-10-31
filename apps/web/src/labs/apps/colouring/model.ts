/**
 * Exam slots as graph colouring. Each exam is a dot; two exams are joined if some pupil takes both, so they can't be in
 * the same slot. Giving each exam a slot is colouring the dots so that joined dots differ. Greedy colouring (exams in
 * list order, each takes the first slot that is free of clashes) is quick but can use more slots than needed;
 * DSatur (always colour the exam with the most different slots among its neighbours next) usually does better. Exams that
 * all clash with each other (a clique) prove that fewer slots are impossible.
 */
export const EXAMS = ["maths", "english", "science", "arabic", "history", "geography", "art", "french"] as const;
export type Exam = (typeof EXAMS)[number];

/**
 * Pupils and the exams each one takes (indexes into EXAMS). Greedy in list order needs 4 slots; 3 are enough, and
 * Omar's three exams (maths, Arabic, French) all clash, so fewer than 3 is impossible.
 */
export const PUPILS: { id: string; exams: number[] }[] = [
  { id: "sami", exams: [1, 2] },
  { id: "hala", exams: [4, 5, 6] },
  { id: "omar", exams: [0, 3, 7] },
  { id: "dina", exams: [3, 6] },
  { id: "nadia", exams: [2, 7] },
  { id: "tarek", exams: [2, 3, 7] },
];

/** Where each exam is drawn (map units 0–10). */
export const SPOTS: [number, number][] = [
  [2, 8.4], [5, 8.9], [8, 8.4], [8.7, 5], [8, 1.6], [5, 1.1], [2, 1.6], [1.3, 5],
];

/** The clashes: pairs of exams that share at least one pupil. */
export function edges(groups: readonly { exams: number[] }[], n = EXAMS.length): [number, number][] {
  const seen = new Set<number>(), out: [number, number][] = [];
  for (const g of groups) for (const a of g.exams) for (const b of g.exams) if (a < b && !seen.has(a * n + b)) { seen.add(a * n + b); out.push([a, b]); }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}
export const neighbours = (es: readonly [number, number][], n = EXAMS.length) => {
  const nb: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of es) { nb[a].push(b); nb[b].push(a); }
  return nb;
};

/** Pairs of joined exams given the same slot. Slots are 1, 2, 3…; 0 means no slot yet. */
export const clashes = (es: readonly [number, number][], slots: readonly number[]) => es.filter(([a, b]) => slots[a] > 0 && slots[a] === slots[b]);
export const used = (slots: readonly number[]) => new Set(slots.filter((s) => s > 0)).size;

const firstFree = (nb: number[], slots: readonly number[]) => { const taken = new Set(nb.map((j) => slots[j])); let s = 1; while (taken.has(s)) s++; return s; };

/** Greedy in list order: each step gives one exam the first slot free of clashes. Every state on the way. */
export function greedy(es: readonly [number, number][], n = EXAMS.length, order = Array.from({ length: n }, (_, i) => i)): { exam: number; slots: number[] }[] {
  const nb = neighbours(es, n), slots = new Array<number>(n).fill(0), out: { exam: number; slots: number[] }[] = [];
  for (const v of order) { slots[v] = firstFree(nb[v], slots); out.push({ exam: v, slots: slots.slice() }); }
  return out;
}

/** DSatur: next, the exam whose neighbours already use the most different slots (ties: most clashes, then list order). */
export function dsatur(es: readonly [number, number][], n = EXAMS.length): { exam: number; slots: number[] }[] {
  const nb = neighbours(es, n), slots = new Array<number>(n).fill(0), out: { exam: number; slots: number[] }[] = [];
  for (let k = 0; k < n; k++) {
    let pick = -1, ps = -1, pd = -1;
    for (let v = 0; v < n; v++) {
      if (slots[v]) continue;
      const sat = new Set(nb[v].map((j) => slots[j]).filter(Boolean)).size, deg = nb[v].length;
      if (sat > ps || (sat === ps && deg > pd)) { pick = v; ps = sat; pd = deg; }
    }
    slots[pick] = firstFree(nb[pick], slots);
    out.push({ exam: pick, slots: slots.slice() });
  }
  return out;
}

/** The fewest slots possible, by trying 1, 2, 3… slots with backtracking (fine for a school's handful of exams). */
export function fewest(es: readonly [number, number][], n = EXAMS.length): { k: number; slots: number[] } {
  const nb = neighbours(es, n);
  for (let k = 1; k <= n; k++) {
    const slots = new Array<number>(n).fill(0);
    const go = (v: number): boolean => {
      if (v === n) return true;
      for (let s = 1; s <= k; s++) if (nb[v].every((j) => slots[j] !== s)) { slots[v] = s; if (go(v + 1)) return true; slots[v] = 0; }
      return false;
    };
    if (go(0)) return { k, slots };
  }
  return { k: n, slots: Array.from({ length: n }, (_, i) => i + 1) };
}

/** The largest group of exams that all clash with each other: they need that many different slots. */
export function biggestClique(es: readonly [number, number][], n = EXAMS.length): number[] {
  const nb = neighbours(es, n).map((x) => new Set(x));
  let best: number[] = [];
  const grow = (clique: number[], cands: number[]) => {
    if (clique.length > best.length) best = clique;
    cands.forEach((v, i) => grow([...clique, v], cands.slice(i + 1).filter((u) => nb[v].has(u))));
  };
  grow([], Array.from({ length: n }, (_, i) => i));
  return best;
}
