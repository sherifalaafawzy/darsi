import { alerts, mistakes, readings, smooth, truth } from "../../src/labs/apps/sensor/model";
import { apparent, enough, levels, quantize, roundingError, sample } from "../../src/labs/apps/adc/model";
import { csv, daily, dryHours, glitches, stats, week } from "../../src/labs/apps/datalog/model";
import { CAPACITY, hours, led, safest } from "../../src/labs/apps/circuit/model";
import { gate, PUZZLES, solved, TWO, type Puzzle } from "../../src/labs/apps/logic/model";
import { ascii, byteCount, fromBits, hex, toBits, utf8, values } from "../../src/labs/apps/binary/model";
import { RULES, simulate } from "../../src/labs/apps/rules/model";
import { BATTERIES, budget, lifeDays, tooWeak } from "../../src/labs/apps/battery/model";
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

/* Fixes found while writing each lab's "Try this", and the claims "Try this" makes (so a model change can't quietly
   make the steps wrong). */

describe("signal to numbers at exactly twice the wiggles", () => {
  it("shows a flat line, not the real wave (every sample lands on a zero crossing)", () => {
    expect(apparent(3, 6)).toBe(0); expect(apparent(1, 2)).toBe(0); expect(apparent(8, 16)).toBe(0);
    expect(new Set(sample(3, 6, 3).map((x) => x.q)).size).toBe(1);
    expect(apparent(3, 5)).toBe(2); expect(apparent(8, 15)).toBe(7); expect(enough(8, 17)).toBe(true);
    expect(roundingError(sample(3, 20, 8))).toBeLessThan(roundingError(sample(3, 20, 1)) / 100);
  });
});

describe("LED: dim, burnt and battery size", () => {
  it("starts dim at 1 kΩ, glows well at 470 and 220 Ω, and 220 Ω burns it on 9 V", () => {
    expect(led(4.5, 1000, "red").state).toBe("dim"); // 2.5 mA
    expect(led(4.5, 470, "red").state).toBe("good"); expect(led(4.5, 220, "red").state).toBe("good");
    expect(led(4.5, 220, "red").amps).toBeGreaterThan(led(4.5, 470, "red").amps);
    expect(led(9, 220, "red").state).toBe("burnt"); expect(safest(9, "red")).toBe(470);
  });
  it("a 9 V battery holds less, so the same LED runs out sooner", () => {
    expect(CAPACITY[9]).toBeLessThan(CAPACITY[4.5]);
    expect(hours(CAPACITY[9], led(9, 470, "red").amps)).toBeLessThan(hours(CAPACITY[4.5], led(4.5, 220, "red").amps));
  });
});

describe("battery: self-discharge and peak current", () => {
  const life = (s: number, r: "wifi" | "lora" | "ble", b: keyof typeof BATTERIES = "aa") => lifeDays(BATTERIES[b], budget(s, r, b).total);
  it("a power bank leaks, so at slow reports it lasts less than two AAs", () => {
    expect(life(21600, "ble", "bank")).toBeLessThan(life(21600, "ble", "aa"));
    expect(life(21600, "ble", "aa") / 365).toBeLessThan(20); // years, not centuries
    const slow = budget(21600, "ble", "aa");
    expect(slow.leak + slow.sleep).toBeGreaterThan(slow.send);
  });
  it("hourly instead of every minute lasts about 50 times longer; Bluetooth LE lasts years", () => {
    expect(life(60, "wifi")).toBeLessThan(31); expect(life(3600, "wifi") / 365).toBeGreaterThan(3);
    expect(life(3600, "wifi") / life(60, "wifi")).toBeGreaterThan(40);
    expect(life(60, "ble")).toBeGreaterThan(2 * 365);
  });
  it("a coin cell can't feed Wi-Fi or LoRa bursts", () => {
    expect(tooWeak("coin", "wifi")).toBe(true); expect(tooWeak("coin", "lora")).toBe(true);
    expect(tooWeak("coin", "ble")).toBe(false); expect(tooWeak("aa", "wifi")).toBe(false);
  });
});

describe("logic gates: the starting gates", () => {
  it("AND then AND solves none of the problems", () => {
    for (const p of Object.keys(PUZZLES) as Puzzle[]) expect(solved(p, "AND", "AND")).toBe(false);
  });
});

describe("Try this: the steps say what really happens", () => {
  it("sensor: averaging 6 readings ends the false alarms; 12 is late; reading every minute brings many", () => {
    const at = (every: number, win: number) => { const sm = smooth(readings(every, 0.8), win); return { ...mistakes(sm, 30), on: alerts(sm, 30) }; };
    const base = at(5, 1), six = at(5, 6), twelve = at(5, 12), often = at(1, 1);
    expect(base.falseAlerts).toBeGreaterThan(0); expect(six.falseAlerts).toBe(0); expect(six.on.length).toBeLessThan(base.on.length);
    expect(twelve.missed).toBeGreaterThan(six.missed); expect(twelve.on[0]).toBeGreaterThan(10 * 60); // misses the 9:30 hot spell
    expect(readings(1, 0.8)).toHaveLength(481); expect(often.falseAlerts).toBeGreaterThan(20);
  });
  it("datalog: the glitches fake the lowest value and the dry hours; the real dry hours are on days 2 and 3", () => {
    const rows = week(), bad = glitches(rows), none = bad.map(() => false);
    expect(Math.round(stats(rows.filter((_, i) => !bad[i]).map((x) => x.v)).min)).toBe(55);
    expect(dryHours(rows, none, 40)).toBe(2); expect(dryHours(rows, bad, 40)).toBe(0);
    const before = daily(rows, none), after = daily(rows, bad);
    for (const d of [3, 4]) expect(after[d] - before[d]).toBeGreaterThan(2.5); // days 4 and 5
    const dryDays = new Set(rows.filter((x, i) => !bad[i] && x.v < 60).map((x) => Math.floor(x.h / 24) + 1));
    expect([...dryDays].sort()).toEqual([2, 3]);
  });
  it("binary: 65 is A, and one more bit doubles the count", () => {
    expect(fromBits([0, 1, 0, 0, 0, 0, 0, 1])).toBe(65); expect(ascii(65)).toBe("A"); expect(hex(65)).toBe("41");
    expect(values(9)).toBe(2 * values(8));
  });
  it("rules: lights in the breaks waste energy; a lazy fan or window costs comfort", () => {
    const on = simulate(RULES);
    const always = simulate({ ...RULES, lights: { ...RULES.lights, onlyIfOccupied: false } });
    expect(always.energy).toBeGreaterThan(on.energy); expect(always.dark).toBe(on.dark);
    const lazyFan = simulate({ ...RULES, fan: { ...RULES.fan, above: 31 } });
    expect(lazyFan.steps.some((m) => m.fan)).toBe(false); expect(lazyFan.energy).toBeLessThan(on.energy); expect(lazyFan.hot).toBeGreaterThan(120);
    expect(simulate({ ...RULES, window: { ...RULES.window, above: 1500 } }).stuffy).toBeGreaterThan(180);
  });
  it("mesh: one broken neighbour cuts off the corner; 240 m cuts off six; relays bring them back; 500 m needs 3 hops", () => {
    const corner = NODES.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
    const r = routes(NODES, 2.8, new Set()), next = r.get(corner.id)!.next!;
    expect(routes(NODES, 2.8, new Set([next])).has(corner.id)).toBe(false);
    const short = routes(NODES, 2.4, new Set());
    expect(NODES.filter((n) => !short.has(n.id))).toHaveLength(6);
    const withRelays = [...NODES, { id: 12, x: 2.75, y: 4.5, relay: true }, { id: 13, x: 5.5, y: 3.75, relay: true }, { id: 14, x: 4.25, y: 6.5, relay: true }];
    expect(NODES.every((n) => routes(withRelays, 2.4, new Set()).has(n.id))).toBe(true);
    const far = routes(NODES, 5, new Set());
    expect(Math.max(...NODES.map((n) => far.get(n.id)!.hops))).toBe(3); expect(Math.max(...NODES.map((n) => r.get(n.id)!.hops))).toBe(5);
  });
});
