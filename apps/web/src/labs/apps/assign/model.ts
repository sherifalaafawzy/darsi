/**
 * The assignment problem: one teacher per class, each pair with a score for how well it suits (0–9). First come, first
 * served lets each teacher in turn take their favourite free class; the Hungarian method finds the best total. It works
 * on shortfalls (9 − score) and keeps the best answer unchanged while it makes zeros: subtract each row's smallest
 * number, then each column's; if one zero per row and column can be chosen, those pairs are the answer. If not, cover
 * every zero with as few lines as possible, take the smallest uncovered number off the uncovered cells (adding it where
 * two lines cross), and look again.
 */
export const TEACHERS = ["amina", "karim", "leila", "yusuf", "zainab"] as const;
export const CLASSES = ["maths5", "science6", "english7", "history8", "art9"] as const;
export type Teacher = (typeof TEACHERS)[number];
export type Klass = (typeof CLASSES)[number];
export const TOP = 9;

/** How well each teacher suits each class, 0–9 (rows: teachers, columns: classes). */
export const SCORES: number[][] = [
  [9, 8, 6, 6, 4], // Amina: good at everything, loves maths
  [9, 2, 1, 2, 0], // Karim: really only maths
  [6, 9, 5, 3, 2], // Leila: science
  [4, 7, 8, 6, 3], // Yusuf: English, some science
  [2, 3, 5, 8, 7], // Zainab: history and art
];

export const total = (scores: number[][], pairs: readonly number[]) => pairs.reduce((s, c, r) => s + (c >= 0 ? scores[r][c] : 0), 0);

/** Each teacher in turn takes the best-scoring class still free. pairs[teacher] = class. */
export function firstCome(scores: number[][]): number[] {
  const free = new Set(scores[0].map((_, c) => c)), pairs: number[] = [];
  for (const row of scores) {
    let pick = -1;
    for (const c of free) if (pick < 0 || row[c] > row[pick]) pick = c;
    pairs.push(pick); free.delete(pick);
  }
  return pairs;
}

export interface Step {
  kind: "start" | "rows" | "cols" | "cover" | "adjust" | "done";
  m: number[][];
  coverRows: boolean[]; coverCols: boolean[];
  /** The zeros chosen so far, as pairs[row] = column (−1: none). */
  pairs: number[];
  /** "adjust": the smallest uncovered number; "cover": the number of lines. */
  n?: number;
}

/** The most zeros with no two in a row or column (augmenting paths), and the fewest lines that cover all zeros (König). */
function matchAndCover(m: number[][]) {
  const n = m.length, rowOf = new Array<number>(n).fill(-1), colOf = new Array<number>(n).fill(-1);
  const tryRow = (r: number, seen: boolean[]): boolean => {
    for (let c = 0; c < n; c++) if (m[r][c] === 0 && !seen[c]) {
      seen[c] = true;
      if (rowOf[c] < 0 || tryRow(rowOf[c], seen)) { rowOf[c] = r; colOf[r] = c; return true; }
    }
    return false;
  };
  for (let r = 0; r < n; r++) tryRow(r, new Array(n).fill(false));
  // From each row without a chosen zero, follow zeros to columns and chosen zeros back to rows.
  const zr = new Array<boolean>(n).fill(false), zc = new Array<boolean>(n).fill(false);
  const visit = (r: number) => {
    if (zr[r]) return; zr[r] = true;
    for (let c = 0; c < n; c++) if (m[r][c] === 0 && !zc[c]) { zc[c] = true; if (rowOf[c] >= 0) visit(rowOf[c]); }
  };
  for (let r = 0; r < n; r++) if (colOf[r] < 0) visit(r);
  return { pairs: colOf, coverRows: zr.map((v) => !v), coverCols: zc };
}

/** Every step of the Hungarian method on the shortfalls TOP − score, ending with the best pairs. */
export function hungarian(scores: number[][], top = TOP): Step[] {
  const n = scores.length, none = () => new Array<boolean>(n).fill(false), copy = (m: number[][]) => m.map((r) => r.slice());
  let m = scores.map((r) => r.map((v) => top - v));
  const steps: Step[] = [{ kind: "start", m: copy(m), coverRows: none(), coverCols: none(), pairs: new Array(n).fill(-1) }];
  m = m.map((r) => { const lo = Math.min(...r); return r.map((v) => v - lo); });
  steps.push({ kind: "rows", m: copy(m), coverRows: none(), coverCols: none(), pairs: new Array(n).fill(-1) });
  for (let c = 0; c < n; c++) { const lo = Math.min(...m.map((r) => r[c])); for (const r of m) r[c] -= lo; }
  steps.push({ kind: "cols", m: copy(m), coverRows: none(), coverCols: none(), pairs: new Array(n).fill(-1) });
  for (let guard = 0; guard < 100; guard++) {
    const { pairs, coverRows, coverCols } = matchAndCover(m);
    const lines = coverRows.filter(Boolean).length + coverCols.filter(Boolean).length;
    if (pairs.every((c) => c >= 0)) { steps.push({ kind: "done", m: copy(m), coverRows: none(), coverCols: none(), pairs }); break; }
    steps.push({ kind: "cover", m: copy(m), coverRows, coverCols, pairs, n: lines });
    let lo = Infinity;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!coverRows[r] && !coverCols[c]) lo = Math.min(lo, m[r][c]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!coverRows[r] && !coverCols[c]) m[r][c] -= lo;
      else if (coverRows[r] && coverCols[c]) m[r][c] += lo;
    }
    steps.push({ kind: "adjust", m: copy(m), coverRows, coverCols, pairs: new Array(n).fill(-1), n: lo });
  }
  return steps;
}

/** Tries every way (n! of them): only for checking the method on small tables. */
export function bruteBest(scores: number[][]): number {
  const n = scores.length, used = new Array<boolean>(n).fill(false);
  const go = (r: number): number => {
    if (r === n) return 0;
    let b = -Infinity;
    for (let c = 0; c < n; c++) if (!used[c]) { used[c] = true; b = Math.max(b, scores[r][c] + go(r + 1)); used[c] = false; }
    return b;
  };
  return go(0);
}
