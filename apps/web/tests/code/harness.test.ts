// @vitest-environment node
import { runInNode } from "./node";

// The harness that grades learners' code (src/code/harness.ts), in the MicroPython and SQLite the phone runs.
const py = (code: string, more: object = {}) => runInNode({ lang: "python", code, ...more });

describe("Python harness", () => {
  it("captures print, in any language, and reads input from the test", async () => {
    const [r] = await py(`name = input("Name? ")\nprint("Hello", name, sep=", ", end="!\\n")\nprint("مرحبا")`, { inputs: ["Amina"] });
    expect(r).toEqual({ out: "Name? Amina\nHello, Amina!\nمرحبا\n" });
  });

  it("grades each test: output, checks with their message, and fresh variables each time", async () => {
    const code = `n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)`;
    const runs = await py(code, { tests: [
      { input: ["3"], output: "6" },
      { input: ["4"], output: "10\n" },
      { input: ["5"], check: "assert total == 15, 'total should be 15'" },
      { input: ["5"], check: "assert total == 16, 'total should be 16'" },
      { input: ["2"], output: "4" },
    ] });
    expect(runs.map((r) => r.passed)).toEqual([true, true, true, false, false]);
    expect(runs[3].message).toBe("total should be 16");
  });

  it("reports errors with the learner's line, and a check that crashes", async () => {
    const [r] = await py(`x = 1\ny = 0\nprint(x / y)`);
    expect(r.error).toBe('Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nZeroDivisionError: divide by zero');
    expect(r.line).toBe(3);
    const [s] = await py(`if x > 1\n    print(x)`);
    expect(s.error).toContain("SyntaxError");
    const [c] = await py(`a = 1`, { tests: [{ check: "assert b == 1" }] });
    expect(c).toMatchObject({ passed: false, message: "NameError: name 'b' isn't defined" });
  });

  it("survives running out of memory and deep recursion, and cuts long output", async () => {
    // (Millions of small objects near the cap slow the GC to a crawl instead: on the phone the time limit ends those.)
    const [m] = await py(`x = []\nwhile True:\n    x.append(bytearray(1024 * 1024))`);
    expect(m.error).toContain("MemoryError");
    const [after] = await py(`print("still here")`);
    expect(after.out).toBe("still here\n");
    const [r] = await py(`def f(n):\n    return f(n + 1)\nf(0)`);
    expect(r.error).toContain("RuntimeError: maximum recursion depth exceeded");
    expect(r.error!.split("\n").length).toBeLessThanOrEqual(11);
    const [o] = await py(`for i in range(20000):\n    print(i)`); // 108 KB of output
    expect(o.out.length).toBeLessThan(20_010);
    expect(o.out.endsWith("…")).toBe(true);
  });

  it("sleeps on a virtual clock, and blocks the JavaScript bridge", async () => {
    const t0 = Date.now();
    const [s] = await py(`import time\nfor i in range(3):\n    time.sleep(10)\n    print(time.ticks_ms())`);
    expect(s.out).toBe("10000\n20000\n30000\n");
    expect(Date.now() - t0).toBeLessThan(2000);
    const [j] = await py(`import js\nprint(js)`);
    expect(j.out).toBe("None\n");
  });

  it("steps through a program: each line, its function and depth, and the variables then", async () => {
    const [r] = await py(`total = 0\nfor n in [2, 3]:\n    total += n\ndef double(x):\n    return x * 2\nbig = double(total)`, { trace: true });
    expect(r.trace!.map((s) => s.line)).toEqual([1, 2, 3, 2, 3, 2, 4, 6, 5]);
    expect(r.trace![4].vars).toEqual({ total: "2", n: "3" });
    expect(r.trace![8]).toMatchObject({ line: 5, fn: "double", depth: 1 });
    const [long] = await py(`for i in range(1000):\n    pass`, { trace: true });
    expect(long.trace).toHaveLength(300);
    expect(long.traceCut).toBe(true);
  });

  it("gives programs files, csv and numpy-style arrays", async () => {
    const code = `import csv\nwith open("marks.csv") as f:\n    rows = list(csv.DictReader(f))\nprint(len(rows), rows[1]["name"], sum(int(r["mark"]) for r in rows))\nfrom ulab import numpy as np\nprint(np.mean(np.array([1, 2, 3])))`;
    const [r] = await py(code, { files: [{ name: "marks.csv", text: 'name,mark\nAmina,9\n"Okafor, J",7\n' }] });
    expect(r).toEqual({ out: "2 Okafor, J 16\n2.0\n" });
  });
});

describe("SQL", () => {
  const setup = "CREATE TABLE pupils (name TEXT, class TEXT, mark INTEGER); INSERT INTO pupils VALUES ('Amina','5A',9),('Joseph','5A',7),('فاطمة','5B',10);";
  const sql = (code: string, solution?: string) => runInNode({ lang: "sql", code, setup, solution });
  it("returns the last statement's rows, in Arabic too", async () => {
    const [r] = await sql("SELECT name FROM pupils WHERE class = '5B'");
    expect(r.table).toEqual({ columns: ["name"], values: [["فاطمة"]] });
  });
  it("grades against the solution's rows: any order unless it sorts, any column names", async () => {
    expect((await sql("SELECT name AS who FROM pupils WHERE mark > 8", "SELECT name FROM pupils WHERE mark >= 9"))[0].passed).toBe(true);
    expect((await sql("SELECT name FROM pupils ORDER BY name DESC", "SELECT name FROM pupils ORDER BY name"))[0].passed).toBe(false);
    expect((await sql("SELECT name FROM pupils ORDER BY mark", "SELECT name FROM pupils"))[0].passed).toBe(true);
    expect((await sql("SELECT AVG(mark) FROM pupils", "SELECT 26.0 / 3"))[0].passed).toBe(true);
  });
  it("reports errors", async () => {
    const [r] = await sql("SELEC name FROM pupils", "SELECT name FROM pupils");
    expect(r).toMatchObject({ error: expect.stringContaining("syntax error"), passed: false });
  });
});
