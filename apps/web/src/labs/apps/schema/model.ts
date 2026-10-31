/**
 * Normalising: the same school facts stored as one wide table, two tables, or three.
 * Facts: each pupil's name and class; each class's teacher and the teacher's phone; each pupil's mark in each subject.
 * A fact stored in many rows is a repeat: it wastes space, an update that misses a row leaves copies that disagree,
 * and deleting rows can delete a fact nobody meant to delete. With one fact in one place, neither can happen.
 */
export type Col = "pupil_id" | "name" | "class" | "teacher" | "phone" | "subject" | "mark";
export type TableId = "sheet" | "pupils" | "classes" | "marks";
export type Value = string | number;
export interface Table { id: TableId; cols: Col[]; key: Col[]; links: Partial<Record<Col, TableId>>; rows: { cells: Partial<Record<Col, Value>>; gone?: boolean; changed?: Col }[] }
export type Step = 1 | 2 | 3;
export interface Facts { names: string[]; classes: [string, string]; teachers: [string, string]; subjects: [string, string] }

/** Pupils 1–3 are in the first class, 4–6 in the second. Marks out of 20: [first subject, second subject]. */
const MARKS = [[14, 17], [11, 9], [18, 15], [12, 16], [16, 12], [9, 14]];
export const PHONES: [string, string] = ["0803 555 0141", "0803 555 0178"];
export const NEW_PHONE = "0803 555 0199";
/** The facts, as "these columns decide that one" (a functional dependency). */
export const FACTS: [Col[], Col][] = [[["pupil_id"], "name"], [["pupil_id"], "class"], [["class"], "teacher"], [["class"], "phone"], [["pupil_id", "subject"], "mark"]];

export function tables(step: Step, f: Facts): Table[] {
  const pupil = (i: number) => ({ pupil_id: i + 1, name: f.names[i], class: f.classes[i < 3 ? 0 : 1] });
  const cls = (c: number) => ({ class: f.classes[c], teacher: f.teachers[c], phone: PHONES[c] });
  const ids = [0, 1, 2, 3, 4, 5];
  const marks: Table = { id: "marks", cols: ["pupil_id", "subject", "mark"], key: ["pupil_id", "subject"], links: { pupil_id: "pupils" }, rows: ids.flatMap((i) => [0, 1].map((s) => ({ cells: { pupil_id: i + 1, subject: f.subjects[s], mark: MARKS[i][s] } }))) };
  if (step === 1) return [{ id: "sheet", cols: ["pupil_id", "name", "class", "teacher", "phone", "subject", "mark"], key: ["pupil_id", "subject"], links: {},
    rows: ids.flatMap((i) => [0, 1].map((s) => ({ cells: { ...pupil(i), ...cls(i < 3 ? 0 : 1), subject: f.subjects[s], mark: MARKS[i][s] } }))) }];
  if (step === 2) return [{ id: "pupils", cols: ["pupil_id", "name", "class", "teacher", "phone"], key: ["pupil_id"], links: {}, rows: ids.map((i) => ({ cells: { ...pupil(i), ...cls(i < 3 ? 0 : 1) } })) }, marks];
  return [
    { id: "pupils", cols: ["pupil_id", "name", "class"], key: ["pupil_id"], links: { class: "classes" }, rows: ids.map((i) => ({ cells: pupil(i) })) },
    { id: "classes", cols: ["class", "teacher", "phone"], key: ["class"], links: {}, rows: [0, 1].map((c) => ({ cells: cls(c) })) },
    marks,
  ];
}

const live = (t: Table) => t.rows.filter((r) => !r.gone);
export const cells = (ts: Table[]) => ts.reduce((n, t) => n + live(t).length * t.cols.length, 0);
/** Repeated facts: for every fact a table holds, each row beyond the first that states it again. */
export function repeats(ts: Table[]) {
  let n = 0;
  for (const t of ts) for (const [by, what] of FACTS) {
    if (!by.every((c) => t.cols.includes(c)) || !t.cols.includes(what)) continue;
    const rows = live(t);
    n += rows.length - new Set(rows.map((r) => by.map((c) => r.cells[c]).join("|"))).size;
  }
  return n;
}
/** How many cells hold a class's teacher's phone number (all must change together). */
export const phoneCells = (ts: Table[], f: Facts, c = 0) => ts.reduce((n, t) => n + (t.cols.includes("phone") ? live(t).filter((r) => r.cells.class === f.classes[c]).length : 0), 0);

/** A hurried change of the first class's teacher's phone: only the first row holding it is updated. */
export function hurriedUpdate(ts: Table[], f: Facts): Table[] {
  let done = false;
  return ts.map((t) => ({ ...t, rows: t.rows.map((r) => {
    if (done || !t.cols.includes("phone") || r.cells.class !== f.classes[0] || r.gone) return r;
    done = true;
    return { ...r, cells: { ...r.cells, phone: NEW_PHONE }, changed: "phone" as Col };
  }) }));
}
/** The second class's pupils leave: their pupil rows and marks go; the classes table (if any) is left alone. */
export function leave(ts: Table[], f: Facts): Table[] {
  const gone = new Set(ts.flatMap((t) => (t.id === "classes" ? [] : t.rows.filter((r) => r.cells.class === f.classes[1]).map((r) => r.cells.pupil_id))));
  return ts.map((t) => (t.id === "classes" ? t : { ...t, rows: t.rows.map((r) => (gone.has(r.cells.pupil_id) ? { ...r, gone: true } : r)) }));
}

/** The different phone numbers on file for a class's teacher, and whether any are left at all. */
export const phonesFor = (ts: Table[], f: Facts, c: number) => [...new Set(ts.flatMap((t) => (t.cols.includes("phone") ? live(t).filter((r) => r.cells.class === f.classes[c]).map((r) => String(r.cells.phone)) : [])))];
