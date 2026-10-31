/**
 * The knapsack problem: a pickup truck takes supplies to a village school, but it can carry only so much. Each load
 * has a weight and a value (how much the school needs it). Greedy packing takes the best value per kilo first; it is
 * quick and often right, but not always. Dynamic programming finds the true best by solving every smaller truck first:
 * best(k items, room c) = the better of skipping item k, or taking it and filling the room left with the first k − 1.
 */
export interface Item { id: string; w: number; v: number }

/** Weights are in hundreds of kilos. */
export const ITEMS: Item[] = [
  { id: "solar", w: 6, v: 42 },
  { id: "desks", w: 5, v: 33 },
  { id: "books", w: 5, v: 32 },
  { id: "filter", w: 3, v: 15 },
  { id: "balls", w: 2, v: 8 },
  { id: "chalk", w: 1, v: 3 },
];
/** 1,000 kg: greedy packs the solar panels first and ends 5 points short of the best load. */
export const CAPACITY = 10;
export const MAX_CAPACITY = 20;

export const weight = (items: readonly Item[], pick: ReadonlySet<string>) => items.reduce((s, it) => s + (pick.has(it.id) ? it.w : 0), 0);
export const value = (items: readonly Item[], pick: ReadonlySet<string>) => items.reduce((s, it) => s + (pick.has(it.id) ? it.v : 0), 0);

/** Best value per kilo first; skip whatever no longer fits. Returns the order it looked at the items in, too. */
export function greedy(items: readonly Item[], cap: number) {
  const order = [...items].sort((a, b) => b.v / b.w - a.v / a.w || a.w - b.w);
  const pick = new Set<string>(), skipped: string[] = [];
  let room = cap;
  for (const it of order) { if (it.w <= room) { pick.add(it.id); room -= it.w; } else skipped.push(it.id); }
  return { pick, order: order.map((it) => it.id), skipped };
}

/** The dynamic programming table: table[k][c] = the best value using the first k items with room c. */
export function table(items: readonly Item[], cap: number): number[][] {
  const t = [new Array<number>(cap + 1).fill(0)];
  items.forEach((it, k) => {
    const prev = t[k], row = prev.slice();
    for (let c = it.w; c <= cap; c++) row[c] = Math.max(prev[c], prev[c - it.w] + it.v);
    t.push(row);
  });
  return t;
}

/** The best load, read back from the table: each cell that took its item, from the last row up. */
export function best(items: readonly Item[], cap: number) {
  const t = table(items, cap), pick = new Set<string>(), cells: [number, number][] = [];
  let c = cap;
  for (let k = items.length; k > 0; k--) {
    cells.push([k, c]);
    if (t[k][c] !== t[k - 1][c]) { pick.add(items[k - 1].id); c -= items[k - 1].w; }
  }
  cells.push([0, c]);
  return { pick, value: t[items.length][cap], table: t, cells };
}

/** Truck sizes (in hundreds of kilos) at which greedy packing is beaten by the best load. */
export const greedyMisses = (items: readonly Item[], upTo = MAX_CAPACITY) =>
  Array.from({ length: upTo }, (_, i) => i + 1).filter((c) => value(items, greedy(items, c).pick) < best(items, c).value);
