/**
 * An LED with a resistor and a battery. The LED takes a fixed share of the voltage (its forward voltage); the resistor
 * takes the rest, and Ohm's law (I = V / R) gives the current. Too little current and the LED is dim or dark; too much
 * and it burns out.
 */
export const LEDS = { red: 2.0, green: 2.2, blue: 3.0 } as const; // forward voltage (V)
export type Colour = keyof typeof LEDS;
export const RESISTORS = [0, 47, 100, 220, 470, 1000, 10000];
export const BATTERIES = [3, 4.5, 9];
/** mAh: 3 V and 4.5 V are 2 or 3 AA cells in series (in series the volts add up, the mAh don't); a 9 V battery holds far less. */
export const CAPACITY: Record<number, number> = { 3: 2000, 4.5: 2000, 9: 500 };
export const SAFE = 0.02, BURN = 0.03; // amps: a typical LED wants about 20 mA and dies above about 30 mA
export const DIM = 0.005; // below about 5 mA (a quarter of its usual current) a standard LED is clearly dim
export const WIRE = 1; // ohms in the battery and wires, so a missing resistor gives a huge (not infinite) current

export function led(volts: number, ohms: number, colour: Colour) {
  const vf = LEDS[colour], left = volts - vf;
  if (left <= 0) return { amps: 0, state: "off" as const, glow: 0, resistorVolts: 0, watts: 0 };
  const amps = left / (ohms + WIRE);
  const state = amps > BURN ? "burnt" as const : amps < DIM ? "dim" as const : amps <= SAFE ? "good" as const : "bright" as const;
  return { amps, state, glow: state === "burnt" ? 0 : Math.min(1, amps / SAFE), resistorVolts: amps * ohms, watts: amps * amps * ohms };
}

/** The smallest resistor in the box that keeps the LED at or under a safe current. */
export const safest = (volts: number, colour: Colour) => RESISTORS.find((r) => volts - LEDS[colour] <= 0 || (volts - LEDS[colour]) / (r + WIRE) <= SAFE) ?? RESISTORS[RESISTORS.length - 1];
/** Hours a battery of `mAh` lasts at this current. */
export const hours = (mAh: number, amps: number) => (amps > 0 ? mAh / (amps * 1000) : Infinity);
