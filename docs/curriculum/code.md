# The Programming track

Eight courses, `code` (Arabic «البرمجة»): four for teachers, by expertise, and four for students, by school stage. The
levels, ids and the shape of a course and a storyboard are in `docs/CURRICULUM.md`; the rules every course keeps, and the
code steps, are in `docs/CONTENT.md`.

## How the track builds

| Level | Teachers | Students (stage) |
|---|---|---|
| 1 | `code-1-1` **Computational thinking, unplugged and with blocks**: algorithms, loops, decisions and debugging, breaking problems down | `code-s1` **Give instructions** (primary, 9–12): exact instructions, loops, decisions, finding bugs, with the robot |
| 2 | `code-2-1` **Python for teachers**: print and variables, decisions, loops, lists of marks; a tool for their own work | `code-s2` **First Python** (lower secondary, 12–15): print, variables and input, if, loops |
| 3 | `code-3-1` **Teaching and assessing code**: PRIMM and tracing, Parsons problems, teaching debugging, misconceptions and feedback | `code-s3` **Functions, lists and algorithms** (upper secondary, 15–18): functions with tests, lists, searching, sorting |
| 4 | `code-4-1` **Leading computing with few devices**: unplugged then plugged, one phone for many pupils, code on paper, a scheme of work | `code-s4` **Algorithms and software engineering** (university): big O, recursion, data structures, testing |

- **Level 1** has no typing: exact instructions, loops and decisions with paper, games and the robot's command cards
  (`blocks`). **Level 2** writes real Python: short programs that run on the phone. **Level 3** is about quality: for
  teachers, how to teach and assess code; for students, functions with tests and the classic algorithms. **Level 4**
  leads: a whole school's computing with few devices, or university algorithms and engineering.
- **Code on the phone.** From teachers' level 2 and students' s2, every lesson has at least one code step (`code`,
  `parsons`, `codefill`, `bug`, or a `snippet` on a question). Level 1 and s1 use `blocks` and very short Parsons.
  Programs are Python (MicroPython on the phone, the same Python as on a micro:bit, ESP32 or Raspberry Pi Pico). Nothing
  needs a computer, and the Python download is 0.29 MB, once.
- **Few or no devices.** Every lesson has an activity that works with paper, chalk and one phone. The kits print the code
  steps as paper exercises: Parsons strips to number, gaps to fill, a line to circle, the robot grid with cut-out cards.
- **Local examples:** class registers and marks, the school canteen queue, market prices, bus routes, football
  tables, rainfall in the school garden, phone credit, the timetable.
- **The cast** (the same five as the other tracks): Mr Joseph (computer studies, Kenya) leads most of the Python; Ms
  Salma (maths) brings algorithms, counting steps and tests; Amina (primary) unplugged work and the robot; Mr Okafor
  (science) data, loops over readings and lists; Dr Farah (education lecturer) the teaching research, assessment and
  leading a school. In students' videos they are the students' teachers.

## Facts the courses use

Keep these the same in every course, and the same as the Labs apps (`apps/web/src/labs/apps/*/model.ts`).

- **Algorithm:** a precise list of steps, in order, that finishes and solves a problem. A computer does exactly what the
  program says, not what we meant. **Computational thinking:** decomposition (break it down), pattern recognition,
  abstraction (keep what matters, leave out the rest) and algorithms. Programs are built from **sequence, selection
  (decisions) and repetition (loops)**.
- **The robot** (`robot` lab, `blocks` steps): command cards Forward, Turn left and Turn right; a card can be repeated
  1 to 4 times (the first idea of a loop). The lab has six grids; the fewest cards for them are 1, 2, 3, 6, 5 and 9. The
  program must end on the flag; walking into a wall or off the grid stops it.
- **Python on the phone:** MicroPython 1.29, real Python 3 syntax. A program stops after 3 seconds (so an endless loop
  can't hang the phone), and runs about a million simple steps in well under a second on a PC. Recursion stops at about
  150 nested calls (desktop Python's default limit is 1,000). Strings can't be reversed with `[::-1]`.
- **The beginner's facts:** a program runs top to bottom, one line at a time. `=` stores a value; `==` compares.
  `input()` always gives text: `"5" + "3"` is `"53"`, `int("5") + int("3")` is `8`. `range(1, 5)` gives 1, 2, 3, 4: it
  stops before the second number. Lines inside `for`, `while`, `if` and `def` are indented by 4 spaces; a line that
  starts a block ends with a colon. Lists count from 0. `print` shows a value; `return` hands it back to the caller.
- **The bugs lab** has six common bugs: a missing colon, `=` for `==`, off by one (`range(1, 5)` to count to 5),
  a missing indent, a misspelt name (`scor`), text + a number (`"Age: " + 12`). The `trace` lab's examples: the loop
  total of 1 to 4 is 10, and with `range(1, 11)` it is 55; marks `[12, 7, 15]` give 2 passed; `area(4, 3)` is 12.
- **Searching** (`search` lab): one by one takes up to n guesses; halving (binary search) at most 7 for 1 to 100,
  about 10 for 1,000 and about 20 for a million. Binary search only works on a sorted list.
- **Sorting** (`sorting` lab): bubble, insertion, selection and merge sort. Going from 8 to 32 bars, bubble sort needs
  about 16 times the comparisons, merge sort only about 6 times. Insertion sort wins on nearly sorted lists; selection
  sort makes the fewest swaps.
- **How work grows** (`bigo` lab): finding a name in a sorted list of n is log n, the tallest pupil n, sorting n log n,
  every pair (shared birthdays) n². A phone does roughly ten million simple steps a second: for a million items, n is a
  tenth of a second and n² about 14 hours. Doubling n doubles n work and quadruples n² work.
- **Recursion** (`recursion` lab): a base case that answers at once, and a recursive case that calls itself on a
  smaller problem. In `fib(5)`, `fib(2)` is worked out 3 times; remembering answers (memoisation) turns millions of
  calls into a few dozen. The Towers of Hanoi take 2ⁿ − 1 moves: 7 for 3 discs, 15 for 4.
- **Stacks and queues** (`stack` lab): a stack is last in, first out (undo, the back button, a pile of plates, the call
  stack); a queue first in, first out (the canteen line, the printer). A dictionary finds a value by its key in about
  the same time however big it grows; `x in a_list` checks the items one by one.
- **Bits** (`binary` lab): 8 bits make a byte, 0 to 255; 65 is the letter A; an Arabic letter takes 2 bytes in UTF-8.
- **Teaching research** (teachers' levels 3 and 4):
  - **PRIMM** (Sentance, Waite and Kallia, 2019): Predict, Run, Investigate, Modify, Make. Pupils read and predict before
    they write.
  - **Parsons problems** (Parsons and Haden, 2006): put given lines in order, and indent them. Ericson, Margulieux and
    Rick (2017) found Parsons problems took less time than writing or fixing the same code, with the same learning gains.
  - **Use–Modify–Create** (Lee and others, 2011): use a working program, change it, then make your own.
  - **CS Unplugged** (Bell, Witten and Fellows, University of Canterbury, New Zealand): free activities that teach
    computing ideas with cards, string and chalk. Unplugged teaches concepts; link it to code soon after.
  - **Pair programming:** a driver (types or taps) and a navigator (reads, checks, thinks ahead); swap every 5 to 10
    minutes. With one phone for four pupils: driver, navigator, tester and reporter, swapping each task.
  - **Hinge questions** (Dylan Wiliam): one quick multiple-choice question at the turning point of a lesson, where each
    wrong answer shows a particular misconception.
  - **Jon Bentley's binary search:** when he asked professional programmers to write it, about 90% of the programs had
    bugs (Programming Pearls, 1986).

## Writing the code steps

- Python only (SQL belongs to the Data engineering track). Keywords, names and the text inside the code stay in English,
  left to right, in both languages; names of people in code are made up (Amina, Kofi, Layla, Omar, Zainab, Chidi…).
- A `code` step: at most 12 lines, lines up to 40 characters where possible; at least two tests with different inputs
  (so a hard-coded answer fails), a `hint` on each test, one to three `hints`. The starter is the beginning of the
  program, never a solution; it must fail. Prefer whole numbers in printed results; avoid `round()` on halves (the
  phone's MicroPython rounds 2.675 to 2.68 where desktop Python gives 2.67).
- `parsons`: one correct order only (no two lines that could swap), no two identical lines, 4 to 8 lines, and one or two
  distractors that show a misconception (`if mark = 50:`, `for i in range(1, 5)` when 5 is needed).
- `codefill`: the gaps are the idea being taught; distractors are the tempting wrong tokens.
- `bug`: exactly one mistake; the `explain` names the misconception, not just the fix.
- `blocks`: grids up to 6 × 6 so the squares are big on a phone; `maxBlocks` one or two above the fewest cards.
- **"What does this print?"** is a `choice` with a `snippet`; its wrong options are the answers a misconception gives.
- **The kit's worksheet prints the first five questions and code steps** of a lesson: put the code steps among them,
  so classes without devices get them on paper.

## Words

| English | App (Modern Standard Arabic) | Videos (Egyptian Arabic) |
|---|---|---|
| program, code | برنامج، الكود | البرنامج، الكود |
| algorithm | خوارزمية | الخوارزمية |
| variable, value | متغيّر، قيمة | المتغيّر، القيمة |
| loop | حلقة (تكرار) | اللوب (التكرار) |
| condition, decision | شرط، قرار | الشرط، القرار |
| function | دالة | الدالة (الفانكشن) |
| list | قائمة | الليست |
| bug, debugging | خطأ برمجي، تصحيح الأخطاء | الغلطة، تصليح الغلطات |
| error message | رسالة الخطأ | رسالة الخطأ (الإيرور) |
| indent | إزاحة | المسافة في أول السطر |
| trace, trace table | التتبّع، جدول التتبّع | نتتبّع، جدول التتبّع |
| test, edge case | اختبار، حالة حدّية | الاختبار (التست)، الحالة الحدّية |
| unplugged | دون أجهزة | من غير أجهزة |
| computational thinking | التفكير الحاسوبي | التفكير الحاسوبي |
| Parsons problem | مسألة بارسونز | مسألة بارسونز |
| pair programming | البرمجة الثنائية | البرمجة في أزواج |
| recursion | الاستدعاء الذاتي | الاستدعاء الذاتي (الريكيرجن) |
| stack, queue, dictionary | مكدّس، طابور، قاموس | الستاك، الطابور، القاموس (الديكشنري) |
| Python | Python | بايثون |

Python keywords (`print`, `if`, `for`, `range`, `def`, `return`…) stay in English in both, including the narration.

## `code-1-1` Computational thinking, unplugged and with blocks (teachers, level 1)

**التفكير الحاسوبي: دون أجهزة وبالكتل البرمجية.** The ideas inside every program, taught before anyone touches a device:
exact instructions, loops, decisions and debugging, and breaking a problem down. With games, chalk, paper and the robot.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Algorithms: exact instructions (الخوارزميات: تعليمات دقيقة) | Define an algorithm: precise steps, in order, that finish. Explain why a computer needs exact, unambiguous instructions. Run the "human robot" game and write an algorithm pupils can follow. | `robot` | `blocks` (one corner); `order` an everyday algorithm | CODE.1, DC.3.4 |
| 2 Loops: repeat the pattern (الحلقات: كرّر النمط) | Spot repeated steps and replace them with a loop. Compare two programs that do the same job by how many cards they need. Explain why a loop makes a program shorter and easier to change. | `robot` | `blocks` that needs repeats; a first `snippet` (the robot's loop in Python) | CODE.1, CODE.2 |
| 3 Decisions and debugging (القرارات وتصحيح الأخطاء) | Write a decision as IF … THEN … ELSE, with AND or OR. Debug with a routine: test, find the first step that goes wrong, change one thing, test again. Treat bugs as normal, for pupils and for you. | `logic` | `bug` (a robot program written as lines: which line is wrong?); `blocks` | CODE.1, CODE.3 |
| 4 Break it down (فكّك المسألة) | Name the four parts of computational thinking and find them in a school task. Compare two algorithms for the same job by counting steps (one by one, or halving). Plan a computational-thinking moment in a subject you teach. | `search` | `order`; a `snippet` (guess-the-number as a short program) | CODE.1, DC.5.3 |

Unplugged activities: the human robot on a chalk grid with arrow cards, a clapping or dance pattern written as a loop,
"Simon says if…" with conditions, swapping instruction cards to find each other's bugs, guess my number by halving.

## `code-2-1` Python for teachers (teachers, level 2)

**Python للمعلمين.** Write your first real programs on your phone, as a tool for your own work: print and variables,
decisions, loops, and lists of marks. Every exercise runs right here, offline.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 First programs: print, variables and input (البرامج الأولى: الطباعة والمتغيّرات والإدخال) | Run a program and explain that Python runs it line by line, top to bottom. Store values in variables and tell text from numbers. Read input, and turn it into a number with `int()`. | `trace` | `snippet` ("5" + "3"); `parsons`; `codefill` (`input`, `int`); `code` (the class average of two tests) | CODE.2, DC.3.4 |
| 2 Decisions: if, elif and else (القرارات: if وelif وelse) | Compare values with ==, !=, <, >, <= and >=. Write if, elif and else with colons and indents. Turn a marking rule into code and test it at the boundaries (49, 50). | `bugs` | `code` (grade bands, tested at the boundaries); `parsons`; `bug` (`=` for `==`) | CODE.2, CODE.3 |
| 3 Loops: for, range and while (الحلقات: for وrange وwhile) | Repeat with `for` and `range`, and say where `range` stops. Build a total in a loop. Use `while` to repeat until something changes. | `trace` | `code` (a times table); `codefill` (`range`); `snippet` (what `range(1, 5)` gives); `bug` (off by one) | CODE.2, CODE.1 |
| 4 Lists: a tool for your marks (القوائم: أداة لدرجات صفّك) | Keep marks in a list and use `len`, `sum`, `max` and `min`. Loop over a list to count and average. Read a small CSV file of (made-up) marks and summarise it. | `sorting` | `code` with a CSV file; `parsons`; `bug` (counting from 0) | CODE.2, DC.1.3 |

Privacy: practise on made-up marks or first names only; a program on your phone keeps the data on your phone.

## `code-3-1` Teaching and assessing code (teachers, level 3)

**تدريس البرمجة وتقييمها.** Teach programming the way research says works: read and predict before writing, Parsons
problems, debugging as a skill you teach, and the misconceptions every class has, with feedback that helps.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Read before you write: PRIMM and tracing (اقرأ قبل أن تكتب: PRIMM والتتبّع) | Plan a PRIMM lesson: Predict, Run, Investigate, Modify, Make. Trace a program in a trace table, line by line. Write predict questions whose wrong answers reveal misconceptions. | `trace` | `snippet` predict questions; `code` (Modify: change a working program); `order` (PRIMM) | CODE.4, CODE.2 |
| 2 Parsons problems (مسائل بارسونز) | Explain what a Parsons problem is and why it works. Design one with good distractors and indentation. Run it on paper strips, with no devices. | `sorting` | two `parsons` (one with a distractor); `codefill`; `snippet` | CODE.4, CODE.1 |
| 3 Teaching debugging (تعليم تصحيح الأخطاء) | Teach a debugging routine: read the error, find the line, check your guess, change one thing, test again. Read Python's error messages with a class. Use printing values and explaining aloud ("rubber duck") as tools. | `bugs` | two `bug` steps; `code` (fix a program); `match` (error → meaning) | CODE.3, CODE.4 |
| 4 Misconceptions and feedback (التصوّرات الخاطئة والتغذية الراجعة) | Recognise the common misconceptions: = and ==, a variable holds one value, `range` stops early, indentation, input is text, `or` in conditions. Use hinge questions with diagnostic wrong answers. Give feedback that asks a question instead of fixing the code. | `logic` | `snippet` hinge questions; `bug` (`if day == "Sat" or "Sun":`); `codefill` | CODE.4, CODE.3 |

## `code-4-1` Leading computing with few devices (teachers, level 4)

**قيادة تعليم الحوسبة في مدرسة قليلة الأجهزة.** Lead computing in a school with few or no devices: unplugged lessons that
teach real ideas, one phone for many pupils, code on paper, and a scheme of work colleagues can follow.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Unplugged, then plugged (دون أجهزة أولًا، ثم بالأجهزة) | Choose unplugged activities that teach real ideas (binary, sorting, searching, algorithms). Link each one to code soon after. Judge what unplugged can and can't do. | `binary` | `snippet` (the binary cards in Python); `parsons` | CODE.4, CODE.1 |
| 2 One phone, many pupils (هاتف واحد لتلاميذ كثيرين) | Run pair programming (driver and navigator) and group roles (driver, navigator, tester, reporter), with swaps. Live-code from the front with pupils predicting. Prepare phones to work offline. | `bugs` | `code` (a program a pair fixes); `bug`; `snippet` | CODE.4, DC.5.1 |
| 3 Code on paper (الكود على الورق) | Use printed Parsons strips, trace tables and desk checks with a class. Assess programming on paper. Use Darsi's printed kits as paper exercises. | `trace` | `parsons`; `snippet` (a trace-table row); `codefill`; `bug` | CODE.4, CODE.3 |
| 4 A scheme of work (خطة عمل لتعليم الحوسبة) | Plan progression across grades: unplugged, the robot and blocks, then Python. Build a term of units with assessment points and a device timetable. Make it last: inclusion, a club, colleagues who can teach it. | `sorting` | `snippet` (which grade is this task for?); `order` | CODE.4, DC.5.2 |

## `code-s1` Give instructions (students, primary, 9–12)

**أعطِ التعليمات: التسلسل والتكرار والروبوت.** Robots and computers do exactly what you tell them. Give exact
instructions, repeat them with loops, make decisions, and find and fix bugs. No typing: cards, paper and the robot.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Exact instructions (تعليمات دقيقة) | Say what an algorithm is: steps in order. Explain why a robot needs exact instructions. Put the steps of an everyday job in order. | `robot` | `blocks` (straight, then one turn); `order` | CODE.1, DC.3.4 |
| 2 Repeat it: loops (كرّرها: الحلقات) | Spot steps that repeat. Use a repeated card (a loop) to make a program shorter. Count cards to find the shortest program. | `robot` | `blocks` that needs repeats | CODE.1 |
| 3 If this, then that (إذا حدث هذا، فافعل ذاك) | Say what a decision is: if something is true, do this, else do that. Use AND and OR in simple rules. Test a rule in every case. | `logic` | `blocks` (a choice of routes) | CODE.1 |
| 4 Find and fix bugs (اعثر على الخطأ وأصلحه) | Say what a bug is, and that every programmer makes them. Find the first step that goes wrong, change one thing and test again. Read a short robot program written as words. | `robot` | `blocks` (fix it); a very short `parsons` (`forward()`, `right()`…) | CODE.1, CODE.3 |

## `code-s2` First Python (students, lower secondary, 12–15)

**أولى خطواتك في Python: الطباعة والمتغيّرات وif والحلقات.** Write real Python on your phone: make it print and
calculate, remember things in variables, make decisions and repeat with loops.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Hello, Python (مرحبًا يا Python) | Print text and numbers. Calculate with + − * / and **. Explain that a program runs top to bottom, exactly as written. | `trace` | `snippet`; `parsons`; `code` (print and calculate) | CODE.2, DC.3.4 |
| 2 Variables and input (المتغيّرات والإدخال) | Store and change values in variables. Ask with `input()` and turn text into a number with `int()`. Explain why `"5" + "3"` is `"53"`. | `bugs` | `code` (age next year); `bug` (text + a number); `codefill` | CODE.2, CODE.3 |
| 3 Decisions: if and else (القرارات: if وelse) | Compare with == and the other operators. Write if, elif and else with colons and indents. Combine conditions with `and` and `or`. | `logic` | `code` (a ticket price by age, tested at the boundary); `parsons`; `bug` (`=` for `==`) | CODE.2, CODE.1 |
| 4 Loops: for and while (الحلقات: for وwhile) | Repeat with `for` and `range`. Count and add up in a loop. Use `while` to repeat until something happens, and avoid a loop that never ends. | `search` | `code` (a times table); `codefill` (`range`); `snippet` | CODE.2, CODE.1 |

## `code-s3` Functions, lists and algorithms (students, upper secondary, 15–18)

**الدوال والقوائم والخوارزميات.** Write programs that are organised and tested: functions that do one job, lists that
hold data, and the classic algorithms for searching and sorting, judged by the work they do.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 Functions: one job each (الدوال: لكل دالة مهمة) | Define functions with parameters, and `return` a result. Tell `return` from `print`. Test a function with `assert`. | `trace` | `code` (a function, checked with tests); `parsons`; `snippet` (print or return?) | CODE.2, CODE.3 |
| 2 Lists and loops (القوائم والحلقات) | Index a list from 0 (and from the end with −1), and add to it. Use a loop to total, count and find the largest without `max()`. Choose a list as a stack or a queue. | `stack` | `code` (the largest without `max`); `codefill`; `bug` (IndexError) | CODE.2, CODE.1 |
| 3 Searching (البحث) | Write linear search. Explain binary search and why the list must be sorted. Count the worst-case steps of each for 1,000 items. | `search` | `code` (linear search returning the position or −1); `parsons` (binary search); `snippet` | CODE.1, CODE.2 |
| 4 Sorting, and judging algorithms (الترتيب والحكم على الخوارزميات) | Explain bubble, insertion and merge sort. Judge algorithms by correctness first, then the work they do. Test with edge cases: empty, one item, already sorted, repeats. | `sorting` | `code` (`is_sorted`, with edge-case tests); `parsons` (insertion sort); `snippet` | CODE.1, CODE.3 |

## `code-s4` Algorithms and software engineering (students, university)

**الخوارزميات وهندسة البرمجيات.** University computing, on a phone: how work grows, recursion, choosing data structures,
and testing code like an engineer.

| Lesson | Objectives | Lab | Code steps | Competencies |
|---|---|---|---|---|
| 1 How work grows: big O (كيف ينمو العمل: O الكبيرة) | Count the steps an algorithm takes as the input grows. Classify code as O(1), O(log n), O(n), O(n log n) or O(n²). Replace an O(n²) method with a faster one. | `bigo` | `snippet` (what is its big O?); `code` (find a repeat in O(n) with a set); `codefill` | CODE.1, CODE.2 |
| 2 Recursion (الاستدعاء الذاتي) | Write recursive functions with a base case and a recursive case. Follow the call stack, and know its limits. Speed up repeated work by remembering answers (memoisation). | `recursion` | `code` (a recursive function, with tests); `parsons` (factorial); `bug` (no base case) | CODE.1, CODE.2 |
| 3 Data structures (هياكل البيانات) | Choose a list, stack, queue, set or dictionary by the operations a job needs. Use a stack to check brackets. Count with a dictionary. | `stack` | `code` (balanced brackets with a stack); `codefill` (counting with a dictionary); `snippet` | CODE.1, CODE.2 |
| 4 Testing like an engineer (الاختبار بعقلية المهندس) | Write unit tests with `assert`, including edge cases. Find and fix a boundary bug in binary search. Work test-first, and review code with others. | `search` | `code` (fix a binary search so it passes edge-case tests); `bug`; `order` (test-first cycle) | CODE.3, CODE.4 |

## Labs across the track

Teachers meet `robot`, `logic` and `search` at level 1; `trace`, `bugs` and `sorting` at level 2; `trace`, `sorting`,
`bugs` and `logic` at level 3, as tools to teach with; and `binary`, `bugs`, `trace` and `sorting` at level 4, in a
classroom with one phone. Students meet `robot` and `logic` (s1); `trace`, `bugs`, `logic` and `search` (s2); `trace`,
`stack`, `search` and `sorting` (s3); and `bigo`, `recursion`, `stack` and `search` (s4). A lab met again comes with a
harder task: `trace` at teachers' level 3 is a trace table to fill in first; `search` at s4 is about the boundaries a
binary search must get right.
