# Data science: the curriculum

**Status: approved by the user on 2026-11-15.** This track never had a plan in this folder: the only one was
the authoring plan of October 2026 (`H:\htdocs\lessonstudio\out\ds-work\PLAN.md`), which this replaces. The track id is
`data-science`; its courses are `ds-*`. What all tracks share (the Python ladder, the home of each shared idea, the
university path) is in `docs/CURRICULUM.md`; how to write a course is in the `darsi-course` skill.

## The track in one look

A teacher who finishes the track can answer a school question with data, say how sure the answer is, build and judge
a simple predictor, and lead colleagues to decide with a fair trial. A student at school meets the subject at their
own age, by hand first. A university student follows eight courses from a first question to a report anyone can
rebuild, then runs a study of their own. The track never assumes another track: the Beginner course and the primary
course use no Python at all, the first university course only reads it, and every course says the school maths it
expects.

- **Track line (en):** Starts from zero, by hand: a question, a fair number and an honest chart. Python comes later: teachers write it from Intermediate, students from upper secondary and at university.
- **Track line (ar):** يبدأ من الصفر، بالورقة والقلم: سؤال، ورقم منصف، ورسم يقول الحقيقة. تأتي Python لاحقًا: يكتبها المعلّمون من المستوى المتوسط، والطلاب من المرحلة الثانوية وفي الجامعة.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `ds-1-1` Data science in the classroom | turn a school worry into a question you can count, report a fair middle with its spread, and read a chart or a claim without being fooled | No experience needed. | 4 standard passes |
| 2 Elementary | `ds-2-1` Exploring data | explain what the shape, the spread and a relationship in a table show, and take a new table through one routine | `ds-1-1` | 4 standard passes |
| 3 Intermediate | `ds-3-1` Models and predictions | build a simple predictor from school data, and judge it by its errors on pupils it has not seen | `ds-2-1`, `code-2-1` | 1 rewrite, 3 standard passes |
| 4 Advanced | `ds-4-1` Leading data science at school | design a survey, a fairness check and a fair trial, and lead colleagues to decide with them | `ds-3-1` | 1 rewrite, 3 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `ds-s1` Data detectives | turn a guess into a count, find the middle of a group, read a chart, and ask who was asked | No experience needed. | 4 rewrites |
| Lower secondary (12–15) | `ds-s2` Patterns in data | say what is typical, describe a shape, see whether two things go together, and explore a small table | No experience needed. | 2 rewrites, 2 standard passes |
| Upper secondary (15–18) | `ds-s3` Predict with data | describe data, fit a line, test it on data it has not seen, and judge a yes-or-no prediction, in code | `code-s2` First Python | 3 rewrites, 1 standard pass |
| University, start | `ds-m1` Questions, sources and measurement (new) | say what a dataset can and cannot answer, before any calculation | No experience needed. | 4 new lessons |
| University | `ds-m2` Cleaning data, step by step (new) | turn messy files into one table, with a log of every step | `ds-m1`, `code-m5` | 4 new lessons |
| University | `ds-m3` Distributions and honest charts (new) | describe and compare distributions, and expose a chart that misleads | `ds-m2`, `code-m5` | 4 new lessons |
| University | `ds-m4` Samples, confounding and experiments (new) | tell chance from bias and association from cause, and design a fair study | `ds-m3`, `code-m5` | 4 new lessons |
| University | `ds-m5` The bootstrap and confidence intervals (new) | put an honest interval on an estimate, and say what it does not mean | `ds-m4`, `code-m5` | 4 new lessons |
| University | `ds-m6` Chance, tests and many comparisons (new) | test whether chance alone could explain a difference, without fooling yourself | `ds-m5`, `code-m5` | 4 new lessons |
| University | `ds-m7` Prediction and honest evaluation (new) | predict with a line and score it on held-out data, against a baseline, without leakage | `ds-m6`, `code-m5` | 4 new lessons |
| University | `ds-m8` Reproducible, fair and clear reports (new) | make an analysis others can rebuild, check it group by group, and report only what it shows | `ds-m7`, `code-m5` | 4 new lessons |
| University, capstone | `ds-capstone` An original study of a small dataset | ask, clean, describe, infer, predict and report, so that anyone can rebuild every number | `ds-m8`, `code-m7` | text only |

`ds-m1` needs no Python, so a student can begin it beside Programming. From `ds-m2` on, code is written, and each
course names `code-m5` (lists and dictionaries); the computer version of each project also reads files (`code-m6`).
Today's `ds-s4` “Data science and society” is not on this path: see “What changes, and why”, point 3.

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `ds-u1` Teaching statistical learning at university | teach uncertainty, validation and causal reasoning rigorously, in a module whose outcomes, projects and rubric line up | `ds-3-1`, or you already teach the subject | 4 standard passes |

A lecturer who is new to the subject climbs the teachers' ladder to Intermediate first.

## What changes, and why

1. **The students' school courses stop being copies of the teachers' courses.** Today every students' lesson has the
   same title and the same video chapters as a teachers' lesson, and 48–59% of the text is shared (0–11% in every
   other track). The students' storyboards are the teachers' storyboards with one or two scenes swapped. So `ds-s1`
   gives 9-year-olds the teachers' Beginner course ("Data engineers collect and store the data…", hidden groups in
   averages, "pupils' data"), and nothing in the track is written for a 13- or a 16-year-old. Now each stage has a
   starting course written for its age: primary by hand (a tally, the middle one, a picture of numbers, "is that
   fair?"); lower secondary with the mean, a shape and a scatter of dots; upper secondary with code that measures.
2. **University students get a real path: eight courses and a capstone, `ds-m1` … `ds-m8`.** On 2026-11-15 the user
   supplied the Darsi University draft “Data Science, Statistics and Evidence”: eight modules of three lessons, each
   with a practical task, and a capstone, in English and Arabic. One module becomes one course of four lessons: the
   module's three lessons, then a fourth built on its practical task, whose project is the task. A Darsi lesson has
   one outcome, one three-minute video and at most four new terms, so each lesson takes the module lesson's main
   outcome; the second outcome goes to the reading and the practice. No module needed splitting. The two tightest are
   `ds-m3-1` (the histogram waits for lesson 2) and `ds-m6-1` (four new terms in one chain of reasoning). The videos
   are new: the drafts' narration is a one-minute summary per lesson, with no hook. The module quiz and “Check
   yourself” questions feed each unit check, and the full learner guide ships in the kit as a study guide.
   `ds-m1` is the starting course: the subject from zero, with no Python. Its code is read and completed, never
   written from a blank editor, as in the first university course of every track. The drafts ask for Python
   (functions, lists and dictionaries) before module 1: that bar now starts at `ds-m2`.
3. **`ds-s4` leaves the university path.** It is published today, and it is the teachers' Advanced course in school
   words ("all eight hundred pupils", "present your plan to your class"). The eight courses teach its ground
   properly: samples in `ds-m4`, uncertainty in `ds-m5`, errors by group in `ds-m8`. Only k-means is not in them.
   Proposal: unpublish `ds-s4` when `ds-m1` is published, and keep it as a draft with its id. Its learners keep
   their progress. Its four lessons are pitched at school level, so they could come back later as a second course
   for upper secondary; that is not planned here.
4. **The capstone becomes the study the eight courses prepare for.** Today's `ds-capstone` (“what predicts a
   struggling student?”) asks for 5-fold cross-validation of three models on a public dataset about students, a
   fairness fix, GitHub, Codespaces and a release. The eight courses teach neither cross-validation nor a fairness
   fix, and they use made-up data on purpose. The drafts' capstone fits them exactly: seat counts in six study rooms of a made-up
   library, three questions (describe, infer, predict), a cleaning log, a script with tests and an accessible
   report. It needs only Python's standard library and works offline. It keeps the id `ds-capstone` and the app's
   three parts (description, starter, submission), and moves from level 3 (upper secondary) to the end of the
   university path.
5. **Python follows the ladder.** No Python in the Beginner course or at primary: the four “What does this program
   print?” steps of `ds-1-1` go, and the work is done by hand and in the labs. Teachers read and complete code at
   level 2 and write it from level 3. `ds-2-1-4` needs `def`, `sorted`, a negative index and a tuple today: the step
   is lowered, so no course in this track needs the new `code-2-2`. Students' courses use lists, which “First
   Python” does not teach: `ds-s3` explains them in its first lesson. Every course also says the school maths it
   expects:

   | Course | Python | School maths it expects |
   |---|---|---|
   | `ds-1-1` | none | adding and dividing |
   | `ds-2-1` | read and completed; taught here | a square and a square root, explained at first use |
   | `ds-3-1`, `ds-4-1` | written: rung 1 and lists (`code-2-1`) | a straight-line graph; a percentage |
   | `ds-u1` | none | what a lecturer in the subject has |
   | `ds-s1` | none | counting, adding and taking away |
   | `ds-s2` | read and completed; taught here | dividing; plotting a point on a grid |
   | `ds-s3` | written: rung 1 (`code-s2`); lists taught here | the mean; a percentage; a straight-line graph (y = mx + c) |
   | `ds-m1` | read and completed; taught here | ratios and simple algebra (a speed from a distance and a time) |
   | `ds-m2` | written: rung 2 (`code-m5`); the computer version of the project reads files (`code-m6`) | a percentage |
   | `ds-m3` to `ds-m8` | written: rung 2 (`code-m5`); `random`, `hashlib` and a `lambda` are explained where first used; files only in the computer versions (`code-m6`) | the mean, squares and square roots (`ds-m3`); a weighted average (`ds-m4`); percentiles (`ds-m5`); counting the ways to choose 3 of 6, and a power (`ds-m6`); a straight line y = a + bx (`ds-m7`) |
   | `ds-capstone` | rung 3 with tests (`code-m7`), on a computer | as `ds-m8` |

6. **Shared ideas have one home, and this track is the one that measures.** Today several lessons repeat the AI and
   Data engineering tracks without saying so.
   - `ds-3-1-2` repeats `ai-3-1-3` (train and test, overfitting, the same lab). It is rewritten: a two-sentence
     reminder, the home named, then the error counted in marks on the training rows and on the test rows.
   - `ds-4-1-3` repeats `ai-4-1-1` (the same reading app, the same village pupils, the same lab). It is rewritten
     with a case of its own: miss rates and false-alarm rates by group, and whether a gap is bigger than the wobble
     of a small group.
   - `ds-3-1-4` shares the two kinds of mistake with `ai-3-1-3`. It keeps its content: here they are counted from
     two lists and traded with a threshold. One line names the home.
   - `ds-s3-2/3/4` repeat `ai-s3` (train and test, nearest neighbours, fairness by group, the same three labs).
     Nearest neighbours leaves `ds-s3`: its home for students is `ai-s3-2`. `ds-s3` is a starting course, so it
     teaches train and test itself, with its own example, and computes the error.
   - `ds-1-1-2/3` repeat `data-1-1-3` (mean, median, honest charts). A Beginner course stands alone, so they stay,
     with one line: “If you have done “Data in your school”, this will be familiar: here you choose the fair number
     and report its spread.” The same line goes in `ds-s2-1` for `data-s2-4`.
   - Nearest neighbours has no teachers' lesson in the AI track. `ds-3-1-3` is its home for teachers.
7. **Pupils' data: this track keeps its own part.** The home is `cyber-3-1-1`. Data science adds one rule: a result
   for a small group is a result about named children. `ds-1-1-4` teaches it with its own example, and `ds-4-1-3`
   applies it to what a school publishes. For university students, `ds-m1-2` teaches consent and collecting only
   what the question needs, and `ds-m8-2` says what changes when groups are groups of people.
8. **`ds-u1` is checked against what the eight courses teach.** It lines up in part. Lesson 1 (standard error, the
   bootstrap, what 95% means) matches `ds-m5`. Lesson 4 (reproducible work, projects, a rubric) matches `ds-m8` and
   the capstone. Lesson 2 teaches k-fold cross-validation and the bias–variance split: the students learn a
   training, validation and test split with a mean baseline, and leakage (`ds-m7`). Lesson 3 teaches causal
   diagrams and difference-in-differences: the students learn confounding by comparing like with like, and
   randomised experiments (`ds-m4`). Both lessons stay, since a lecturer needs more than the students, but each now
   starts from the students' case and says which part goes beyond their course. Nothing in `ds-u1` covers how to
   teach null models, p-values and many comparisons (`ds-m6`), or sources, consent and cleaning (`ds-m1`, `ds-m2`).
   A second lecturers' course could: see the decisions.
9. **Every video gets the standard pass.** None of the 36 videos has the promise line or names the next lesson. 23
   hooks end on a statement, often the answer ("So we drew their shape."). 30 first teaching scenes are a
   definition. Ten of the sixteen students' hooks are told by the narrator, which the standard never allows. All
   hooks below end on a question the lesson answers.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| A question you can count; ask, collect, explore, explain, ask again | `ds-1-1-1` | every course; `ds-2-1-4` |
| Mean, median, mode, range | `ds-1-1-2` | `ds-2-1-1`, `ds-2-1-2` |
| Bar, line and scatter charts; an axis that exaggerates | `ds-1-1-3` | `ds-2-1-1`, `ds-2-1-3` |
| Going together is not a cause; a hidden group; a small group | `ds-1-1-4` | `ds-2-1-3`, `ds-4-1-3`, `ds-4-1-4` |
| Share the class picture, never one child (home: `cyber-3-1-1`) | `ds-1-1-4` | `ds-4-1-3` |
| Reading Python: a list, a loop over it, `sum`, `len` | `ds-2-1-1` (shown and explained) | `ds-2-1-2` to `ds-2-1-4`; written from `ds-3-1`, after `code-2-1` |
| Distribution, histogram, skew | `ds-2-1-1` | `ds-2-1-4`, `ds-4-1-1` |
| Standard deviation, outlier, the middle half | `ds-2-1-2` | `ds-2-1-4`, `ds-4-1-1` |
| Scatter plot, the correlation coefficient r | `ds-2-1-3` | `ds-3-1-1` |
| A finding with a number and its source; missing values | `ds-2-1-4` | `ds-4-1-4` |
| Model, line of best fit, slope | `ds-3-1-1` | `ds-3-1-2` |
| Training and test sets, average error (overfitting: home `ai-3-1-3`) | `ds-3-1-2` | `ds-3-1-3`, `ds-3-1-4`, `ds-u1-2` |
| Classification, distance, k | `ds-3-1-3` | `ds-3-1-4`, `ds-4-1-2` |
| Accuracy, false alarm and miss, baseline, threshold | `ds-3-1-4` | `ds-4-1-3` |
| Population, sample, margin of error | `ds-4-1-1` | `ds-4-1-3`, `ds-4-1-4`, `ds-u1-1` |
| Clustering with k-means | `ds-4-1-2` | |
| Error rates by group (fairness: home `ai-4-1-1`) | `ds-4-1-3` | `ds-4-1-4` |
| Fair trial, comparison group, effect | `ds-4-1-4` | `ds-u1-3` |

Students (each stage starts again from the first row, at its own depth):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A question you can count | `ds-s1-1` | `ds-s2-4` | | `ds-m1-1` |
| Where the data came from; who was asked | `ds-s1-4` | | | `ds-m1-2`, `ds-m4-1` |
| The middle value and the most common | `ds-s1-2` | `ds-s2-1` | `ds-s3-1` | `ds-m3-1` |
| The mean | | `ds-s2-1` | school maths; reminder in `ds-s3-1` | school maths; reminder in `ds-m3-1` |
| Spread: the range | `ds-s1-2` | `ds-s2-1` | | |
| Spread: the standard deviation | | | `ds-s3-1` | `ds-m3-1` |
| Pictogram and bar chart; a picture that exaggerates | `ds-s1-3` | | | `ds-m3-3` |
| Histogram and shape; an outlier | | `ds-s2-2` | `ds-s3-1` | `ds-m3-2` |
| Scatter plot; going together is not a cause | | `ds-s2-3` | `ds-s3-2` | `ds-m4-2` |
| Line of best fit and slope | | | `ds-s3-2` | `ds-m7-1` |
| Training and test sets; overfitting; average error | | | `ds-s3-3` | `ds-m7-2` |
| Accuracy and the two kinds of mistake | | | `ds-s3-4` | |
| Reading Python: a list, a loop, `sum`, `len` | | `ds-s2-1` (guided) | `ds-s3-1` (written) | `ds-m1` (guided); written from `ds-m2`, after `code-m5` |
| Units of observation, consent, measurement | | | | `ds-m1` |
| Types, missing values, duplicates, joins, a cleaning log | | | | `ds-m2` |
| Sample and bias; confounder; random assignment | | | | `ds-m4` |
| Standard error, bootstrap, confidence interval | | | | `ds-m5` |
| Null model, p-value, many comparisons | | | | `ds-m6` |
| Residual, baseline, leakage, validation set | | | | `ds-m7` |
| Fingerprint and seeds; errors by group; calibrated claims | | | | `ds-m8` |

## The courses

### `ds-1-1` Data science in the classroom
- **For:** teachers, level 1 Beginner
- **Status:** revise
- **After it, you can:** turn a school worry into a question you can count; report a fair middle together with its spread; pick a chart that fits the question and spot one that exaggerates; name what else could explain a claim, and share results so no child can be picked out.
- **Before this:** No experience needed.
- **Python:** none
- **The path:** ask a question you can count, sum a class up in one fair number, show it in an honest picture, then read other people's numbers with care.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | What is data science? | tell a question you can count from one you can't, and name the steps from a question to an answer | Every Monday, half my class arrives late. The head teacher asked me why. I guessed: they are tired after the weekend. But how could I find out if my guess was right? | data science; measurable question; pattern | table | S |
| 2 | The middle and the spread | tell the mean, the median and the mode apart, say which one a single extreme mark pulls, and report a middle with its range | A parent asked me: how did the class do in maths? I had nine marks in front of me. I could not read out all nine. Which one number would be fair to the whole class? | mean; median; mode; range | spread | S |
| 3 | Charts that tell the truth | pick the chart that fits a question, and spot an axis that makes a small change look big | My pupils drew our rainfall as a pie chart. Twelve slices, one for each month. Every number was right. So why could nobody see when the rains came? | bar chart; line chart; scatter chart | chartpick | S |
| 4 | Reading data safely | name what else could explain a claim made with numbers, and share results so that no child can be picked out | A visitor looked at our marks. He said the morning class does better, so afternoon lessons should stop. The averages agreed with him. What were the averages not telling us? | hidden group; cause; small group | bias | S |

- **Unit check:** unchanged (it has no code).
- **Changes:** the four “What does this program print?” steps go (`p4` in lesson 1, `p3` in lessons 2 to 4), and so does the key term “Reading Python”. Each becomes the same thinking by hand: count the Mondays in a week of late arrivals; find the mean and the median of nine marks; read the second bar of a tally chart; work out a class average from marks with pupil numbers. Lesson 2's video opens with three definitions in a row: it first shows nine marks on a line, then names each middle. Lessons 2 and 3 keep the mean, the median and honest axes, with the one line that names `data-1-1-3`. Lesson 4 keeps three questions for any claim (who is in each group, what else could explain it, how many) and data science's own part of pupils' privacy. Hooks are told by Ms Amina (1, 2), Mr Okafor (3) and Dr Farah (4). The summary's last line becomes “No experience needed.”

### `ds-2-1` Exploring data
- **For:** teachers, level 2 Elementary
- **Status:** keep
- **After it, you can:** explain what the shape of a distribution tells you; explain what a standard deviation measures, and trace the rule that flags an outlier; read a scatter plot and predict its r; take a new table through five questions and write findings with numbers.
- **Before this:** `ds-1-1` “Data science in the classroom” (Data science, level 1).
- **Python:** shown and explained (taught here: a list, a loop over it, `sum` and `len`; every step is guided)
- **The path:** see the shape, measure the spread, put two measurements together, then take any new table through one routine.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Distributions and histograms | build a histogram by hand, predict how a new bin width changes it, and name its shape | We measured sixty pupils’ heights for the health check. Sixty numbers, in one long list. Nobody could see anything in them. What would those numbers show, if we could see them all at once? | distribution; histogram; symmetric; skewed | histogram | S |
| 2 | Standard deviation and outliers | explain what a standard deviation measures, and trace the rule that flags a value as an outlier | Two of my classes scored a mean of twelve in science. One class was ready for the next topic. In the other, half were lost. What was the mean hiding? | standard deviation; outlier; middle half (IQR) | spread | S |
| 3 | Relationships | read a scatter plot, predict the sign and rough size of r, and explain why r alone can’t show a cause | A parent asked me: does sleep help my daughter’s marks? I had sleep hours and test marks for the whole class. Two numbers for each pupil. How could I see if they go together? | scatter plot; correlation coefficient (r); causation | scatter | S |
| 4 | Exploring a dataset | trace the five-question routine through a new table, and write a finding with a number and its source | The ministry sent our school one huge table. Attendance and marks for every class, for a whole year. My teachers asked me one thing. Where do we even start? | exploratory analysis; finding; missing value | quality | S |

- **Unit check:** unchanged (it has no code).
- **Changes:** the summary names `ds-1-1` in place of “Python for teachers”. The four `code` steps (`p3` in each lesson) become guided: lesson 1 fills the line that picks the bin; lesson 2 puts the lines of the outlier rule in order; lesson 3 finds the missing line of the three sums behind r; lesson 4 is “What does this print?” on a program that sorts five values and prints the smallest, the middle one and the largest, with no `def`, no negative index and no tuple. Each reading explains the lines it shows; lesson 1's reading has a short box on a list, `for h in heights:` and `counts[b] = counts[b] + 1`. Lesson 2 opens “At level 1 you measured spread with the range…”, and lesson 3 “At level 1 you saw that two things can go together…”, so nothing is taught twice. Lesson 4's video has no lab scene today and is short (320 words): it gains one. Hooks are told by Ms Amina (1), Ms Salma (2), Mr Okafor (3) and Dr Farah (4).

### `ds-3-1` Models and predictions
- **For:** teachers, level 3 Intermediate
- **Status:** revise
- **After it, you can:** fit a line to class data and predict from it; measure a predictor on pupils it has not seen; classify a new case by its nearest neighbours; judge a yes-or-no model by its two kinds of mistake.
- **Before this:** `ds-2-1` “Exploring data” (Data science, level 2) and `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 1, plus lists (`code-2-1` teaches both); a slice is explained in lesson 2
- **The path:** fit a rule to data, measure it on data it has not seen, use neighbours when the answer is a label, then judge any model by its mistakes.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Fitting a line | fit a line to class data, use its slope to predict, and judge where the line must not be trusted | My pupils kept a reading diary for a term. The pupils who read more scored higher in the reading test. Could I predict a new pupil’s mark from her reading hours? | model; line of best fit; slope; linear regression | scatter | S |
| 2 | Measure it on new pupils | split data into training and test rows, measure a rule’s average error on each, and judge whether it has memorised | Last year I made a rule to predict which pupils would pass. On last year’s pupils, it was right every time. This year it is wrong for one pupil in three. So what had last year’s score really measured? | training set; test set; overfitting; average error | overfit | R |
| 3 | Nearest neighbours | classify a new case by its nearest neighbours, working out the distances, and compare the answers for different k | In March, a girl joined my class from another town. A short test gave me her reading speed and her accuracy. I have three reading groups. Which one should she join? | classification; nearest neighbours; distance; k | knn | S |
| 4 | How good is my model? | judge a yes-or-no model by its false alarms and misses against a simple baseline, and choose a threshold for a school decision | Our school tried an early-warning model for pupils who need help. It was ninety percent accurate. Then we noticed something: it had not warned us about one single pupil. How can both be true? | accuracy; confusion matrix; baseline; threshold | threshold | S |

- **Unit check:** two questions now ask for a number: an average error on test rows, and a count of misses.
- **Changes:** lesson 2 (today “Training and testing”) is rewritten as the lesson that measures. It opens with a two-sentence reminder of overfitting and names its home, `ai-3-1-3` “Train, test, trust?”. Then it works one case in numbers: the rule's average error, in marks, on the eight training rows and on the two test rows that the code step uses. Its reading explains a slice (`hours[:8]`) with one example. Lesson 3 is the teachers' only lesson on nearest neighbours; its code step keeps the pupils in three plain lists, so no tuple is needed. Lesson 4 gets one line naming `ai-3-1-3` for the two kinds of mistake, and spends its time counting them and moving the threshold. From this course on, code is written, so the summary names both courses. Hooks are told by Ms Amina (1, 3), Ms Salma (2) and Dr Farah (4).

### `ds-4-1` Leading data science at school
- **For:** teachers, level 4 Advanced
- **Status:** revise
- **After it, you can:** design a fair sample and report a margin of error; evaluate what a clustering shows; evaluate a tool's error rates group by group, and decide what the school publishes; design a fair trial and lead the decision.
- **Before this:** `ds-3-1` “Models and predictions” (Data science, level 3), which needs `code-2-1` “Python for teachers” (Programming, level 2).
- **Python:** rung 1, plus lists; one function is shown and explained in lesson 3
- **The path:** how sure a survey is, what groups the data holds, whether a tool is fair to each group, then how a school decides.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Samples and uncertainty | design a fair sample for a school survey, and report its result with a margin of error | Mr Okafor and I each asked forty pupils about homework time. He found fifty minutes a day. I found sixty. Was one of us wrong? | population; sample; random sample; margin of error | sampling | S |
| 2 | Finding groups | evaluate what a clustering shows and what it does not, and write neutral names for the groups it finds | I run the school library, so I keep its log. It shows how often each pupil borrows, and for how long. Nobody ever sorted these pupils into types. Could the numbers find groups by themselves? | clustering; k-means; centre | kmeans | S |
| 3 | Fair or unfair? Count it by group | evaluate a tool by its error rates group by group, and say whether a gap is bigger than a small group’s wobble | Our early-warning list flagged twenty girls and only five boys. A father asked me: is it unfair to girls? I had the list, and what really happened to each pupil. What should I count before I answer him? | error rate; miss rate; false alarm rate | bias | R |
| 4 | Deciding with data | design a fair trial with a comparison group for a school decision, and write who decides and how the result is shared | Our staff wanted to move the start of the school day later. Some said pupils would sleep more and learn better. Others worried about parents’ work. How could data help us decide? | fair trial; comparison group; effect | decision | S |

- **Unit check:** one question on lesson 3 becomes a small table of results to work out by group.
- **Changes:** lesson 1's video says the school has 800 pupils and the lab says 400: the video takes the lab's 400. Its hook is told in the first person. Lesson 3 (today “Fair or unfair models”) is rewritten. It opens with a two-sentence reminder (an average can hide a group the tool fails) and names the home, `ai-4-1-1` “Audit an AI tool”. Then it measures: from a small table it works out the miss rate and the false-alarm rate for each group, and asks whether the gap is bigger than the wobble of a group of twenty, using lesson 1's margin of error. It follows the early-warning model of `ds-3-1-4`, not the AI track's reading app. It ends on what the school may publish: no rate for a group so small that it names children. Its `def rate(xs)` step becomes a fill-the-gap step on a function the reading explains. Hooks are told by Ms Salma (1), Mr Okafor (2) and Dr Farah (3, 4).

### `ds-u1` Teaching statistical learning at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach where a standard error comes from, without hand-waving; teach honest validation and set tasks that expose leakage; teach students to reason about causes; design a module whose outcomes, projects and rubric line up.
- **Before this:** `ds-3-1` “Models and predictions” (Data science, level 3), or you already teach the subject.
- **Python:** none
- **The path:** how sure an estimate is, how good a model really is, what causes what, then a module that teaches the judgement and not only the tools.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Sampling distributions and the bootstrap | teach where a standard error comes from by resampling, and put right the usual misreading of a 95% interval | My second-year students can all recite the confidence interval formula. I ask what the ninety-five percent refers to. Most say: the chance the true mean is in this interval. So what have they never seen? | sampling distribution; standard error; bootstrap | sampling | S |
| 2 | Bias, variance and cross-validation | teach the bias–variance trade-off with honest validation, and set tasks that expose leakage | A student showed me a model with ninety-nine percent accuracy. I ran it on new data: sixty-one. Her code had no bug. So where did thirty-eight points go? | bias–variance trade-off; k-fold cross-validation; leakage | overfit | S |
| 3 | Causal inference: DAGs and difference-in-differences | teach students to draw a causal diagram, choose what to adjust for, and estimate an effect with difference-in-differences | Students who used our tutoring centre had lower grades. A dean proposed closing it. Before anyone voted, I asked one thing: who chooses to go to tutoring? | confounder; back-door criterion; parallel trends | scatter | S |
| 4 | Designing a data-science module | design a module whose outcomes, tasks and rubric line up, with real data and a reproducibility requirement | My final exam was all calculations. My best students got top marks. In their first internship, they could not choose an analysis for a real question. What had my exam never asked of them? | constructive alignment; reproducible analysis; analytic rubric | histogram | S |

- **Unit check:** it has about one question on lesson 4: one moves there from the heaviest lesson.
- **Changes:** the hooks keep their stories; three ended on a statement that gave the answer away. Each promise lists three or four topics ("Today: where a standard error comes from, how the bootstrap estimates it, and how to teach both…"): each becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a case comes first. The course is lined up with the students' eight courses (point 8 above). Lesson 1's worked case becomes the students' commute survey from `ds-m5`. Lesson 2's seminar task is built on the three leaks of `ds-m7-3`, and its reading says that k-fold cross-validation and the bias–variance split go beyond the students' course. Lesson 3 starts from the shuttle case of `ds-m4-2` and says that causal diagrams and difference-in-differences go beyond it. Lesson 4's project uses the capstone's brief and its 100-point rubric as a worked example. The summary gains its “Before this” line.

### `ds-s1` Data detectives
- **For:** students, primary (9–12)
- **Status:** rewrite
- **After it, you can:** turn a guess into a question you can count; find the middle one and the most common one in a small group of numbers; read and draw a pictogram and a bar chart; ask who was asked, and how many, before you believe a number.
- **Before this:** No experience needed, only counting, adding and taking away.
- **Python:** none
- **The path:** count instead of guessing, find the middle, draw the picture, then check other people's numbers.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A guess or a count? | turn a guess into a question you can count, and count the answers with a tally | Your class says: everybody walks to school. You are not so sure. Your friend Sara comes by bus. How could you find out who is right? | data; tally | table | R |
| 2 | The middle one | find the middle value and the most common value of a small group of numbers, and say how far they spread | You line up with eight friends, shortest to tallest. A new teacher asks: how tall is your group? You cannot all shout your heights at once. Which one of you should answer? | middle value (median); most common value (mode); range | spread | R |
| 3 | Pictures of numbers | read a pictogram and a bar chart, draw one with a title and a key, and spot a picture that makes a small difference look big | Class 5B votes for a favourite fruit. Mango gets eleven votes, banana six, guava three. You get one page on the school wall. How do you show the winner so everyone sees it at once? | pictogram; bar chart; key | chartpick | R |
| 4 | Is that fair? | ask three questions of a number someone tells you: who was asked, how many, and what was left out | An advert says: nine out of ten children love Zuzu juice! You tried it, and you did not. Neither did your friends. So who were those ten children? | claim; sample | sampling | R |

- **Unit check:** rewritten with the course: ten questions by tapping, ordering and matching, none with a formula.
- **Changes:** rewritten in place; the id, the title and the lesson ids stay. Today it is the teachers' Beginner course in simpler words. The new course is written for 9 to 12: sentences of 14 words or fewer, things a child can line up or count, videos of 280 to 370 words, and no typing. The mean waits for lower secondary: in lesson 2 the lab shows it, and one sentence calls it “the fair share”. Lesson 4 uses the `sampling` lab for one switch only: ask children “At random”, then “Only near the gate”. Two of the labs were written for adults (`spread`, `sampling`); each prompt says the one thing to press and the one number to watch. The course no longer talks about "pupils' data"; the summary keeps “no typing” and gains “No experience needed.”, with one line for children who did “Collect and sort” (Data engineering): the tally will be familiar.

### `ds-s2` Patterns in data
- **For:** students, lower secondary (12–15)
- **Status:** revise
- **After it, you can:** work out the mean and the median and choose the one that is typical; describe the shape of a set of numbers and question a value far from the rest; say whether two measurements go together, and why that is not a cause; explore a small table and write a finding with a number.
- **Before this:** No experience needed, only school maths: dividing, and plotting a point on a grid.
- **Python:** shown and explained (taught here; every step is guided)
- **The path:** one number for a group, the shape behind the number, two measurements together, then a table of your own.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | What is typical? | work out the mean and the median of a set of numbers, and choose the one that describes a typical value | Omar’s football team has eleven players. Ten are thirteen, and the goalkeeper, their coach, is forty-one. The club says the average age is over fifteen. Is that a fair number for this team? | mean; median; range | spread | R |
| 2 | The shape of data | build a histogram, describe its shape as a hill or a tail, and decide whether a value far from the rest is a mistake | At the health check, sixty of you were measured. The nurse read out sixty heights, one by one. Could anyone say what the class looks like? How do you see sixty numbers at once? | histogram; bin; skewed; outlier | histogram | R |
| 3 | Do they go together? | read a scatter plot, say whether two measurements go together strongly, weakly or not at all, and explain why that is not proof of a cause | Mona sleeps nine hours and gets top marks. Karim sleeps six, and so does he. Your class wrote down everyone’s sleep and marks. Does more sleep go with better marks, or not? | scatter plot; correlation; cause | scatter | S |
| 4 | Explore a dataset | explore a small table with five questions, and write a finding with a number and where it came from | Your school gives your class a table of library loans. One row for every book borrowed this year: five hundred rows. Your teacher says: find something worth knowing. Where do you even start? | finding; missing value; impossible value | quality | S |

- **Unit check:** rewritten for lessons 1 and 2; the questions on lessons 3 and 4 stay.
- **Changes:** revised in place. Lesson 1 is new content under the old id: a starting course teaches the middle again, shorter, before anything else (today lesson 1 is histograms). Lesson 2 joins today's lessons 1 and 2 without the standard deviation and the 1.5 × IQR rule, which wait for upper secondary: a value far from the rest is checked, not deleted. Lessons 3 and 4 keep their content and get the standard pass, with hooks about pupils. Correlation is read from the lab as strong, weak or none; the formula for r goes. The four `code` steps become guided steps on lines the reading explains, and lesson 4's `def summary(xs)` goes. The summary ends “No experience needed, only school maths. If you have done “First Python”, the code will be familiar.” One line in lesson 1 names `data-s2-4` for those who did “Spreadsheets and clean data”.

### `ds-s3` Predict with data
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** summarise data with a centre and a spread; fit a line and predict from it; measure a model's error on data it has not seen, in code; judge a yes-or-no prediction by its two kinds of mistake.
- **Before this:** `code-s2` “First Python” (Programming, lower secondary). From school maths: the mean, a percentage and a straight-line graph (y = mx + c).
- **Python:** rung 1, written; lists are taught here (lesson 1 explains a list, `sum`, `len` and a loop over it)
- **The path:** describe before you predict, fit a line, test it on data it has not seen, then judge a prediction by its mistakes.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Describe before you predict | summarise a set of numbers with a centre and a spread, and pick the pair that fits its shape | Two phone shops both say: average battery life, ten hours. You buy from the first, and yours dies after four. Your friend’s, from the second, lasts ten. What did the average not tell you? | median; standard deviation; distribution; outlier | spread | R |
| 2 | A line that predicts | fit a line to two measurements, read its slope, predict from it, and say where it must not be trusted | Laila tracks her study hours and her quiz marks for a term. More hours, higher marks, nearly every week. Next week she can study only two hours. What mark should she expect? | scatter plot; correlation; line of best fit; slope | scatter | R |
| 3 | Test it on data it hasn’t seen | split data into training and test rows, measure a model’s average error on each in code, and tell memorising from learning | Youssef learns last year’s exam answers by heart. On last year’s paper, he scores full marks. This year’s paper has new questions. How could you tell, before the exam, whether he really learned the subject? | training set; test set; mean absolute error; overfitting | overfit | R |
| 4 | How good is a yes-or-no prediction? | judge a yes-or-no model by its precision and recall, and choose a threshold by what each mistake costs | An app claims it is right about spam nine times in ten. Out of a hundred of your messages, ten are spam. An app that flags nothing at all scores the same. So what should you ask instead? | accuracy; precision; recall; threshold | threshold | S |

- **Unit check:** rewritten with lessons 1 to 3; no question on nearest neighbours.
- **Changes:** revised in place. Lesson 1 is new content: a 16-year-old who never did `ds-s2` needs the centre, the spread and the shape first, and this is where the standard deviation arrives. Today's lesson 1 (the line) moves to 2 and starts from a scatter of dots, and today's lesson 2 (train and test) moves to 3 and measures the error in code. Today's lesson 3, nearest neighbours, leaves the course: its home for students is `ai-s3-2`. Lesson 4 keeps its content. The `spread` lab has no standard deviation: the code step computes it. Code steps use plain lists and loops: no tuples, no slices before lesson 3 explains one. The summary keeps `code-s2` and adds “lists are explained in the first lesson”.

### `ds-m1` Questions, sources and measurement
- **For:** students, university
- **Status:** new
- **After it, you can:** say what kind of question you are asking and what one row of a table stands for; check where a dataset came from and whom it can describe; judge how each value was measured; write a data dictionary.
- **Before this:** No experience needed, only school ratios and simple algebra (a speed from a distance and a time).
- **Python:** shown and explained (taught here: a list of answers, a loop over it, an `if`; every step is guided)
- **The path:** the question, the source, the measurement, then all three written down in a data dictionary before anything is computed.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | The question, and what one row is | classify a question as descriptive, comparative, causal or predictive, and say what one row of a table stands for | The student union asks: would a new metro line shorten commutes? You have a survey of fifteen students. Each one typed how long the trip takes. Can this table answer the union? | descriptive question; causal question; predictive question; unit of observation | table | N |
| 2 | Where the data came from | check a dataset’s provenance record, and say whom its results can describe | A classmate posts a chart: students here commute thirty minutes on average. The form was shared in two group chats. Whoever felt like it answered. So whose commute is that thirty minutes? | provenance; convenience sample; consent; data minimisation | sampling | N |
| 3 | What was really measured | judge whether a question measures what it claims, and convert messy answers by written rules that leave a flag | The survey asks: how long is your commute? One student types twenty. Another types half an hour, and a third types a question mark. What number goes in the table for each? | validity; reliability; leading question; flag | datalog | N |
| 4 | A data dictionary | write a data dictionary for a survey, and state two questions it can answer and two it cannot | The transport office gives you its survey: analyse it by Friday. One column is called Q1. Another holds home addresses. What must you write down before you compute anything? | data dictionary; allowed values; missing-value code | quality | N |

- **Unit check:** 10 graded questions made from the module's quiz and its nine “Check yourself” items, at least four of them campus cases to decide.
- **Changes:** new, from module 1 of the university drafts (`module-01`). What moves to the reading and the practice: the types of variable (lesson 1), consent decisions and the log of exclusions (lesson 2), plausibility checks such as walking at one kilometre an hour (lesson 3). Lesson 4's project is the module's task: critique the transport survey and write its data dictionary. The comparative question is the reading's one extra term in lesson 1. The drafts expect Python before this module; the course does not. Its code steps are guided: “What does this print?” on a count of rows, a gap to fill in the loop that keeps answers with consent, and a bug to find in the rules that turn “half an hour” into minutes. The project's phone version has no blank editor: the dictionary of the 15-answer sample is written by hand, and the conversion rules are written in words and applied by hand, each with its flag. The drafts' computer exercises (a parser for free-text times, speed checks on the files) are the computer version, for students who have reached `code-m5`.

### `ds-m2` Cleaning data, step by step
- **For:** students, university
- **Status:** new
- **After it, you can:** bring labels from two files to one set of codes; give every column the right type and every kind of “missing” one meaning; remove duplicates and join tables without losing rows; prove with a log where every row went.
- **Before this:** `ds-m1` “Questions, sources and measurement” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). The computer version of the project also needs `code-m6` (files, CSV and exceptions).
- **Python:** rung 2, written (loops, functions, lists and dictionaries) on a few rows written into the step; reading CSV files only in the computer version
- **The path:** one set of codes, one meaning for “missing”, one row per person, then a log that proves it.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | One table, one set of codes | map labels written in two languages and two kinds of digits to one set of codes, by a table of rules and without guessing | One campus is typed three ways in your survey files. North, north with a space, and its name in Arabic. Your count of North students comes out too low. What does the computer think it is counting? | consistent code; mapping table; encoding; byte-order mark | clean | N |
| 2 | Types and missing values | convert a column to the right type, record every kind of missing answer one way, and show how dropping rows can bias a mean | You drop every row with a blank, as everyone does. The average commute falls by eight minutes. Nobody moved house. So where did the eight minutes go? | type; missing value; missingness by group; sensitivity check | table | N |
| 3 | Duplicates and joins | tell an exact duplicate from a repeated respondent, resolve each by a rule written first, and check the row counts after a join | You match forty-two survey rows with the campus table. Thirty-six come out. No error, no warning. Where did six students go? | duplicate; repeated respondent; join; key | join | N |
| 4 | The cleaning log | clean two survey files into one table by rules written before running them, and prove where every input row went | Your clean table has fewer rows than the two original files. Your lecturer asks one question: where did each row go? You fixed things by hand as you went. How can you answer her now? | cleaning log; row accounting | pipeline | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; at least one joins lessons 2 and 3 (a join that turns a mismatch into a missing value).
- **Changes:** new, from module 2 (`module-02`). The byte-order mark can only be seen on a computer: on the phone it is a picture in the video and a paragraph in the reading. The optional pandas example stays optional and is for a computer. Lesson 4's project is the module's task: one clean table from the English and the Arabic file, with the log.

### `ds-m3` Distributions and honest charts
- **For:** students, university
- **Status:** new
- **After it, you can:** describe a distribution by its centre, spread and shape; compare groups with several summaries and their sizes; choose a chart for a question, and measure how much a bad one exaggerates.
- **Before this:** `ds-m2` “Cleaning data, step by step” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). From school: the mean, a square and a square root.
- **Python:** rung 2, written (lists, loops, dictionaries); files are read and charts written only in the computer version (`code-m6`)
- **The path:** one distribution, two groups side by side, the right chart and the wrong one, then a comparison you can defend.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Describing one distribution | describe a distribution by its centre, spread and shape, and say which summaries one extreme value moves | Two hundred and forty students report their commute. The mean is twenty-one minutes. Then one more student answers: three hours. Which of your summary numbers just moved, and which stayed put? | median; standard deviation; interquartile range; skew | spread | N |
| 2 | Comparing groups | compare groups with several summaries and their sizes, on charts that share bins and axes | Cyclists in the survey have the shortest commute: nine minutes. Bus riders have the longest: twenty-four. Before you tell the campus to cycle, look again. How many cyclists answered? | histogram; group size (n); text alternative | histogram | N |
| 3 | A chart that misleads with true numbers | choose the chart that answers a stated question, and measure how much a cut axis exaggerates | A campus poster shows two bars: North and South commute times. North’s bar is three times as tall. The numbers on it are twenty-one and a half, and twenty and a half. How did one minute become three times? | truncated axis; zero baseline; drawn ratio | chartpick | N |
| 4 | Two campuses, compared honestly | answer how two groups differ in a sample with summaries and matching charts, and write a finding that claims no more than the sample shows | The campus paper wants a headline: North commutes are longer. Your survey says twenty-one and a half minutes against twenty and a half. The two groups are different sizes. What may you honestly write? | descriptive finding; common scale | — | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; two ask the learner to read a text histogram.
- **Changes:** new, from module 3 (`module-03`). The mean is expected from school and gets a one-sentence reminder. The histogram waits for lesson 2, so that lesson 1 has four new terms and not five. Accessible charts (a title, labelled axes, a text alternative with the key numbers) are lesson 2's second outcome: it goes to the reading and to the project. Lesson 4 has no fitting lab: its hands-on step is a text histogram of the two campuses in the sandbox. Its project is the module's task.

### `ds-m4` Samples, confounding and experiments
- **For:** students, university
- **Status:** new
- **After it, you can:** tell random variation from bias in a sample; explain how a third thing can create an association with no effect behind it; say why random assignment allows a causal claim; design an ethical randomised study.
- **Before this:** `ds-m3` “Distributions and honest charts” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). From school: proportions and a weighted average.
- **Python:** rung 2, written (functions, lists, dictionaries); `random` with a seed is taught here, where it is first used
- **The path:** how the data were collected, what else could explain a difference, what a fair test changes, then a study plan of your own.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Samples, chance and bias | tell random sampling variation from bias, and name the bias in a convenience, a coverage and a voluntary-response sample | You survey students at the campus bus stop: a hundred answers. Your friend asks fifty students picked by lottery. Your average commute is five minutes longer than hers. Whose number is closer to the truth? | population; sample; sampling frame; bias | sampling | N |
| 2 | A third thing behind both | explain how a confounder creates an association with no effect behind it, and compare like with like inside each group | Shuttle users reach campus ten minutes faster than everyone else. The transport office wants to buy more shuttles. Then a fair test finds the shuttle saves no time at all. How can both be true? | association; confounder; stratification | — | N |
| 3 | Let chance choose | explain why random assignment allows a causal conclusion, check that the two groups are balanced, and name what an ethical study must include | The university can give free shuttle passes to half the students. If students choose, dorm residents sign up first. If the office chooses, it picks whoever complains. Who, or what, should decide who gets a pass? | random assignment; control group; balance check; informed consent | — | N |
| 4 | Three survey plans and one fair study | measure the bias of three survey plans by simulation, and design a randomised study with consent, fairness to the control group and an analysis fixed in advance | The transport office has money for one survey and one study. Plan A asks at bus stops. Plan B emails everyone and waits for replies. How could you show, in advance, which plan misleads, and by how much? | simulation; reweighting; analysis plan | sampling | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; at least four are study designs to judge.
- **Changes:** new, from module 4 (`module-04`). Estimating the size of a bias by simulation is lesson 1's second outcome: it moves to lesson 4, where the project needs it. Lessons 2 and 3 have no fitting lab: lesson 2's hands-on step is a table of commute times worked out inside each group, and lesson 3's is a seeded random assignment with its balance check, both in the sandbox. The randomised study is designed, not run. Lesson 4's project is the module's task.

### `ds-m5` The bootstrap and confidence intervals
- **For:** students, university
- **Status:** new
- **After it, you can:** explain what a standard error measures; compute a bootstrap interval for a mean and for a difference; say what 95% means, and three things an interval does not tell you.
- **Before this:** `ds-m4` “Samples, confounding and experiments” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). From school: percentages and a square root.
- **Python:** rung 2, written (lists, functions), with `random` and a seed from `ds-m4`
- **The path:** every sample is a little off, resampling shows by how much, the interval has a precise meaning, then a difference reported with its limits.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | One sample, many possible samples | explain what a standard error measures and how sample size changes it, and resample a small sample by hand | You surveyed two hundred and forty students once. Their mean commute is twenty-one minutes. Run the survey again and you would get another number. You cannot run it again, so how far off might you be? | sampling variability; standard error; resample; bootstrap | sampling | N |
| 2 | An interval from your own data | compute a seeded bootstrap interval for a mean and for a difference between two groups, and say what it means when the interval includes zero | South students commute one minute less than North students in your survey. Your report says: South is closer. A reviewer writes back: one minute, give or take how much? What do you answer? | percentile interval; confidence level; seed; number of resamples (B) | new: resample | N |
| 3 | What ninety-five percent means | explain a confidence level as how often the method succeeds, and name three things an interval does not tell you | Your interval for the mean commute is nineteen to twenty-three minutes. A friend reads it and says: so nearly everyone travels nineteen to twenty-three minutes. Only fifteen in a hundred do. What did she misread? | coverage; individual variation | sampling | N |
| 4 | A difference, with its limits | bootstrap a difference in group means, check it against other seeds, and write an interpretation that claims nothing about individuals or causes | South minus North: between minus four and plus two minutes. One classmate says: so there is no difference. Another says: so South is faster. Which of them is right, if either? | simulation noise; seed check | new: resample | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; three give an interval and ask which sentence about it is correct.
- **Changes:** new, from module 5 (`module-05`). The drafts ask for 2,000 to 5,000 resamples of 240 values: that is too much for the phone sandbox's three seconds, so lessons 2 and 4 name a new Labs app (see the decisions). Until it exists, the phone steps resample about 30 values a few hundred times. Lesson 4's project is the module's task.

### `ds-m6` Chance, tests and many comparisons
- **For:** students, university
- **Status:** new
- **After it, you can:** state a null model and a test statistic before you look; run a permutation test and read its p-value correctly; show how many comparisons produce false alarms, and limit them.
- **Before this:** `ds-m5` “The bootstrap and confidence intervals” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). From school: fractions, counting the ways to choose 3 things out of 6, and a power (0.95 to the power 20).
- **Python:** rung 2, written (lists, functions), with `random` and a seed from `ds-m4`; nested loops stand in for `itertools.combinations`
- **The path:** describe the world where nothing happened, shuffle to see what it produces, beware of looking twenty times, then run one test planned in advance.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A world where nothing changed | state a null model and a test statistic before looking at the result, and work out a p-value by listing every relabelling of six values | A new bus timetable is tried on thirty trips. Average waits fall from nine minutes to under seven. The transport office is delighted. Could waits fall that much if the timetable changed nothing? | null model; test statistic; relabelling; p-value | — | N |
| 2 | Shuffle the labels | run a seeded permutation test, report the statistic, the p-value, the shuffles and the effect size, and read the p-value without the usual mistakes | Your timetable test gives a p-value of about one percent. You write: so there is a one percent chance it was luck. A statistician crosses the sentence out. What does the number really say? | permutation test; shuffle; effect size; two-sided test | new: resample | N |
| 3 | Twenty looks, one winner | show how testing many comparisons produces false positives, and limit them with one test stated in advance and an adjustment | Imagine the timetable pilot had shown nothing overall. You look at twenty smaller groups: mornings, Fridays, rainy days, each route. In one, p is below zero point zero one. Have you found something, or just looked often enough? | multiple comparisons; false positive; Bonferroni adjustment; primary test | — | N |
| 4 | One test, planned before you look | write an analysis plan before running anything, run that one test, report the effect with an interval, and say what the design cannot rule out | The office wants to roll out the new bus timetable. Your test says waits fell by two and a half minutes. But the old timetable ran first, and the new one later. What else could explain shorter waits? | exploratory check; rival explanation | — | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; three give a sentence about a p-value to accept or reject.
- **Changes:** new, from module 6 (`module-06`). Lesson 1's hands-on step is done with six paper slips, as the drafts' first exercise is, and then with nested loops in the sandbox. The Holm adjustment is the reading's extra term in lesson 3. 10,000 shuffles of 60 trips need the new Labs app or a computer; the phone steps shuffle about 12 values. Lesson 4's project is the module's task.

### `ds-m7` Prediction and honest evaluation
- **For:** students, university
- **Status:** new
- **After it, you can:** fit a least-squares line and say what it misses; score a model on held-out data against a mean baseline; find leakage; choose a model without touching the test set.
- **Before this:** `ds-m6` “Chance, tests and many comparisons” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). From school: a straight line y = a + bx, a square and a square root.
- **Python:** rung 2, written (lists, dictionaries, functions, a slice); the phone steps use no `lambda`, and the computer version's `lambda` is explained in the reading
- **The path:** a line and its misses, a test the model has not seen, the ways a test gets spoiled, then a predictor reported honestly.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A line, and what it misses | fit a least-squares line, say what its slope and intercept mean with their units, and use residuals to find what the line misses | How long will your trip to campus take? A straight line says nine minutes, plus two and a half per kilometre. For bus trips it is six minutes short, nearly every time. What is the line missing? | model; least-squares line; slope; residual | scatter | N |
| 2 | Hide some trips first | split data once with a seed, score a model on the held-out part, and compare it with a baseline that always predicts the mean | A classmate’s model copies the most similar past trip. On the trips it has seen, its error is zero. On a hundred new trips, it is the worst model in the class. How can a perfect score hide that? | training and test sets; mean absolute error (MAE); baseline; overfitting | overfit | N |
| 3 | Too good to be true | find leakage from a column you would not know in advance, from rows on both sides of the split, and from choices made on the test set | Your trip-time model is off by three seconds on average. Three seconds! One of its columns is the speed recorded during the trip. When would you know that speed for tomorrow’s journey? | leakage; validation set; feature | — | N |
| 4 | Beat the mean, honestly | build a predictor from what is known before departure, choose it on validation data, score the test set once, and report it beside the baseline | Your model predicts trip times within seven minutes. Your lecturer asks two questions. How well does always guessing the average do? And how many times did you look at the test trips before you chose? | leakage audit; selection rule | — | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; at least three are leaks to spot.
- **Changes:** new, from module 7 (`module-07`). “Model” is first named here, in lesson 1, so the later hooks may use it. The intercept is the reading's extra term in lesson 1, and the root mean squared error in lesson 2. Telling prediction from causal explanation is lesson 1's second outcome: it goes to the reading and to one practice question. Lessons 3 and 4 have no fitting lab: their hands-on steps are a split and a score on 20 to 40 trips written into the step. This course stays with a straight line and a mean baseline: it is statistics, not machine learning. Lesson 4's project is the module's task.

### `ds-m8` Reproducible, fair and clear reports
- **For:** students, university
- **Status:** new
- **After it, you can:** make an analysis someone else can rebuild; report errors group by group, with each group's size and uncertainty; write a report whose claims match its evidence, for every reader.
- **Before this:** `ds-m7` “Prediction and honest evaluation” (Data science, university) and `code-m5` (Programming, university: lists and dictionaries). The computer version of the project also needs `code-m6` (files).
- **Python:** rung 2, written (dictionaries, functions); `hashlib.sha256` is taught here; the script that writes the manifest and the report is the computer version
- **The path:** the same numbers next year, the groups an average hides, words that match the evidence, then a report that rebuilds itself.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | The same numbers next year | make an analysis repeatable with frozen data, a fingerprint, recorded seeds and one script, and tell repeatable from robust | Last term your report said: test error, three point eight minutes. Today you run the same script and get four point zero. You changed nothing, you think. How would you find out what did change? | fingerprint; manifest; repeatable; robust | hash | N |
| 2 | Errors, group by group | report a model’s error for groups chosen in advance, with each group’s size, direction and uncertainty, and say why small groups mislead | Your model is off by about four minutes for every travel mode. Fair to all, then? Car trips are predicted two minutes short, again and again. What did the four minutes not show you? | subgroup; signed error; small group | bias | N |
| 3 | Say only what the evidence says | write a report that a busy reader and a screen-reader user can both follow, and match the strength of every claim to its evidence | Your draft says: this proves the model is accurate for all students. Your data are four hundred trips, not students. You compared it with nothing. Which words must go? | calibrated claim; caveat; overclaim | chartpick | N |
| 4 | The report that rebuilds itself | produce, from one script, a short report with a baseline, errors by group, a check across several splits and a manifest | Your report is due at nine. At eight you fix one wrong row in the data. Now which of its twelve numbers, two tables and one chart are out of date? | reproducible report; robustness check | — | N |

- **Unit check:** 10 graded questions from the module's quiz and “Check yourself” items; three give a sentence from a report to keep, soften or cut.
- **Changes:** new, from module 8 (`module-08`). The groups here are groups of trips. What changes when the groups are people (consent, privacy, results for very small groups) is in lesson 2's reading, in two sentences, and again in the capstone. Lesson 3 opens with a one-sentence reminder of the text alternative from `ds-m3-2`. Lesson 4's project is the module's task: on a phone, the report is written by hand from numbers the sandbox prints; on a computer, one script writes it.

### `ds-capstone` Capstone: an original study of a small dataset
- **For:** students, university (capstone)
- **Status:** move (to the end of the university path; its brief is replaced)
- **After it, you can:** ask a descriptive, an inference and a prediction question of one small dataset; clean it with a log; answer with an interval or a test and with a held-out score; report it so that anyone can rebuild every number, with its causal and privacy limits.
- **Before this:** `ds-m8` “Reproducible, fair and clear reports” (Data science, university) and `code-m7` (Programming, university: tests).
- **Python:** rung 3, on a computer: Python's standard library, one script, and three unit tests of your own

- **Changes:** text only. The brief becomes the drafts' capstone: seat counts in six study rooms of a made-up university library, three times a day, over eight weeks, with data problems to find. Six things are handed in: the frozen data and its manifest, a data dictionary, a cleaning log, the script and its tests, an accessible report of 1,500 to 2,500 words, and a section on causal and privacy limits. It is marked out of 100, and takes about 16 hours. The app's three parts stay (description, starter, submission); the starter is the drafts' loader with its three tests; the milestones become the six phases of the drafts' schedule. The course moves from level 3 to level 4, after `ds-m8`. Today's project (“what predicts a struggling student?”) is retired: see the decisions.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `ds-1-1` | Teachers, Beginner | Revised. 4 standard passes; the four Python steps go. Ends “No experience needed.” |
| `ds-2-1` | Teachers, Elementary | Kept. 4 standard passes; code is read and completed, not written. Names `ds-1-1`. |
| `ds-3-1` | Teachers, Intermediate | Revised. Lesson 2 rewritten to measure; 3 standard passes. Names `ds-2-1` and `code-2-1`. |
| `ds-4-1` | Teachers, Advanced | Revised. Lesson 3 rewritten to measure by group; 3 standard passes. Names `ds-3-1`. |
| `ds-u1` | University teachers | Kept. 4 standard passes, lined up with the students' eight courses. Gains its “Before this”. |
| `ds-s1` | Students, primary | Rewritten in place: four lessons for ages 9 to 12, by hand. |
| `ds-s2` | Students, lower secondary | Revised in place: lessons 1 and 2 rewritten, 3 and 4 standard passes. Starts from zero. |
| `ds-s3` | Students, upper secondary | Revised in place: lessons 1 to 3 rewritten, lesson 4 a standard pass. Nearest neighbours leaves. |
| `ds-s4` | Not on a path | Leaves the university path when `ds-m1` is published: unpublished, kept as a draft, id kept. |
| `ds-capstone` | Students, university, capstone | Moves from level 3 to level 4; its brief is replaced by the drafts' study. Text only. |
| (new) `ds-m1` to `ds-m8` | Students, university | New: 8 courses, 32 lessons and 8 unit checks, from the university drafts. |

## Work, in order

1. **Before any writing: have the university drafts read.** They are unreviewed drafts: no statistics or faculty
   review, no Arabic review, no screen-reader or phone check, no pilot with learners, and every run was on Linux
   only. Their numbers are checked by their own tests, but nobody has yet judged the teaching. A statistician should
   read modules 5 and 6 first (intervals and p-values are where a small wording error teaches a wrong idea). The
   drafts' Arabic is Modern Standard Arabic; the videos need Egyptian Arabic, written fresh.
2. **Measure the phone sandbox.** Time a bootstrap and a shuffle test of several sizes in the sandbox on a slow phone,
   and check what its `random` module offers (`seed`, `choice`, `randrange`): no course runs it today. The plan's
   phone sizes for `ds-m4` to `ds-m6` depend on it.
3. **`ds-m1`, new** (4 lessons): it is what a university student should meet first, and it needs no Python: its
   code steps are guided, and its project has a phone version with no blank editor. When it is published, `ds-s4`
   is unpublished.
4. **`ds-m2` to `ds-m8`, new, in order** (28 lessons), and the capstone's text. Code is written from `ds-m2`, so
   these wait for `code-m5` in the Programming track, and their computer versions for `code-m6`. Each course is a
   new unit file and
   four new storyboards, written with the skill from `module-0N` of the drafts
   (`H:/Downloads/darsi-university-non-ai-materials.zip`, folder `data-science`). The drafts are read, never
   imported: their one-minute narration scripts are not Darsi videos.
5. **`ds-4-1` and `ds-u1`** (7 standard passes, 1 rewrite): the two other published courses. `ds-u1`'s passes
   include lining it up with the eight courses.
6. **`ds-1-1`, `ds-2-1`, `ds-3-1`** (11 standard passes, 1 rewrite): the teachers' ladder, in order.
7. **`ds-s3`, `ds-s2`, `ds-s1`** (9 rewrites, 3 standard passes): not published today, so they wait.
8. **Text only:** the summaries' last lines; the code steps of `ds-1-1`, `ds-2-1` and `ds-4-1-3`; every unit check
   named above; the placement questions (see Reference).

**Edits go to the sources, not to the course files.** The nine older course files and their storyboards are
generated. Teachers' units: `H:\htdocs\lessonstudio\out\ds-work\units\ds-*.mjs`. Students' units: the same folder
with `stu\ds-s*.mjs` and `stu\ds-s*.steps.mjs`. Storyboards: `out\ds-work\parts\DS-*.story.mjs`, built by
`gen\story.mjs` into the three Lesson Studio files. The students' storyboard files are two-line patches on the
teachers' ones (`stu(T, { fix })`): a rewritten students' lesson needs a full authoring file of its own, and so does
a students' lesson with a standard pass, because the teachers' file under it changes too. `ds-u1` comes from
`out\uni-work` (`units\ds-u1.mjs`, `parts\DS-U1-*.story.mjs`). `ds-capstone` has no source: edit the JSON.

In all: 21 standard passes, 11 rewrites and 32 new lessons. Narration is about $2.14 for both languages.

## Decisions for the user

1. **Phones first on the university path?** The drafts assume a laptop with Python 3.10: every practical task reads
   files and writes files. Recommended: every course can be finished on a phone, with a phone version of its project
   (small data written into the step, the written parts on paper or typed); the drafts' full task is the computer
   version, offered to everyone and expected before the capstone. Only the capstone needs a computer. The other
   choice is to require a computer from `ds-m2`. What runs where:

   | Course | On the phone: sandbox and Labs | Needs a computer |
   |---|---|---|
   | `ds-m1` | all four lessons; the data dictionary of the 15-answer sample, by hand; labs `table`, `sampling`, `datalog`, `quality` | the parser for free-text times and the speed checks on the survey files |
   | `ds-m2` | mapping codes and digits, counting missing markers, duplicates and a join on a few rows; labs `clean`, `table`, `join`, `pipeline` | the two real files and their encodings; writing the clean file and the log; the optional pandas example |
   | `ds-m3` | summaries with `ulab`, a text histogram, drawn ratios against real ones; labs `spread`, `histogram`, `chartpick` | charts written as SVG files; the 240-row survey |
   | `ds-m4` | the `sampling` lab; means inside each group; a small seeded simulation | 1,000 repeats on the 3,000-student population |
   | `ds-m5` | resampling five values by hand; a bootstrap of about 30 values; the `sampling` lab | 5,000 resamples of 240 values, and three seeds |
   | `ds-m6` | all 20 relabellings of six values, on paper and in loops; a shuffle of about 12 values; the sum 1 − 0.95 to the power 20 | 10,000 shuffles of 60 trips; twenty groups of pure noise |
   | `ds-m7` | a line by sums or `ulab`; a split by slicing; the error against the mean on 20 to 40 trips; labs `scatter`, `overfit` | 400 trips from a file; a validation split with three candidates |
   | `ds-m8` | a SHA-256 fingerprint of a short text; errors by group with a dictionary; a word check for overclaiming; labs `hash`, `bias`, `chartpick` | one script that writes the manifest, the charts and the report |
   | `ds-capstone` | planning and the report's outline | everything else |

   The sandbox runs MicroPython with `ulab`, `csv`, `json` and `hashlib` (courses use all four today), stops a
   program after three seconds, and compares printed output only. No course uses `statistics`, `itertools` or
   `random` in it yet, and the drafts lean on all three (`statistics.quantiles`, `itertools.combinations`,
   `random.Random(seed)`): phone steps use plain loops and `ulab`, and `random` with a seed if the sandbox offers it
   (step 2 of the work). Cost of phones first: a phone version of eight projects, in text.
2. **Should the first university course need Python?** Recommended, and written into this plan: no. `ds-m1` says
   “No experience needed.”; its code is read and completed, and its project's phone version has no blank editor.
   A student can then begin Data science beside Programming, as in every other track's first university course,
   and meets written code at `ds-m2`, which names `code-m5`. The other choice is the drafts' own bar: Python to
   functions, lists and dictionaries before module 1, which puts five Programming courses in front of the first
   Data science lesson. Cost: three guided code steps in place of the drafts' three computer exercises, which stay
   as the project's computer version.
3. **One new Labs app, `resample`?** Recommended: yes. The heart of `ds-m5` and `ds-m6` is thousands of resamples,
   and the sandbox's three seconds cannot do that in Python. A Labs app can: one small sample, a switch between
   “resample with replacement” (the bootstrap) and “shuffle the labels” (the permutation test), a histogram of the
   results, and the cut at 2.5% from each end. It would also serve `ds-u1-1` and `ds-4-1-1`. Without it, three
   lessons fall back to small numbers in the sandbox. Three smaller gaps need no decision now: the `spread` lab
   shows no standard deviation; no lab fits comparing inside groups (`ds-m4-2`) or random assignment (`ds-m4-3`);
   the two labs used at primary were written for adults. The `split` lab is about two machines sharing a training
   step, not about training and test rows: no course here uses it. Cost: one app.
4. **Which capstone?** Recommended: the drafts' study replaces today's brief, under the same id. It is what the
   eight courses prepare for, it uses made-up data only, and it works offline with no account. Today's project needs
   cross-validation of three models and a fairness fix, which this path does not teach, and a public dataset about
   students. The other choice keeps today's project as a second, optional one for students who also take the AI
   track's university courses. Cost: the capstone's text and starter files. To decide with it: how work is handed
   in (today: a GitHub repository and `darsi-check.json`; the drafts: a folder of files).
5. **Retire `ds-s4` from the university path?** Recommended: yes, on the day `ds-m1` is published. It stays a draft
   with its id, and its learners keep their progress; certificates show only for published courses. Until then it
   is the only published students' course in the track. Cost: none. Later it could be reworked as a second
   upper-secondary course (four standard passes and lower code steps); that is a separate decision.
6. **Where do teachers start writing Python?** Recommended: at level 3. At level 2 the code is read and completed in
   guided steps, so `ds-2-1` needs only `ds-1-1`; from level 3 teachers write short loops, and the course names
   `code-2-1`. The other choice keeps written code at level 2 and sends every teacher to Programming after the
   Beginner course. Cost: four code steps become guided, in text.
7. **Rewrite the three school-stage courses?** Recommended: yes, after the university path, since they are not
   published today. With it goes one choice: nearest neighbours leaves `ds-s3`, because `ai-s3-2` teaches it with
   the same lab. Cost: 9 rewrites and 3 standard passes, about $0.42 of narration.
8. **A second course for lecturers, `ds-u2`?** `ds-u1` does not cover how to teach null models, p-values and many
   comparisons, or sources, consent and cleaning, which are four of the students' eight courses. Recommended: later,
   after the eight courses exist and have been taught once. Cost then: 4 new lessons, about $0.16.

## Reference

### How the courses talk about data

- **By hand first.** Every idea is met on paper, with cards or in a lab before any code: nine pupils in a line for
  the median, a bag of numbered cards for samples, six paper slips for a permutation test.
- **Honest about limits, every time.** A finding has a number, a source and what it cannot show. A pattern is not a
  cause. A sample wobbles. A good average can hide a group.
- **Data informs, people decide.** Every lesson on a model or a trial ends with who decides and who checks.
- **No real people in the data.** Schools, pupils, campuses and surveys are made up; the university courses say so
  in every reading, because their data are generated by a program. Projects use no names and no faces.
- **No device? Still teachable.** Every teachers' lesson has a class activity without devices.
- **The cast.** Ms Salma (maths) is the sceptic who asks how sure we are. Ms Amina (primary) brings classroom
  questions. Mr Okafor (science) brings measurements: the rain gauge, the library log. Mr Joseph (computer studies)
  reads the code. Dr Farah (education lecturer) leads claims, fairness and decisions. In students' videos they are
  the students' teachers, and the hook is about someone the student's age. In `ds-u1` they are lecturers.

### Facts the courses use

Keep the numbers the same in the video, the reading, the lab and the slides.

- **`ds-1-1`:** late arrivals over four weeks: twelve on Mondays, about three on other days; the cause was a bus.
  Nine marks: 9, 11, 12, 12, 13, 14, 14, 15, 16; they add to 116; mean about 13; median 13; modes 12 and 14. With
  one pupil at zero the mean drops to about 11 and the median to 12. An axis from 68 makes a rise from 70% to 74%
  look three times as big (the `chartpick` lab).
- **`ds-2-1`:** sixty heights (the `histogram` lab; bin widths of 3 to 6 show the shape best). Two classes with a
  mean of twelve: standard deviations of about one and about five.
- **`ds-3-1`:** a slope of 2 marks per hour, for pupils who read 0 to 5 hours. A model 100% right on training
  pupils and 60% on test pupils. One pupil in ten needs help, so “always no” is 90% accurate; of a hundred pupils,
  8 caught, 2 missed, 6 false alarms, 84 rightly left alone.
- **`ds-4-1`:** two samples of forty give fifty and sixty minutes; the true value is fifty-five; four times the
  pupils halves the margin. The `sampling` lab's school has 400 pupils. A later start: late arrivals fell from
  twelve to five in the trial classes and barely changed in the others.
- **The university drafts** (made-up data, fixed seeds). Survey version 1: 15 answers, 8 columns, 2 of 9 provenance
  fields recorded. 240 respondents: mean commute 21.1 minutes, median 19; one extra answer of 180 minutes moves the
  mean to 21.8 and leaves the median. North 21.5 minutes, South 20.5: a real ratio of 1.05 drawn as three times.
  A population of 3,000 with a true mean of 22.49; bus-stop interviews average almost 28, voluntary replies over 30.
  Shuttle users commute 9.7 minutes less, and 0.4 less once dorm residents are compared with dorm residents. A 95%
  interval for the mean: 19.46 to 23.09; South minus North: about −4.4 to +2.4. Timetable pilot: mean waits 9.36
  and 6.82 minutes, p about 0.014 with 10,000 shuffles; twenty tests of pure noise give at least one p below 0.05
  about 64% of the time. Trips: minutes = 9.19 + 2.45 × kilometres; on held-out trips the mean baseline is off by
  about 11.5 minutes and the line by about 7; the leaky model by 0.05. The final report: 3.84 minutes against 11.47.

### Code in this track

- Phone steps have at most about 12 lines, with lines of 45 characters or fewer, on small data written into the
  step. Charts are text (`print("#" * n)`); real pictures are in the labs.
- The sandbox offers `ulab` (`np.mean`, `np.median`, `np.std` are used today). It has no pandas and draws nothing.
- Teachers and school students never meet a function they must write. University students write functions from
  `ds-m1`'s project on.

### Labs across the track

Teachers meet `table`, `spread`, `chartpick` and `bias` at level 1; `histogram`, `spread`, `scatter` and `quality`
at level 2; `scatter`, `overfit`, `knn` and `threshold` at level 3; `sampling`, `kmeans`, `bias` and `decision` at
level 4. A lab met again comes with a harder task: `spread` at level 2 watches the middle half, not the mean;
`scatter` at level 3 shows the line of best fit and its average miss; `bias` at level 4 is read as error rates by
group. School students meet `table`, `spread`, `chartpick` and `sampling` (primary); `spread`, `histogram`,
`scatter` and `quality` (lower secondary); `spread`, `scatter`, `overfit` and `threshold` (upper secondary).
University students meet 14 labs across the eight courses, among them five from Data engineering (`table`, `clean`,
`join`, `quality`, `pipeline`), one from IoT (`datalog`) and one from Cyber security (`hash`). Nine lessons have no
fitting lab and use a sandbox step, and three name the new `resample` app.

### Placement

`content/placement/data-science.json`: three questions per audience and level. They change with the courses.

- `ds-s1-1` asks for a mean, which primary no longer teaches: it becomes the middle value of five heights.
- `ds-s3-2` asks about nearest neighbours, which leaves `ds-s3`: it becomes a slope to read. `ds-s3-3` (“18 of 20
  right: what is its accuracy?”) is below its level: it becomes a precision and recall question.
- `ds-s4-1` to `ds-s4-3` talk about pupils and are below university level (“report the sample size”). With eight
  courses at level 4, three questions can no longer mean “skip this course”. They should separate a student who
  can skip `ds-m1` to `ds-m3` from one who cannot: a unit of observation, a missing-value trap, a cut axis. How the
  app orders and offers eight courses at one level is for the app, not this plan.
- Teachers' level 3 now needs Python from `code-2-1`: one of `ds-t3-1` to `ds-t3-3` becomes a question that reads a
  short loop, written out in the prompt.

### The university drafts

“Darsi University UNI-DATA: Data Science, Statistics and Evidence”, drafts of 8 November 2026: 8 modules of 3
lessons, each with worked examples, exercises on paper and on a computer, a 6-question quiz and a practical task
with a 20-point rubric; a capstone with a brief, a marking guide and starter files; about 60 hours in all; English
and Modern Standard Arabic. Python 3.10 or newer, standard library only, no network. All data are made up by a
seeded program, and the drafts tell instructors what was built in (the shuttle has no effect at all), so that
learners' conclusions can be checked against the truth. Their own list of limits: not reviewed by people, learning
not measured, one environment, optional libraries untested, made-up data only, no licences cleared.
