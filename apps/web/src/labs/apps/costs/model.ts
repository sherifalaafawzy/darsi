/**
 * "What an agent costs": one request measured with Darsi Tiny on this phone, and the same request estimated for a big
 * cloud model over a mobile network. Darsi Tiny's numbers are measured (tokens, time) or from its files (download
 * size); everything about the cloud is a typical figure, labelled as such in the lab, and the learner can change the
 * data price.
 */

/** One request as Darsi Tiny ran it: one entry per generation (its plan, then each call or the answer). */
export interface Gen { kind: "plan" | "act"; prompt: number; reused: number; wrote: number; ms: number }

export interface Measured { steps: number; trips: number; read: number; wrote: number; ms: number; promptPerTrip: number[]; wrotePerTrip: number[] }
/** Totals of a request: tokens read anew (not from the cache), written, and the model's time. */
export function measure(gens: readonly Gen[]): Measured {
  const acts = gens.filter((g) => g.kind === "act");
  // A cloud model writes the plan and the call in one reply, so each "act" is one round trip and the plan joins the first.
  const plan = gens.filter((g) => g.kind === "plan").reduce((a, g) => a + g.wrote, 0);
  return {
    steps: gens.length, trips: acts.length,
    read: gens.reduce((a, g) => a + g.prompt - g.reused, 0), wrote: gens.reduce((a, g) => a + g.wrote, 0), ms: gens.reduce((a, g) => a + g.ms, 0),
    promptPerTrip: acts.map((g) => g.prompt), wrotePerTrip: acts.map((g, i) => g.wrote + (i === 0 ? plan : 0)),
  };
}

export type Net = "2g" | "3g" | "4g";
/** Typical mobile networks: speeds in bits a second, round-trip time in seconds, radio power in watts while busy, and the
 *  seconds the radio stays powered after a transfer ("tail") at about half that power. */
export const NETS: Record<Net, { down: number; up: number; rtt: number; watts: number; tail: number }> = {
  "2g": { down: 200e3, up: 100e3, rtt: 0.6, watts: 1.0, tail: 3 },
  "3g": { down: 2e6, up: 1e6, rtt: 0.2, watts: 1.2, tail: 8 },
  "4g": { down: 15e6, up: 5e6, rtt: 0.06, watts: 1.5, tail: 10 },
};

/** A typical big cloud model behind an agent (2026). */
export const CLOUD = {
  /** The ten tools described as JSON for the model, sent with every request. */
  toolTokens: 1200,
  /** Bytes per token of text on the wire (English; Arabic is more). */
  bytesPerToken: 4,
  /** Headers and JSON around each request and each reply. */
  overheadUp: 800, overheadDown: 600,
  /** A secure (TLS) connection: about 5 KB and two round trips, once per request on a phone whose radio sleeps between them. */
  tlsBytes: 5000, tlsTrips: 2,
  /** Seconds before the first word, then words a second. */
  firstToken: 0.6, tokensPerSecond: 60,
  /** US dollars per million tokens read and written (typical list prices of a large model; they vary). */
  priceIn: 3, priceOut: 15,
};

/** A phone: the processor's power when the model runs, the battery (4,000 mAh at 3.85 V), and how much slower an old
 *  phone is than this device (tools/tinylm/MODEL_CARD.md measured Darsi Tiny with the CPU slowed 6×). */
export const PHONE = { cpuWatts: 2, batteryJoules: 4 * 3.85 * 3600, oldPhone: 6 };

export interface Cost { bytes: number; seconds: number; dollars: number; dataDollars: number; joules: number; tokensIn: number; tokensOut: number }

/** The same request for a big cloud model over a network (typical figures). */
export function cloud(m: Measured, net: Net, dollarsPerGB: number): Cost {
  const n = NETS[net], c = CLOUD;
  let up = c.tlsBytes, down = 0, seconds = c.tlsTrips * n.rtt, tokensIn = 0, tokensOut = 0;
  m.promptPerTrip.forEach((p, i) => {
    const tin = c.toolTokens + p, tout = m.wrotePerTrip[i] ?? 0;
    const u = tin * c.bytesPerToken + c.overheadUp, d = tout * c.bytesPerToken + c.overheadDown;
    tokensIn += tin; tokensOut += tout; up += u; down += d;
    seconds += n.rtt + (u * 8) / n.up + c.firstToken + tout / c.tokensPerSecond + (d * 8) / n.down;
  });
  const bytes = up + down;
  const dataDollars = (bytes / 1e9) * dollarsPerGB;
  const dollars = (tokensIn * c.priceIn + tokensOut * c.priceOut) / 1e6 + dataDollars;
  const joules = seconds * n.watts + n.tail * n.watts * 0.5;
  return { bytes, seconds, dollars, dataDollars, joules, tokensIn, tokensOut };
}

/** Darsi Tiny on the phone: no data, no fee; time measured here, and the battery an old phone would use. */
export function tiny(m: Measured): Cost & { oldSeconds: number } {
  const oldSeconds = (m.ms / 1000) * PHONE.oldPhone;
  return { bytes: 0, seconds: m.ms / 1000, oldSeconds, dollars: 0, dataDollars: 0, joules: oldSeconds * PHONE.cpuWatts, tokensIn: m.read, tokensOut: m.wrote };
}

/** Share of a full battery. */
export const batteryPct = (joules: number) => (100 * joules) / PHONE.batteryJoules;
/** How many cloud requests use as much data as downloading Darsi Tiny once. */
export const breakEven = (downloadBytes: number, perRequest: number) => (perRequest > 0 ? Math.ceil(downloadBytes / perRequest) : Infinity);
