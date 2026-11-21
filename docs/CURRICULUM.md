# The Darsi curriculum

**Status: approved by the user on 2026-11-15** as the basis for writing the courses. Where a decision below or in a
plan has a recommendation, the work follows it unless the user says otherwise; the Arabic word for "chatbot" is
still open. Narration, publishing and deploying still need the user's yes each time. It replaces the three-track page
of October 2026.

Nine tracks: AI, Cyber security, Programming, IoT, Data engineering, Data science, AI agents, AI security and
Optimization. Each has its own plan in `docs/curriculum/<track>.md` (Data science is `data-science.md`; its courses
are `ds-*`). This page holds what the nine plans share. How to write a plan, a course or a lesson video is in the
`darsi-course` skill (`.claude/skills/darsi-course/`); where an older document disagrees with the skill, the skill
wins.

## The three promises

1. **Every track starts from zero.** A learner who has never met the subject can begin, and nothing is used before
   it is taught.
2. **Every course says what it expects**, in the last line of its summary: "No experience needed." or "Before
   this: …". Every track says it too, in one line on its card.
3. **Every lesson is taught the same way**: a video that opens with a hook and follows the eleven parts, then
   reading, practice, a lab, practice, a reflection and a project (the skill's `SKILL.md`).

## The nine tracks in one look

New courses are in **bold**. Every other course exists today and keeps its id.

| Track | Teachers (Beginner → Advanced) | School students (primary, lower, upper secondary) | University students | University teachers |
|---|---|---|---|---|
| AI | `ai-1-1` → `ai-2-1` → `ai-3-1` → `ai-4-1` | `ai-s1`, `ai-s2`, `ai-s3` | **`ai-s4-0`** → `ai-s4` → `ai-d1` → `ai-d2` → `ai-d3` → capstone | `ai-u1` → `ai-u2` → `ai-u3` → `ai-u4` |
| Cyber security | `cyber-1-1` → `cyber-2-1` → `cyber-3-1` → `cyber-4-1` | `cyber-s1`, `cyber-s2`, `cyber-s3` | **`cyber-m1` … `cyber-m8`** → `cyber-s4` → capstone | `cyber-u1` |
| Programming | `code-1-1` → `code-2-1` → **`code-2-2`** → `code-3-1` → `code-4-1` | `code-s1`, `code-s2`, `code-s3` | **`code-m1` … `code-m8`** → `code-s4` → capstone | `code-u1` |
| IoT | `iot-1-2` → `iot-2-1` → `iot-3-1` → `iot-4-1` | `iot-s1`, `iot-s2`, `iot-s3`, then `iot-s4` (moved from university) | **`iot-m1` … `iot-m8`** → **`iot-m9`** → capstone | `iot-u1` |
| Data engineering | `data-1-1` → `data-2-1` → `data-3-1` → `data-4-1` | `data-s1`, `data-s2`, `data-s3` | **`data-m1` … `data-m3`** → `data-s4` → **`data-m4` … `data-m8`** → capstone | `data-u1` |
| Data science | `ds-1-1` → `ds-2-1` → `ds-3-1` → `ds-4-1` | `ds-s1`, `ds-s2`, `ds-s3` | **`ds-m1` … `ds-m8`** → capstone (`ds-s4` retires) | `ds-u1` |
| AI agents | `agents-1-1` → `agents-2-1` → `agents-3-1` → `agents-4-1` | `agents-s1`, `agents-s2`, `agents-s3` | **`agents-s4-0`** → `agents-s4` → capstone | `agents-u1` |
| AI security | `aisec-1-1` → `aisec-2-1` → `aisec-3-1` → `aisec-4-1` | `aisec-s1`, `aisec-s2`, `aisec-s3` | **`aisec-s4-0`** → `aisec-s4` → capstone | `aisec-u1` |
| Optimization | `opt-1-1` → `opt-2-1` → `opt-3-1` → `opt-4-1` | `opt-s1`, `opt-s2`, `opt-s3` | **`opt-m1` … `opt-m8`** → `opt-s4` → capstone | `opt-u1` |

In all: 96 course files today and 53 new courses planned (48 from the university drafts, three starting courses for
the AI tracks, `code-2-2` and `iot-m9`). The nine plans give 556 lessons an outcome and a hook each.

### What each track says on its card

| Track | Its line |
|---|---|
| AI | Starts from zero: what AI is, how it learns, when to trust it. No coding; the university deep dives use school calculus, and the capstone needs Python. |
| Cyber security | Starts from zero: safe passwords, scams, devices and personal data, then how attacks and defences work. No coding; only the university capstone needs Python and a computer. |
| Programming | Starts from zero: exact instructions on paper, then Python on your phone. Each stage builds on the one before. The other tracks borrow their Python from here. |
| IoT | Starts from zero: how a device senses, decides and acts. No kit needed. Teachers only read code; the university courses need Python from Programming. |
| Data engineering | Starts from zero: tidy tables, clean data, then databases and pipelines. SQL is taught here. Where a course writes Python, it names the Programming course to do first. |
| Data science | Starts from zero, by hand: a question, a fair number and an honest chart. Python comes later: teachers write it from Intermediate, students from upper secondary and at university. |
| AI agents | Starts from zero: what an AI agent is, and when to trust one. Students write Python from upper secondary; teachers only read it. |
| AI security | Starts from zero: what happens to what you type into AI, how AI is tricked, and how it is defended. Students write Python from upper secondary; teachers only read it. |
| Optimization | Starts from zero: choosing the best plan under limits. Later it uses school algebra (x + y ≤ 8), and Python from Programming where you write models. |

The Arabic of each line is in its plan.

## Who starts where

### Teachers: one ladder

| Level | Name | A teacher at this level can… |
|---|---|---|
| 1 | Beginner | recognise it, explain it in their own words, and use it safely |
| 2 | Elementary | explain how it works inside, and has tried it by hand |
| 3 | Intermediate | apply it to real school problems and judge the results |
| 4 | Advanced | design with it, evaluate it, and lead others |

Each level needs the one before. The app starts a teacher at the level of the stage they teach, and the placement
check moves them down until they pass, so a teacher who is new to a subject lands on Beginner whatever they teach.
Level 4 for school teachers is about leading the subject at school. University teachers have their own courses at
level 4 (`<track>-u1`; AI has four): how to teach the subject at university. Those expect the subject to
Intermediate, so the ladder below them is the way in for a lecturer who is new to it.

Programming has two courses at level 2: `code-2-1` (first programs, itself a place to start) and the new `code-2-2`
(functions and dictionaries), which other tracks' Intermediate and Advanced courses name when teachers must write
that Python. Most tracks chose instead to let teachers read code and complete it, never write it from a blank
editor: only Optimization (`opt-3-1`, `opt-4-1`) names `code-2-2`.

### Students: a starting course at every stage

A student's level is their school stage. So every stage has a **starting course** that assumes nothing about the
subject and is written for that age. Nobody is sent to a course written for younger children.

| Stage | Ages | Starting course | Then |
|---|---|---|---|
| Primary | 9–12 | `<track>-s1` | |
| Lower secondary | 12–15 | `<track>-s2` | |
| Upper secondary | 15–18 | `<track>-s3` | IoT has a second course (`iot-s4`) |
| University | 18+ | `<track>-m1` in six tracks, `<track>-s4-0` in the three AI tracks (all new) | the rest of the university path below, then the capstone |

A starting course may expect what school has taught by that age (named exactly: "school algebra, x + y ≤ 8") and,
where it writes code, the Programming course named in the Python ladder below. What it needs from the track's
younger stages it teaches again, shorter, in its first lesson. Programming is the one exception: it is a skill
ladder, so each of its stages needs the Python of the one before. A student of 15 to 18 who has never coded starts
with `code-s2`.

How each stage is written (sentence length, examples, code, video length) is in the skill's `course.md`.

### The university path

Today's university courses (`-s4`) are the top of a climb that began in primary school: they assume the three
courses below them. Since 2026-11-05 only university-level courses are published, so a university student meets a
track at its hardest course. Every track therefore gets a university path that starts from zero.

**Six tracks have a full university course to build it from.** On 2026-11-15 the user supplied the Darsi University
drafts: Programming with Python, IoT by simulation, Cyber security, Data science and statistics, Data engineering,
and Optimization. Each is eight modules and a capstone, in English and Arabic, with learner guides, exercises with
tested solutions, quizzes and practical tasks (`H:/Downloads/darsi-university-non-ai-materials.zip`; drafts, not yet
reviewed by a subject specialist or an Arabic reader; their blueprint, `darsi-university-curriculum.md`, was not in
the bundle). In those tracks:

- **One module becomes one course**, `<track>-m1` … `<track>-m8`: the module's three lessons, then a fourth lesson
  built on its practical task, whose project is the task. The module quiz feeds the unit check, and the full learner
  guide ships in the kit as a study guide.
- **The videos are new.** The drafts' narration is a one-minute summary per lesson; each Darsi video is written to
  the eleven parts, with a hook, and voiced in Egyptian Arabic.
- **`<track>-m1` needs no Python.** Outside Programming, the first university course of every track reads and
  completes code and never asks for it from a blank editor, so a student can begin any track beside Programming
  (whose own `code-m1` teaches Python from the first line). Later courses name the Programming course they need.
  Three of the drafts ask for Python before their first module; the plans list that as the other choice.
- **Today's `-s4` and the capstone keep their ids and their content** and take a place on the path: after the
  modules as the advanced or theory course (Cyber security, Programming, Optimization), in the middle as an
  overview (Data engineering), or at upper secondary (IoT). Data science's `ds-s4`, a copy of the teachers' course,
  retires. Each plan gives its reasons.
- **Phones first.** The drafts assume a computer with Python 3. In the plans every lesson runs on the phone, each
  project has a phone-sized version beside the full one, and only the capstone needs a computer. Each plan has a
  table of what the phone's sandbox and Labs can run, and what must be tried first.
- **One capstone per track.** The drafts' capstone becomes the required core under the existing `<track>-capstone`
  id; today's heavier tooling (Docker, CI, a hosted demo) becomes an optional part.

**The three AI tracks** (AI, AI agents, AI security) have no such material. Each gets a four-lesson starting course,
`<track>-s4-0`, that ends where its advanced course begins. In AI the published `ai-s4` is rewritten for adults and
the three deep dives and three lecturers' courses, published at half length, are written out in full.

## The Python ladder

Programming is the home of Python. Other tracks borrow it by rung, and say so. The lesson that first teaches each
construct is in the ledger of `docs/curriculum/code.md`.

| Rung | A learner can write | Teachers | School students | University students |
|---|---|---|---|---|
| 0. Read | Nothing. Code is shown and every line explained; steps are "what does this print?", put the lines in order, fill a gap, find the bug | any course above Beginner | lower secondary and up | any course |
| 1. First programs | `print`, variables, `input` and `int`, `if`/`elif`/`else`, `while`, `for` with `range` | `code-2-1`, lessons 1–3 | `code-s2` | `code-m1` to `code-m3` |
| 2. Functions and collections | lists, `def` with parameters and `return`, dictionaries, tuples, sets, `sorted` | lists in `code-2-1` lesson 4; the rest in `code-2-2` (new), lessons 1–3 | functions and lists in `code-s3`; no dictionaries at school | functions in `code-m4`; lists, dictionaries, tuples, sets and `sorted` in `code-m5` |
| 3. Idioms | list comprehensions, files, `try`/`except`, CSV and JSON, tests, classes, recursion, `key=` and `lambda` | read only, in `code-2-2` lesson 4 | none | comprehensions in `code-m5`; files, exceptions, CSV and JSON in `code-m6`; tests in `code-m7`; classes in `code-m8`; recursion, `key=` and `lambda` in `code-s4` |

Rules:

- **No Python in a Beginner course outside Programming, and nothing typed at primary.** Data science at Beginner is
  done by hand and in the labs.
- **To ask learners to write code at a rung, the course's "Before this" names the course that teaches the rung.**
- **Below that, a lesson may teach what it needs in place:** its reading explains the construct with an example,
  and the first step that uses it is guided (order the lines, fill a gap, find the bug), not a blank editor. The
  course's Python line then says "taught here". Lower-secondary courses that start Python themselves (`data-s2`,
  `agents-s2`) do this, and add "If you have done “First Python”, the code will be familiar." School students meet
  dictionaries this way (`agents-s3`), since Programming does not teach them before university.
- SQL is taught by the Data engineering courses that use it. It needs no rung.

## One home for each shared idea

Several tracks need the same idea. A Beginner or starting course teaches what it needs itself, with its own example.
Above that, a lesson gives a two-sentence reminder, names the home, and spends its time on what only its track adds.

| Idea | Home for teachers | Home for school students | Home at university | What the other tracks add |
|---|---|---|---|---|
| Pupils' and personal data: share the task, not the child | `cyber-3-1-1` | `cyber-s2` | | AI: what you paste into a chatbot. AI security: chat history and training settings. Agents: cloud or phone, and cost. Data: who may open a sheet. Data science: small groups in published results |
| What a language model is; tokens | `ai-2-1-1` | `ai-s2-1` | `ai-s4-0-2` | one sentence and an example at first use |
| Prompting | `ai-2-1-2` | `ai-s2-2` | `ai-s4-0-3` | Agents: a request an agent can act on |
| Check by the stakes; confident and wrong | `ai-1-1-4` | `ai-s1-4` | `ai-s4-0-4` | AI security: what a wrong answer can cost. Agents: check the call, not the answer |
| Train and test, overfitting, fairness by group | `ai-3-1-3`, `ai-4-1-1` | `ai-s3` | `ai-s4-1`, `ai-s4-2` | Data science measures them with numbers and code (`ds-m7`, `ds-m8`) |
| Nearest neighbours | `ds-3-1-3` | `ai-s3-2` | | |
| AI-writing detectors | `aisec-1-1-4` | `aisec-s2-1` | | AI level 4 (`ai-4-1-3`) builds assessment on it |
| Copyright and licences for what AI makes | `ai-2-1-3` | `ai-s2-4` | `ai-s4-4` | |
| Ask before it acts; least privilege | `agents-1-1-4`, `agents-4-1-2` | `agents-s2-3`, `agents-s3-4` | `agents-s4-0-4` | AI security takes the attacker's side: how approval is tricked |
| Mean, median and honest charts | `data-1-1-3` | `data-s2-4` | `ds-m3` | Data science goes on to spread and uncertainty |
| Hashes, encryption and keys | hashes in `cyber-2-1-2`; encryption and keys in `cyber-2-1-4` | `cyber-s3-4` | `cyber-m4` | AI security: is this the real model? (`aisec-3-1-4` teaches the fingerprint itself). Data engineering: fingerprints of files |
| Safe queries (injection) | | | `cyber-m7` | Data engineering: parameters in SQL (`data-m3`) |
| Netiquette and bullying online | | `cyber-s2-3` | | |
| Binary search | | `code-s3-3` | | Data engineering: indexes |
| Reading CSV and JSON files | `data-2-1` | | `code-m6` | Data engineering and Data science build on it |
| Shortest paths | `opt-1-1-2` | `opt-s3-2` | | |
| Passwords and phishing | `cyber-1-1` | `cyber-s1` | `cyber-m2`, `cyber-m3` | AI security: scams and fakes made with AI |
| Sensors and readings | `iot-1-2` | `iot-s1` | `iot-m1`, `iot-m2` | Data tracks: the readings as a table |

## What the plans ask of the app

None of this is built. Each item is a decision in the plans.

1. **Show what a track and a course expect.** The track's line on its card (the `summary` field exists but no
   built-in track has one), and each course's last line where courses are listed.
2. **List the courses of a level in path order.** Today they are listed by id, which puts a new starting course
   last. A level will hold up to eleven courses.
3. **Placement.** A student who misses the check stays on their own stage's starting course; today the check can
   walk a 16-year-old down to the primary course. With many courses at one level, passing the check can no longer
   mean "skip this course": it should choose the level only.
4. **University teachers.** Their level is their `-u` courses; the school-leadership course `<track>-4-1` is
   labelled "for school leaders".
5. **Capstones at university.** They sit at level 3 (upper secondary) today.
6. **A study guide in the kit**, for the module courses: the drafts' full learner guide.
7. **The phone's Python.** Tried on 2026-11-15: `docs/curriculum/phone-python.md` lists what it runs, what it does
   differently (dictionary order, unstable sorting, error wording, rounding at a half) and what it lacks, and counts
   what each track's drafts use that it doesn't have. Programming's modules 1 to 5 need nothing; the six small
   additions at the end of that page (capturing every `print`, a forgiving `open` and the missing exception names,
   `csv.DictWriter`, `statistics`, a stable `sorted`, a few modules) cover most of the rest. Data science needs
   `statistics` and `open(newline="")` in nearly every file; Data engineering's Python `sqlite3` examples become SQL
   steps.
8. **Labs.** Two new apps (`resample` for Data science, `mqtt` for IoT), new cases for `prompt` and `trace`, and
   module lessons that have no fitting lab yet (six in Cyber security, six in Data engineering, five in
   Programming).

## Work and cost

| | Lessons |
|---|---|
| Done (written with the skill on 2026-11-15: the pilot `agents-1-1-1`, `code-m1` to `code-m5`, and `ai-s4-0`, `agents-s4-0`, `aisec-s4-0`; narrated, videos and kits built, not published) | 33 |
| Standard pass (the same lesson, brought to the eleven parts) | 281 |
| Rewrite | 62 |
| New | 180 |
| **All** | **556** |

Narration for all of it is about $17 for both languages (about $0.04 for a new or rewritten lesson, $0.02 for a
standard pass). The cost that matters is writing and review: the university drafts have not been read by a subject
specialist or an Arabic reader, and none of their code has run on a phone.

The order the plans propose:

1. **Review and trial.** A specialist and an Arabic reader look at the drafts (still to arrange); the phone's Python
   is tried against each module's code (done 2026-11-15, `docs/curriculum/phone-python.md`; the drafts were read,
   not run).
2. **Programming's university path** (`code-m1` to `code-m5` first): six other tracks borrow their Python from it.
3. **The three AI tracks' starting courses, and the standard pass on the 33 courses published today.**
4. **The other five university paths**, one track at a time.
5. **The teachers' ladders**, Beginner first, then published again below level 4.
6. **The school stages**, when they are to be published again.

## Decisions that cut across the tracks

Each plan ends with its own decisions. These are the ones several plans share. The user approved the plans on
2026-11-15, so the work follows the recommendation in 1 to 7; publishing (5) and the app changes (7) still go out
only with the user's yes at the time. 8 is open.

1. **Build the university path from the Darsi University drafts, one module to one course?** Recommended: yes.
   48 new courses in six tracks, after review.
2. **Should every track's first university course need no Python?** Recommended: yes. The other choice follows
   three drafts and puts five or six Programming courses in front of IoT, Data engineering and Data science.
3. **Phones first?** Recommended: yes. Every lesson on the phone, a phone version of each project, a computer only
   for the capstone.
4. **Move the capstones to university, with the drafts' capstone as the required core?** Recommended: yes.
5. **Publish the teachers' ladder below level 4 again, once its pass is done?** Recommended: yes. Without it the
   published level-4 and university-teacher courses name courses nobody can open, and a teacher who is new to a
   subject has no way in.
6. **Make the Beginner courses of AI agents and AI security stand on their own?** Recommended: yes. Today both say
   "Before this: AI level 1".
7. **The app changes above**, of which the order of courses and the placement rule must come before any new
   university course is published.
8. **One Arabic word for "chatbot".** The videos say «شات بوت» and the course text says «روبوت الدردشة»;
   `docs/curriculum/ar-lingo.md` has no entry.

## The plans

Each plan has the same sections: the track in one look, the paths, what changes and why, the ledger of what is
taught where, every course with its outcomes and its four lessons (each lesson's outcome, its video's hook, its new
terms, its lab, and the work it needs), how today's courses map onto it, the work in order, and the decisions that
are the user's. `node .claude/skills/darsi-course/scripts/check-curriculum.mjs --all` checks all nine.

Work on a lesson is one of: `D` done, `S` a standard pass (the same lesson, brought to the eleven parts), `R` a
rewrite, `N` a new lesson, `T` text only.

## Ids

- Teachers' courses `<track>-<level>-<n>`; students' `<track>-s<level>`; university teachers' `<track>-u<n>`;
  university students' module courses `<track>-m1` … `<track>-m8`, or the starting course `<track>-s4-0` in the three
  AI tracks; AI's deep dives `ai-d1`–`ai-d3`; capstones `<track>-capstone`.
- Lessons `<course>-1` … `<course>-4`, and `<course>-check`.
- An id never changes once a course is published, and it keeps its content: progress, media and certificates hang
  on it.
- A lesson's storyboard in Lesson Studio has the lesson id in capitals (`AI-2-1-3`); its folders are in lower case.
