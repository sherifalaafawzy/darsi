/**
 * Recursion: a function that calls itself on a smaller problem until one is small enough to answer at once.
 * Factorial makes a chain of calls; Fibonacci a tree that repeats the same work many times; the Towers of Hanoi move
 * n discs in 2ⁿ − 1 moves by moving n − 1 out of the way, the biggest across, then the n − 1 back on top.
 */
export type Fn = "fact" | "fib";
export interface Call { id: number; n: number; parent: number | null; depth: number; value: number; children: number[] }
export type Ev = { t: "call"; id: number } | { t: "return"; id: number };

/** Every call, and the order they start and finish in. */
export function calls(fn: Fn, n: number): { calls: Call[]; events: Ev[] } {
  const all: Call[] = [], events: Ev[] = [];
  const go = (k: number, parent: number | null, depth: number): number => {
    const c: Call = { id: all.length, n: k, parent, depth, value: 0, children: [] };
    all.push(c); events.push({ t: "call", id: c.id });
    if (parent !== null) all[parent].children.push(c.id);
    if (fn === "fact") c.value = k <= 1 ? 1 : k * go(k - 1, c.id, depth + 1);
    else c.value = k <= 1 ? k : go(k - 1, c.id, depth + 1) + go(k - 2, c.id, depth + 1);
    events.push({ t: "return", id: c.id });
    return c.value;
  };
  go(n, null, 0);
  return { calls: all, events };
}

/** After the first k events: the calls still waiting (oldest first), and those that have answered. */
export function at(events: Ev[], k: number) {
  const stack: number[] = [], done = new Set<number>();
  for (const e of events.slice(0, k)) {
    if (e.t === "call") stack.push(e.id);
    else { stack.pop(); done.add(e.id); }
  }
  return { stack, done };
}

/** How many calls Fibonacci makes for n without remembering answers (it grows almost as fast as the answer). */
export function fibCalls(n: number): number {
  let a = 1, b = 1; // calls for 0 and 1
  for (let k = 2; k <= n; k++) [a, b] = [b, a + b + 1];
  return n === 0 ? a : b;
}
/** The same, remembering each answer the first time: n + 1 different calls. */
export const fibCallsRemembered = (n: number) => n + 1;

/** Positions for drawing a call tree: leaves side by side, each call above the middle of its own calls. */
export function layout(all: Call[]) {
  const x = new Array<number>(all.length);
  let next = 0;
  const place = (id: number): number => {
    const c = all[id];
    return (x[id] = c.children.length ? c.children.map(place).reduce((s, v) => s + v, 0) / c.children.length : next++);
  };
  if (all.length) place(0);
  return { x, width: Math.max(1, next), depth: Math.max(0, ...all.map((c) => c.depth)) + 1 };
}

/* ---------- Towers of Hanoi ---------- */

export type Pegs = number[][]; // bottom first; discs are 1 (smallest) … n
export const startPegs = (n: number): Pegs => [Array.from({ length: n }, (_, i) => n - i), [], []];
/** The moves that solve it: n − 1 discs out of the way, the biggest across, the n − 1 back on top. */
export function hanoi(n: number, from = 0, to = 2, via = 1): [number, number][] {
  return n === 0 ? [] : [...hanoi(n - 1, from, via, to), [from, to], ...hanoi(n - 1, via, to, from)];
}
/** A move, if it is allowed: a disc may only go onto an empty peg or a bigger disc. */
export function move(pegs: Pegs, from: number, to: number): Pegs | null {
  const disc = pegs[from][pegs[from].length - 1], top = pegs[to][pegs[to].length - 1];
  if (disc === undefined || from === to || (top !== undefined && top < disc)) return null;
  return pegs.map((p, i) => (i === from ? p.slice(0, -1) : i === to ? [...p, disc] : p));
}
export const solved = (pegs: Pegs, n: number) => pegs[2].length === n;
export const fewestMoves = (n: number) => 2 ** n - 1;
