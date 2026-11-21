# Planning a track's curriculum

A track's plan is `docs/curriculum/<track>.md` (the Data science track is `data-science.md`; its courses are `ds-*`).
It says who can start where, what each course and lesson is for, and what work is still to do. `docs/CURRICULUM.md`
holds what all tracks share: the Python ladder, the home of each shared idea, the track order. Read both before you
write a course, and change the plan first when a course needs something the plan doesn't give it.

## The paths in every track

**Teachers climb one ladder.** Beginner, Elementary, Intermediate, Advanced (`<track>-1-1` … `<track>-4-1`), each
needing the one before. The app starts a teacher at the level of the stage they teach and the placement check moves
them down until they pass, so a teacher who is new to the subject lands on Beginner whatever they teach. Above the
ladder sit the courses for university teachers (`<track>-u1`, `teach: "university"`): how to teach the subject at
university. They expect the subject itself, to Intermediate.

**Students start at their own stage.** A student's level is their school stage, so each stage has a **starting
course** that assumes nothing about the subject: `-s1` primary (9–12), `-s2` lower secondary (12–15), `-s3` upper
secondary (15–18), and one at university. A 16-year-old is not sent to a course written for a 9-year-old. A stage
may have more courses after its starting course; today only university does. In the six tracks with a Darsi
University course (Programming, IoT, Cyber security, Data science, Data engineering, Optimization) the university
path is eight module courses, `<track>-m1` … `<track>-m8`, one per module of that course, and `-m1` is the starting
course. In the three AI tracks it is a four-lesson starting course `<track>-s4-0`, then the advanced course `-s4`
(and AI's three deep dives). Every university path ends in the capstone. `docs/CURRICULUM.md`, "The university
path", says how a module becomes a course.

| A starting course may expect | How it says so |
|---|---|
| Nothing about the subject | "No experience needed." |
| What school has taught by that age, named exactly | "No experience needed, only school algebra (x + y ≤ 8)." |
| Python, from the Programming course named in `docs/CURRICULUM.md` | "Before this: “First Python” (Programming, lower secondary)." |

What a starting course needs from the track's earlier stages it teaches again, shorter, in lesson 1. Programming is
the one exception: it is a skill ladder, so each of its stages needs the Python of the one before and says so.

## The rules a plan keeps

1. **Zero is real.** For each starting course, write the ledger: every term, symbol, skill and Labs app the course
   uses, and the lesson that first teaches it. Nothing is used above its row. A term borrowed from another track is
   taught in place, in a sentence with an example.
2. **Every course ends its summary with one line:** "No experience needed." (with the school knowledge, if any) or
   "Before this: …" naming courses by title, track and level. No course is silent about what it expects.
3. **Code follows the Python ladder** (`docs/CURRICULUM.md`). A course may ask learners to write code at a rung only
   if its "Before this" names the course that teaches that rung. Below that, a lesson may show code it explains line
   by line and ask for guided steps (`parsons`, `codefill`, `bug`, "what does this print?"). Nothing is typed at
   primary, and no Python appears in a Beginner course outside Programming.
4. **Each stage is written for its age** (`course.md`, "Levels and school stages"): the examples, the sentence
   length, who the project is done with, and the maths. A university course never says "your class", "a grown-up" or
   "your pupils"; a primary course never asks for an account with an age limit.
5. **One home for each shared idea.** `docs/CURRICULUM.md` lists ideas several tracks need (pupils' data, what a
   language model is, overfitting, hashes) and the lesson that owns each. A Beginner course teaches what it needs
   itself, with its own example. Above Beginner, a lesson that meets a shared idea gives a two-sentence reminder,
   names the home, and spends its time on what only this track adds. Two lessons in one track never teach the same
   thing twice: the later one opens with "At level 1 you…" and goes further.
6. **A course is a path of four lessons:** meet the idea, open it up, use it where it can go wrong, take charge of
   it. Each lesson needs the one before and names the next.
7. **Outcomes are things a person can be seen doing**, with verbs from the course's level (`teaching-model.md`):
   recognise and explain at Beginner, trace and try at Elementary, apply and judge at Intermediate, design and
   evaluate at Advanced. Never "understand", "know" or "learn about". A lesson's outcome in the plan may use its
   new terms; the video's promise says the same outcome in everyday words, because the terms aren't taught yet
   (`check-lesson` refuses a promise that uses them). `code-m1` lesson 1: the plan's "predict the value an
   expression gives" became the promise "predict what a calculation gives".
8. **Every lesson has its hook in the plan.** The plan is where hooks are compared across a course, so that four
   lessons don't open the same way and a course can follow one small story. Each hook passes the seven tests in
   `video.md`: the learner's own world, ends on a question it doesn't answer, no new term, specific, at most four
   sentences and 40 words with a first sentence of 12 words or fewer, paid off by the lesson, honest. Keep a good
   story from today's video and fix its ending; write a new one when the old hook is about the subject.

## The format

`scripts/check-curriculum.mjs` reads these headings and tables, so keep them exactly. Write prose where the format
doesn't ask for a table.

```markdown
# <Track name>: the curriculum

Status line: proposed or approved, the date, and what it replaces.

## The track in one look
Two or three sentences: what a teacher and a student can do at the end, and what the track never assumes.

- **Track line (en):** one sentence for the app's track card: where it starts and what it needs later.
- **Track line (ar):** the same in Modern Standard Arabic.

## The paths
### Teachers
| Level | Course | After it, you can | Before this | Work |
### Students
| Stage | Course | After it, you can | Before this | Work |
### University teachers
| Course | After it, you can | Before this | Work |

## What changes, and why
The few decisions that reshape the track, each with its reason: what moves, what is new, what stops repeating.

## The ledger
| Idea or skill | First taught in | Used again in |
One table for teachers, one for students. Only the ideas later lessons lean on.

## The courses
### `<course id>` <Course title>
- **For:** teachers, level 1 Beginner | students, upper secondary (15–18) | university teachers | …
- **Status:** keep | revise | rewrite | new | move
- **After it, you can:** one to three outcomes.
- **Before this:** No experience needed. | `course-id` “Title” (Track, level). Always the id in backticks.
- **Python:** none | shown and explained | rung 1 | rung 2 | rung 3 | SQL (add "taught here" when the course teaches it itself)
- **The path:** one sentence: how the four lessons build.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Title | one outcome | The hook, in full, as it will be spoken. | term; term | lab id | S |

- **Unit check:** what it must cover, if that changes.
- **Changes:** what is different from today, lesson by lesson, and why.

## How today's courses map
| Today | In this plan | What happens |
Every course file of the track, once.

## Work, in order
What to do first and why, with counts of lessons by work code and the narration cost.

## Decisions for the user
Numbered. Each one: the question, the recommendation, what it costs.

## Reference
Facts the courses use, labs, placement notes: kept from the earlier plan when still true.
```

**Course ids.** Existing ids never change (progress, media and certificates hang on them). A new course gets a
working id in the same pattern; university students' new courses are `<track>-m1` … `<track>-m8` (from a Darsi
University module; a further course written here continues the numbers, as `iot-m9` does) or `<track>-s4-0` (a
starting course written here). Before choosing an id, check it is not already a lesson id: `iot-s4-1` is lesson 1
of `iot-s4`.

**Status of a course.** `keep`: the same lessons, each brought to the standard. `revise`: some lessons change
content or order. `rewrite`: all four are written again (wrong stage, a copy of another course). `new`: it does not
exist (once it is written, it keeps `new` with the date, and its lessons become `D`). `move`: the same course at
another level.

**Work on a lesson.**

| Code | Meaning | Narration |
|---|---|---|
| `D` | Done: already written with this skill | none |
| `S` | Standard pass: the same lesson, its storyboard brought to the eleven parts (the hook in the plan, the promise, show before name, the two checks, the next lesson) and the unit text aligned | the changed sentences, about half |
| `R` | Rewrite: its content, its stage or its place in the course changes | all of it |
| `N` | New lesson | all of it |
| `T` | Text only: a unit check, a capstone part, or a lesson whose video stays | none |

Narration is about $0.02 per language for a whole lesson (`pipeline.md`), so a rewrite or a new lesson is about
$0.04 and a standard pass about $0.02. Ask before spending it.

## How to write a plan

1. Read `docs/CURRICULUM.md`, the track's current plan, and every course of the track: titles, summaries, each
   lesson's reading, key terms, lab, code steps and today's hook. Read the review notes for the track if there are
   any.
2. Write the ledgers first, for teachers and for each student stage. They show what is used before it is taught,
   what is taught twice, and what a stage's starting course is missing.
3. Decide the paths: which courses stay, which lessons move, what is new. Change as little as teaches well: a good
   lesson in the right place gets a standard pass, not a rewrite.
4. Write each course's outcomes, then each lesson's, then the hooks. Read the four hooks of a course together.
5. Fill the map and the work list, and put what only the user can decide under "Decisions for the user".
6. Run the check until it is clean, then read the plan once as a learner who knows nothing.

```bash
node .claude/skills/darsi-course/scripts/check-curriculum.mjs <track>      # or --all
```

It fails on a course without its "Before this" line, a Beginner or starting course that expects something, a course
that doesn't have four lessons, an outcome that starts with "understand", a hook that breaks the length rules, doesn't
end on a question or uses one of the lesson's own new terms, more than four new terms, an unknown work code, a
"Before this" naming a course that exists nowhere, and a course file of the track missing from the map.
