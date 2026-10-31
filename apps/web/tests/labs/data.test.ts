/**
 * The data engineering track's Labs: their models, the numbers their "Try this" lines promise, and each app rendering
 * in English and Arabic. (Created with React.createElement so this file stays .ts.)
 */
import { createElement as h } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";
import { runInNode } from "../code/node";
import * as table from "../../src/labs/apps/table/model";
import * as fmt from "../../src/labs/apps/formats/model";
import * as sql from "../../src/labs/apps/sqlplay/model";
import * as cln from "../../src/labs/apps/clean/model";
import * as jn from "../../src/labs/apps/join/model";
import * as sch from "../../src/labs/apps/schema/model";
import * as idx from "../../src/labs/apps/index/model";
import * as pipe from "../../src/labs/apps/pipeline/model";
import * as qa from "../../src/labs/apps/quality/model";
import * as st from "../../src/labs/apps/stream/model";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

describe("tidy tables", () => {
  const names = ["Amina", "Tunde", "Chidi", "Fatima", "Kofi", "Grace"], cls: [string, string] = ["5A", "5B"];
  const messy = table.messy(names, cls, "Total");
  const with_ = (...f: table.Fix[]) => table.tidy(messy, new Set(f));
  it("starts messy: totals in the rows, the class once per group, two marks per cell", () => {
    expect(messy.rows).toHaveLength(8);
    expect(table.emptyCells(messy)).toBe(6);
    expect(table.typeOf(messy, "marks")).toBe("text");
    const a = table.answers(messy, cls, names);
    expect(a.count).toEqual({ value: 1, right: false });
    expect(a.average.value).toBeNull();
    expect(a.best.value).toBeNull();
  });
  it("gives the wrong answers the Try this lines describe", () => {
    expect(table.answers(with_("fill"), cls, names).count.value).toBe(4); // the Total row got a class
    const split = table.answers(with_("split"), cls, names);
    expect(split.average.value).toBe(20); // 20 out of 20, thanks to the totals
    expect(split.best).toEqual({ value: "Total", right: false });
  });
  it("answers everything right once tidy, whatever order the fixes were tapped in", () => {
    const t = with_("split", "totals", "fill");
    expect(t).toEqual(with_("fill", "totals", "split"));
    expect(t.cols).toEqual(["name", "cls", "maths", "science"]);
    expect(table.typeOf(t, "maths")).toBe("number");
    const a = table.answers(t, cls, names);
    expect([a.count.right, a.average.right, a.best.right]).toEqual([true, true, true]);
    expect(a.average.value).toBeCloseTo(13.33, 2);
    expect(a.best.value).toBe("Amina");
  });
});

describe("file formats", () => {
  it("keeps one record per pupil per school day, skipping weekends", () => {
    expect(fmt.schoolDays(6)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09"]);
    expect(fmt.records("class")).toHaveLength(700);
    expect(fmt.records("term")).toHaveLength(25200);
  });
  it("writes run-lengths for repeats", () => {
    expect(fmt.runs(["a", "a", "b", "a"])).toBe("a*2,b,a");
    expect(fmt.toColumns(fmt.records("class")).split("\n")[0]).toMatch(/^date\|2026-03-02\*35,2026-03-03\*35/);
  });
  it("orders the sizes JSON > CSV > columns, and compression shrinks each by far", async () => {
    for (const size of ["class", "school", "term"] as fmt.Size[]) {
      const rs = fmt.records(size), [c, j, k] = fmt.FORMATS.map((f) => fmt.bytes(fmt.write(f, rs)));
      expect(j).toBeGreaterThan(2 * c);
      expect(c).toBeGreaterThan(3 * k);
    }
    const rs = fmt.records("term"), json = fmt.write("json", rs), gz = await fmt.gzipBytes(json);
    expect(gz).not.toBeNull();
    expect(gz!).toBeLessThan(fmt.bytes(json) / 10);
  });
  it("keeps the Try this numbers true: a term on 2G", async () => {
    const rs = fmt.records("term"), json = fmt.write("json", rs), cols = fmt.write("cols", rs);
    expect(fmt.seconds(fmt.bytes(json), "2g") / 60).toBeGreaterThan(4.4); // "nearly 5 minutes"
    expect(fmt.seconds(fmt.bytes(json), "2g") / 60).toBeLessThan(5);
    expect(Math.round(fmt.seconds((await fmt.gzipBytes(json))!, "2g"))).toBe(13); // "about 13 seconds"
    expect(Math.round((await fmt.gzipBytes(cols))! / 1024)).toBe(6); // "about 6 KB"
  });
});

describe("the school database (real SQLite)", () => {
  const ask = async (code: string) => (await runInNode({ lang: "sql", code, setup: sql.SETUP }))[0];
  it("has 12 pupils and 35 marks", async () => {
    expect(sql.TABLES.map((t) => t.rows)).toEqual([12, 35]);
    expect((await ask("SELECT COUNT(*) FROM marks;")).table!.values).toEqual([[35]]);
  });
  it("answers every example question", async () => {
    const rows = [];
    for (const e of sql.EXAMPLES) { const r = await ask(e.sql); expect(r.error, e.sql).toBeUndefined(); rows.push(r.table!.values.length); }
    expect(rows).toEqual([12, 4, 12, 3, 3, 5, 3]);
    expect((await ask(sql.EXAMPLES[4].sql)).table!.values).toEqual([["english", 14.3], ["science", 13.9], ["maths", 13.5]]);
    expect((await ask(sql.EXAMPLES[6].sql)).table!.values.map((r) => r[0])).toEqual(["Yusuf", "Chidi", "Zainab"]);
  });
  it("supports the Try this edits", async () => {
    expect((await ask(sql.EXAMPLES[1].sql.replace("'5B'", "'6A'"))).table!.values.map((r) => r[0])).toEqual(["Omar", "Laila", "Yusuf", "Mariam"]);
    expect((await ask(sql.EXAMPLES[4].sql.replace("AVG", "MAX"))).table!.values).toContainEqual(["english", 19]);
    expect((await ask("SELECT name FROM pupils WHERE town = 'Hilltop';")).table!.values).toHaveLength(4);
  });
  it("shows cells and code parts", () => {
    expect([sql.cell(null), sql.cell(13.333), sql.cell(4), sql.cell("a")]).toEqual([null, 13.33, 4, "a"]);
    expect(sql.codeParts("Run `AVG` now")).toEqual([{ text: "Run ", code: false }, { text: "AVG", code: true }, { text: " now", code: false }]);
  });
});

describe("cleaning a register", () => {
  for (const lang of ["en", "ar"] as const) {
    const raw = cln.register(lang), list = cln.classList(lang);
    const run = (o: Partial<cln.Opts>) => cln.clean(raw, list, { names: 0, repeats: false, blank: "leave", ...o });
    it(`counts fewer pupils and finds more repeats as the names agree (${lang})`, () => {
      expect(raw).toHaveLength(44);
      expect([0, 1, 2].map((n) => run({ names: n as cln.NameFix }).pupils.length)).toEqual([20, lang === "en" ? 13 : 15, 8]);
      expect([0, 1, 2].map((n) => run({ names: n as cln.NameFix, repeats: true }).repeats)).toEqual([1, 2, 3]);
      const all = run({ names: 2, repeats: true });
      expect([all.kept, all.aside, all.blank]).toEqual([40, 1, 4]);
      expect(all.pupils.map((p) => p.name).sort()).toEqual([...list].sort());
      expect(all.pupils.every((p) => p.rows === 5)).toBe(true);
    });
    it(`moves attendance between 80% and 90% with the choice for blanks (${lang})`, () => {
      expect(cln.TRUE_RATE).toBe(0.85);
      expect(run({ names: 2, repeats: true, blank: "absent" }).rate).toBeCloseTo(0.8);
      expect(run({ names: 2, repeats: true, blank: "leave" }).rate).toBeCloseTo(32 / 36);
      expect(run({ names: 2, repeats: true, blank: "present" }).rate).toBeCloseTo(0.9);
    });
  }
  it("matches spellings and Arabic letter forms to the class list", () => {
    const en = cln.classList("en"), ar = cln.classList("ar");
    expect(["Aminah", "Moussa", "TUNDE", "Zaynab", "Ngozi"].map((n) => cln.match(n, en))).toEqual(["Amina", "Musa", "Tunde", "Zainab", null]);
    expect(["امينه", "مصطفي", "عبدالله", "ليلي", "سعاد"].map((n) => cln.match(n, ar))).toEqual(["أمينة", "مصطفى", "عبد الله", "ليلى", null]);
    expect(cln.fold(" أمينة ")).toBe("امينه");
    expect(cln.distance("kitten", "sitting")).toBe(3);
  });
});

describe("joins", () => {
  it("drops unmatched rows in an inner join and fills NULL in a left join", () => {
    const inner = jn.join("inner"), left = jn.join("pupils"), marks = jn.join("marks");
    expect(inner).toHaveLength(5);
    expect(jn.dropped(inner)).toEqual({ pupils: [2, 5], marks: [5] });
    expect(left).toHaveLength(7);
    expect(left.filter((r) => r.m === null).map((r) => r.p)).toEqual([2, 5]);
    expect(jn.counts(left)).toEqual({ all: 7, marks: 5, avg: 12.4 });
    expect(jn.counts(inner).avg).toBe(12.4);
    expect(marks).toHaveLength(6);
    expect(marks[5]).toEqual({ p: null, m: 5 });
    expect(inner.filter((r) => r.p === 3)).toHaveLength(2); // two marks, two rows
  });
});

describe("normalising", () => {
  const f: sch.Facts = { names: ["A", "B", "C", "D", "E", "F"], classes: ["6A", "6B"], teachers: ["T1", "T2"], subjects: ["maths", "science"] };
  const steps = [1, 2, 3] as sch.Step[];
  it("removes repeated facts step by step", () => {
    expect(steps.map((s) => sch.repeats(sch.tables(s, f)))).toEqual([32, 8, 0]);
    expect(steps.map((s) => sch.cells(sch.tables(s, f)))).toEqual([84, 66, 60]);
    expect(steps.map((s) => sch.phoneCells(sch.tables(s, f), f))).toEqual([6, 3, 1]);
  });
  it("shows the update and delete mistakes only while facts repeat", () => {
    expect(steps.map((s) => sch.phonesFor(sch.hurriedUpdate(sch.tables(s, f), f), f, 0).length)).toEqual([2, 2, 1]);
    expect(sch.phonesFor(sch.hurriedUpdate(sch.tables(3, f), f), f, 0)).toEqual([sch.NEW_PHONE]);
    expect(steps.map((s) => sch.phonesFor(sch.leave(sch.tables(s, f), f), f, 1).length)).toEqual([0, 0, 1]);
  });
});

describe("indexes", () => {
  it("stores every pupil once and finds each with log2 looks in the index", () => {
    const ids = idx.table(1000, 2), keys = idx.sorted(ids);
    expect(Array.from(keys)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
    expect(idx.scan(ids, ids[417])).toBe(418);
    for (let k = 1; k <= 1000; k++) expect(idx.seek(keys, k)).toBeLessThanOrEqual(10);
  });
  it("keeps the Try this numbers true for a million rows", () => {
    const r = idx.trial(1_000_000);
    expect(r.scan).toBeGreaterThan(300_000);
    expect(r.scan).toBeLessThan(700_000);
    expect(r.seek).toBeGreaterThan(17);
    expect(r.seek).toBeLessThan(21);
    expect(idx.expectSeek(1e7) - idx.expectSeek(1e6)).toBeCloseTo(3.3, 1); // "only about 3 looks" per step
  });
  it("makes a small table to watch, found in at most 6 looks", () => {
    const w = idx.small(5);
    expect(new Set(w.ids).size).toBe(32);
    const steps = idx.seekSteps(w.keys, w.key);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(w.keys[steps[steps.length - 1].mid]).toBe(w.key);
  });
});

describe("a pipeline", () => {
  const go = (w: pipe.World, o: Partial<Parameters<typeof pipe.run>[1]>) => pipe.run(w, { fault: "none", mode: "append", aside: false, ...o });
  it("reports 84 of 90 after a clean run", () => {
    expect(pipe.report(go(pipe.EMPTY, {}).world.table)).toEqual({ present: pipe.PRESENT, roll: pipe.ROLL });
    expect([pipe.PRESENT, pipe.ROLL]).toEqual([84, 90]);
  });
  it("double-counts on a retry when appending, but not when replacing the day", () => {
    const a1 = go(pipe.EMPTY, { fault: "load" });
    expect(a1.events.at(-1)).toMatchObject({ stage: "load", ok: false, n: 2 });
    expect(pipe.report(a1.world.table).roll).toBe(62);
    const a2 = go(a1.world, { fault: "load" });
    expect(pipe.report(a2.world.table)).toEqual({ present: 141, roll: 152 });
    expect(pipe.twice(a2.world.table).size).toBe(4);
    const r1 = go(pipe.EMPTY, { fault: "load", mode: "replace" }), r2 = go(r1.world, { fault: "load", mode: "replace" }), r3 = go(r2.world, { mode: "replace" });
    expect(pipe.report(r2.world.table).roll).toBe(90);
    expect(r2.events.at(-1)).toMatchObject({ ok: true, cleared: 2 });
    expect(pipe.report(r3.world.table).roll).toBe(90);
  });
  it("fixes a dropped connection with a retry, but not bad data", () => {
    const e1 = go(pipe.EMPTY, { fault: "extract" });
    expect(e1.events).toEqual([{ stage: "extract", ok: false }]);
    expect(go(e1.world, { fault: "extract" }).events.every((e) => e.ok)).toBe(true);
    const t1 = go(pipe.EMPTY, { fault: "transform" }), t2 = go(t1.world, { fault: "transform" });
    expect(t2.events.at(-1)).toMatchObject({ stage: "transform", ok: false });
    const t3 = go(t2.world, { fault: "transform", aside: true });
    expect(t3.events.find((e) => e.stage === "transform")).toMatchObject({ ok: true, aside: 1 });
    expect(pipe.report(t3.world.table)).toEqual({ present: 83, roll: 90 });
  });
});

describe("data checks", () => {
  const stations = qa.STATIONS.en, all = qa.batches("en");
  const go = (on: qa.Check[], a: qa.Action) => { const r = qa.run(all, stations, new Set(on), a); return { r, rep: qa.report(r.loaded, stations) }; };
  const avg = (rep: ReturnType<typeof qa.report>, name: string) => rep.find((x) => x.name === name)!.avg!;
  it("catches each fault with its own check", () => {
    const found = all.flatMap((b) => qa.failures(b, stations, new Set(qa.CHECKS)).map((f, i) => [b[i], f] as const)).filter(([, f]) => f.length);
    expect(found.map(([r, f]) => `${r.station}:${r.mm}:${f.join("+")}`)).toEqual(["Riverside:999:range", "Hilltop:22:unique", "Market:null:notEmpty", "Lakesid:9:allowed", "Riverside:-28:range", ":26:notEmpty"]);
  });
  it("keeps the Try this numbers true", () => {
    const off = go([], "warn");
    expect(off.rep.filter((x) => x.n > 0)).toHaveLength(6);
    expect(avg(off.rep, "Riverside")).toBeGreaterThan(200);
    const stop = go(qa.CHECKS, "stop");
    expect(stop.r.loaded).toHaveLength(4);
    expect(stop.r.board.map((b) => b.outcome)).toEqual(["loaded", "stopped", "stopped", "stopped", "stopped"]);
    const aside = go(qa.CHECKS, "aside");
    expect(aside.r.loaded).toHaveLength(15);
    expect(avg(aside.rep, "Hilltop")).toBeCloseTo(14.6);
    expect(avg(go(qa.CHECKS.filter((c) => c !== "unique"), "aside").rep, "Hilltop")).toBeCloseTo(15.83, 2);
  });
});

describe("streams and batches", () => {
  const xs = st.readings();
  it("knows when the river really crossed the line", () => {
    expect(st.TRUE_CROSS).toBe(125);
    expect(st.moving([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
    expect(st.batchMeans([1, 2, 3, 4, 5], 2)).toEqual([[1, 1.5], [3, 3.5]]);
    expect(st.alerts([[0, 1], [1, 2.1], [2, 2.2], [3, 1.95], [4, 2.1], [5, 1.5], [6, 2.3]])).toEqual([1, 6]); // rings again only after dropping well below
  });
  it("trades false alarms for delay, as the Try this lines say", () => {
    const s = (w: number) => st.judge(xs, "stream", w);
    expect([s(1).falseAlarms, s(5).falseAlarms, s(10).falseAlarms]).toEqual([3, 1, 0]);
    expect([s(1).delay, s(10).delay, s(30).delay]).toEqual([0, 5, 15]);
    const b = st.judge(xs, "batch", 60);
    expect([b.falseAlarms, b.wakeups]).toEqual([0, 3]);
    expect(b.delay).toBeGreaterThan(45);
    expect(s(1).wakeups).toBe(st.MINUTES);
  });
});

const { LabApp } = await import("../../src/screens/Labs");
const APPS = ["table", "formats", "sqlplay", "clean", "join", "schema", "index", "pipeline", "quality", "stream"];
describe("every data lab says what to try, in both languages", () => {
  beforeAll(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2_400_000 })))); });
  for (const lang of ["en", "ar"] as const) for (const id of APPS) {
    it(`${id} (${lang})`, async () => {
      render(h(StoreProvider, null, h(I18nProvider, { lang, children: h(MemoryRouter, { initialEntries: [`/labs/${id}`] }, h(Routes, null, h(Route, { path: "/labs/:id", element: h(LabApp) }))) })));
      const head = await screen.findByText(lang === "ar" ? "جرّب هذا" : "Try this");
      const items = [...(head.parentElement?.querySelectorAll("li") ?? [])];
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(3);
      if (lang === "ar") expect(head.closest(".lb-shell")!.textContent).not.toContain("·");
      for (const li of items) {
        expect((li.textContent ?? "").length).toBeGreaterThan(30);
        // Written Arabic uses Arabic-Indic digits; code (in <code>) keeps its own.
        const words = [...li.childNodes].filter((n) => !(n instanceof HTMLElement && n.tagName === "CODE")).map((n) => n.textContent).join("");
        if (lang === "ar") expect(words).not.toMatch(/[0-9]/);
      }
    });
  }
});
