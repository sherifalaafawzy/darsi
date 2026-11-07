export type Split = "data" | "model";

export interface Job { id: "wide" | "batch"; width: number; batch: number; machines: number; capacity: number }

/** A wide layer: each machine must hold the whole layer if it only splits examples. */
export const WIDE: Job = { id: "wide", width: 16, batch: 2, machines: 2, capacity: 28 };
/** A narrow layer and a large batch: splitting examples is enough. */
export const BATCH: Job = { id: "batch", width: 4, batch: 8, machines: 2, capacity: 22 };

/**
 * What one machine holds for one training step, as the sum the lab shows: weights + examples × activations per example.
 * Weights sit on the machine. Activations for the backward step are batch × width, split the same way.
 * Data parallel keeps every weight and a share of the examples ("16 + 1 × 16").
 * Model parallel keeps a share of the layer, and that share of the activations for every example ("8 + 2 × 8").
 */
export function onMachine(job: Job, how: Split): { weights: number; examples: number; width: number } {
  const share = job.machines;
  if (how === "data") return { weights: job.width, examples: job.batch / share, width: job.width };
  return { weights: job.width / share, examples: job.batch, width: job.width / share };
}

/** Memory of one machine for one training step. */
export function memory(job: Job, how: Split): number {
  const m = onMachine(job, how);
  return m.weights + m.examples * m.width;
}

export const fits = (job: Job, how: Split) => memory(job, how) <= job.capacity;
