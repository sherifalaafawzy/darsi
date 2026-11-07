import { describe, expect, it } from "vitest";
import { cueLeft, rnnStep } from "../../src/labs/apps/rnn/model";
import { continueSong, nextOf, PITCHES, SONG, transitions } from "../../src/labs/apps/melody/model";
import { FACE_LINE, judged, likeness, prototype, TEST, TRAIN, WIDE } from "../../src/labs/apps/detect/model";
import { decode, encode, mse, paint } from "../../src/labs/apps/vae/model";
import { addNoise, CLEAN, denoiseStep, mse as dmse, noisePattern } from "../../src/labs/apps/denoise/model";
import { BATCH, fits, memory, onMachine, WIDE as WIDE_JOB } from "../../src/labs/apps/split/model";
import { CASES, judge, tally, type Mark } from "../../src/labs/apps/suite/model";

describe("a memory that fades", () => {
  it("forgets a cue when little memory survives, and keeps it when almost all survives", () => {
    expect(rnnStep(0, 1, 0.9)).toBeCloseTo(1); // the cue goes in whole, as the lessons count it
    expect(cueLeft(0.05).kept).toBeLessThan(0.2);
    expect(cueLeft(0.95).kept).toBeGreaterThan(0.5);
  });
});

describe("eight notes", () => {
  it("continues with the pitch that most often followed", () => {
    const c = transitions(SONG);
    expect(c[0]![2]).toBeGreaterThan(0);
    expect(nextOf(c, 0)).toBe(2);
    const next = continueSong(c, SONG.at(-1)!, 4);
    expect(next.every((n) => n >= 0 && n < PITCHES.length)).toBe(true);
    expect(next[0]).toBe(nextOf(c, 2));
  });
});

describe("a tiny face detector", () => {
  it("accepts the training shape and misses the wider face", () => {
    const proto = prototype(TRAIN);
    expect(likeness(proto, TRAIN[0]!.pixels)).toBeGreaterThan(FACE_LINE);
    const rows = judged(proto, TEST);
    expect(rows.find((r) => r.group === "wide")!.right).toBe(false);
    expect(rows.find((r) => r.group === "other")!.said).toBe(false);
    expect(likeness(proto, WIDE)).toBeLessThan(FACE_LINE);
  });
});

describe("a two-number code", () => {
  it("encodes a blob and decodes that code close to the picture", () => {
    const pic = paint(0.3, 0.45);
    const code = encode(pic);
    expect(code.x).toBeGreaterThan(0.2);
    expect(code.x).toBeLessThan(0.45);
    expect(mse(pic, decode(code.x, code.y))).toBeLessThan(mse(pic, decode(0.9, 0.9)));
  });
});

describe("one denoise step", () => {
  it("moves a noisy plus closer to the clean one", () => {
    const noisy = addNoise(CLEAN, 0.4, noisePattern().map(() => 0.5));
    const once = denoiseStep(noisy);
    expect(dmse(CLEAN, once)).toBeLessThan(dmse(CLEAN, noisy));
  });
});

describe("two machines", () => {
  it("fits a wide layer only when the layer is split, and a large batch when the examples are split", () => {
    expect(fits(WIDE_JOB, "data")).toBe(false);
    expect(fits(WIDE_JOB, "model")).toBe(true);
    expect(memory(WIDE_JOB, "model")).toBeLessThan(memory(WIDE_JOB, "data"));
    expect(fits(BATCH, "data")).toBe(true);
    // The large batch fits both ways (try3 says so); the lessons still split the examples there.
    expect(fits(BATCH, "model")).toBe(true);
  });

  it("shows the sums ai-d3 and ai-u4 quote: 16 + 1 × 16 = 32, 8 + 2 × 8 = 24, 4 + 4 × 4 = 20", () => {
    const sum = (j: typeof BATCH, how: "data" | "model") => { const m = onMachine(j, how); return [m.weights, m.examples, m.width, memory(j, how)]; };
    expect(sum(WIDE_JOB, "data")).toEqual([16, 1, 16, 32]);
    expect(sum(WIDE_JOB, "model")).toEqual([8, 2, 8, 24]);
    expect(sum(BATCH, "data")).toEqual([4, 4, 4, 20]);
    expect(sum(BATCH, "model")).toEqual([2, 8, 2, 18]);
  });
});

describe("a test with a refusal", () => {
  it("fails when a required refusal is marked pass", () => {
    const marks: Record<string, Mark | undefined> = Object.fromEntries(CASES.map((c) => [c.id, c.mustRefuse ? "refuse" : "pass"]));
    expect(tally(judge(CASES, marks)).missed).toBe(0);
    expect(tally(judge(CASES, marks)).right).toBe(CASES.length);
    marks.photo = "pass";
    expect(tally(judge(CASES, marks)).missed).toBe(1);
  });
});
