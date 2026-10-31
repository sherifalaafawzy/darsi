/**
 * A virtual Raspberry Pi Pico. The program runs on board time in the sandbox (code/pylib/machine.py): every pin change
 * is recorded as [ms, pin, kind, value], and the phone plays the recording back. What is wired to which pin:
 */
import type { BoardReport, BoardRun } from "../../../code/harness";

export const PIN = { button: 14, led: 15, buzzer: 16, light: 26, temp: 27 } as const;
/** Board time for one run, in seconds. */
export const SECONDS = 10;
/** The temperature sensor's reading is 0 at 0 °C and 65535 at 50 °C; the light sensor's 0 in the dark, 65535 in sun. */
export const MAX_C = 50;
export const tempRaw = (c: number) => Math.round((c / MAX_C) * 65535);
export const lightRaw = (pct: number) => Math.round((pct / 100) * 65535);

export type Press = "never" | "at3" | "held";
/** What the sandbox needs: the sensors' readings and the button, one value per second of board time. */
export function boardRun(light: number, temp: number, press: Press): BoardRun {
  const each = (v: number) => Array.from({ length: SECONDS }, () => v);
  return {
    seconds: SECONDS,
    sensors: { [PIN.light]: each(lightRaw(light)), [PIN.temp]: each(tempRaw(temp)) },
    buttons: { [PIN.button]: press === "never" ? [0] : press === "held" ? [1] : [0, 0, 0, 1, 0] },
  };
}

export type ExampleId = "blink" | "night" | "alarm";
export const EXAMPLES: Record<ExampleId, string> = {
  blink: `from machine import Pin
import time

led = Pin(15, Pin.OUT)
while True:
    led.on()
    time.sleep(0.5)
    led.off()
    time.sleep(0.5)
`,
  night: `from machine import Pin, ADC
import time

light = ADC(26)
led = Pin(15, Pin.OUT)
while True:
    level = light.read_u16()
    if level < 20000:
        led.on()
    else:
        led.off()
    time.sleep(1)
`,
  alarm: `from machine import Pin, ADC, PWM
import time

sensor = ADC(27)
buzzer = PWM(Pin(16))
button = Pin(14, Pin.IN, Pin.PULL_DOWN)
quiet = False
while True:
    celsius = sensor.read_u16() * 50 / 65535
    if button.value():
        quiet = True
    if celsius > 35 and not quiet:
        buzzer.freq(880)
        buzzer.duty_u16(32768)
    else:
        buzzer.duty_u16(0)
    time.sleep(0.5)
`,
};

type Events = BoardReport["events"];
/** A pin's level at board time t (ms): 0 or 1 from Pin writes, a fraction from a PWM duty. */
export function levelAt(events: Events, pin: number, t: number) {
  let v = 0;
  for (const [ms, p, kind, value] of events) { if (ms > t) break; if (p === pin && kind !== "freq") v = kind === "duty" ? value / 65535 : value; }
  return v;
}
/** The note a PWM pin was last set to play, in Hz. */
export function freqAt(events: Events, pin: number, t: number) {
  let v = 0;
  for (const [ms, p, kind, value] of events) { if (ms > t) break; if (p === pin && kind === "freq") v = value; }
  return v;
}
/** How long the playback runs: the whole board time if the program was still going, else just past its last change. */
export const endOf = (r: BoardReport) => (r.timeUp ? SECONDS * 1000 : Math.min(SECONDS * 1000, Math.max(0, ...r.events.map((e) => e[0])) + 500));
/** Board seconds pass this many times faster than real ones in the playback. */
export const SPEED = 2;
