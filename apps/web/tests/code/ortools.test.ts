// @vitest-environment node
// Darsi's small OR-Tools (src/code/pylib), in the MicroPython learners' phones run, on examples from Google's OR-Tools
// guides with their known answers: the same programs give the same results on the real OR-Tools.
import { runInNode } from "./node";

const run = async (code: string) => {
  const [r] = await runInNode({ lang: "python", code });
  if (r.error) throw new Error(r.error);
  return r.out.trim();
};

describe("cp_model (CP-SAT)", () => {
  it("solves the guide's first model: three variables, x != y", async () => {
    expect(await run(`from ortools.sat.python import cp_model
model = cp_model.CpModel()
x = model.new_int_var(0, 2, "x")
y = model.new_int_var(0, 2, "y")
z = model.new_int_var(0, 2, "z")
model.add(x != y)
solver = cp_model.CpSolver()
status = solver.solve(model)
print(solver.status_name(status), solver.value(x) != solver.value(y))`)).toBe("OPTIMAL True");
  });

  it("maximises (the guide's optimisation example: 35 at x=7, y=3, z=5), in the older CamelCase style too", async () => {
    expect(await run(`from ortools.sat.python import cp_model
model = cp_model.CpModel()
x = model.NewIntVar(0, 50, "x")
y = model.NewIntVar(0, 50, "y")
z = model.NewIntVar(0, 50, "z")
model.Add(2 * x + 7 * y + 3 * z <= 50)
model.Add(3 * x - 5 * y + 7 * z <= 45)
model.Add(5 * x + 2 * y - 6 * z <= 37)
model.Maximize(2 * x + 2 * y + 3 * z)
solver = cp_model.CpSolver()
status = solver.Solve(model)
print(status == cp_model.OPTIMAL, solver.ObjectiveValue(), solver.Value(x), solver.Value(y), solver.Value(z))`)).toBe("True 35 7 3 5");
  });

  it("solves SEND + MORE = MONEY with all-different", async () => {
    expect(await run(`from ortools.sat.python import cp_model
m = cp_model.CpModel()
s, e, n, d, o, r, y = [m.new_int_var(0, 9, c) for c in "SENDORY"]
mm = m.new_int_var(1, 1, "M")
m.add(s >= 1)
m.add_all_different([s, e, n, d, mm, o, r, y])
m.add(1000 * s + 100 * e + 10 * n + d + 1000 * mm + 100 * o + 10 * r + e == 10000 * mm + 1000 * o + 100 * n + 10 * e + y)
solver = cp_model.CpSolver()
solver.solve(m)
print("".join(str(solver.value(v)) for v in [s, e, n, d]), "+", "".join(str(solver.value(v)) for v in [mm, o, r, e]))`)).toBe("9567 + 1085");
  });

  it("finds all 92 solutions of eight queens, with all-different over expressions", async () => {
    expect(await run(`from ortools.sat.python import cp_model
n = 8
model = cp_model.CpModel()
q = [model.new_int_var(0, n - 1, "q" + str(i)) for i in range(n)]
model.add_all_different(q)
model.add_all_different([q[i] + i for i in range(n)])
model.add_all_different([q[i] - i for i in range(n)])
class Counter(cp_model.CpSolverSolutionCallback):
    def __init__(self):
        cp_model.CpSolverSolutionCallback.__init__(self)
        self.count = 0
    def on_solution_callback(self):
        self.count += 1
solver = cp_model.CpSolver()
solver.parameters.enumerate_all_solutions = True
c = Counter()
solver.solve(model, c)
print(c.count)`)).toBe("92");
  });

  it("says when there is no solution", async () => {
    expect(await run(`from ortools.sat.python import cp_model
m = cp_model.CpModel()
x = m.new_int_var(0, 5, "x")
m.add(x >= 3)
m.add(x <= 2)
solver = cp_model.CpSolver()
print(solver.status_name(solver.solve(m)))`)).toBe("INFEASIBLE");
  });

  it("takes objectives with zero coefficients (an item worth nothing)", async () => {
    expect(await run(`from ortools.sat.python import cp_model
m = cp_model.CpModel()
values = [0, 4, 3]
weights = [2, 3, 2]
x = [m.new_bool_var("x" + str(i)) for i in range(3)]
m.add(sum(weights[i] * x[i] for i in range(3)) <= 5)
m.maximize(sum(values[i] * x[i] for i in range(3)))
solver = cp_model.CpSolver()
print(solver.status_name(solver.solve(m)), solver.objective_value, [solver.value(v) for v in x[1:]])`)).toBe("OPTIMAL 7 [1, 1]");
  });
});

describe("pywraplp (linear and integer programming)", () => {
  it("solves the guide's first LP (4 at x=1, y=1)", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
solver = pywraplp.Solver.CreateSolver("GLOP")
x = solver.NumVar(0, 1, "x")
y = solver.NumVar(0, 2, "y")
solver.Add(x + y <= 2)
solver.Maximize(3 * x + y)
status = solver.Solve()
print(status == pywraplp.Solver.OPTIMAL, round(solver.Objective().Value(), 6), round(x.solution_value(), 6), round(y.solution_value(), 6))`)).toBe("True 4.0 1.0 1.0");
  });

  it("solves the LP example (34 at x=6, y=4) and a minimisation that needs phase one (9)", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
s = pywraplp.Solver.CreateSolver("GLOP")
inf = s.infinity()
x = s.NumVar(0, inf, "x")
y = s.NumVar(0, inf, "y")
s.Add(x + 2 * y <= 14)
s.Add(3 * x - y >= 0)
s.Add(x - y <= 2)
s.Maximize(3 * x + 4 * y)
s.Solve()
print(round(s.Objective().Value(), 6), round(x.solution_value(), 6), round(y.solution_value(), 6))
d = pywraplp.Solver.CreateSolver("GLOP")
a = d.NumVar(0, inf, "a")
b = d.NumVar(0, inf, "b")
d.Add(a + b >= 4)
d.Add(a + 3 * b >= 6)
d.Minimize(2 * a + 3 * b)
print(d.Solve() == pywraplp.Solver.OPTIMAL, round(d.Objective().Value(), 6))`)).toBe("34.0 6.0 4.0\nTrue 9.0");
  });

  it("gives each constraint's dual value (its shadow price), and none for whole-number models", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
s = pywraplp.Solver.CreateSolver("GLOP")
inf = s.infinity()
x = s.NumVar(0, inf, "x")
y = s.NumVar(0, inf, "y")
c = [s.Add(x + 2 * y <= 14), s.Add(3 * x - y >= 0), s.Add(x - y <= 2)]
s.Maximize(3 * x + 4 * y)
s.Solve()
print([round(k.dual_value(), 6) for k in c])
d = pywraplp.Solver.CreateSolver("GLOP")
a = d.NumVar(0, inf, "a")
b = d.NumVar(0, inf, "b")
e = [d.Add(a + b >= 4), d.Add(a + 3 * b >= 6)]
d.Minimize(2 * a + 3 * b)
d.Solve()
print([round(k.DualValue(), 6) for k in e])
m = pywraplp.Solver.CreateSolver("SCIP")
z = m.IntVar(0, 10, "z")
k = m.Add(2 * z <= 7)
m.Maximize(z)
m.Solve()
print(k.dual_value())`)).toBe("[2.333333, 0.0, 0.666667]\n[1.5, 0.5]\n0.0");
  });

  it("solves the guide's MIP example (23 at x=3, y=2), with equalities, and the constraint-by-coefficient style", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
s = pywraplp.Solver.CreateSolver("SCIP")
inf = s.infinity()
x = s.IntVar(0, inf, "x")
y = s.IntVar(0, inf, "y")
s.Add(x + 7 * y <= 17.5)
s.Add(x <= 3.5)
s.Maximize(x + 10 * y)
print(s.Solve() == pywraplp.Solver.OPTIMAL, s.Objective().Value(), x.solution_value(), y.solution_value())
e = pywraplp.Solver.CreateSolver("GLOP")
p = e.NumVar(-inf, inf, "p")
q = e.NumVar(-inf, inf, "q")
c = e.Constraint(10, 10)
c.SetCoefficient(p, 1)
c.SetCoefficient(q, 1)
e.Add(p - q == 2)
o = e.Objective()
o.SetCoefficient(p, 1)
o.SetMinimization()
e.Solve()
print(round(p.solution_value(), 6), round(q.solution_value(), 6))`)).toBe("True 23.0 3.0 2.0\n6.0 4.0");
  });

  it("says when a problem has no solution, or no best one", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
s = pywraplp.Solver.CreateSolver("GLOP")
x = s.NumVar(0, 10, "x")
s.Add(x >= 5)
s.Add(x <= 3)
s.Maximize(x)
print(s.Solve() == pywraplp.Solver.INFEASIBLE)
u = pywraplp.Solver.CreateSolver("GLOP")
y = u.NumVar(0, u.infinity(), "y")
u.Maximize(y)
print(u.Solve() == pywraplp.Solver.UNBOUNDED, pywraplp.Solver.CreateSolver("NOPE"))`)).toBe("True\nTrue None");
  });

  it("assigns workers to tasks (the guide's MIP assignment: total cost 265)", async () => {
    expect(await run(`from ortools.linear_solver import pywraplp
costs = [[90, 80, 75, 70], [35, 85, 55, 65], [125, 95, 90, 95], [45, 110, 95, 115], [50, 100, 90, 100]]
s = pywraplp.Solver.CreateSolver("SCIP")
x = {}
for i in range(5):
    for j in range(4):
        x[i, j] = s.IntVar(0, 1, "")
for i in range(5):
    s.Add(s.Sum([x[i, j] for j in range(4)]) <= 1)
for j in range(4):
    s.Add(s.Sum([x[i, j] for i in range(5)]) == 1)
s.Minimize(s.Sum([costs[i][j] * x[i, j] for i in range(5) for j in range(4)]))
print(s.Solve() == pywraplp.Solver.OPTIMAL, s.Objective().Value())`)).toBe("True 265.0");
  });
});
