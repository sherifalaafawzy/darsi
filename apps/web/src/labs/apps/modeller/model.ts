/**
 * Write a model, let the solver search. Three small CP-SAT programs in Python, written for Google's OR-Tools
 * (`from ortools.sat.python import cp_model`); on the phone they run on Darsi's small copy of it in the code sandbox
 * (src/code/pylib/cp_model.py), so the same program runs unchanged on the real thing. The other optimisation labs
 * show how solvers work inside; here the learner only says what is wanted.
 */
export const EXAMPLES = {
  timetable: `from ortools.sat.python import cp_model

# A small timetable: 3 classes, 4 periods (1 to 4).
classes = ["5A", "5B", "6A"]
teacher = {"maths": "Musa", "science": "Huda", "english": "Ali", "art": "Rana"}

model = cp_model.CpModel()
period = {}
for c in classes:
    for s in teacher:
        period[c, s] = model.new_int_var(1, 4, c + " " + s)

# A class has one lesson at a time.
for c in classes:
    model.add_all_different([period[c, s] for s in teacher])
# A teacher is in one class at a time.
for s in teacher:
    model.add_all_different([period[c, s] for c in classes])

# Ms Huda leaves after period 3.
for c in classes:
    model.add(period[c, "science"] <= 3)
# 6A's maths test is in period 1.
model.add(period["6A", "maths"] == 1)

solver = cp_model.CpSolver()
status = solver.solve(model)
print(solver.status_name(status))
if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
    for c in classes:
        order = sorted(teacher, key=lambda s: solver.value(period[c, s]))
        print(c, ":", ", ".join(order))
`,
  exams: `from ortools.sat.python import cp_model

exams = ["maths", "english", "science", "arabic",
         "history", "geography", "art", "french"]
# The exams each pupil takes can't share a slot.
pupils = [
    ["english", "science"],
    ["history", "geography", "art"],
    ["maths", "arabic", "french"],
    ["arabic", "art"],
    ["science", "french"],
    ["science", "arabic", "french"],
]

model = cp_model.CpModel()
slot = {}
for e in exams:
    slot[e] = model.new_int_var(1, 8, e)
for taken in pupils:
    model.add_all_different([slot[e] for e in taken])

# Slots used = the last slot. Make it as small as possible.
last = model.new_int_var(1, 8, "last")
for e in exams:
    model.add(slot[e] <= last)
model.minimize(last)

solver = cp_model.CpSolver()
status = solver.solve(model)
print(solver.status_name(status))
if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
    print("slots used:", solver.value(last))
    for e in exams:
        print(e, "in slot", solver.value(slot[e]))
`,
  truck: `from ortools.sat.python import cp_model

# Loads for the village school: name, weight in kg, points.
loads = [("solar panels", 600, 42), ("desks", 500, 33),
         ("books", 500, 32), ("water filter", 300, 15),
         ("footballs", 200, 8), ("chalk and paper", 100, 3)]
capacity = 1000

model = cp_model.CpModel()
take = [model.new_bool_var(name) for name, kg, points in loads]
model.add(sum(take[i] * loads[i][1] for i in range(len(loads))) <= capacity)
model.maximize(sum(take[i] * loads[i][2] for i in range(len(loads))))

solver = cp_model.CpSolver()
status = solver.solve(model)
print(solver.status_name(status))
if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
    print("points:", int(solver.objective_value))
    for i in range(len(loads)):
        if solver.value(take[i]):
            print("take the", loads[i][0], "-", loads[i][1], "kg")
`,
} as const;
export type ExampleId = keyof typeof EXAMPLES;
export const EXAMPLE_IDS = Object.keys(EXAMPLES) as ExampleId[];
