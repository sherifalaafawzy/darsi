/**
 * The ten simulated school tools, over world.json: the same functions as tools/tinylm/tools.py, down to the error
 * messages and the JSON key order, because the model was trained on that file's results. tests/tinylm/tools.test.ts
 * replays every call of the test sets against the Python results.
 *
 * Results use the conversation's language (`lang`); the model never passes it. send_message only reports success:
 * asking for approval first is the model's job, and a Lab's guardrail may check it again before calling runTool.
 */

export type Lang = "en" | "ar";
type Pair = [string, string];
type Counts = { present: number; absent: number; late: number };

export interface World {
  version: number;
  today: string;
  villages: { id: number; en: string; ar: string }[];
  roads: [number, number, number][];
  classes: string[];
  subjects: Record<string, Pair>;
  timetable: Record<string, Record<string, string[]>>;
  pupils: { id: number; en: string; ar: string; class: string; today: string; week: Counts; month: Counts }[];
  weather: Record<string, Record<string, { sky: string; high: number; low: number; rain: number }>>;
  skies: Record<string, Pair>;
  status: Record<string, Pair>;
  glossary: { id: number; en: string; ar: string; def_en: string; def_ar: string }[];
  topics: { id: number; en: string; ar: string; books: number[] }[];
  books: { id: number; en: string; ar: string; shelf: string }[];
  units: Record<string, [string, number]>;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS = DAYS.slice(0, 5);
const WEATHER_DAYS = ["today", "tomorrow", ...DAYS];
const WHEN = /^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday) ([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Lookup key, as world.py normalize(): lower case, no diacritics or tatweel, one alef/yaa/taa marbuta, no "the"/"ال". */
export function normalize(s: string): string {
  let out = "";
  for (let ch of s.trim().toLowerCase()) {
    const o = ch.codePointAt(0)!;
    if ((o >= 0x064b && o <= 0x065f) || o === 0x0670 || o === 0x0640) continue;
    if ("أإآٱ".includes(ch)) ch = "ا";
    else if (ch === "ى") ch = "ي";
    else if (ch === "ة") ch = "ه";
    else if (ch === "-" || ch === "_") ch = " ";
    else if (".,!?؟،؛:;\"'«»()".includes(ch)) continue;
    out += ch;
  }
  let words = out.split(/\s+/).filter(Boolean).map((w) => (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w));
  if (words[0] === "the") words = words.slice(1);
  return words.join(" ");
}

/** Rounded to 2 decimals, half up (tools.py fmt). */
export const fmt = (v: number) => Math.floor(v * 100 + 0.5) / 100;

class ExprError extends Error {}

/** + - * / and brackets over decimal numbers, unary minus; tools.py _Expr. */
export function calc(src: string): number {
  const s = src.replace(/ /g, "");
  let i = 0;
  if (!s || s.length > 80) throw new ExprError("bad expression");
  const peek = () => s[i] ?? "";
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = factor();
      if (op === "*") v = v * r;
      else { if (r === 0) throw new RangeError("division by zero"); v = v / r; }
    }
    return v;
  };
  const factor = (): number => {
    const c = peek();
    if (c === "-") { i++; return -factor(); }
    if (c === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new ExprError("bad expression");
      i++;
      return v;
    }
    const m = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i));
    if (!m) throw new ExprError("bad expression");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const v = expr();
  if (i !== s.length) throw new ExprError("bad expression");
  return v;
}

function num(v: unknown): number | null {
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(v.trim())) return parseFloat(v);
  return null;
}

/** The entity whose English or Arabic name matches `name` once both are normalized. */
export function findEntity<T extends { en: string; ar: string }>(items: readonly T[], name: unknown): T | null {
  if (typeof name !== "string") return null;
  const k = normalize(name);
  if (!k) return null;
  return items.find((it) => normalize(it.en) === k || normalize(it.ar) === k) ?? null;
}

const dayOf = (w: World, d: string) => (d === "today" ? w.today : d === "tomorrow" ? DAYS[(DAYS.indexOf(w.today) + 1) % 7] : d);

/** Runs one call. Wrong tools or arguments give {error}, never an exception. */
export function runTool(w: World, tool: string, args: unknown, lang: Lang): Record<string, unknown> {
  const L = lang === "ar" ? 1 : 0;
  if (!args || typeof args !== "object" || Array.isArray(args)) return { error: "bad arguments" };
  const a = args as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string) : null);

  switch (tool) {
    case "calculator": {
      const e = s("expr");
      if (e === null) return { error: "missing expr" };
      try {
        const v = calc(e);
        if (Math.abs(v) >= 1e15) return { error: "number too big" };
        return { value: fmt(v) };
      } catch (err) {
        return { error: err instanceof RangeError ? "division by zero" : "bad expression" };
      }
    }
    case "timetable": {
      let c = s("class");
      const d0 = s("day");
      if (c === null) return { error: "missing class" };
      c = c.trim().toUpperCase();
      if (!(c in w.timetable)) return { error: "unknown class" };
      let d = (d0 ?? "today").trim().toLowerCase();
      if (!WEATHER_DAYS.includes(d)) return { error: "unknown day" };
      d = dayOf(w, d);
      if (!WEEKDAYS.includes(d)) return { error: "no school" };
      const lessons = w.timetable[c][d].map((x) => w.subjects[x][L]);
      if ("period" in a) {
        const p = num(a.period);
        if (p === null || !Number.isInteger(p) || p < 1 || p > lessons.length) return { error: "no such period" };
        return { subject: lessons[p - 1] };
      }
      return { lessons };
    }
    case "weather": {
      const p = s("place"), d = (s("day") ?? "today").trim().toLowerCase();
      if (p === null) return { error: "missing place" };
      const v = findEntity(w.villages, p);
      if (!v) return { error: "unknown place" };
      if (!WEATHER_DAYS.includes(d)) return { error: "unknown day" };
      const x = w.weather[String(v.id)][d];
      return { sky: w.skies[x.sky][L], high: x.high, low: x.low, rain: x.rain };
    }
    case "library": {
      const q = s("query");
      if (q === null) return { error: "missing query" };
      const k = normalize(q);
      const found: number[] = [];
      for (const t of w.topics) if (k && (normalize(t.en) === k || normalize(t.ar) === k)) found.push(...t.books);
      for (const b of w.books) if (k && k.length >= 3 && (normalize(b.en).includes(k) || normalize(b.ar).includes(k))) found.push(b.id);
      const ids = [...new Set(found)].sort((x, y) => x - y).slice(0, 3);
      return { books: ids.map((i) => ({ title: L ? w.books[i].ar : w.books[i].en, shelf: w.books[i].shelf })) };
    }
    case "attendance": {
      const n = s("student"), r = (s("range") ?? "today").trim().toLowerCase();
      if (n === null) return { error: "missing student" };
      const p = findEntity(w.pupils, n);
      if (!p) return { error: "not found" };
      if (r === "today") return { status: w.status[p.today][L] };
      if (r === "week" || r === "month") { const c = p[r]; return { present: c.present, absent: c.absent, late: c.late }; }
      return { error: "unknown range" };
    }
    case "glossary": {
      const t = s("term");
      if (t === null) return { error: "missing term" };
      const g = findEntity(w.glossary, t);
      if (!g) return { error: "not found" };
      return { definition: L ? g.def_ar : g.def_en };
    }
    case "reminder": {
      const t = s("text"), when = s("when");
      if (t === null) return { error: "missing text" };
      if (when === null || !WHEN.test(when.trim())) return { error: "bad time" };
      return { ok: true };
    }
    case "convert": {
      const v = num(a.value);
      let from = s("from"), to = s("to");
      if (v === null) return { error: "missing value" };
      const u = w.units;
      if (from === null || to === null || !(from.toLowerCase() in u) || !(to.toLowerCase() in u)) return { error: "unknown unit" };
      from = from.toLowerCase();
      to = to.toLowerCase();
      if (u[from][0] !== u[to][0]) return { error: "cannot convert" };
      const x = from === to ? v : from === "c" ? (v * 9) / 5 + 32 : from === "f" ? ((v - 32) * 5) / 9 : (v * u[from][1]) / u[to][1];
      if (Math.abs(x) >= 1e15) return { error: "number too big" };
      return { value: fmt(x), unit: to };
    }
    case "route": {
      const a1 = findEntity(w.villages, s("from")), b1 = findEntity(w.villages, s("to"));
      if (s("from") === null || s("to") === null) return { error: "missing place" };
      if (!a1 || !b1) return { error: "unknown place" };
      if (a1.id === b1.id) return { error: "same place" };
      const { km, path } = shortest(w, a1.id, b1.id);
      return { km, via: path.slice(1, -1).map((i) => (L ? w.villages[i].ar : w.villages[i].en)) };
    }
    case "send_message": {
      if (s("to") === null || s("text") === null) return { error: "missing to or text" };
      return { sent: true };
    }
    default:
      return { error: "unknown tool" };
  }
}

/** Dijkstra over the roads, O(n²), ties to the lower village id (tools.py shortest). */
export function shortest(w: World, src: number, dst: number): { km: number; path: number[] } {
  const n = w.villages.length;
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [a, b, km] of w.roads) { adj[a].push([b, km]); adj[b].push([a, km]); }
  for (const l of adj) l.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const dist = new Array<number>(n).fill(Infinity), prev = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false);
  dist[src] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { u = i; best = dist[i]; }
    if (u < 0 || u === dst) break;
    done[u] = true;
    for (const [v, km] of adj[u]) if (dist[u] + km < dist[v]) { dist[v] = dist[u] + km; prev[v] = u; }
  }
  const path = [dst];
  while (path[path.length - 1] !== src) path.push(prev[path[path.length - 1]]);
  return { km: dist[dst], path: path.reverse() };
}

/** The conversation's language, from the person's latest message: any Arabic letter makes it Arabic. */
export const langOf = (text: string): Lang => (/[؀-ۿ]/.test(text) ? "ar" : "en");
