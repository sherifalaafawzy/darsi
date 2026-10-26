/**
 * Sensor day: a classroom thermometer from 07:00 to 15:00. The real temperature rises towards midday; each reading
 * adds the sensor's noise. Reading less often saves battery, averaging recent readings hides noise but reacts later,
 * and an alert fires when the smoothed value passes a threshold.
 */
import { rng } from "../../kit/rng";

export const START = 7 * 60, END = 15 * 60; // minutes since midnight
/** The real temperature (°C) at minute `t`: cool morning, warm early afternoon, a short dip when windows open at break. */
export function truth(t: number) {
  const h = (t - START) / 60;
  return 24 + 8 * Math.sin((Math.PI * Math.min(h, 7)) / 9) - (t >= 10 * 60 && t < 10 * 60 + 30 ? 2 : 0);
}

export interface Reading { t: number; v: number }
/** One reading every `every` minutes, with noise of the given size (°C, standard deviation). */
export function readings(every: number, noise: number, seed = 9): Reading[] {
  const r = rng(seed), out: Reading[] = [];
  for (let t = START; t <= END; t += every) out.push({ t, v: truth(t) + r.normal() * noise });
  return out;
}

/** Moving average of the last `window` readings. */
export const smooth = (rs: Reading[], window: number) => rs.map((x, i) => {
  const from = Math.max(0, i - window + 1), part = rs.slice(from, i + 1);
  return { t: x.t, v: part.reduce((s, p) => s + p.v, 0) / part.length };
});

/** Times the alert switches on (rising past the threshold). */
export const alerts = (rs: Reading[], threshold: number) => rs.filter((x, i) => x.v > threshold && (i === 0 || rs[i - 1].v <= threshold)).map((x) => x.t);

/** Alerts raised while the room was really below the threshold, and minutes the room was really too hot with no alert on. */
export function mistakes(rs: Reading[], threshold: number) {
  const falseAlerts = alerts(rs, threshold).filter((t) => truth(t) <= threshold).length;
  let missed = 0, i = -1;
  for (let t = START; t <= END; t++) {
    while (i + 1 < rs.length && rs[i + 1].t <= t) i++; // the latest reading so far
    if (truth(t) > threshold && !(i >= 0 && rs[i].v > threshold)) missed++;
  }
  return { falseAlerts, missed };
}
