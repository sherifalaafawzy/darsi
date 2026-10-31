// @vitest-environment node
// The virtual IoT board (src/code/pylib/machine.py) in the MicroPython learners' phones run: programs written for a
// real Pico or ESP32 run on board time, and every pin change is recorded for the phone to play back.
import type { BoardRun } from "../../src/code/harness";
import { runInNode } from "./node";

const board = (b: Partial<BoardRun> = {}): BoardRun => ({ seconds: 20, sensors: {}, buttons: {}, ...b });

describe("the virtual board", () => {
  it("blinks an LED on board time, recording each change", async () => {
    const [r] = await runInNode({ lang: "python", board: board(), code: `from machine import Pin
import time
led = Pin(15, Pin.OUT)
for i in range(3):
    led.on()
    time.sleep(0.5)
    led.off()
    time.sleep(0.5)
print("done at", time.ticks_ms())` });
    expect(r.out).toBe("done at 3000\n");
    expect(r.board!.events).toEqual([0, 500, 1000, 1500, 2000, 2500].map((t, i) => [t, 15, "pin", i % 2 ? 0 : 1]));
    expect(r.board!.timeUp).toBe(false);
  });

  it("stops a loop that never ends when the board time is up, without an error", async () => {
    const [r] = await runInNode({ lang: "python", board: board({ seconds: 5 }), code: `from machine import Pin
import utime
led = Pin("LED", Pin.OUT)
while True:
    led.toggle()
    utime.sleep(1)` });
    expect(r.error).toBeUndefined();
    expect(r.board!.timeUp).toBe(true);
    expect(r.board!.events.map((e) => e[0])).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    expect(r.board!.events[0][1]).toBe(25); // the Pico's own LED
  });

  it("reads sensors and buttons second by second, and a test can bring its own readings", async () => {
    const code = `from machine import ADC, Pin
import time
light = ADC(26)
lamp = Pin(15, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_DOWN)
for s in range(4):
    lamp.value(light.read_u16() < 20000)
    if button.value():
        print("pressed at", s)
    time.sleep(1)`;
    const check = "import machine\nassert [v for t, v in machine.history(15)] == [0, 0, 1, 1], 'the lamp should come on when it gets dark'";
    const runs = await runInNode({ lang: "python", code, board: board({ sensors: { 26: [50000, 40000, 9000, 5000] }, buttons: { 14: [0, 1, 0] } }),
      tests: [{ check }, { check, board: { sensors: { 26: [9000, 9000, 50000, 50000] } } }] });
    expect(runs.map((r) => r.passed)).toEqual([true, false]);
    expect(runs[0].out).toBe("pressed at 1\n");
    expect(runs[1].message).toBe("the lamp should come on when it gets dark");
  });

  it("drives a buzzer with PWM", async () => {
    const [r] = await runInNode({ lang: "python", board: board(), code: `from machine import Pin, PWM
import time
buzzer = PWM(Pin(16))
buzzer.freq(440)
buzzer.duty_u16(32768)
time.sleep(0.2)
buzzer.deinit()` });
    expect(r.board!.events).toEqual([[0, 16, "freq", 440], [0, 16, "duty", 32768], [200, 16, "duty", 0]]);
  });
});
