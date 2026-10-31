/**
 * Data quality checks on incoming batches: rainfall (mm) from four school weather clubs, one batch per school day.
 * Monday's batch is clean; the others carry the usual faults: the gauge's error code 999, a minus sign typed by
 * mistake, a reading sent twice, an empty value, an empty station name and a misspelt one. Each check catches one
 * kind of fault; what happens next (stop the batch, set the bad rows aside, or let them through with a warning)
 * decides what reaches the report.
 */
export type Lang = "en" | "ar";
export type Check = "range" | "unique" | "notEmpty" | "allowed";
export const CHECKS: Check[] = ["range", "unique", "notEmpty", "allowed"];
export type Action = "stop" | "aside" | "warn";
export interface Reading { station: string; day: number; mm: number | null }

export const STATIONS: Record<Lang, string[]> = { en: ["Hilltop", "Riverside", "Market", "Lakeside"], ar: ["التل", "ضفة النهر", "السوق", "البحيرة"] };
const MISSPELT: Record<Lang, string> = { en: "Lakesid", ar: "البحيره" };
/** What the gauges really measured: [day][station], mm. */
export const TRUTH = [[12, 15, 9, 11], [0, 3, 0, 2], [22, 25, 18, 20], [8, 6, 7, 9], [31, 28, 26, 30]];
export const MAX_MM = 300;

export function batches(lang: Lang): Reading[][] {
  const st = STATIONS[lang];
  return TRUTH.map((day, d) => {
    const b: Reading[] = day.map((mm, i) => ({ station: st[i], day: d, mm }));
    if (d === 1) b[1].mm = 999; // the gauge's error code
    if (d === 2) b.splice(1, 0, { ...b[0] }); // sent twice
    if (d === 3) { b[2].mm = null; b[3].station = MISSPELT[lang]; }
    if (d === 4) { b[1].mm = -b[1].mm!; b[2].station = ""; }
    return b;
  });
}

/** Which of the chosen checks each row fails. */
export function failures(b: Reading[], stations: string[], on: ReadonlySet<Check>): Check[][] {
  return b.map((r, i) => {
    const f: Check[] = [];
    if (on.has("range") && r.mm !== null && (r.mm < 0 || r.mm > MAX_MM)) f.push("range");
    if (on.has("unique") && b.slice(0, i).some((x) => x.station === r.station && x.day === r.day)) f.push("unique");
    if (on.has("notEmpty") && (r.mm === null || !r.station.trim())) f.push("notEmpty");
    if (on.has("allowed") && r.station.trim() && !stations.includes(r.station)) f.push("allowed");
    return f;
  });
}

export type Outcome = "loaded" | "stopped" | "aside" | "warned";
export function run(all: Reading[][], stations: string[], on: ReadonlySet<Check>, action: Action) {
  const loaded: Reading[] = [], problems: { r: Reading; checks: Check[]; kept: boolean }[] = [];
  const board = all.map((b) => {
    const f = failures(b, stations, on), bad = f.filter((x) => x.length).length;
    const counts = Object.fromEntries(CHECKS.map((c) => [c, f.filter((x) => x.includes(c)).length])) as Record<Check, number>;
    const stop = action === "stop" && bad > 0;
    b.forEach((r, i) => {
      const keep = !stop && (action === "warn" || !f[i].length);
      if (keep) loaded.push(r);
      if (f[i].length) problems.push({ r, checks: f[i], kept: keep });
    });
    const outcome: Outcome = !bad ? "loaded" : stop ? "stopped" : action === "aside" ? "aside" : "warned";
    return { counts, outcome, bad, rows: b.length };
  });
  return { board, loaded, problems, received: all.reduce((n, b) => n + b.length, 0) };
}

/** The report: each station's average over the readings that arrived, by the name they arrived with. */
export function report(loaded: Reading[], stations: string[]) {
  const names = [...stations, ...new Set(loaded.map((r) => r.station).filter((s) => !stations.includes(s)))];
  return names.map((name) => {
    const vs = loaded.filter((r) => r.station === name && r.mm !== null).map((r) => r.mm!);
    const i = stations.indexOf(name);
    return { name, n: loaded.filter((r) => r.station === name).length, avg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null, truth: i >= 0 ? TRUTH.reduce((a, d) => a + d[i], 0) / TRUTH.length : null };
  }).filter((x) => x.n > 0 || x.truth !== null);
}
