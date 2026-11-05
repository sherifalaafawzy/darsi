export type Split = "data" | "model";

export interface Job { id: "wide" | "batch"; width: number; batch: number; machines: number; capacity: number }

/** A wide layer: each machine must hold the whole layer if it only splits examples. */
export const WIDE: Job = { id: "wide", width: 16, batch: 2, machines: 2, capacity: 28 };
/** A narrow layer and a long batch: splitting examples is enough. */
export const BATCH: Job = { id: "batch", width: 4, batch: 8, machines: 2, capacity: 22 };

/**
 * Memory of one machine for one training step.
 * Weights sit on the machine. Activations for the backward step are batch × width, split the same way.
 * Data parallel keeps every weight and a share of the examples.
 * Model parallel keeps a share of the layer, and that share of the activations.
 */
export function memory(job: Job, how: Split): number {
  const share = job.machines;
  if (how === "data") return job.width + (job.batch / share) * job.width;
  return job.width / share + job.batch * (job.width / share);
}

export const fits = (job: Job, how: Split) => memory(job, how) <= job.capacity;
