import { readings, smooth, truth } from "../../src/labs/apps/sensor/model";
import { apparent, enough, levels, quantize, sample } from "../../src/labs/apps/adc/model";
import { csv, glitches, stats, week } from "../../src/labs/apps/datalog/model";
import { led, safest } from "../../src/labs/apps/circuit/model";
import { gate, solved, TWO } from "../../src/labs/apps/logic/model";
import { byteCount, fromBits, hex, toBits, utf8 } from "../../src/labs/apps/binary/model";
import { RULES, simulate } from "../../src/labs/apps/rules/model";
import { BATTERIES, budget, lifeDays } from "../../src/labs/apps/battery/model";
import { NODES, path, routes } from "../../src/labs/apps/mesh/model";

describe("sensor", () => {
  it("smoothing brings noisy readings closer to the truth", () => {
    const raw = readings(5, 1.6), err = (rs: { t: number; v: number }[]) => rs.reduce((s, x) => s + Math.abs(x.v - truth(x.t)), 0) / rs.length;
    expect(err(smooth(raw, 6))).toBeLessThan(err(raw));
    expect(readings(1, 0).length).toBe(481);
  });
});

describe("signal to numbers", () => {
  it("rounds to 2^bits levels and spots aliasing", () => {
    expect(levels(3)).toHaveLength(8);
    expect(quantize(0.33, 1)).toBe(1); expect(quantize(-0.2, 1)).toBe(-1);
    expect(new Set(sample(3, 60, 2).map((x) => x.q)).size).toBeLessThanOrEqual(4);
    expect(enough(8, 10)).toBe(false); expect(apparent(8, 10)).toBe(2);
    expect(enough(3, 20)).toBe(true); expect(apparent(3, 20)).toBe(3);
  });
});

describe("data logger", () => {
  it("finds exactly the four glitches, and they skew the average more than the median", () => {
    const rows = week(), bad = glitches(rows);
    expect(bad.filter(Boolean)).toHaveLength(4);
    const all = stats(rows.map((x) => x.v)), clean = stats(rows.filter((_, i) => !bad[i]).map((x) => x.v));
    expect(all.min).toBe(0); expect(clean.min).toBeGreaterThan(20);
    expect(Math.abs(all.mean - clean.mean)).toBeGreaterThan(Math.abs(all.median - clean.median));
    expect(csv(rows, bad).split("\n")).toHaveLength(169);
  });
});

describe("LED and Ohm's law", () => {
  it("follows I = (V − Vf) / R and burns out without a resistor", () => {
    const ok = led(4.5, 220, "red");
    expect(ok.amps).toBeCloseTo(2.5 / 221, 5); expect(ok.state).toBe("good");
    expect(led(4.5, 0, "red").state).toBe("burnt");
    expect(led(3, 220, "blue").state).toBe("off");
    expect(led(9, 10000, "red").state).toBe("dim"); // 0.7 mA
    expect(led(9, safest(9, "red"), "red").amps).toBeLessThanOrEqual(0.02);
  });
});

describe("logic gates", () => {
  it("has the right truth tables and the puzzles have the expected answers", () => {
    expect([gate("AND", true, true), gate("AND", true, false), gate("OR", false, true), gate("XOR", true, true), gate("NOT", true), gate("NAND", true, true), gate("NOR", false, false)]).toEqual([true, false, true, false, false, false, true]);
    expect(solved("fan", "AND", "OR")).toBe(true);
    expect(solved("alarm", "OR", "AND")).toBe(true);
    expect(solved("lamp", "XOR", "AND")).toBe(true);
    for (const p of ["fan", "alarm", "lamp"] as const) expect(TWO.flatMap((a) => TWO.map((b) => solved(p, a, b))).filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(solved("fan", "OR", "AND")).toBe(false);
  });
});

describe("bits and bytes", () => {
  it("converts both ways, and Arabic letters take two bytes", () => {
    for (const n of [0, 5, 65, 200, 255]) expect(fromBits(toBits(n))).toBe(n);
    expect(hex(255)).toBe("FF");
    expect(byteCount("Darsi")).toBe(5); expect(byteCount("درسي")).toBe(8);
    expect(utf8("د")[0].bytes).toHaveLength(2);
  });
});

describe("smart classroom rules", () => {
  it("turning rules off saves electricity but costs comfort", () => {
    const on = simulate(RULES), off = simulate({ fan: { ...RULES.fan, on: false }, lights: { ...RULES.lights, on: false }, window: { ...RULES.window, on: false } });
    expect(off.energy).toBe(0); expect(on.energy).toBeGreaterThan(0);
    expect(off.dark + off.hot + off.stuffy).toBeGreaterThan(on.dark + on.hot + on.stuffy);
    const always = simulate({ ...RULES, lights: { ...RULES.lights, onlyIfOccupied: false } });
    expect(always.energy).toBeGreaterThan(on.energy);
  });
});

describe("battery", () => {
  it("lasts longer when sending less often and with a frugal radio", () => {
    const life = (s: number, r: "wifi" | "lora" | "ble") => lifeDays(BATTERIES.aa, budget(s, r).total);
    expect(life(3600, "wifi")).toBeGreaterThan(life(60, "wifi"));
    expect(life(60, "lora")).toBeGreaterThan(life(60, "wifi"));
    expect(budget(10, "wifi").send).toBeGreaterThan(budget(10, "wifi").sleep * 100);
    expect(life(21600, "ble")).toBeGreaterThan(365); // years on two AA batteries
  });
});

describe("mesh network", () => {
  it("routes every sensor by the fewest hops, and a broken node can cut some off", () => {
    const r = routes(NODES, 2.8, new Set());
    expect(NODES.every((n) => r.has(n.id))).toBe(true);
    for (const n of NODES) { const p = path(r, n.id)!; expect(p[p.length - 1]).toBe(0); expect(p.length - 1).toBe(r.get(n.id)!.hops); }
    const cutSome = NODES.filter((n) => !n.gateway).some((n) => { const rr = routes(NODES, 2.8, new Set([n.id])); return NODES.some((m) => m.id !== n.id && !rr.has(m.id)); });
    expect(cutSome).toBe(true);
    expect(routes(NODES, 1, new Set()).size).toBe(1); // tiny range: only the gateway
  });
});
