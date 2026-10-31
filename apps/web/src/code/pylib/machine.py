# A virtual board for Darsi's IoT lessons, shaped like MicroPython's machine module on a Raspberry Pi Pico or an ESP32,
# so the same program runs on a real board. What is wired to which pin (LEDs, a buzzer, buttons, sensors) comes from
# the lesson. The program runs on board time: time.sleep moves a clock instead of waiting, every pin change is
# recorded with its time, and the phone plays the recording back on a drawn board. A program that loops for ever
# (while True with a sleep) simply stops when the lesson's board time is up.
import time

_pins = {}
_events = []
_sensors = {}
_buttons = {}
_MAX_EVENTS = 2000


def _reset(sensors, buttons):
    global _pins, _events, _sensors, _buttons
    _pins = {}
    _events = []
    _sensors = {int(k): v for k, v in (sensors or {}).items()}
    _buttons = {int(k): v for k, v in (buttons or {}).items()}


def _report():
    return {"events": _events, "pins": {str(k): v for k, v in _pins.items()}}


def _at(values):
    # The value at this moment of board time: one value per second, the last one holding.
    if not values:
        return 0
    i = time.ticks_ms() // 1000
    return values[i] if i < len(values) else values[-1]


def _set(pin, kind, value):
    _pins[pin] = value
    if len(_events) < _MAX_EVENTS:
        _events.append([time.ticks_ms(), pin, kind, value])


def history(pin):
    """Every (time in ms, value) written to a pin, for checks."""
    p = pin.id if isinstance(pin, Pin) else pin
    return [(e[0], e[3]) for e in _events if e[1] == p]


def state(pin):
    """What a pin was last set to."""
    return _pins.get(pin.id if isinstance(pin, Pin) else pin, 0)


class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_RISING = 1
    IRQ_FALLING = 2

    def __init__(self, id, mode=-1, pull=-1, value=None):
        self.id = int(str(id).replace("GP", "").replace("LED", "25")) if not isinstance(id, int) else id
        self.mode = mode
        if value is not None:
            self.value(value)

    def value(self, v=None):
        if v is None:
            if self.id in _buttons:
                return 1 if _at(_buttons[self.id]) else 0
            return _pins.get(self.id, 0)
        _set(self.id, "pin", 1 if v else 0)

    def __call__(self, v=None):
        return self.value(v)

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    def high(self):
        self.value(1)

    def low(self):
        self.value(0)

    def toggle(self):
        self.value(0 if _pins.get(self.id, 0) else 1)

    def irq(self, handler=None, trigger=3):
        raise NotImplementedError("interrupts aren't on Darsi's virtual board: read the pin in a loop instead")


class ADC:
    def __init__(self, pin, atten=None):
        self.id = pin.id if isinstance(pin, Pin) else int(pin)

    def read_u16(self):
        return int(_at(_sensors.get(self.id, [])))

    def read(self):
        return self.read_u16() >> 4

    def atten(self, a):
        pass

    def width(self, w):
        pass


class PWM:
    def __init__(self, pin, freq=1000, duty_u16=0):
        self.id = pin.id if isinstance(pin, Pin) else int(pin)
        self._freq = freq
        self._duty = 0
        if duty_u16:
            self.duty_u16(duty_u16)

    def freq(self, f=None):
        if f is None:
            return self._freq
        self._freq = int(f)
        _set(self.id, "freq", self._freq)

    def duty_u16(self, d=None):
        if d is None:
            return self._duty
        self._duty = max(0, min(65535, int(d)))
        _set(self.id, "duty", self._duty)

    def duty(self, d=None):
        if d is None:
            return self._duty >> 6
        self.duty_u16(int(d) << 6)

    def deinit(self):
        self.duty_u16(0)


def freq(f=None):
    return 125000000


def reset():
    raise SystemExit("reset")
