# The Data engineering track

Eight courses, `data` («هندسة البيانات»): four for teachers by expertise (Beginner to Advanced) and four for students by
school stage (primary, lower secondary, upper secondary, university). The levels, ids and the shape of a course and a
storyboard are in `docs/CURRICULUM.md`; the rules every course keeps, and how code steps work, are in `docs/CONTENT.md`.

## How the track builds

| Level | Teachers | Students |
|---|---|---|
| 1 | `data-1-1` **Data in your school**: tidy tables, collecting to answer a question, honest charts and summaries, pupils' data and privacy | `data-s1` **Collect and sort** (primary, 9–12): tally marks, tables, pictograms and bar charts, data about you. Unplugged, no typing |
| 2 | `data-2-1` **Cleaning and organising data**: tidy sheets, names that agree, blanks and repeats, one ID per pupil and joining sheets; Python with CSV files | `data-s2` **Spreadsheets and clean data** (lower secondary, 12–15): cells and formulas, messy names, blanks and impossible values, mean and median; first Python |
| 3 | `data-3-1` **Databases and SQL for school records**: tables and keys, SELECT/WHERE/ORDER BY, GROUP BY, JOIN and reports | `data-s3` **Databases and SQL** (upper secondary, 15–18): tables and keys, queries and summaries, joins, indexes and binary search; SQL and Python with tests |
| 4 | `data-4-1` **Pipelines, quality and governance**: automated reports that are safe to rerun, checks, who may see what, how long to keep it | `data-s4` **Data engineering** (university): schemas and formats, ETL in Python and SQL, quality tests and contracts, batch and stream |

- **Level 1** works with data people can see and touch: a register, a tally, a table on the board, a chart. **Level 2**
  makes it clean: the same facts typed the same way, gaps and repeats handled openly, sheets joined by an ID, and a
  first script that does it again next week. **Level 3** moves records into a database and asks it questions in SQL.
  **Level 4** runs data as a service the school depends on: automated, checked, governed, and in the students' course,
  engineered at scale.
- **Privacy runs through every level.** Pupils' data is the most sensitive thing a school holds: level 1 (what is
  personal, share the task not the child), level 2 (IDs instead of names), level 3 (reports that show only what their
  reader needs), level 4 (roles, small groups hidden, retention and deletion). Every dataset in the courses is made up.
- **No computer needed for the class activity.** Every teachers' lesson has an activity with paper, cards or the board
  (a table drawn on the board, a "human join" with number cards, a "human pipeline"); spreadsheets, Python and SQL come
  beside it for classes with devices. Students' s1 has no typing at all.
- **Code.** Python reads small CSV files with `import csv` (Darsi's own `csv` module: `reader`, `DictReader`, `writer`)
  from teachers' level 2 and students' s2; SQL runs in SQLite from teachers' level 3 and students' s3. Earlier lessons
  use "What does this print / return?" snippets, Parsons problems and fill-the-code. Steps stay at about a dozen
  lines (the binary search in s3 and the contract check in s4 are the longest, at 13 and 15).
  MicroPython's dictionaries don't keep insertion order, so programs print groups in a fixed or sorted order.
- **The cast** (the same five as the other tracks): Mr Joseph (computer studies, Kenya) leads spreadsheets, Python and
  SQL; Ms Salma (maths) brings marks, averages and charts; Ms Amina (primary, Nigeria) brings registers and young
  pupils; Mr Okafor (science, Nigeria) brings the weather club, the rain gauges and the river sensor; Dr Farah (education
  lecturer) leads privacy and governance. In the students' videos they are the students' teachers.

## Facts the courses use

Keep the numbers the same in every course and in the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Tidy data:** one row per thing (a pupil, a day, a reading), one column per fact, one value per cell, one header row.
  No merged cells, no total rows inside the data, no two facts in one cell ("14 / 17"). Keep the raw sheet; summaries go
  on another sheet. In the `table` lab (Mr Bello's / الأستاذ سامي's marks out of 20, classes 5A and 5B): filling the class
  down makes the computer count 4 pupils in 5B, not 3, because the Total row got a class too; with the marks split but
  the totals still in, the maths average is 20 out of 20; with the totals gone, about 13 (80 ÷ 6).
- **Kinds of values:** numbers (marks, minutes, mm of rain), categories (class, how you travel, P/A/L), dates (written
  one way: 2026-03-02), text (comments). A number stored as text can't be added up.
- **CSV:** plain text, one line per row, commas between values, the column names on the first line. Any spreadsheet
  opens it. Save Arabic as "CSV UTF-8", or the letters arrive as nonsense.
- **Formats (the `formats` lab):** a school of 420 pupils, 20 school days a month, 60 a term (25,200 records a term).
  JSON repeats every column's name in every record, so it is more than twice the size of CSV. A term as JSON over 2G
  (about 50 kbit/s) takes nearly 5 minutes; compressed, about 13 seconds; stored by columns and compressed, about 6 KB.
  3G is about 1 Mbit/s, 4G about 8 Mbit/s on a busy network.
- **Summaries:** count, mean (average), median (the middle value once sorted), range, minimum and maximum. Marks 11,
  12, 13, 14, 15: mean 13, median 13. Type the 15 as 150: the mean jumps to 40 (out of 20!), the median stays 13. Look
  at the chart before trusting a summary. Bars start at zero; a line chart shows change over time. In the `datalog` lab
  (a week of hourly soil readings, glitches of exactly 0 or 100): leaving the glitches out lifts the lowest reading from
  0 to about 55, days 4 and 5 rise by about 3, and the median doesn't move.
- **Cleaning (the `clean` lab):** a class of 8, five days, 40 records typed by two teachers; the paper register says 34
  of 40 (85%). Names counted as typed: 20; tidying spaces and capitals: 13 in English (15 in Arabic); matching the class
  list: 8. Removing repeats (after matching): 3 rows. Blank answers left out, counted absent or counted present move
  attendance between 80% and 90%. Fix names before looking for repeats; never fill blanks silently; write down what you
  changed. Arabic letters typed several ways: أ/إ/آ and ا، ة and ه، ى and ي.
- **Checks (the `quality` lab):** four school weather clubs (Hilltop, Riverside, Market, Lakeside / التل، ضفة النهر،
  السوق، البحيرة), five daily batches of rainfall in mm. Faults: the gauge's error code 999, a minus sign, a reading sent
  twice, an empty value, an empty station name, a misspelt one. Range 0 to 300 mm. With every check off the report has
  six stations and Riverside's average is above 200 mm; "Stop the batch" lets only the first day through; without the
  repeats check, Hilltop's average creeps from 14.6 to 15.8 mm. A check that finds nothing doesn't prove nothing is
  wrong.
- **Keys and joins (the `join` lab):** pupils 1–6; yesterday's maths marks for pupils 1, 2, 4 (twice: a resit), 5 and 7.
  Inner join: 5 rows, Chidi and Musa (ليلى وكريم) disappear. Left join on pupils: 7 rows, `COUNT(*)` 7 but
  `COUNT(mark)` 5, the average unchanged. Only "all marks" shows the mark for pupil 7, who isn't on the list. Match by ID,
  never by name.
- **The school database (the `sqlplay` lab):** `pupils (id, name, class, age, town)`, 12 pupils in 5A, 5B and 6A;
  `marks (pupil_id, subject, mark)`, maths, science and English out of 20; Musa missed science, so 35 marks. Text goes in
  single quotes, and `=` on text is exact (`'6a'` is not `'6A'`). `COUNT(*)` counts rows, `COUNT(mark)` and `AVG(mark)`
  skip NULL.
- **One fact, one place (the `schema` lab):** pupils, classes (teacher and the teacher's phone) and marks. One wide table
  holds 32 repeated facts, two tables 8, three tables 0. A hurried phone change in the wide table leaves 5 rows with the
  old number; when 6B's pupils leave, the wide table loses Mr Bello's number too. Primary key: what identifies a row;
  foreign key: a column that points to a row in another table.
- **Indexes (the `index` lab):** without an index a lookup reads about half the rows (500,000 for a million); a sorted
  index halves the search each look (about 20 for a million; each ten times more rows adds about 3 looks). An entry is 8
  bytes; an index costs space and slows every insert. 1 to 100 always takes at most 7 halvings.
- **Pipelines (the `pipeline` lab):** extract, transform, load, every evening. Classes 5A (30 pupils, 2 away), 5B (32,
  3 away) and 6A (28, 1 away): 84 of 90 present. A load that appends and is retried after failing writes two classes
  twice, and the report counts 152 pupils, not 90; "replace the day's rows" is idempotent. Retrying fixes passing faults
  (a dropped connection); bad data ("?" instead of P or A) needs a person.
- **Streams (the `stream` lab):** a river sensor, one reading a minute for three hours, a 2 m warning line. Stream with 1
  reading in the average: three false alarms from splashes; 5: one (a boat's wake that lasts four minutes); 10: none,
  but the real alert is 5 minutes late; 30: 15 minutes late. Batches every 60 minutes: no false alarms, 3 wake-ups,
  nearly an hour late.
- **Privacy:** personal data is anything about a person who can be identified; sensitive data (health, disability,
  religion, ethnicity, family situation) needs the most care, and children's data most of all. Collect only what you
  need, for a stated purpose; let only the right people see it; keep it no longer than needed. Replacing names with
  numbers is pseudonymisation, not anonymisation: a key or a few other facts can bring the name back. In a well-known
  study, date of birth, sex and postcode alone picked out 87% of people in the United States. Don't publish a count or
  an average for a group of fewer than five pupils. Laws (examples): Kenya's Data Protection Act 2019, Nigeria's Data
  Protection Act 2023, Egypt's Personal Data Protection Law (Law 151 of 2020), South Africa's POPIA. Retention periods
  come from the law and your ministry; where they say nothing, decide and write it down.
- **Backups:** 3-2-1: three copies, on two kinds of storage, one away from the school. A backup you have never restored
  is a hope, not a backup.
- **The `footprint` lab:** Lina, 14, six harmless-looking public posts; together they give away 6 risky facts (school,
  birthday, route home, pet's name, phone number, an empty house).

## `data-1-1` Data in your school (teachers, Beginner)

**البيانات في مدرستك.** Your school already runs on data: registers, mark books, the rain gauge. Keep it in tidy tables,
collect only what answers a question, read charts honestly, and protect your pupils' data. No code.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Data all around the school (البيانات من حولك في المدرسة) | Explain that data are recorded facts, and that a table keeps them in rows (one per pupil, day or reading) and columns (one per fact). Name the kinds of values in a school table: numbers, categories, dates and text. Tidy a sheet so a computer can count it. | `table` | DATA.1, DC.1.3 |
| 2 Ask a question, then collect (اسأل سؤالًا ثم اجمع البيانات) | Start from a question, and collect only the data that answers it. Design a collection sheet: clear columns, units, fixed codes (P, A, L) and dates written one way. Save a sheet as CSV, and choose formats that stay small on slow, paid connections. | `formats` | DATA.1, DC.1.3, DC.5.2 |
| 3 Charts and summaries that tell the truth (رسوم وملخّصات تقول الحقيقة) | Choose a chart for the question: bars to compare groups, a line for change over time. Summarise with the count, the mean and the median, and see why one wrong value moves the mean but hardly the median. Spot a chart that misleads. | `datalog` | DATA.1, DATA.2, DC.1.2 |
| 4 Pupils' data needs care (بيانات التلاميذ تحتاج إلى عناية) | Recognise personal and sensitive data about pupils. Collect only what you need, keep it where only the right people see it, and share the task, not the child. Explain consent and the basics of your country's data protection law. | `footprint` | DATA.4, DC.4.2 |

Projects: our class in a table (board, pupil numbers instead of names); a class survey that answers one question (tally,
then a spreadsheet saved as CSV); our class chart (bars from zero, mean and median); "fine, care or private" data cards.

## `data-2-1` Cleaning and organising data (teachers, Elementary)

**تنظيف البيانات وتنظيمها.** Turn messy registers and mark sheets into tidy tables you can trust: lay them out well, make
names agree, deal with blanks and repeats, and join sheets by pupil ID, by hand and with a few lines of Python you can
run again next week.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Tidy sheets a computer can use (جداول مرتّبة يفهمها الحاسوب) | Lay out a sheet a computer can use. Keep the raw data apart from summaries; use formulas and filters on the tidy copy. Read a CSV file in Python with `import csv`. | `table` | snippet, Parsons, Python: total and average from `marks.csv` | DATA.1, DATA.2, DC.3.4 |
| 2 Names that agree (أسماء متّفقة) | Find the ways one name gets typed (spaces, capitals, spellings, أ/ا، ة/ه، ى/ي). Tidy, then match to a master list; prevent it with drop-down lists. Clean text in Python with `strip()` and `lower()`. | `clean` | fill the code, Python: count the pupils after cleaning, bug | DATA.2, DC.3.4 |
| 3 Blanks, zeros and repeats (الفراغات والأصفار والتكرار) | Tell a blank from a zero and from "absent"; never fill blanks silently. Remove only true repeats, after names agree. Check each batch with simple rules and keep a cleaning log. | `quality` | Python: count the blanks; Python: find repeats with a set; bug | DATA.2, DC.1.2, DC.3.4 |
| 4 One ID per pupil: joining sheets (رقم لكل تلميذ: ربط الجداول) | Give every pupil one ID and match sheets by it, not by name. Join a register and a marks sheet with a lookup, and find who has no match. Do it in Python with a dictionary. | `join` | snippet, Python: a lookup with a dictionary, Parsons | DATA.1, DATA.2, DC.3.4 |

No-device activities: redraw a messy paper sheet as a tidy one; "one spelling, one list" (a class master list with
numbers); data detective (a paper rain table with hidden problems); the human join (number cards and mark cards).

## `data-3-1` Databases and SQL for school records (teachers, Intermediate)

**قواعد البيانات ولغة SQL لسجلات المدرسة.** Move school records from scattered sheets into a database: design tables with
keys, ask questions in SQL, summarise with GROUP BY, and join tables for reports that show only what each reader needs.
Every SQL step runs in real SQLite on the phone.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 From sheets to a database (من الجداول إلى قاعدة البيانات) | Explain what a database adds to a spreadsheet. Store each fact once, in tables linked by keys. Read a CREATE TABLE and run a first SELECT. | `schema` | Parsons (CREATE TABLE), SQL: SELECT, snippet | DATA.3, DATA.1 |
| 2 Asking questions: SELECT, WHERE, ORDER BY (طرح الأسئلة: SELECT وWHERE وORDER BY) | Pick columns with SELECT and rows with WHERE. Sort with ORDER BY and keep the top rows with LIMIT. Check an answer against what you know. | `sqlplay` | SQL: WHERE with AND; SQL: ORDER BY … LIMIT; fill the code; bug | DATA.3, DC.1.1 |
| 3 Counts and averages: GROUP BY (العدّ والمتوسطات: GROUP BY) | Summarise with COUNT, AVG, MIN, MAX and ROUND. One row per group with GROUP BY; HAVING to keep some groups. Explain NULL, and check summaries for glitches. | `datalog` | SQL: GROUP BY; SQL: HAVING; snippet (COUNT(*) and COUNT(mark)) | DATA.3, DATA.2, DC.1.2 |
| 4 Joining tables for reports (ربط الجداول لإعداد التقارير) | Join tables with JOIN … ON. Choose an inner or a left join by the question; find pupils with no marks. Write a report that shows only what its reader needs. | `join` | SQL: JOIN; SQL: LEFT JOIN … IS NULL; Parsons | DATA.3, DATA.4 |

`datalog` in lesson 3 because its daily averages are a GROUP BY day, and its glitches show why MIN and MAX come before
AVG. No-device activities: splitting a wide table on the board, the "human database" (pupils as rows), grouping by birth
month, a report for one reader.

## `data-4-1` Pipelines, quality and governance (teachers, Advanced)

**خطوط البيانات والجودة والحوكمة.** Lead your school's data: automate reports with pipelines that are safe to run again,
build checks that catch problems, decide who may see what, and set how long records are kept and how they are deleted.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Automate the weekly report (أتمتة التقرير الأسبوعي) | Describe a pipeline: extract, transform, load, on a schedule. Make every run safe to repeat, and tell passing faults from bad data. Write a Python step that counts each class's attendance. | `pipeline` | Python: present per class from `register.csv`; Parsons | DATA.4, DATA.2, DC.3.4 |
| 2 Checks that catch problems (فحوص تكشف المشكلات) | Write checks: in range, not empty, unique, allowed values. Decide what a failed check does and who fixes the source. Write checks as SQL queries that should return no rows. | `quality` | SQL: rows out of range; SQL: repeats with HAVING; bug | DATA.2, DATA.4, DC.1.2 |
| 3 Who may see what (مَن يرى ماذا) | Give each role only the data it needs. Share summaries, pseudonymise IDs and hide groups of fewer than five. Show how combining harmless facts can identify a child. | `footprint` | SQL: averages per class, small groups hidden; snippet | DATA.4, DC.4.2 |
| 4 Keep, archive, delete (احتفظ وأرشِف واحذف) | Set how long each kind of record is kept, and why. Back up with 3-2-1, archive in open formats and test a restore. Delete on time, and write a one-page school data policy. | `formats` | SQL: records past their date; fill the code | DATA.4, DC.4.2, DC.1.3 |

Projects are led with a class or the school's data team: a map of one report's pipeline, five checks run on a week of
data, an access table (records × roles), a one-page data policy for the head teacher.

## `data-s1` Collect and sort (students, primary, 9–12)

**اجمع ورتّب.** Be a data detective: ask a question, collect answers with tally marks, sort them into tables, draw charts
that tell the truth, and keep data about you safe. Short videos (about 2:30), short sentences, everything done on paper,
with cards or by tapping; no typing and no code.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Ask, count, tally (اسأل وعُدّ وسجّل) | Say what data is: facts we collect to answer a question. Collect answers with tally marks in groups of five. Count carefully, and see why one name written two ways gives the wrong count. | `clean` | DATA.1, DC.1.3 |
| 2 Sort it into a table (رتّبها في جدول) | Read a table: rows go across, columns go down, each cell holds one fact. Sort data into a table with a heading for every column. Fix a table so a computer counts it right. | `table` | DATA.1, DC.1.3 |
| 3 Draw it: charts (ارسمها: الرسوم البيانية) | Draw a pictogram and a bar chart from a tally or a table. Read a bar chart: tallest, shortest, how many more. Check a chart is fair: bars start at zero and every value is shown. | `datalog` | DATA.1, DC.1.2 |
| 4 Data about you (بيانات عنك) | Name data about you. Decide what's fine to share, what to share with care and what to keep private. Ask a trusted adult before giving your details to a website, an app or a stranger. | `footprint` | DATA.4, DC.4.2 |

The labs are used for one or two taps each, with the prompt saying exactly what to look at (`clean`: the count of names
going from 20 to 8; `table`: the computer's count of pupils; `datalog`: the red dots that can't be right).

## `data-s2` Spreadsheets and clean data (students, lower secondary, 12–15)

**جداول البيانات والبيانات النظيفة.** Use a spreadsheet well: cells and formulas, names that match, blanks and impossible
values, and summaries that tell the truth, with your first lines of Python.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Cells, rows and formulas (الخانات والصفوف والصيغ) | Find your way in a spreadsheet: columns, rows, cells like B2, ranges like B2:B9. Use SUM, AVERAGE and COUNTIF on a tidy table. Do the same total and average in Python with a list. | `table` | snippet, fill the code, Python: a total and an average | DATA.1, DC.3.4 |
| 2 Messy names, wrong counts (أسماء فوضوية وأعداد خاطئة) | Spot spaces, capitals and spellings that break counts. Clean step by step: tidy, then match a list. Clean text in Python with `strip()` and `lower()`. | `clean` | fill the code, Parsons, Python: count the votes after cleaning | DATA.2, DC.3.4 |
| 3 Blanks, repeats and impossible values (الفراغات والتكرار والقيم المستحيلة) | Tell a blank from a zero; never guess. Find repeats and impossible values. Write a Python check that counts blanks and flags values out of range. | `quality` | Python: count the blanks; bug; Python: flag marks out of range | DATA.2, DC.1.2, DC.3.4 |
| 4 Summaries that tell the truth (ملخّصات تقول الحقيقة) | Work out the mean, the median and the range, and choose the one that fits. See how one wrong value drags the mean. Make an honest chart. | `datalog` | snippet, Python: mean and median | DATA.2, DATA.1, DC.1.2 |

## `data-s3` Databases and SQL (students, upper secondary, 15–18)

**قواعد البيانات ولغة SQL.** Learn how real apps keep their data: design tables with keys, ask questions in SQL, join
tables, and see why an index finds one row among millions, with SQL and Python you run and test on your phone.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Tables, keys and types (الجداول والمفاتيح وأنواع البيانات) | Explain why apps use a database. Design tables with a primary key, typed columns and foreign keys. Write a CREATE TABLE and a first SELECT. | `schema` | Parsons (CREATE TABLE), SQL: SELECT … WHERE, snippet | DATA.3, DATA.1, DC.3.4 |
| 2 Questions in SQL (أسئلة بلغة SQL) | Query with SELECT, WHERE, ORDER BY and LIMIT. Summarise with COUNT, AVG and GROUP BY; explain NULL. Do the same count in Python with a dictionary. | `sqlplay` | SQL: WHERE + ORDER BY; SQL: GROUP BY; Python: count per class from a CSV | DATA.3, DC.3.4 |
| 3 Joining tables (ربط الجداول) | Join tables with JOIN … ON. Keep every row with LEFT JOIN and find gaps with IS NULL. Judge a result: rows missing or counted twice? | `join` | SQL: JOIN; SQL: LEFT JOIN … IS NULL; bug | DATA.3, DC.1.2 |
| 4 Fast answers: indexes (إجابات سريعة: الفهارس) | Explain why reading every row gets slow, and how a sorted index halves the search. Count the looks of a linear and a binary search in Python, with tests. Decide which columns to index. | `index` | Python: linear search; Python: binary search; snippet | DATA.3, DC.3.4, DC.5.1 |

## `data-s4` Data engineering (students, university)

**هندسة البيانات.** How data moves at scale: design schemas and pick formats, build ETL in Python and SQL that is safe to
rerun, test data quality against contracts, and choose between batch and stream processing.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Schemas and formats (المخططات والصيغ) | Choose a schema for the job: normalised tables for apps, a star schema for reports. Compare row and column formats and compression by size and speed. Parse and type a CSV in Python, and count the rows that break the schema. | `formats` | Python: type-check a CSV; snippet; Parsons | DATA.1, DATA.3, DC.3.4 |
| 2 ETL with Python and SQL (الاستخراج والتحويل والتحميل بـPython وSQL) | Build extract, transform, load. Make loads idempotent (delete-then-insert, upsert), so a rerun never double-counts. Load incrementally and log every run. | `pipeline` | Python: transform registers; SQL: an idempotent load; Parsons | DATA.4, DATA.3, DC.3.4 |
| 3 Data quality and contracts (جودة البيانات والعقود) | Write quality tests as code: types, nulls, ranges, uniqueness, references, freshness. Agree a data contract between producers and users. Decide what a failed test does. | `quality` | SQL: orphan rows; Python: validate rows against a contract; bug | DATA.2, DATA.4, DC.1.2 |
| 4 Batch and stream (الدفعات والتدفّق) | Explain batch and stream processing and their trade-offs. Use a moving window to tame noise, and see how it delays alerts. Choose batch, stream or both for real systems. | `stream` | Python: a moving average alert; snippet | DATA.4, DATA.2, DC.5.2 |

## Labs across the track

Teachers meet `table`, `formats`, `datalog` and `footprint` at level 1; `table` (with the Python view), `clean`,
`quality` and `join` at level 2; `schema`, `sqlplay`, `datalog` (as GROUP BY) and `join` (as SQL) at level 3;
`pipeline`, `quality` (as SQL checks and their actions), `footprint` (re-identification) and `formats` (archiving) at
level 4. Students meet `clean`, `table`, `datalog` and `footprint` in s1 (one or two taps each); `table`, `clean`,
`quality` and `datalog` in s2; `schema`, `sqlplay`, `join` and `index` in s3; `formats`, `pipeline`, `quality` and
`stream` in s4. A lab met again at a higher level comes with a harder task.

## The videos

Every lesson's storyboard is in Lesson Studio (`content/darsi/source/DATA-*.json`, with `data-*/ar-EG.json` and
`design.json`). Where a picture teaches better than a list, the scenes use the data pack's bodies: `sheet` (a spreadsheet
filling a formula down or cleaning names) in data-2-1-1 to 2-1-3 and s2-1 to s2-3; `erd` (tables and their keys) in
data-3-1-1, s3-1 and s4-1; `query` (SQL run clause by clause on a small table) through data-3-1 and in data-4-1-2 to
4-1-4, s3-2, s3-3 and s4-3; `pipeline` (records moving through extract, transform and load, with retries, a quarantine
or a stream) in data-2-1-3, data-4-1-1, 4-1-2, s4-2, s4-3 and s4-4. Students' s1 uses pictures, charts and short lists
only.
