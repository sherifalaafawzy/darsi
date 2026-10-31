/**
 * Joins: pupils (id, name) and yesterday's maths marks (pupil_id, mark), matched on pupil_id = id. Two pupils missed
 * the test, one sat it twice (the test and a resit), and one mark carries an id that isn't on the pupil list yet.
 * - inner: one row per matching pair; rows with no partner disappear.
 * - left (all pupils): every pupil, with NULL marks where none match.
 * - left (all marks): every mark, with NULL names where no pupil matches.
 */
export type Kind = "inner" | "pupils" | "marks";
export const KINDS: Kind[] = ["inner", "pupils", "marks"];
export const PUPIL_IDS = [1, 2, 3, 4, 5, 6];
export const MARKS: { pupil: number; mark: number }[] = [{ pupil: 1, mark: 14 }, { pupil: 2, mark: 11 }, { pupil: 4, mark: 16 }, { pupil: 4, mark: 12 }, { pupil: 5, mark: 9 }, { pupil: 7, mark: 15 }];

/** A result row: indexes into PUPIL_IDS and MARKS, null where the join filled in NULL. */
export interface Pair { p: number | null; m: number | null }

export function join(kind: Kind): Pair[] {
  const out: Pair[] = [];
  if (kind === "marks") {
    MARKS.forEach((m, j) => { const i = PUPIL_IDS.indexOf(m.pupil); out.push({ p: i >= 0 ? i : null, m: j }); });
    return out;
  }
  PUPIL_IDS.forEach((id, i) => {
    const ms = MARKS.map((m, j) => (m.pupil === id ? j : -1)).filter((j) => j >= 0);
    for (const j of ms) out.push({ p: i, m: j });
    if (!ms.length && kind === "pupils") out.push({ p: i, m: null });
  });
  return out;
}

/** The pupils and marks that don't appear in the result. */
export function dropped(rows: Pair[]) {
  return { pupils: PUPIL_IDS.map((_, i) => i).filter((i) => !rows.some((r) => r.p === i)), marks: MARKS.map((_, j) => j).filter((j) => !rows.some((r) => r.m === j)) };
}

/** COUNT(*), COUNT(mark) and AVG(mark) over the result, as SQL counts them (NULLs are skipped). */
export function counts(rows: Pair[]) {
  const ms = rows.flatMap((r) => (r.m === null ? [] : [MARKS[r.m].mark]));
  return { all: rows.length, marks: ms.length, avg: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null };
}

export const SQL: Record<Kind, string> = {
  inner: "SELECT p.id, p.name, m.pupil_id, m.mark\nFROM pupils p\nJOIN marks m ON m.pupil_id = p.id;",
  pupils: "SELECT p.id, p.name, m.pupil_id, m.mark\nFROM pupils p\nLEFT JOIN marks m ON m.pupil_id = p.id;",
  marks: "SELECT p.id, p.name, m.pupil_id, m.mark\nFROM marks m\nLEFT JOIN pupils p ON p.id = m.pupil_id;",
};
