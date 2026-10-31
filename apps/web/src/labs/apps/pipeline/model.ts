/**
 * A small ETL pipeline: each evening, extract the three class registers (P or A for every pupil), transform them into
 * a count per class, and load the counts into the district's table, from which the report is made.
 * Faults: the connection drops while extracting (passing: a retry works); a register holds "?" instead of P or A
 * (bad data: a retry fails the same way until the row is set aside); the database is busy after two of three classes
 * are written (passing, but the first two are already in). Loading either adds rows (append) or first removes the
 * day's rows and writes them again (replace): only replace can safely run twice (it is idempotent).
 */
export type Stage = "extract" | "transform" | "load";
export const STAGES: Stage[] = ["extract", "transform", "load"];
export type Fault = "none" | Stage;
export type Mode = "append" | "replace";

export const DAY = "Mon";
/** Each class: pupils on the roll, and which of them were away today. The bad register has "?" for one pupil. */
export const CLASSES = [{ cls: "5A", roll: 30, away: [4, 17] }, { cls: "5B", roll: 32, away: [3, 9, 25], bad: 7 }, { cls: "6A", roll: 28, away: [12] }];
export const ROLL = CLASSES.reduce((n, c) => n + c.roll, 0);
export const PRESENT = CLASSES.reduce((n, c) => n + c.roll - c.away.length, 0);

export interface Register { cls: string; marks: string[] }
export const registers = (bad: boolean): Register[] => CLASSES.map((c) => ({ cls: c.cls, marks: Array.from({ length: c.roll }, (_, i) => (bad && c.bad === i ? "?" : c.away.includes(i) ? "A" : "P")) }));

export interface Count { cls: string; present: number; roll: number }
/** Counts each register; a mark that isn't P or A stops the step, unless such rows are set aside for a person to check. */
export function transform(regs: Register[], aside: boolean): { ok: true; counts: Count[]; aside: number } | { ok: false; bad: number } {
  const bad = regs.reduce((n, r) => n + r.marks.filter((m) => m !== "P" && m !== "A").length, 0);
  if (bad && !aside) return { ok: false, bad };
  return { ok: true, aside: bad, counts: regs.map((r) => ({ cls: r.cls, present: r.marks.filter((m) => m === "P").length, roll: r.marks.length })) };
}

export interface Row extends Count { day: string; run: number }
export interface World { table: Row[]; runs: number; failedOnce: boolean }
export const EMPTY: World = { table: [], runs: 0, failedOnce: false };
export type Event = { stage: Stage; ok: boolean; n?: number; aside?: number; cleared?: number };

/** One run of the pipeline: what each stage did, and the world afterwards. Passing faults happen once only. */
export function run(w: World, o: { fault: Fault; mode: Mode; aside: boolean }): { events: Event[]; world: World } {
  const runNo = w.runs + 1, events: Event[] = [];
  let failedOnce = w.failedOnce;
  const end = (table = w.table) => ({ events, world: { table, runs: runNo, failedOnce } });
  if (o.fault === "extract" && !failedOnce) { failedOnce = true; events.push({ stage: "extract", ok: false }); return end(); }
  const regs = registers(o.fault === "transform");
  events.push({ stage: "extract", ok: true, n: regs.reduce((n, r) => n + r.marks.length, 0) });
  const t = transform(regs, o.aside);
  if (!t.ok) { events.push({ stage: "transform", ok: false, n: t.bad }); return end(); }
  events.push({ stage: "transform", ok: true, n: t.counts.length, aside: t.aside });
  let table = w.table, cleared = 0;
  if (o.mode === "replace") { cleared = table.filter((r) => r.day === DAY).length; table = table.filter((r) => r.day !== DAY); }
  for (let i = 0; i < t.counts.length; i++) {
    if (o.fault === "load" && !failedOnce && i === 2) { failedOnce = true; events.push({ stage: "load", ok: false, n: i, cleared }); return end(table); }
    table = [...table, { ...t.counts[i], day: DAY, run: runNo }];
  }
  events.push({ stage: "load", ok: true, n: t.counts.length, cleared });
  return end(table);
}

/** The day's report from the table: pupils present and on the roll, summed over its rows. */
export const report = (table: Row[]) => table.filter((r) => r.day === DAY).reduce((a, r) => ({ present: a.present + r.present, roll: a.roll + r.roll }), { present: 0, roll: 0 });
/** Rows for a class that appears more than once on the same day. */
export const twice = (table: Row[]) => new Set(table.filter((r, i) => table.some((x, j) => j !== i && x.day === r.day && x.cls === r.cls)).map((r) => `${r.day}|${r.cls}|${r.run}`));
