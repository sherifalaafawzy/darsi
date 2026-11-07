// @vitest-environment node
// The Programming track's labs (code-basics, code-algorithms) and the IoT virtual board. The sandbox apps' programs run
// in the same MicroPython and harness as on the phone (tests/code/node.ts).
import { LEVELS, best, fold, repeat, run, stars } from "../../src/labs/apps/robot/model";
import { binaryGuesses, judge, linearSteps, middle, narrow, parseNumber, racePace, worstBinary, worstLinear } from "../../src/labs/apps/search/model";
import { PUZZLES, choices, peek, put, simulate, take } from "../../src/labs/apps/stack/model";
import { ALGOS, isSorted, makeBars, ops, pace, replay } from "../../src/labs/apps/sorting/model";
import { at, calls, fewestMoves, fibCalls, fibCallsRemembered, hanoi, layout, move, solved, startPegs } from "../../src/labs/apps/recursion/model";
import { count, curve, duration, estimate, ratio, seconds } from "../../src/labs/apps/bigo/model";
import { EXAMPLES as TRACES, changed, names, stackAt } from "../../src/labs/apps/trace/model";
import { BUGS, parseError, same } from "../../src/labs/apps/bugs/model";
import { EXAMPLES as BOARD, PIN, SECONDS, boardRun, endOf, freqAt, levelAt, tempRaw } from "../../src/labs/apps/board/model";
import { runInNode } from "../code/node";
import type { RobotBlock } from "../../src/content/types";

describe("robot", () => {
  it("every level can be solved within its cards, and they get harder", () => {
    const fewest = LEVELS.map(best);
    expect(fewest).toEqual([1, 2, 3, 6, 5, 9]);
    LEVELS.forEach((l, i) => expect(fewest[i], `level ${i + 1}`).toBeLessThanOrEqual(l.maxCards - 1));
  });

  it("runs a program to the goal, and folds repeated cards into one", () => {
    const corner: RobotBlock[] = [{ cmd: "forward", times: 3 }, { cmd: "right", times: 1 }, { cmd: "forward", times: 3 }];
    expect(run(LEVELS[2], corner).outcome).toBe("goal");
    const long: RobotBlock[] = [{ cmd: "forward", times: 1 }, { cmd: "forward", times: 1 }, { cmd: "forward", times: 1 }, { cmd: "right", times: 1 }, { cmd: "forward", times: 3 }];
    expect(fold(long)).toEqual(corner);
    expect(run(LEVELS[2], long).path).toEqual(run(LEVELS[2], corner).path);
    expect(run(LEVELS[0], [{ cmd: "forward", times: 4 }, { cmd: "forward", times: 1 }]).outcome).toBe("edge");
    expect(run(LEVELS[3], [{ cmd: "forward", times: 2 }]).outcome).toBe("wall");
  });

  it("repeats a card 1–4 times, and gives stars for few cards", () => {
    let p: RobotBlock[] = [{ cmd: "left", times: 1 }];
    for (const want of [2, 3, 4, 1]) { p = repeat(p, 0); expect(p[0].times).toBe(want); }
    expect([stars(5, 5), stars(6, 5), stars(9, 5)]).toEqual([3, 2, 1]);
  });
});

describe("search", () => {
  it("binary search halves what is left and never needs more than about log₂ n guesses", () => {
    for (const n of [10, 100, 1000]) for (let s = 1; s <= n; s += Math.ceil(n / 37)) {
      const g = binaryGuesses(n, s);
      expect(g[g.length - 1]).toBe(s);
      expect(g.length).toBeLessThanOrEqual(worstBinary(n));
    }
    expect([worstBinary(10), worstBinary(100), worstBinary(1000)]).toEqual([4, 7, 10]);
    expect(Math.max(...Array.from({ length: 1000 }, (_, i) => binaryGuesses(1000, i + 1).length))).toBe(10);
    expect([linearSteps(700), worstLinear(1000)]).toEqual([700, 1000]);
  });

  it("answers higher or lower and narrows the range", () => {
    expect([judge(42, 50), judge(42, 10), judge(42, 42)]).toEqual(["lower", "higher", "found"]);
    expect(narrow(1, 100, middle(1, 100), judge(42, 50))).toEqual([1, 49]);
    expect(narrow(1, 49, 25, "higher")).toEqual([26, 49]);
  });

  it("reads typed numbers in any digits, and paces the race to about 6 seconds", () => {
    expect([parseNumber("42"), parseNumber("٤٢"), parseNumber("۴۲"), parseNumber(" 1,000 "), parseNumber("4.5"), parseNumber("")]).toEqual([42, 42, 42, 1000, null, null]);
    expect(racePace(600)).toBe(100);
    expect(racePace(3)).toBe(2);
  });
});

describe("stack and queue", () => {
  it("a stack gives back the newest first, a queue the oldest", () => {
    const items = put(put(put([] as string[], "a"), "b"), "c");
    expect(take("stack", items).item).toBe("c");
    expect(take("queue", items).item).toBe("a");
    expect([peek("stack", items), peek("queue", items)]).toEqual(["c", "a"]);
    expect(take("stack", []).item).toBeUndefined();
    expect(simulate("stack", PUZZLES[0])).toEqual(["C", "B", "D"]);
    expect(simulate("queue", PUZZLES[0])).toEqual(["A", "B", "C"]);
  });

  it("offers three different answers with the right one among them", () => {
    for (const ops of PUZZLES) for (const kind of ["stack", "queue"] as const) {
      const c = choices(kind, ops);
      expect(c).toHaveLength(3);
      expect(new Set(c.map((x) => x.join())).size).toBe(3);
      expect(c.map((x) => x.join())).toContain(simulate(kind, ops).join());
    }
  });
});

describe("sorting", () => {
  it("every algorithm sorts every kind of starting order", () => {
    for (const n of [8, 16, 32]) for (const order of ["random", "nearly", "reversed"] as const) {
      const bars = makeBars(n, order);
      expect([...bars].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      for (const a of ALGOS) { const r = replay(bars, ops(a, bars), Infinity); expect(isSorted(r.bars), `${a} ${order} ${n}`).toBe(true); expect(r.done).toBe(true); }
    }
  });

  it("counts what each one is known for", () => {
    const rev = makeBars(8, "reversed"), sorted = Array.from({ length: 8 }, (_, i) => i + 1);
    const c = (a: (typeof ALGOS)[number], bars: number[]) => replay(bars, ops(a, bars), Infinity);
    expect(c("bubble", rev)).toMatchObject({ cmps: 28, moves: 28 });
    expect(c("insertion", sorted)).toMatchObject({ cmps: 7, moves: 0 }); // already sorted: one look each
    expect(c("bubble", sorted)).toMatchObject({ cmps: 7, moves: 0 });
    expect(c("selection", sorted).cmps).toBe(28); // always looks at every pair
    expect(c("selection", rev).moves).toBeLessThanOrEqual(7); // but swaps at most n − 1 times
    const big = makeBars(32, "random");
    expect(c("merge", big).cmps).toBeLessThanOrEqual(32 * 5);
    expect(c("bubble", big).cmps).toBeGreaterThan(c("merge", big).cmps * 2);
    expect(c("insertion", makeBars(32, "nearly")).cmps).toBeLessThan(c("merge", makeBars(32, "nearly")).cmps);
  });

  it("makes a nearly sorted list that is never already sorted, so insertion sort wins at every size", () => {
    const work = (a: (typeof ALGOS)[number], bars: number[]) => ops(a, bars).length;
    for (const n of [8, 16, 32]) for (const seed of [1, 2, 3, 7, 42, 99]) {
      const bars = makeBars(n, "nearly", seed);
      expect(isSorted(bars), `${n} bars, seed ${seed}`).toBe(false);
      expect([...bars].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(work("insertion", bars), `${n} bars, seed ${seed}`).toBeLessThan(work("bubble", bars));
    }
  });

  it("gives the counts the lab's first try and code-s3 quote (8, then 32 mixed-up bars)", () => {
    const c = (a: (typeof ALGOS)[number], n: number) => replay(makeBars(n, "random"), ops(a, makeBars(n, "random")), Infinity).cmps;
    expect([c("bubble", 8), c("bubble", 32)]).toEqual([28, 496]);
    expect([c("merge", 8), c("merge", 32)]).toEqual([16, 123]);
  });

  it("replays part of the way, and paces the race", () => {
    const bars = makeBars(8, "reversed"), steps = ops("bubble", bars);
    const r = replay(bars, steps, 2);
    expect(r).toMatchObject({ cmps: 1, moves: 1, done: false });
    expect(r.bars.slice(0, 2)).toEqual([7, 8]);
    expect(r.last).toEqual({ t: "swap", i: 0, j: 1 });
    expect(pace(40)).toBe(4);
    expect(pace(1000)).toBe(50);
  });
});

describe("recursion", () => {
  it("factorial makes a chain of calls and answers on the way back", () => {
    const { calls: c, events } = calls("fact", 5);
    expect(c.map((x) => x.n)).toEqual([5, 4, 3, 2, 1]);
    expect(c[0].value).toBe(120);
    expect(events).toHaveLength(10);
    expect(at(events, 5).stack).toEqual([0, 1, 2, 3, 4]); // all five waiting
    expect(at(events, 6)).toMatchObject({ stack: [0, 1, 2, 3] });
    expect([...at(events, 10).done]).toHaveLength(5);
  });

  it("Fibonacci repeats work: the calls grow almost as fast as the answer", () => {
    const { calls: c } = calls("fib", 6);
    expect(c[0].value).toBe(8);
    expect(c).toHaveLength(fibCalls(6));
    expect([fibCalls(5), fibCalls(10), fibCalls(20)]).toEqual([15, 177, 21891]);
    expect(c.filter((x) => x.n === 2)).toHaveLength(5); // fib(2) is worked out five times
    // Every call, the ones answered from the dictionary too, as the course's memo code counts them (fib(30): 59).
    const memoCalls = (n: number) => {
      const memo = new Map<number, number>();
      let k = 0;
      const fib = (m: number): number => { k++; if (memo.has(m)) return memo.get(m)!; if (m < 2) return m; const v = fib(m - 1) + fib(m - 2); memo.set(m, v); return v; };
      fib(n);
      return k;
    };
    for (const n of [0, 1, 2, 5, 10, 20, 30, 40]) expect(fibCallsRemembered(n), `fib(${n})`).toBe(memoCalls(n));
    expect([fibCallsRemembered(30), fibCallsRemembered(40)]).toEqual([59, 79]);
    const l = layout(c);
    expect(l.width).toBe(c.filter((x) => !x.children.length).length);
    expect(l.depth).toBe(6);
    expect(l.x[0]).toBeGreaterThan(0);
  });

  it("solves the Towers of Hanoi in 2ⁿ − 1 moves, all allowed", () => {
    for (let n = 1; n <= 6; n++) {
      const moves = hanoi(n);
      expect(moves).toHaveLength(fewestMoves(n));
      let pegs = startPegs(n);
      for (const [a, b] of moves) { const next = move(pegs, a, b); expect(next).not.toBeNull(); pegs = next!; }
      expect(solved(pegs, n)).toBe(true);
    }
    expect(move([[3, 2], [1], []], 0, 1)).toBeNull(); // a bigger disc can't go on a smaller one
    expect(move([[3], [], []], 1, 2)).toBeNull(); // nothing to move
  });
});

describe("how work grows", () => {
  it("counts the comparisons each job really makes", () => {
    expect(count("n", 100)).toBe(99);
    expect(count("n2", 100)).toBe(4950);
    expect(count("log", 1000)).toBe(10);
    const m = count("nlogn", 1000);
    expect(m).toBeGreaterThan(8000);
    expect(m).toBeLessThanOrEqual(estimate("nlogn", 1000));
    expect(count("n2", 0)).toBe(0);
  });

  it("doubling the job doubles n, a bit more than doubles n log n, and quadruples n²", () => {
    expect(ratio("n", 500)).toBeCloseTo(2, 1);
    expect(ratio("nlogn", 500)).toBeGreaterThan(2);
    expect(ratio("nlogn", 500)).toBeLessThan(2.4);
    expect(ratio("n2", 500)).toBeCloseTo(4, 1);
    expect(ratio("log", 500)).toBeLessThan(1.2);
  });

  it("works out the time for a million on a phone", () => {
    expect(seconds(estimate("n", 1e6))).toBeLessThan(0.2);
    expect(seconds(estimate("nlogn", 1e6))).toBeLessThan(3);
    expect(seconds(estimate("n2", 1e6)) / 3600).toBeGreaterThan(10); // hours
    expect([duration(1e-4), duration(0.0123), duration(2), duration(5e4), duration(3e5)]).toEqual([
      { n: 0, unit: "instant" }, { n: 12, unit: "ms" }, { n: 2, unit: "s" }, { n: 14, unit: "h" }, { n: 3.5, unit: "d" }]);
    const c = curve("n2", 100, 10);
    expect(c[0]).toEqual([0, 0]);
    expect(c[10]).toEqual([100, 4950]);
  });
});

describe("step through (trace)", () => {
  it("records each example line by line with its variables", async () => {
    const [loop] = await runInNode({ lang: "python", code: TRACES.loop, trace: true });
    expect(loop.out).toBe("Total: 10\n");
    expect(loop.trace!.map((s) => s.vars.total).filter(Boolean)).toContain("6");
    expect(names(loop.trace!)).toEqual(["total", "n"]);
    const k = loop.trace!.findIndex((s) => s.vars.total === "1");
    expect([...changed(loop.trace![k - 1], loop.trace![k])]).toEqual(["total"]);

    const [branch] = await runInNode({ lang: "python", code: TRACES.ifelse, trace: true });
    expect(branch.out).toBe("12 pass\n7 try again\n15 pass\n2 passed\n");
    // After `passed = passed + 1` (line 6) comes the print (line 9), never the else branch (line 8).
    const lines = branch.trace!.map((s) => s.line);
    lines.forEach((l, i) => { if (l === 6) expect(lines[i + 1]).toBe(9); });

    const [fn] = await runInNode({ lang: "python", code: TRACES.function, trace: true });
    expect(fn.out).toBe("Room: 12\nYard: 60\n");
    const inside = fn.trace!.findIndex((s) => s.depth === 1);
    expect(fn.trace![inside].fn).toBe("area");
    expect(stackAt(fn.trace!, inside)).toEqual([{ fn: "<module>", line: 5 }, { fn: "area", line: 2 }]);
    expect(stackAt(fn.trace!, fn.trace!.length - 1)).toHaveLength(1);
  });
});

describe("bugs", () => {
  it("each bug fails (an error, or the wrong output) and its fix prints what was wanted", async () => {
    const want: Record<string, [string, number] | null> = { colon: ["syntax", 1], equals: ["syntax", 2], offbyone: null, indent: ["syntax", 3], name: ["name", 3], text: ["type", 2] };
    for (const b of BUGS) {
      const [r] = await runInNode({ lang: "python", code: b.code });
      const w = want[b.id];
      if (w) { expect(parseError(r.error!).kind, b.id).toBe(w[0]); expect(r.line, b.id).toBe(w[1]); }
      else { expect(r.error).toBeUndefined(); expect(same(r.out, b.output)).toBe(false); }
      const [f] = await runInNode({ lang: "python", code: b.fixed });
      expect(f.error, b.id).toBeUndefined();
      expect(same(f.out, b.output), b.id).toBe(true);
    }
  });

  it("reads an error's name and message", () => {
    expect(parseError("Traceback (most recent call last):\n  File \"main.py\", line 3, in <module>\nNameError: name 'scor' isn't defined"))
      .toEqual({ name: "NameError", message: "name 'scor' isn't defined", kind: "name" });
    expect(parseError("SyntaxError: invalid syntax").kind).toBe("syntax");
    expect(parseError("something odd").kind).toBe("other");
    expect(same("1\n2  \n", "1\n2")).toBe(true);
  });
});

describe("the virtual board", () => {
  it("blinks, lights up in the dark, and sounds the alarm until the button is pressed", async () => {
    const [blink] = await runInNode({ lang: "python", code: BOARD.blink, board: boardRun(80, 20, "never") });
    expect(blink.board!.timeUp).toBe(true);
    expect([levelAt(blink.board!.events, PIN.led, 250), levelAt(blink.board!.events, PIN.led, 750)]).toEqual([1, 0]);

    for (const [light, on] of [[10, 1], [90, 0]] as const) {
      const [night] = await runInNode({ lang: "python", code: BOARD.night, board: boardRun(light, 20, "never") });
      expect(levelAt(night.board!.events, PIN.led, 5000), `light ${light}%`).toBe(on);
    }

    const [hot] = await runInNode({ lang: "python", code: BOARD.alarm, board: boardRun(50, 40, "at3") });
    const ev = hot.board!.events;
    expect(levelAt(ev, PIN.buzzer, 1000)).toBeGreaterThan(0);
    expect(freqAt(ev, PIN.buzzer, 1000)).toBe(880);
    expect(levelAt(ev, PIN.buzzer, 4000)).toBe(0); // quiet once the button was pressed at second 3
    const [cool] = await runInNode({ lang: "python", code: BOARD.alarm, board: boardRun(50, 25, "never") });
    expect(levelAt(cool.board!.events, PIN.buzzer, 1000)).toBe(0);
    expect(endOf(hot.board!)).toBe(SECONDS * 1000);
  });

  it("maps the sliders to the sensors' readings, one per second", () => {
    const b = boardRun(50, 25, "held");
    expect(b.sensors[PIN.light]).toHaveLength(SECONDS);
    expect(b.sensors[PIN.light][0]).toBe(32768);
    expect(b.sensors[PIN.temp][0]).toBe(tempRaw(25));
    expect(b.buttons[PIN.button]).toEqual([1]);
    expect(endOf({ events: [[1200, 15, "pin", 1]], pins: {}, timeUp: false })).toBe(1700);
  });
});
