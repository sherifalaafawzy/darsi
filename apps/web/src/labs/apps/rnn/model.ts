/** One recurrent step: h ← memory · h + tanh(x). `memory` is how much of the hidden state survives. */
export const rnnStep = (h: number, x: number, memory: number) => memory * h + Math.tanh(x);

/** Hidden state after each symbol. The sequence starts at h = 0. */
export function rnnRun(seq: number[], memory: number): number[] {
  const out: number[] = [];
  let h = 0;
  for (const x of seq) { h = rnnStep(h, x, memory); out.push(h); }
  return out;
}

/**
 * The first symbol is the cue (1 or -1). The rest are 0. A memory near 1 still carries the cue at the end;
 * a memory near 0 has forgotten it. `kept` is how much of the cue's sign remains.
 */
export function cueLeft(memory: number, steps = 4, cue = 1): { states: number[]; kept: number } {
  const states = rnnRun([cue, ...Array(steps - 1).fill(0)], memory);
  const last = states[states.length - 1] ?? 0;
  return { states, kept: last / cue };
}
