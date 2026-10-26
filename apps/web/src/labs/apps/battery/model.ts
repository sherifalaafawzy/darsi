/**
 * Battery versus how often to send. A sensor node sleeps most of the time, wakes to measure, then switches its radio on
 * to send. Sending is by far the most expensive part, so how often it reports, and with which radio, decides whether
 * the battery lasts days or years.
 */
export const RADIOS = { wifi: { mA: 120, s: 2 }, lora: { mA: 40, s: 0.4 }, ble: { mA: 10, s: 0.05 } } as const; // current while sending, seconds per send
export type Radio = keyof typeof RADIOS;
export const BATTERIES = { coin: 220, aa: 2500, bank: 10000 } as const; // mAh
export type Battery = keyof typeof BATTERIES;
export const SLEEP_MA = 0.01, SENSE = { mA: 5, s: 0.1 };
/** Report intervals offered, in seconds: 10 s up to 6 h. */
export const INTERVALS = [10, 30, 60, 300, 900, 3600, 21600];

/** Average current (mA) and how it splits between sleeping, measuring and sending. */
export function budget(interval: number, radio: Radio) {
  const sense = (SENSE.mA * SENSE.s) / interval, send = (RADIOS[radio].mA * RADIOS[radio].s) / interval;
  return { sleep: SLEEP_MA, sense, send, total: SLEEP_MA + sense + send };
}
/** Battery life in days (real batteries give a bit less: self-discharge, cold, ageing). */
export const lifeDays = (mAh: number, avgMa: number) => mAh / avgMa / 24;
export const perDay = (interval: number) => Math.round(86400 / interval);
