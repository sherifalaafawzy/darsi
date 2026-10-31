/**
 * The data science track's Labs: their models, the numbers their "Try this" lines promise, and each app rendering in
 * English and Arabic. (Created with React.createElement so this file stays .ts.)
 */
import { createElement as h } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "../../src/i18n";
import { StoreProvider } from "../../src/state/store";
import * as sp from "../../src/labs/apps/spread/model";
import * as cp from "../../src/labs/apps/chartpick/model";
import * as hi from "../../src/labs/apps/histogram/model";
import * as sc from "../../src/labs/apps/scatter/model";
import * as sa from "../../src/labs/apps/sampling/model";

vi.mock("../../src/platform", async (orig) => ({ ...(await orig<typeof import("../../src/platform")>()), storage: { get: async () => undefined, set: async () => {}, remove: async () => {} }, onMeteredConnection: () => false }));

describe("the middle and the spread", () => {
  it("computes centre and spread", () => {
    expect(sp.median([3, 1, 2])).toBe(2);
    expect(sp.median([4, 1, 2, 3])).toBe(2.5);
    expect(sp.modes([1, 2, 2, 3, 3])).toEqual([2, 3]);
    expect(sp.modes([1, 2, 3])).toEqual([]);
    expect(sp.range([4, 9, 1])).toBe(8);
    expect(sp.quartiles([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ q1: 2.5, q3: 6.5 });
    expect(sp.sd([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it("keeps the Try this promises", () => {
    const a = sp.withLast(14), b = sp.withLast(0);
    expect(sp.mean(a) - sp.mean(b)).toBeGreaterThan(1);
    expect(sp.median(a) - sp.median(b)).toBe(1);
    expect(sp.modes(sp.withLast(12))).toEqual([12]);
    const iqr = (x: number) => { const q = sp.quartiles(sp.withLast(x)); return q.q3 - q.q1; };
    expect(sp.range(sp.withLast(20)) - sp.range(a)).toBeGreaterThanOrEqual(4);
    expect(Math.abs(iqr(20) - iqr(14))).toBeLessThanOrEqual(1);
  });
});

describe("pick the right chart", () => {
  it("scores answers and shows how a cut axis exaggerates", () => {
    expect(cp.score({ q1: "bar", q2: "line", q3: "pie", q4: "scatter", q5: "line" })).toBe(5);
    expect(cp.score({ q1: "pie" })).toBe(0);
    expect(cp.looksTimes(cp.RATES.last, cp.RATES.now, 0)).toBeCloseTo(74 / 70);
    expect(cp.looksTimes(cp.RATES.last, cp.RATES.now, 68)).toBe(3);
  });
});

describe("histograms", () => {
  it("counts into bins with lower edges included", () => {
    expect(hi.bins([0, 1, 2, 5, 9], 5, 0).map((b) => b.count)).toEqual([3, 2]);
    expect(hi.bins([10, 15, 20], 5, 10).map((b) => b.count)).toEqual([1, 1, 1]);
  });
  it("reads the shapes the Try this lines describe", () => {
    const hs = hi.heights(), js = hi.journeys();
    expect(hs).toHaveLength(60);
    expect(hi.shape(hs)).toBe("symmetric");
    expect(hi.shape(js)).toBe("right");
    expect(hi.bins(hs, 20).length).toBeLessThanOrEqual(3);
    expect(hi.bins(hs, 1).length).toBeGreaterThan(25);
    expect(hi.bins(hs, 5).reduce((s, b) => s + b.count, 0)).toBe(60);
  });
});

describe("scatter and best fit", () => {
  it("fits lines and measures correlation", () => {
    const line = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }];
    expect(sc.correlation(line)).toBeCloseTo(1);
    expect(sc.fitLine(line)).toEqual({ slope: 2, intercept: 1 });
    expect(sc.meanMiss(line, { slope: 2, intercept: 1 })).toBe(0);
    expect(sc.strength(-0.9)).toBe("strong-");
    expect(sc.strength(0.1)).toBe("none");
  });
  it("keeps the Try this promises", () => {
    const r0 = sc.correlation(sc.STUDY);
    expect(r0).toBeCloseTo(0.96, 2);
    const low = [...sc.STUDY, { x: 9, y: 4 }, { x: 9.5, y: 5 }, { x: 10, y: 3 }];
    expect(sc.correlation(low)).toBeLessThan(0.5);
    const odd = [...sc.STUDY, { x: 0, y: 20 }];
    expect(sc.fitLine(odd).slope).toBeLessThan(sc.fitLine(sc.STUDY).slope - 0.3);
  });
});

describe("samples and surveys", () => {
  const pop = sa.population();
  const truth = sa.meanOf(pop.map((p) => p.minutes));
  it("random samples centre on the truth and bigger ones wobble less", () => {
    const m10 = sa.sampleMeans(pop, 10, 200, false), m40 = sa.sampleMeans(pop, 40, 200, false);
    expect(Math.abs(sa.meanOf(m10) - truth)).toBeLessThan(1.5);
    const ratio = sa.sdOf(m40) / sa.sdOf(m10);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    expect(sa.sdOf(sa.sampleMeans(pop, 80, 100, false))).toBeLessThan(sa.sdOf(sa.sampleMeans(pop, 5, 100, false)) / 2.5);
  });
  it("a biased way of choosing is wrong however big the sample", () => {
    for (const n of [10, 80]) expect(sa.meanOf(sa.sampleMeans(pop, n, 50, true))).toBeLessThan(truth - 10);
  });
});

const { LabApp } = await import("../../src/screens/Labs");
const APPS = ["spread", "chartpick", "histogram", "scatter", "sampling"];
describe("every data science lab says what to try, in both languages", () => {
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
        const words = [...li.childNodes].filter((n) => !(n instanceof HTMLElement && n.tagName === "CODE")).map((n) => n.textContent).join("");
        if (lang === "ar") expect(words).not.toMatch(/[0-9]/);
      }
    });
  }
});
