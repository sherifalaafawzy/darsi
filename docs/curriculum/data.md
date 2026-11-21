# Data engineering: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of 2026-10-29 in this
file; the facts, labs and video notes at the end are kept from it. The university students' path is built from the
Darsi University draft "Data Engineering Foundations" (eight modules and a capstone), which the user supplied on
2026-11-15. What all tracks share (the Python ladder, the home of each shared idea, how a module becomes a course)
is in `docs/CURRICULUM.md`; how to write a course is in the `darsi-course` skill.

## The track in one look

A teacher who finishes the track can keep school records in tidy tables, clean them, question them in SQL, and run
reports that build themselves, are checked, and show each reader only what they need. A student ends by building a
data pipeline: at university, one that survives duplicates, corrections and a crash, and can say where every number
came from. The track teaches its own subject from zero: what data is, what a table is, and why a computer
miscounts a messy one are taught in the first lesson of every starting course, and SQL is taught here. It borrows
one thing, Python, and every course that needs it names the Programming course that teaches it. The first three
university courses need none, so a student can begin Data engineering beside Programming.

- **Track line (en):** Starts from zero: tidy tables, clean data, then databases and pipelines. SQL is taught here. Where a course writes Python, it names the Programming course to do first.
- **Track line (ar):** يبدأ من الصفر: جداول مرتّبة وبيانات نظيفة، ثم قواعد البيانات وخطوط البيانات. لغة SQL تُشرح هنا، وحيث تكتب الدورة بلغة Python تذكر دورة البرمجة التي تسبقها.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `data-1-1` Data in your school | keep school data in tidy tables, collect only what a question needs, read charts honestly, and protect pupils' data | No experience needed. | 4 standard passes |
| 2 Elementary | `data-2-1` Cleaning and organising data | make names agree, handle blanks and repeats, and join sheets by pupil ID, by hand and with a few lines of Python | `data-1-1`, `code-2-1` | 4 standard passes |
| 3 Intermediate | `data-3-1` Databases and SQL for school records | move records into tables with keys, and answer questions about them in SQL | `data-2-1` | 4 standard passes |
| 4 Advanced | `data-4-1` Pipelines, quality and governance | design reports that build themselves, put checks in their way, and write the school's rules for access and deletion | `data-3-1`, `code-2-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `data-s1` Collect and sort | ask a question, tally the answers, and put them in a table and a fair chart | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `data-s2` Spreadsheets and clean data | use formulas, clean typed answers, catch impossible values, and choose an honest summary | No experience needed. | 4 standard passes |
| Upper secondary (15–18) | `data-s3` Databases and SQL | design tables with keys, question and join them in SQL, and say when an index helps | No experience needed. | 4 standard passes |
| University, start | `data-m1` Producers, consumers and data contracts (new) | say who makes, uses and owns a dataset, choose batch or stream, and write a contract a program can check | No experience needed. | 4 new lessons |
| University | `data-m2` Files, schemas and keys (new) | read CSV and JSON correctly, and build tables whose keys and rules refuse bad rows | `data-m1` | 4 new lessons |
| University | `data-m3` SQL that gives the right answer (new) | write queries that filter, group and join without losing rows, doubling them or hiding missing values | `data-m2` | 4 new lessons |
| University, overview | `data-s4` Data engineering | follow one pipeline end to end: formats, a load that is safe to run twice, tests, and a stream with a window | `data-m3`, `code-m5` | 2 standard passes, 2 rewrites |
| University | `data-m4` Getting data in: extraction, raw files and staging (new) | copy data from a source without gaps, keep what was delivered, and account for every record | `data-s4`, `code-m7` | 4 new lessons |
| University | `data-m5` Transforming data: types, time and quality checks (new) | convert types and times on purpose, resolve duplicates by a rule, and publish only when checks pass | `data-m4`, `code-m7` | 4 new lessons |
| University | `data-m6` Loads that are safe to run twice (new) | make writes repeatable, resume a crashed load, and leave logs a run can be checked from | `data-m5`, `code-m7` | 4 new lessons |
| University | `data-m7` Storing data for fast answers (new) | choose where data lives, partition it, and decide with measurements which indexes to keep | `data-m6`, `code-m7` | 4 new lessons |
| University | `data-m8` Lineage, access and retention (new) | trace where a number came from, publish without exposing anyone, erase on request, and write the runbook | `data-m7`, `code-m7` | 4 new lessons |
| University, capstone | `data-capstone` An incremental pipeline over a week of learning events | build, test and document a pipeline that survives duplicates, corrections and a crash | `data-m8`, `code-m7` | text, and a new starter |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `data-u1` Teaching databases and data engineering at university | teach design, indexing, transactions and data quality rigorously, with labs and projects on real data | `data-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **University students get a path that starts from zero, built from the Darsi University course.** Today a
   university student meets the track at "Data engineering" (`data-s4`). Its first teaching scene is "A schema is
   the shape of your data: its tables, columns, types and rules", and by lesson 2 the learner writes `DELETE` and
   `INSERT … SELECT … GROUP BY`. It assumes typed tables, keys and "each fact stored once", CSV, empty values and
   repeats, SQL as far as a join, and Python with functions and dictionaries. No university-level course teaches
   any of that. The user's draft does: eight modules, in English and Arabic, with SQL from scratch.
   - **One module becomes one course**, `data-m1` to `data-m8`: the module's three lessons, then a fourth lesson
     built on its practical task, which is that lesson's project.
   - **One outcome a lesson.** Each module lesson has two outcomes; the Darsi lesson takes the main one for its
     video, and the other goes into the reading and the practice. No module needed splitting into two courses.
   - **The videos are new.** The draft's narration is a one-minute summary; each Darsi video is written to the
     eleven parts, with a hook from campus life.
   - **The rest is reused.** The module quiz and the "Check yourself" questions feed the unit check. The learner
     guide ships in the kit as a study guide, in both languages.
   - **The path starts with no Python.** The draft expects Python functions, files, exceptions and basic tests
     before module 1. In Darsi the first three courses read Python and write none: learners write SQL, and each
     project has a guided version. `data-m1` says "No experience needed.", so a student can begin beside
     Programming. Python is first written in `data-s4`, which names `code-m5` “Lists and dictionaries”; modules 4
     to 8 name `code-m7` “Tests and debugging”.
2. **`data-s4` stays, as the overview after module 3.** After `data-m1` to `data-m3` a learner has exactly what
   `data-s4` assumes. It then gives one pass over a whole pipeline, on the phone, with the four pipeline labs;
   modules 4 to 8 take each stage in depth.
   - It cannot sit after module 8: every one of its hooks would already be answered, and a video with no open
     question has no reason to be watched.
   - It lightens four module lessons. `data-s4` teaches the watermark, ETL and ELT, the star schema and the
     idempotent load, so `data-m4-1`, `data-m5-1`, `data-m6-1` and `data-m7-1` open with "In “Data engineering”
     you…" and go further.
   - Two of its lessons are rewritten. Module 1 now teaches contracts and batch against stream first, so
     `data-s4-3` keeps what a failed test does and `data-s4-4` keeps the window.
3. **One capstone, built on the draft's.** Today's `data-capstone` fetches real public data into DuckDB and
   refreshes on GitHub Actions: tools and a network that no course teaches. The draft's capstone is an offline
   pipeline over a week of synthetic learning events, and it tests what modules 4 to 8 teach: a ledger, rejects,
   corrections, a crash and a resume, lineage and retention. It becomes the required core, under the same id and in
   the same three parts (description, starter, submission). Today's open-data report becomes its optional last
   milestone. The capstone also moves from level 3 (upper secondary) to the end of the university path.
4. **Phones first, and honest about computers.** The draft assumes a computer with Python 3 and SQLite. In Darsi,
   lessons 1 to 3 of every module run on the phone: the SQL in the sandbox's SQLite, short Python in the sandbox,
   and the Labs. What the sandbox cannot do is drive SQLite from Python. So each module's project (lesson 4) has
   two sizes: the draft's task, which needs a computer, and a phone-sized version. The capstone needs a computer.
   The table is under "Decisions for the user".
5. **Every course says what it expects.** Only two summaries have a "Before this" line today. `data-1-1` says "No
   experience needed." `data-2-1` names `data-1-1` and "Python for teachers", `data-3-1` names `data-2-1`,
   `data-4-1` names `data-3-1` and "Python for teachers", and `data-u1` names `data-3-1`. The three school stages
   for students each say "No experience needed.", and so does `data-m1`. Every later university course names the
   course before it, and the Programming course it needs once it writes Python.
6. **Teachers write a little Python, and only Python they were taught.** `data-2-1` asks teachers to change short
   programs: the loops, `if` and variables come from "Python for teachers" (rung 1), which the course names. What
   is new it teaches itself, one lesson each, with a guided step first: `csv.DictReader` and `int()` (lesson 1),
   `strip()`, `lower()` and a set (lesson 2), a dictionary (lesson 4). `data-3-1` is SQL only. `data-4-1` has one
   step that needs a function and a list comprehension: it is rewritten as a plain loop, so no data course waits
   for the new `code-2-2`.
7. **Each school stage can be a first meeting.** `data-s2` starts Python itself, one new idea a lesson (a list, a
   `for` loop, `if`, `sorted`); today lesson 2 uses a loop and a dictionary nobody has taught. `data-s3` needs no
   Programming course: its SQL is taught here, and its Python is shown and explained, never written. Its first
   video had eight new ideas; it keeps four.
8. **Nothing is used before it is taught.** The list found by reading every code step and reading:
   - `data-2-1-1`: "each row arrives as a dictionary" (video and reading), three lessons before the dictionary;
     `with open(…) as f:` in every program, never explained.
   - `data-2-1-3` and `data-2-1-4`: a pair in brackets used as one value, three variables set on one line, and a
     loop with two names (`for pupil_id, mark in marks`), none explained.
   - `data-4-1-1`: `def`, `return`, a list comprehension and `sorted()`.
   - `data-s2-2`: a `for` loop and a dictionary; `data-s2-3`: `if`, first met in a step that must change it.
   - `data-s2`: "range" is a block of cells in lesson 1 and biggest minus smallest in lesson 4.
   - `data-s3-1`: a step writes `WHERE` one lesson before it is taught; `data-s3-2`: "think of a Python
     dictionary"; `data-s3-4`: two steps edit functions.
   - `data-s4`: `csv.DictReader`, `enumerate`, a slice and a comprehension in given code, beyond rung 2.
9. **Shared ideas have one home.**
   - Binary search belongs to Programming (`code-s3-3`). `data-s3-4` keeps the index: it shows halving on a sorted
     list without code, and names "Searching" as the place to write it.
   - Mean, median and honest charts live here (`data-1-1-3`, `data-s2-4`): other tracks point to them.
   - Pupils' data: `data-1-1-4` is in a Beginner course, so it teaches the idea itself, from this track's side: who
     may open a sheet. `data-4-1-3` gives a two-sentence reminder, names the home (`cyber-3-1-1`), and spends its
     time on roles, summaries and small groups. At university, `data-m8-2` teaches this track's own part: small
     groups in a published table, and ids replaced by tokens.
   - SQL injection belongs to Cyber security (`cyber-m7-2`). `data-m3-1` teaches the safe habit (pass values as
     parameters) and names that lesson for the attack.
   - Reading CSV and JSON in Python belongs to Programming (`code-m6-3`). `data-m2-1` does not need it: it shows
     the three lines that read a file, explains each, and spends its time on types and missing values.
   - Fingerprints belong to Cyber security (`cyber-m4` at university). `data-m4-2` teaches what it needs in two
     scenes, with that track's `hash` lab.
10. **`data-s4` talks to university students.** Its hooks are told by school teachers about "our partner school"
    and its projects say "your class timetable". The hooks move to the learner's own adult life; the worked cases
    stay, because they are the labs' cases.
11. **Every existing video gets the standard pass.** No video has the promise line or names the next lesson. All
    36 say "Today: …" and almost all state the idea before any case. Only 9 of the 36 hooks end on a question.
    Many videos are short of the length the standard asks for (`data-u1` 2:23–2:39, `data-s2` 2:32–2:41,
    `data-s1-1` 2:04): the promise, the "show it" scene and the last line bring them into range.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| Data; a tidy table: one row per thing, one value per cell | `data-1-1-1` | every course |
| Question first; units, codes, one way to write a date; a CSV file | `data-1-1-2` | `data-2-1-1`, `data-4-1-4` |
| Bar and line charts; mean, median, an outlier | `data-1-1-3` | `data-2-1-3`, `data-3-1-3` |
| Personal and sensitive data; who may open a sheet | `data-1-1-4` | `data-3-1-4`, `data-4-1-3` |
| Python, rung 1: variables, `if`, `for`, lists | `code-2-1` (Programming) | `data-2-1`, `data-4-1-1` |
| Raw sheet and summary sheet; a program reads a CSV (`csv.DictReader`, `int()`) | `data-2-1-1` | `data-2-1-2` to `data-2-1-4`, `data-4-1-1` |
| Exact match; trim; a master list; a set | `data-2-1-2` | `data-2-1-3`, `data-3-1-2` |
| A blank is not a zero; a repeat; a check; a cleaning log | `data-2-1-3` | `data-3-1-3` (as NULL), `data-4-1-2` |
| A key (the pupil ID); a lookup; no match; a dictionary | `data-2-1-4` | `data-3-1-1`, `data-3-1-4`, `data-4-1-1` |
| A database; primary and foreign keys; a first `SELECT` | `data-3-1-1` | the rest of `data-3-1`, `data-4-1` |
| `WHERE`, `ORDER BY`, `LIMIT` | `data-3-1-2` | `data-4-1-2`, `data-4-1-4` |
| `GROUP BY`, `HAVING`, `NULL` | `data-3-1-3` | `data-4-1-2`, `data-4-1-3` |
| `JOIN`, `LEFT JOIN`, `IS NULL`; a report for one reader | `data-3-1-4` | `data-4-1-3`, `data-4-1-4` |
| A pipeline; safe to run again; a run log | `data-4-1-1` | `data-4-1-2` |
| A check as a query; what a failed check does | `data-4-1-2` | `data-4-1-3` |
| Least privilege; the small-group rule; names replaced by numbers | `data-4-1-3` | `data-4-1-4` |

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| Data answers a question; who makes it and who uses it | `data-s1-1` | `data-s2-1` | | `data-m1-1` |
| A table: rows, columns, one fact in each cell | `data-s1-2` | `data-s2-1` | `data-s3-1` (one scene) | `data-m2-1` |
| A fair chart: bars from zero | `data-s1-3` | `data-s2-4` | | |
| Data about you; publishing without exposing anyone | `data-s1-4` | | | `data-m8-2` |
| Formulas on a range of cells | | `data-s2-1` | | |
| Text must match exactly; types | | `data-s2-2` | `data-s3-2` | `data-m2-1`, then `data-m5-1` |
| Blanks, repeats, impossible values, a check | | `data-s2-3` | `data-s3-2`, `data-s3-3` | `data-m1-3` (checks), `data-m3-2` (NULL), `data-m5-3` (duplicates) |
| Mean, median, range | | `data-s2-4` | | |
| A database; keys; each fact once | | | `data-s3-1` | `data-m2-2`, `data-m2-3` |
| SQL: `SELECT`, `WHERE`, `ORDER BY`, `GROUP BY`, `NULL` | | | `data-s3-1`, `data-s3-2` | `data-m3-1`, `data-m3-2` |
| Joins; rows that vanish or double | | | `data-s3-3` | `data-m3-3` |
| An index; halving | | | `data-s3-4` | `data-m7-3` |
| Python | | rung 1 and lists, taught here | read, not written | read, not written, in `data-m1` to `data-m3`; `code-m5` for `data-s4`; `code-m7` from `data-m4` |
| Batch and stream; event time; a late record | | | | `data-m1-2`, then the window in `data-s4-4` |
| A data contract; quarantine | | | | `data-m1-3`, `data-m1-4` |
| A transaction | | | | `data-m2-4`, then `data-m6-2` |
| A star schema; file formats | | | | `data-s4-1`, then `data-m7-1` |
| Extract, transform, load; a watermark; an idempotent load | | | | `data-s4-2`, then `data-m4-1`, `data-m5-1`, `data-m6-1` |
| Tests as code; what a failure does | | | | `data-s4-3`, then `data-m5-3` |
| Raw files with fingerprints; staging and rejects | | | | `data-m4-2`, `data-m4-3` |
| A ledger; retries; logs | | | | `data-m6-2`, `data-m6-3` |
| Partitions; query plans | | | | `data-m7-2`, `data-m7-3` |
| Lineage; retention and erasure; a runbook | | | | `data-m8-1`, `data-m8-3`, `data-m8-4` |

## The courses

### `data-1-1` Data in your school
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** tell a tidy table from one a computer will miscount; say what to collect before anyone collects; recognise a chart or an average that misleads; say who may open a sheet about pupils.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** see the data your school already keeps as a table, collect it on purpose, read it honestly, then protect the pupils in it.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Data all around the school | tell a tidy table from one a computer will miscount, and put a class's facts into one | The district asked me one thing about my class. How many pupils walk more than thirty minutes to school? The answer is in my register, two notebooks and a WhatsApp chat. So why can’t I just count it? | data; row, column and cell; tidy table; category | table | S |
| 2 | Ask a question, then collect | explain what a question needs before anyone collects: the columns, the units and the codes | For a whole month, our weather club measured the rain. Then I asked: which week was the wettest? The sheet said “a lot”, “12”, “heavy” and “12 mm”. A month of work, so why can’t it answer one question? | tally marks; code; unit; CSV file | formats | S |
| 3 | Charts and summaries that tell the truth | choose the chart that fits a question, and recognise a chart or an average that misleads | Our head showed us a chart: maths marks had doubled! This year’s bar was twice as tall as last year’s. But the average had only moved from fifty-two to fifty-four. So how did two marks look like double? | bar chart and line chart; mean; median; outlier | datalog | S |
| 4 | Pupils' data needs care | recognise personal data in a school sheet, and say who may open it and what may leave the school | A student teacher showed me her class’s marks sheet. Every name and every mark was on it. She was about to post it in the parents’ WhatsApp group. Why did I ask her to stop? | personal data; sensitive data; consent; collect only what you need | footprint | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Hooks are told by Ms Amina, Mr Okafor, Ms Salma and Dr Farah. Lesson 1 opened by defining data: the district's question comes first. Lesson 2 names JSON once, for the lab: one clause says what it is. Lesson 3 is the home of "mean, median and honest charts"; it gets one sentence on what the lab's soil sensor measures, because a Beginner course assumes no IoT. Lesson 4 keeps "share the task, not the child" in one line and gives its time to this track's side: who may open a sheet (a shared link, a password, pupil numbers in place of names). Its first scene was a definition and its hook was about another teacher; its two checks swap, so the second asks the hook's question. The summary's last line becomes "No experience needed."

### `data-2-1` Cleaning and organising data
- **For:** teachers, level 2 Elementary
- **Status:** keep
- **After it, you can:** explain how a program reads a sheet; predict what a computer will count when names disagree, and make them agree; tell a blank from a zero; join two sheets by pupil ID and trace every row without a match.
- **Before this:** `data-1-1` “Data in your school” (Data engineering, level 1) and `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 1; `csv.DictReader`, sets and dictionaries are taught here
- **The path:** a sheet a program can read, names that agree, values you can trust, then two sheets joined by one ID.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Tidy sheets a computer can use | explain how a program reads a sheet, and change a short program so it totals a column of a CSV file | Ms Salma’s mark sheet looks perfect on paper. I asked the computer for the class average. It said twenty out of twenty! Nobody in that class scored twenty, so what did the computer count? | raw sheet; summary sheet; csv.DictReader; int() | table | S |
| 2 | Names that agree | predict how many names a computer will count, and make them agree with trim, a master list and a set | Two of us typed the same week’s register into one sheet. The computer says my class has twenty pupils. I have eight! Where did the other twelve come from? | master list; trim; drop-down list; set | clean | S |
| 3 | Blanks, zeros and repeats | tell a blank from a zero and a repeat from a second reading, and try four checks on a batch | Our rain report said Riverside averaged over two hundred millimetres a day. The river was nearly dry! Every reading in the sheet looked like a number. So which one was lying? | blank; repeat; check; cleaning log | quality | S |
| 4 | One ID per pupil: joining sheets | join two sheets by pupil ID with a lookup, and trace what each row without a match is telling you | I matched the test marks to my class list by name. Two Fatimas, one Fatimah, and a boy who left last term. Four mistakes in thirty rows! What should I have matched by instead? | key; lookup; no match; dictionary | join | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Hooks are told by Mr Joseph, Ms Amina, Mr Okafor and Ms Salma. Python, lesson by lesson:
  - Lesson 1: taught here, guided first ("what does this print?", then put the lines in order, then change one line). It opens "At level 1 you tidied a table by hand" and goes on to a program reading it. "Dictionary" leaves the video and the reading ("each row comes with its column names") and waits for lesson 4. One sentence explains `with open(…) as f:`. The Parsons step's second line is 45 characters, one over the phone editor: it becomes `rows = csv.DictReader(open("marks.csv"))` and `for row in rows:`.
  - Lesson 2: `strip()`, `lower()` and a set are taught here, with a fill-the-gap first.
  - Lesson 3: nothing new in Python, so its first step may be a program to change. The reading explains a pair in brackets, and `blanks = total = count = 0` becomes three lines.
  - Lesson 4: the dictionary is taught here, with "what does this print?" first. One sentence explains a loop with two names.
  - The loops, `if` and variables the learner writes are rung 1, so the summary's last line names `data-1-1` as well as "Python for teachers".

### `data-3-1` Databases and SQL for school records
- **For:** teachers, level 3 Intermediate
- **Status:** keep
- **After it, you can:** build tables linked by keys from one wide sheet; write queries that pick, sort and summarise rows; judge what empty values and missing matches did to an answer; build a report that shows its reader only what they need.
- **Before this:** `data-2-1` “Cleaning and organising data” (Data engineering, level 2).
- **Python:** none; SQL, taught here
- **The path:** store each fact once, ask for rows, summarise them by group, then join tables into a report for one reader.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | From sheets to a database | build two tables linked by a key from one wide sheet, and run a first query | Our school keeps teachers’ phone numbers in eight different sheets. One teacher got a new number last month. Five sheets still show the old one. How do we make one change reach everywhere? | database; primary key; foreign key; SQL | schema | S |
| 2 | Asking questions: SELECT, WHERE, ORDER BY | write a query that picks rows, sorts them and keeps the top few, and test its answer against what you know | Parents’ evening is tonight. I need every pupil in Six A with a maths mark under ten. Our school has four hundred pupils. How do I get that list without reading every row? | query; WHERE; ORDER BY; LIMIT | sqlplay | S |
| 3 | Counts and averages: GROUP BY | summarise a table by group with one query, and judge what empty values did to the result | The district wants the average science mark for every class. Twelve classes, every term. That is my whole Saturday, with a calculator. How can one question to the database give twelve answers at once? | summary function (COUNT, AVG); GROUP BY; HAVING; NULL | sqlplay | S |
| 4 | Joining tables for reports | join two tables for a report, find who is missing from it, and choose the columns its reader needs | I put names next to marks and sent the head a report. Two pupils had vanished from it. Nobody noticed for a whole term. Where did they go? | JOIN … ON; inner join; LEFT JOIN; IS NULL | join | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Hooks are told by Mr Joseph, Ms Salma, Mr Okafor and Mr Joseph. It writes no Python: what it needs from level 2 is ideas (a key, a blank, text that must match exactly), and each gets a one-sentence reminder. Lesson 1 opened with a definition of a database: the eight sheets come first. Lesson 3's lab was `datalog`, whose daily bars are a GROUP BY but show no SQL; it becomes `sqlplay` with a GROUP BY task, so the lab continues the video's own query. `datalog`'s point (look at the lowest and the highest before you trust an average) stays as a practice question. The reading says its HAVING number differs from the video's: they become the same number. Lesson 4's second check asks the hook's question (who vanished, and why), and the report for one reader stays in "widen it" and the project. The summary gains its "Before this" line.

### `data-4-1` Pipelines, quality and governance
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** design a report that builds itself and is safe to run again; design the checks a batch must pass; write your school's access table; write a one-page policy for keeping, archiving and deleting records.
- **Before this:** `data-3-1` “Databases and SQL for school records” (Data engineering, level 3) and `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 1, with the dictionary from `data-2-1-4`; SQL from `data-3-1`
- **The path:** automate the report, put checks in its way, decide who sees it, then decide how long its data lives.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Automate the weekly report | design a report that builds itself in three steps, and make every run safe to repeat | Every Friday, our deputy copies twelve registers into one report. It takes her three hours. Last month she counted one class twice, and nobody saw it. How could the report build itself, and never count twice? | pipeline; idempotent; passing fault; run log | pipeline | S |
| 2 | Checks that catch problems | design the checks a batch must pass as queries, and decide what a failed check does and who fixes the source | Our rain report now builds itself every evening. Last week it told the district that Riverside had a flood. One gauge had sent its error code, and no person saw it. What should have stopped that reading? | range check; uniqueness check; check as a query; fix at the source | quality | S |
| 3 | Who may see what | write an access table for your school's records, and evaluate a report for small groups that point at one child | I read a district report last term. It said: in Six B, one pupil with a disability failed maths. Six B has one pupil with a disability. No name was printed, so how did everyone know who? | least privilege; small-group rule; pseudonymisation; re-identification | footprint | S |
| 4 | Keep, archive, delete | write a one-page policy: how long each record is kept, how it is backed up and archived, and how it is deleted | Our office cupboard holds registers from nineteen ninety-eight. The old computer still holds every pupil’s photo since twenty ten. Nobody ever decided to keep them. So who decides when they go, and how? | retention rule; 3-2-1 backup; restore test; open format | formats | S |

- **Unit check:** unchanged.
- **Changes:** content stays. Hooks are told by Mr Joseph, Mr Okafor, Dr Farah and Mr Joseph. Lesson 1's Parsons step is a function with a list comprehension, which no teachers' course teaches: it is rewritten as a plain loop over the rows, and one sentence explains `sorted()`. The course then needs no Python beyond rung 1 and the dictionary of `data-2-1-4`. Lesson 2 told the same story as `data-2-1-3` (the gauge's 999): it opens "At level 2 you caught the 999 by eye" and asks what stops it when nobody looks. Lesson 3 opens with a two-sentence reminder of "share the task, not the child" and names its home (`cyber-3-1-1`). The summary names both courses.

### `data-u1` Teaching databases and data engineering at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach normalisation from anomalies students cause themselves; teach why a query is slow or fast, with plans students read; let students reproduce the faults of concurrent transactions and fix them; assess a data project on its checks and its record of decisions.
- **Before this:** `data-3-1` “Databases and SQL for school records” (Data engineering, level 3), or you already teach the subject.
- **Python:** none
- **The path:** a design that cannot contradict itself, queries that stay fast, correctness when many write at once, then data and projects you can trust.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | The relational model and normalisation | teach normalisation from anomalies students cause themselves, and set a design task with dependencies, keys and a decomposition to justify | A student’s project database stored my phone number on every enrolment row. I changed phones, and half the rows were updated. Now her database gives two numbers for me. Why did her design allow that? | anomaly; functional dependency; candidate key; lossless decomposition | schema | S |
| 2 | Indexing and query processing | teach why one query takes seconds and another milliseconds, and set a lab where students read a plan and measure what an index costs | On results day, our portal took eight seconds to show one grade. The query was one line. A colleague changed one thing, and it took three milliseconds. What did she change? | index; B+-tree; selectivity; query plan | index | S |
| 3 | Transactions and distributed data | set a lab where students reproduce a lost update and write skew, and choose the smallest fix for each | Registration opened for my elective, with one seat left. Two students clicked register in the same instant. Both got a confirmation, and both came to my first lecture. How did the system give one seat twice? | ACID; serializability; write skew; network partition | pipeline | S |
| 4 | Data quality and project assessment | assess a data project on its checks, its cleaning log and its datasheet, not only on its answers | The faculty report gave my course a hundred and twelve percent attendance. I read the query line by line, and it was correct. So what was wrong, and whose job was it to catch it? | data quality dimension; lineage; datasheet | quality | S |

- **Unit check:** unchanged.
- **Changes:** content stays. The stories are today's, now told as the lecturer's own case, in the first person; three first sentences were too long for the speech bubble, and lesson 4's hook gave its answer away ("some students were loaded twice"). Each promise listed three topics ("Today: Codd's relational model, how…"): each becomes one thing the lecturer can do. All four open with a definition: a case comes first. The videos are the shortest in the track (2:23 to 2:39): the pass brings them to 2:45 or more. Lesson 3 has no lab that shows two transactions at once: `pipeline` stays for its half-finished load, and the lab scene says so. The summary gains its "Before this" line.

### `data-s1` Collect and sort
- **For:** students, primary (9–12)
- **Status:** keep
- **After it, you can:** collect answers with tally marks and count them; sort facts into a table; draw a fair bar chart; sort facts about you into fine to share, share with care and keep private.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** ask and count, sort it into a table, draw it, then keep the facts about you safe.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Ask, count, tally | collect answers to one question with tally marks, and count them in fives | Your class is choosing a snack for Sports Day. Everyone shouts at once! How can you find out what most of you want? | data; tally marks; survey | clean | S |
| 2 | Sort it into a table | sort facts into a table with a heading for every column and one fact in each cell | Your school garden grows beans, maize and tomatoes. Every day, someone writes what was picked on a scrap of paper. Now there are forty scraps! Which day gave the most beans? | row; column; cell | table | S |
| 3 | Draw it: charts | draw a bar chart from a tally, and say whether a chart is fair | Musa draws a chart of his class’s favourite fruit. Oranges got twelve votes, and bananas got seven. But on his chart, the banana bar is almost flat! How did seven votes come to look like nothing? | pictogram; bar chart; fair chart | datalog | S |
| 4 | Data about you | sort facts about you into fine to share, share with care and keep private | Grace finds a new game about cats. Before she can play, it asks four things. Her name, her school, her birthday and a photo! Why would a cat game want all that? | data about you; private; trusted adult | footprint | S |

- **Unit check:** unchanged.
- **Changes:** content stays; nothing is typed. Hooks are told to "you" or about a pupil, and end on a question (one of four did). Lesson 1's second check asked how many pupils a computer sees in "Musa, Moussa, Musah", which is not its hook's question: it asks the hook's ("How do you find out what most of the class wants?"), and the names example moves to the lab scene as "write every answer the same way". The `clean` lab is a loose fit for tallying (see the decisions). Lesson 1's video is 2:04: the pass brings it to 2:15 or more. Lesson 4 keeps "ask a trusted adult" and says once that many apps and games are for ages 13 and over.

### `data-s2` Spreadsheets and clean data
- **For:** students, lower secondary (12–15)
- **Status:** revise
- **After it, you can:** total and average a column with a formula; clean typed answers so the same answer counts once; find blanks, repeats and impossible values; choose the summary that tells the truth.
- **Before this:** No experience needed.
- **Python:** rung 1 and lists, taught here (one new idea in each lesson)
- **The path:** a table that adds itself up, text that counts right, values you can trust, then a summary that tells the truth.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Cells, rows and formulas | total and average a column with a formula, and read the same sum in three lines of Python | Zainab added up her class’s marks on a calculator. Forty numbers, three tries, three different answers! How can she get one total she can trust, every time? | cell address; range; formula; list | table | S |
| 2 | Messy names, wrong counts | clean typed answers step by step so the same answer counts once, by hand and with a loop | Your class votes online for the school trip. Almost everyone types the zoo. But the results show “Zoo”, “zoo” and “ZOO” as three different places! Why can’t the computer see it’s one zoo? | exact match; strip(); lower(); loop | clean | S |
| 3 | Blanks, repeats and impossible values | find blanks, repeats and impossible values in a table, and read a check that flags them | Your weather club’s chart shows a flood on Tuesday. But Tuesday was the sunniest day of the week! The number came straight from the rain gauge. So how can a gauge be that wrong? | impossible value; blank; repeat; check | quality | S |
| 4 | Summaries that tell the truth | work out the mean, the median and the range, and choose the one that tells the truth | An advert says the average customer uses three gigabytes a month. You ask your friends, and almost all of you use less. How can both be true? | mean; median; range (biggest minus smallest); sorted() | datalog | S |

- **Unit check:** unchanged.
- **Changes:** the data content stays; the Python is put in order, one idea a lesson, each explained in the reading with an example before a guided step.
  - Lesson 1: a list, with `print`, `sum` and `len`. It opens with twenty seconds on a tidy table (one row per thing, one value per cell), for learners who did not do `data-s1`.
  - Lesson 2: a `for` loop. The video said only "do it in a loop"; now it shows one. The dictionary leaves the reading and the Parsons step: votes are counted with `.count("zoo")` on the cleaned list, as the last step already does. Its 73-character line is split.
  - Lesson 3: `if` and `None`. The first step that uses `if` becomes fill-the-gap; one program to change stays.
  - Lesson 4: `sorted`, and "the third item is `[2]`". It says in one sentence that this "range" is not lesson 1's block of cells (Arabic has two words). It is the students' home of "mean, median and honest charts". The advert's number becomes three gigabytes, to match the reading's five friends (1, 1, 2, 3 and 9 GB: a mean of 3.2).
  - The summary ends "No experience needed. If you have done “First Python”, the code will be familiar."

### `data-s3` Databases and SQL
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** design tables with keys so that each fact is stored once; write SQL that filters, sorts, counts by group and joins; judge a result for missing or doubled rows; explain what an index buys and what it costs.
- **Before this:** No experience needed.
- **Python:** shown and explained; SQL, taught here
- **The path:** how an app stores a fact once, how to question it, how to join it without losing or doubling rows, and why it answers fast.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Tables, keys and types | design tables with a primary key and foreign keys so that each fact is stored once, and run a first query | You like a photo. The app must remember who liked it, which photo, and when. It does that millions of times a second. So what, exactly, does it write down for your one like? | database; primary key; foreign key; schema | schema | S |
| 2 | Questions in SQL | write a query that filters, sorts and counts by group, and explain what an empty value does to a count | Your school librarian asks you one question. Which class borrowed the most books this term? She hands you eleven thousand loan records. How do you answer before the bell rings? | WHERE; ORDER BY; GROUP BY; NULL | sqlplay | S |
| 3 | Joining tables | join two tables, find the rows with no match, and judge whether rows vanished or doubled | The library’s list has member numbers and book titles. The school’s list has numbers and names. The librarian asks you: who has an overdue book? Neither list can say, so how can the two answer together? | JOIN … ON; LEFT JOIN; IS NULL; COUNT(DISTINCT …) | join | S |
| 4 | Fast answers: indexes | explain why a lookup with an index takes about twenty looks in a million rows, and choose which columns to index | You type a friend’s name into your phone. It finds her among a thousand contacts before you finish. A big app does the same among millions of accounts. It can’t be reading them all, so what is it doing? | linear search; binary search; index; trade-off | index | S |

- **Unit check:** unchanged; its one Python question is already a fill-the-gap.
- **Changes:** the SQL stays. The course becomes a real first meeting for a 16-year-old, and stops needing a Programming course.
  - Lesson 1: one scene shows a class list as a table (rows, columns, one fact in each cell) before the word "database". It had eight new ideas; it keeps four. "Normalising" leaves (the lesson says "store each fact once"). The first query picks columns only: `WHERE` waits for lesson 2.
  - Lesson 2: the second check asks the hook's question (which class borrowed the most). "GROUP BY, done by hand" stays as Python that is shown and explained: the reading says what a dictionary is in two sentences, and the step becomes "which line is wrong?".
  - Lesson 4 keeps the index. Halving is shown on a sorted list, with no code. The two steps that edited search functions leave: one becomes a fill-the-gap on `CREATE INDEX`, one a question on which column to index. The six-line halving loop stays as "what does this print?". The reading names Programming's “Searching” (`code-s3-3`) as the place to write binary search.
  - The summary ends "…with SQL you run and test on your phone. No experience needed."

### `data-m1` Producers, consumers and data contracts
- **For:** students, university
- **Status:** new
- **After it, you can:** say who makes, uses and owns a dataset; choose batch or stream by how fresh an answer must be; check a delivery against a written contract, and write one.
- **Before this:** No experience needed.
- **Python:** shown and explained; no SQL yet
- **The path:** who makes the data and who uses it, how fresh it must be, what the two sides agree, then the agreement written so that a program can check it.
- **Phone or computer:** everything runs on the phone. The project is guided: the contract is filled in as a table of fields, five checks are chosen from it, and the check program is read, completed and run in the sandbox on a short list of records. The draft's full task, a script of your own over the whole events file, is an extra for learners who already write Python, on a computer (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Who makes it, who uses it, who owns it | trace a record from the system that makes it to the people who use it, and name who owns each dataset on the way | Your department’s dashboard shows forty students in a course. The registration office says thirty-six. You ask whose job it is to keep the dashboard right, and nobody knows. So when it is wrong, who fixes it? | producer; consumer; owner; data lifecycle | pipeline | N |
| 2 | Batch and stream: fresh or complete? | choose batch or stream by how fresh an answer must be, and explain how a late record changes a number already published | At midnight the portal says seven students joined your course today. Three days later, the same day shows eight. Nobody enrolled in the past. So how did that day’s number change? | batch; stream; event time; processing time | stream | N |
| 3 | A data contract, and a batch that breaks it | check a delivered batch against a contract, rule by rule, and decide what to load and what to set aside | The registration system sends tonight’s twenty-six enrolments. Five are broken: one has no student, one names an unknown course. Refuse them all, and twenty-one students lose their places. What should you do with a delivery that is mostly right? | data contract; schema; acceptance criteria; quarantine | quality | N |
| 4 | Write the contract | write a contract for one dataset that a program can check, and defend one rule you made strict or lenient | Overnight, the registration team renames one field in its data. Their system works; your dashboard shows no students. Nobody broke a rule, because none was written down. What should have been agreed before the first record was sent? | service level; freshness; at-least-once delivery; change policy | clean | N |

- **Unit check:** 10 questions from the module's quiz and its three "Check yourself" sets, rewritten as graded questions; at least four are campus cases to decide.
- **Changes:** new, from module 1 of the draft. It is the university starting course and needs no Python: code is read, with every line explained, and steps are guided (fill a gap, put the lines in order, find the bug). Lesson 1 says in a sentence each what a record, a field and a dataset are; records are shown as rows of named fields, and JSON waits for module 2. The six lifecycle stages are the map of the whole path: they go in lesson 1's reading and come back in every later course. Lesson 2's worked case is the draft's (at noon the stream has seen 11 events, the nightly table 8; a count of 7 becomes 8 three days later); the `stream` lab shows the same choice on a river sensor. Lesson 4 is the draft's task in its guided form: the contract is written as a table, and `clean` shows how a strict or a lenient rule moves a count.

### `data-m2` Files, schemas and keys
- **For:** students, university
- **Status:** new
- **After it, you can:** say what a CSV or JSON file really holds, and what type each value should become; write tables whose keys and rules refuse bad rows; split a flat table so that each fact is stored once.
- **Before this:** `data-m1` “Producers, consumers and data contracts” (Data engineering, university).
- **Python:** shown and explained; SQL, taught here
- **The path:** values arrive as text, a schema says what is valid, one fact goes in one place, then a database built so that it refuses what is wrong.
- **Phone or computer:** everything the course asks for runs on the phone. The learner writes SQL in the phone's SQLite: `CREATE TABLE` with keys, `CHECK` and `STRICT`, and the rows SQLite refuses. The Python that reads a file is read and completed, not written. The project is guided: the schema and its checks in SQL, with the rows given. The draft's full task, a loading script in Python, needs `sqlite3` and a computer, and is an extra for learners who have `code-m6` (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | CSV and JSON: everything arrives as text | say what a CSV or JSON file really holds, and decide the type of each value on purpose, keeping a missing value missing | You sort the course list by credits. The course with ten credits comes before the one with nine. Nobody typed anything wrong. So what does the computer think those numbers are? | CSV; JSON; type; missing value | table | N |
| 2 | Keys and rules: let the database refuse | write a table definition with a primary key, a foreign key and a rule, and predict which rows the database will refuse | The portal lists you in a course you never chose. One student on its list does not even exist. The program that wrote those rows had a bug. What could have refused them, whatever the program did? | CREATE TABLE; primary key; foreign key; constraint | join | N |
| 3 | One fact, one place | split a flat table into related tables so that each fact is stored once, and show that nothing was lost | The enrolment file names the course DE101 seven times. Six rows give it one title. The seventh gives it another. Which is right, and how can one file disagree with itself? | flat table; anomaly; normalisation | schema | N |
| 4 | Build the university database | build a small database from three files so that the database itself refuses bad rows, and account for every row loaded or refused | You load ninety-three enrolment rows into your new database. It now holds ninety-one. No error stopped the program. Where are the other two, and how would you ever know? | transaction; STRICT table; reconciliation | sqlplay | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; two are tables to read, where the learner says which row is refused and why.
- **Changes:** new, from module 2. The draft's lesson 1 opens on quoting ("Hamdan, Dana" breaks a split on commas). Reading files in Python has its home in Programming (`code-m6-3`), and this course does not need it: the video shows the three lines that read the file, explains each, and takes the draft's other outcome, types, as its one idea; UTF-8 and nested JSON go in the reading and the practice. JSON is taught here, in a sentence and an example. In lesson 2 the `join` lab shows the row a foreign key would have refused: a mark for pupil 7, who is not on the list. "Transaction" is taught in lesson 4 (load the file whole or not at all), because modules 4 and 6 lean on it. Dates are stored as year-month-day from lesson 1 on.

### `data-m3` SQL that gives the right answer
- **For:** students, university
- **Status:** new
- **After it, you can:** write a query from a question; summarise by group without turning unknown values into zeros; join tables without losing rows or counting them twice.
- **Before this:** `data-m2` “Files, schemas and keys” (Data engineering, university).
- **Python:** shown and explained; SQL, taught here
- **The path:** ask for rows, summarise them, join them, then one honest report that survives all three traps.
- **Phone or computer:** everything the course asks for runs in the phone's SQLite. Parameters are read and explained, not run. The project's second way of counting is a second query. The draft's check in Python is an extra for learners who write Python, on a computer (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Asking for rows | write a query that answers a stated question: the right rows, the right columns, in a fixed order | Registration closes tonight, and you still need one Computing course. The catalogue has hundreds of courses in one table. You want Computing only, most credits first. What do you type to get exactly that list? | query; WHERE; ORDER BY; LIMIT | sqlplay | N |
| 2 | Groups, and what NULL does | summarise a table by group, and report an average without turning unknown values into zeros | Your writing course reports average attendance of forty-five percent. You were there, and the room was two-thirds full. Four students’ attendance was never recorded. What did the report do with those four? | GROUP BY; aggregate; HAVING; NULL | sqlplay | N |
| 3 | Joins that lose rows, joins that multiply them | join two tables and show that no row was lost and none was counted twice | Thirteen students take your course. You match them to their submissions and count the rows. The answer is thirty-two. Nothing warned you, so who was counted more than once? | JOIN … ON; LEFT JOIN; fan-out | join | N |
| 4 | Honest participation | write one query that gives a rate for every group, keeps missing data missing, and agrees with a second way of counting | A new course opens with no students yet. The participation report gives it zero percent. The dean asks why nobody takes part in it. What should the report say about a course with nobody to count? | common table expression; COALESCE; independent check | join | N |

- **Unit check:** 10 questions; at least four are queries to read or repair (find the bug, fill the gap), and one joins lessons 2 and 3 (a count after a join).
- **Changes:** new, from module 3. Parameters (the `?` in place of a pasted value) need Python's `sqlite3`, which the phone does not have: lesson 1's reading shows the query that breaks on the apostrophe in "Writer's reflection" and the parameter that fixes it, and names Cyber security's `cyber-m7-2` for the attack. The numbers are the draft's: attendance of 0.654 over the known values against 0.453 with unknowns as zero; 32 joined rows for a course of 13 students. Both SQL labs are met twice, with a harder task the second time (rows, then groups; who vanishes, then which count is honest).

### `data-s4` Data engineering
- **For:** students, university
- **Status:** revise
- **After it, you can:** choose a schema and a file format for a job; build a load that is safe to run twice; write quality tests and decide what a failure does; size a window for a stream.
- **Before this:** `data-m3` “SQL that gives the right answer” (Data engineering, university) and `code-m5` “Lists and dictionaries” (Programming, university).
- **Python:** rung 2 (functions, lists, dictionaries); SQL from `data-m3`
- **The path:** one pass over a whole pipeline, on the phone: shape the data, move it safely, test it, then decide how fast it must arrive.
- **Phone or computer:** everything runs on the phone, as today.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Schemas and formats | choose a schema and a file format for a job, by who reads the data and what it costs to send | On a placement, you must collect daily attendance from twenty thousand schools. Many of them are on 2G. Sent the usual way, that is hours of airtime a day. How can the same facts travel in far less? | star schema; fact table; column format; compression | formats | S |
| 2 | ETL with Python and SQL | build an extract, transform and load job whose load is safe to run twice, and that picks up only new rows | The campus dashboard counts a hundred and fifty-two students in one exam. The hall has ninety seats. Nobody sat on the floor. So where did the other sixty-two come from? | ETL and ELT; idempotent load; watermark; run log | pipeline | S |
| 3 | Data quality and contracts | write quality tests as queries, and decide what each failure does: block the load, set rows aside, or warn | On the night before results day, one test fails. Three marks out of ten thousand are wrong. Stop the load, and nobody gets results; let it through, and three students get wrong ones. What should the pipeline do? | referential integrity; orphan; test as code | quality | R |
| 4 | Batch and stream | size a window for a stream by the false alarms and the delay it gives, and choose batch, stream or both | A campus sensor reads the server room’s temperature every minute. A door opens, one reading jumps, and the alarm rings. Wait for ten readings, and a real fire is reported late. How many readings should an alarm wait for? | window; moving average; false alarm | stream | R |

- **Unit check:** two questions change with lessons 3 and 4 (an orphan row; a window); the rest stay.
- **Changes:** the course keeps its id, its labs and its worked cases, and takes a new place: after module 3, as the first pass over a whole pipeline. Everything in it runs on the phone.
  - Lessons 1 and 2 keep their content. Their hooks were told by school teachers about "our partner school": they move to the learner's own life (a placement, the campus dashboard), with the labs' numbers kept (152 against 90). Lesson 1 opens with one scene that recalls keys and "each fact once" from `data-m2`.
  - Lesson 3 is rewritten. Module 1 has already taught the contract, acceptance checks and quarantine, so they become a two-sentence reminder. The time goes to tests written as queries (an orphan found with a left join), and to what a failure should do, by what it costs.
  - Lesson 4 is rewritten. Module 1 has taught batch, stream and event time. The lesson keeps the window: the lab's river sensor, where one reading gives three false alarms and ten give none, five minutes late.
  - It is the first course of the path in which learners write Python, so it names `code-m5`. Each reading explains the one thing beyond functions and dictionaries that its step leans on: `csv.DictReader` and `with open` (lesson 1), a list comprehension (lesson 2), `enumerate` (lesson 3), a slice (lesson 4). Lines of up to 73 characters are split. Projects and "try it" stop saying "your class timetable".
  - The summary gains its "Before this" line. The title may gain "the pipeline in four lessons".

### `data-m4` Getting data in: extraction, raw files and staging
- **For:** students, university
- **Status:** new
- **After it, you can:** copy records from a source without a gap or a repeat; keep every delivered file as it came, with its fingerprint; accept or reject each record with a reason, and account for all of them.
- **Before this:** `data-s4` “Data engineering” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with tests of your own in the project; SQL from `data-m3`
- **The path:** read the source without gaps, keep what arrived, sort good records from bad, then a loader that proves nothing was lost.
- **Phone or computer:** paging over a list, validation with reasons and SHA-256 run in the sandbox. Landing files in SQLite, with one transaction for each, is computer work, and so is the loader with its tests; the phone-sized project validates one batch and reconciles it (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Reading a source page by page | copy records from a source page by page without skipping or repeating one, even when the source changes as you read | You copy a platform’s activity list, five records at a time. While you read, someone deletes record three. Your copy ends with no error, and record six is missing. Where did it go? | full extraction; incremental extraction; offset paging; keyset paging | — | N |
| 2 | Keep the raw file exactly as it came | store a delivered file unchanged with its fingerprint, and tell a file sent again from a file that changed | Monday’s submissions file arrives, and you load it. On Tuesday a file with the same name arrives again. Is it a copy, or a correction? The names are identical, so how can you tell without reading every line? | raw layer; provenance; fingerprint; superseded version | hash | N |
| 3 | Staging: accept, reject, account for every record | validate records one by one, send each to staging or to a reject table with its reason, and show that every record is accounted for | The submission service adds one new field to its records: attempt. Nothing else changes. Your loader rejects all of Thursday’s records. What should a loader do with a field it has never seen? | staging; reject table; file-level rejection; tolerant reader | quality | N |
| 4 | Load the batches | build a loader that lands every file once, stages the latest version of each day, and proves that nothing was lost | Version two of Tuesday’s file corrects one score. Then version three arrives, with four records fewer than version two. Were those four students’ submissions deleted on purpose, or lost on the way? Who can answer that? | load report; latest-version rule | pipeline | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; at least four are deliveries to judge (a file sent twice, a truncated file, an added field).
- **Changes:** new, from module 4. Lesson 1 opens "In “Data engineering” you loaded only the rows after a watermark" and goes further: what `>` and `>=` each risk at the boundary, then paging. No lab pages through a source, so the lab step is a second worked case in the sandbox (a list, a deletion, the record that goes missing). Lesson 2 uses the `hash` lab from Cyber security (the idea's home at university is `cyber-m4`): change one letter and the fingerprint changes. Lesson 3 opens with the reject idea from `data-m1-3` and adds the reason, the whole-file failure and the added field.

### `data-m5` Transforming data: types, time and quality checks
- **For:** students, university
- **Status:** new
- **After it, you can:** convert text to numbers and times on purpose; settle duplicates by a written rule; publish a table only when its named checks pass.
- **Before this:** `data-m4` “Getting data in: extraction, raw files and staging” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with tests of your own in the project; SQL from `data-m3`
- **The path:** make every value the type it claims to be, put every time on one clock, settle the duplicates, then publish only what passes.
- **Phone or computer:** the silent conversions, timestamps to UTC, duplicates and named checks run in the phone's SQLite, and the same conversions in its Python. Comparing the two routes in one program is computer work; the phone-sized project is the SQL route with its gate (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Types on purpose | convert text to numbers and dates explicitly, and catch the conversions a database makes without telling you | A lecturer types a score as the word eighty. The database stores it as zero. No error, no warning, and the student’s average drops. Why did the database accept a word as a number? | CAST; silent conversion; explicit conversion | table | N |
| 2 | One clock for every timestamp | bring timestamps written in different ways to one form in UTC, refuse the ones that need a guess, and say which clock a report uses | You submit your essay at half past midnight, thirty minutes late. The platform’s record says you submitted the day before, at half past eleven at night. Both times are correct. So which day did you submit? | UTC; offset; canonical form; reporting clock | — | N |
| 3 | Duplicates, and a gate before publishing | tell an exact duplicate from a conflicting one, apply a written rule, and block publishing when a named check fails | Your essay’s score arrives twice in the grades feed. One row says sixty-two, the other seventy-one. Both carry the same event number. Which score is yours, and which rule decides? | exact duplicate; conflicting duplicate; quality check; publish gate | clean | N |
| 4 | Clean, checked, then published | build one clean table by two routes, in Python and in SQL, and publish it only when every check passes and the two agree | You build the clean grades table twice, two different ways. Python gives twenty-seven rows. SQL gives twenty-eight, and one is dated the thirtieth of February. Which table do you publish? | accounting assertion; agreement check | quality | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; at least three are values to judge (accept, convert or reject, with the reason).
- **Changes:** new, from module 5. Lesson 1 opens "In “Data engineering” you met ETL and ELT" and gives its video to the draft's second outcome, explicit types; where to transform stays in the reading. The draft calls lesson 2 "Normalising timestamps": Darsi keeps "normalise" for tables (module 2) and says "one canonical form" here, so one word has one meaning. No lab shows time zones: lesson 2's lab step is a worked case in the SQL sandbox, where SQLite converts `+01:00` and `Z` to UTC and returns nothing for `+0100`. Lesson 3 opens with tests as code from `data-s4-3` and adds the gate.

### `data-m6` Loads that are safe to run twice
- **For:** students, university
- **Status:** new
- **After it, you can:** make a write safe to repeat; resume a crashed load without counting anything twice; say exactly what your design guarantees and what it does not.
- **Before this:** `data-m5` “Transforming data: types, time and quality checks” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with tests of your own in the project; SQL from `data-m3`
- **The path:** a write you can repeat, a crash you can recover from, a run you can read the next day, then all three proved with counts.
- **Phone or computer:** `INSERT OR IGNORE`, the upsert with its rule, and `BEGIN` with `ROLLBACK` run in the phone's SQLite; backoff runs in the sandbox. A crash followed by a restart, and a ledger written from Python, are computer work; the phone-sized project loads the same file twice in SQL and shows the counts (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | The same record, sent twice | make a write safe to repeat with a key, and choose between ignoring a second copy and letting a later correction replace the first | Your mark is corrected from fifty-eight to sixty-eight. Next day, the old record is sent again by mistake. If the newest arrival always wins, your mark drops back. How should a table know which copy is the right one? | INSERT OR IGNORE; upsert; ordering rule | pipeline | N |
| 2 | A crash in the middle | resume an interrupted load without counting anything twice, with one transaction for each file and a ledger of what was loaded | A laptop goes to sleep while loading Wednesday’s events. Five of twelve rows are in. In the morning you run the loader again. Does it start Wednesday again, carry on at row six, or count five rows twice? | load ledger; effectively once; lookback window | pipeline | N |
| 3 | Try again, or stop and say why | decide which failures to retry and how often, and write log lines from which a run can be checked the next day | The nightly load finishes with no error, as it does every night. But tonight it added no rows at all. The platform was down, or exams are over, or something broke. How would anyone know which, the next morning? | exponential backoff; permanent failure; structured log; run metrics | pipeline | N |
| 4 | Crash it, resume it, prove it | interrupt a load on purpose, resume it, run it again, and prove with counts that the result equals one clean run | Four days of learning events arrive: fifty-one lines in all. Your table ends with forty-nine rows, your classmate’s with fifty-one. Either you lost two events, or she counted two twice. How do you prove which? | clean run; independent expectation | — | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; at least four are runs to judge (a rerun, a crash, a correction that arrives before its original).
- **Changes:** new, from module 6. Lesson 1 opens "In “Data engineering” you made a load safe by replacing the day's rows" and goes further: a key on each record, and a rule for which copy wins. The `pipeline` lab is this module's lab, with a different experiment each time: replace against add (lesson 1), a load that fails halfway (lesson 2), a retry that helps and one that cannot (lesson 3). Lesson 2 keeps the draft's honest line: correct results in this one database, not "exactly once" everywhere. Which field makes a good watermark (arrival time, not event time) goes in lesson 2's reading.

### `data-m7` Storing data for fast answers
- **For:** students, university
- **Status:** new
- **After it, you can:** choose where a dataset should live; choose a partition key from the questions people ask; decide with measurements which indexes to keep.
- **Before this:** `data-m6` “Loads that are safe to run twice” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with tests of your own in the project; SQL from `data-m3`
- **The path:** where data should live, how to skip most of it, how to find a row in it, then what each shortcut costs.
- **Phone or computer:** star queries, `CREATE INDEX` and `EXPLAIN QUERY PLAN` run in the phone's SQLite, and the `index` lab counts looks. Counting SQLite's steps and folders of partition files are computer work; the phone-sized project reads three plans and argues keep or drop (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Operational database, warehouse or lake | choose where a dataset should live, and state the grain of a fact table | On registration morning, the dean’s office runs a five-year report. The registration site slows to a crawl for everyone. Both use the same database. Where should each kind of work live? | operational database; data warehouse; data lake; grain | formats | N |
| 2 | Partitions: skip what you don't need | choose a partition key from the questions people ask, and predict which queries it speeds up and which it does not | A term’s activity is stored in five folders, one for each month. Asking about March opens one folder. Asking about your one course opens all five. Why is the second question five times the work? | partition; partition key; pruning; skew | — | N |
| 3 | Indexes and query plans | read a query plan, add an index, and measure what it saves on a read | Finding your rows among twenty thousand takes sixty thousand steps. One addition to the table cuts that to fifteen hundred. The team adds one per column, and loading slows down. What is it, and what does it cost? | index; query plan; SCAN and SEARCH; selectivity | index | N |
| 4 | Keep or drop | measure what each index saves and what it costs on every write, and recommend which to keep for a stated workload | Three indexes are proposed for the activity table. One makes its query eighty times lighter, another less than twice. Each one slows every night’s load. Which would you keep, and what would you measure first? | composite index; covering index; workload | index | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; two are query plans to read.
- **Changes:** new, from module 7. Lesson 1 opens "In “Data engineering” you built a star schema" and goes further: the three places data lives, and the grain. No lab shows partitions: lesson 2's lab step is a worked case (five months, one opened). The numbers are the draft's: about 61,000 steps down to 1,500 for one student; a filter that keeps 42% of the rows gains less than twice; three indexes add about 140% to the file and 80% to the work of an insert. On the phone the `index` lab counts looks, and `EXPLAIN QUERY PLAN` shows SCAN turn into SEARCH; counting SQLite's steps needs a computer.

### `data-m8` Lineage, access and retention
- **For:** students, university
- **Status:** new
- **After it, you can:** say where a number came from and what depends on it; publish a summary that points at nobody; erase a person's data from every layer; write the runbook someone else can follow.
- **Before this:** `data-m7` “Storing data for fast answers” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with tests of your own in the project; SQL from `data-m3`
- **The path:** where a number came from, who may see it, how long it lives, then the page that lets someone else run it all.
- **Phone or computer:** lineage tables with a recursive query, suppression with `HAVING`, retention with `DELETE` and the keyed token run on the phone; the lineage diagram and the runbook are writing. The full pipeline over its data file, with tests, is computer work (Decisions, 2).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Lineage: where did this number come from? | record which dataset feeds which, and use the record to find what breaks when a source changes and which dataset has no owner | The registration export will change its format next month. Your team is asked what will break. Nobody has a list of what reads that export. How do you find everything that depends on it? | lineage; upstream; downstream; impact analysis | pipeline | N |
| 2 | A summary that points at nobody | publish a summary that points at nobody: drop what the purpose does not need, replace ids with keyed tokens, and hide small groups | A published table has no names in it. One row reads: writing course, week nine, one student, eighty-five minutes. Everyone in that course knows who was alone that week. So where is the name hiding? | data minimisation; pseudonym; small-cell suppression; least privilege | footprint | N |
| 3 | Keep, erase, and check | apply a retention rule to every layer, carry one erasure request through all of them, and check that nothing remains | A student asks the university to erase her study data. You delete her rows from the events table. The weekly summary still counts her, and so does last night’s backup. When is she really gone? | retention period; erasure request; derived data | — | N |
| 4 | The runbook | write the page that lets someone else run your pipeline on a bad day: its purpose, its checks, what to do when it fails, and what it must delete | You built the pipeline, and you are away for a week. At six in the morning the nightly load fails. A classmate who has never seen your code is asked to fix it. What would she need written down? | runbook; owner role; failure procedure | — | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" sets; at least four are cases to decide (who may see a table, whether a cell is published, what an erasure must reach).
- **Changes:** new, from module 8. Lesson 2 has four terms and three techniques (drop, replace, suppress): access by role is one scene and the reading. It is this track's side of personal data at university; the general rule has its home in Cyber security. The draft's teaching values stay labelled as such: a threshold of 5 students, retention of 30 days, 90 days and 2 years, and "this is not legal advice". The `pipeline` lab is met a last time, walked backwards: from the district's number to the registers it came from. Lessons 3 and 4 have no fitting lab; the lineage diagram and the runbook are writing, done on the phone or on paper.

### `data-capstone` Capstone: an incremental pipeline over a week of learning events
- **For:** students, university (capstone)
- **Status:** rewrite
- **After it, you can:** build, test and document a pipeline that loads a week of deliveries from two producers, survives duplicates, corrections and an interruption, and publishes a summary that exposes nobody.
- **Before this:** `data-m8` “Lineage, access and retention” (Data engineering, university) and `code-m7` “Tests and debugging” (Programming, university).
- **Python:** rung 3, with at least six tests of your own; SQL from `data-m3`
- **Phone or computer:** a computer with Python 3.10 or newer and its built-in SQLite. Reading the brief, planning the schema, the lineage and the runbook can be done on a phone.

- **Changes:** the id and the three parts (description, starter, submission) stay; the brief changes, and the capstone moves from level 3 (upper secondary) to the end of the university path.
  - **Core:** the draft's capstone. One fictional week, eight delivered files from a learning platform and a room scanner, with problems planted on purpose. The five milestones follow its schedule: profile the files and design the schema; ingest and reject; clean events, the analytical table and the summary query; idempotence, corrections, crash and resume, the quality gate and tests; lineage, the minimised output, retention and the runbook. About 12 hours, offline, with Python and its built-in SQLite only.
  - **Optional last milestone:** today's capstone. Point the same pipeline at real public data (World Bank school enrolment, Open-Meteo temperatures) and let it refresh weekly on GitHub Actions. It needs a network and a GitHub account, and the starter teaches DuckDB and Actions, which no course does.
  - **Evidence:** the draft asks for a ten-minute individual demonstration. In Darsi that is the reviewer's check of the repository and of `darsi-check.json`, which must show the interruption test and the rerun test passing.
  - The description says who it is for and what it needs: a computer, about 12 hours, and the two courses above.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `data-1-1` | Teachers, Beginner | Kept. 4 standard passes. Gains "No experience needed." |
| `data-2-1` | Teachers, Elementary | Kept. 4 standard passes. Names `data-1-1` as well as "Python for teachers"; "dictionary" waits for lesson 4. |
| `data-3-1` | Teachers, Intermediate | Kept. 4 standard passes. Names `data-2-1`; lesson 3's lab becomes `sqlplay`. |
| `data-4-1` | Teachers, Advanced | Kept. 4 standard passes. Names `data-3-1` and "Python for teachers"; one Parsons step rewritten; lesson 2 gets a new hook. |
| `data-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `data-s1` | Students, primary | Kept. 4 standard passes. |
| `data-s2` | Students, lower secondary | Revised. 4 standard passes. Python one idea a lesson; the dictionary leaves. |
| `data-s3` | Students, upper secondary | Revised. 4 standard passes. Needs no Programming course; lesson 4 keeps the index and leaves the search code to Programming. |
| `data-s4` | Students, university, the overview after module 3 | Revised. 2 standard passes, 2 rewrites. Names `data-m3` and `code-m5`; hooks move to campus. |
| `data-capstone` | Students, university, capstone | Rewritten around the draft's offline pipeline; today's open-data report becomes its optional last milestone. Moves from level 3 to level 4. |
| (new) `data-m1` to `data-m3` | Students, university: the start, files and keys, SQL | New: 12 lessons and 3 unit checks, from modules 1 to 3. |
| (new) `data-m4` to `data-m8` | Students, university: each stage of a pipeline in depth | New: 20 lessons and 5 unit checks, from modules 4 to 8. |

## Work, in order

The Darsi University draft is a draft. Its own README says so: no subject specialist and no Arabic reader has
reviewed it, nobody has studied from it, and its code was run in one environment only (Python 3.13 and SQLite 3.46
on Linux). So step 1 comes before any writing.

1. **Review the draft.** A data-engineering reader for the eight modules and the capstone; an Arabic reader for the
   guides; one run of every module's code on Windows; and each module's SQL tried inside a Darsi step (it runs in
   the phone's SQLite, see decision 2, but a step is graded by the rows its last query returns).
2. **`data-m1`, `data-m2`, `data-m3`, new** (12 lessons, 3 unit checks). They are the way from zero into the
   published `data-s4`, so they come first. None of them needs Python; `data-s4` then needs `code-m5`.
3. **`data-s4`** (2 standard passes, 2 rewrites), then **`data-4-1` and `data-u1`** (8 standard passes): the
   courses that are published today.
4. **`data-m4` to `data-m8`, new** (20 lessons, 5 unit checks), in order.
5. **`data-capstone`:** the three text parts, the starter repository and its check script.
6. **`data-1-1`, `data-2-1`, `data-3-1`, standard pass** (12 lessons): the teachers' ladder, in order. Until these
   are published again, `data-4-1` and `data-u1` name courses nobody can open (decision 7).
7. **`data-s3`, `data-s2`, `data-s1`, standard pass** (12 lessons), with their step changes.
8. **Text only, in the same passes:** every summary's last line in both languages; code lines over 44 characters
   (the list is under "Reference"); the placement questions for university students (see "Placement").

In all: 34 standard passes, 2 rewrites and 32 new lessons. Narration is about $2.04 for both languages. Ask before
spending it.

## Decisions for the user

1. **Build the university path from the eight modules, with `data-s4` after module 3?** Recommended: yes.
   - The modules give a complete course from zero, already drafted in both languages with exercises, quizzes and
     tasks. They replace the single starting course first planned.
   - `data-s4` after module 3 is the only place where its questions are still open. The other choices: after
     module 8 (its hooks would be answered already), or unpublished (it has four videos and four labs that work).
   - Cost: 32 new lessons (about $1.28 of narration) and 2 rewrites, after the review in step 1.
2. **Phone or computer, course by course?** The draft assumes a computer with Python 3 and SQLite. Recommended:
   lessons on the phone, and every project in two sizes.
   - **What the phone can do.** The SQL of all eight modules runs in the phone's SQLite. Checked on 2026-11-15 in
     the same engine (sql.js, SQLite 3.49.1), outside the lesson player: `STRICT` tables, `CHECK`, foreign keys,
     `INSERT OR IGNORE`, an upsert with a rule, `BEGIN` and `ROLLBACK`, window functions, recursive queries,
     `EXPLAIN QUERY PLAN`, and the silent conversions of module 5. The phone's Python build was checked the same
     way: `json`, `datetime` (with offsets), `hashlib`, `hmac` and `unittest` import and work; Darsi adds a small
     `csv`.
   - **What it cannot do.** Python on the phone cannot reach SQLite: there is no `sqlite3`, and the two run apart.
     A step holds about a dozen lines and runs for three seconds. So a loader that reads files into a database, a
     crash followed by a restart, a count of SQLite's steps and folders of files are computer work.
   - **The proposal.** Lessons 1 to 3 of every module, and all of `data-s4`, run on the phone. Lesson 4's project
     has the draft's task as its full version, marked "needs a computer", and a phone-sized version that a learner
     without a computer can finish. In `data-m1` to `data-m3` the phone-sized version is guided and needs no
     Python. The capstone needs a computer.
   - **Later, if wanted:** a small `sqlite3` for the phone's Python, as was done for `csv`. Most projects could
     then run on the phone in parts. Cost: app work, not small, because the two runtimes are separate today.

   | Course | On the phone: sandbox and Labs | Needs a computer |
   |---|---|---|
   | `data-m1` | The lessons; labs `pipeline`, `stream`, `quality`, `clean`; checks on a short list of records; the contract itself | The check script over the full events file |
   | `data-m2` | CSV and JSON read in Python; `CREATE TABLE` with keys, `CHECK` and `STRICT`, and the rows SQLite refuses; labs `table`, `join`, `schema`, `sqlplay` | Loading the three files into a database from Python |
   | `data-m3` | Every query: `SELECT`, `GROUP BY`, joins, `WITH`; labs `sqlplay`, `join` | Parameters (`?`); the project's second check in Python |
   | `data-s4` | Everything, as today | Nothing |
   | `data-m4` | Paging over a list; validation with reasons; SHA-256; labs `hash`, `quality`, `pipeline` | Landing files in SQLite, one transaction for each; the loader and its tests |
   | `data-m5` | Conversions, timestamps to UTC, duplicates and named checks in SQL; the same conversions in Python; labs `table`, `clean`, `quality` | The two routes compared in one program; the project's tests over its data file |
   | `data-m6` | `INSERT OR IGNORE`, upsert, `ROLLBACK`; backoff in Python; lab `pipeline` | A crash and a restart; the ledger written from Python; the project's tests |
   | `data-m7` | A star query, `CREATE INDEX`, `EXPLAIN QUERY PLAN`; labs `formats`, `index` | Counting SQLite's steps; folders of partition files; the project's tests |
   | `data-m8` | Lineage with a recursive query; suppression with `HAVING`; retention with `DELETE`; the keyed token in Python; lab `footprint`; the diagram and the runbook, which are writing | `VACUUM` on a real file; the project's pipeline over its data file, with tests |
   | `data-capstone` | Reading the brief; planning the schema; the lineage and the runbook | The rest: Python 3.10 or newer with its SQLite, about 12 hours |

3. **Which capstone?** Recommended: one capstone under the id `data-capstone`. The draft's offline pipeline is
   the required core: it uses exactly what modules 4 to 8 teach and needs no network. Today's open-data report
   becomes its optional last milestone. The other choice keeps today's capstone unchanged, which costs nothing
   but leans on DuckDB, GitHub Actions and a network that no course teaches. Cost of the recommendation: three
   text parts, a new starter repository and check script; no narration.
4. **Start the university path with no Python?** Recommended: yes. `data-m1` says "No experience needed.", and
   `data-m2` and `data-m3` name only the course before them. In those three courses learners write SQL, read
   Python that is explained line by line, and do a guided project. A student can then begin Data engineering
   beside Programming, as in Cyber security and Optimization. Python is first written in `data-s4`, which names
   `code-m5`; modules 4 to 8 name `code-m7`. The other choice is the draft's own bar: Python with files and
   exceptions before module 1, which is `code-m6`, six Programming courses. Cost: none in narration; the three
   projects need a guided version written, and the draft's Python exercises for modules 1 to 3 move to the study
   guide in the kit.
5. **Send teachers to "Python for teachers" before `data-2-1`?** Recommended: yes, and say so in the summary. The
   course asks them to change five short programs, which is the point of "run it again next week". The other
   choice turns those five steps into guided ones, and the course then needs nothing from Programming. Cost: none.
6. **Let `data-s3` stand without a Programming course?** Recommended: yes. Nine tenths of it is SQL, which the
   course teaches itself; three Python steps become guided, and the search code is left to Programming. The other
   choice names "Functions, lists and algorithms" (`code-s3`), which itself needs "First Python": eight
   programming lessons before the first query. Cost: text only.
7. **Publish the teachers' ladder again when its pass is done?** Recommended: yes, at least `data-1-1` to
   `data-3-1` and Programming's `code-2-1`. Since 2026-11-05 only level-4 and university courses are live, so the
   live `data-4-1` and `data-u1` would name courses that are not there, and a teacher new to the subject has no
   way in. Cost: a seed run.
8. **Build labs for the lessons that have none?** Recommended: later. Six of the 32 new lessons have no fitting
   lab (paging, time zones, partitions, crash and resume, erasure, the runbook); their hands-on part is a worked
   case in the sandbox. `data-s1-1` teaches tally marks with a lab about names typed two ways. Three small labs
   would close most of it: tally marks that bundle in fives, pages read from a list that changes, and months of
   data in folders. Cost: three new Labs apps.

## Reference

Kept from the plan of 2026-10-29, and brought up to date where this plan changes something.

### How the courses talk about data

- **Privacy runs through every level.** Pupils' data is the most sensitive thing a school holds: level 1 (what is
  personal, who may open a sheet), level 2 (IDs in place of names), level 3 (reports that show only what their
  reader needs), level 4 (roles, small groups hidden, retention and deletion). Every dataset in the courses is
  made up.
- **No computer needed for the class activity.** Every teachers' lesson has an activity with paper, cards or the
  board (a table drawn on the board, a "human join" with number cards, a "human pipeline"); spreadsheets, Python
  and SQL come beside it for classes with devices. Students' primary course has no typing at all.
- **Code.** Python reads small CSV files with `import csv` (Darsi's own `csv` module: `reader`, `DictReader`,
  `writer`). SQL runs in real SQLite on the phone, from teachers' level 3, students' upper secondary and the
  university's second module. Steps stay at about a dozen lines. MicroPython's dictionaries don't keep insertion
  order, so programs print groups in a fixed or sorted order. Python on the phone cannot open a database: a step
  is Python or SQL, never both.
- **The cast** (the same five as the other tracks): Mr Joseph (computer studies) leads spreadsheets, Python and
  SQL; Ms Salma (maths) brings marks, averages and charts, and doubts every number; Ms Amina (primary) brings
  registers and young pupils; Mr Okafor (science) brings the weather club, the rain gauges and the river sensor;
  Dr Farah (education lecturer) leads privacy and governance. In the students' videos they are the students'
  teachers. In `data-u1` they are colleagues at a university.

### Facts the courses use

Keep the numbers the same in every course and in the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Tidy data:** one row per thing (a pupil, a day, a reading), one column per fact, one value per cell, one header
  row. No merged cells, no total rows inside the data, no two facts in one cell ("14 / 17"). Keep the raw sheet;
  summaries go on another sheet. In the `table` lab (Mr Bello's / الأستاذ سامي's marks out of 20, classes 5A and
  5B): filling the class down makes the computer count 4 pupils in 5B, not 3, because the Total row got a class
  too; with the marks split but the totals still in, the maths average is 20 out of 20; with the totals gone,
  about 13 (80 ÷ 6).
- **Kinds of values:** numbers (marks, minutes, mm of rain), categories (class, how you travel, P/A/L), dates
  (written one way: 2026-03-02), text (comments). A number stored as text can't be added up.
- **CSV:** plain text, one line per row, commas between values, the column names on the first line. Any spreadsheet
  opens it. Save Arabic as "CSV UTF-8", or the letters arrive as nonsense.
- **Formats (the `formats` lab):** a school of 420 pupils, 20 school days a month, 60 a term (25,200 records a
  term). JSON repeats every column's name in every record, so it is more than twice the size of CSV. A term as
  JSON over 2G (about 50 kbit/s) takes nearly 5 minutes; compressed, about 13 seconds; stored by columns and
  compressed, about 6 KB. 3G is about 1 Mbit/s, 4G about 8 Mbit/s on a busy network.
- **Summaries:** count, mean (average), median (the middle value once sorted), range, minimum and maximum. Marks
  11, 12, 13, 14, 15: mean 13, median 13. Type the 15 as 150: the mean jumps to 40 (out of 20!), the median stays
  13. Look at the chart before trusting a summary. Bars start at zero; a line chart shows change over time. In
  the `datalog` lab (a week of hourly soil readings, glitches of exactly 0 or 100): leaving the glitches out lifts
  the lowest reading from 0 to about 55, days 4 and 5 rise by about 3, and the median doesn't move.
- **A cut axis:** `data-1-1-3`'s hook uses 52 and 54 on an axis that starts at 50 (twice as tall). The `chartpick`
  lab, used by Data science, shows the same trick with pass rates of 70% and 74%: from 68 the second bar looks
  three times as tall.
- **Cleaning (the `clean` lab):** a class of 8, five days, 40 records typed by two teachers; the paper register
  says 34 of 40 (85%). Names counted as typed: 20; tidying spaces and capitals: 13 in English (15 in Arabic);
  matching the class list: 8. Removing repeats (after matching): 3 rows. Blank answers left out, counted absent or
  counted present move attendance between 80% and 90%. Fix names before looking for repeats; never fill blanks
  silently; write down what you changed. Arabic letters typed several ways: أ/إ/آ and ا، ة and ه، ى and ي.
- **Checks (the `quality` lab):** four school weather clubs (Hilltop, Riverside, Market, Lakeside / التل، ضفة
  النهر، السوق، البحيرة), five daily batches of rainfall in mm. Faults: the gauge's error code 999, a minus sign, a
  reading sent twice, an empty value, an empty station name, a misspelt one. Range 0 to 300 mm. With every check
  off the report has six stations and Riverside's average is above 200 mm; "Stop the batch" lets only the first
  day through; without the repeats check, Hilltop's average creeps from 14.6 to 15.8 mm. A check that finds
  nothing doesn't prove nothing is wrong.
- **Keys and joins (the `join` lab):** pupils 1–6; yesterday's maths marks for pupils 1, 2, 4 (twice: a resit), 5
  and 7. Inner join: 5 rows, Chidi and Musa (ليلى وكريم) disappear. Left join on pupils: 7 rows, `COUNT(*)` 7 but
  `COUNT(mark)` 5, the average unchanged. Only "all marks" shows the mark for pupil 7, who isn't on the list.
  Match by ID, never by name.
- **The school database (the `sqlplay` lab):** `pupils (id, name, class, age, town)`, 12 pupils in 5A, 5B and 6A;
  `marks (pupil_id, subject, mark)`, maths, science and English out of 20; Musa missed science, so 35 marks. Text
  goes in single quotes, and `=` on text is exact (`'6a'` is not `'6A'`). `COUNT(*)` counts rows, `COUNT(mark)`
  and `AVG(mark)` skip NULL.
- **One fact, one place (the `schema` lab):** pupils, classes (teacher and the teacher's phone) and marks. One wide
  table holds 32 repeated facts, two tables 8, three tables 0. A hurried phone change in the wide table leaves 5
  rows with the old number; when 6B's pupils leave, the wide table loses Mr Bello's number too. Primary key: what
  identifies a row; foreign key: a column that points to a row in another table.
- **Indexes (the `index` lab):** without an index a lookup reads about half the rows (500,000 for a million); a
  sorted index halves the search each look (about 20 for a million; each ten times more rows adds about 3 looks).
  An entry is 8 bytes; an index costs space and slows every insert. 1 to 100 always takes at most 7 halvings.
- **Pipelines (the `pipeline` lab):** extract, transform, load, every evening. Classes 5A (30 pupils, 2 away), 5B
  (32, 3 away) and 6A (28, 1 away): 84 of 90 present. A load that appends and is retried after failing writes two
  classes twice, and the report counts 152 pupils, not 90; "replace the day's rows" is idempotent. Retrying fixes
  passing faults (a dropped connection); bad data ("?" instead of P or A) needs a person.
- **Streams (the `stream` lab):** a river sensor, one reading a minute for three hours, a 2 m warning line. Stream
  with 1 reading in the average: three false alarms from splashes; 5: one (a boat's wake that lasts four
  minutes); 10: none, but the real alert is 5 minutes late; 30: 15 minutes late. Batches every 60 minutes: no
  false alarms, 3 wake-ups, nearly an hour late.
- **Privacy:** personal data is anything about a person who can be identified; sensitive data (health, disability,
  religion, ethnicity, family situation) needs the most care, and children's data most of all. Collect only what
  you need, for a stated purpose; let only the right people see it; keep it no longer than needed. Replacing
  names with numbers is pseudonymisation, not anonymisation: a key or a few other facts can bring the name back.
  In a well-known study, date of birth, sex and postcode alone picked out 87% of people in the United States.
  Don't publish a count or an average for a group of fewer than five pupils. Laws (examples): Kenya's Data
  Protection Act 2019, Nigeria's Data Protection Act 2023, Egypt's Personal Data Protection Law (Law 151 of
  2020), South Africa's POPIA. Retention periods come from the law and your ministry; where they say nothing,
  decide and write it down.
- **Backups:** 3-2-1: three copies, on two kinds of storage, one away from the school. A backup you have never
  restored is a hope, not a backup.
- **The `footprint` lab:** Lina, 14, six harmless-looking public posts; together they give away 6 risky facts
  (school, birthday, route home, pet's name, phone number, an empty house).
- **Today's capstone** (the optional last milestone in this plan): real public data about Egypt (World Bank school
  enrolment, Open-Meteo temperatures), DuckDB, quality checks, a report that answers three questions, a weekly
  refresh on GitHub Actions. About 15 hours in 5 milestones; the starter is `github.com/darsi-org/data-capstone`.

### The Darsi University draft

"Data Engineering Foundations" (UNI-ENG): eight modules of about 4 h 30 min each and a 12-hour capstone, in English
and Modern Standard Arabic, prepared on 2026-11-08. It is in `H:/Downloads/darsi-university-non-ai-materials.zip`,
folder `data-engineering`. Each module has a learner guide (three lessons with worked examples and real output,
"Check yourself", five exercises, a six-question quiz, a practical task with a rubric), four one-minute narration
scripts, instructor solutions, tested code and synthetic data. Read it; run nothing from it.

Its own limits, which the courses keep: everything is simulated on one computer (streams and "APIs" are local
files, a "crash" is an exception raised on purpose); a SQLite transaction is all-or-nothing in one file and is not
"exactly once" across systems; retention periods and the threshold of 5 are teaching values, not legal advice.

The numbers the hooks and worked cases use, as the draft's code prints them:

- **Module 1:** 26 enrolment events. At noon on 2 February the stream has seen 11, the nightly table 8. One event
  arrives three days late, and a published count of 7 becomes 8. Five records break the contract; 81% are valid
  against a target of 95%; 21 are loaded and 5 quarantined.
- **Module 2:** 40 students, 6 courses, 91 enrolments. In the flat file DE101 appears seven times, once with a
  different title. CY101 has no enrolments. Two bad test rows are refused.
- **Module 3:** in WR100 four attendance values are unknown: the average of the known values is 0.654, and 0.453
  if unknown is treated as zero. A join to submissions gives 32 rows for a course of 13 students.
- **Module 4:** 23 activity records behind a paged source; five batch files. Version 2 of one day fixes a record
  and breaks another with a score of 120; one file is truncated; schema 1.1 adds the field `attempt`. 16 records
  staged, 6 rejected.
- **Module 5:** 36 rows, 30 distinct events: 4 exact duplicates, 2 conflicts, 3 rejects, 27 published. A score of
  108 blocks publishing. `CAST('eighty' AS REAL)` gives 0, `'9' > '10'` is true, and 30 February becomes 2 March.
- **Module 6:** four daily files, 51 lines, 49 distinct events. A first file of 12 events loaded twice gives 24
  rows. A crash after 5 rows; after the crash 24 rows and 2 ledger entries, after the resume 49 and 4.
- **Module 7:** 200 students, 6 courses, 150 days, 20,000 events. A query for March opens 1 folder of 5 and reads
  4,000 rows. One student's rows: about 61,000 steps without an index, 1,500 with. A filter that keeps 42% gains
  less than twice. Three indexes: the file grows by about 140%, an insert costs about 80% more.
- **Module 8:** 240 events from 30 students. Retention: raw 30 days, pseudonymised 90 days, summaries 2 years. 138
  old raw rows deleted on 15 March; 33 small cells suppressed at a threshold of 5.
- **Capstone:** one fictional week, 1 to 5 March 2027; 8 delivered files from two producers, 263 raw lines, a file
  sent again, 2 lines that are not JSON. Rubric out of 100: model and SQL 25, ingestion and transformation 25,
  quality, idempotence and recovery 25, lineage, privacy and documentation 15, individual demonstration 10.

### Labs across the track

Teachers meet `table`, `formats`, `datalog` and `footprint` at level 1; `table` (with the Python view), `clean`,
`quality` and `join` at level 2; `schema`, `sqlplay` (rows, then groups) and `join` (as SQL) at level 3;
`pipeline`, `quality` (as SQL checks and what a failure does), `footprint` (re-identification) and `formats`
(archiving) at level 4. Students meet `clean`, `table`, `datalog` and `footprint` at primary (one or two taps
each, with the prompt saying exactly what to look at); `table`, `clean`, `quality` and `datalog` at lower
secondary; `schema`, `sqlplay`, `join` and `index` at upper secondary. At university: `pipeline`, `stream`,
`quality` and `clean` in module 1; `table`, `join`, `schema` and `sqlplay` in module 2; `sqlplay` and `join` in
module 3; `formats`, `pipeline`, `quality` and `stream` in `data-s4`; then `hash`, `quality`, `pipeline`,
`table`, `clean`, `formats`, `index` and `footprint` across modules 4 to 8. A lab met again comes with a harder
task, and the plan says which. Six module lessons have no lab (decision 8).

### The videos

Every lesson's storyboard is in Lesson Studio (`content/darsi/source/DATA-*.json`, with `data-*/ar-EG.json` and
`design.json`). Where a picture teaches better than a list, the scenes use the data pack's bodies: `sheet` (a
spreadsheet filling a formula down or cleaning names) in `data-2-1-1` to `data-2-1-3` and `data-s2-1` to
`data-s2-3`; `erd` (tables and their keys) in `data-3-1-1`, `data-s3-1` and `data-s4-1`; `query` (SQL run clause
by clause on a small table) through `data-3-1` and in `data-4-1-2` to `data-4-1-4`, `data-s3-2`, `data-s3-3` and
`data-s4-3`; `pipeline` (records moving through extract, transform and load, with retries, a quarantine or a
stream) in `data-2-1-3`, `data-4-1-1`, `data-4-1-2`, `data-s4-2`, `data-s4-3` and `data-s4-4`. The module courses
use the same four bodies: `erd` in module 2, `query` in modules 3, 5 and 7, `pipeline` in modules 1, 4, 6 and 8.
The primary course uses pictures, charts and short lists only.

### Code lines longer than the phone editor

The phone editor shows 44 characters. A scan of every code step on 2026-11-15 found longer lines in
`data-2-1-1` (the Parsons step), `data-2-1-2`, `data-2-1-3`, `data-2-1-4` (59), `data-3-1-4`, `data-4-1-1`,
`data-4-1-3` (54), `data-4-1-4`, `data-s2-2` (73), `data-s3-3`, and in most steps of `data-s4` (up to 70). Split
them in the same pass as the lesson: a list over two lines, a query with one clause on each line.

### Placement

`content/placement/data.json`: three questions per audience and level, from a cell that says "14 / 17" (level 1)
to idempotent loads and re-identification (level 4). `data-t3-1` already needs level 2's Python (marks read as
text, with a blank). The three university questions for students (JSON against CSV, an idempotent load, batch or
stream) test `data-s4` today. With ten courses at one level, the app needs a rule for where a university student
starts: `data-m1` unless they pass. The questions should then be written from the module quizzes, one each on a
join that doubles rows (module 3), a load run twice (module 6) and a small group in a published table (module 8),
so that passing really separates a student who can skip ahead.
