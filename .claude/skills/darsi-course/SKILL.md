---
name: darsi-course
description: Write or revise Darsi course material and lesson videos to one teaching standard. Use this whenever you plan a track's curriculum, write or edit a course in content/units/*.json, write or rewrite a Lesson Studio storyboard (source/<ID>.json, ar-EG.json, design.json) for a Darsi lesson video, write placement questions or a unit check, review a lesson's quality, or run the video pipeline (convert, narrate, package, MP4, import-media, kits). Use it even for a small edit to one lesson, because every lesson must keep the same structure, start from zero, and open its video with a hook.
---

# Writing Darsi courses and lesson videos

Darsi teaches school and university teachers, and their students, in English and Arabic, on old phones with expensive
data. A course is 4 lessons and a unit check. Every lesson is built around one short voiced video. This skill is the
one way to write them, so that any session produces the same quality.

Two repositories are involved: Darsi (`H:\htdocs\darsi`, the course files and the app) and Lesson Studio
(`H:\htdocs\lessonstudio`, the videos).

## The five rules that are never broken

1. **Start from zero.** The first course of every track assumes the learner knows nothing about the subject. Every
   later course says what it expects in one "Before this:" line. Nothing is used before it is taught: no term, no
   symbol, no Python feature, no lab.
2. **Every video opens with a hook.** A question, a surprise or a familiar problem from the learner's own day, before
   any definition or "today we will". The video ends by answering it.
3. **One fixed teaching structure.** Every video has the same eleven parts in the same order, and every lesson has the
   same shape around it (see below). Do not invent another.
4. **Concrete before abstract, one idea at a time.** Show the idea in an everyday example, then name it. One idea per
   scene. At most four new terms in a video.
5. **Both languages are first-class.** English, Egyptian Arabic for what is spoken in the video, friendly Modern
   Standard Arabic for the course text, one word per concept from `docs/curriculum/ar-lingo.md`. Never "·" in Arabic.

Why these rules, and what research they rest on: `references/teaching-model.md`.

## The structure, in one look

**A video** (2:30 to 3:30, 12 to 15 scenes, 5 chapters):

| # | Part | Its job | Beat for the converter |
|---|---|---|---|
| 1 | Hook | Open a question the learner wants answered | `Hook` |
| 2 | Promise | "By the end, you'll be able to…": one thing they can do | `Title` |
| 3 | Show it | The idea in an everyday example, before any name | `Analogy`, `Examples` or `Concept` |
| 4 | Name it | The term and a one-sentence definition, pointing back at the example | `Definition` |
| 5 | Work it | One real case, step by step, the same case the lab uses | `Examples` or `Concept` |
| 6 | Check 1 | The learner uses the idea on a new case | `Checkpoint ◆` |
| 7 | Reveal | The answer, why, and the usual wrong idea | `Reveal` |
| 8 | Widen it | Where else it shows up, and what it is not | `Examples`, `Non-examples` |
| 9 | Lab | What to do in the app, and the one thing to watch for | `Lab preview` |
| 10 | Check 2 and recap | The hook's own question, then three points and one line | `Checkpoint ◆`, `Recap` |
| 11 | Try it, and next | One action for tomorrow, and the next lesson in one sentence | `Try it tomorrow` |

**A lesson** (15 to 18 minutes): video → reading with key terms → practice → lab → practice → reflection → project,
plus "try it tomorrow", materials, six slides and the kit.

**A course**: 4 lessons that each need the one before, then a unit check of 10 graded questions.

**A track**: one ladder for teachers (Beginner to Advanced, then the courses for university teachers), and for
students a starting course at every school stage, university included. Every course states what it expects. The
track's plan is `docs/curriculum/<track>.md`; what all tracks share is `docs/CURRICULUM.md`.

## How to work

Follow these steps in order. Each one names the reference to read before you start it.

1. **Place the lesson in the track.** Read the track's plan (`docs/curriculum/<track>.md`) and the lessons before this
   one. Write down what the learner already knows at this point (the "assumes" list) and the one thing they will be
   able to do after it (the outcome). If the plan uses something no earlier lesson teaches, stop and fix the plan
   first. → `references/course.md` ("Starting from zero"). Writing or changing the plan itself, for a whole track:
   → `references/curriculum.md`.
2. **Write the storyboard** in Lesson Studio: `content/darsi/source/<ID>.json` (English), `<id>/ar-EG.json` (Egyptian
   Arabic) and `<id>/design.json` (what each scene shows). Fill the `teaching` block first: it is the lesson's
   contract. → `references/video.md`, `references/languages.md`.
3. **Write the lesson in the unit file** `content/units/<course>.json` around the video: the same hook, the same
   terms, the same worked example. → `references/course.md`, `references/languages.md`.
4. **Run the free checks** until they are clean: the structure check in this skill, the converter, the layout check,
   the contact sheets (look at them), the validator and the units test. → `references/pipeline.md` ("Free checks").
5. **Ask before spending.** Narration costs money. Show the user `npm run narrate -- … --estimate` and wait for a yes.
   → `references/pipeline.md` ("Narration").
6. **Make the media and the kits**, then run the tests again. → `references/pipeline.md`.
7. **Review against the checklist** in both languages, and report honestly what was checked and what was not.
   → `references/checklist.md`.

Three checks come with this skill. They cost nothing and change nothing:

```bash
node .claude/skills/darsi-course/scripts/check-lesson.mjs <lesson id>      # e.g. agents-1-1-1; --all for every lesson
node .claude/skills/darsi-course/scripts/convert-fresh.mjs <ID>            # the converter's own errors, for a rewrite
node .claude/skills/darsi-course/scripts/check-curriculum.mjs <track>      # a track's plan; --all for the nine
```

`check-lesson` fails on a missing hook, a hook that answers itself, a promise that isn't "By the end, you'll be able
to…", a definition before any example, a term used before it is introduced, a video that never returns to its hook
or never names the next lesson, checks that give the answer away by length, missing Arabic, "·" in Arabic, and a
unit file that disagrees with its storyboard. Storyboards written before this skill have no `teaching` block: the
check reports that and still checks what it can. On 2026-11-13 none of the 348 older storyboards passed it (all lack
the promise and the "next lesson" line; 237 hooks don't end on an open question; 111 define before they show), so a
lesson you touch will usually need its opening and closing rewritten, not only the part you came for.

## Limits that hold in every session

- **Money:** never run narration, MP4 rendering in bulk, or anything on a cloud account without the user's yes in this
  conversation. Cloud spending belongs to the GAP CLOUD billing account, never the personal one.
- **Publishing:** never run `npm run seed`, deploy, commit or push unless the user says so.
- **Other sessions share these folders.** Run `git status` first. Touch only the files of the lesson or course you
  were given. Never revert, reformat or regenerate files you are not changing.
- **Sources and generated files.** Edit the storyboard sources and the unit JSON. Never edit
  `content/darsi/lessons/<id>/` by hand (the converter writes it), and never delete Lesson Studio's `.cache/narrate`.
  The three pack courses (`ai-1-1`, `cyber-1-1`, `iot-1-2`) import with `scripts/import-packs.mjs`; never run it with
  `--force`.
- **No Plane, no `pm` subagent** in this repository.

## References

| File | Read it when |
|---|---|
| `references/teaching-model.md` | You want the reasons, or you are tempted to change the structure |
| `references/curriculum.md` | Planning a track: the paths, starting courses, the plan's format and its check |
| `references/video.md` | Writing or reviewing a storyboard: hooks, each part's budget, checks, design.json |
| `references/course.md` | Writing the unit file: steps, questions, lab, project, kit, unit check, placement, levels, stages, audiences, prerequisites |
| `references/languages.md` | Writing any English or Arabic: registers, glossary, isolates, numbers |
| `references/pipeline.md` | Running commands: the exact order, what each must print, costs and locks |
| `references/checklist.md` | Before you say a lesson is done |
| `examples/agents-1-1-1.md` | You want to see a lesson before and after this skill |

Mechanics that live elsewhere and stay the source of truth: `docs/CONTENT.md` (step types and code steps),
`H:\htdocs\lessonstudio\content\darsi\README.md` (design.json bodies), `docs/curriculum/ar-lingo.md` (the Arabic
glossary), `TECHNICAL.md` "Content, lessons and kits". Where an older document disagrees with this skill about
teaching (for example `docs/CURRICULUM.md` still says students are 12 to 16), this skill wins.
