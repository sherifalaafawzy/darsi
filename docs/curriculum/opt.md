# Optimization: the curriculum

**Status: approved by the user on 2026-11-15.** It replaces the course-by-course plan of October 2026 in
this file; the facts, code rules and lab notes at the end are kept from it. What all tracks share (the Python
ladder, the university path, the home of each shared idea) is in `docs/CURRICULUM.md`; how to write a course is in
the `darsi-course` skill.

## The track in one look

A teacher who finishes the track can name the goal, the limits and the options of a school decision, write the small
ones as a model, solve real ones in Python, and lead decisions that are fair by design. A student ends by writing
programs that search. At university, eight short courses go from a decision written by hand to models a solver
proves, then a theory course and a capstone. The track never assumes another track: a goal, a limit and a plan that
fits are taught in the first lesson of every starting course.

- **Track line (en):** Starts from zero: choosing the best plan under limits. Later it uses school algebra (x + y ≤ 8), and Python from Programming where you write models.
- **Track line (ar):** يبدأ من الصفر: اختيار أفضل خطة ضمن القيود. يحتاج لاحقًا إلى جبر المدرسة (x + y ≤ 8)، وإلى بايثون من مسار البرمجة عند كتابة النماذج.

## The paths

### Teachers

| Level | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| 1 Beginner | `opt-1-1` Best choices: goals, limits, options | name the options, limits and goal of a school decision, find a shortest way, spot where a quick rule fails, and ask who a plan is best for | No experience needed. | 4 standard passes |
| 2 Elementary | `opt-2-1` Models with numbers: variables, constraints, objective | write a decision as a model, draw a small one, explain why whole numbers are harder, and read a model in Python | `opt-1-1`, school algebra | 4 standard passes |
| 3 Intermediate | `opt-3-1` Solving school problems in Python: timetables, routes, assignment | build models of a timetable, exam slots, a bus route and a staffing plan, and judge their answers | `opt-2-1`, `code-2-2` | 2 standard passes, 2 rewrites |
| 4 Advanced | `opt-4-1` Teaching decisions: trade-offs and fairness | weigh two goals in the open, design fairness into a model, find what a model is missing, and lead a project | `opt-3-1` | 4 standard passes |

### Students

| Stage | Course | After it, you can | Before this | Work |
|---|---|---|---|---|
| Primary (9–12) | `opt-s1` Shortest and best: puzzles, paths, packing | keep a rule while you chase a goal, find the shortest way, and share turns with no clash | No experience needed. | 4 standard passes |
| Lower secondary (12–15) | `opt-s2` Goals and limits: a model, linear programming in 2D | write a choice as a model, draw the plans that fit, and read a model in Python | No experience needed, only school maths. | 4 standard passes |
| Upper secondary (15–18) | `opt-s3` Let the computer search: knapsack, routes, timetables | write programs that try every plan, find shortest paths, improve a route, and model a timetable | `code-s3` | 1 rewrite, 3 standard passes |
| University, start | `opt-m1` Decisions on paper: variables, units, objectives and constraints (new) | write a decision as variables, an objective and constraints, check any plan, and say what "optimal" needs as proof | No experience needed, only school algebra. | 4 new lessons |
| University, module 2 | `opt-m2` Is there an answer? Feasibility, enumeration and quick rules (new) | prove that nothing fits, count candidates, and judge a quick rule against bounds | `opt-m1`, `code-m5` | 4 new lessons |
| University, module 3 | `opt-m3` A model a solver can read: model, data and status (new) | write a model with its data apart, read the solver's status, and check its plan yourself | `opt-m2`, `code-m6` | 4 new lessons |
| University, module 4 | `opt-m4` Yes or no: rules between choices, knapsack and capacity (new) | model yes-or-no choices, solve and bound a small knapsack, and explain what was left out | `opt-m3` | 4 new lessons |
| University, module 5 | `opt-m5` Who does what: assignment, sets and matching (new) | model who does what without forbidding valid plans, and prove "impossible" in one sentence | `opt-m4` | 4 new lessons |
| University, module 6 | `opt-m6` When: scheduling, precedence and shared resources (new) | model a day under precedence and shared resources, check it, and prove the shortest day | `opt-m5` | 4 new lessons |
| University, module 7 | `opt-m7` No answer? Conflicts, repairs and equal models (new) | explain why a model has no answer, set out the repairs, and show two models agree | `opt-m6` | 4 new lessons |
| University, module 8 | `opt-m8` What if? Sensitivity, two goals, fairness and reports (new) | test how a decision depends on its numbers, set out a trade-off, and report only what the evidence shows | `opt-m7` | 4 new lessons |
| University, theory | `opt-s4` Operations research: LP, MIP, CP, OR-Tools modelling, heuristics | explain how solvers work inside: the simplex method, branch and bound, propagation and local search | `opt-m8` | 4 standard passes |
| University, capstone | `opt-capstone` An exam timetable that really works | formulate, model, check, compare and report one real allocation, end to end | `opt-s4`, `code-m7` | text only |

### University teachers

| Course | After it, you can | Before this | Work |
|---|---|---|---|
| `opt-u1` Teaching optimisation at university | teach linear and integer programming, heuristics and modelling rigorously, with assessments that mark the model and not only the answer | `opt-3-1`, or you already teach the subject | 4 standard passes |

## What changes, and why

1. **University students get a path that starts from zero: eight module courses.** Today a university student meets
   the track at `opt-s4`, whose first teaching scene is "A linear program has continuous variables, linear limits and
   a linear goal. In standard form: maximise c times x…". It assumes a model, a feasible region, bounds and Python
   with functions and dictionaries. On 2026-11-15 the user supplied the Darsi University draft "Mathematical
   Optimization and Decision Modelling": eight modules of three lessons and a practical task, and a capstone. One
   module becomes one course, `opt-m1` to `opt-m8`: its three lessons, then a fourth lesson built on its task, whose
   project is the task. `opt-m1` is the starting course. No module needed splitting. Where a module lesson has two
   outcomes, the video takes the main one and the other goes to the reading and the practice; each course says
   which.
2. **`opt-s4` becomes the theory course, after the modules.** The modules teach how to state a decision, prove an
   answer and report it. They do not open the solver. `opt-s4` does: the simplex method, branch and bound,
   propagation, local search. It keeps its id and its four lessons, and names `opt-m8`.
3. **Phones first, so "modelling language" means CP-SAT in Python.** The draft assumes a computer with Python 3 and,
   optionally, MiniZinc. Darsi's phone sandbox has Python and a small OR-Tools, and no MiniZinc. On Darsi a model is
   written with CP-SAT's Python calls (variables with domains, `model.add`, `model.minimize`, a status), in code
   steps and in the `modeller` lab. The same ideas hold: the model apart from the data, a solver that searches, a
   status to read. MiniZinc is shown once beside the CP-SAT model and left to the study guide, for learners with a
   computer. Each course says what runs on the phone and what needs a computer.
4. **Each level of the teachers' ladder owns one thing, and later lessons stop teaching it again.** Level 1 owns the
   intuition, by hand. Level 2 owns the model, in numbers. Level 3 owns the code, on real school problems. Level 4
   owns judging trade-offs. Today `opt-3-1-3` teaches nearest neighbour and 2-opt again from the start, with the
   same playground project as `opt-1-1-3`; `opt-3-1-4` and `opt-4-1-2` both teach "total against worst-off" again,
   with the same lab task as `opt-1-1-4`. `opt-3-1-3` and `opt-3-1-4` are rewritten with new cases and projects, and
   `opt-4-1-2` opens with a reminder. Each begins "At level 1 you…" and goes further. A lab met again gets a
   different task.
5. **Every course says what it expects: courses, Python, and the school maths, named exactly.** `opt-2-1` said
   "some algebra; Programming level 2 helps". It now names `opt-1-1` and the algebra, and needs no Programming
   course: its code is read and completed. `opt-3-1` and `opt-4-1` write models, so they name `code-2-2`, the new
   Programming course with functions and dictionaries. That course teaches teachers to read a comprehension, not to
   write one. So where a model line needs one, the lesson shows it beside its long form, and the written step
   accepts the long form. `opt-s3` and `opt-s4` said "First Python (lower secondary)", which teaches neither
   lists nor functions.
6. **`opt-s3` starts from zero for a 16-year-old, and stops asking for Python nobody taught.** Its first lesson
   opened on a program. It now names the goal, the limit and the options first. The course names `code-s3`, which
   teaches the functions and lists it writes. Programming keeps dictionaries for university, so the course holds
   its maps and models in lists. No step asks for a list comprehension or `lambda`: nearest neighbour becomes a
   plain loop.
7. **`opt-s2` stays at lower secondary, with what it expects written down.** It draws limits as lines, which is the
   top of this stage in many syllabuses. The lesson already teaches the drawing itself (mark two points, join them,
   test one side), so it expects only letters for numbers, ≤ and ≥, and plotting points. The student finds the best
   plan from a table of corners; the sliding profit line is something the lab shows.
8. **The truck is one stage's story, not three.** The `knapsack` lab is the same truck at every stage. Primary keeps
   the story. `opt-s2-3` now opens on the trip buses, which its own second check is about, and meets the truck only
   in the lab. `opt-s3-1` is rewritten around a new question: how to be sure.
9. **At most four new terms a video, and no video over its length.** Eleven lessons list five key terms today; 17
   videos are over 470 words and all four primary videos are over 370. Each lesson below has four terms or fewer.
   "Gap" meant two things (the gap between people in `opt-1-1-4`, the distance from the best in `opt-4-1-4`): the
   second is always "optimality gap".
10. **The capstone moves to the end of the university path.** It needs GitHub, a laptop or Codespaces and about 17
    hours, and sits at level 3 (upper secondary) today. It takes from the draft's capstone what it lacks: a hand
    formulation first, a baseline, honest status words and a decision memo.
11. **Every video gets the standard pass.** All hooks below end on a question the lesson answers; every promise
    becomes "By the end, you'll be able to…"; a case comes before its name; check 2 asks the hook's question; every
    video names the next lesson.

## The ledger

Teachers:

| Idea or skill | First taught in | Used again in |
|---|---|---|
| Options, limits and a goal; a feasible plan and the optimal one | `opt-1-1-1` | every course |
| Checking a plan is easy, finding the best is hard; too many plans to try | `opt-1-1-1`, `opt-1-1-3` | `opt-2-1-3`, `opt-3-1-3`, `opt-4-1-4` |
| A map of roads with lengths; settle the nearest first (Dijkstra's method) | `opt-1-1-2` | `opt-3-1-2` (dots and lines again, as a clash map) |
| A quick rule, nearest neighbour, improving a plan by small swaps | `opt-1-1-3` | `opt-3-1-3` (in code), `opt-4-1-4` (local search) |
| The total, the worst-off and the gap between people; first come, first served | `opt-1-1-4` | `opt-3-1-4` (as a model), `opt-4-1-2` (inside the model) |
| Variable, constraint, objective, model; checking a plan by putting its numbers in | `opt-2-1-1` | every later course |
| Feasible region, corner, binding limit, linear program | `opt-2-1-2` | `opt-4-1-1`, `opt-u1-1` |
| Whole-number and yes-or-no variables; rounding fails | `opt-2-1-3` | `opt-3-1-4`, `opt-u1-2` |
| A model in Python: variables, `model.add`, `model.maximize`, solve; OPTIMAL and INFEASIBLE | `opt-2-1-4` (read and completed) | `opt-3-1` (written) |
| A solver obeys only the rules you write | `opt-2-1-4` | `opt-3-1-1`, `opt-4-1-3` |
| Domain, all-different rule, propagation and search | `opt-3-1-1` | `opt-3-1-2` |
| Clash map, colouring, clique; OPTIMAL as a proof | `opt-3-1-2` | `opt-4-1-1` (the exam week's two goals) |
| A route as a list in code; a local best; the longest ride as a second measure | `opt-3-1-3` | `opt-4-1-1`, `opt-4-1-4` |
| The matching model: a yes-or-no variable per pair, exactly-one rules, a forbidden pair | `opt-3-1-4` | `opt-4-1-2` |
| Trade-off, Pareto front, weights, what a limit is worth | `opt-4-1-1` | `opt-4-1-2`, `opt-4-1-4` |
| A worst-off goal, a floor, the price of fairness, solving in two steps | `opt-4-1-2` | `opt-4-1-4` (the project plan) |
| Missing constraint, sensitivity, assumptions, validation | `opt-4-1-3` | `opt-4-1-4`, `opt-u1-4` |
| Local search, simulated annealing, a bound and the optimality gap | `opt-4-1-4` | `opt-u1-3` |
| School algebra: x + y ≤ 8, putting numbers in for letters, plotting points | expected by `opt-2-1`; the line is drawn in `opt-2-1-2` | `opt-4-1-1` |
| Python to write: loops and lists in `code-2-1`; functions and dictionaries in `code-2-2`, which reads a comprehension but does not ask for one | Programming | `opt-3-1`, `opt-4-1` |

Students (each school stage starts again from the first row, at its own depth; university starts at `opt-m1`):

| Idea or skill | Primary | Lower secondary | Upper secondary | University |
|---|---|---|---|---|
| A goal, a limit and options; a plan that fits and the best one | `opt-s1-1` | `opt-s2-1` | `opt-s3-1` | `opt-m1-1`, `opt-m1-2` |
| Units and domains; data against decisions | | `opt-s2-1` (units) | | `opt-m1-1` |
| A quick rule can miss the best | `opt-s1-1` | `opt-s2-3` | `opt-s3-1` | `opt-m2-3`, `opt-m4-4` |
| The shortest way: settle the closest first | `opt-s1-2` | | `opt-s3-2` (in code) | |
| Rules that cross out; guess only when stuck | `opt-s1-3` | | `opt-s3-4` | `opt-m2-2`, `opt-s4-3` |
| Clashes as dots and lines; as few times as possible | `opt-s1-4` | | `opt-s3-4` | `opt-m5-2`, `opt-m5-3` |
| A model: variables, inequalities, a goal; checking a plan | | `opt-s2-1` | `opt-s3-4` | `opt-m1-2`, `opt-m3-1` |
| The plans that fit as a shape; binding limits | | `opt-s2-2` | | `opt-m1-2` (lab), `opt-m2-1`, `opt-s4-1` |
| Whole numbers and yes-or-no choices | | `opt-s2-3` | | `opt-m4-1`, `opt-s4-2` |
| A model in Python; what the solver's status proves | | `opt-s2-4` (read) | `opt-s3-4` (write) | `opt-m1-4` (read), `opt-m3` (write) |
| Feasible, infeasible, optimal, unknown: what each needs as evidence | | | `opt-s3-4` (INFEASIBLE) | `opt-m1-3`, `opt-m3-3`, `opt-m8-3` |
| Counting plans; trying them all; pruning | | | `opt-s3-1` | `opt-m2-2` |
| Bounds, a relaxation and the gap | | | | `opt-m1-3`, `opt-m2-3`, `opt-m4-2`, `opt-s4-2` |
| An independent checker | | | | `opt-m1-4`, `opt-m5-4`, `opt-m6-2` |
| Model and data apart; scenarios | | | | `opt-m3-2`, `opt-m3-4` |
| Assignment, global rules, matching | | | | `opt-m5` |
| Scheduling: precedence, shared resources | | | | `opt-m6` |
| A minimal conflict, repairs, symmetry | | | | `opt-m7` |
| Sensitivity, a Pareto front, fairness, a decision report | | | | `opt-m8` |
| Nearest neighbour, 2-opt, a local best | | | `opt-s3-3` | `opt-s4-4` |
| How solvers work inside: simplex, branch and bound, propagation | | | | `opt-s4` |
| Python | none (robot cards) | shown and explained | `code-s3` | none in `opt-m1`; `code-m5` from `opt-m2`; `code-m6` from `opt-m3` |

## The courses

### `opt-1-1` Best choices: goals, limits, options
- **For:** teachers, level 1 Beginner
- **Status:** keep
- **After it, you can:** name the options, the limits and the goal of a school decision; find the shortest way on a small map with a method that is sure; explain why a quick rule can miss the best plan; ask who a "best" plan is best for.
- **Before this:** No experience needed. The maths is adding and comparing whole numbers.
- **Python:** none
- **The path:** meet the three parts of a decision, see a method that is sure, watch a quick rule go wrong, then ask who the best plan is best for.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | What makes a choice the best? | name the options, the limits and the goal of a school decision, and tell a plan that is allowed from the best one | My class has twelve hundred coins for outings this term. Five ideas are on the board, and the zoo won the vote. It is also the dearest. Does the best plan have to start with the zoo? | limit; goal; feasible plan; optimal plan | knapsack | S |
| 2 | The shortest way | find the shortest way on a small map by settling the nearest place first, and explain why that is sure | It rained hard last night. The bridge on my road to school is under water. Other roads go round it, through other villages. How do I find the shortest one without driving them all? | road map; settle; Dijkstra's method | shortest | S |
| 3 | Quick rules and their traps | explain why a quick rule can miss the best plan, and improve a plan with small swaps | Our school bus collects children from nine villages every morning. The driver has one habit: always the nearest village next. It sounds sensible. So why is his round six kilometres longer than it needs to be? | quick rule (heuristic); nearest neighbour; 2-opt swap | routes | S |
| 4 | The best for whom? | tell a plan that is best on the total from one that is fair to the worst-off, and explain a sharing rule to the people it affects | At my school, the most senior teacher chooses her class first. That is me, and I always take maths. Everyone calls it fair. So why does a colleague’s class pay for my choice? | total; worst-off; gap; first come, first served | assign | S |

- **Unit check:** unchanged.
- **Changes:** hooks: 1 and 4 Ms Amina, 2 and 3 Mr Okafor; Dr Farah asks the checks in lesson 4. All four videos are over 470 words and say "Today: …". Lesson 1 lists the three parts before any case: the outings come first, then the names; "options" stays an everyday word, so the video has four terms. Lesson 2's second check becomes the flooded bridge, which is the hook's question. Lesson 3 is the home of the intuition: its paragraph on who rides longest shrinks to one sentence (level 3 owns it), and its lab task is "press Run, watch, compare with the best"; hunting for maps where the swaps stop short moves to level 3. Lesson 4 is the home of total, worst-off and gap; here "gap" always means the gap between people. The summary's last line becomes "No experience needed."

### `opt-2-1` Models with numbers: variables, constraints, objective
- **For:** teachers, level 2 Elementary
- **Status:** keep
- **After it, you can:** turn a school decision into variables, constraints and an objective; draw a two-variable model and find its best corner; explain why whole numbers are harder; trace a small model in Python and find the rule it is missing.
- **Before this:** `opt-1-1` “Best choices: goals, limits, options” (Optimization, level 1), and school algebra: reading x + y ≤ 8, putting numbers in for letters, and plotting points on graph paper. Drawing a limit as a line is taught in lesson 2.
- **Python:** shown and explained; the two lines written in lesson 4 are taught here
- **The path:** words become a model, the model becomes a picture, whole numbers break the picture, and a solver takes over.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | From words to a model | turn a school decision into variables, constraints and an objective, and check any plan by putting its numbers in | Our cook serves one lunch every day: rice, egg and milk. It costs sixty coins a pupil. She asked me: is it enough? And if I change the plate, how do I know it still is? | variable; constraint; objective; model | diet | S |
| 2 | The best plan is at a corner | draw a two-variable model on graph paper, find the best corner, and predict what moves it | Beans earn our school garden forty coins a bed, tomatoes thirty. My pupils said: plant only beans! Yet the plan that earns the most has three beds of tomatoes. How can that be? | feasible region; corner; binding limit; linear program | lp | S |
| 3 | Whole numbers and yes-or-no choices | explain why whole numbers make a model harder, show rounding breaking a limit, and read a yes-or-no model | Sixty-four of us are going on the school trip. A bus seats thirty. The maths says we need two point one three buses. So what do I book: two, or three? | integer program; yes-or-no variable; rounding | knapsack | S |
| 4 | Your first model in Python | trace a small model in Python line by line, complete it, and find the rule it is missing | I typed our garden into a free program from Google. One second later it said: plant eight beds of beans. My pupils have eighteen hours a week, and that plan needs twenty-four. Did the program make a mistake? | solver; OR-Tools; OPTIMAL; INFEASIBLE | modeller | S |

- **Unit check:** unchanged.
- **Changes:** hooks: 1 Mr Okafor, 2 Ms Salma, 3 Ms Amina, 4 Mr Joseph. Lesson 1 opens "At level 1 you named options, limits and a goal. Now each becomes numbers"; "data" and "linear model" leave its key terms. Lesson 2 is 517 words: it is cut, and the simplex method is named once, in the reading. It keeps teaching the line from its two points on the axes, so the course expects only plotting points. Lesson 3 meets the truck again, as a yes-or-no model ("At level 1 you packed it by hand"); branch and bound and dynamic programming leave its key terms. Lesson 4's reading explains each line of the five-line model; the first steps are order-the-lines and find-the-bug, and only then are two lines written. The summary's last line names `opt-1-1` and the algebra, and drops "Programming level 2 helps".

### `opt-3-1` Solving school problems in Python: timetables, routes, assignment
- **For:** teachers, level 3 Intermediate
- **Status:** revise
- **After it, you can:** build a small timetable model and test what a new rule does to it; prove the fewest exam slots; build a bus route in code and judge it twice; build a matching model and add the rules people ask for.
- **Before this:** `opt-2-1` “Models with numbers: variables, constraints, objective” (Optimization, level 2) and `code-2-2` “More Python for teachers” (Programming, level 2; it follows `code-2-1` “Python for teachers”).
- **Python:** rung 2; a comprehension inside a model line is taught here
- **The path:** rules only (a timetable), then a goal and a proof (exam slots), then a problem too big to prove (the bus), then people's own scores and rules (matching).

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A timetable that works | build a small timetable model in Python, test what a new rule does to it, and judge the result with the people who live with it | Every September our deputy head builds the timetable with pencil and eraser. It takes her a week. Then one teacher changes her days, and it all falls apart. Must she start again from nothing? | domain; all-different rule; propagation; search (backtracking) | timetable | S |
| 2 | Exams without clashes | build an exam-slot model, prove the fewest slots, and judge what a rest rule costs | Last year a pupil had two exams in the same slot. He sat one in the staff room at lunchtime. This year I want no clashes, and few slots. How few is that, and how would I know? | clash map; graph colouring; clique | colouring | S |
| 3 | The bus route in Python, and who rides longest | build a bus route in Python, test where the swaps stop short, and judge the route by its longest ride as well as its length | We untangled our bus round and saved six kilometres a day. The driver is happy. But the children at the first stop still ride for fifty minutes. Is the shortest round the best round? | travelling salesperson problem; local best; longest ride | routes | R |
| 4 | Matching teachers and classes: the model, and people's rules | build the matching model, add a colleague's rule as a constraint, and judge what the scores and the rule do to the plan | Our model matched five teachers to five classes in one second. The total was the best possible. Then Zainab, our new teacher, asked: who wrote my scores? What should I have done before pressing Run? | assignment problem; exactly-one rule; forbidden pair | assign | R |

- **Unit check:** the question on the worst match is replaced by one on a forbidden pair; the nearest-neighbour ordering question uses the plain-loop version.
- **Changes:** hooks: 1 and 4 Mr Joseph, 2 Ms Salma, 3 Mr Okafor. Lesson 1: INFEASIBLE is no longer a new term (it is `opt-2-1-4`'s). Lesson 2: "trade-off" waits for level 4; here the rest rule simply costs five slots, not three. Lesson 3 is rewritten: it opens "At level 1 you walked nearest neighbour on the playground and untangled the crossings: 34.6 km became 28.6", writes both as a few lines on a five-place table (23 km, then 19), finds a map where the swaps stop short (the lab's "New map"), and judges by the longest ride (21 km against 16). Its project is new: pupils work out each stop's ride from a route on paper, find who rides longest, turn the round the other way and compare. The code step accepts a plain loop. Lesson 4 is rewritten: it opens "At level 1 you compared choosing in turn (29) with the best total (39)", writes the model that finds the 39, then adds what people ask for (a pair that must not happen, a corrected score) and reads what each costs. The worst-off as a goal leaves for `opt-4-1-2`. Its project is new: reading partners, older pupils matched to younger ones from a table of scores, with one pair the class rules out. Both lessons give colleagues' scores one sentence on personal data, naming its home (`cyber-3-1-1`). Python: lessons 2 and 4 need a list built in one line, or a `sum(… for …)`, inside a model line. `code-2-2` teaches teachers to read those, not to write them. So the reading shows each beside its long form, the first step that uses it is fill-the-gap, and the written step accepts the long form.

### `opt-4-1` Teaching decisions: trade-offs and fairness
- **For:** teachers, level 4 Advanced
- **Status:** keep
- **After it, you can:** evaluate plans on two goals and agree the weights in the open; design a fairness rule into a model and price it; critique a model's answer with the people who live with it; lead an optimization project at school.
- **Before this:** `opt-3-1` “Solving school problems in Python: timetables, routes, assignment” (Optimization, level 3), which needs `code-2-2` “More Python for teachers” (Programming, level 2). The maths adds percentages and a weighted sum.
- **Python:** rung 2; as in `opt-3-1`, a comprehension inside a model line is taught here
- **The path:** two goals at once, then fairness inside the model, then the model itself in doubt, then problems too big to prove and the project around them.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Two goals at once | evaluate plans on two goals: keep the ones nobody beats, agree the weights in the open, and price a limit | Two plans for exam week land on my desk. One finishes in four days, but nine pupils sit two exams on the same day. The other takes six days, and only one pupil does. Which plan is better? | trade-off; Pareto front; weights; shadow price | lp | S |
| 2 | Fair by design | design fairness into a model as a floor or a worst-off goal, measure its price, and agree it before anyone sees the result | Last term our duty rota scored the highest total we could get. And Salma got the duty she hates most, every single week. Was that really the best rota? | max-min goal; floor; price of fairness; two-step solve | assign | S |
| 3 | When the model is wrong | critique a model's answer with the people who live with it: find the missing rule, test shaky numbers, publish the assumptions | Our lunch model found the cheapest plate that meets every need. The cooks laughed: groundnuts and a little greens, every day? Yet the model kept every rule I gave it. So what did I get wrong? | missing constraint; sensitivity; assumptions; validation | diet | S |
| 4 | Big problems, good answers | lead an optimization project: choose a method that scales, decide what good enough means, and keep people in charge | My class has twelve pupils and twelve desks. That makes four hundred and seventy-nine million seating plans. For forty pupils, the number has forty-eight digits. So how does anyone find a good plan? | local search; simulated annealing; bound; optimality gap | anneal | S |

- **Unit check:** one more question on lesson 4 (the review of 2026-11-04 found about one).
- **Changes:** hooks: 1 and 2 Dr Farah, 3 Mr Okafor, 4 Mr Joseph. Lesson 1 keeps its hook; its second check becomes the hook's question, and what a limit is worth stays as the lab task and one practice step. Lesson 2 opens "At level 1 you met the total, the worst-off and the gap. At level 3 you wrote the model for the best total. Now fairness goes into the model", and its first scene, which taught the three measures again, becomes that reminder. Its lab task is new: change scores until the best total leaves one teacher on 2 or less, and decide what you would give up. Its project is done with colleagues: agree the rule before anyone sees the rota. Lesson 3 opens "At level 2 the cheapest lunch was a plate nobody would eat". Lesson 4: "local best" comes from level 3, and "gap" is always "optimality gap". The summary names `opt-3-1`.

### `opt-u1` Teaching optimisation at university
- **For:** university teachers
- **Status:** keep
- **After it, you can:** teach linear programs from the picture to the prices; teach why rounding fails and how a search proves an optimum; require honest evaluation of heuristics; set and mark an open modelling brief.
- **Before this:** `opt-3-1` “Solving school problems in Python: timetables, routes, assignment” (Optimization, level 3), or you already teach the subject.
- **Python:** none
- **The path:** the exact methods (linear, then integer), the inexact ones and how to judge them, then the skill that is hardest to teach and to mark: modelling.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Linear programming and duality | teach linear programs from the picture to the prices, and set a task where students must interpret a shadow price for a manager | My students solved the canteen model in seconds. Then the kitchen manager asked: an extra oven hour costs three coins, so should we buy it? Nobody in the room could say. What had I not taught them? | feasible region; strong duality; shadow price | lp | S |
| 2 | Integer programming and branch and bound | teach why rounding fails and how branch and bound proves an optimum, with a tree students draw by hand | A student’s field-trip plan hired two and a half buses. I told her to round it. Rounding up broke the budget, and rounding down left students behind. What should I have taught her instead? | LP relaxation; incumbent; optimality gap | knapsack | S |
| 3 | Heuristics and simulated annealing | teach local search and annealing, and require results over several seeds against a bound | Our faculty has six hundred exams to fit into three weeks. The exact solver ran all weekend, unfinished. A student’s simple method found a timetable in a minute. How good is it, and how would she know? | local optimum; cooling schedule; metaheuristic | anneal | S |
| 4 | Teaching modelling and assessing it | set and mark an open modelling brief: assumptions, validation and sensitivity, not only the optimal value | My students’ shuttle model cut the campus bus costs by thirty percent. I gave it full marks. The transport office rejected it the same day: night students had no bus. So what should I have been marking? | modelling cycle; validation; sensitivity analysis | modeller | S |

- **Unit check:** unchanged.
- **Changes:** hooks: 1 Dr Okafor, 2 Dr Joseph, 3 Dr Salma, 4 Dr Amina. Today's hooks describe a problem from outside; each is retold as the lecturer's own case, and its second check asks the hook's question (lesson 1's already does). The promises list three topics each ("Today: how linear programs model allocation problems, why…"): each becomes one thing the lecturer can do. The first teaching scene is a definition in all four: a case comes first. The course spells "optimisation" where the track says "optimization": one spelling. The summary gains its "Before this". The eight module courses below are material a lecturer can teach from.

### `opt-s1` Shortest and best: puzzles, paths, packing
- **For:** students, primary (9–12)
- **Status:** keep
- **After it, you can:** keep a rule while you chase a goal; find the shortest way on a map; solve a puzzle by crossing out; share times so nothing clashes and turns are fair.
- **Before this:** No experience needed. The maths is adding numbers up to a thousand and comparing them.
- **Python:** none (one robot step with command cards; nothing is typed)
- **The path:** a rule and a goal, a method that is sure, rules that save guesses, then sharing fairly.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Pack the truck | keep a rule while you chase a goal, and compare two loads to find the better one | A small truck is coming to your school with new things. Desks, books, footballs, even solar panels! But it cannot carry them all. So how do you choose what goes on? | rule; goal; best load | knapsack | S |
| 2 | The shortest way | add up the roads of a way, and find the shortest way by settling the closest place first | There are many ways from your home to school. Some roads are long, and some are short. One bridge floods when it rains! How can you find the shortest way without walking them all? | settle; closest-first trick | shortest | S |
| 3 | Puzzles with rules | solve a small sudoku by crossing out, and say when you need a guess | Here is a puzzle with four rows and four columns. Each row needs the numbers one to four, once each. So does each column, and each box. Can you fill it in without a single guess? | candidate; cross out; dead end | sudoku | S |
| 4 | Fair turns without clashes | give clashing tests different times with as few times as you can, and share turns fairly | Test week is coming, with eight tests. You take three of them, and your friend takes two others. Nobody can sit two tests at the same time! So how few test times does your school need? | clash; colouring; fair turns | colouring | S |

- **Unit check:** unchanged.
- **Changes:** the hooks were told by a teacher about "our school"; each is now told to "you". The four videos are 371 to 387 words: each comes down to 370 or fewer, in sentences of 14 words or fewer (lesson 3's hook had one of 18). This stage owns the truck story.

### `opt-s2` Goals and limits: a model, linear programming in 2D
- **For:** students, lower secondary (12–15)
- **Status:** keep
- **After it, you can:** write a choice as a model with letters and inequalities; draw the plans that fit and find the best corner; explain why some choices only come whole; read a small model in Python.
- **Before this:** No experience needed, only school maths: letters standing for numbers (2x + y), the signs ≤ and ≥, and plotting points on a grid. Drawing a limit as a line is taught in lesson 2.
- **Python:** shown and explained
- **The path:** write the choice down, draw it, see what whole numbers change, then tell a computer.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Choices, limits and a goal | write a choice as a model: variables with units, limits with ≤ and ≥, and a goal; then check whether a plan fits | Your school cook has sixty coins for each lunch. Every plate must give you enough energy, protein and iron. She serves rice, an egg and milk, every single day. Is that plate enough, and could a cheaper one be? | variable; inequality; model; feasible plan | diet | S |
| 2 | Draw the plans that fit | draw each limit as a line, shade the plans that fit, and find the best plan by working out the goal at each corner | This year you and your classmates run the school garden. A bed of beans earns forty coins, a bed of tomatoes thirty. So a friend says: plant only beans! Why would that earn you less? | feasible plans; corner; profit line; linear programming | lp | S |
| 3 | Whole numbers only | explain why some choices only come whole, show rounding breaking a limit, and beat a quick rule | Sixty-four of you are going on the school trip. A bus has thirty seats. Your calculator says: two point one three buses. So how many buses should the school book? | whole number; yes-or-no choice; quick rule; rounding | knapsack | S |
| 4 | Tell the computer | read a small model in Python line by line, complete it, and say what OPTIMAL and INFEASIBLE mean | You drew the garden on graph paper, and found the best plan. Now picture your school timetable: hundreds of choices, not two. No paper is big enough to draw it. So how could anyone find a plan that works? | solver; OR-Tools; OPTIMAL; INFEASIBLE | modeller | S |

- **Unit check:** unchanged.
- **Changes:** lesson 1's video named six new things; "constraint" and "objective" wait for later stages, and the course says "limit" and "goal" throughout. Lesson 2 keeps the drawing it teaches (mark eight on each axis, join, test one side). The student's own method is the table of five corners; sliding the profit line is watched in the lab. The lesson plan says the lesson suits the last two years of the stage best, and that a class that has not met graphs of lines can still do it. Lesson 3 opens on the trip buses and works them first; the truck arrives as the lab's case, with one task: beat the quick rule. The summary ends "No experience needed, only school maths (letters for numbers, ≤ and ≥, plotting points). If you have done “First Python”, the code will be familiar."

### `opt-s3` Let the computer search: knapsack, routes, timetables
- **For:** students, upper secondary (15–18)
- **Status:** revise
- **After it, you can:** write a search that tries every plan and say why that stops working; complete Dijkstra's method; write a route builder and improve its route; model a timetable for a solver and read its answer.
- **Before this:** `code-s3` “Functions, lists and algorithms” (Programming, upper secondary), for the Python. Nothing about the subject. The maths is powers of two (2⁶ = 64) and reading a table.
- **Python:** rung 2 (functions and lists; no dictionary is needed)
- **The path:** try every plan, then a method that is sure and fast, then a problem too big to be sure about, then say the rules and let a solver search.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Try them all, or think ahead | name the goal, the limit and the options of a search, complete a program that tries every load, and say why trying them all stops working | Six loads are waiting, and the truck takes only a thousand kilos. Your friend packs it fast and scores sixty points. She says nothing beats it. With a few lines of Python, how could you find out for sure? | brute force; greedy rule; dynamic programming | knapsack | R |
| 2 | Shortest paths | trace Dijkstra's method on a small map, and complete it in Python | Your map app finds a route across the country in a blink. It can’t try every route: there are far too many. So how does it know it found the shortest? | graph; Dijkstra's method; settle; relax | shortest | S |
| 3 | The bus route | write nearest neighbour as a loop, improve a route with 2-opt, and judge it by the longest ride | Your school bus visits nine villages every morning. You get on first, so you ride the longest. One day you ask the driver two things. Is this the shortest route, and why always me? | travelling salesperson problem; nearest neighbour; 2-opt; local best | routes | S |
| 4 | Timetables with a solver | model a club timetable for a solver, read INFEASIBLE as a proof, and add a fairness rule | Four clubs share three afternoons at your school. Sara is in three of them, and football needs the field. Every term the argument starts again. Is there a plan with no clash at all, and how could you be sure? | solver; all-different rule; propagation; INFEASIBLE | timetable | S |

- **Unit check:** the brute-force question keeps its loop; no question asks for a comprehension or `lambda`.
- **Changes:** lesson 1 is rewritten to start from zero: one scene names the goal, the limit and the options, and what "a plan that fits" means, before any code. "Bitmask" leaves its key terms: the reading says "a number whose binary digits say which loads are on", and the step that uses it becomes fill-the-gap with the bit test given. Lesson 2: the map was a dictionary inside a dictionary, and `code-s3` teaches none (Programming keeps dictionaries for university). The map becomes a table of distances, a list of lists, as lesson 3 already uses; the given line `min(todo, key=lambda q: dist[q])` becomes a three-line loop. Lesson 3: nearest neighbour is written as a plain loop that keeps the closest place so far; "list comprehension" leaves its key terms. Lesson 4: the day variables sit in a list, one per club, and the list of one student's variables is built with a loop; its title says "a solver", and CP-SAT is named in the reading. The summary names `code-s3` in place of "First Python".

### `opt-m1` Decisions on paper: variables, units, objectives and constraints
- **For:** students, university
- **Status:** new
- **After it, you can:** write a decision as variables with units and domains, an objective and constraints; check any plan against them; say what feasible, infeasible, optimal and unknown each need as evidence.
- **Before this:** No experience needed, only school algebra: reading 12a + 20b + 3p ≤ 600, putting numbers in for letters, and minutes as part of an hour (45 minutes is three quarters). No calculus, here or later.
- **Python:** shown and explained
- **Phone and computer:** all of it is meant for the phone. One thing must be timed first: the check of all 58,621 plans against the sandbox's three-second limit on an old phone. If it is too slow, the lesson checks plans in two-hour steps (7,936 of them) and the bound proves the rest. A computer is needed only for the study guide's optional exercises.
- **The path:** what you decide, what you want and must not break, what an answer proves, then one real budget from paper to a checked answer.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Decisions, units and domains | pick out the decision variables in a written problem, and give each its unit and its domain | Your society books three ninety-minute study sessions. The room costs twenty coins an hour. The treasurer’s sheet says five thousand four hundred coins; the room office says ninety. What went wrong on the sheet? | decision variable; data; unit; domain | diet | N |
| 2 | Objectives and constraints | write an objective and constraints with the right direction and units, and check a plan against them | Two members plan the society’s study month. One finds the cheapest plan that meets every need. The other buys the most study time, and spends the whole budget. Both say theirs is the best: can both be right? | objective; constraint; feasible plan; slack | lp | N |
| 3 | Feasible, optimal, or not known yet | say what feasible, infeasible, optimal and unknown each need as evidence, and prove a small optimum with a bound | Your program checks a thousand study plans, and none fits the budget. You tell the society: it can’t be done. There were fifty-eight thousand plans to check. What did your thousand really prove? | infeasible; optimal; unknown; lower bound | knapsack | N |
| 4 | A study-room budget, by hand and by code | formulate a budget decision by hand, verify it with a short program, and state what the answer does not show | Your society has six hundred coins a month for study rooms. It needs twelve hours together and thirty hours of quiet study. Eight different plans all cost the same, the least possible. Which one should the society book? | tie-break; assumption; independent checker | modeller | N |

- **Unit check:** 10 questions from the module's quiz and its nine "Check yourself" questions, at least four of them campus cases to decide.
- **Changes:** from Module 1. Lesson 1 keeps "identify variables, units and domains"; the unit error is its hook, and exact fractions go to the reading (the phone's Python has no fractions module, so times are whole minutes). Lesson 2 keeps "write and check"; that a different objective picks a different plan is its hook, and "binding" waits for `opt-m2-1`. Lesson 3 keeps the four status words and the bound (20 × 12 + 3 × 30 = 330); the check of every plan is run, not written, and ties go to lesson 4. Lesson 4 is the task: the project is the hand formulation, the tie-break and the note on assumptions; the code is two fill-the-gap steps whose gaps are the constraints and the objective themselves, so the step tests the formulation, not the Python. The MiniZinc example stays in the study guide. The labs are the app's school cases (lunch, garden, truck): each lab scene says so in one line.

### `opt-m2` Is there an answer? Feasibility, enumeration and quick rules
- **For:** students, university
- **Status:** new
- **After it, you can:** prove that a small set of constraints allows nothing; count candidates and say why checking them all stops working; judge a quick rule against bounds and report the gap.
- **Before this:** `opt-m1` “Decisions on paper” (Optimization, university) and `code-m5` “Lists and dictionaries” (Programming, university; it follows `code-m1` to `code-m4`). The maths adds two inequalities together (x ≥ 4 and y ≥ 2 give x + y ≥ 6), powers (5⁴ = 625) and fractions (20/3).
- **Python:** rung 2
- **Phone and computer:** all of it runs on the phone: 625 candidates are checked in a blink.
- **The path:** is anything allowed, how many candidates are there, how good is a quick answer, then one allocation proved and a quick rule judged.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Feasible regions, and proving there is none | read a feasible region, tell a binding constraint from a redundant one, and prove in one line that nothing is allowed | Your study group wants four evening meetings and two weekend ones. The room is free five times this month. You try a few timetables and give up. How could you prove, in one line, that none exists? | feasible region; binding constraint; redundant constraint; certificate | lp | N |
| 2 | Counting candidates, and searching them all | count the candidates of a small problem, explain why checking them all stops working, and trace a search that prunes safely | Four study groups share seven loan laptops. Your program checks every way to share them in a blink. With twenty groups, the same program would run for three years. Why so long, and must it check them all? | candidate; combinatorial explosion; backtracking; pruning | sudoku | N |
| 3 | Quick rules, bounds and the gap | build a quick answer with a greedy rule, bracket the best answer between two bounds, and report the gap | The loan desk gives each laptop where it helps most now. It sounds fair, and it takes a minute. The result supports thirty-two study hours a week, and forty were possible. What did the rule miss? | heuristic; greedy rule; upper bound; gap | routes | N |
| 4 | Seven laptops, four groups | prove the best allocation by checking every candidate, compare a greedy rule with it, and say when the rule would be right | Group two’s project needs three laptops before it can start. One or two are no use at all. The loan desk’s rule hands laptops out one at a time. Will group two ever get its first? | baseline; diminishing returns | knapsack | N |

- **Unit check:** 10 questions from the module's quiz and "Check yourself" questions.
- **Changes:** from Module 2. Lesson 1's video takes the certificate; the grid of whole-number points goes to the reading, and the lab shows the region. This lesson also gives `opt-s4-1` its picture: a region, its boundary, the limits that bind. Lesson 2's video takes counting and growth; backtracking with safe pruning is traced and completed as an order-the-lines step, not written from nothing (recursion's home is `code-s4`). Branch and bound is named in the reading; `opt-s4-2` owns it. Lesson 3's video takes greedy, the two bounds and the gap; the wording after a stopped search goes to the reading and comes back in `opt-m3-3`. Lesson 4 is the task; its tests are `assert` lines the lesson gives.

### `opt-m3` A model a solver can read: model, data and status
- **For:** students, university
- **Status:** new
- **After it, you can:** write a small model for a solver, with its data apart; run one model on several data sets; say what each solver status proves; check every reported plan yourself.
- **Before this:** `opt-m2` “Is there an answer?” (Optimization, university) and `code-m6` “Files and exceptions” (Programming, university). The maths adds a sum over a list ("the sum over requests of need × accept"), explained in lesson 1.
- **Python:** rung 2; `sum(… for …)` inside a model line is taught here
- **Phone and computer:** the model, its data file and the check of all 64 plans run on the phone, in CP-SAT. MiniZinc needs a computer and is optional: its model files and recorded outputs are in the study guide.
- **The path:** a first model, the data moved out of it, the status read honestly, then a loan model run on three weeks.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | A first model for a solver | write a small model (parameters, decision variables with domains, constraints, an objective) and confirm it against a check of every plan | The media lab lends laptops, cameras, tripods and microphones. Six groups each want a whole kit for one week. There is not enough for all six. How do you ask a program which groups should get a yes? | model; parameter; solver; CP-SAT | modeller | N |
| 2 | Model and data apart | keep the data out of the model, run one model on two data sets, and validate the data before solving | Your loan model works for this week. Next week two laptops are broken, and you edit the numbers inside it. A month later, nobody knows which week the file describes. Where should this week’s numbers have lived? | data set; index set; array of variables; data validation | modeller | N |
| 3 | Reading the status, and checking the answer | say what each solver status proves, and check a reported plan yourself against the data | You ask the solver for loan plans and stop it after three. All three are valid, so you send them to the lab manager. In truth there are nine. What should your message have said? | solver status; OPTIMAL; FEASIBLE; UNKNOWN | colouring | N |
| 4 | An equipment-loan model with its data apart | build a loan model with separate data, run three scenarios, and report each status and each checked plan in one honest sentence | In a shortage week, the solver’s best plan scores nine points. A different plan scores nine too. The solver showed you only one of them. So who decided which groups go without a kit? | scenario | modeller | N |

- **Unit check:** 10 questions; two ask what a printed status does and does not prove.
- **Changes:** from Module 3, the one that changes most. The draft teaches MiniZinc. Here the same lesson is taught in CP-SAT: a parameter is a value read from the data, a decision variable is `model.new_bool_var`, a constraint is `model.add`, the goal is `model.maximize`, and the status is what `status_name` prints. Lesson 1's reading shows the MiniZinc model once beside the CP-SAT one, as the same thing in another language. Lesson 2 keeps "one model, many data files": the model is a function of the data, and the week's numbers sit in a small file beside the step. Lesson 3 maps the draft's status lines onto OPTIMAL, FEASIBLE, INFEASIBLE and UNKNOWN; "three printed, nine exist" is shown by stopping a count early. Lesson 4 is the task with CP-SAT in place of MiniZinc.

### `opt-m4` Yes or no: rules between choices, knapsack and capacity
- **For:** students, university
- **Status:** new
- **After it, you can:** model yes-or-no choices and the rules between them; solve a small knapsack exactly and bound it; explain to a person why their option was left out.
- **Before this:** `opt-m3` “A model a solver can read” (Optimization, university), which needs `code-m6` “Files and exceptions” (Programming, university). The maths adds "if … then" and "not both" written with 0 and 1, checked in a truth table: taught in lesson 1.
- **Python:** rung 2
- **Phone and computer:** all of it runs on the phone: 256 plans, the table, and the CP-SAT model. The draft's MiniZinc runs with two solvers are optional, on a computer.
- **The path:** a choice as 0 or 1, limits that fill up, the question "why not mine?", then a term's workshops chosen and explained.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Yes or no, and rules between choices | turn "this needs that" and "not both" into inequalities over 0/1 variables, and check each with a truth table | Workshop two builds on workshop one. So the training office writes one rule into its plan. The plan comes back: workshop two runs, workshop one is cancelled. What did the rule really say? | binary variable; if-then rule; not-both rule; truth table | modeller | N |
| 2 | Knapsack and capacity | write capacity constraints with units, follow the table that solves a small knapsack exactly, and bound it from above | The training office has twenty hours and eight workshops to choose from. Together they need many more hours than that. Someone says: take the best value per hour first. Is that sure to give the best term? | knapsack problem; capacity; dynamic programming; relaxation | knapsack | N |
| 3 | Why not mine? Explaining what was left out | explain an exclusion with the rules it would break and the price of forcing it in | Next term’s workshop list is out, and yours is missing. Yet an hour and twenty coins were left over. You ask the office: why not mine? What would an honest answer look like? | forced choice; price of inclusion | modeller | N |
| 4 | Choose the workshops, and write to those left out | select workshops within two limits and two rules, prove the selection, and explain each exclusion in a short respectful note | Workshop seven gives the most value for every hour it takes. A quick rule tries it first, finds its prerequisite missing, and never comes back. The term loses three points. How would you catch that before the list goes out? | — | knapsack | N |

- **Unit check:** 10 questions; one asks for the inequality of a rule, one for its truth table.
- **Changes:** from Module 4. Lesson 1's video takes the two rules and the truth table; "at least one" and "if A and B then C" go to the reading. Lesson 2's video takes capacity and the table; the fractional bound (65/2, so at most 32) is its second worked case. Lesson 3's video takes the two honest answers; the greedy baseline moves to lesson 4. Lesson 4 is the task. The draft's one OR-Tools example becomes the course's normal way of solving.

### `opt-m5` Who does what: assignment, sets and matching
- **For:** students, university
- **Status:** new
- **After it, you can:** model who does what with availability as domains; state the exact conflict and use a global rule only where it is true; prove "impossible" with a certificate anyone can check.
- **Before this:** `opt-m4` “Yes or no” (Optimization, university), which needs `code-m6` “Files and exceptions” (Programming, university). The maths adds sets ("the set of people free for a session") and a function ("each session gets exactly one assistant"): one sentence each, in lesson 1.
- **Python:** rung 2
- **Phone and computer:** all of it runs on the phone: 144 candidates, and CP-SAT's all-different rule.
- **The path:** an assignment written down, a rule that is too strong, a proof that nobody is left, then a week's rota and a what-if.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | An assignment as a function | write an assignment as one variable per session whose domain is the people available, and count the candidates | Six lab sessions need an assistant each, and there are five assistants. That makes over fifteen thousand possible rotas. Note who is free when, and only a hundred and forty-four remain. Where did the rest go? | assignment; availability set; 0/1 matrix | assign | N |
| 2 | The exact conflict, and rules that are too strong | state exactly when two sessions clash, and show by counting that an over-strong rule throws valid plans away | A coordinator adds one tidy rule: no assistant teaches twice. The solver answers at once: no rota exists. A minute ago there were sixty-three valid rotas. What did the tidy rule forbid? | overlap test; global constraint; all-different; over-constraining | timetable | N |
| 3 | Matching, and a short proof of "impossible" | find the largest matching step by step, and when no complete one exists, name the group of sessions that proves it | A seventh lab session is added, and Lina drops one. The solver now says: no rota exists. The coordinator won’t accept a bare no. What is the shortest proof you could show her? | matching; augmenting path; Hall certificate | colouring | N |
| 4 | Assistants to sessions, and "what if?" | assign people to sessions without forbidding a valid plan, prove the best plan, and answer a what-if with an optimum or a certificate | Your rota model gives every lab session an assistant. The coordinator asks: is this the only good plan? And did your rules throw any good plans away? What do you need to show her? | load limit; preference score | assign | N |

- **Unit check:** 10 questions; one gives two sessions that touch at eleven o'clock and asks whether they clash.
- **Changes:** from Module 5. Lesson 1's video takes the function form and domains; the 0/1 matrix is named and worked in the reading. Lesson 2's video takes the exact clash test and the count (63 valid plans, none under the over-strong rule). Lesson 3's video takes the certificate (three sessions, two people); augmenting paths are traced by hand in the practice, and the checker that reports every problem moves to lesson 4. Lesson 4 is the task. The names are the draft's invented assistants; preferences are stated wishes, and the reading says so.

### `opt-m6` When: scheduling, precedence and shared resources
- **For:** students, university
- **Status:** new
- **After it, you can:** model a day's activities with start times, precedence and shared resources; write a checker that shares no code with the solver; prove the shortest day and say what "does not fit" means.
- **Before this:** `opt-m5` “Who does what” (Optimization, university), which needs `code-m6` “Files and exceptions” (Programming, university). The maths adds durations and rounds a division up.
- **Python:** rung 2
- **Phone and computer:** the model, the checker and the bounds run on the phone. The proof that no day ends by hour 8 checks 112,896 combinations: too many for a three-second loop. It runs as a CP-SAT model if a test on an old phone shows it finishes, and otherwise on a computer. The phone's CP-SAT has no cumulative rule, so rooms are counted hour by hour.
- **The path:** when things start, what they share, how short the day can be, then the lab day scheduled and the manager advised.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Start times and precedence | model a day's activities with start times and durations, write "this before that" as an inequality, and find the longest chain | A teaching lab has six jobs to fit into one day. A safety briefing, set-up, three practicals, and clean-up. Some must wait for others to finish. Before placing anything, can you say how early the day could end? | start time; precedence; critical path; makespan | timetable | N |
| 2 | Shared rooms, one technician, and a checker of your own | model a shared resource with a capacity, read an hour-by-hour usage profile, and write a checker that reports every problem | A proposed lab day looks neat on the page. Yet three practicals run at once in two rooms, and the technician is booked twice. Your scheduling program says the plan is fine. Who checks the checker? | shared resource; usage profile | modeller | N |
| 3 | Bounds, and proving the shortest day | compute lower bounds for a schedule, and prove the shortest day with one checked schedule and a complete "none earlier" answer | Your sums say the lab day cannot end before hour seven. Your best schedule ends at hour nine. A colleague says: keep searching, seven must be possible. Is she right, and how would you settle it? | decision question; horizon | timetable | N |
| 4 | Schedule the lab day, and advise the manager | produce the shortest lab day with its proof, check it independently, and advise on one more technician or one room fewer | With one room fewer, no schedule fits the ten-hour day. The manager hears: the lab cannot run. In fact it can, in twelve hours. What exactly should your note have said? | — | modeller | N |

- **Unit check:** 10 questions; one shows a schedule as text and asks for every broken rule.
- **Changes:** from Module 6. Lesson 1's video takes precedence and the longest chain (1 + 2 + 3 + 1 = 7); the text chart of a schedule goes to the reading. Lesson 2's video takes the usage profile and the checker; the draft's `cumulative` rule is described in the reading as what a full solver offers. Lesson 3's video takes "a bound of 7, a best of 9, and none by 8"; greedy list scheduling goes to the practice. Lesson 4 is the task.

### `opt-m7` No answer? Conflicts, repairs and equal models
- **For:** students, university
- **Status:** new
- **After it, you can:** prove a small model infeasible and find a minimal conflict; set out every repair with its owner and its cost; show that two models of one problem agree, and break symmetry only where it is valid.
- **Before this:** `opt-m6` “When” (Optimization, university), which needs `code-m6` “Files and exceptions” (Programming, university). The maths adds powers (3⁵ = 243).
- **Python:** rung 2; a list of small rule functions is taught here
- **Phone and computer:** all of it runs on the phone: 243 timetables, and the second model through CP-SAT.
- **The path:** why there is no answer, what could be given up, whether the model itself can be trusted, then a timetable repaired with the people who own its rules.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Proving there is no answer, and finding who must talk | prove a small model infeasible, and find a minimal set of requirements that cannot all hold | Five tutorials, three days, and nine requests from nine different people. Your program tries every timetable, and not one works. The head of department asks: so who do I need to phone? What do you tell her? | minimal conflict; deletion filter | timetable | N |
| 2 | Repair options, and "unknown" when it is | list every minimal way to repair an infeasible model with its owner and its cost, and tell a proved "no" from "not found yet" | The broken timetable can be repaired in four different ways. One moves a lab, one declines a student request, and two relax a pair of rules. Your program could pick one in a millisecond. Should it? | repair option; correction set | modeller | N |
| 3 | Two models of one problem, and symmetry | write one problem in two equivalent ways, and add a symmetry-breaking rule only where it is valid | Your timetable search finds thirty-six answers. You print them, and most look oddly familiar. They are the same plans, with the day names swapped around. How many are truly different, and how could the search skip the copies? | equivalent formulation; symmetry; symmetry breaking | colouring | N |
| 4 | Repair the timetable, and show the model is sound | explain why a timetable has no solution, present the repairs for people to choose from, and show that two models of it agree | The department’s timetable has no solution. The head asks for your recommendation. You have four repairs and a favourite. If you hand her only your favourite, what has she not been told? | — | timetable | N |

- **Unit check:** 10 questions; one gives a stopped search and asks for the right status word.
- **Changes:** from Module 7. Lesson 1's video takes the minimal conflict; that the order of the filter changes which conflict you find goes to the practice. Lesson 2's video takes the four repairs and who owns each; a stopped search against a proof was taught in `opt-m3-3` and returns here as one check. Lesson 3's video takes symmetry (36 timetables, 6 truly different); the two formulations (5 variables or 15) are its worked case in the reading and the code. Lesson 4 is the task: a recommendation, clearly marked as one.

### `opt-m8` What if? Sensitivity, two goals, fairness and reports
- **For:** students, university
- **Status:** new
- **After it, you can:** test how a decision depends on a capacity and on an uncertain estimate; set out the trade-off between two goals and what each way of choosing assumes; write a report whose claims match its evidence.
- **Before this:** `opt-m7` “No answer?” (Optimization, university), which needs `code-m6` “Files and exceptions” (Programming, university). The maths adds shares as fractions (2/5), a weighted sum and percentages.
- **Python:** rung 2
- **Phone and computer:** all of it runs on the phone: each solve checks 840 plans. A search "stopped at a limit" is a loop that stops after a set number of candidates.
- **The path:** change a number, hold two goals at once, say only what the evidence shows, then one page a director can act on.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Sensitivity: change a number and solve again | vary a capacity or an uncertain estimate, read what one more unit is worth, and say over what range a recommendation holds | The support centre’s best plan gives the evening group nothing. It rests on one guess: six students helped per session. The true figure could be four, or nine. At what figure would the plan flip? | sensitivity analysis; marginal value; break-even point; robust decision | lp | N |
| 2 | Two goals, a front of trade-offs, and fairness | find the plans no other plan beats on two goals, and explain what each way of choosing among them assumes | The plan that helps the most students helps eighty-nine a week. The sixty evening students get nothing. A fairer plan helps seventy-nine. Which plan is better, and who should say? | Pareto front; weighted sum; fairness floor; price of fairness | assign | N |
| 3 | Status words, bounds and an honest report | report a result with the status its evidence supports, and use a bound to say how far from the best it can be | Your search stops after one second, with a plan helping seventy-nine. The director asks: is that the best we can do? You don’t know. What can you still say that is true and useful? | time-limited result; decision report | anneal | N |
| 4 | A one-page memo the director can act on | write a one-page decision memo: the recommendation, its status, its assumptions, what would change it, the trade-offs and the limits | The director must share ten weekly tutoring sessions among four groups. She will read one page, once. Your analysis fills six tables. What must be on that page, and what must it never claim? | — | knapsack | N |

- **Unit check:** 10 questions; two give a sentence from a report and ask whether its evidence supports it.
- **Changes:** from Module 8. Lesson 1's video takes the uncertain estimate (no change from 4 to 6, a tie at 7, a new plan from 8); marginal values of capacity (+9, +7, +6) are the second worked case. Lesson 2's video takes the front and the price of fairness (ten students helped); the three ways of choosing are compared in the reading, and the lexicographic and minimum-share methods get one practice step each. Lesson 3's video takes "at most ten below the best". Lesson 4 is the task: the memo is the project. The fairness measure is one choice among many, and every lesson that uses it says so.

### `opt-s4` Operations research: LP, MIP, CP, OR-Tools modelling, heuristics
- **For:** students, university
- **Status:** keep
- **After it, you can:** trace the simplex method and read shadow prices; explain why a relaxation is a bound and follow branch and bound; explain propagation and fail-first search; build a heuristic and measure its optimality gap.
- **Before this:** `opt-m8` “What if?” (Optimization, university), and through the modules `code-m6` “Files and exceptions” (Programming, university). The maths adds e^(−d/T), read off a calculator, in lesson 4. Vectors are not needed: standard form is written out for the garden first.
- **Python:** rung 2; a slice is taught here
- **Phone and computer:** all of it runs on the phone, as today.
- **The path:** inside a linear solver, inside an integer solver, inside a constraint solver, then what to do when none of them can finish.

| # | Lesson | After it, you can | Hook | New terms | Lab | Work |
|---|---|---|---|---|---|---|
| 1 | Linear programming and the simplex method | trace the simplex method from corner to corner, and read shadow prices to say what a limit is worth | Your society’s garden earns two hundred and ninety coins a season. Someone offers an extra volunteer hour for ten coins. Someone else offers an extra bed for twenty. Which offer is worth taking? | linear program; simplex method; shadow price; complementary slackness | diet | S |
| 2 | Integer programs and branch and bound | explain why the relaxation is a bound, follow branch and bound on a small case, and model a fixed cost with a yes/no variable | Sixty-four students have signed up for your department’s field trip. A bus seats thirty, a minibus fourteen. Your model says: hire two point one three buses. So what do you actually book? | mixed-integer program; LP relaxation; branch and bound; big-M constraint | modeller | S |
| 3 | Constraint programming: propagation and search | explain propagation and fail-first search, and say why one global rule does more than its pieces | Two programs solve the same hard sudoku on your phone. One makes thirteen thousand five hundred and twenty-eight guesses. The other makes four. Same puzzle, same rules: so what does the second one know? | propagation; fail-first search | sudoku | S |
| 4 | Heuristics and trade-offs | build a heuristic for a route, measure its optimality gap against a bound, and put a fairness limit in the model | The campus shuttle has twenty stops. The number of possible rounds has nineteen digits, so nobody can check them all. Yet tomorrow’s round must be ready tonight. How good is a plan that nobody can prove is the best? | NP-hard; local search; local optimum; metaheuristic | anneal | S |

- **Unit check:** unchanged.
- **Changes:** the course becomes the theory course that follows the modules, and its card says so: "how solvers work inside". Each lesson opens with one scene that names the module lesson it builds on and then goes inside the solver: lesson 1 on the region of `opt-m2-1` and the marginal value of `opt-m8-1`; lesson 2 on the pruning of `opt-m2-2` and the relaxation of `opt-m4-2`; lesson 3 on the all-different rule of `opt-m5-2`; lesson 4 on the greedy rule of `opt-m2-3` and the front of `opt-m8-2`, which it no longer teaches again. Lesson 1 is 532 words and starts with a definition: it is cut and starts with the garden. Hooks 1 and 4 were about the subject (Dantzig in 1947; a delivery company) and did not end on a question. Each video keeps four terms or fewer because the modules now own the rest (feasible region, gap, global constraint, symmetry breaking). The reading says "hours of work", not "pupils' hours". Python: lesson 1 gives the first need as a finished line, so the other two follow its pattern; lesson 2's ordering step reads a function that calls itself, and does not ask for one (recursion's home is `code-s4`); lesson 3's box step becomes fill-the-gap, because its index sums are the hard part, not its comprehension (`code-m5-4` teaches that); lesson 4's reading explains a slice with one example. The summary names `opt-m8` in place of "First Python (lower secondary)".

### `opt-capstone` Capstone: an exam timetable that really works
- **For:** students, university (capstone)
- **Status:** move
- **After it, you can:** formulate an allocation by hand; build a solver model and a checker that shares no code with it; compare a baseline, a fairness-first plan and an efficiency-first plan across scenarios; write a decision memo whose claims match the evidence.
- **Before this:** `opt-s4` “Operations research” (Optimization, university) and `code-m7` “Tests and debugging” (Programming, university). It needs a laptop or Codespaces, a GitHub account and about 17 hours.
- **Python:** rung 3 (the starter repository teaches the libraries it uses)
- **Phone and computer:** the hand formulation, the checker's design and the memo can be done on paper or a phone. The rest needs a computer or Codespaces.

- **Changes:** it moves from level 3 (upper secondary) to level 4, after `opt-s4`. It keeps its id, its starter repository and its five milestones, and it is set in a faculty, not a school. From the draft's capstone (a shared computer lab, 12 hours) it takes what it lacks: a hand formulation with units before any code, a first-come-first-served baseline, a table of three scenarios with the price of fairness, status words that match the evidence, a two-page memo for a committee, a half-page reflection, and the 100-point rubric. The draft's own brief, data and starter stay in the kit as a second brief for a learner who cannot run the app or the second solver: Python's standard library is enough for it. Text only.

## How today's courses map

| Today | In this plan | What happens |
|---|---|---|
| `opt-1-1` | Teachers, Beginner | Kept. 4 standard passes. Gains "No experience needed." |
| `opt-2-1` | Teachers, Elementary | Kept. 4 standard passes. Names `opt-1-1` and the algebra; no Programming course. |
| `opt-3-1` | Teachers, Intermediate | Revised. Lessons 3 and 4 rewritten with new cases and projects; 2 standard passes. Names `opt-2-1` and `code-2-2`. |
| `opt-4-1` | Teachers, Advanced | Kept. 4 standard passes. Lesson 2 opens with a reminder and gets a new lab task. Names `opt-3-1`. |
| `opt-u1` | University teachers | Kept. 4 standard passes. Gains its "Before this". |
| `opt-s1` | Students, primary | Kept. 4 standard passes. Keeps the truck story. |
| `opt-s2` | Students, lower secondary | Kept. 4 standard passes. Lesson 3 opens on the trip buses. Says what school maths it expects. |
| `opt-s3` | Students, upper secondary | Revised. Lesson 1 rewritten to start from zero; 3 standard passes. Names `code-s3`; no comprehension or `lambda`. |
| `opt-s4` | Students, university, theory | Kept. 4 standard passes. Follows the modules; names `opt-m8`. |
| `opt-capstone` | Students, university, capstone | Moves from level 3 to level 4, and takes parts of the draft's capstone. Text only. |
| (new) `opt-m1` to `opt-m8` | Students, university, the path from zero | New: 32 lessons and 8 unit checks, from the Darsi University draft. |

## Work, in order

**First, the draft itself.** The Darsi University material is an unreviewed draft. No subject specialist and no
Arabic reader has reviewed it, nobody has tried it with learners, and its code was tested on one Linux machine. Its
narration is a one-minute summary per lesson, so every video is new. Before a module becomes a course:

- a subject review of the module, and an Arabic review of its guide (the guide ships in the kit);
- its models written again in CP-SAT and run in the phone's sandbox (the draft has 53 MiniZinc runs);
- its largest checks timed on an old phone against the three-second limit (58,621 plans in `opt-m1`; 112,896 in
  `opt-m6`);
- its storyboards written to the eleven parts, with the hooks above, in English and Egyptian Arabic.

Then:

1. **`opt-m1` and `opt-m2`** (8 new lessons): what a university student should meet first, and the pilot for
   turning a module into a course.
2. **`opt-m3` to `opt-m8`** (24 new lessons), in order: each needs the one before.
3. **`opt-s4`, `opt-u1` and `opt-4-1`, standard pass** (12 lessons): the courses that are published today.
4. **`opt-1-1`, `opt-2-1`, then `opt-3-1`** (10 standard passes, 2 rewrites): the teachers' ladder, in order.
5. **`opt-s3` lesson 1 rewritten, then the rest of the school stages** (1 rewrite, 11 standard passes).
6. **Text only:** the summaries' last lines; the capstone's level, setting and new deliverables; the lab prompts
   that change task by level; the two unit-check questions in `opt-3-1`; "optimality gap" in `opt-4-1-4`; the
   spelling in `opt-u1`.

In all: 33 standard passes, 3 rewrites and 32 new lessons. Narration is about $2.06 for both languages.

## Decisions for the user

1. **Build the university path from the eight modules?** Recommended: yes. Without it, the only published students'
   course starts with the simplex method. Cost: 32 new lessons (about $1.28 of narration), 8 unit checks, and the
   reviews listed above.
2. **Does `opt-m1` need Python?** The draft says Module 1 needs functions, lists and dictionaries. Recommended: no.
   On Darsi its code is read and completed, and the gaps are the constraints themselves, so a student can start the
   subject at once and begin Programming beside it; Python is needed from `opt-m2` (`code-m5`) and files from
   `opt-m3` (`code-m6`). The other choice names `code-m5` on `opt-m1`: five Programming courses before the first
   optimization lesson. Cost of the recommendation: none.
3. **What "modelling language" means on Darsi.** Recommended: CP-SAT in Python, on the phone, in code steps and the
   `modeller` lab; MiniZinc shown once and left to the study guide for learners with a computer. Cost: the draft's
   models are written again in CP-SAT and tested (about 25 different models). The other choice teaches MiniZinc as
   the draft does: then `opt-m3` and every "optional tool" example need a computer.
4. **What needs a computer, and whether to add to the sandbox.** With the recommendation above, only three things
   do: the proof in `opt-m6` (unless a phone test passes), the capstone, and the study guides' optional exercises.
   Three small additions to the phone's Python would remove the first and shorten many steps: the draft's 100-line
   helper that checks every candidate and reports an honest status (it leans on `fractions`, which the phone
   lacks), a search limit a learner can set, and a rule for shared resources. Recommended: build the courses
   without them, and decide after `opt-m6` is timed. The Programming plan asks for additions too (`unittest`, a
   program in two files): decide them together. Cost if added: app work, and tests.
5. **Where `opt-s4` sits.** Recommended: after `opt-m8`, as the theory course ("how solvers work inside"). It stays
   published; until the modules are published, its summary would name courses a learner cannot open yet, so it
   keeps today's wording until `opt-m1` is live.
6. **One capstone, combined.** Recommended: keep today's capstone (its id, repository and milestones), set it in a
   faculty, and add the draft's hand formulation, baseline, scenario table, status words, memo and rubric. Cost: a
   level number, new text, and a longer starter README. The other choice replaces its problem with the draft's
   shared computer lab: a new starter repository.
7. **Rewrite `opt-3-1-3` and `opt-3-1-4`?** Recommended: yes. Cost: 2 rewrites (about $0.08), two new projects and
   three code steps. The other choice keeps both and adds only "At level 1 you…": the repeats stay.
8. **Which Programming course `opt-s3` names.** Recommended: `code-s3`, which teaches the functions and lists the
   course writes in every lesson; its two dictionaries become lists, because Programming keeps dictionaries for
   university. The other choice names `code-s2` and teaches functions and lists in place, as `agents-s3` does:
   three more rewrites (about $0.12) and videos with five new terms.
9. **Teachers' levels 3 and 4 need `code-2-2`.** It is new in the Programming plan (“More Python for teachers”).
   Until it is built, both courses rest on the paragraph added to `code-2-1-4` on 2026-11-04. The other choice
   makes every written step at those levels a guided one: no Programming course, but "Solving school problems in
   Python" would no longer ask a teacher to write a model.
10. **Labs with school stories in university courses.** The eleven labs show a school garden, a school lunch and a
    village truck; the modules' cases are a study room, loan laptops, workshops and a tutoring centre, which have
    no lab. Recommended: keep the labs as the place to try each idea, and say so in one line. Later, if wanted:
    campus data sets for `knapsack`, `assign` and `timetable` (app work).

## Reference

Kept from the plan of October 2026, and corrected where the labs' wording changed on 2026-11-04. The numbers come
from the Labs apps (`apps/web/src/labs/apps/<id>/model.ts`); keep them the same everywhere.

### How the courses talk about decisions

- **The three parts, in the same words everywhere:** the **options** a decision can take (the variables), the
  **limits** every plan must keep (the constraints) and the **goal**, one number to make as large or as small as
  possible (the objective). A plan that keeps every limit is **feasible**; the best feasible plan is **optimal**.
  Checking a plan is easy; finding the best can be hard.
- **Honest status words, in the university courses above all:** optimal and infeasible need a finished search, a
  check of every candidate or an exact argument; "feasible, not proved optimal" when a limit was reached; "unknown"
  when nothing was found under a limit, which never means impossible.
- **Fairness and trade-offs at every level, not only the last:** who gets the class nobody wants (level 1), what the
  cheapest lunch leaves out (level 2), the child who rides the bus longest and the pupil with exams back to back
  (level 3), the worst-off against the total, and who decides (level 4). A model gives the menu; people with
  authority choose from it.
- **No device needed for teachers.** Every teachers' lesson has an activity with paper, chalk, string or cards: item
  cards and a weight limit, a chalk map on the playground, pupils as villages, graph paper, a timetable grid with
  sticky notes. Code steps print as paper exercises in the kit.
- **Local examples:** the school garden and lunch, exam week, the school bus between villages, the supply truck to a
  village school, the timetable, class duties, a flooded bridge. On campus: a society's study rooms, loan laptops,
  a media lab's kits, a term's workshops, lab assistants, a lab day, tutorials, a tutoring centre.
- **The cast** (in students' videos they are the students' teachers): Ms Salma (maths, the sceptic) leads models and
  linear programming; Mr Joseph (computer studies) leads the Python and OR-Tools; Ms Amina (primary) brings everyday
  decisions and the youngest pupils; Mr Okafor (science) brings the garden, the lunch and the bus; Dr Farah
  (education lecturer) leads fairness, trade-offs and projects. In `opt-u1` all five are lecturers.

### Facts the courses use

- **Pack the truck** (`knapsack`): a 1,000 kg truck for a village school. Solar panels 600 kg, 42 points; desks
  500 kg, 33; books 500 kg, 32; water filter 300 kg, 15; footballs 200 kg, 8; chalk and paper 100 kg, 3. Greedy
  (most points per 100 kg first: solar 7, desks 6.6, books 6.4, filter 5, footballs 4, chalk 3) takes solar, filter
  and chalk: 60 points. The best load is desks and books: 65. Up to 2,000 kg, 1,000 kg is the only size where greedy
  misses (at 1,100 kg both take solar and desks, 75). Dynamic programming fills a table, one row per load, one
  column per 100 kg of room. Six loads have 2⁶ = 64 possible loads.
- **The class outings** (the video of `opt-1-1-1`): 1,200 coins and five ideas. Favourite first takes the zoo (700
  coins, 25 votes) and the museum (500 coins, 18 votes): 43 votes. The museum, the farm and the river park also cost
  1,200 coins and win 45.
- **The shortest way** (`shortest`): Home, Tala, Bora, Kesi, Mina, Rubi, Sana, School. The shortest way is Home →
  Tala → Kesi → Mina → School, 4 + 3 + 2 + 4 = 13 km. The straight-looking way through Bora is 5 + 10 = 15 km. Flood
  the bridge between Kesi and Mina and it becomes Home → Rubi → Sana → School, 6 + 5 + 3 = 14 km. Dijkstra's method
  (1956) always settles the waiting place with the smallest distance first.
- **The bus route** (`routes`): the school and nine villages. Nearest neighbour drives 34.6 km; three 2-opt swaps
  (take out two roads, reverse the stretch between them) bring it to 28.6 km, the best route. "New map" gives other
  maps, and on some the swaps stop short. A round trip from the school through n villages has n! ÷ 2 orders: 9
  villages 181,440; 10 villages 1,814,400; 20 villages about 1.2 × 10¹⁸, a number of 19 digits (at a billion routes
  a second, about 38 years). The five-place table of `opt-3-1-3`: nearest neighbour drives 23 km and the first
  village rides 21; the best route drives 19 km and its longest ride is 16.
- **Teachers to classes** (`assign`): Amina, Karim, Leila, Yusuf, Zainab and maths 5, science 6, English 7, history
  8, art 9, scored 0–9; the scores can be changed. First come, first served (Amina chooses first) totals 29: Amina
  takes maths, so Karim, who is good only at maths, gets science (2). The best total is 39 (the Hungarian method,
  1955): Karim maths, Leila science, Yusuf English, Zainab art, Amina history; its lowest score is 6.
- **The duty rota** (`opt-4-1-2`): Amina (gate 9, lunch hall 2, library 6), Joseph (7, 8, 4), Salma (4, 5, 2). The
  best total is 19, and Salma scores 2. Lifting the worst-off gives 18, and nobody scores below 5: the price of
  fairness is 1.
- **The garden** (`lp`): x tomato beds, y bean beds. Land x + y ≤ 8; water 2x + y ≤ 14 (cans a day); hours of work
  x + 3y ≤ 18 (a week). Profit 30x + 40y. Corners (0, 0), (7, 0), (6, 2), (3, 5), (0, 6). The best is (3, 5): 290.
  Beans only stops at six beds: 240. With tomatoes at 50 the best moves to (6, 2): 380. Land and hours are used up
  at (3, 5); water has 3 cans to spare. One more hour (19) gives 295, so an hour is worth 5; one more bed of land
  (9) gives 315, so a bed is worth 25; more water is worth nothing. An hour is worth 5 from 18 up to 24 hours, where
  the best plan reaches (0, 8), 320, with land and hours both still used up; beyond 24, more hours add nothing.
  Leave the hours line out of a model and the solver plans 8 bean beds, 320, which needs 24 hours.
- **School lunch** (`diet`): per portion, price in coins, energy (kcal), protein (g), iron (mg): rice 15, 260, 5,
  0.4; beans 20, 230, 15, 4; egg 12, 75, 6, 0.9; milk 18, 150, 8, 0.1; greens 10, 40, 5, 6; groundnuts 8, 170, 7,
  0.6. A lunch needs 700 kcal, 20 g protein and 5 mg iron. The usual plate (2 cups of rice, an egg, a cup of milk)
  costs 60 coins and has only 1.8 mg iron. With at most 2 portions of a food, the cheapest is 1.3 cups of rice, 0.55
  cups of greens and 2 handfuls of groundnuts: 41 coins (40.97). Energy and iron are met exactly and set the price;
  protein, at 23 g, is already more than needed. Allow 4 portions and it is almost all groundnuts (36.48): the model
  obeys only the rules it is given.
- **Whole numbers** (no lab of its own): 64 people on a trip; a minibus seats 14 for 300 coins, a bus 30 for 550.
  The linear program says 2.13 buses (1,173 coins). Round down (2 buses) and 4 people stay behind; round up (3
  buses) and it costs 1,650. The best whole-number plan is 2 buses and 1 minibus: 1,400. With a 300-coin booking fee
  for any minibus, 3 buses win; the answer flips when the fee passes 250.
- **The timetable** (`timetable`): classes 5A, 5B, 6A; four periods; Mr Musa maths, Ms Huda science, Mr Ali English,
  Ms Rana art. Ms Huda leaves after period 3; 6A's maths test is in period 1. Propagation and search: 8 guesses, 3
  dead ends; plain backtracking: 389 guesses. Add "the art room holds an exam in period 3": 2 guesses. Add "the lab
  is busy in period 1" too: no timetable exists (science needs 3 periods, only 2 are left), and the solver proves
  it.
- **Exam slots** (`colouring`): maths, English, science, Arabic, history, geography, art, French; six pupils (Sami,
  Hala, Omar, Dina, Nadia, Tarek). Greedy in list order needs 4 slots; DSatur finds 3; 3 is the fewest, because
  Omar's three exams (maths, Arabic, French) all clash with each other (a clique). "No pupil sits exams in two slots
  in a row" makes the fewest 5. In the `modeller` lab, `model.add(last <= 2)` is INFEASIBLE.
- **Sudoku** (`sudoku`): 4 × 4 needs no guess with propagation (plain backtracking: 12). 9 × 9 hard: propagation
  alone stops at 51 digits, 4 guesses finish it, plain backtracking needs 13,528. "17 givens": plain backtracking
  gives up after 100,000 guesses; propagation solves it without a guess.
- **Seating plan** (`anneal`): 12 pupils, 12 desks (12! is 479,001,600; 40! has 48 digits). Hill climbing stops
  anywhere from 37 to 47 and finds 37 about one run in four; simulated annealing about two in three. Starting
  temperature 0.5 behaves like hill climbing; 6 wanders a long time before it settles.
- **History:** linear programming and the simplex method, George Dantzig, 1947; the diet problem was one of its
  first uses. Dijkstra's shortest paths 1956; the Hungarian method 1955; dynamic programming, Richard Bellman,
  1950s; 2-opt 1958; simulated annealing 1983. OR-Tools is Google's free, open-source optimization toolkit; the
  simplex method is used inside many linear-programming solvers.

### Facts the university modules use

From the Darsi University draft (9 November 2026). Every data set is made up and small; the draft's currency unit is
written "coins" here. The draft has not been reviewed: check each number against its module before a lesson uses it.

| Course | The case | Numbers the lessons use |
|---|---|---|
| `opt-m1` | A society of 5 shares 600 coins a month for study rooms. Room B (8 seats, 20 coins a room-hour) is the only one where all meet; room A (4 seats) costs 12; quiet pods cost 3 a person-hour. Needs: 12 hours together, 30 person-hours of quiet study | Three 90-minute sessions cost 90, not 5,400. 58,621 plans; the cheapest costs 330 (8 tied plans); the bound is 20 × 12 + 3 × 30 = 330; a budget of 329 is infeasible. Buying the most study time spends all 600 |
| `opt-m2` | A department lends 7 laptops to 4 study groups, at most 4 each. Group 2 needs 3 before it gains anything | 5⁴ = 625 candidates, 270 within the limit. Greedy scores 32 study hours a week; the best is 40 (4 tied plans); the upper bound is 7 × 20/3, so at most 46. Twenty groups would take about three years at a million checks a second |
| `opt-m3` | A media lab lends 6 laptops, 3 cameras, 3 tripods, 4 microphones. Six groups ask for whole kits, each with a priority | 2⁶ = 64 plans. The best scores 13 (requests 2, 3 and 4), and is the only one. With 4 laptops the best is 9, and two plans reach it. Asked for three solutions, the solver prints three; there are nine |
| `opt-m4` | A training office chooses among workshops 1 to 8 within 20 hours and 800 coins. Workshops 2 and 7 need workshop 1; 3 and 4 share a slot | 256 plans. The best scores 31 (workshops 1, 3, 5, 6, 7), using 19 hours and 780 coins. Forcing workshop 8 in gives 29. Greedy by value per hour ends at 28. The fractional bound is 65/2, so at most 32 |
| `opt-m5` | Five assistants (Huda, Karim, Lina, Omar, Sara), six lab sessions on two days, at most 2 sessions each, no overlap | 5⁶ = 15,625 raw rotas; 144 with availability as domains; 63 valid. All-different over all six allows none; "never twice a day" removes 28 valid rotas. Add a seventh session and let Lina drop session 5: three sessions clash and only two people can take them |
| `opt-m6` | A teaching lab's day: a safety briefing, set-up, three practicals and clean-up; 2 rooms, 1 technician; a 10-hour day | The longest chain is 1 + 2 + 3 + 1 = 7. The technician's bound is 6, the rooms' is 5. The shortest day is 9: none of 112,896 combinations ends by 8. With one room, nothing fits in 10 hours; in 12 hours the best is 12 |
| `opt-m7` | A department places five tutorials in three days under nine requests from different people | 3⁵ = 243 timetables, none meets all nine. Four minimal repairs: move a lab, decline a student request, or relax one of two pairs of rules. The repaired model has two timetables. Without the day-specific requests there are 36 timetables in 6 truly different classes. The second formulation has 15 yes-or-no variables |
| `opt-m8` | A study-support centre shares 10 tutoring sessions a week among four groups (40, 25, 60 and 15 students) | The plan that helps most helps 89 a week and gives the evening group of 60 nothing. One more session adds 7. The evening estimate (6, could be 4 to 9): no change up to 6, a tie at 7, a new plan from 8. The front runs from (89 helped, share 0) to (79, 1/2): the price of fairness is 10. A weighted sum never reaches the three middle plans. A stopped search that found 79 is at most 10 below the best |

### Code on the phone

- Python with Darsi's small OR-Tools (`docs/CONTENT.md`, "Code"): `from ortools.sat.python import cp_model` (CP-SAT:
  `new_int_var`, `new_bool_var`, `add`, `add_all_different`, `add_exactly_one`, `minimize`, `maximize`, `CpSolver`,
  `solve`, `status_name`, `value`, `objective_value`) and `from ortools.linear_solver import pywraplp`
  (`CreateSolver("GLOP")` for linear programs, `"SCIP"` for whole numbers; `NumVar`, `IntVar`, `Add`, `Minimize`,
  `Maximize`, `Solve`, `solution_value()`, `Objective().Value()`). Use the snake_case names for CP-SAT, as Google's
  current guides do. Every lesson with code says once that the same program runs unchanged on the real OR-Tools on
  a computer or in Colab (`pip install ortools`).
- **What the phone does not have:** MiniZinc; Python's `fractions` module (it is not in the vendored runtime); a
  `cumulative` rule in the small CP-SAT; a search limit the learner can set (the small CP-SAT stops at a fixed
  200,000 nodes). A program stops after three seconds. So the university courses use whole numbers in the smallest
  unit, hour-by-hour sums for shared resources, and a loop with a candidate limit to show a stopped search. Tests
  are `assert` lines; `unittest` and `itertools` appear in the vendored runtime but have not been run there (the
  Programming plan lists that trial).
- **Expression on the left** of every comparison with a solver variable (`x + y <= 8`, never `8 >= x + y`):
  MicroPython has no reflected comparisons.
- `dual_value()` on a GLOP constraint gives its shadow price, on the phone as on the real OR-Tools; the lessons also
  find it by solving again with the limit one larger.
- **Tests check the objective and feasibility, not one particular solution** when there are ties: `check` with
  `assert solver.objective_value == 290` or a recomputed total, plus asserts that every limit holds. Print whole
  numbers with `int(...)` and decimals with `round(…, 2)`, so the output is the same on the real OR-Tools.
- Programs of 12 lines or fewer in a `code` step, lines of 40 characters or fewer where possible. Some lines in
  levels 3 and 4 are 45 to 63 characters and scroll sideways in the phone editor: shorten them in the pass.
- Videos show code with the `code` scene body (`"who": null`, at most 6 lines of at most 36 characters).
- **Videos use the optimization pack** (Lesson Studio `docs/packs/opt.md`) where it shows the method itself: the
  `graph` body for Dijkstra on the village map, the bus route and exam slots; `schedule` for the timetable;
  `knapsack` for the truck; `lp` for the garden. The truck is given as its own items (the built-in one squeezes its
  rows in English). Text on screen stays at 32 px or more (`npm run layout-check`): lists rather than cards,
  two-column tables rather than compare columns and bar charts, no code captions.

### Words

One word for each idea, in every course: options (variables), limit (constraint), goal (objective), feasible,
optimal (the best), model, solver, quick rule (heuristic), greedy, linear programming, whole number (integer),
trade-off, fair, route, timetable and period, exam slot and clash, propagation and backtracking. The Arabic for the
unit files and the Egyptian Arabic for the videos were listed in the earlier plan
(`git show ae9ac16e:docs/curriculum/opt.md`, section "Words") and are not yet in `docs/curriculum/ar-lingo.md`,
which has only "solver" and "greedy": move the list there before the next Arabic pass. Two rules from it hold in
every course. Maths with letters is written left to right with Western digits, like code (`x + y ≤ 8`), while plain
numbers in Arabic sentences use Arabic-Indic digits. Python, its keywords, names and printed output stay in English,
left to right, in every language.

### Shared ideas

This track is the home of four ideas other tracks meet: a shortest way on a map (`opt-1-1-2`, `opt-s3-2`), which
`agents-u1-2` builds on when it plans with A*; a quick rule against a sure method (`opt-1-1-3`, `opt-m2-3`); fair
shares as the total against the worst-off (`opt-1-1-4`, `opt-m8-2`); and the honest status of an answer (`opt-m1-3`,
`opt-m3-3`). It borrows two. Python comes from Programming, by rung. Personal data comes from `cyber-3-1-1`: where a
lesson handles colleagues' scores or preferences (`opt-3-1-4`, `opt-4-1-2`), it gives one reminder sentence and
names that home.

### Labs across the track

Teachers meet `knapsack`, `shortest`, `routes` and `assign` at level 1, then `diet`, `lp`, `knapsack` and `modeller`
(level 2), `timetable`, `colouring`, `routes` and `assign` (level 3), and `lp`, `assign`, `diet` and `anneal` (level
4). Students meet `knapsack`, `shortest`, `sudoku` and `colouring` (primary), `diet`, `lp`, `knapsack` and
`modeller` (lower secondary), and `knapsack`, `shortest`, `routes` and `timetable` (upper secondary). The module
courses use the same eleven labs as the place to try each idea on the app's own case; `opt-s4` uses `diet`,
`modeller`, `sudoku` and `anneal`.

A lab met again comes with a different task:

- `knapsack`: tap loads on and compare (primary, `opt-1-1-1`); beat the quick rule (`opt-s2-3`); the truck as a
  yes-or-no model (`opt-2-1-3`); count the loads and follow the table (`opt-s3-1`, `opt-m4-2`); move the truck's
  limit to find where greedy is right (`opt-m2-4`, `opt-m8-4`).
- `routes`: run, watch and compare with the best (`opt-1-1-3`, `opt-m2-3`); press "New map" to find where the swaps
  stop short (`opt-3-1-3`, `opt-s3-3`).
- `assign`: choose in turn against the best total (`opt-1-1-4`, `opt-m5-1`); correct a score and compare with your
  model (`opt-3-1-4`); build a table where the best total leaves someone on 2 (`opt-4-1-2`, `opt-m8-2`).
- `lp`: draw and find the corner (`opt-2-1-2`, `opt-s2-2`); change the price and watch the best plan move
  (`opt-m1-2`); name the limits that bind and one that would be redundant (`opt-m2-1`); what one more hour is worth
  (`opt-4-1-1`, `opt-m8-1`).
- `modeller`: its three examples (truck load, timetable, exam slots) give the module courses a model to read, change
  and run: new data against a new rule (`opt-m3-2`), a rule between two choices (`opt-m4-1`), an item forced in
  (`opt-m4-3`), a status to read (`opt-m3-4`, `opt-m7-2`).
- `timetable`: watch the rules cross out (`opt-3-1-1`, `opt-m5-2`, `opt-m6-1`); tick the extra rules one at a time
  to find which makes it impossible, and which could bend (`opt-m6-3`, `opt-m7-1`, `opt-m7-4`).

### Placement

`content/placement/opt.json`: three questions per audience and level, from naming a limit and adding up road lengths
(level 1) to writing an inequality, reading INFEASIBLE, the Pareto front, shadow prices, relaxation bounds and the
optimality gap (levels 2 to 4). Since 2026-11-04 the third teachers' question at level 3 reads a nearest-neighbour
loop, so that passing level 3 also needs Python. When the module courses exist, the students' university questions
change: today all three test `opt-s4`, the last course on the path. They should come from the start, the middle and
the end of the modules, so that passing them means something about the whole path. How placement treats a level
with ten courses is a question for all six tracks with a university path.

### Arabic words

Kept from the earlier plan. `docs/curriculum/ar-lingo.md` is the shared glossary and wins where the two differ.

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
