# Building a course around the videos

A course is one file, `content/units/<course>.json`: 4 lessons and a unit check, every learner-facing string as
`{ "en": …, "ar": … }`. The field-by-field rules (step types, code steps, the virtual board) are in `docs/CONTENT.md`
and `apps/web/src/content/types.ts`; the validator is `apps/web/src/content/validate.ts`. This page says what each
part is for, so the course teaches.

## Starting from zero

Before writing a course, write its **prerequisite ledger**: a list of every term, symbol, skill and Labs app the
course uses, and beside each one the lesson that first teaches it. Then check three things.

1. **A starting course lists nothing from outside.** Starting courses are the teachers' Beginner course and, for
   students, the first course of each stage (`-s1`, `-s2`, `-s3`, and `-m1` or `-s4-0` at university): a student begins at
   their own stage, not at a course written for younger children (`curriculum.md`). Its ledger starts empty:
   everyday life, and what school has taught by that age. If its lesson 1 needs an idea from another track or from a
   younger stage, it teaches it in place, in one or two sentences with an example.
2. **Nothing is used before its row.** A code step may use only Python that an earlier lesson in the learner's path
   taught, or that this lesson's own reading explains with an example. The same goes for maths (an inequality, a
   mean), for words (token, hash, loop) and for labs.
3. **Every course says what it expects**, in the last line of its `summary`, in both languages. A starting course
   says "No experience needed." («لا تحتاج إلى خبرة سابقة.»), adding the school knowledge it uses if any ("…, only
   school algebra (x + y ≤ 8)."). Every other course says "Before this: …" («قبل هذا: …») naming each course by
   title, track and level ("Before this: “Python for teachers” (Programming, level 2)."). A starting course that
   writes code names the Programming course for it, and nothing else. When a course borrows an idea, the first
   lesson that uses it gives a one-sentence reminder.

Known traps, from the 2026-11-04 curriculum review: Python written before it is taught (data science level 1 and
primary; functions, dictionaries, comprehensions and `lambda` at teachers' levels 2 to 4); a lesson using lists or
sets one lesson before they are taught; "token" used in a track that never defines it. Check your ledger for these
first.

## Audiences

| | Teachers (`audience` absent) | Students (`"audience": "students"`) |
|---|---|---|
| Written to | A colleague, as "you" | The student, as "you" |
| Examples from | Classrooms, staffrooms, school offices, in schools with few or no devices | The student's own day: school, home, friends, a phone, a game |
| Project | Done with a class, and it needs no devices | Tried at school or at home, alone or with a friend |
| `tryTomorrow` | Something to teach or try in class | Something to do, never "with your pupils" |
| Kit | Slides, a lesson plan and a worksheet for teaching | Slides to revise and an activity sheet |
| Ids | `<track>-<level>-1` | `<track>-s<level>` |

University teachers' courses are `<track>-u<n>` with `"teach": "university"`.

## Levels and school stages

Teachers' levels 1 to 4 are Beginner, Elementary, Intermediate and Advanced (what each means, and its verbs, are in
`teaching-model.md`). Students' levels are school stages, and the writing changes with each:

| Stage | Ages | Writing | Code | Video |
|---|---|---|---|---|
| `-s1` Primary | 9–12 | Sentences of 14 words or fewer; one idea each; things they can touch; games and stories | None. `blocks`, ordering, tapping, "what does this print?" on two lines at most | 2:15–2:45 |
| `-s2` Lower secondary | 12–15 | Short paragraphs; everyday maths | First real code where the topic needs it: `parsons`, `codefill`, one short `code` step | 2:45–3:30 |
| `-s3` Upper secondary | 15–18 | Can carry a chain of two or three steps of reasoning | Writes and runs code with tests | 2:45–3:30 |
| `-s4` University | 18+ | Adult, precise, real terms with plain definitions; talks about campus, not "your class" | Depth | 2:45–3:30 |

Checks that go with this: no typing at primary; nothing addressed to "your pupils" or "your class" in a students'
course; nothing about parents' permission or "a grown-up" at university; apps with age limits (WhatsApp, most
chatbots) are used "with a grown-up" at primary and the limit is said once.

## A lesson, part by part

The order is fixed: **video → reading → practice → lab → practice → reflection → project**. The tests refuse two
steps of the same type in a row, fewer than three graded question types, a graded step without `explain`, and slides
in any order but title, bullets, bullets, activity, questions, exit.

| Step | Its job | Rules |
|---|---|---|
| `video` | Hook, show, name, work, check | Written in Lesson Studio (`video.md`). In the unit: `title`, one chapter label per storyboard chapter (en and ar), and the `checkpoint` question, which is the storyboard's first check in English and Modern Standard Arabic. `scripts/import-media.mjs` fills the rest. |
| `read` | The same idea in words, to keep and come back to | 3 to 5 short paragraphs, about 220 to 320 words in English. Paragraph 1 is the hook's problem and its answer in plain words. Then the idea, the worked case with the same numbers as the video, and what to watch for. `keyTerms`: the video's `teaching.terms`, in the same words, each defined in one sentence; one more term at most, and only if the reading explains it. The title is a plain statement of the idea, not jargon. |
| Practice, before the lab | Recall, then recognise, then order | 2 or 3 questions of different types, easiest first. The first is a `choice` that asks the video's second check (the hook's question), so learners who watched the MP4 or read the transcript meet it too. |
| `lab` | Do the worked case by hand, then a new one | `tool` is a Labs app id. The `prompt` says what to press (the app's real button names), what to watch for, and what finishes the lab. Say the download size if the lab has one. |
| Practice, after the lab | Use what the lab showed; meet the misconception; judge a case | 2 or 3 questions of other types. One meets `teaching.misconception` head on (often a `truefalse`). The last is the hardest, usually a `scenario` or a `multi` set in a school. |
| `reflect` | Connect it to the learner's own school or life | One open question, with a `placeholder` that shows a short good answer. |
| `project` | Integration: the learner does it for real | For teachers: a class activity with no devices, the same one the video's "try it" names. `task`, `deliverable` (no faces, no pupils' names), and a `rubric` of three things a person can be seen doing ("Pupils could: …"). |

Around the steps:

- `tryTomorrow`: one sentence, the same activity as the video's last scene.
- `materials`: what the activity needs (paper, chalk, cards), in both languages.
- `competencies`: only codes that exist in `apps/web/src/content/competencies.ts`. Teachers' lessons take `T.*`
  (UNESCO for teachers), students' lessons `S.*`, both may take `DC.*` and the track's Darsi strand.
- `slides`: exactly six (title, bullets "Today we will", bullets "Remember", activity with `details` and timed steps
  "(N min)", questions, exit). The title slide's `narration` is the hook's question. "Today we will" is the outcome
  as two or three things the class will do. The activity's warm-up uses the hook.
- `kit`: slides (pdf, pptx), a lesson plan (pdf), and the video item that `import-media` adds. `npm run kits` builds
  the files. Slides are 6 pages and the lesson plan 2, in both languages: count them after every build
  (`pipeline.md`), because one line too many in the activity's `details` adds a nearly empty page, in Arabic first.
- `minutes`: the real time, 15 to 18 for most lessons.

### Writing questions

- **Types:** `choice`, `multi`, `truefalse`, `match`, `order`, `fill`, `type`, `image`, `hotspot`, `scenario`, and the
  code steps (`code`, `parsons`, `codefill`, `bug`, `blocks`). Pick the type that fits the thinking: `order` for a
  process, `match` for parts and their jobs, `multi` for "which of these are…", `scenario` for a judgement with
  consequences.
- **Code runs in the phone's MicroPython, not desktop Python.** Before writing a code step, a snippet or a worked
  example, check it against `docs/curriculum/phone-python.md`: no `str.title()`, dictionaries don't keep their order
  (loop over `sorted(d)`), sorting isn't stable (keys without ties), error messages read differently (teach the type,
  show the phone's wording), and no value on a half for `round`. A "what does this print?" answer must be what the
  phone prints.
- **Difficulty rises through the lesson:** recall → recognise in a new example → order or match → apply to a school
  case → judge. Never start with the hardest.
- **`explain` says why**, in one or two sentences, and why the tempting wrong answer is wrong. It never only repeats
  the right option.
- **Options don't give the answer away:** about the same length, the same grammar, every wrong one a thing a real
  beginner believes. No "all of the above", no joke options. In a `multi`, two to three of five are right.
- **Each question tests this lesson**, using only words this lesson or an earlier one taught. A question that needs
  outside knowledge tests the learner's background, not the lesson.
- **Numbers and names match** the video, the reading, the lab and the slides. If the video says thirty-five, so does
  everything else, in both languages.
- `order.steps` and `match.pairs` are written in the right order; the app shuffles them.

## The four lessons of a course

A course is a path, not four topics. Plan it as one sentence each: lesson 1 meets the idea, lesson 2 opens it up,
lesson 3 uses it on something that can go wrong, lesson 4 puts the learner in charge of it. Each lesson's `show` part
may lean on the lesson before ("Last time, the agent called a tool…"), and each ends by naming the next. The hooks of
a course can follow one small story (one teacher, one class) so the course feels like one thing.

## The unit check

`<course>-check`: 10 graded questions over the whole course, no video, at least three question types, never two of a
type in a row, six slides for a review lesson.

- Two or three questions per lesson, none of them copies of a practice question: the same idea on a new case.
- At least four questions are applications (a school situation to decide), not recall.
- At least one question joins two lessons.
- Every `explain` names the lesson to go back to when the answer was wrong.

## Placement questions

`content/placement/<track>.json`, merged into `apps/web/public/content/placement.json`: three questions per track,
audience and level (`<track>-t<level>-<n>`, `<track>-s<level>-<n>`), in both languages, each with `explain`.

- A question at level n tests what the level-n course teaches, so that passing it means "you can skip this course".
- A learner who starts above level 1 is not asked about the levels below. So where a level silently needs the one
  before (Python at level 2, then teaching Python at level 3), at least two of the three questions at the higher
  level must also need the lower level's skill.
- No question may test something no course teaches.
- University questions must separate a university student from a school pupil.

## Checking a course

```bash
node .claude/skills/darsi-course/scripts/check-lesson.mjs <lesson id>          # the teaching structure, both repositories
cd apps/web && npx vitest run tests/units.test.ts -t "course <course id>"      # validator, content rules, code steps, kits, Arabic
```

Both must be clean before you ask anyone to look.
