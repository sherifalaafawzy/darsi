# The Darsi curriculum

Three tracks (AI, Cyber security, IoT), four levels each, for two audiences (teachers, and their students): 24 courses.
Every course is 4 lessons and a unit check, in English and Arabic, and every lesson has a voiced video. This page is how
to write one. `docs/CONTENT.md` has the rules every course keeps; `TECHNICAL.md` "Content, lessons and kits" has the
machinery.

## Levels

The same four levels in every track. Their names are the built-in tracks' `levelNames` (`apps/web/src/content/tracks.ts`).

| Level | English | Arabic | A learner at this level… |
|---|---|---|---|
| 1 | Beginner | مبتدئ | knows what it is, where they meet it, and how to use it safely |
| 2 | Elementary | أساسي | can explain how it works inside, and has tried it with their hands |
| 3 | Intermediate | متوسط | applies it to real school problems and judges the results |
| 4 | Advanced | متقدم | designs with it, critiques it, and leads others: projects, ethics, policy |

Each level builds on the one before: a learner placed at level 3 should find level 3 new but within reach.

## Audiences

- **Teachers** (`audience` absent): classroom practice. The project is done with a class; "Try it in class tomorrow"; the
  classroom kit (slides, lesson plan, worksheet) is for teaching; examples come from schools in developing countries.
- **Students** (`"audience": "students"`, ages 12–16): written to the student ("you"). The project is tried at school or at
  home; `tryTomorrow` is something to do, not to teach; the kit is a worksheet and slides for revising; no "your pupils".
- Both: respectful, never childish; local, everyday examples (markets, buses, school WhatsApp groups, farms, floods);
  security teaches defence only.

## The course map

| Track | Level | Teachers | Students |
|---|---|---|---|
| AI | 1 | `ai-1-1` AI basics (live) | `ai-s1` What is AI? |
| AI | 2 | `ai-2-1` AI tools for teaching: prompting, generating and checking, privacy | `ai-s2` Talking to AI honestly: prompts, checking facts, homework integrity |
| AI | 3 | `ai-3-1` How models work: neurons, training and testing, overfitting, language models | `ai-s3` Train your own model: data, classifiers, testing, bias |
| AI | 4 | `ai-4-1` Leading AI at school: bias audits, policy, integrity, an AI-supported unit | `ai-s4` AI and society: ethics, careers, design an AI solution |
| Cyber | 1 | `cyber-1-1` Passwords and phishing (live) | `cyber-s1` Safe online: passwords and scams |
| Cyber | 2 | `cyber-2-1` Protecting devices and data: updates, backups, two-step sign-in, Wi-Fi | `cyber-s2` Your digital footprint |
| Cyber | 3 | `cyber-3-1` Privacy and school data: protection, permissions, social media, incidents | `cyber-s3` How attacks work, and how to defend |
| Cyber | 4 | `cyber-4-1` A cyber-safe school: policy, risk assessment, incident drills, teaching cyber | `cyber-s4` Defenders: cryptography, networks, careers |
| IoT | 1 | `iot-1-2` Sensors (live) | `iot-s1` Things that sense |
| IoT | 2 | `iot-2-1` Circuits and microcontrollers: current, LEDs, logic, binary | `iot-s2` Build a circuit |
| IoT | 3 | `iot-3-1` Data and automation: logging, rules, battery, networks | `iot-s3` Make it automatic |
| IoT | 4 | `iot-4-1` Smart school projects: design, deploy and maintain a sensor network, data ethics | `iot-s4` A connected world: networks, mesh, IoT security, a project |

Each track's own plan (course and lesson titles, objectives, the Labs app and competencies per lesson) is in
`docs/curriculum/<track>.md`.

## Ids

- Teachers' courses `<track>-<level>-1`; students' `<track>-s<level>`.
- Lessons `<course>-1` … `<course>-4`, and `<course>-check`.
- A lesson's storyboard in Lesson Studio has the lesson id in capitals (`AI-2-1-3`, `CYBER-S2-1`); its folders are in lower
  case (`ai-2-1-3`).

## A course, lesson by lesson

`content/units/<course>.json`, in English and Modern Standard Arabic. Model it on `content/units/ai-1-1.json` and follow
`docs/CONTENT.md`:

- **Lessons 1–4.**
  - Steps in this order (never two of a type in a row):
    1. a video;
    2. a reading with key terms;
    3. at least three question types, each with an `explain` that says why;
    4. a `lab` step (any Labs app id; `apps/web/src/labs/apps/`);
    5. a reflection;
    6. a project.
  - The storyboard's second quick check is a `choice` step right after the video.
  - `tryTomorrow`, `materials`, `competencies` (codes from `apps/web/src/content/competencies.ts`: `T.*` UNESCO for
    teachers, `S.*` UNESCO for students, `DC.*` DigComp, `IOT.*`).
  - 6 slides (title, bullets, bullets, activity with `details`, questions, exit) and the kit list (slides and a lesson
    plan; `npm run kits` builds them).
- **The check:** 10 graded questions over the whole course, no video.
- **The video step, as written:**
  - `title` and `prompt`;
  - one chapter label per storyboard chapter, in English and Arabic;
  - the `checkpoint` question in English and Arabic: the storyboard's first quick check, in Modern Standard Arabic;
  - `duration: 1`, `sizeMB: 0`, `src: null`.
  - `scripts/import-media.mjs` fills the rest from Lesson Studio (sources, captions, light lesson, sizes, every time per
    language, the transcript, the video kit).

## A storyboard, lesson by lesson

In Lesson Studio (`H:\htdocs\lessonstudio\content\darsi\`), following its `README.md` and the 12 storyboards already there
(`source/AI-1-1-2.json` is a good model):

- **`source/<ID>.json`:** `id`, `track` (ai, cyber or iot), `level`, `unit` {number, title}, `lesson` {number, title, subtitle,
  minutes, format}, and `video`:
  - `title`, `length` (2:30 to 3:30), `cast`, `chapters` (4–5);
  - 12–15 `scenes`, each with beat, start, end, visual, animation, `on_screen_text`, voice, narration and icons;
  - two `checkpoints` (the first is asked inside the video).
  - Beats the converter knows: Hook, Title, Concept, Definition, Analogy, Checkpoint ◆, Reveal, Examples, Non-examples,
    Lab preview, Recap, Try it tomorrow.
  - Voices: the narrator and the five cast members (Amina, Okafor, Salma, Joseph, Farah), who also appear in students'
    videos as their teachers.
- **`<id>/ar-EG.json`:** the Egyptian Arabic narration, scene by scene, with the same sentence breaks as the English; the
  checkpoints; and `unit`, the course title in Arabic (the title card then names the course).
- **`<id>/design.json`:** what each scene shows (cards, list, steps, message, and so on: see the README).
- The video's Arabic is Egyptian, as an Egyptian teacher would explain it (the README's term table). The app's Arabic (the
  unit file) is Modern Standard Arabic.

## From storyboard to the app

In `H:\htdocs\lessonstudio` (set `CHROMIUM_PATH` to Playwright's chromium-1243 `chrome-win64/chrome.exe`):

```bash
node scripts/darsi/sentences.ts AI-2-1-1      # English and Arabic side by side, sentence by sentence
node scripts/darsi/convert.ts AI-2-1-1        # must say 0 errors and 0 warnings
node scripts/darsi/sheet.ts ai-2-1-1          # out/sheets/ai-2-1-1-en.png: look at every scene (and --lang ar-EG)
npm run narrate -- --dir content/darsi/lessons/ai-2-1-1 --now --workers 2
npm run package-lessons -- ai-2-1-1
npm run mp4 -- ai-2-1-1 --lang en,ar-EG --sizes 240
```

- **Narration** uses the user's Vertex AI key, which voices about 10–20 sentences a minute for everyone together: a lesson
  takes 5–10 minutes. Failed sentences are voiced again on the next run, and voiced sentences are cached
  (`.cache/narrate`), so re-running costs nothing for what didn't change. Never delete the cache.
- Rendering takes about 40 seconds per language.

Then in Darsi:

```bash
node scripts/import-media.mjs ai-2-1                       # every video step of the course
npm run kits -w @darsi/web -- ai-2-1                       # slides and lesson plans (Chromium for the PDFs)
cd apps/web && npx vitest run tests/units.test.ts           # every course: validator, content rules, kits, no "·"
```

Publishing (`npm run seed -- <course>…`) is the last step, for every course at once.
