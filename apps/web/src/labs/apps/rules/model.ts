/**
 * A smart classroom runs IF/THEN rules every five minutes of the school day on its sensors: temperature, daylight,
 * carbon dioxide (stale air from breathing) and whether a class is in. Rules trade comfort against energy.
 */
export const START = 7 * 60, END = 15 * 60, STEP = 5;
export interface Moment { t: number; temp: number; light: number; co2: number; occupied: boolean }
export interface Rules { fan: { on: boolean; above: number }; lights: { on: boolean; below: number; onlyIfOccupied: boolean }; window: { on: boolean; above: number } }
export const RULES: Rules = { fan: { on: true, above: 29 }, lights: { on: true, below: 300, onlyIfOccupied: true }, window: { on: true, above: 1000 } };

const lessons = [[7 * 60 + 30, 9 * 60], [9 * 60 + 15, 10 * 60 + 45], [11 * 60 + 15, 12 * 60 + 45], [13 * 60 + 30, 14 * 60 + 45]];
export const occupiedAt = (t: number) => lessons.some(([a, b]) => t >= a && t < b);

/** The day's sensor readings before any device acts: warm afternoon, a cloudy spell, CO2 rising while a class is in. */
export function day(): Moment[] {
  const out: Moment[] = [];
  let co2 = 450;
  for (let t = START; t <= END; t += STEP) {
    const h = (t - START) / 60, occupied = occupiedAt(t);
    co2 += occupied ? 45 : -60; co2 = Math.max(420, co2);
    const cloud = t >= 11 * 60 && t < 12 * 60 + 30 ? 0.35 : 1;
    out.push({ t, occupied, co2, temp: 23 + 8 * Math.sin((Math.PI * Math.min(h, 7)) / 9), light: Math.round((150 + 450 * Math.sin((Math.PI * Math.min(h + 1, 9)) / 10)) * cloud) });
  }
  return out;
}

/** Runs the rules through the day. Devices act on the room: the fan cools a little, an open window clears the air. */
export function simulate(r: Rules) {
  const kWh = { fan: 0.06, lights: 0.4 }; // per hour while on
  let energy = 0, hot = 0, dark = 0, stuffy = 0, co2Offset = 0;
  const steps = day().map((m) => {
    const co2 = Math.max(420, m.co2 - co2Offset);
    const fan = r.fan.on && m.temp > r.fan.above;
    const lights = r.lights.on && m.light < r.lights.below && (!r.lights.onlyIfOccupied || m.occupied);
    const window = r.window.on && co2 > r.window.above;
    if (window) co2Offset += 120;
    const feels = m.temp - (fan ? 2 : 0), seen = m.light + (lights ? 400 : 0);
    if (m.occupied) { if (feels > 30) hot += STEP; if (seen < 300) dark += STEP; if (co2 > 1200) stuffy += STEP; }
    energy += ((fan ? kWh.fan : 0) + (lights ? kWh.lights : 0)) * (STEP / 60);
    return { ...m, co2, fan, lights, window };
  });
  return { steps, energy, hot, dark, stuffy };
}
