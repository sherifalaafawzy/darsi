# Writing content

Courses are made in the course editor (`/super/content`), which publishes them to Cloud Storage; the app ships none. The starting courses also live as files in `content/units/<id>.json` at the repo root, published with `npm run seed`. Types: `apps/web/src/content/types.ts`.

- A course is for teachers unless it says `"audience": "students"` ("Who is it for?" in the editor). Students see only courses for students, and teachers only courses for teachers, in the same tracks. Write a course for students to students: its `tryTomorrow` is something to try at school or at home, not with a class.
- Every learner-facing string is `{ "en": "…", "ar": "…" }`. English is the fallback.
- Arabic: Modern Standard Arabic, friendly (capstones are the exception: their text is Egyptian Arabic, like the videos); use "،" or ":" as separators — never "·". The glossary and register rules are `docs/curriculum/ar-lingo.md`. Code, formulas and a comparison operator named on its own («تشمل ⁦>=⁩ العدد») sit in left-to-right isolates: run `node scripts/isolate-code.mjs --fix <id>` after editing Arabic text (TECHNICAL.md "Languages and right-to-left").
- Step types: `video`, `read`, `choice`, `multi`, `truefalse`, `image`, `match`, `order`, `fill`, `type`, `hotspot`, `scenario`, `lab`, `project`, `reflect`, and the code steps `code`, `parsons`, `codefill`, `bug` and `blocks` below.
- A `read` step is a short reading: `title`, `body` (paragraphs at blank lines; a single line break stays one, for a list of clicks or one command per line; `https://` addresses become links) and optional `keyTerms`. A paragraph that is only `![caption](/media/…)` is a picture (keep it about 1280 px wide and under 100 KB; the file goes in `content/media/`, and the seed uploads it).
- A `project` step is the classroom project: `task`, `deliverable` and a `rubric` of criteria; a person reviews it. In a capstone it is a milestone (below).
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
- `order.steps` and `match.pairs` are written in the correct order — the app shuffles them. It shuffles a `choice`'s and `multi`'s options and a `fill`'s word bank too, seeded by the lesson and step ids (the same order on every visit, never the authored one), so where the right option sits in the file doesn't matter. The kits print them in a seeded order as well.
- Every card on one side of a `match` reads differently, in every language: pair *i* is right only with its own card, so two "Regression" cards mark one of two right answers wrong. To sort several things into two groups, use a `multi` ("Which of these … ? Choose all that apply."). The validator refuses repeated cards (`duplicateText`).
- Each lesson needs `tryTomorrow`, 6 `slides` (title, bullets, bullets, activity, questions, exit) and a `kit` list.
- After editing a file in `content/units/`, run `npm run kits` and `npm test` (content integrity tests), then `npm run seed -- --replace <id>` to publish it (or import the file in the editor). Always name the course: `--replace` with no ids would republish every source in the folder, including courses kept off the site.

## Capstones

Every track's level-3 students' course ends in a capstone, `content/units/<track>-capstone.json`: `"kind": "capstone"` (the editor's Capstone switch), `"audience": "students"`, level 3. Learners build a real project with free tools on their own computer, in Colab or in Codespaces, starting from a starter repository; Darsi never runs their code. How it is checked and reviewed is in TECHNICAL.md "Capstones".

- **Three lessons (stages):** `<id>-description` (what they will build and why), `<id>-starter` (readings: setting up, the starter repository, how to work) and `<id>-submission` (a reading, then one `project` step per milestone). No video and no questions: nothing in a capstone is graded or scored, so `tests/units.test.ts` skips the question-mix and six-slide rules for capstones (at least three slides). Each lesson still needs `minutes`, `tryTomorrow`, `materials`, `competencies`, `slides` and its `kit`; the kits print the milestones as the activity, and a milestone sheet in the submission stage.
- **A milestone** is a `project` step with, besides `task`, `deliverable` and `rubric`:
  - `evidence`: what the learner sends, each `{ "kind", "label"? }` with kind `repo` (their public GitHub repository), `release` (a release tag), `check` (the `darsi-check.json` the starter's check script writes), `scan` (a scan that may target only localhost; always checked for the aisec and cyber tracks) or `url` (other links, at most 5). The capstone needs at least one milestone asking for evidence (`capstoneMilestone`).
  - `milestone`: the id the starter's check script reports (`m1`, `m2`…); `<mN>` in the setup text shows as it.
  - `starterRepo`: the starter repository's name in the starter organisation (`STARTER_ORG` in `apps/web/src/content/capstone.ts`, https://github.com/darsi-org); never a full URL.
  - `hours`: the work it takes, for planning.
  - `setup`: tabs `{ "os": "windows" | "mac" | "colab", "body" }`, the steps on each kind of computer (Colab or Codespaces for learners without one).
- These fields are allowed only in a capstone (`capstoneOnly`); the editor shows them only with the Capstone switch on.
- The rubric's criteria are what the advisory AI review scores (0–3 each) and what the reviewing person reads; write each so it can be judged from the repository, the check file and the learner's own words.
- Screenshots go in the readings as pictures (`![caption](/media/capstone-shared/…)`), each under 100 KB.
- The certificate needs every milestone sent; Home moves nobody up for an unfinished capstone.
