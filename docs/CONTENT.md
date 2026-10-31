# Writing content

Courses are made in the course editor (`/super/content`), which publishes them to Cloud Storage; the app ships none. The starting courses also live as files in `content/units/<id>.json` at the repo root, published with `npm run seed`. Types: `apps/web/src/content/types.ts`.

- A course is for teachers unless it says `"audience": "students"` ("Who is it for?" in the editor). Students see only courses for students, and teachers only courses for teachers, in the same tracks. Write a course for students to students: its `tryTomorrow` is something to try at school or at home, not with a class.
- Every learner-facing string is `{ "en": "…", "ar": "…" }`. English is the fallback.
- Arabic: Modern Standard Arabic, friendly; use "،" or ":" as separators — never "·".
- Step types: `video`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `reflect`, `lab`, and the code steps below.
- A `lab` step's `tool` is any Labs app id, the name of its folder in `apps/web/src/labs/apps/` (for example `neuron`, `playground`, `rag`, `twofactor`); the course editor's lab picker lists them all.

## Code

Code is always left to right and in English (Python and SQL keywords), in every language; the prompt, hints and `explain` are translated.

- **Code with a question:** any question can show `snippet: { lang, text }` above its answers. "What does this print?" is a `choice` with a snippet.
- **`code`, write and run:** `lang` is `python` or `sql`; `starter` is where learners begin and must not pass the tests; `solution` must pass them.
  - Python: each test in `tests` runs the program afresh with its `input` (what `input()` returns, in order) and checks `output` (exactly what `print()` prints, spaces at line ends aside) and/or `check` (Python run after the program with its variables, e.g. `assert total == 15, "The total should be 15"`). A `hint` per test says what to look at when it fails. `files` are small text files the program can open (a CSV; `import csv` works).
  - SQL: `setup` makes the tables (CREATE TABLE, INSERT); the query must return the solution's rows (in order only when the solution has ORDER BY).
  - `hints` show one at a time. Programs stop after 3 seconds, and `time.sleep` doesn't wait.
  - MicroPython, not full Python: no `s[::-1]` on strings (use `"".join(reversed(s))`), no `md5`/`sha1` (`hashlib.sha256` works), `ulab` instead of numpy (`from ulab import numpy as np`). Put the expression on the left of a comparison with a variable from a solver (`x + y <= 10`, not `10 >= x + y`): MicroPython has no reflected comparisons.
  - **Optimization:** `from ortools.sat.python import cp_model` (integer variables, `add` with ==, !=, <=, >=, <, >, `add_all_different`, `add_bool_or`, `add_implication`, `minimize`/`maximize`, `CpSolver`, solution callbacks) and `from ortools.linear_solver import pywraplp` (`CreateSolver("GLOP")` for linear programs, `"SCIP"` for whole numbers; `NumVar`, `IntVar`, `Add`, `Minimize`/`Maximize`, `Solve`, `solution_value()`). Both the snake_case and the older CamelCase names work, so programs run unchanged on the real OR-Tools. They suit school-sized problems (tens of variables).
  - **IoT, the virtual board:** a Python step can have a `board` (src/code/pylib/machine.py): what's wired to which pin. `from machine import Pin, ADC, PWM` and `time.sleep` work as on a Raspberry Pi Pico or an ESP32 (`utime` too), on board time: a `while True:` loop stops when the board's `seconds` (default 20) are up. The phone plays the pin changes back. Sensors give one reading (0–65535) per second, and buttons a press (1) or not (0) per second; a test can bring its own with `board: { sensors: { "26": [...] }, buttons: { "14": [...] } }`, and check what happened with `machine.history(pin)` (each `(ms, value)`) or `machine.state(pin)` (the last value):
    ```json
    "board": { "seconds": 10, "leds": [{ "pin": 15, "color": "yellow", "label": { "en": "Lamp", "ar": "المصباح" } }],
      "sensors": [{ "pin": 26, "kind": "light", "label": { "en": "Light sensor", "ar": "حساس الضوء" }, "values": [50000, 40000, 9000] }] }
    ```
    LED colours: red, yellow, green, blue. Sensor kinds: light, temperature, moisture, distance, sound. A `buzzer` is a pin driven with `PWM`.
- **`parsons`:** `lines` in the right order, Python indented with 4 spaces per level; optional `distractors` that look right but don't belong.
- **`codefill`:** `code` with `{ "blank": n }` gaps and `answers[n]` for each; optional `distractors`. In the editor, type the code with `[[answer]]` for each gap.
- **`bug`:** `code` with one mistake on `line` (counting from 1) and `fix`, that line corrected.
- **`blocks`** (young learners, no typing): a robot `world` (2–8 squares a side: `start` with its `dir`, a `goal`, `walls` as `{ x, y }`), the `commands` on offer and `maxBlocks`. The validator refuses a world the robot can't solve within the limit.
- `npm test` runs every `code` step's solution (it must pass) and starter (it must not) in the same MicroPython and SQLite the phones use (`tests/units.test.ts`). The kits print the code steps as paper exercises for classes without devices.
- Firestore keeps drafts, so nothing may be an array directly inside an array (hence `walls` as objects).
- Mix at least three question types per lesson; never two of the same in a row; every graded step has an `explain` that says *why*.
- `order.steps` and `match.pairs` are written in the correct order — the app shuffles them.
- Each lesson needs `tryTomorrow`, 6 `slides` (title, bullets, bullets, activity, questions, exit) and a `kit` list.
- After editing a file in `content/units/`, run `npm run kits` and `npm test` (content integrity tests), then `npm run seed -- --replace <id>` to publish it (or import the file in the editor).
