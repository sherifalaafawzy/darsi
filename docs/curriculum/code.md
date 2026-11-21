# Programming: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the eight-course plan of 2026-10-29 in this
file; the facts, the rules for code steps and the lab notes at the end are kept from it. What all tracks share is in
`docs/CURRICULUM.md`; how to write a course is in the `darsi-course` skill. No course, video or app code has been
changed for this plan.

## The track in one look

A teacher who finishes the track can write small Python programs for their own work, teach programming the way the
research says works, and lead computing in a school with few devices. A student goes from giving a robot exact
instructions (primary) to first Python (lower secondary) and functions, lists and classic algorithms (upper
secondary); a university student starts again from zero and ends with tested, documented programs, algorithms and a
capstone. The track never assumes another track, and every other track borrows its Python from here.

- **Track line (en):** Starts from zero: exact instructions on paper, then Python on your phone. Each stage builds on the one before. The other tracks borrow their Python from here.
- **Track line (ar):** يبدأ من الصفر: تعليمات دقيقة على الورق، ثم Python على هاتفك. كل مرحلة تبني على التي قبلها، والمسارات الأخرى تأخذ ما تحتاج إليه من Python من هنا.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `code-1-1` Computational thinking, unplugged and with blocks | teach exact instructions, loops, decisions and debugging with paper, games and a robot | No experience needed. | 4 standard passes |
| 2 Elementary | `code-2-1` Python for teachers | write first programs for your own work: print, variables, decisions, loops and lists of marks | No experience needed. | 4 standard passes |
| 2 Elementary | `code-2-2` More Python for teachers (new) | write functions and dictionaries, sort and group data, and read the short forms other people write | `code-2-1` | 4 new lessons |
| 3 Intermediate | `code-3-1` Teaching and assessing code | teach programming with PRIMM, Parsons problems, a debugging routine and hinge questions | `code-2-1` | 4 standard passes |
| 4 Advanced | `code-4-1` Leading computing with few devices | lead computing in a school with few or no devices, and write the plan colleagues follow | `code-3-1` | 4 standard passes |

Level 2 has two courses. `code-2-1` is first programs; `code-2-2` is the Python that other tracks' Intermediate and
Advanced courses need. `code-3-1` and `code-4-1` teach with first programs only, so they need `code-2-1` and not
`code-2-2`.

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `code-s1` Give instructions | give a robot exact steps, repeat them, make a decision, and find a bug. No typing | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `code-s2` First Python | write programs that print, calculate, remember, decide and repeat | No experience needed. | 4 standard passes |
| Upper secondary (15–18) | `code-s3` Functions, lists and algorithms | write tested functions, work with lists, and search and sort | `code-s2` | 4 standard passes |
| University, start | `code-m1` Values and variables (new) | trace values and names through a program, and build a study-time calculator | No experience needed. | 4 new lessons |
| University | `code-m2` Decisions and validation (new) | write a rule with exact thresholds, and check an answer before trusting it | `code-m1` | 4 new lessons |
| University | `code-m3` Loops (new) | write loops that always stop, and trace one that misbehaves | `code-m2` | 4 new lessons |
| University | `code-m4` Functions (new) | split a program into small functions with contracts, and test each one | `code-m3` | 4 new lessons |
| University | `code-m5` Lists and dictionaries (new) | choose a list, a dictionary or a set for a job, and count the work each choice costs | `code-m4` | 4 new lessons |
| University | `code-m6` Files and exceptions (new) | load and save records as text, CSV and JSON, and keep the evidence of every rejected row | `code-m5` | 4 new lessons |
| University | `code-m7` Tests and debugging (new) | reproduce a failure, fix it, and keep a test so it never returns | `code-m6` | 4 new lessons |
| University | `code-m8` Classes and reproducibility (new) | decide when a class helps, and package a program a stranger can run and test | `code-m7` | 4 new lessons |
| University, advanced | `code-s4` Algorithms and software engineering | predict how work grows, write recursion, choose data structures, and work test-first | `code-m7` | 4 standard passes |
| University, capstone | `code-capstone` An offline learning-resource tracker | design, build, test and demonstrate a tool of your own | `code-m8` | text only |

Who starts where:

- **Programming is a skill ladder**, so a stage needs the Python of the stage before, and says so. Two stages still
  start from zero: primary (`code-s1`, no typing) and lower secondary (`code-s2`).
- **An upper-secondary student who has never coded starts with `code-s2`.** It takes four lessons, assumes nothing,
  and is written so that a 16-year-old is not talked down to: its cases are a phone, a game, a ticket and a chore.
  `code-s3` says so in its summary.
- **A university student starts with `code-m1`**, whatever they did at school. A student who finished `code-s3` will
  find `code-m1` to `code-m4` fast and `code-m5` onward new.

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `code-u1` Teaching programming and algorithms at university | teach growth rates, recursion and tracing so they stick, and assess four hundred students fairly | `code-2-2` and `code-3-1`, or you already teach programming | 4 standard passes |

## What changes, and why

1. **University students get a real first year: eight courses, from zero.** Today a university student meets the
   track at `code-s4` (big O, recursion, data structures, testing), which assumes two school courses. The user's
   drafts for "Programming Foundations with Python" (eight modules and a capstone, sent 2026-11-15) become eight
   courses, `code-m1` to `code-m8`. One module is one course: its three lessons, then a fourth lesson built on its
   practical task. Module 1 has five lessons, so two are merged (see `code-m1`). Each lesson keeps the module
   lesson's main outcome; the rest goes into the reading and practice. The module's quiz and "Check yourself"
   questions feed the unit check, and its learner guide ships in the kit as a study guide.
2. **`code-s4` moves after the modules and stops repeating them.** It names `code-m7`. Its three gaps close: the set
   it used in lesson 1 is now taught in `code-m5`; the dictionary its lesson 2 used for memoisation is taught in
   `code-m5`; and its lesson 4 no longer re-teaches unit tests and edge cases (their home is `code-m7`) but goes on
   to writing tests first. Stacks and queues have one home, `code-s4-3`.
3. **Teachers get the second half of Python: `code-2-2`.** Teachers' Python stopped at lists, while graded steps in
   other tracks at levels 2 to 4 use functions, dictionaries, tuples, sets, comprehensions, `lambda` and `import`.
   On 2026-11-04 three paragraphs and two steps on all of that were squeezed into the reading of `code-2-1-4`. The
   new course takes that material, one idea per lesson, and `code-2-1-4` goes back to lists.
4. **`code-2-1` starts from zero.** It already teaches every word it uses, and five other tracks send teachers to
   it for Python today. Its line becomes "No experience needed." `code-1-1` stays the Beginner course and the
   gentler start.
5. **`code-3-1` and `code-4-1` need only first programs.** Every code step in them uses rung 1 and lists, except
   `code-4-1-check` question 10, which asks teachers to finish a `def`: it is rewritten as a loop.
6. **`code-s3` teaches functions on numbers, then lists.** Lesson 1 asked for `average(marks)` one lesson before
   lists were taught. Its example becomes a function of one number; `average(marks)` moves to lesson 2. Stacks and
   queues leave lesson 2.
7. **One home for each construct.** The ledger below says, lesson by lesson, where each Python construct is first
   taught for teachers, for students at school and for university students. School students learn functions and
   lists; dictionaries, sets, files, tests and classes are university work.
8. **The capstone moves to university** and, as proposed here, changes what is built (Decisions, 3).
9. **Every video gets the standard pass.** Of today's 36 hooks, 5 end on a question (the four in `code-u1`, and
   `code-s1-3`); the rest answer themselves in their last sentence. 16 of 36 videos name the idea before they show
   a case. None has the promise line or names the next lesson. In students' videos a teacher tells the hook as
   their own story 8 times out of 16: below, every student hook is about someone the learner's age or told to
   "you".

## The ledger

### The Python ladder, construct by construct

This is the table the other tracks borrow from. A course in another track that asks learners to write a construct
names the course in the same row.

| Construct | Teachers | Students at school | University students |
|---|---|---|---|
| `print`, numbers and text, arithmetic | `code-2-1-1` | `code-s2-1` | `code-m1-1` |
| Variables | `code-2-1-1` | `code-s2-2` | `code-m1-2` |
| `input`, `int` (at university also `float` and f-strings) | `code-2-1-1` | `code-s2-2` | `code-m1-3` |
| Comparisons, `and`, `or`, `not` | `code-2-1-2` | `code-s2-3` | `code-m2-1` |
| `if`, `elif`, `else` | `code-2-1-2` | `code-s2-3` | `code-m2-2` |
| `while` | `code-2-1-3` | `code-s2-4` | `code-m3-1` |
| `for` with `range` | `code-2-1-3` | `code-s2-4` | `code-m3-2` |
| Lists, and loops over them | `code-2-1-4` | `code-s3-2` | `code-m5-1` |
| `def`, parameters, `return` | `code-2-2-1` | `code-s3-1` | `code-m4-1` |
| `assert` | not used in teachers' courses | `code-s3-1` | `code-m4-3` |
| Dictionaries | `code-2-2-2` | not at school | `code-m5-2` |
| Tuples: pairs, two names on one line | `code-2-2-3` | `code-s3-3` (two names on one line, in the reading) | `code-m5-2` (pairs); `code-m7-1` (a function that returns two values) |
| Sets | `code-2-2-3` | not at school | `code-m5-3` |
| `sorted` | `code-2-1-4` (a list); `code-2-2-3` (pairs, reversed) | not at school (sorting is written by hand in `code-s3-4`) | `code-m5-2` |
| List comprehensions | `code-2-2-4` (to read) | not at school | `code-m5-4` |
| `key=` and `lambda` | `code-2-2-4` (to read) | not at school | `code-s4-3` (in the reading, with a guided step) |
| `try`, `except`, `raise` | `code-2-2-4` (to read) | not at school | `code-m6-2` |
| Files (`with open`), CSV and JSON | `code-2-1-4` (a CSV file, opened for them); `code-2-2-4` (`import csv`, to read) | not at school | `code-m6-1`, `code-m6-3` |
| `import` | `code-2-2-4` (to read) | not at school | `code-m6-3` (`csv`, `json`); `code-m7-1` (your own file) |
| Tests with `unittest` | not taught | not at school | `code-m7-2` |
| Classes | not taught | not at school | `code-m8-1` |
| Recursion | university teachers only: `code-u1-2` | not at school | `code-s4-2` |

The same, by rung, for the shared table in `docs/CURRICULUM.md`:

| Rung | Teachers | Students at school | University students |
|---|---|---|---|
| 1. First programs | `code-2-1`, lessons 1 to 3 | `code-s2` | `code-m1`, `code-m2`, `code-m3` |
| 2. Functions and collections | `code-2-1` lesson 4 (lists), then `code-2-2` lessons 1 to 3 | `code-s3` lessons 1 and 2: functions and lists only | `code-m4` (functions), `code-m5` (lists, dictionaries, tuples, sets, `sorted`) |
| 3. Idioms and beyond | `code-2-2` lesson 4, to read only | not at school | comprehensions `code-m5`; files, CSV, JSON, exceptions and `import` `code-m6`; tests `code-m7`; classes `code-m8`; recursion, `key=` and `lambda` `code-s4` |

Two things follow for the other tracks. An upper-secondary course that needs a dictionary names `code-s2` and
teaches the dictionary itself ("taught here"), as `agents-s3` does. A university course that writes rungs 1 and 2
names `code-m5`; `code-m3` is enough for rung 1.

### Teachers

| Idea or skill | First taught in | Used again in |
|---|---|---|
| Algorithm: exact steps, in order | `code-1-1-1` | every course |
| A loop as an idea; a pattern | `code-1-1-2` | `code-2-1-3`, `code-4-1-4` |
| A decision: if, then, else; AND and OR | `code-1-1-3` | `code-2-1-2` |
| Bug; the routine (test, first wrong step, change one thing, test again) | `code-1-1-3` | `code-2-1-2` (one-sentence reminder), `code-3-1-3` |
| The four parts of computational thinking; halving | `code-1-1-4` | `code-4-1-1`, `code-4-1-4` |
| A program runs line by line; text and numbers | `code-2-1-1` | everything after |
| Comparisons; testing at the boundary | `code-2-1-2` | `code-3-1-4` |
| Running total; off by one | `code-2-1-3` | `code-3-1-1`, `code-3-1-4` |
| Lists | `code-2-1-4` | `code-2-2`, `code-3-1-2`, `code-4-1-1` |
| Functions and `return` | `code-2-2-1` | `code-2-2-2` to `code-2-2-4`; other tracks, levels 3 and 4 |
| Dictionaries | `code-2-2-2` | `code-2-2-3`, `code-2-2-4`; other tracks |
| Tuples, slices, sets | `code-2-2-3` | `code-2-2-4`; other tracks |
| Reading a comprehension, a `key=`, an `import`, a `try` | `code-2-2-4` | other tracks |
| PRIMM, trace table, predict question | `code-3-1-1` | `code-3-1-4`, `code-4-1-3` |
| Parsons problem, distractor | `code-3-1-2` | `code-3-1-4`, `code-4-1-3` |
| Error messages; logic errors | `code-3-1-3` | `code-4-1-2` |
| Misconception, hinge question | `code-3-1-4` | `code-4-1-4` |
| Unplugged, then plugged | `code-4-1-1` | `code-4-1-4` |
| Pair and group roles, live coding | `code-4-1-2` | `code-4-1-4` |
| Desk check, paper assessment | `code-4-1-3` | `code-4-1-4` |

### Students

Primary and lower secondary each start from the first row. Upper secondary builds on lower secondary. University
starts from the first row again.

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| Exact steps, in order | `code-s1-1` | `code-s2-1` | | `code-m1-1` |
| Repeat | `code-s1-2` | `code-s2-4` | `code-s3-2` | `code-m3-1`, `code-m3-2` |
| Decide | `code-s1-3` | `code-s2-3` | | `code-m2-1`, `code-m2-2` |
| Bugs; find the first wrong step | `code-s1-4` | `code-s2-2` (error messages) | `code-s3-1` (tests) | `code-m3-3`, `code-m7-3` |
| Variables and input | | `code-s2-2` | | `code-m1-2`, `code-m1-3` |
| Testing at the boundary | | `code-s2-3` | `code-s3-4` (edge cases) | `code-m2-3`, `code-m7-3` |
| Functions | | | `code-s3-1` | `code-m4-1` |
| Lists | | | `code-s3-2` | `code-m5-1` |
| One by one, or halving | | `code-s2-4` (in the lab) | `code-s3-3` | `code-m3-1` (in the lab), `code-s4-1` |
| Sorting; counting the work | | | `code-s3-4` | `code-m5-3` (counting steps), `code-s4-1` |
| Dictionaries, sets | | | | `code-m5-2`, `code-m5-3` |
| Files, exceptions | | | | `code-m6` |
| Unit tests, regression tests | | | | `code-m7` |
| Classes, README, reproducible results | | | | `code-m8` |
| Big O, recursion, stacks and queues, test-first | | | | `code-s4` |

## The courses

### `code-1-1` Computational thinking, unplugged and with blocks
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** tell an exact instruction from a vague one; spot a pattern and say it as a loop; write a decision and find a bug with a routine; name the four parts of computational thinking in a school task.
- **Before this:** No experience needed.
- **Python:** shown and explained (two short snippets, each explained in its reading; nothing is typed)
- **The path:** exact steps, then steps said once, then decisions and mistakes, then two ways to do one job.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Algorithms: exact instructions | tell an exact instruction from a vague one, and write steps a “human robot” can follow without guessing | I asked my class how to draw a house. They said: draw a square. So I drew a tiny one, in the corner of the board! They laughed, but what had they forgotten to tell me? | algorithm; program; sequence; exact instruction | robot | S |
| 2 | Loops: repeat the pattern | spot steps that repeat, and say them once with a count | My robot needed sixteen cards to walk round the playground square. Forward, forward, forward, turn, again and again. Then a pupil said: Miss, it’s the same thing four times! What should I have written instead? | loop; pattern; repeat count; for each | robot | S |
| 3 | Decisions and debugging | write a decision as if, then, else, and find a mistake with a routine: test, find the first wrong step, change one thing, test again | My robot was meant to stop at the door. It walked straight into the wall, every single time. My pupils wanted to throw the cards away and start again. What should we do first? | condition; IF … THEN … ELSE; AND and OR; bug (debugging) | logic | S |
| 4 | Break it down | name the four parts of computational thinking in a school task, and compare two ways to do a job by counting their steps | Guess my number, I told my class: one to a hundred. Half of them tried one, two, three, four, and gave up. One girl found it in six guesses. What did she do differently? | decomposition; pattern recognition; abstraction; halving (binary search) | search | S |

- **Unit check:** question 6 shows a decision as Python (`if break_time and raining:`). Lesson 3's reading must show one decision written that way first, or the question is written with IF and THEN.
- **Changes:** content stays. Tellers: Ms Amina (1, 2), Mr Joseph (3), Ms Salma (4). Lesson 1 defines "algorithm" in its first teaching scene: the square on the board comes first. Lesson 4 is 476 words: trim to 450. The summary ends "No experience needed."

### `code-2-1` Python for teachers
- **For:** teachers, level 2 Elementary (the first of two courses)
- **Status:** revise
- **After it, you can:** predict what a short program shows; write a marking rule and test it at its boundaries; write a loop that totals or prints a table; keep a class's marks in a list and summarise them.
- **Before this:** No experience needed. It starts Python from the first line. New to code altogether? “Computational thinking, unplugged and with blocks” (level 1) is the gentler start.
- **Python:** rung 1, taught here, and lists
- **The path:** one line at a time, then a choice, then a repeat, then many values under one name.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | First programs: print, variables and input | predict what a short program shows, line by line, and write one that asks for two numbers and works with them | Forty pupils, two test marks each, and one calculator. Every term I type eighty numbers, and I never know if I slipped. Could my phone do the sums, the same way every time? | program; variable; text (a string); input() and int() | trace | S |
| 2 | Decisions: if, elif and else | write a marking rule as if, elif and else, and test it at its boundaries | Seventy and above is an A, fifty and above a B. Yet last term I gave a boy with exactly fifty a C. How do I write that rule so it can’t slip? | comparison; if, elif and else; indent; boundary | bugs | S |
| 3 | Loops: for, range and while | trace a loop value by value, and write one that builds a total or a times table | Primary Three needed seven times tables, one sheet for every desk. Writing them out took me a whole evening. Every line followed the same rule. So why was I the one doing the writing? | loop; range(a, b); running total; off by one | trace | S |
| 4 | Lists: a tool for your marks | keep a class’s marks under one name, and get the average, the top mark and a count from them | The head wants three numbers from my class by noon. The average, the top mark, and how many failed. I have forty marks on paper. Must every single mark get a name of its own? | list; index; len, sum, max and min; CSV file | trace | S |

- **Unit check:** unchanged. It already asks only for rung 1 and lists.
- **Changes:** lesson 4 goes back to lists. The three paragraphs on functions, dictionaries, comprehensions and `lambda`, and steps `p7` and `p8`, move to `code-2-2` (lessons 1, 2 and 4); the lesson is 18 minutes again. Its lab becomes `trace` ("if and else": the marks 12, 7 and 15, two passed), the same loop over a list of marks that the video works through; the sorting race moves to `code-2-2-3`. Lessons 1 to 3 give a one-sentence reminder of "bug". Tellers: Mr Joseph (1), Ms Salma (2), Mr Okafor (3), Ms Amina (4). The summary drops "functions and dictionaries" and ends "No experience needed."

### `code-2-2` More Python for teachers
- **For:** teachers, level 2 Elementary (the second of two courses)
- **Status:** new
- **After it, you can:** write a function that returns a result and reuse it; keep and look up values by name in a dictionary; rank, pair and de-duplicate data; read a list comprehension, a `key=`, an `import` and a `try` in someone else's program.
- **Before this:** `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 2, taught here; rung 3 is read, not written, in lesson 4
- **The path:** name a job, look things up, put things in order and in groups, then read the short forms other people write.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Functions: write it once | write a function with parameters that returns a result, and predict what a call gives back | My grading rule sat in three programs, one for each class. Then the pass mark changed, and I fixed two copies. Class 2C got last year’s grades. How do I write a rule once, and use it everywhere? | function; parameter; return; call | trace | N |
| 2 | Dictionaries: look it up by name | store marks under pupils’ names, look one up, change it, and loop over them all | A father stopped me at the gate, asking for Kofi’s maths mark. My names were on one sheet and my marks on another. I counted down both with my finger. Why couldn’t I just ask for Kofi? | dictionary; key; KeyError | trace | N |
| 3 | Order and groups: sorted, tuples and sets | rank runners while each name stays with its time, take the top three, and list each class once | Sixty runners, sixty times, and the head wants the three fastest names. I put the times in order in a blink. But now which time belongs to whom? How do I keep each name with its time? | tuple; slice; set | sorting | N |
| 4 | Reading shorter Python | trace a line with a list comprehension, a key= or a try and except by rewriting it the long way, and say what an import brings in | A colleague sent me her marks program: six lines, not twenty. It gave the same answers as mine. But I couldn’t read a single line of it. How do you read a line that does the work of five? | list comprehension; lambda; import; try and except | bugs | N |

- **Unit check:** 10 questions, at least four of them school jobs (a grading function, a lookup, a ranking, a colleague's line to read). Nothing asks teachers to write a comprehension or a `lambda`.
- **Changes:** new. Lesson 1 takes the function paragraph and step `p7` from `code-2-1-4`; lesson 2 the dictionary paragraph; lesson 4 the comprehension and `lambda` paragraph and step `p8`. The worked case of lesson 1 is the lab's own (`area(4, 3)` is 12); the grading rule is the project. Lesson 4 is a reading lesson: each short form is shown beside the long form the teacher can already write. `try` and `except` is the one item no teachers' course uses today; it stays because cleaning marks needs it (`int("")`). Recursion is not here: no teachers' course in any track uses it. Tellers: Mr Joseph (1), Ms Amina (2), Mr Okafor (3), Ms Salma (4). The `trace` lab has no dictionary example, so lesson 2's lab step gives the five lines to type (Decisions, 9).

### `code-3-1` Teaching and assessing code
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** plan a lesson where pupils read and predict before they write; build a Parsons problem; teach a debugging routine; write a hinge question and judge what to reteach.
- **Before this:** `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 1 and lists
- **The path:** get pupils reading, then arranging, then fixing, then find out what they really think.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Read before you write: PRIMM and tracing | plan a PRIMM lesson around a short program, and build its trace table and one predict question | Write a program to add up these marks, I told Form Two. The whole class froze. I had explained every line for three lessons. What had they never done before I asked them to write? | PRIMM; trace table; predict question; Use–Modify–Create | trace | S |
| 2 | Parsons problems | build a Parsons problem with one correct order and a distractor taken from a real mistake, and run it on paper strips | My Form Three spent a whole lesson typing a ten-line program. Most never got it to run. They were stuck on spelling and brackets, not on the idea. How can they practise the idea without the typing? | Parsons problem; distractor; one correct order | sorting | S |
| 3 | Teaching debugging | teach a class a debugging routine, and answer “it doesn’t work” with a question instead of a fix | Sir, it doesn’t work! I hear it twenty times a lesson. If I fix each one myself, the queue at my desk never ends. What can I say that sends a pupil back to fix it alone? | error message; logic error; print debugging; rubber duck debugging | bugs | S |
| 4 | Misconceptions and feedback | write a hinge question whose wrong answers each point to one misconception, and judge from the answers what to reteach | Half my class gave the same wrong answer to the same question. Fifteen pupils, one identical mistake. That can’t be carelessness. So what is it telling me? | misconception; hinge question; diagnostic distractor; feedback that asks | logic | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Lessons 1 and 2 open their teaching with a definition: the frozen class and the typing lesson come first. Lesson 2's gap-fill swaps two marks on one line (`marks[i], marks[i + 1] = marks[i + 1], marks[i]`): its reading explains that line in a sentence. Lesson 2 is 476 words: trim. The summary names `code-2-1`, and adds: "If you teach functions, do “More Python for teachers” as well." Tellers: Dr Farah (1, 4), Ms Salma (2), Mr Joseph (3).

### `code-4-1` Leading computing with few devices
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design unplugged lessons that lead to code; design a lesson where every pupil has a job on a shared phone; teach and assess programming on paper; write a term's plan that colleagues can follow.
- **Before this:** `code-3-1` “Teaching and assessing code” (Programming, level 3).
- **Python:** rung 1 and lists
- **The path:** teach ideas with no device, share the devices you have, teach and assess on paper, then write the plan.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Unplugged, then plugged | design a pair of lessons: one idea taught with no device, then the same idea on one phone within the week | Our school has six tablets for nine hundred pupils. A colleague told me: then we simply can’t teach computing. Is she right? | unplugged; binary cards; sorting network; then plugged | binary | S |
| 2 | One phone, many pupils | design a lesson in which every pupil has a job: pair or group roles, a swap timer and live coding | Forty-five pupils, and eight phones borrowed from parents for one afternoon. If one pupil holds each phone, thirty-seven sit and watch. What can the other thirty-seven be doing? | pair programming; group roles; live coding; offline ready | bugs | S |
| 3 | Code on paper | design a paper-only programming lesson with strips, a trace table and a desk check, and assess it fairly | The power went off for the whole of exam week. My computing class was due its practical test. No phones, no screens, forty pupils waiting. Can you test programming with a pencil? | desk check; paper assessment; worksheet | trace | S |
| 4 | A scheme of work | write one term of computing on a page: units in order, an assessment point for each, and a device timetable | In my last school, every teacher taught computing their own way. One class met loops three times, and lists never. Nobody had done anything wrong. So what was missing? | scheme of work; progression; assessment point; device timetable | sorting | S |

- **Unit check:** question 10 asks teachers to finish `def value(up):`. It becomes the same job as a loop over the five cards, with no `def`, so the course needs only `code-2-1`.
- **Changes:** content stays. Lessons 1, 2 and 4 open with a definition: the six tablets, the eight phones and the school with no plan come first. Lesson 1's Parsons problem sets two names on one line (`n, bits = 13, ""`): write it as two lines. Lessons 3 and 4 are 482 and 478 words: trim. The summary names `code-3-1`. Tellers: Dr Farah (1, 4), Mr Joseph (2), Ms Salma (3).

### `code-u1` Teaching programming and algorithms at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach asymptotic analysis so students stop confusing it with speed; teach recursion with the call stack and prove it by induction; find the wrong model of the machine a class holds; design autograded assignments that measure understanding.
- **Before this:** `code-2-2` “More Python for teachers” (Programming, level 2) and `code-3-1` “Teaching and assessing code” (Programming, level 3), or you already teach programming.
- **Python:** shown and explained
- **The path:** how work grows, how recursion runs and is proved, what students think the machine does, and how to assess them at scale.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Asymptotic analysis | teach growth rates so that students stop confusing them with speed, and design an exercise where they time two algorithms and prove each bound | My student’s search ran in a blink on ten thousand records. On the registry’s ten million, it never finished. Her code was correct. So what had she missed? | Big-O; Θ (Theta); master theorem | bigo | S |
| 2 | Recursion and induction | teach recursion as frames on a call stack, and lead a class through the induction proof that a recursive function is correct | Half my class submitted a factorial that calls itself, and crashes. Their version with a loop worked perfectly. What have they not yet seen about how the first one runs? | activation record; inductive hypothesis; well-founded measure | recursion | S |
| 3 | Notional machines and tracing | write tracing questions whose wrong answers each expose a named misconception, and evaluate which model of the machine a class holds | Week six, and a third of my students believe something false. They think changing b, after a equals b, also changes a. Every one of them passed my coding quizzes. How? | notional machine; explain in plain English; diagnostic distractor | trace | S |
| 4 | Assessing programming at scale | design an autograded assignment with visible and hidden tests, a measure of how good the tests are, and a step that shows each student understands their own code | Four hundred students, one assignment, two teaching assistants. Last term my autograder passed code that only worked on the tests students could see. How do I grade fairly at this scale? | hidden test; mutation testing; similarity checker | bugs | S |

- **Unit check:** unchanged.
- **Changes:** the hooks were already questions; they are now told by the lecturer as their own case, and lesson 3's first sentence fits the speech bubble. Each promise lists three topics ("Today: what Big-O really says, why students…"): each becomes one thing the lecturer can do. All four open their teaching with a definition: a case comes first. Three videos are 352 to 361 words: the promise and the next-lesson line bring them to 380. The course now points lecturers to the eight module courses as the sequence their own first-year students can follow.

### `code-s1` Give instructions
- **For:** students, primary (9–12)
- **Status:** keep
- **After it, you can:** give steps a robot can follow; make a program shorter with a repeat; say a rule with if and else; find and fix a bug.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** exact steps, steps said once, a rule that decides, then finding what went wrong.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Exact instructions | give steps so exact that a robot, or a friend playing one, can follow them without guessing | You tell a robot: put jam on the bread. It picks up the whole jar, and puts it on the bread! The robot did what you said. So what went wrong? | algorithm; instruction; order | robot | S |
| 2 | Repeat it: loops | spot steps that repeat, and make a program shorter with a repeat | Sami’s robot walks round the football pitch. It needs sixteen cards: forward, forward, forward, turn, again and again! His friend Layla does it with far fewer. How? | loop; repeat; pattern | robot | S |
| 3 | If this, then that | say a rule as if, then, else, and test it in every case | Your classroom fan stayed on all night. Nobody was in the room! A smart fan would turn itself off. But how does a fan decide? | decision; AND and OR; test every case | logic | S |
| 4 | Find and fix bugs | find the first wrong step in a program, change one thing, and test again | Your robot should reach the flag. It walks into the wall instead! You check your cards, and they all look right. So how do you find the wrong one? | bug; debugging; program in words | robot | S |

- **Unit check:** unchanged.
- **Changes:** content stays. All four hooks were a teacher's own story, and three ended by explaining themselves; they are now about the pupil. The videos are 1:52 to 2:14, under the 2:15 that primary videos aim for: the promise and the next-lesson line bring them up. Lesson 4 defines "bug" before the robot hits the wall: the wall comes first. Nothing is typed anywhere in the course. The summary ends "No experience needed."

### `code-s2` First Python
- **For:** students, lower secondary (12–15); also where anyone older who has never coded starts
- **Status:** keep
- **After it, you can:** write programs that show text and work out sums; remember and ask for values; decide with if, elif and else; repeat with for and while.
- **Before this:** No experience needed.
- **Python:** rung 1, taught here
- **The path:** make it show and calculate, make it remember and ask, make it decide, make it repeat.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Hello, Python | write a program that shows text and works out sums, and predict what each line shows | Mona types a sum into her phone: ten times two. The phone shows her: ten times two. No answer, just her own words back! What did she get wrong? | print(); text (a string); operator; error message | trace | S |
| 2 | Variables and input | write a program that remembers a value, changes it, and asks the user for one | A game greets you by name. Every time you win, your score goes up by ten. It never forgets either one while you play. So where does a program keep what it knows? | variable; input(); int(); TypeError | bugs | S |
| 3 | Decisions: if and else | write a rule with if, elif and else, and test it at every boundary | At the science museum, children under twelve pay half price. Your sister turned twelve today. The machine has no eyes, and nobody to ask. So how does it decide her price? | comparison; if, elif and else; and and or; boundary | logic | S |
| 4 | Loops: for and while | write a loop that repeats, counts or adds up, and stop one that never ends | Omar must write one line a hundred times. I will not be late! His hand hurts by line twenty. How could his phone do the other eighty for him? | for loop; range(a, b); while loop; endless loop | search | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Lesson 1's hook was about the subject ("Your phone can run real Python, the same language used by scientists…"); it is now the lesson's own surprise, quotes or no quotes. Lesson 2 defines a variable before the game is shown: the game comes first. "Bug" is taught in `code-s1-4`; lesson 2 gives it one sentence, because this course is a starting course. Because 15- to 18-year-olds who are new to code start here too, no case is childish and nothing says how old the learner is. The summary ends "No experience needed."

### `code-s3` Functions, lists and algorithms
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** write functions that return results and test them; keep data in lists and loop over it; write linear search and trace binary search; compare sorting methods by the work they do.
- **Before this:** `code-s2` “First Python” (Programming, lower secondary). Never written code? Start there: it assumes nothing.
- **Python:** rung 2, taught here (functions and lists; dictionaries wait for university)
- **The path:** name a job, hold the data, find something in it, then put it in order and judge the method.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Functions: one job each | write a function that returns a result, and test it with asserts at its edges | Zainab’s quiz game works out a score in four places. She copied the same five lines four times. Then she found a mistake in them, and fixed three copies. How could one fix have been enough? | function; parameter; return; assert | trace | S |
| 2 | Lists and loops | keep readings in a list, and write loops that count, total and find the largest | Your school’s weather station logs the temperature every hour. That is twenty-four numbers a day. Which hour was hottest, and how many passed thirty degrees? Would you make twenty-four variables to find out? | list; index; slice; append and pop | trace | S |
| 3 | Searching | write linear search, trace binary search on a sorted list, and compare their worst cases | The exam office has a thousand names, in alphabetical order. You ask: am I on it? The clerk finds out in ten looks, not a thousand. How? | linear search; binary search; worst case | search | S |
| 4 | Sorting, and judging algorithms | trace bubble sort and insertion sort, compare ways of sorting by counting their work, and test a sort on its edge cases | Sports day: a hundred race times, in no order at all. Two students put them in order, each in a different way. Both got it right, but one did far less work. Why? | bubble sort; insertion sort; merge sort; edge case | sorting | S |

- **Unit check:** question 7 ("uses a list as a stack") is reworded as append and pop. The review of 2026-11-04 counted about one question on lesson 3: check by eye, and move one from lesson 2 if so.
- **Changes:** lesson 1's worked function takes numbers (`grade(mark)`, or the ticket price from `code-s2-3`), its edge cases are 0, a boundary and a negative number, and its second check is the hook's question. `average(marks)`, the paragraph "List, a first look" and that key term move to lesson 2. Lesson 2 loses stacks and queues (their one home is `code-s4-3`), which leaves room for the worked case; its lab becomes `trace` ("if and else": a loop over a list with a counter) in place of `stack`. Lesson 3's reading explains `lo, hi = 0, len(a) - 1`, two names on one line, before the Parsons problem that uses it; that problem has 11 lines and is split in two. Lesson 4 says bubble sort needs "about eighteen times" the comparisons from 8 to 32 bars and merge sort "about eight": the lab says about 16 and about 6, so the video uses the lab's numbers. All four hooks were a teacher's story or answered themselves. The summary gains its "Before this" line.

### `code-m1` Values and variables
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** tell numbers from text and predict what an expression gives; trace assignments in a table; write a program that asks, converts and answers; build a study-time calculator and explain what bad input does to it.
- **Before this:** No experience needed, only school arithmetic (remainders and percentages).
- **Python:** rung 1, taught here
- **The path:** values, then names for them, then values that come in from a person, then a small tool that uses all three.
- **Phone or computer:** everything runs in the phone sandbox (tried 2026-11-15, `docs/curriculum/phone-python.md`). The phone has no `str.title()`: the reading shows it, and the steps use `upper`, `lower`, `strip` and `replace`. Error messages read differently on the phone (`name 'x' isn't defined`, `invalid syntax for integer`): lessons 2 and 3 teach the error's type and show the phone's wording. Lesson 4's rounding uses values that are not on a half.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Values, types and expressions | tell a whole number, a decimal and a piece of text apart, and predict the value an expression gives | A campus form asks for your room, B12, and your age, 19. To you, both are just answers. To a computer, they are two different kinds of thing. Why does it care? | value; type; string; expression | trace | D |
| 2 | Variables and assignment | trace a run of assignments in a table, line by line, and say what each name holds at the end | In a spreadsheet, change a price and the total follows. You write the same sum in a program, change the price, and the total stays put. Is the program broken? | variable; assignment; trace table; NameError | trace | D |
| 3 | Input, output and conversion | write a program that asks a question, converts the answer to a number, and replies in a formatted sentence | A program asks how many minutes you studied today. You answer twenty. It doubles your answer, and shows two thousand and twenty. You typed a number, so what did the program receive? | input(); conversion; f-string; ValueError | bugs | D |
| 4 | Numbers in practice: the study-time calculator | build a study-time calculator that shows hours and minutes and a rounded average, and explain what three invalid inputs do to it | Six weeks to the exam, four sessions a week, fifty minutes each. Your program says: three point three three three three hours a week. Nobody plans a week like that. How do you make it say three hours twenty? | floor division; remainder; rounding; invalid input | trace | D |

- **Unit check:** 10 questions from the module's quiz and its "Check yourself" questions; at least four are campus cases to decide.
- **Changes:** from module 1 of the materials, which has five lessons. Lessons 1 and 2 are the module's lessons 1 and 2. Lesson 3 is the module's lesson 4 (input and conversion) with the f-strings of its lesson 3; the string methods (`strip`, `lower`, `title`, `replace`, `len`) go into the reading and practice. Lesson 4 is the module's lesson 5 (units, rounding, precision) joined to the module project, which is the lesson's project: the calculator needs exactly `//`, `%` and one decimal place. The learner guide ships in the kit as a study guide. The materials write "programme"; Darsi writes "program".

### `code-m2` Decisions and validation
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** predict and combine conditions; write branches in the right order; turn the words of a policy into exact boundaries and check input before using it; prove a rule with a table of cases.
- **Before this:** `code-m1` “Values and variables” (Programming, university).
- **Python:** rung 1, taught here
- **The path:** a question with a yes or no answer, then acting on it, then the exact edge of a rule, then a whole rule proved.
- **Phone or computer:** everything runs in the phone sandbox. Lesson 3: on the phone `"٢٠".isdigit()` is False and `int("٢٠")` fails, while a computer accepts both; the Arabic reading says so in a sentence. A missing colon is reported only as `SyntaxError: invalid syntax`.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | True, False and comparisons | predict whether a condition is true or false, and combine conditions without the usual trap | A room-booking program asks: confirm, yes or no? You answer no, and it books the room anyway. The rule in the code reads fine in English. So what did the computer read? | Boolean; comparison; and, or and not | logic | D |
| 2 | Branches with if, elif and else | write a chain of branches in an order that lets exactly the intended one run | You score ninety-two on the module, and the portal says: Pass. The rules promise a Distinction from eighty-five. Every line of the rule is correct. So what is wrong with it? | if, elif and else; indentation; branch | trace | D |
| 3 | Boundaries and input validation | turn “at least”, “under” and “between” into exact conditions, test each at its boundary, and check an answer before converting it | The transport card is cheaper for riders under twenty-six. Your birthday is today: you are twenty-six. The clerk checks the rule and frowns. Does the discount end on your birthday, or the day after? | boundary; inclusive and exclusive; validation; isdigit() | quality | D |
| 4 | The fee-waiver rule, tested at its thresholds | build a rule with thresholds from a written policy, and prove it with cases at, below and above each one | Two families apply for a fee waiver. One has exactly a thousand per person, the other a thousand and one. The policy says: at most a thousand. Before anyone trusts your program, which cases must you show them? | threshold; test case; expected result | rules | D |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, at least four with a boundary to decide.
- **Changes:** from module 2: its three lessons, then its practical task (a made-up fee-waiver rule with eight required cases) as lesson 4's project. The materials say the phone's Arabic keyboard digits pass `isdigit()` and `int()`; that is true on a computer and must be checked on the phone before lesson 3's step is written.

### `code-m3` Loops
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** write a loop that repeats until something changes and say why it stops; build totals, counts and maxima; trace a loop to find where it goes wrong; build a weekly summary with validation.
- **Before this:** `code-m2` “Decisions and validation” (Programming, university).
- **Python:** rung 1, taught here
- **The path:** repeat until, repeat a known number of times, look inside a loop that misbehaves, then build and repair one.
- **Phone or computer:** everything runs in the phone sandbox. A loop that never ends is stopped after 3 seconds, and lesson 1 uses that.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | while loops and termination | write a loop that repeats until something changes, and explain why it stops | A form rejects your answer: letters where a number should be. A good program asks again, and again, until you get it right. A bad one asks for ever. What makes the difference? | while loop; update; infinite loop; sentinel | search | D |
| 2 | for loops, range and accumulators | write a counted loop that builds a total, a count and a maximum, and choose a starting value that cannot be wrong | Your program finds the warmest day of the week. In October it works. In January, with every day below zero, it reports zero degrees. Where did that zero come from? | for loop; range(); accumulator | trace | D |
| 3 | Tracing, off-by-one errors and break | trace a loop in a table, and find the step where it stops too early, too late or forgets | Your week has seven days. Your program counts six. Nothing crashed, and nothing looks wrong on the screen. How do you find a mistake that gives no error? | loop trace; off-by-one error; break | bugs | D |
| 4 | The weekly study summary, and a bug to trace | build a weekly summary with a total, an average and a best day, and trace two planted bugs to their lines | A study tracker asks for seven days, and stops listening after six. It reports your best day as day six, with ninety minutes. You studied ninety minutes on day five. What went wrong, twice? | best so far; tie | trace | D |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, at least three of them traces.
- **Changes:** from module 3: its three lessons, then its practical task as lesson 4's project. Lesson 4's hook is the task's own buggy program (seven inputs, six read, the best day one day late). Lesson 1's lab is the guessing game: guessing until you are right is a loop that ends, and halving comes back in `code-s4-1`.

### `code-m4` Functions
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** define and call functions that return values; say what a function can see and write its contract; split a program into parsing, calculation and display; test each function at its boundaries.
- **Before this:** `code-m3` “Loops” (Programming, university).
- **Python:** rung 2, taught here
- **The path:** name a piece of work, give it a contract, split a program into such pieces, then build and test a whole one.
- **Phone or computer:** everything runs in the phone sandbox.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Defining functions, parameters and return | define a function with parameters, call it, and use the value it returns in a further calculation | Your study planner turns minutes into hours and minutes in three places. You improve the wording in one place, and forget the other two. Now the same report says two different things. How do you write it once? | function; parameter; argument; return | trace | D |
| 2 | Scope, defaults and contracts | say what a function can and cannot see, and write a contract: what it expects, what it returns, and what it does with bad input | Two of you write halves of one program. You both call your running total: total. Run together, will your total wipe out your teammate’s? Or is each one safe in its own room? | local scope; docstring; default parameter; None | trace | D |
| 3 | Decomposition and testing with assert | split a program into parsing, calculation and display, and test each part at values where a wrong formula would show | Your function turns minutes into whole hours. You try one hundred and twenty: two hours, correct. The marker tries one hundred and thirty-five, and it fails. Why did your one try prove nothing? | decomposition; parsing; assert | bugs | D |
| 4 | The electricity bill, in four functions | build a bill checker from four small functions, and test every tier boundary before you run the whole | Your hall charges more per unit after the first hundred. And more again after three hundred. Your bill checker is right for two hundred and fifty units. Which readings must you try before you trust it? | tier | trace | D |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, including one that tells `print` from `return`.
- **Changes:** from module 4: its three lessons, then its practical task (a made-up tariff: 0.50, 0.75 and 1.10 a unit) as lesson 4's project. Lesson 2's lab shows a function's own variables living only while it runs, which is the lesson's point.

### `code-m5` Lists and dictionaries
- **For:** students, university
- **Status:** new (written and narrated 2026-11-15; not published)
- **After it, you can:** keep values in a list and loop over them; store and count with a dictionary; choose a list, a dictionary or a set and count the steps each costs; build an inventory that refuses duplicates.
- **Before this:** `code-m4` “Functions” (Programming, university).
- **Python:** rung 2, taught here; the list comprehension of rung 3 in lesson 4
- **The path:** many values in order, values found by a key, which one to choose and what it costs, then both at work on real records.
- **Phone or computer:** everything runs in the phone sandbox, with two differences the lessons teach openly (`docs/curriculum/phone-python.md`): the phone's dictionaries don't keep the order keys were added (a computer's do), so steps loop over `sorted(d)` and never print a whole dictionary; and its sort isn't stable, so every key used has no ties. The phone has `set`, comprehensions and every list and dictionary method; it has no `collections.Counter`.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Lists, indexing and iteration | keep many values in one list, reach them by position, and loop over them for a total | You record study minutes in seven variables, Monday to Sunday. Adding them up takes one long line. Then your tutor asks for the whole month: thirty names. Can one name hold them all? | list; index; append | trace | D |
| 2 | Dictionaries, lookup and counting | store values under keys, look one up safely, and count how often each thing appears | The lab keeps its stock in two lists. Item names are in one, counts in the other. To find the projectors, you search one and count along the other. Why can’t you just ask for projectors? | dictionary; key; get(); pair (tuple) | trace | D |
| 3 | Choosing a structure, and counting the work | choose a list, a dictionary or a set for a job, and count the steps of two ways to find a duplicate | Two programs check the lab’s equipment tags for duplicates. With eleven tags, both answer at once. With two thousand, one takes a thousand times the work of the other. Both are correct, so what is the slow one doing? | lookup; step count; set | index | D |
| 4 | The equipment inventory | build an inventory keyed by tag that cleans each entry, refuses duplicates, and counts by item and by room | Someone enters a microscope: lab zero zero three, room B twelve. Next week, someone types lab zero zero three, small letters, room b twelve. Is that a second microscope, or the same one twice? And how would your program know? | record; normalise; duplicate; list comprehension | clean | D |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, including the step counts for two thousand entries.
- **Changes:** from module 5: its three lessons, then its practical task (a made-up equipment inventory) as lesson 4's project. Two things are added that the materials do not teach, so that rung 2 is whole in `code-m4` and `code-m5`: the set in lesson 3 (the materials find duplicates with a dictionary of the tags seen so far; a set asks "have I seen this?" more plainly), and the list comprehension in lesson 4 (the materials use one without naming it). Lesson 2 names the pair that `items()` and `enumerate` give (a tuple) and uses `sorted` to report in order. "Two names, one list" (a copy that is not a copy) is in lesson 1's reading and practice, not its video.

### `code-m6` Files and exceptions
- **For:** students, university
- **Status:** new
- **After it, you can:** read and write text files and say what an encoding is; handle an expected failure and raise a clear one; load and save CSV and JSON; import messy records and keep every rejected row with its reason.
- **Before this:** `code-m5` “Lists and dictionaries” (Programming, university).
- **Python:** rung 3, taught here (files, `try` and `except`, `import`)
- **The path:** data that outlives the program, failures you expect, the two formats you will meet, then a real import.
- **Phone or computer:** lessons 1 to 3 run in the phone sandbox with the files each step brings, once the app additions 2 and 3 in `docs/curriculum/phone-python.md` are built (`open(newline="")`, `FileNotFoundError`, `csv.DictWriter`); `json.dumps` there has no `indent` or `ensure_ascii`. The wrong-encoding error is shown, not run. Lesson 4's project has a phone-sized version that prints its report, and a full version, with two output files, on a computer (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Text files and encoding | read and write a text file safely, and say why the same Arabic file opens on one machine and fails on another | Your notes, in Arabic and English, open perfectly on your laptop. On the lab computer, the same file stops your program with an error. The file did not change. So what did? | file mode; with block; encoding; UTF-8 | binary | N |
| 2 | Exceptions | handle an expected failure without hiding an unexpected one, and raise an error that says what was wrong | You type a perfectly good number. The program replies, again and again: please type a whole number. The mistake is in its code, not in your typing. So why is it blaming you? | exception; try and except; raise | bugs | N |
| 3 | CSV and JSON | load and save records as CSV and JSON, keeping commas, numbers and Arabic intact | A library book is called: Networks, Simply Explained. Your program cuts each line of the catalogue at the commas. Now that one book has six columns, and every other book has five. What should have read the file? | CSV; JSON; import | formats | N |
| 4 | Importing book records, and keeping what was rejected | import a messy file of records, accept the good rows, and report every rejected row with its line, its reason and its original values | Volunteers type three hundred book records for the faculty library. Row forty-one has a year of 2207. Your program crashes there, and the other two hundred and fifty-nine rows never load. What should one bad row cost? | rejected-row report | quality | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, including "name the exception" and one on what `w` does to a file that exists.
- **Changes:** from module 6: its three lessons, then its practical task (bilingual book records with a rejected-row report) as lesson 4's project. Lesson 1's lab shows why an Arabic letter takes two bytes. Lesson 3 is where `import` is first written (`csv`, `json`).

### `code-m7` Tests and debugging
- **For:** students, university
- **Status:** new
- **After it, you can:** split a program into files that import each other; write unit tests and read a failing report; debug by a method and keep each fixed bug as a test; repair code you did not write.
- **Before this:** `code-m6` “Files and exceptions” (Programming, university).
- **Python:** rung 3, taught here (your own modules, `unittest`)
- **The path:** code in more than one file, tests that run with one command, a method for finding a fault, then someone else's broken program.
- **Phone or computer:** tried 2026-11-15: a step can carry a second file and import it, and `unittest` runs, but its report never shows (the harness captures only the program's own `print`) and it lacks `setUp`, `assertGreater`, `assertLess` and `assertNotIn`. Lessons 1 to 3 need app addition 1 in `docs/curriculum/phone-python.md`, or teach tests with `assert` and a printed summary. The project's full version, with its data files, is computer work (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Modules and imports | split a program into a module and a main file, and import one from the other without anything running by surprise | You borrow a classmate’s file for its one useful function. The moment your program loads it, his demo runs, and asks you three questions you never wanted. You only asked for one function. Why did everything run? | module; the main guard; tuple | — | N |
| 2 | Unit tests with unittest | write tests that each check one behaviour, run them with one command, and read a failing report from the bottom up | Your daily average passes its test: seventy over seven is ten. You ship it. Then a hundred over seven comes out as fourteen, not fourteen point three. What did your test never ask? | unit test; unittest; assertRaises; test report | bugs | N |
| 3 | Systematic debugging, edge cases and regression tests | reproduce a failure, shrink it to its smallest case, explain it, fix it, and keep that case as a test | Your study tracker says your longest streak is one day. You studied three days running. A friend’s streak, three days and then a day off, comes out right. What is the smallest week that still shows the fault? | reproduce and shrink; hypothesis; edge case; regression test | trace | N |
| 4 | Repairing the attendance summarizer | repair inherited code: a failing test first for each bug, the smallest fix, and a written account of how you found it | You inherit a department’s attendance program. Its two tests pass. Yet a student who came late counts as absent, and an empty class crashes it. Do you start with the code, or with a test? | specification; failing test first; debugging narrative | clean | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, including a failing report to read.
- **Changes:** from module 7: its three lessons, then its practical task (a broken attendance summarizer with made-up data) as lesson 4's project. Lesson 1 has no Labs app that fits: its lab scene is a second worked case. Lesson 1 also names the tuple (a function that returns two values). `assert`, from `code-m4-3`, is the bridge: lesson 2 opens "you have tested with assert since “Functions”".

### `code-m8` Classes and reproducibility
- **For:** students, university
- **Status:** new
- **After it, you can:** define a class whose methods guard its data, and say when functions are enough; document an interface and save and rebuild objects; write a README a stranger can follow; package a small tool with tests and sample data.
- **Before this:** `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, taught here (classes)
- **The path:** data and its rules kept together, a promise to other programmers, results anyone can repeat, then a package.
- **Phone or computer:** classes, invariants and saving through `json` run in the phone sandbox (tried 2026-11-15). `datetime.date` and `timedelta` work, `strftime` doesn't; `pathlib`'s `exists()` fails on a missing file (use `os.path.exists`); `random` has `seed` and `choice` but no `sample` or `shuffle`; `vars()` and `dataclasses` are missing. A package folder with a README and a tests folder is computer work; the phone version of the project is one file with its tests (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Classes and objects, and when a class helps | define a class whose methods guard its data, and say when plain functions are enough | The library’s program keeps each book as loose numbers. One line, somewhere, sets copies on loan to minus five. Nothing complains. Where should the rule live, so that no line can break it? | class; object; method; self | — | N |
| 2 | Interfaces, invariants and saving objects | document what a class promises, protect a rule that must always hold, and rebuild a saved object through its own checks | Your study-goal tracker saves its progress to a file. Someone edits the file by hand: minus fifty minutes done. The tracker loads it without a word. How should it have treated a file it did not write? | interface; invariant; to_dict() | — | N |
| 3 | Documentation and reproducibility | write a README a stranger can run and test from, and make a program give the same result on any computer, on any day | Your overdue-books report was right on Friday. On Monday the same data gives a different answer. On a classmate’s laptop, it cannot even find its files. You changed nothing, so what did you leave to chance? | README; reproducible; relative path; seed | — | N |
| 4 | The lending-desk prototype | package a lending-desk tool: two classes that keep one open loan per item, tests for every rule, sample data and a README a classmate can follow | The faculty lending desk has one projector. Two students each walk away sure it is booked in their name. The records agree with both of them. Which single rule did the program fail to keep? | package; command loop | — | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions, including "class or functions?" for four small jobs.
- **Changes:** from module 8: its three lessons, then its practical task (a lending-record prototype) as lesson 4's project. No Labs app shows an object, a file path or a README, so the four lab scenes are second worked cases; a `trace` example that shows an object's attributes changing would serve lessons 1 and 2 (Decisions, 9). The capstone brief that closes the module becomes `code-capstone`.

### `code-s4` Algorithms and software engineering
- **For:** students, university
- **Status:** revise
- **After it, you can:** say how an algorithm's work grows and predict what a bigger input costs; write and trace recursion; choose a data structure by what a job does most; write tests before the code.
- **Before this:** `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3 (recursion taught here; `key=` and `lambda` in lesson 3's reading)
- **The path:** measure the work, meet a new way to repeat, choose where to keep the data, then let the tests lead.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | How work grows: big O | count how the steps of a method grow with its input, name the growth, and predict what doubling the input will cost | Your program checks thirty classmates for shared birthdays in a blink. Then you run it on the whole university, a million students. Fourteen hours later, it is still going. How could you have known before you ran it? | big O; linear; quadratic; logarithmic | bigo | S |
| 2 | Recursion | write a function that calls itself and stops, trace its calls on the call stack, and stop it repeating work by remembering answers | A flatmate writes a function that counts down from three. It calls itself, again and again, until the phone stops it with an error. Every line he wrote looks right. Which line did he never write? | recursion; base case; call stack; memoisation | recursion | S |
| 3 | Data structures | choose a list, a stack, a queue, a set or a dictionary by what a job does most, and say what each choice costs | A student builds undo for her notes app. Press it, and the app takes back her oldest change, not her newest. She used the wrong kind of pile. What kind does undo need? | stack; queue; hashing | stack | S |
| 4 | Testing like an engineer | write the tests before the code, watch them fail, make them pass, and review a classmate’s tests for the cases they miss | You finish your function at midnight, then write its tests. Every test passes first time. Your teammate asks: have you ever seen one of these tests fail? Why does that matter? | test-first; refactor; code review | search | S |

- **Unit check:** the review of 2026-11-04 counted about one question on lesson 3: check by eye, and move one from lesson 1 if so. Add one question that reads a `key=`. The questions on sets and dictionaries stay: they now test `code-m5` again, on purpose.
- **Changes:** the four topics stay; each lesson now builds on a module course and says so in its first teaching scene. Lesson 1: "In “Lists and dictionaries” you counted the steps of two duplicate checks; now name how each count grows." The set it uses is known from `code-m5-3`, so the extra key term "Set" goes; binary search is explained here, since the modules do not teach it. It is 505 words: trim to 450. Lesson 2: the dictionary used for memoisation is known from `code-m5-2`. Lesson 3: sets and dictionaries are no longer new, so the lesson spends its time on stacks, queues and why a lookup takes about one step (hashing); its reading shows `max(count, key=count.get)` and a `lambda` for "the most common", with a gap-fill step. It is 495 words: trim. Lesson 4: unit tests and edge cases are known from `code-m7`, so the lesson is test-first, the boundary bug in binary search, and review; Jon Bentley's story moves from the hook to "widen it". Three hooks were a school teacher's story about "a student" and the fourth was about professional programmers: all four are now told to "you", on a campus. The summary gains its "Before this" line.

### `code-capstone` Capstone: an offline learning-resource tracker
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** design, build and test a command-line tool that tracks learning resources: saved data, checked input, summaries, tests, sample data and a README; then run it and explain your own code in a ten-minute demonstration.
- **Before this:** `code-m8` “Classes and reproducibility” (Programming, university). “Algorithms and software engineering” first is a good idea, not a need.
- **Python:** rung 3

- **Changes:** it moves from level 3 (upper secondary) to level 4, the end of the university path. As proposed (Decisions, 3), the id, the repository and the way evidence is handed in stay, and what is built becomes the materials' capstone: an offline tracker made with Python's standard library only, about 16 hours, marked out of 100 (correctness 30, decomposition and readability 20, tests and error handling 25, documentation and reproducibility 15, explaining your own code and handling data ethically 10). Today's brief (a marks-and-attendance tool with a Typer command line, GitHub Actions, a coverage floor, a Docker image and a tagged release) uses tools no course teaches; its test-in-CI and release steps stay as an optional last milestone. Text only, and a new starter repository. It needs a computer.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `code-1-1` | Teachers, Beginner | Kept. 4 standard passes. |
| `code-2-1` | Teachers, Elementary, first course | Revised. 4 standard passes. Lesson 4 goes back to lists; says "No experience needed." |
| `code-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `code-2-1`. |
| `code-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `code-3-1`; unit check question 10 loses its `def`. |
| `code-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `code-s1` | Students, primary | Kept. 4 standard passes. |
| `code-s2` | Students, lower secondary, and the start for older beginners | Kept. 4 standard passes. |
| `code-s3` | Students, upper secondary | Revised. 4 standard passes. Functions on numbers first; stacks and queues leave. |
| `code-s4` | Students, university, advanced, after the modules | Revised. 4 standard passes. Names `code-m7`; stops repeating the modules. |
| `code-capstone` | Students, university, capstone | Moves from level 3 to level 4. Text only; the brief changes if Decision 3 is yes. |
| (new) `code-2-2` | Teachers, Elementary, second course | New: 4 lessons and a unit check. |
| (new) `code-m1`, `code-m2`, `code-m3`, `code-m4`, `code-m5`, `code-m6`, `code-m7`, `code-m8` | Students, university, from zero | New: 8 courses, 32 lessons and 8 unit checks, from the user's drafts. |

## Work, in order

The eight module courses come from drafts that nobody has reviewed. Their own notes say: no faculty or subject
review, no Arabic language review, no check of right-to-left display, no test on a phone, on Windows or on macOS;
every example was run only with Python 3.13 on Linux; the study times are estimates. Nothing in them has been run
in the phone's Python. So the first step is not writing.

1. **Review the drafts and settle the phone question** (Decisions 1 and 2): a subject review of the eight outcome
   tables, an Arabic review of the terms against `docs/curriculum/ar-lingo.md`, and a list of what differs in the
   phone sandbox. The last was done on 2026-11-15 (`docs/curriculum/phone-python.md`): modules 1 to 5 need nothing
   from the app; 6 to 8 need app additions 1 to 3. The two reviews are people's work, still to arrange.
2. **`code-m1`, `code-m2`, `code-m3`** (12 new lessons): rung 1 for university students. University courses are the
   ones published today, and the other tracks will send their university students here.
3. **`code-m4`, `code-m5`** (8 new lessons): rung 2. After this step the other tracks' university courses have
   everything they name.
4. **`code-2-2`, with `code-2-1` lesson 4 going back to lists in the same change** (4 new lessons, 1 standard pass),
   so teachers never lose the functions material. Other tracks' level 3 and 4 courses name it.
5. **`code-s4`, `code-4-1`, `code-u1`, standard pass** (12 lessons): the courses published today.
6. **`code-m6`, `code-m7`, `code-m8`** (12 new lessons), then the capstone's text and starter repository.
7. **`code-2-1` lessons 1 to 3, `code-1-1`, `code-3-1`** (11 lessons): the rest of the teachers' ladder.
8. **`code-s2`, `code-s3`, `code-s1`** (12 lessons): the school courses.
9. **Text only:** every summary's last line; `code-4-1-check` question 10; `code-1-1-check` question 6; the 14 code
   lines over 44 characters (Reference); the placement questions (Reference); the capstone's level.

In all: 36 standard passes and 36 new lessons, with 9 new unit checks. Narration is about $2.16 for both languages.

## Decisions for the user

1. **Use the eight module courses as the university path?** Recommended: yes. They are a complete first course in
   programming, from zero, with campus cases, exercises, quizzes and tasks already drafted in both languages. They
   replace the single starting course that was planned. Cost: 32 new lessons (about $1.28 of narration) after the
   review in step 1.
2. **Phone or computer, course by course?** The drafts assume a computer with Python 3. Darsi's sandbox runs
   Python on the phone, and its build already contains more than the drafts expect: `unittest`, `datetime` and
   `pathlib` are in it (seen in the vendored file; not yet run). Recommended: teach all eight courses on the phone;
   give each project in `code-m6` to `code-m8` a phone-sized version, with the full version marked "needs a
   computer"; and say plainly that the capstone needs one. Cost: one addition to Darsi's small `csv`, and the trial
   run in step 1 of the work. The other choice is to mark `code-m6` to `code-m8` "needs a computer" as the drafts
   do, which shuts out students who have only a phone.

   | Course | Runs in the phone sandbox | Needs a computer, a change, or a check first |
   |---|---|---|
   | `code-m1` to `code-m5` | Everything: input comes from the step's tests, and `assert` works. Tried 2026-11-15: `0.1 + 0.2` and `round(2.5)` show as on a computer | No `str.title()`; other error wording; `round(x, n)` differs at a half; dictionaries don't keep their order and sorting isn't stable (module 5); Arabic-Indic digits fail `isdigit()` and `int()` (module 2). All taught around, `docs/curriculum/phone-python.md` |
   | `code-m6` | Reading and writing files the step brings, with `encoding="utf-8"`; `try` and `except`; `json`; `csv.reader`, `csv.DictReader`, `csv.writer` | To add (app): `open(newline="")`, `FileNotFoundError`, `csv.DictWriter`. Not on the phone: the wrong-encoding error, `indent=` and `ensure_ascii=` in `json.dumps`. The full import, with two output files, is computer work |
   | `code-m7` | `assert` tests; the five-step method; the `__main__` guard; a second file imported; `unittest` runs | To add (app): capture `unittest`'s report, which today never shows; `setUp` and `assertGreater` are missing. The full repair, with its data files, is computer work |
   | `code-m8` | Classes, invariants, `to_dict` and `json`; `datetime.date`, `timedelta`; `random.seed` and `choice` | No `random.sample`, `strftime`, `vars()`, `dataclasses`; `Path.exists()` fails on a missing file. A package folder, a README and a tests folder are computer work |
   | `code-s4` | Everything (recursion stops at about 150 nested calls) | Nothing |
   | `code-capstone` | Nothing | A computer, about 16 hours |

3. **Which capstone?** Recommended: the materials' offline learning-resource tracker, under the existing id
   `code-capstone`. It uses exactly what the eight modules teach, runs offline with nothing to install but Python,
   and asks the student to design something of their own. Today's brief repeats the tasks of modules 6 and 7 (marks
   and attendance) and adds Typer, GitHub Actions and Docker, which no course teaches. The other choice keeps
   today's capstone after `code-s4` and drops the tracker. Cost of the recommendation: a new brief and starter
   repository; no narration.
4. **Add `code-2-2` for teachers?** Recommended: yes. Cost: 4 new lessons, about $0.16 of narration.
5. **Should `code-3-1` need `code-2-2`?** Recommended: no. Teaching and assessing code is taught with first
   programs, and a primary or lower-secondary teacher should reach it without functions and dictionaries. Cost: one
   rewritten check question in `code-4-1`.
6. **Let `code-2-1` say "No experience needed"?** Recommended: yes. It bends "each level needs the one before", but
   the course really does start at the first line, and a data or optimization teacher sent here for Python then has
   four lessons to do, not eight.
7. **Where does a beginner land?** Recommended: a student aged 12 or older who fails the placement check lands on
   `code-s2`, never on the primary course; a university student lands on `code-m1`. Today the check can walk a
   16-year-old down to "Give instructions". Cost: a small app change, shared with the other tracks.
8. **Dictionaries at school?** This plan keeps `code-s3` as functions, lists, searching and sorting, so school
   students meet dictionaries only where another track teaches one in place. The other choice is a second
   upper-secondary course later (4 new lessons). Recommended: not now.
9. **Add examples to the `trace` lab?** It has three: a loop, if and else, a function. A dictionary, a `try` and an
   object would give `code-2-2`, `code-m5`, `code-m6` and `code-m8` a lab that continues the video. Recommended:
   yes, when those courses are written. Cost: small app work. Until then the lab step gives the lines to type.
10. **Two additions to module 5.** Sets and the list comprehension are not taught in the drafts. This plan adds
    them to `code-m5`, so that rung 2 is whole there and another track's university course can name one course
    for all the Python it writes. Five tracks' university courses use comprehensions today. Recommended: yes. Cost:
    none beyond the lessons.

## Reference

Kept from the plan of 2026-10-29 where still true. The step types and their fields are in `docs/CONTENT.md`.

### The materials

"Darsi University UNI-PROG: Programming Foundations with Python", drafts dated 8 November 2026, sent by the user on
2026-11-15 (folder `darsi-university-materials/programming/`; not yet in either repository). Per module: a learner
guide and narration scripts in English and Arabic, instructor solutions, reference code and tests. Module 1 has 5
lessons, 25 worked examples, 11 exercises and a 10-question quiz; modules 2 to 8 have 3 lessons, 5 exercises, a
6-question quiz and a task with a 20-point rubric each. The narration scripts are spoken summaries of each lesson
that open with the topic, not Darsi videos: every lesson above needs its own storyboard. All data in them is made
up, and the tasks say so; keep that.

### How the track talks

- **Code on the phone.** From teachers' level 2 and from lower secondary, every lesson has at least one code step
  (`code`, `parsons`, `codefill`, `bug`, or a snippet on a question). Level 1 and primary use `blocks` and very
  short Parsons problems. Programs are Python: MicroPython on the phone, the same Python as on a micro:bit, an ESP32
  or a Raspberry Pi Pico. The Python download is 0.29 MB, once.
- **Few or no devices.** Every teachers' lesson has an activity that works with paper, chalk and one phone. The kits
  print the code steps as paper exercises: strips to number, gaps to fill, a line to circle, the robot grid with
  cut-out cards.
- **Cases:** for teachers, registers and marks, the canteen queue, market prices, bus routes, football tables,
  rainfall in the school garden, the timetable. For university students, the campus: module marks, the library, a
  lending desk, the lab's equipment, study time, hall bills.
- **The cast:** Mr Joseph (computer studies) leads most of the Python; Ms Salma (maths) brings algorithms, counting
  steps and tests, and doubts; Ms Amina (primary) leads unplugged work and the robot; Mr Okafor (science) brings
  readings, loops and lists; Dr Farah (education lecturer) leads teaching research, assessment and leading a
  school. In teachers' videos they tell the hook as their own story. In school students' videos they are the
  students' teachers and the hook is about a pupil. In university students' videos they are lecturers and the hook
  is told to "you". In `code-u1` they are lecturers telling their own case.

### Facts the courses use

Keep these the same in every course, and the same as the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Algorithm:** a precise list of steps, in order, that finishes and solves a problem. A computer does exactly what
  the program says, not what we meant. **Computational thinking:** decomposition, pattern recognition, abstraction
  and algorithms. Programs are built from sequence, selection (decisions) and repetition (loops).
- **The robot** (`robot` lab, `blocks` steps): cards Forward, Turn left and Turn right; a card can be repeated 1 to
  4 times. Six grids; the fewest cards for them are 1, 2, 3, 6, 5 and 9. The program must end on the flag; walking
  into a wall or off the grid stops it.
- **Python on the phone:** MicroPython 1.29, real Python 3 syntax. A program stops after 3 seconds. Recursion stops
  at about 150 nested calls (desktop Python's default is 1,000). Strings can't be reversed with `[::-1]`. It rounds
  2.675 to 2.68 where desktop Python gives 2.67. Tests compare only what a program prints, and `input()` takes its
  answers from the test. A step can bring files, and a program can write files. Darsi adds a small `csv` (`reader`,
  `DictReader`, `writer`; no `DictWriter`). Everything else it has, lacks or does differently was tried on
  2026-11-15 and is in `docs/curriculum/phone-python.md`: above all, dictionaries don't keep their order, sorting
  isn't stable, error messages read differently, and there is no `str.title()`.
- **The beginner's facts:** a program runs top to bottom, one line at a time. `=` stores a value; `==` compares.
  `input()` always gives text: `"5" + "3"` is `"53"`, `int("5") + int("3")` is `8`. `range(1, 5)` gives 1, 2, 3, 4.
  Lines inside `for`, `while`, `if` and `def` are indented by 4 spaces; a line that starts a block ends with a
  colon. Lists count from 0. `print` shows a value; `return` hands it back to the caller.
- **The `bugs` lab** has six bugs: a missing colon, `=` for `==`, off by one (`range(1, 5)` to count to 5), a
  missing indent, a misspelt name (`scor`), text plus a number (`"Age: " + 12`).
- **The `trace` lab** has three examples and lets the learner change the code: the loop total of 1 to 4 is 10, and
  with `range(1, 11)` it is 55; the marks `[12, 7, 15]` give 2 passed; `area(4, 3)` is 12 and `area(10, 6)` is 60.
- **Searching** (`search` lab): one by one takes up to n guesses; halving at most 7 for 1 to 100, 10 for 1,000 and
  about 20 for a million. Binary search only works on a sorted list.
- **Sorting** (`sorting` lab): bubble, insertion, selection and merge sort. From 8 to 32 bars, bubble sort needs
  about 16 times the comparisons, merge sort about 6 times. Insertion sort wins on nearly sorted lists; selection
  sort makes the fewest swaps.
- **How work grows** (`bigo` lab): finding a name in a sorted list of n is log n, the tallest pupil n, sorting
  n log n, every pair n². A phone does roughly ten million simple steps a second: for a million items, n takes a
  tenth of a second and n² about 14 hours. Doubling n doubles n work and quadruples n² work.
- **Counting steps in `code-m5`** (from the materials): checking every pair among 11 tags is 55 comparisons; among
  1,001 it is 500,500; among 2,000 it is 1,999,000. One lookup per tag is 11, 1,001 and 2,000.
- **Recursion** (`recursion` lab): in `fib(5)`, `fib(2)` is worked out 3 times; remembering answers turns millions
  of calls into a few dozen. The Towers of Hanoi take 2ⁿ − 1 moves: 7 for 3 discs, 15 for 4.
- **Stacks and queues** (`stack` lab): a stack is last in, first out (undo, the back button, the call stack); a
  queue is first in, first out (the canteen line, the printer).
- **Bits** (`binary` lab): 8 bits make a byte, 0 to 255; 65 is the letter A; an Arabic letter takes 2 bytes in
  UTF-8. The materials' mixed file has 79 characters and 127 bytes.
- **Teaching research** (teachers' levels 3 and 4): PRIMM (Sentance, Waite and Kallia, 2019); Parsons problems
  (Parsons and Haden, 2006; Ericson, Margulieux and Rick, 2017, found them faster than writing the same code, with
  the same learning gains); Use–Modify–Create (Lee and others, 2011); CS Unplugged (Bell, Witten and Fellows);
  hinge questions (Dylan Wiliam); pair programming with a driver and a navigator who swap every 5 to 10 minutes.
  Jon Bentley found that about 90% of professional programmers' binary searches had bugs (Programming Pearls,
  1986).

### Writing the code steps

- Python only (SQL belongs to Data engineering). Keywords, names and the text inside code stay in English, left to
  right, in both languages. People's names in code are made up.
- **No line over 44 characters, comments included:** past that the phone editor scrolls sideways. Aim for 40. Today
  14 lines are over: starter comments in `code-2-1-2/p2`, `code-2-1-4/p2`, `code-s2-3/p2`, `code-s3-1/p2`,
  `code-s3-2/p2`, `code-s3-check/q3`, `code-s4-1/p2`, `code-s4-2/p2`, `code-s4-3/p2` and `code-s4-check/q3`; a
  solution line in `code-s4-3/p2`; and the dictionary lines of `code-2-1-4/p7` and `p8`, which move to `code-2-2`.
- A `code` step: at most 12 lines; at least two tests with different inputs; a hint on each test. The starter is
  the beginning of the program, never a solution, and it must fail. Prefer whole numbers in printed results.
- `parsons`: one correct order only, no two identical lines, 4 to 8 lines, one or two distractors that show a
  misconception. `codefill`: the gaps are the idea being taught. `bug`: exactly one mistake, and the explanation
  names the misconception. `blocks`: grids up to 6 × 6.
- "What does this print?" is a `choice` with a snippet; its wrong options are the answers a misconception gives.
- The kit's worksheet prints the first five questions and code steps of a lesson: put the code steps among them.
- A construct is written only at or after its row in the ladder above. Before that it may be shown, with every
  line explained, in a guided step.

### Labs across the track

Teachers meet `robot`, `logic` and `search` at level 1; `trace` and `bugs` in `code-2-1`; `trace`, `sorting` and
`bugs` in `code-2-2`; `trace`, `sorting`, `bugs` and `logic` at level 3, as tools to teach with; `binary`, `bugs`,
`trace` and `sorting` at level 4. School students meet `robot` and `logic` (primary); `trace`, `bugs`, `logic` and
`search` (lower secondary); `trace`, `search` and `sorting` (upper secondary). University students meet `trace`,
`bugs`, `logic`, `search`, `quality`, `rules`, `index`, `clean`, `binary` and `formats` in the modules, then
`bigo`, `recursion`, `stack` and `search` in `code-s4`. The six labs borrowed from other shelves (`quality`,
`rules`, `index`, `clean`, `binary`, `formats`) are about schools; a university lesson says so in one clause and
uses them for the idea. A lab met again comes with a harder task.

### Placement

`content/placement/code.json`, three questions per audience and level. Only two of the three are asked.

- **Teachers, level 2:** all three stay on first programs and lists. They decide whether a teacher may skip
  `code-2-1`; `code-2-2` is offered at the same level and named by the courses that need it.
- **Teachers, level 3:** since 2026-11-04 the first question is a loop to predict. All three must show a line of
  Python to read, because only two are asked and a teacher must not reach level 3 without rung 1.
- **Students, university:** today's three questions (nested loops, a base case, a set for IDs) can be answered
  after `code-s4` but say nothing about files, tests or classes. With nine university courses, three questions
  cannot place a student among them: the check should decide only between `code-m1` and "you may start later", and
  one question must come from `code-m6` to `code-m8`.
- **A floor:** see Decisions, 7.

### Arabic words

The plan of 2026-10-29 had a table of this track's Arabic words for the app and for the videos (program, loop,
function, list, bug, trace table, recursion and 12 more). It is in git (`git show 7a603c77:docs/curriculum/code.md`)
and belongs in `docs/curriculum/ar-lingo.md`, which has no Programming words yet. Move it there before the first
lesson is written; the materials' Arabic terms are checked against it in step 1 of the work.
