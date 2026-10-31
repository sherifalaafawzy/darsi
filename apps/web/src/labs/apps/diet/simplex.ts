/**
 * A small two-phase simplex method (dense tableau, Bland's rule so it never cycles), sized for school problems: a few
 * foods and nutrients. Minimises c·x subject to rows a·x ≥ b, ≤ b or = b (b ≥ 0) and x ≥ 0. It keeps the corners it
 * visits in phase 2, so the app can show the cost falling corner by corner.
 */
export interface Row { a: number[]; op: ">=" | "<=" | "="; b: number }
export interface LpResult {
  status: "optimal" | "infeasible" | "unbounded";
  x: number[]; value: number;
  /** Pivots in each phase. */
  pivots: { phase1: number; phase2: number };
  /** The corners phase 2 walked through: the plan and its cost at each. */
  path: { x: number[]; value: number }[];
}

const EPS = 1e-9;

export function simplex(c: number[], rows: Row[], maxPivots = 500): LpResult {
  const n = c.length, m = rows.length;
  const norm = rows.map((r) => (r.b < 0 ? { a: r.a.map((v) => -v), op: r.op === ">=" ? "<=" as const : r.op === "<=" ? ">=" as const : "=" as const, b: -r.b } : r));
  const nSlack = norm.filter((r) => r.op !== "=").length, nArt = norm.filter((r) => r.op !== "<=").length;
  const cols = n + nSlack + nArt, rhs = cols;
  const T = norm.map(() => new Array<number>(cols + 1).fill(0));
  const basis = new Array<number>(m);
  const isArt = (j: number) => j >= n + nSlack;
  let s = n, a = n + nSlack;
  norm.forEach((r, i) => {
    for (let j = 0; j < n; j++) T[i][j] = r.a[j] ?? 0;
    T[i][rhs] = r.b;
    if (r.op === "<=") { T[i][s] = 1; basis[i] = s++; }
    else if (r.op === ">=") { T[i][s++] = -1; T[i][a] = 1; basis[i] = a++; }
    else { T[i][a] = 1; basis[i] = a++; }
  });

  const pivot = (r: number, k: number, obj: number[]) => {
    const pr = T[r], pv = pr[k];
    for (let j = 0; j <= cols; j++) pr[j] /= pv;
    for (let i = 0; i < m; i++) if (i !== r && Math.abs(T[i][k]) > EPS) { const f = T[i][k]; const row = T[i]; for (let j = 0; j <= cols; j++) row[j] -= f * pr[j]; }
    if (Math.abs(obj[k]) > EPS) { const f = obj[k]; for (let j = 0; j <= cols; j++) obj[j] -= f * pr[j]; }
    basis[r] = k;
  };
  /** Reduced costs for cost vector `cost` with the current basis; obj[rhs] = −(current cost). */
  const objective = (cost: number[]) => {
    const obj = new Array<number>(cols + 1).fill(0);
    for (let j = 0; j < cols; j++) obj[j] = cost[j] ?? 0;
    for (let i = 0; i < m; i++) { const cb = cost[basis[i]] ?? 0; if (cb) for (let j = 0; j <= cols; j++) obj[j] -= cb * T[i][j]; }
    return obj;
  };
  const point = () => { const x = new Array<number>(n).fill(0); for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][rhs]; return x; };
  /** Runs simplex iterations; `allowed` says which columns may enter. */
  const run = (obj: number[], allowed: (j: number) => boolean, onPivot?: () => void): "optimal" | "unbounded" | "limit" => {
    for (let it = 0; it < maxPivots; it++) {
      let k = -1;
      for (let j = 0; j < cols; j++) if (allowed(j) && obj[j] < -EPS) { k = j; break; } // Bland: lowest index
      if (k < 0) return "optimal";
      let r = -1, best = Infinity;
      for (let i = 0; i < m; i++) if (T[i][k] > EPS) {
        const q = T[i][rhs] / T[i][k];
        if (q < best - EPS || (Math.abs(q - best) <= EPS && basis[i] < basis[r])) { best = q; r = i; }
      }
      if (r < 0) return "unbounded";
      pivot(r, k, obj);
      onPivot?.();
    }
    return "limit";
  };

  // Phase 1: find any plan that meets every row (drive the artificial columns to zero).
  let phase1 = 0;
  if (nArt) {
    const obj1 = objective(Array.from({ length: cols }, (_, j) => (isArt(j) ? 1 : 0)));
    run(obj1, () => true, () => phase1++);
    if (-obj1[rhs] > 1e-7) return { status: "infeasible", x: new Array(n).fill(0), value: NaN, pivots: { phase1, phase2: 0 }, path: [] };
    // An artificial column still in the basis at zero: swap it for a real column if the row allows.
    for (let i = 0; i < m; i++) if (isArt(basis[i])) {
      const k = Array.from({ length: n + nSlack }, (_, j) => j).find((j) => Math.abs(T[i][j]) > EPS);
      if (k !== undefined) pivot(i, k, obj1);
    }
  }

  // Phase 2: improve the cost, corner by corner.
  const obj = objective(c);
  const path = [{ x: point(), value: -obj[rhs] }];
  let phase2 = 0;
  const status = run(obj, (j) => !isArt(j), () => {
    phase2++;
    const x = point(), last = path[path.length - 1];
    if (x.some((v, j) => Math.abs(v - last.x[j]) > 1e-9)) path.push({ x, value: -obj[rhs] }); // a degenerate pivot stays on the same corner
  });
  if (status === "unbounded") return { status, x: point(), value: -Infinity, pivots: { phase1, phase2 }, path };
  return { status: "optimal", x: point(), value: -obj[rhs], pivots: { phase1, phase2 }, path };
}
