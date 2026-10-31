/**
 * Step through a program: the sandbox records each line as it runs and the program's variables then (code/harness.ts,
 * at most 300 steps). This keeps the examples and works out what changed from one step to the next.
 */
import type { TraceStep } from "../../../code/harness";

export type ExampleId = "loop" | "ifelse" | "function";
export const EXAMPLES: Record<ExampleId, string> = {
  loop: `total = 0
for n in range(1, 5):
    total = total + n
print("Total:", total)
`,
  // A line after the if/else inside the loop: MicroPython reports a jump at the end of a loop body as the else's line.
  ifelse: `marks = [12, 7, 15]
passed = 0
for m in marks:
    if m >= 10:
        result = "pass"
        passed = passed + 1
    else:
        result = "try again"
    print(m, result)
print(passed, "passed")
`,
  function: `def area(width, height):
    size = width * height
    return size

room = area(4, 3)
yard = area(10, 6)
print("Room:", room)
print("Yard:", yard)
`,
};

/** The variables that are new or different since the step before. */
export function changed(prev: TraceStep | undefined, cur: TraceStep | undefined): Set<string> {
  const out = new Set<string>();
  if (!cur) return out;
  for (const [k, v] of Object.entries(cur.vars)) if (!prev || prev.vars[k] !== v) out.add(k);
  return out;
}

/** Every variable the program makes, in the order it first appears (Python's own order can change between steps). */
export function names(trace: TraceStep[]): string[] {
  const seen: string[] = [];
  for (const s of trace) for (const k of Object.keys(s.vars)) if (!seen.includes(k)) seen.push(k);
  return seen;
}

/** Where the program is at step k: the line each function still running is on, the program itself first. */
export function stackAt(trace: TraceStep[], k: number): { fn: string; line: number }[] {
  const out: { fn: string; line: number }[] = [];
  for (let i = 0; i <= k && i < trace.length; i++) {
    const s = trace[i];
    out.length = Math.min(out.length, s.depth);
    out[s.depth] = { fn: s.fn, line: s.line };
  }
  return out;
}

/** Playing the steps: one every this many milliseconds. */
export const PACE_MS = 900;
