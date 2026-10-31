# Darsi's small constraint solver, shaped like Google OR-Tools' CP-SAT (ortools.sat.python.cp_model), so a program
# written here also runs on the real OR-Tools, on a computer or in Colab. It handles school-sized problems: integer
# variables with small ranges, linear constraints (==, !=, <=, >=, <, >), all-different, "at least one" (bool_or),
# implications and a linear objective. It searches with propagation and branch and bound; real OR-Tools is far faster
# on big problems. In Darsi's MicroPython, write comparisons with the expression on the left: x + y <= 10, not 10 >= x + y.

UNKNOWN = 0
MODEL_INVALID = 1
FEASIBLE = 2
INFEASIBLE = 3
OPTIMAL = 4
_STATUS = {UNKNOWN: "UNKNOWN", MODEL_INVALID: "MODEL_INVALID", FEASIBLE: "FEASIBLE", INFEASIBLE: "INFEASIBLE", OPTIMAL: "OPTIMAL"}
_MAX_DOMAIN = 100000
_NODE_LIMIT = 200000


def _terms(x):
    if isinstance(x, LinearExpr):
        return x._t, x._c
    if isinstance(x, (int, float)):
        return {}, x
    raise TypeError("not a linear expression: " + repr(x))


class LinearExpr:
    def __init__(self, t=None, c=0):
        self._t = t if t is not None else {}
        self._c = c

    def _plus(self, other, sign):
        t2, c2 = _terms(other)
        t = dict(self._t)
        for k, v in t2.items():
            t[k] = t.get(k, 0) + sign * v
        return LinearExpr(t, self._c + sign * c2)

    def __add__(self, o):
        return self._plus(o, 1)

    def __radd__(self, o):
        return self._plus(o, 1)

    def __sub__(self, o):
        return self._plus(o, -1)

    def __rsub__(self, o):
        return (-self)._plus(o, 1)

    def __neg__(self):
        return LinearExpr({k: -v for k, v in self._t.items()}, -self._c)

    def __mul__(self, k):
        if not isinstance(k, (int, float)):
            raise TypeError("a linear expression can only be multiplied by a number")
        return LinearExpr({i: v * k for i, v in self._t.items()}, self._c * k)

    def __rmul__(self, k):
        return self.__mul__(k)

    def __eq__(self, o):
        return BoundedLinearExpression(self - o, 0, 0)

    def __ne__(self, o):
        return BoundedLinearExpression(self - o, None, None, True)

    def __le__(self, o):
        return BoundedLinearExpression(self - o, None, 0)

    def __ge__(self, o):
        return BoundedLinearExpression(self - o, 0, None)

    def __lt__(self, o):
        return BoundedLinearExpression(self - o, None, -1)

    def __gt__(self, o):
        return BoundedLinearExpression(self - o, 1, None)

    def __hash__(self):
        return id(self)

    @staticmethod
    def sum(exprs):
        out = LinearExpr()
        for e in exprs:
            out = out + e
        return out

    @staticmethod
    def weighted_sum(exprs, coefs):
        out = LinearExpr()
        for e, k in zip(exprs, coefs):
            out = out + e * k
        return out

    Sum = sum
    WeightedSum = weighted_sum


class IntVar(LinearExpr):
    def __init__(self, index, lb, ub, name):
        LinearExpr.__init__(self, {index: 1}, 0)
        self.index = index
        self.lb = lb
        self.ub = ub
        self.name = name or ("x" + str(index))

    def __str__(self):
        return self.name

    def __repr__(self):
        return self.name + "(" + str(self.lb) + ".." + str(self.ub) + ")"

    def Not(self):
        return 1 - self

    def Index(self):
        return self.index

    Name = lambda self: self.name
    negated = Not


class BoundedLinearExpression:
    def __init__(self, expr, lo, hi, ne=False):
        self.expr = expr
        self.lo = lo
        self.hi = hi
        self.ne = ne

    def __bool__(self):
        raise TypeError("compare variables inside model.add(...), not in an if")


class Constraint:
    def only_enforce_if(self, *literals):
        raise NotImplementedError("only_enforce_if is not in Darsi's small solver; use a linear constraint instead")

    def with_name(self, name):
        return self

    OnlyEnforceIf = only_enforce_if
    WithName = with_name


class CpModel:
    def __init__(self):
        self._vars = []
        self._lin = []  # (terms, lo, hi): lo <= sum(coef * x) <= hi (None: no bound)
        self._ne = []  # (terms, value): sum(coef * x) != value
        self._alldiff = []
        self._obj = None  # terms and constant, always minimised
        self._sense = 1

    def new_int_var(self, lb, ub, name=""):
        if ub < lb or ub - lb > _MAX_DOMAIN:
            raise ValueError("a variable's range must be from lb to ub, at most " + str(_MAX_DOMAIN) + " values")
        v = IntVar(len(self._vars), int(lb), int(ub), name)
        self._vars.append(v)
        return v

    def new_bool_var(self, name=""):
        return self.new_int_var(0, 1, name)

    def new_constant(self, value):
        return self.new_int_var(value, value, str(value))

    def add(self, ct):
        if isinstance(ct, bool):
            if not ct:
                self._lin.append(({}, 1, 1))
            return Constraint()
        if not isinstance(ct, BoundedLinearExpression):
            raise TypeError("model.add needs a comparison, such as x + y <= 10")
        t = {k: v for k, v in ct.expr._t.items() if v}
        c = ct.expr._c
        if ct.ne:
            self._ne.append((t, -c))
        else:
            self._lin.append((t, None if ct.lo is None else ct.lo - c, None if ct.hi is None else ct.hi - c))
        return Constraint()

    def add_linear_constraint(self, expr, lb, ub):
        t, c = _terms(expr)
        self._lin.append(({k: v for k, v in t.items() if v}, lb - c, ub - c))
        return Constraint()

    def add_all_different(self, *args):
        vs = list(args[0]) if len(args) == 1 and not isinstance(args[0], LinearExpr) else list(args)
        idx = []
        for v in vs:
            if isinstance(v, IntVar):
                idx.append(v.index)
                continue
            # An expression such as queens[i] + i: a helper variable equal to it, over the values it can take.
            t, c = _terms(v)
            lo = c
            hi = c
            for k, a in t.items():
                var = self._vars[k]
                lo += min(a * var.lb, a * var.ub)
                hi += max(a * var.lb, a * var.ub)
            aux = self.new_int_var(lo, hi, "")
            self.add(aux == v)
            idx.append(aux.index)
        self._alldiff.append(idx)
        return Constraint()

    def add_bool_or(self, *args):
        lits = list(args[0]) if len(args) == 1 and isinstance(args[0], (list, tuple)) else list(args)
        return self.add(LinearExpr.sum(lits) >= 1)

    def add_bool_and(self, *args):
        lits = list(args[0]) if len(args) == 1 and isinstance(args[0], (list, tuple)) else list(args)
        return self.add(LinearExpr.sum(lits) == len(lits))

    def add_exactly_one(self, *args):
        lits = list(args[0]) if len(args) == 1 and isinstance(args[0], (list, tuple)) else list(args)
        return self.add(LinearExpr.sum(lits) == 1)

    def add_at_most_one(self, *args):
        lits = list(args[0]) if len(args) == 1 and isinstance(args[0], (list, tuple)) else list(args)
        return self.add(LinearExpr.sum(lits) <= 1)

    def add_implication(self, a, b):
        return self.add(a - b <= 0)

    def minimize(self, expr):
        t, c = _terms(expr)
        self._obj = ({k: v for k, v in t.items() if v}, c)
        self._sense = 1

    def maximize(self, expr):
        t, c = _terms(expr)
        self._obj = ({k: -v for k, v in t.items() if v}, -c)
        self._sense = -1

    NewIntVar = new_int_var
    NewBoolVar = new_bool_var
    NewConstant = new_constant
    Add = add
    AddLinearConstraint = add_linear_constraint
    AddAllDifferent = add_all_different
    AddBoolOr = add_bool_or
    AddBoolAnd = add_bool_and
    AddExactlyOne = add_exactly_one
    AddAtMostOne = add_at_most_one
    AddImplication = add_implication
    Minimize = minimize
    Maximize = maximize


class CpSolverSolutionCallback:
    def __init__(self):
        self._solver = None
        self._count = 0

    def on_solution_callback(self):
        self.OnSolutionCallback()

    def OnSolutionCallback(self):
        pass

    def value(self, e):
        return self._solver.value(e)

    def boolean_value(self, e):
        return bool(self.value(e))

    def solution_count(self):
        return self._count

    def objective_value(self):
        return self._solver.objective_value

    Value = value
    BooleanValue = boolean_value
    SolutionCount = solution_count
    ObjectiveValue = objective_value


class _Params:
    def __init__(self):
        self.max_time_in_seconds = 10.0
        self.enumerate_all_solutions = False
        self.num_workers = 1
        self.num_search_workers = 1
        self.log_search_progress = False


def _bounds(dom):
    return dom[0], dom[-1]


def _filter(dom, lo, hi):
    if dom[0] >= lo and dom[-1] <= hi:
        return dom
    return [v for v in dom if lo <= v <= hi]


class CpSolver:
    def __init__(self):
        self.parameters = _Params()
        self._values = None
        self._obj = 0
        self._status = UNKNOWN
        self._branches = 0

    @property
    def objective_value(self):
        return self._obj

    def ObjectiveValue(self):
        return self._obj

    def value(self, e):
        if self._values is None:
            raise RuntimeError("no solution: call solve first, and check its status")
        t, c = _terms(e)
        out = c
        for k, v in t.items():
            out += v * self._values[k]
        return out

    def boolean_value(self, e):
        return bool(self.value(e))

    def status_name(self, status=None):
        return _STATUS[self._status if status is None else status]

    def num_branches(self):
        return self._branches

    def wall_time(self):
        return 0.0

    def _propagate(self, model, doms, best):
        lin = model._lin
        if best is not None:
            lin = lin + [(model._obj[0], None, best - model._obj[1] - 1)]
        changed = True
        while changed:
            changed = False
            for t, lo, hi in lin:
                if not t:
                    if (lo is not None and 0 < lo) or (hi is not None and 0 > hi):
                        return None
                    continue
                mins = 0
                maxs = 0
                for k, a in t.items():
                    l, h = _bounds(doms[k])
                    if a > 0:
                        mins += a * l
                        maxs += a * h
                    else:
                        mins += a * h
                        maxs += a * l
                if (lo is not None and maxs < lo) or (hi is not None and mins > hi):
                    return None
                for k, a in t.items():
                    l, h = _bounds(doms[k])
                    lo_k = l
                    hi_k = h
                    if a > 0:
                        rest_min = mins - a * l
                        rest_max = maxs - a * h
                        if hi is not None:
                            hi_k = min(hi_k, (hi - rest_min) // a)
                        if lo is not None:
                            lo_k = max(lo_k, -((rest_max - lo) // a))
                    else:
                        rest_min = mins - a * h
                        rest_max = maxs - a * l
                        if hi is not None:
                            lo_k = max(lo_k, -((hi - rest_min) // -a))
                        if lo is not None:
                            hi_k = min(hi_k, (rest_max - lo) // -a)
                    if lo_k > l or hi_k < h:
                        d = _filter(doms[k], lo_k, hi_k)
                        if not d:
                            return None
                        if len(d) != len(doms[k]):
                            doms[k] = d
                            changed = True
                            ml, mh = _bounds(d)
                            mins = 0
                            maxs = 0
                            for j, b in t.items():
                                jl, jh = _bounds(doms[j])
                                if b > 0:
                                    mins += b * jl
                                    maxs += b * jh
                                else:
                                    mins += b * jh
                                    maxs += b * jl
            for t, value in model._ne:
                free = [k for k in t if len(doms[k]) > 1]
                fixed = 0
                for k, a in t.items():
                    if len(doms[k]) == 1:
                        fixed += a * doms[k][0]
                if not free:
                    if fixed == value:
                        return None
                elif len(free) == 1:
                    k = free[0]
                    rest = value - fixed
                    if rest % t[k] == 0:
                        bad = rest // t[k]
                        if bad in doms[k]:
                            doms[k] = [v for v in doms[k] if v != bad]
                            if not doms[k]:
                                return None
                            changed = True
            for group in model._alldiff:
                seen = {}
                for k in group:
                    if len(doms[k]) == 1:
                        v = doms[k][0]
                        if v in seen:
                            return None
                        seen[v] = k
                if seen:
                    for k in group:
                        if len(doms[k]) > 1:
                            d = [v for v in doms[k] if v not in seen]
                            if len(d) != len(doms[k]):
                                if not d:
                                    return None
                                doms[k] = d
                                changed = True
                union = set()
                for k in group:
                    for v in doms[k]:
                        union.add(v)
                if len(union) < len(group):
                    return None
        return doms

    def solve(self, model, callback=None):
        self._values = None
        self._status = UNKNOWN
        self._branches = 0
        n = len(model._vars)
        start = [list(range(v.lb, v.ub + 1)) for v in model._vars]
        obj = model._obj
        best = None
        found = 0
        stack = [start]
        limit = _NODE_LIMIT
        while stack:
            doms = self._propagate(model, list(stack.pop()), best)
            self._branches += 1
            if doms is None:
                continue
            if self._branches > limit:
                break
            pick = -1
            size = 0
            for k in range(n):
                s = len(doms[k])
                if s > 1 and (pick < 0 or s < size):
                    pick = k
                    size = s
            if pick < 0:
                self._values = [d[0] for d in doms]
                found += 1
                if obj is not None:
                    best = obj[1]
                    for k, a in obj[0].items():
                        best += a * self._values[k]
                    self._obj = best * model._sense
                if callback is not None:
                    callback._solver = self
                    callback._count = found
                    callback.on_solution_callback()
                if obj is None and not self.parameters.enumerate_all_solutions:
                    break
                continue
            vals = doms[pick]
            if obj is not None and obj[0].get(pick, 0) > 0:
                order = vals
            elif obj is not None and obj[0].get(pick, 0) < 0:
                order = vals[::-1]
            else:
                order = vals
            for v in order[::-1]:
                child = list(doms)
                child[pick] = [v]
                stack.append(child)
        if found == 0:
            self._status = UNKNOWN if self._branches > limit else INFEASIBLE
        elif self._branches > limit and obj is not None:
            self._status = FEASIBLE
        else:
            self._status = OPTIMAL
        return self._status

    def solve_with_solution_callback(self, model, callback):
        return self.solve(model, callback)

    def search_for_all_solutions(self, model, callback):
        self.parameters.enumerate_all_solutions = True
        return self.solve(model, callback)

    Solve = solve
    SolveWithSolutionCallback = solve_with_solution_callback
    SearchForAllSolutions = search_for_all_solutions
    Value = value
    BooleanValue = boolean_value
    StatusName = status_name
    NumBranches = num_branches
    WallTime = wall_time
