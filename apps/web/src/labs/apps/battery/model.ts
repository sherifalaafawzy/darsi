/**
 * Battery versus how often to send. A sensor node sleeps most of the time, wakes to measure, then switches its radio on
 * to send. Sending is by far the most expensive part, so how often it reports, and with which radio, decides whether
 * the battery lasts days or years.
 */
export const RADIOS = { wifi: { mA: 120, s: 2 }, lora: { mA: 40, s: 0.4 }, ble: { mA: 10, s: 0.05 } } as const; // current while sending, seconds per send
export type Radio = keyof typeof RADIOS;
export const BATTERIES = { coin: 220, aa: 2500, bank: 10000 } as const; // mAh
export type Battery = keyof typeof BATTERIES;
/**
 * Share of its charge a battery loses in a year all by itself (self-discharge): a lithium coin cell about 1 %, alkaline
 * AA cells about 3 %, the lithium-ion cells in a power bank 2–3 % a month. It counts as a small current that never stops.
 */
export const LEAK = { coin: 0.01, aa: 0.03, bank: 0.3 } as const;
export const leakMa = (b: Battery) => (BATTERIES[b] * LEAK[b]) / (365 * 24);
/** The most current each battery can give at once (mA). A coin cell can't feed a radio's bursts above about 20 mA. */
export const PEAK_MA = { coin: 20, aa: 1000, bank: 2000 } as const;
export const tooWeak = (b: Battery, r: Radio) => RADIOS[r].mA > PEAK_MA[b];
export const SLEEP_MA = 0.01, SENSE = { mA: 5, s: 0.1 };
/** Report intervals offered, in seconds: 10 s up to 6 h. */
export const INTERVALS = [10, 30, 60, 300, 900, 3600, 21600];

/** Average current (mA) and how it splits between sleeping, measuring, sending and the battery's own leak. */
export function budget(interval: number, radio: Radio, battery: Battery = "aa") {
  const sense = (SENSE.mA * SENSE.s) / interval, send = (RADIOS[radio].mA * RADIOS[radio].s) / interval, leak = leakMa(battery);
  return { sleep: SLEEP_MA, sense, send, leak, total: SLEEP_MA + sense + send + leak };
}
/** Battery life in days, for an average current that includes the leak (cold and ageing take a little more). */
export const lifeDays = (mAh: number, avgMa: number) => mAh / avgMa / 24;
export const perDay = (interval: number) => Math.round(86400 / interval);
