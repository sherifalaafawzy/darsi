/**
 * Stacks and queues. Both keep things in a line; they differ only in which end things come out of. A stack takes from
 * the top, last in first out (undo, a pile of plates); a queue takes from the front, first in first out (the bank).
 */
export type Kind = "stack" | "queue";

/** Push (stack) or enqueue (queue): both add at the end. */
export const put = <T,>(items: T[], x: T): T[] => [...items, x];
/** Pop (stack: the newest) or dequeue (queue: the oldest). Nothing to take from an empty line. */
export function take<T>(kind: Kind, items: T[]): { item: T | undefined; rest: T[] } {
  if (!items.length) return { item: undefined, rest: items };
  return kind === "stack" ? { item: items[items.length - 1], rest: items.slice(0, -1) } : { item: items[0], rest: items.slice(1) };
}
/** The item that would come out next. */
export const peek = <T,>(kind: Kind, items: T[]) => (kind === "stack" ? items[items.length - 1] : items[0]);

/** A list of operations: a letter is put in, `null` takes one out. Returns what came out, in order. */
export function simulate(kind: Kind, ops: (string | null)[]): string[] {
  let items: string[] = [];
  const out: string[] = [];
  for (const op of ops) {
    if (op !== null) { items = put(items, op); continue; }
    const r = take(kind, items);
    if (r.item !== undefined) out.push(r.item);
    items = r.rest;
  }
  return out;
}

/** "What comes out?": the same operations for a stack and for a queue. */
export const PUZZLES: (string | null)[][] = [
  ["A", "B", "C", null, null, "D", null],
  ["K", "L", null, "M", "N", null, null],
  ["P", "Q", "R", "S", null, null, null],
];
/** Three answers to choose from: the right one, the other kind's, and the order things went in; `turn` moves the right one. */
export function choices(kind: Kind, ops: (string | null)[], turn = 0): string[][] {
  const right = simulate(kind, ops), other = simulate(kind === "stack" ? "queue" : "stack", ops);
  const n = right.length, order = (ops.filter((x) => x !== null) as string[]).slice(0, n);
  const cands = [right, other, order, [...right].reverse(), [...order].reverse()];
  const seen = new Set<string>(), out: string[][] = [];
  for (const c of cands) { const k = c.join(); if (!seen.has(k)) { seen.add(k); out.push(c); } if (out.length === 3) break; }
  const r = turn % out.length;
  return [...out.slice(r), ...out.slice(0, r)];
}
