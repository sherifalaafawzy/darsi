/**
 * Tidy tables: one row per thing, one column per fact, one value per cell. A marks sheet as people often type it (the
 * class written once for several rows, "Total" rows in between, two marks in one cell) and three fixes. A computer
 * answers three questions the plain way a program would, so its answers are right only once the table is tidy.
 */
export type Fix = "fill" | "totals" | "split";
export const FIXES: Fix[] = ["fill", "totals", "split"];
export type ColId = "name" | "cls" | "marks" | "maths" | "science";
/** A cell: text, a number, two marks typed into one cell (text to a computer), or empty. */
export type Cell = string | number | readonly [number, number] | null;
export interface Row { cells: Cell[]; total: boolean; filled?: boolean }
export interface Table { cols: ColId[]; rows: Row[] }

/** Marks out of 20. Names are per language; the classes are the same two in both. */
export const PUPILS = [
  { cls: 0, maths: 14, science: 17 }, { cls: 0, maths: 11, science: 9 }, { cls: 0, maths: 18, science: 15 },
  { cls: 1, maths: 12, science: 16 }, { cls: 1, maths: 16, science: 12 }, { cls: 1, maths: 9, science: 14 },
];
export const OUT_OF = 20;

/** The sheet as typed: the class only on each group's first row, a Total row after each class, "maths / science" in one cell. */
export function messy(names: string[], classes: [string, string], totalWord: string): Table {
  const rows: Row[] = [];
  for (const c of [0, 1]) {
    const group = PUPILS.map((p, i) => ({ ...p, name: names[i] })).filter((p) => p.cls === c);
    group.forEach((p, j) => rows.push({ cells: [p.name, j === 0 ? classes[c] : null, [p.maths, p.science]], total: false }));
    rows.push({ cells: [totalWord, null, [group.reduce((a, p) => a + p.maths, 0), group.reduce((a, p) => a + p.science, 0)]], total: true });
  }
  return { cols: ["name", "cls", "marks"], rows };
}

/** Applies the chosen fixes (in a fixed order, so the result doesn't depend on the order they were tapped). */
export function tidy(t: Table, on: ReadonlySet<Fix>): Table {
  let cols = [...t.cols], rows = t.rows.map((r) => ({ ...r, cells: [...r.cells] }));
  if (on.has("fill")) {
    // "Fill down": an empty class cell takes the class above it, the way a spreadsheet does. Total rows get one too.
    const c = cols.indexOf("cls");
    rows.forEach((r, i) => { if (r.cells[c] === null && i > 0) { r.cells[c] = rows[i - 1].cells[c]; r.filled = true; } });
  }
  if (on.has("totals")) rows = rows.filter((r) => !r.total);
  if (on.has("split")) {
    const m = cols.indexOf("marks");
    cols = [...cols.slice(0, m), "maths", "science", ...cols.slice(m + 1)];
    rows = rows.map((r) => { const pair = r.cells[m] as readonly [number, number]; return { ...r, cells: [...r.cells.slice(0, m), pair[0], pair[1], ...r.cells.slice(m + 1)] }; });
  }
  return { cols, rows };
}

/** What a computer sees in a column: numbers only if every filled cell is a number. */
export function typeOf(t: Table, col: ColId): "number" | "text" {
  const i = t.cols.indexOf(col);
  return t.rows.every((r) => r.cells[i] === null || typeof r.cells[i] === "number") ? "number" : "text";
}
export const emptyCells = (t: Table) => t.rows.reduce((n, r) => n + r.cells.filter((c) => c === null).length, 0);

export type Answer = { value: number | string | null; right: boolean };
/**
 * The three questions, answered as a program would: count the rows that say 5B, average the maths column, find the
 * row with the top science mark. Null when it can't (the marks are text). `right` compares with the true answer.
 */
export function answers(t: Table, classes: [string, string], names: string[]): { count: Answer; average: Answer; best: Answer } {
  const col = (c: ColId) => t.cols.indexOf(c);
  const count = t.rows.filter((r) => r.cells[col("cls")] === classes[1]).length;
  const trueCount = PUPILS.filter((p) => p.cls === 1).length;
  const maths = col("maths") >= 0 && typeOf(t, "maths") === "number" ? t.rows.map((r) => r.cells[col("maths")] as number) : null;
  const average = maths ? maths.reduce((a, b) => a + b, 0) / maths.length : null;
  const trueAverage = PUPILS.reduce((a, p) => a + p.maths, 0) / PUPILS.length;
  let best: string | null = null;
  if (col("science") >= 0 && typeOf(t, "science") === "number") {
    let top = -Infinity;
    for (const r of t.rows) if ((r.cells[col("science")] as number) > top) { top = r.cells[col("science")] as number; best = r.cells[col("name")] as string; }
  }
  const trueBest = names[PUPILS.reduce((b, p, i) => (p.science > PUPILS[b].science ? i : b), 0)];
  return {
    count: { value: count, right: count === trueCount },
    average: { value: average, right: average !== null && Math.abs(average - trueAverage) < 1e-9 },
    best: { value: best, right: best === trueBest },
  };
}
