/**
 * Sudoku as constraint solving. Every empty cell keeps a list of candidates (the digits still possible). Propagation:
 * a placed digit is removed from its row, column and box; a cell with one candidate left takes it ("only one left");
 * a digit with one place left in a row, column or box goes there ("only one place"). When propagation is stuck, search
 * guesses in the cell with the fewest candidates and undoes the guess if it leads to a cell with none. Plain
 * backtracking (no candidates) tries digits cell by cell and needs far more guesses.
 */
export interface Puzzle { id: string; n: 4 | 9; grid: string }
/** "." is an empty cell. */
export const PUZZLES: Puzzle[] = [
  // 4×4: propagation alone solves every 4×4 sudoku with one answer; plain backtracking guesses 12 times.
  { id: "small", n: 4, grid: "...21...4..1...4" },
  // Propagation alone solves it; plain backtracking guesses 4,208 times.
  { id: "easy", n: 9, grid: "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79" },
  // Propagation gets stuck at 51 digits; search needs 4 guesses; plain backtracking 13,528.
  { id: "hard", n: 9, grid: "..9748...7.........2.1.9.....7...24..64.1.59..98...3.....8.3.2.........6...2759.." },
  // Only 17 givens: propagation solves it without a guess, plain backtracking gives up after 100,000 guesses.
  { id: "trap", n: 9, grid: ".......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6..." },
];

export const boxOf = (n: number) => (n === 4 ? 2 : 3);
export const parse = (p: Puzzle) => Array.from(p.grid, (ch) => (ch === "." ? 0 : Number(ch)));

/** For each cell, the other cells in its row, column and box. */
export function peers(n: number): number[][] {
  const b = boxOf(n);
  return Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n, br = r - (r % b), bc = c - (c % b), out = new Set<number>();
    for (let k = 0; k < n; k++) { out.add(r * n + k); out.add(k * n + c); }
    for (let dr = 0; dr < b; dr++) for (let dc = 0; dc < b; dc++) out.add((br + dr) * n + bc + dc);
    out.delete(i);
    return [...out];
  });
}
/** Every row, column and box as a list of cells. */
export function units(n: number): number[][] {
  const b = boxOf(n), out: number[][] = [];
  for (let r = 0; r < n; r++) out.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) out.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let br = 0; br < n; br += b) for (let bc = 0; bc < n; bc += b) {
    const u: number[] = [];
    for (let dr = 0; dr < b; dr++) for (let dc = 0; dc < b; dc++) u.push((br + dr) * n + bc + dc);
    out.push(u);
  }
  return out;
}

export const bit = (d: number) => 1 << (d - 1);
export const count = (m: number) => { let k = 0; while (m) { m &= m - 1; k++; } return k; };
export const digits = (m: number) => { const out: number[] = []; for (let d = 1; m >> (d - 1); d++) if (m & bit(d)) out.push(d); return out; };

/** One frame of the smart solver: the grid (0 = empty), every cell's candidates, and what just happened. */
export interface Frame {
  kind: "start" | "remove" | "single" | "hidden" | "guess" | "dead" | "undo" | "done" | "stuck";
  v: number[]; c: number[];
  cell?: number; digit?: number; removed?: number;
  /** "hidden": which kind of unit. */
  unit?: "row" | "col" | "box";
}
export interface SmartRun { frames: Frame[]; guesses: number; removed: number; solved: boolean }

/** Propagation, and search when it is stuck (unless `guess` is false: then it stops at "stuck"). */
export function smart(n: number, grid: readonly number[], guess = true, maxFrames = 3000): SmartRun {
  const P = peers(n), U = units(n), all = (1 << n) - 1, b = boxOf(n);
  const run: SmartRun = { frames: [], guesses: 0, removed: 0, solved: false };
  const push = (f: Omit<Frame, "v" | "c">, v: number[], c: number[]) => { if (run.frames.length < maxFrames) run.frames.push({ ...f, v: v.slice(), c: c.slice() }); };
  const unitKind = (k: number): Frame["unit"] => (k < n ? "row" : k < 2 * n ? "col" : "box");
  void b;

  /** Removes `d` from every peer of `i`; false if a peer is left with nothing. */
  const eliminate = (v: number[], c: number[], i: number) => {
    const d = v[i]; let removed = 0;
    for (const j of P[i]) if (!v[j] && c[j] & bit(d)) { c[j] &= ~bit(d); removed++; }
    return removed;
  };
  /** Runs the rules until nothing changes. Returns false at a dead end (a frame says where). */
  const propagate = (v: number[], c: number[], queue: number[]): boolean => {
    for (;;) {
      while (queue.length) {
        const i = queue.shift()!, k = eliminate(v, c, i);
        if (k) { run.removed += k; push({ kind: "remove", cell: i, digit: v[i], removed: k }, v, c); }
        const dead = P[i].find((j) => !v[j] && !c[j]);
        if (dead !== undefined) { push({ kind: "dead", cell: dead }, v, c); return false; }
      }
      const one = v.findIndex((x, i) => !x && count(c[i]) === 1);
      if (one >= 0) { v[one] = digits(c[one])[0]; c[one] = bit(v[one]); push({ kind: "single", cell: one, digit: v[one] }, v, c); queue.push(one); continue; }
      let placed = false;
      for (let k = 0; k < U.length && !placed; k++) for (let d = 1; d <= n && !placed; d++) {
        const u = U[k];
        if (u.some((i) => v[i] === d)) continue;
        const spots = u.filter((i) => !v[i] && c[i] & bit(d));
        if (!spots.length) { push({ kind: "dead", cell: u.find((i) => !v[i]) ?? u[0], digit: d, unit: unitKind(k) }, v, c); return false; }
        if (spots.length === 1) { const i = spots[0]; v[i] = d; c[i] = bit(d); push({ kind: "hidden", cell: i, digit: d, unit: unitKind(k) }, v, c); queue.push(i); placed = true; }
      }
      if (!placed) return true;
    }
  };

  const v = grid.slice(), c = v.map((x) => (x ? bit(x) : all));
  // The givens remove themselves from their rows, columns and boxes in one go.
  let first = 0;
  v.forEach((x, i) => { if (x) first += eliminate(v, c, i); });
  run.removed += first;
  push({ kind: "start", removed: first }, v, c);
  if (v.some((x, i) => !x && !c[i])) { push({ kind: "dead", cell: v.findIndex((x, i) => !x && !c[i]) }, v, c); return run; }

  const search = (v: number[], c: number[]): number[] | null => {
    if (run.frames.length >= maxFrames) return null;
    if (v.every(Boolean)) return v;
    if (!guess) { push({ kind: "stuck" }, v, c); return null; }
    let cell = -1;
    for (let i = 0; i < v.length; i++) if (!v[i] && (cell < 0 || count(c[i]) < count(c[cell]))) cell = i;
    for (const d of digits(c[cell])) {
      const v2 = v.slice(), c2 = c.slice();
      v2[cell] = d; c2[cell] = bit(d); run.guesses++;
      push({ kind: "guess", cell, digit: d }, v2, c2);
      if (propagate(v2, c2, [cell])) { const res = search(v2, c2); if (res) return res; if (!guess) return null; }
      push({ kind: "undo", cell, digit: d }, v, c);
    }
    return null;
  };
  const ok = propagate(v, c, []) ? search(v, c) : null;
  if (ok) { run.solved = true; push({ kind: "done" }, ok, ok.map((x) => bit(x))); }
  return run;
}

/**
 * Plain backtracking: cells in order, digits 1 to n, keep a digit if no peer has it. Returns the moves as numbers
 * (cell × 16 + digit, digit 0 = rubbed out) so even a long search replays cheaply.
 */
export function plain(n: number, grid: readonly number[], maxMoves = 200_000) {
  const P = peers(n), v = grid.slice(), empty = v.flatMap((x, i) => (x ? [] : [i])), moves: number[] = [];
  let guesses = 0, capped = false;
  const go = (k: number): boolean => {
    if (k === empty.length) return true;
    const i = empty[k];
    for (let d = 1; d <= n; d++) {
      if (P[i].some((j) => v[j] === d)) continue;
      if (moves.length >= maxMoves) { capped = true; return false; }
      v[i] = d; guesses++; moves.push(i * 16 + d);
      if (go(k + 1)) return true;
      if (capped) return false;
      v[i] = 0; moves.push(i * 16);
    }
    return false;
  };
  const solved = go(0);
  return { moves, guesses, solved, capped, grid: v };
}

/** How many solutions a grid has, up to `limit` (a real puzzle has exactly one). */
export function solutions(n: number, grid: readonly number[], limit = 2): number {
  const P = peers(n), v = grid.slice();
  let found = 0;
  const go = (): void => {
    if (found >= limit) return;
    let cell = -1, best = 0;
    for (let i = 0; i < v.length; i++) if (!v[i]) {
      let m = (1 << n) - 1; for (const j of P[i]) if (v[j]) m &= ~bit(v[j]);
      if (cell < 0 || count(m) < count(best)) { cell = i; best = m; }
    }
    if (cell < 0) { found++; return; }
    for (const d of digits(best)) { v[cell] = d; go(); v[cell] = 0; }
  };
  go();
  return found;
}
