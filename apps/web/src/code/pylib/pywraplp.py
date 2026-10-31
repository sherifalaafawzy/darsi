# Darsi's small linear and integer programming solver, shaped like Google OR-Tools' pywraplp
# (ortools.linear_solver), so a program written here also runs on the real OR-Tools. "GLOP" solves linear programs
# with the simplex method; "SCIP", "CBC" and "SAT" add whole-number variables, solved by branch and bound. Sized for
# school problems (tens of variables and constraints). In Darsi's MicroPython, write comparisons with the expression on
# the left: x + y <= 10, not 10 >= x + y.

_INF = float("inf")
_EPS = 1e-9
_NODE_LIMIT = 5000


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

    def __truediv__(self, k):
        return self.__mul__(1 / k)

    def __eq__(self, o):
        return LinearConstraint(self - o, 0, 0)

    def __le__(self, o):
        return LinearConstraint(self - o, -_INF, 0)

    def __ge__(self, o):
        return LinearConstraint(self - o, 0, _INF)

    def __hash__(self):
        return id(self)

    def solution_value(self):
        out = self._c
        for k, v in self._t.items():
            out += v * _VALUES[k]
        return out

    SolutionValue = solution_value


_VALUES = {}  # variable id -> value of the last solve


class Variable(LinearExpr):
    def __init__(self, solver, lb, ub, integer, name):
        self._id = id(self)
        LinearExpr.__init__(self, {self._id: 1}, 0)
        self._solver = solver
        self._lb = lb
        self._ub = ub
        self._integer = integer
        self._name = name

    def name(self):
        return self._name

    def lb(self):
        return self._lb

    def ub(self):
        return self._ub

    def integer(self):
        return self._integer

    def SetBounds(self, lb, ub):
        self._lb = lb
        self._ub = ub

    def SetLb(self, lb):
        self._lb = lb

    def SetUb(self, ub):
        self._ub = ub

    def solution_value(self):
        return _VALUES.get(self._id, 0.0)

    def __str__(self):
        return self._name

    def __repr__(self):
        return self._name

    SolutionValue = solution_value
    Name = name
    Lb = lb
    Ub = ub
    Integer = integer


class LinearConstraint:
    def __init__(self, expr, lo, hi):
        self.expr = expr
        self.lo = lo
        self.hi = hi

    def __bool__(self):
        raise TypeError("compare variables inside solver.Add(...), not in an if")


class Constraint:
    def __init__(self, lo, hi, name=""):
        self._t = {}
        self._lo = lo
        self._hi = hi
        self._name = name
        self._solver = None

    def SetCoefficient(self, var, coef):
        self._t[var._id] = coef

    def GetCoefficient(self, var):
        return self._t.get(var._id, 0)

    def SetBounds(self, lo, hi):
        self._lo = lo
        self._hi = hi

    def lb(self):
        return self._lo

    def ub(self):
        return self._hi

    def name(self):
        return self._name

    def dual_value(self):
        return self._solver._dual(self) if self._solver is not None else 0.0

    Lb = lb
    Ub = ub
    Name = name
    DualValue = dual_value


class Objective:
    def __init__(self):
        self._t = {}
        self._c = 0
        self._max = False
        self._value = 0.0

    def SetCoefficient(self, var, coef):
        self._t[var._id] = coef

    def GetCoefficient(self, var):
        return self._t.get(var._id, 0)

    def SetOffset(self, c):
        self._c = c

    def offset(self):
        return self._c

    def SetMinimization(self):
        self._max = False

    def SetMaximization(self):
        self._max = True

    def minimization(self):
        return not self._max

    def maximization(self):
        return self._max

    def Value(self):
        return self._value

    def BestBound(self):
        return self._value

    def Clear(self):
        self._t = {}
        self._c = 0

    Offset = offset


def _simplex(c, rows, rhs):
    # Minimise c·x subject to rows·x <= rhs, x >= 0, with a two-phase tableau and Bland's rule (no cycling).
    # Returns ("optimal", x), ("infeasible", None) or ("unbounded", None).
    m = len(rows)
    n = len(c)
    # Columns: n originals, m slacks, then one artificial per row whose rhs is negative (that row is flipped).
    art = [i for i in range(m) if rhs[i] < 0]
    width = n + m + len(art)
    T = []
    basis = []
    for i in range(m):
        sign = -1 if rhs[i] < 0 else 1
        row = [sign * a for a in rows[i]] + [0.0] * (m + len(art)) + [sign * rhs[i]]
        row[n + i] = float(sign)
        if sign < 0:
            j = n + m + art.index(i)
            row[j] = 1.0
            basis.append(j)
        else:
            basis.append(n + i)
        T.append(row)

    def pivot(r, col):
        p = T[r][col]
        T[r] = [v / p for v in T[r]]
        for i in range(len(T)):
            if i != r and abs(T[i][col]) > _EPS:
                f = T[i][col]
                Ti = T[i]
                Tr = T[r]
                T[i] = [Ti[j] - f * Tr[j] for j in range(len(Ti))]
        basis[r] = col

    def run(cost, allowed):
        # cost: one entry per column; minimises cost·x over the current tableau.
        for _ in range(5000):
            # Reduced costs: cost_j - sum(cost_basis_i * T_ij).
            enter = -1
            for j in range(allowed):
                rc = cost[j]
                for i in range(m):
                    rc -= cost[basis[i]] * T[i][j]
                if rc < -_EPS:
                    enter = j
                    break
            if enter < 0:
                return "optimal"
            leave = -1
            ratio = _INF
            for i in range(m):
                a = T[i][enter]
                if a > _EPS:
                    q = T[i][-1] / a
                    if q < ratio - _EPS or (abs(q - ratio) <= _EPS and basis[i] < basis[leave]):
                        ratio = q
                        leave = i
            if leave < 0:
                return "unbounded"
            pivot(leave, enter)
        return "limit"

    if art:
        phase1 = [0.0] * (n + m) + [1.0] * len(art)
        run(phase1, width)
        total = 0.0
        for i in range(m):
            if basis[i] >= n + m:
                total += T[i][-1]
        if total > 1e-7:
            return "infeasible", None
        # Drive any artificial still in the basis (at zero) out; a row where none can leave says nothing new (a
        # repeated equality), so it goes. Then drop the artificial columns.
        keep = []
        for i in range(m):
            if basis[i] >= n + m:
                for j in range(n + m):
                    if abs(T[i][j]) > _EPS:
                        pivot(i, j)
                        break
            if basis[i] < n + m:
                keep.append(i)
        rows_left = [T[i][: n + m] + [T[i][-1]] for i in keep]
        basis_left = [basis[i] for i in keep]
        while T:
            T.pop()
        while basis:
            basis.pop()
        T.extend(rows_left)
        basis.extend(basis_left)
        m = len(T)
    cost = list(c) + [0.0] * m
    state = run(cost, n + m)
    if state == "unbounded":
        return "unbounded", None
    x = [0.0] * n
    for i in range(m):
        if basis[i] < n:
            x[basis[i]] = T[i][-1]
    return "optimal", x


class Solver:
    OPTIMAL = 0
    FEASIBLE = 1
    INFEASIBLE = 2
    UNBOUNDED = 3
    ABNORMAL = 4
    MODEL_INVALID = 5
    NOT_SOLVED = 6
    GLOP_LINEAR_PROGRAMMING = "GLOP"
    SCIP_MIXED_INTEGER_PROGRAMMING = "SCIP"
    CBC_MIXED_INTEGER_PROGRAMMING = "CBC"

    def __init__(self, name="", kind="GLOP"):
        self._name = name
        self._mip = kind.upper() not in ("GLOP", "PDLP", "CLP")
        self._vars = []
        self._cons = []
        self._obj = Objective()
        self._nodes = 0
        self._iters = 0
        self._root = None  # the bounds of the last linear program solved to optimality, for dual values
        self._duals = {}

    @staticmethod
    def CreateSolver(solver_id):
        kind = str(solver_id).upper()
        if kind not in ("GLOP", "PDLP", "CLP", "SCIP", "CBC", "SAT", "CP_SAT", "BOP"):
            return None
        return Solver(kind, kind)

    def infinity(self):
        return _INF

    Infinity = infinity

    def NumVar(self, lb, ub, name=""):
        v = Variable(self, lb, ub, False, name or ("x" + str(len(self._vars))))
        self._vars.append(v)
        return v

    def IntVar(self, lb, ub, name=""):
        if not self._mip:
            raise ValueError("GLOP solves linear programs only: use pywraplp.Solver.CreateSolver('SCIP') for whole numbers")
        v = Variable(self, lb, ub, True, name or ("x" + str(len(self._vars))))
        self._vars.append(v)
        return v

    def BoolVar(self, name=""):
        return self.IntVar(0, 1, name)

    def Add(self, ct, name=""):
        if not isinstance(ct, LinearConstraint):
            raise TypeError("solver.Add needs a comparison, such as x + y <= 10")
        out = Constraint(ct.lo - ct.expr._c, ct.hi - ct.expr._c, name)
        out._t = {k: v for k, v in ct.expr._t.items() if v}
        out._solver = self
        self._cons.append(out)
        return out

    def Constraint(self, lo=-_INF, hi=_INF, name=""):
        out = Constraint(lo, hi, name)
        out._solver = self
        self._cons.append(out)
        return out

    def Objective(self):
        return self._obj

    def Minimize(self, expr):
        t, c = _terms(expr)
        self._obj._t = dict(t)
        self._obj._c = c
        self._obj._max = False

    def Maximize(self, expr):
        t, c = _terms(expr)
        self._obj._t = dict(t)
        self._obj._c = c
        self._obj._max = True

    def Sum(self, exprs):
        out = LinearExpr()
        for e in exprs:
            out = out + e
        return out

    def NumVariables(self):
        return len(self._vars)

    def NumConstraints(self):
        return len(self._cons)

    def variables(self):
        return list(self._vars)

    def constraints(self):
        return list(self._cons)

    def wall_time(self):
        return 0

    def iterations(self):
        return self._iters

    def nodes(self):
        return self._nodes

    def _lp(self, lbs, ubs):
        # The LP with these bounds: x = lb + y (y >= 0) where lb is finite, x = y+ - y- where it isn't.
        cols = []  # (var position, sign)
        shift = []
        for i in range(len(self._vars)):
            if lbs[i] > -_INF:
                cols.append((i, 1))
                shift.append(lbs[i])
            elif ubs[i] < _INF:
                cols.append((i, -1))  # x = ub - y
                shift.append(ubs[i])
            else:
                cols.append((i, 1))
                cols.append((i, -1))
                shift.append(0.0)
        pos = {}
        for j, (i, s) in enumerate(cols):
            pos.setdefault(i, []).append((j, s))
        base = [0.0] * len(self._vars)
        k = 0
        for i in range(len(self._vars)):
            if lbs[i] > -_INF:
                base[i] = lbs[i]
            elif ubs[i] < _INF:
                base[i] = ubs[i]
        index = {v._id: i for i, v in enumerate(self._vars)}
        rows = []
        rhs = []

        def add_row(terms, bound, sign):
            row = [0.0] * len(cols)
            b = bound
            for vid, a in terms.items():
                i = index[vid]
                b -= a * base[i]
                for j, s in pos[i]:
                    row[j] += sign * a * s
            rows.append(row)
            rhs.append(sign * b)

        for con in self._cons:
            if con._hi < _INF:
                add_row(con._t, con._hi, 1)
            if con._lo > -_INF:
                add_row(con._t, con._lo, -1)
        for i, v in enumerate(self._vars):
            if lbs[i] > -_INF and ubs[i] < _INF:
                add_row({v._id: 1}, ubs[i], 1)
        sense = -1 if self._obj._max else 1
        c = [0.0] * len(cols)
        for vid, a in self._obj._t.items():
            i = index[vid]
            for j, s in pos[i]:
                c[j] += sense * a * s
        state, y = _simplex(c, rows, rhs)
        if state != "optimal":
            return state, None, None
        x = list(base)
        for j, (i, s) in enumerate(cols):
            x[i] += s * y[j]
        value = self._obj._c
        for vid, a in self._obj._t.items():
            value += a * x[index[vid]]
        return "optimal", x, value

    def _dual(self, con):
        # The constraint's shadow price, as GLOP's dual value: how much the best objective changes per unit its binding
        # bound moves, found by solving again with that bound nudged. Zero when the bound isn't binding, and for
        # whole-number models (OR-Tools gives no duals there either).
        if self._root is None or con._solver is not self:
            return 0.0
        if id(con) in self._duals:
            return self._duals[id(con)]
        act = 0.0
        for k, a in con._t.items():
            act += a * _VALUES.get(k, 0.0)
        out = 0.0
        lo, hi = con._lo, con._hi
        on_hi = hi < _INF and abs(act - hi) <= 1e-7 * max(1.0, abs(hi))
        on_lo = lo > -_INF and abs(act - lo) <= 1e-7 * max(1.0, abs(lo))
        if on_hi or on_lo:
            b = hi if on_hi else lo
            h = 1e-4 * max(1.0, abs(b))
            for step in (h, -h):
                con._lo = lo + step if on_lo else lo
                con._hi = hi + step if on_hi else hi
                try:
                    state, x, value = self._lp(self._root[0], self._root[1])
                finally:
                    con._lo, con._hi = lo, hi
                if state == "optimal":
                    out = round((value - self._obj._value) / step, 9)
                    break
            if abs(out) < 1e-9:
                out = 0.0
        self._duals[id(con)] = out
        return out

    def Solve(self):
        global _VALUES
        self._nodes = 0
        self._root = None
        self._duals = {}
        lbs = [float(v._lb) for v in self._vars]
        ubs = [float(v._ub) for v in self._vars]
        for i in range(len(self._vars)):
            if self._vars[i]._integer:
                lbs[i] = float(_ceil(lbs[i] - 1e-9)) if lbs[i] > -_INF else lbs[i]
                ubs[i] = float(_floor(ubs[i] + 1e-9)) if ubs[i] < _INF else ubs[i]
        best = None
        best_x = None
        sense = -1 if self._obj._max else 1
        stack = [(lbs, ubs)]
        unbounded = False
        while stack:
            lb, ub = stack.pop()
            if any(lb[i] > ub[i] + 1e-9 for i in range(len(lb))):
                continue
            self._nodes += 1
            if self._nodes > _NODE_LIMIT:
                break
            state, x, value = self._lp(lb, ub)
            if state == "unbounded":
                unbounded = True
                break
            if state != "optimal":
                continue
            if best is not None and sense * value >= sense * best - 1e-9:
                continue
            frac = -1
            for i, v in enumerate(self._vars):
                if v._integer and abs(x[i] - round(x[i])) > 1e-6:
                    frac = i
                    break
            if frac < 0:
                best = value
                best_x = x
                continue
            down = list(ub)
            down[frac] = float(_floor(x[frac]))
            up = list(lb)
            up[frac] = float(_ceil(x[frac]))
            stack.append((lb, down))
            stack.append((up, ub))
        if unbounded:
            return Solver.UNBOUNDED
        if best_x is None:
            return Solver.NOT_SOLVED if self._nodes > _NODE_LIMIT else Solver.INFEASIBLE
        _VALUES = {}
        for i, v in enumerate(self._vars):
            _VALUES[v._id] = round(best_x[i]) * 1.0 if v._integer else best_x[i]
        self._obj._value = best
        if not self._mip:
            self._root = (lbs, ubs)
        return Solver.FEASIBLE if self._nodes > _NODE_LIMIT else Solver.OPTIMAL


def _floor(x):
    i = int(x)
    return i - 1 if i > x else i


def _ceil(x):
    i = int(x)
    return i + 1 if i < x else i
