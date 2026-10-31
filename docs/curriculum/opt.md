# The Optimization track

**الحلول المثلى.** Eight courses: four for teachers (levels 1–4, by expertise) and four for students (school stages:
`opt-s1` Primary, ages 9–12; `opt-s2` Lower secondary, 12–15; `opt-s3` Upper secondary, 15–18; `opt-s4` University).
Optimization is choosing the best plan under limits: the timetable, the exam week, the bus route, the school lunch on a
budget, who teaches which class. The track grows from naming a decision's goal, limits and options (level 1) to
modelling with Google's OR-Tools in Python and leading fair decisions at school (level 4). The levels, ids and the shape
of a course and a storyboard are in `docs/CURRICULUM.md`; the rules every course keeps are in `docs/CONTENT.md`.

## How the track builds

| Level | Teachers | Students |
|---|---|---|
| 1 | `opt-1-1` **Best choices: goals, limits, options**: decisions as optimization, shortest ways, quick rules and their traps, best for whom? | `opt-s1` **Shortest and best: puzzles, paths, packing** (Primary): pack the truck, the shortest way, sudoku, fair turns without clashes. Unplugged, no typing |
| 2 | `opt-2-1` **Models with numbers: variables, constraints, objective**: a model in maths, linear programming in 2D, whole numbers and yes/no choices, a first model in Python | `opt-s2` **Goals and limits: a model, linear programming in 2D** (Lower secondary): variables and inequalities, drawing the plans that fit, whole numbers, reading a model in Python |
| 3 | `opt-3-1` **Solving school problems in Python: timetables, routes, assignment**: CP-SAT timetables, exam slots, the bus route, matching teachers and classes | `opt-s3` **Let the computer search: knapsack, routes, timetables** (Upper secondary): brute force and dynamic programming, Dijkstra, nearest neighbour and 2-opt, a CP-SAT timetable |
| 4 | `opt-4-1` **Teaching decisions: trade-offs and fairness**: two goals, fair by design, when the model is wrong, big problems and leading a project | `opt-s4` **Operations research: LP, MIP, CP, OR-Tools modelling, heuristics** (University): the simplex method and shadow prices, branch and bound, propagation and search, local search and the optimality gap |

- **Level 1** names the parts of a decision and solves small ones by hand. **Level 2** writes them as a model (numbers,
  inequalities, a goal) and draws the smallest ones. **Level 3** models real school problems in Python and judges the
  answers. **Level 4** weighs goals against each other, designs for fairness, finds what a model is missing and leads
  others.
- **Fairness and trade-offs at every level, not only level 4:** who gets the class nobody wants (level 1), what the
  cheapest lunch leaves out (level 2), the child who rides the bus longest and the pupil with two exams in a row (level
  3), the worst-off against the total, and who decides (level 4).
- **No device needed.** Every lesson has an activity with paper, chalk, string or cards: item cards and a weight limit,
  a chalk map on the playground, pupils as villages for a bus route, graph paper for linear programs, a timetable grid
  with sticky notes. Code steps print as paper exercises in the kit.
- **Code** (`docs/CONTENT.md` "Code"): none at level 1 (students' s1 get a robot `blocks` step); at level 2 and s2
  reading and completing models (`snippet`, `parsons`, `codefill`, `bug`) and, for teachers, one small `code` step; from
  level 3 and s3 real modelling code with tests in every lesson.
- **Local examples:** the school garden and lunch, exam week, the school bus between villages, the supply truck to a
  village school, the timetable, class duties, the market, a flooded bridge.
- **The cast** (the same five as the other tracks; in students' videos they are the students' teachers): Ms Salma
  (maths) leads models and linear programming; Mr Joseph (computer studies, Kenya) leads the Python and OR-Tools; Amina
  (primary) brings everyday decisions and the youngest pupils; Mr Okafor (science, Nigeria) brings the garden, the
  lunch and the bus; Dr Farah (education lecturer) leads fairness, trade-offs and projects.

## Facts the courses use

The numbers come from the Labs apps (`apps/web/src/labs/apps/<id>/model.ts`); keep them the same everywhere.

- **The three parts** (same words in every course): the **options** a decision can take (the variables), the
  **limits** every plan must keep (the constraints) and the **goal**, one number to make as large or as small as possible
  (the objective). A plan that keeps every limit is **feasible**; the best feasible plan is **optimal**. Checking a plan
  is easy; finding the best can be hard.
- **Pack the truck** (`knapsack`): a 1,000 kg truck for a village school. Solar panels 600 kg, 42 points; desks 500 kg,
  33; books 500 kg, 32; water filter 300 kg, 15; footballs 200 kg, 8; chalk and paper 100 kg, 3. Greedy (most points
  per 100 kg first: solar 7, desks 6.6, books 6.4, filter 5, footballs 4, chalk 3) takes solar, filter, chalk: 60
  points. The best load is desks and books: 65. Up to 2,000 kg, 1,000 kg is the only size where greedy misses (at
  1,100 kg both take solar and desks, 75). Dynamic programming fills a table, one row per load, one column per 100 kg
  of room. Six loads have 2⁶ = 64 possible loads.
- **The shortest way** (`shortest`): Home, Tala, Bora, Kesi, Mina, Rubi, Sana, School. The shortest way is Home → Tala
  → Kesi → Mina → School, 4 + 3 + 2 + 4 = 13 km. The straight-looking way through Bora is 5 + 10 = 15 km. Flood the
  bridge between Kesi and Mina and it becomes Home → Rubi → Sana → School, 6 + 5 + 3 = 14 km. Dijkstra's method (1956)
  always settles the waiting place with the smallest distance first.
- **The bus route** (`routes`): the school and nine villages. Nearest neighbour drives 34.6 km; three 2-opt swaps (take
  out two roads, reverse the stretch between them) bring it to 28.6 km, the best route. A round trip from the school
  through n villages has n! ÷ 2 orders: 9 villages 181,440; 10 villages 1,814,400; 20 villages about 1.2 × 10¹⁸ (more
  than a billion billion: at a billion routes a second, about 38 years).
- **Teachers to classes** (`assign`): Amina, Karim, Leila, Yusuf, Zainab and maths 5, science 6, English 7, history 8,
  art 9, scored 0–9. First come, first served (Amina chooses first) totals 29: Amina takes maths, so Karim, who is good
  only at maths, gets science (2). The best total is 39 (the Hungarian method, 1955): Karim maths, Leila science, Yusuf
  English, Zainab art, Amina history; its lowest score is 6.
- **The garden** (`lp`): x tomato beds, y bean beds. Land x + y ≤ 8; water 2x + y ≤ 14 (cans a day); pupils' hours
  x + 3y ≤ 18 (a week). Profit 30x + 40y. Corners (0, 0), (7, 0), (6, 2), (3, 5), (0, 6). The best is (3, 5): 290. With
  tomatoes at 50 the best moves to (6, 2): 380. Land and hours are used up at (3, 5); water has 3 cans to spare. One
  more pupil-hour (19) gives 295, so an hour is worth 5; one more bed of land (9) gives 315, so a bed is worth 25; more
  water is worth nothing. With 24 hours the hours limit no longer shapes the best plan: (0, 8), 320.
- **School lunch** (`diet`): per portion, price in coins, energy (kcal), protein (g), iron (mg): rice 15, 260, 5, 0.4;
  beans 20, 230, 15, 4; egg 12, 75, 6, 0.9; milk 18, 150, 8, 0.1; greens 10, 40, 5, 6; groundnuts 8, 170, 7, 0.6. A
  lunch needs 700 kcal, 20 g protein and 5 mg iron. The usual plate (2 cups of rice, an egg, a cup of milk) costs 60
  coins and has only 1.8 mg iron. With at most 2 portions of a food, the cheapest is 1.3 cups of rice, 0.55 cups of
  greens and 2 handfuls of groundnuts: 41 coins (40.97), energy and iron met exactly, protein 23 g for free. Allow 4
  portions and it is almost all groundnuts (36.48): the model obeys only the rules it is given.
- **Whole numbers** (no lab of its own): 64 people on a trip; a minibus seats 14 for 300 coins, a bus 30 for 550. The
  linear program says 2.13 buses (1,173 coins). Round down (2 buses) and 4 people stay behind; round up (3 buses) and it
  costs 1,650. The best whole-number plan is 2 buses and 1 minibus: 1,400.
- **The timetable** (`timetable`): classes 5A, 5B, 6A; four periods; Mr Musa maths, Ms Huda science, Mr Ali English,
  Ms Rana art. Ms Huda leaves after period 3; 6A's maths test is in period 1. Propagation and search: 8 guesses, 3 dead
  ends; plain backtracking: 389 guesses. Add "the art room holds an exam in period 3": 2 guesses. Add "the lab is busy
  in period 1" too: no timetable exists (science needs 3 periods, only 2 are left), and the solver proves it.
- **Exam slots** (`colouring`): maths, English, science, Arabic, history, geography, art, French; six pupils (Sami,
  Hala, Omar, Dina, Nadia, Tarek). Greedy in list order needs 4 slots; DSatur finds 3; 3 is the fewest, because Omar's
  three exams (maths, Arabic, French) all clash with each other (a clique). In the `modeller` lab, `model.add(last <= 2)`
  is INFEASIBLE.
- **Sudoku** (`sudoku`): 4 × 4 needs no guess with propagation (plain backtracking: 12). 9 × 9 hard: propagation alone
  stops at 51 digits, 4 guesses finish it, plain backtracking needs 13,528. "17 givens": plain backtracking gives up
  after 100,000 guesses; propagation solves it without a guess.
- **Seating plan** (`anneal`): 12 pupils, 12 desks. Hill climbing stops anywhere from 37 to 47 and finds 37 about one
  run in four; simulated annealing about two in three. Starting temperature 0.5 behaves like hill climbing; 6 wanders a
  long time before it settles.
- **History:** linear programming and the simplex method, George Dantzig, 1947; the diet problem was one of its first
  uses. Dijkstra's shortest paths 1956; the Hungarian method 1955; dynamic programming, Richard Bellman, 1950s; 2-opt
  1958; simulated annealing 1983. OR-Tools is Google's free, open-source optimization toolkit.

## Code on the phone

- Python with Darsi's small OR-Tools (`docs/CONTENT.md` "Optimization"): `from ortools.sat.python import cp_model`
  (CP-SAT: `new_int_var`, `new_bool_var`, `add`, `add_all_different`, `add_exactly_one`, `minimize`, `maximize`,
  `CpSolver`, `solve`, `status_name`, `value`, `objective_value`) and `from ortools.linear_solver import pywraplp`
  (`CreateSolver("GLOP")` for linear programs, `"SCIP"` for whole numbers; `NumVar`, `IntVar`, `Add`, `Minimize`,
  `Maximize`, `Solve`, `solution_value()`, `Objective().Value()`). Use the snake_case names for CP-SAT, as Google's
  current guides do. Every lesson with code says once that the same program runs unchanged on the real OR-Tools on a
  computer or in Colab (`pip install ortools`), where it can solve problems with thousands of variables.
- **Expression on the left** of every comparison with a solver variable (`x + y <= 8`, never `8 >= x + y`): MicroPython
  has no reflected comparisons.
- `dual_value()` on a GLOP constraint gives its shadow price, on the phone as on the real OR-Tools; the lessons also
  find it by solving again with the limit one larger.
- **Tests check the objective and feasibility, not one particular solution** when there are ties: `check` with
  `assert solver.objective_value == 290` or a recomputed total, plus asserts that every limit holds. Print whole numbers
  with `int(...)` and decimals with `round(…, 2)`, so the output is the same on the real OR-Tools.
- Programs ≤ 12 lines in a `code` step, lines ≤ 40 characters where possible; school-sized problems (tens of variables).
- Videos show code with the `code` scene body (`"who": null`, ≤ 6 lines of ≤ 36 characters).
- **Videos use the optimization pack** (Lesson Studio `docs/packs/opt.md`) where it shows the method itself: the `graph`
  body for Dijkstra on the village map (and the flooded bridge), the bus route (nearest neighbour, then 2-opt) and exam
  slots (greedy 4, DSatur 3); `schedule` for the timetable (propagation and search); `knapsack` for the truck (greedy,
  then the best load; the dynamic programming table); `lp` for the garden (the limits, the region, the profit line
  sliding to (3, 5)). The truck is given as its own items (the built-in one squeezes its rows in English). Text on screen
  stays at 32 px or more (`npm run layout-check`): lists rather than cards, two-column tables rather than compare
  columns and bar charts, no code captions.

## Words

| English | Arabic (unit files, MSA) | Egyptian Arabic (videos) |
|---|---|---|
| optimization | الحلول المثلى | الحلول المثلى، إننا نلاقي أحسن حل |
| goal (objective) | الهدف | الهدف |
| limit (constraint) | القيد | القيد |
| option, decision (variable) | الخيار، القرار (المتغيّر) | الاختيار، القرار (المتغيّر) |
| feasible | ممكن (خطة ممكنة) | ممكن، خطة تنفع |
| optimal, the best | الأمثل، الأفضل | أحسن حل |
| model | النموذج | النموذج |
| solver | برنامج الحل (solver) | برنامج الحل («السولفر») |
| quick rule (heuristic) | قاعدة سريعة (طريقة تقريبية) | قاعدة سريعة |
| greedy | الطريقة الجشعة | الطريقة الجشعة |
| linear programming | البرمجة الخطية | البرمجة الخطية |
| integer / whole number | عدد صحيح | رقم صحيح |
| trade-off | موازنة | موازنة |
| fair, fairness | عادل، العدالة | عادل، العدل |
| route | الطريق، المسار | الطريق، المشوار |
| bus | الحافلة | الأتوبيس |
| truck | الشاحنة | العربية النقل |
| timetable, period | الجدول المدرسي، الحصة | جدول الحصص، الحصة |
| exam slot, clash | موعد الامتحان، تعارض | ميعاد الامتحان، تعارض |
| propagation, backtracking | الانتشار، التراجع | الانتشار، الرجوع خطوة |

- In Arabic, maths with letters is written left to right with Western digits, like code: `x + y ≤ 8`, `30x + 40y`.
  Plain numbers in sentences use Arabic-Indic digits, as the other units do: ٢٩٠ نقطة، (٣، ٥).
- Python, its keywords, identifiers and printed output stay in English, left to right, in every language.

## `opt-1-1` Best choices: goals, limits, options (teachers, level 1)

**القرار الأفضل: الأهداف والقيود والخيارات.** Schools make decisions under limits every day. Learn to name the goal, the
limits and the options, find the shortest way on a map, see when a quick rule fails, and ask who a "best" plan is best
for. No code, no device needed.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 What makes a choice the best? (ما الذي يجعل الخيار هو الأفضل؟) | Name the three parts of a decision problem: options, limits and a goal. Tell a plan that keeps every limit from the best one. Spot the three parts in school decisions: a class trip on a budget, supplies on a truck. | `knapsack` | OPT.1, DC.5.2 |
| 2 The shortest way (أقصر طريق) | Find the shortest way on a map of roads with lengths. Use Dijkstra's idea: settle the nearest waiting place first. Plan again when a road closes, and explain why the straightest-looking way isn't always the shortest. | `shortest` | OPT.3, OPT.1 |
| 3 Quick rules and their traps (القواعد السريعة وفخاخها) | Make a plan fast with a quick rule (nearest village next, most value per kilo first). Show that a quick rule can miss the best, and improve a plan with small swaps. Explain why trying every plan is impossible for big problems. | `routes` | OPT.3, DC.5.1 |
| 4 The best for whom? (الأفضل لمَن؟) | Show that a plan can be best on the total and still unfair to one person. Compare sharing rules: first come first served, the best total, looking after the worst-off. Decide with the people affected and explain the rule used. | `assign` | OPT.4, OPT.1 |

No-device activities: the class trip on a budget (activity cards with cost and enjoyment points), a chalk map with road
lengths on the playground, a human bus route (pupils as villages, distances in steps), a fair class-duties rota from
pupils' preferences.

## `opt-2-1` Models with numbers: variables, constraints, objective (teachers, level 2)

**نماذج بالأرقام: المتغيّرات والقيود والهدف.** Turn a decision into a model: variables with units, limits as
inequalities and a goal to make as large or small as possible. Draw the smallest models, see why whole numbers are
harder, and run your first model in Python with Google's OR-Tools.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 From words to a model (من الكلمات إلى نموذج) | Turn a decision into variables, each with a meaning and a unit. Write limits as inequalities and the goal as an expression to maximise or minimise. Check a plan against the model by putting its numbers in. | `diet` | `snippet` (does this plate meet the energy limit?) | OPT.1, OPT.2 |
| 2 The best plan is at a corner (أفضل خطة في زاوية) | Draw each limit of a two-variable problem as a line and shade the plans that fit. Find the best plan by sliding the goal line, and explain why it is at a corner. Say which limits are used up and what changes the best plan. | `lp` | none | OPT.2, OPT.1 |
| 3 Whole numbers and yes-or-no choices (الأعداد الصحيحة وخيارات نعم أو لا) | Explain why some decisions must be whole numbers or yes/no. Show that rounding a fractional answer can break a limit or miss the best. Read a yes/no model in Python: one variable per load, a weight limit, a goal. | `knapsack` | `codefill` (CP-SAT knapsack), `snippet` | OPT.2, DC.3.4 |
| 4 Your first model in Python (نموذجك الأول بلغة بايثون) | Write a small CP-SAT model with Google's OR-Tools: variables, constraints, a goal, the solver. Run it on the phone, knowing the same program runs in Colab. Find a missing constraint by checking the answer against the real problem. | `modeller` | `parsons`, `bug` (minimize for maximize: plant nothing), `code` (add the hours limit and the goal: 290; without the hours line the solver plans 8 bean beds) | OPT.2, DC.3.4 |

Fairness at this level: the cheapest lunch nobody would eat (lesson 1), profit is not the garden's only goal (lesson 2),
which school's supplies stay behind (lesson 3), a solver can't keep a rule nobody wrote (lesson 4).

## `opt-3-1` Solving school problems in Python: timetables, routes, assignment (teachers, level 3)

**حلّ مشكلات المدرسة ببايثون: الجداول والطرق والتوزيع.** Model real school problems with OR-Tools in Python, run them on
the phone, and judge the answers with colleagues: a timetable, exam slots, the bus route and who teaches which class.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 A timetable that works (جدول حصص يعمل) | Model a timetable in CP-SAT: a period per lesson, all-different for each class and each teacher, and extra rules. Explain how propagation and search find a timetable, and what INFEASIBLE tells you. Judge a timetable for teachers and pupils. | `timetable` | `code` (a small timetable), `codefill` | OPT.2, OPT.3, DC.3.4 |
| 2 Exams without clashes (امتحانات بلا تعارض) | Turn exam clashes into a graph and give exams slots with as few slots as possible. Write the exam-slot model in CP-SAT with the fewest slots as its goal. Add a fairness rule (no pupil with exams in two slots in a row) and see what it costs. | `colouring` | `code` (fewest slots: 3), `bug` | OPT.3, OPT.4, DC.3.4 |
| 3 The school bus route (طريق حافلة المدرسة) | Explain the travelling salesperson problem and why trying every route fails beyond a few stops. Build a route by nearest neighbour in Python and improve it with 2-opt. Judge a route by its length and by the longest ride for any child. | `routes` | `code` (nearest neighbour), `parsons` (a 2-opt swap) | OPT.3, OPT.4, DC.3.4 |
| 4 Matching teachers and classes (توزيع المعلّمين على الصفوف) | Model an assignment with yes/no variables, exactly one per teacher and per class. Find the best total with CP-SAT, then the plan that makes the worst match as good as possible. Compare the two and explain them to colleagues. | `assign` | `code` (best total), `codefill` (`add_exactly_one`) | OPT.2, OPT.4, DC.3.4 |

## `opt-4-1` Teaching decisions: trade-offs and fairness (teachers, level 4)

**قرارات التدريس: الموازنات والعدالة.** Lead decisions that weigh goals against each other and are fair by design:
trade-offs and the value of a limit, fairness measures, finding what a model is missing, and running an optimization
project at school with colleagues and pupils.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Two goals at once (هدفان في وقت واحد) | Find the plans no other plan beats on both goals (the Pareto front). Combine goals with weights and show how the weights change the answer. Work out what one more unit of a limit is worth by solving again. | `lp` | `code` (keep the plans nobody beats) | OPT.4, OPT.2 |
| 2 Fair by design (العدالة بالتصميم) | Compare fairness measures: the total, the worst-off, the gap. Model "make the worst-off as well off as possible" in CP-SAT and measure its cost to the total. Agree a fair rule with the people affected and make it public. | `assign` | `code` (max-min), `codefill` | OPT.4, DC.5.2 |
| 3 When the model is wrong (حين يخطئ النموذج) | Find a model's missing rules by testing its answers with the people who live with them. Test how a plan changes with wrong data or a change (a closed road, a price rise). Write down a model's assumptions so others can check them. | `diet` | `bug` (a missing limit), `code` (add a variety rule) | OPT.1, OPT.4, DC.1.2 |
| 4 Big problems, good answers (مسائل كبيرة وإجابات جيدة) | Explain local search and simulated annealing for problems too big to search fully. Decide when good enough is enough, and measure the gap. Plan an optimization project at school: problem, data, model, test, a decision made with people. | `anneal` | `codefill` (the annealing rule) | OPT.3, OPT.4, DC.5.3 |

## `opt-s1` Shortest and best: puzzles, paths, packing (students, Primary, ages 9–12)

**الأقصر والأفضل: ألغاز وطرق وتعبئة.** Find the best way to pack, the shortest way to go, how to solve puzzles with
rules, and how to share turns fairly. Short videos, pictures and tapping, no typing.

| Lesson | Objectives | Lab | Competencies |
|---|---|---|---|
| 1 Pack the truck (حمّل الشاحنة) | Say what "best" means for a job: the goal. Keep to a rule (the weight limit) while you choose. Compare two ways of packing and find the better one. | `knapsack` | OPT.1 |
| 2 The shortest way (أقصر طريق) | Add road lengths to find the shortest way. Use the trick: settle the closest place first. Find a new way when a road is closed. | `shortest` (and a robot `blocks` step) | OPT.3, DC.3.4 |
| 3 Puzzles with rules (ألغاز بقواعد) | Solve a 4 × 4 sudoku with its rules. Cross out what can't go in a square, and guess only when stuck. Explain why good rules save guesses. | `sudoku` | OPT.3 |
| 4 Fair turns without clashes (أدوار عادلة بلا تعارض) | Give joined things different colours (times) so nothing clashes. Plan activity times so nobody needs to be in two places at once. Share good and bad turns fairly. | `colouring` | OPT.3, OPT.4 |

## `opt-s2` Goals and limits: a model, linear programming in 2D (students, Lower secondary, ages 12–15)

**الأهداف والقيود: نموذج وبرمجة خطية في بُعدين.** Write a decision as a model with letters and inequalities, draw the plans
that fit, find the best corner, learn why whole numbers are harder, and read your first model in Python.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Choices, limits and a goal (الخيارات والقيود والهدف) | Write choices as variables with units. Write limits as inequalities (≤, ≥) and the goal as an expression. Check whether a plan fits. | `diet` | none | OPT.1, OPT.2 |
| 2 Draw the plans that fit (ارسم الخطط الممكنة) | Draw each limit as a line and shade the plans that fit. Slide the goal line to find the best plan, at a corner. See how a price change moves the best corner. | `lp` | none | OPT.2 |
| 3 Whole numbers only (أعداد صحيحة فقط) | Explain why buses, beds and loads come in whole numbers. Show that rounding can break a limit or miss the best. Compare a quick (greedy) choice with the best. | `knapsack` | none | OPT.2, OPT.3 |
| 4 Tell the computer (أخبِر الحاسوب) | Read a small model in Python: variables, limits, a goal, the solver. Put a model's lines in order and fill its gaps. Predict what it prints, and run it in the lab. | `modeller` | `snippet`, `parsons`, `codefill` | OPT.2, DC.3.4 |

## `opt-s3` Let the computer search: knapsack, routes, timetables (students, Upper secondary, ages 15–18)

**دع الحاسوب يبحث: الحقيبة والطرق والجداول.** Write and run Python that searches: try every load, then be clever with
dynamic programming; find shortest paths with Dijkstra; plan a bus route and improve it; and model a timetable with
CP-SAT. Judge each answer: is it the best, and is it fair?

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Try them all, or think ahead (جرّبها كلها أم فكّر مسبقًا) | Count the plans a brute-force search must try (2ⁿ). Write a brute-force knapsack in Python. Explain how dynamic programming reuses smaller answers, and when greedy fails. | `knapsack` | `code` (brute force: 65), `codefill` (the DP step) | OPT.3, DC.3.4 |
| 2 Shortest paths (أقصر الطرق) | Store a road map as a dictionary in Python. Follow and complete Dijkstra's method. Explain why settling the closest place first is always right (no negative lengths). | `shortest` | `code` (Dijkstra: 13 km), `bug` | OPT.3, DC.3.4 |
| 3 The bus route (طريق الحافلة) | Explain why the number of routes explodes. Write nearest neighbour in Python and improve a route with 2-opt. Judge a route by its length and the longest ride. | `routes` | `code` (nearest neighbour), `parsons` (2-opt) | OPT.3, OPT.4, DC.3.4 |
| 4 Timetables with CP-SAT (الجداول باستخدام CP-SAT) | Model a club timetable in CP-SAT with all-different rules. Explain propagation and search, and what INFEASIBLE proves. Add a fairness rule and judge the result. | `timetable` | `code` (a timetable), `codefill` | OPT.2, OPT.3, DC.3.4 |

## `opt-s4` Operations research: LP, MIP, CP, OR-Tools modelling, heuristics (students, University)

**بحوث العمليات: البرمجة الخطية والصحيحة والبرمجة بالقيود والطرق التقريبية.** The field behind airline schedules, supply
chains and hospital rosters, on a phone: linear programs and the simplex method, integer programs and branch and bound,
constraint programming, local search, and the trade-offs a modeller must make in the open.

| Lesson | Objectives | Lab | Code | Competencies |
|---|---|---|---|---|
| 1 Linear programming and the simplex method (البرمجة الخطية وطريقة السمبلكس) | Write a linear program in standard form. Explain why the simplex method walks from corner to corner, and read a solution's binding limits and shadow prices. Solve the diet problem with GLOP. | `diet` | `code` (diet LP: 40.97), `codefill` | OPT.2, DC.3.4 |
| 2 Integer programs and branch and bound (البرمجة بالأعداد الصحيحة والتفريع والتحديد) | Explain the LP relaxation and why rounding fails. Follow branch and bound on a small problem. Model with whole-number and yes/no variables in SCIP. | `modeller` | `code` (buses: 1,400), `parsons` | OPT.2, DC.3.4 |
| 3 Constraint programming: propagation and search (البرمجة بالقيود: الانتشار والبحث) | Explain domains, propagation and search with the fail-first rule. Use global constraints (all-different) in CP-SAT. Model a puzzle and a schedule, and read what INFEASIBLE proves. | `sudoku` | `code` (a 4 × 4 sudoku), `bug` | OPT.3, DC.3.4 |
| 4 Heuristics and trade-offs (الطرق التقريبية والموازنات) | Explain local search, 2-opt and simulated annealing, and measure the optimality gap. Implement a 2-opt improvement. Weigh several goals and fairness openly, as a modeller must. | `anneal` | `code` (2-opt), `codefill` | OPT.3, OPT.4 |

## Placement

`content/placement/opt.json`: three questions per audience and level (24), from naming a limit and adding up road
lengths (level 1) to writing an inequality, reading INFEASIBLE, the Pareto front, shadow prices, relaxation bounds and
the optimality gap (levels 2–4).

## Labs across the track

Teachers meet `knapsack`, `shortest`, `routes` and `assign` at level 1, then `diet`, `lp`, `knapsack`, `modeller`
(level 2), `timetable`, `colouring`, `routes`, `assign` (level 3) and `lp`, `assign`, `diet`, `anneal` (level 4).
Students meet `knapsack`, `shortest`, `sudoku`, `colouring` (s1), `diet`, `lp`, `knapsack`, `modeller` (s2),
`knapsack`, `shortest`, `routes`, `timetable` (s3) and `diet`, `modeller`, `sudoku`, `anneal` (s4). A lab met again at a
higher level comes with a harder task (`knapsack` at s1: tap loads on; at s2: greedy against the best; at s3: read the
dynamic programming table; `routes` at level 1: watch nearest neighbour; at level 3: find maps where 2-opt stops short;
`lp` at level 4: what an extra hour of pupils' time is worth).
