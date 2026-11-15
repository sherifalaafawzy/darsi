/**
 * What runs learners' code, shared by the sandbox on the phone (sandbox.ts) and the course tests in Node
 * (tests/code/node.ts), so a solution graded in the tests is graded the same way on a phone.
 *
 * Python: the harness below runs inside MicroPython. `_darsi_run(json)` runs the program once per test (or once with
 * the given input), each time with fresh variables, its own `print` (captured, capped) and `input` (the test's
 * answers), and a virtual clock (`time.sleep` returns at once and moves the clock), then the test's check. A failure
 * frees the program's objects before the traceback is formatted, so even a MemoryError gets reported.
 *
 * SQL: sameRows() compares a query's result with the solution's.
 *
 * normalizeCode() mends what a phone keyboard types that code can't read, before a run (CodeSteps).
 */
import type { CodeLang, CodeTest } from "../content/types";

export interface RunRequest {
  lang: CodeLang;
  code: string;
  /** Python: run once per test and grade each; without tests, run once with \`inputs\`. */
  tests?: CodeTest[];
  inputs?: string[];
  files?: { name: string; text: string }[];
  /** Python on a virtual board: board time, and the sensor readings and button presses per second, by pin. */
  board?: BoardRun;
  /** Python: record each line as it runs (step through), at most 300. */
  trace?: boolean;
  /** SQL: the tables, and (to grade) the solution whose rows the query must return. */
  setup?: string;
  solution?: string;
}
/** A query's rows. A run sends back at most the first 200 (runSql); `rowCount` then says how many there were. */
export interface SqlTable { columns: string[]; values: unknown[][]; rowCount?: number }
export interface BoardRun { seconds: number; sensors: Record<string, number[]>; buttons: Record<string, number[]> }
/** What happened on the board: each pin change as [ms, pin, "pin" | "duty" | "freq", value], and each pin's last value. */
export interface BoardReport { events: [number, number, "pin" | "duty" | "freq", number][]; pins: Record<string, number>; timeUp: boolean }
export interface RunOne {
  out: string;
  error?: string;
  /** The program's line where the error happened. */
  line?: number;
  /** Graded: the test passed. */
  passed?: boolean;
  /** Why a check failed (an assert's message). */
  message?: string;
  table?: SqlTable;
  board?: BoardReport;
  /** Step through: each line run, its function ("<module>" outside any), call depth and the program's variables then. */
  trace?: TraceStep[];
  /** The program ran more than 300 lines: the trace stops there. */
  traceCut?: boolean;
}
export interface TraceStep { line: number; fn: string; depth: number; vars: Record<string, string> }
/** One result per test (or a single run). \`timeout\`: stopped at the time limit; \`stopped\`: the learner pressed Stop. */
export interface RunResult { runs: RunOne[]; ms: number; timeout?: boolean; stopped?: boolean; failed?: string }

/** Printed output longer than this is cut, with "…". */
export const OUTPUT_CAP = 20_000;
/**
 * The MicroPython heap starts at 2 MB and may grow to 48 MB, then a program gets MemoryError. MicroPython never frees
 * interned strings (str(i) makes one), so after a run that leaves more than \`restart\` in use the interpreter is started
 * afresh (about 15–50 ms on a phone).
 */
export const HEAP = { start: 2 * 1024 * 1024, max: 48 * 1024 * 1024, restart: 8 * 1024 * 1024 };
/** What _darsi_run returns: the results, and how much of the heap is still in use. */
export interface PythonReply { runs: RunOne[]; heap: number }

export const PYTHON_HARNESS = String.raw`
import sys, gc, io, json, time, os
sys.modules['js'] = None
sys.modules['jsffi'] = None
_now = [0]
# On the virtual board a program runs for the lesson's board time: then it stops, as if unplugged (not an error).
_limit = [None]
class _TimeUp(BaseException):
    pass
def _sleep_ms(ms):
    _now[0] += int(ms)
    if _limit[0] is not None and _now[0] > _limit[0]:
        raise _TimeUp()
def _sleep(s): _sleep_ms(s * 1000)
time.sleep = _sleep
time.sleep_ms = _sleep_ms
time.sleep_us = lambda us: _sleep_ms(us / 1000)
time.ticks_ms = lambda: _now[0]
time.ticks_us = lambda: _now[0] * 1000
time.time = lambda: _now[0] / 1000
# Older programs import utime, which MicroPython maps to its own time (with the real clock): give them this one.
sys.modules['utime'] = time

# What the learner sees (prints, and input() prompts with the answers) and, apart, what print() printed: tests
# compare only that, so expected output is exactly the printed lines.
class _Out:
    def __init__(self, cap):
        self.parts = []
        self.printed = []
        self.n = 0
        self.pn = 0
        self.cap = cap
        self.cut = False
    def write(self, s, printed=True):
        # Both are capped: holding every line of a runaway loop would fill the heap (and slow the GC to a crawl).
        if printed and self.pn <= self.cap:
            self.pn += len(s)
            self.printed.append(s)
        if self.cut:
            return
        self.n += len(s)
        if self.n > self.cap:
            self.parts.append(s[:max(0, self.cap - (self.n - len(s)))])
            self.parts.append('…')
            self.cut = True
        else:
            self.parts.append(s)
    def text(self):
        return ''.join(self.parts)

def _format(e):
    b = io.StringIO()
    sys.print_exception(e, b)
    lines = [l for l in b.getvalue().strip().split('\n') if '<stdin>' not in l]
    # Runaway recursion lists hundreds of calls: keep the first and last few.
    if len(lines) > 12:
        lines = lines[:5] + ['  … ' + str(len(lines) - 10) + ' more …'] + lines[-5:]
    return '\n'.join(lines)

def _line_of(msg):
    n = None
    for l in msg.split('\n'):
        i = l.find('File "main.py", line ')
        if i >= 0:
            try:
                n = int(l[i + 21:].split(',')[0])
            except ValueError:
                pass
    return n

def _norm(s):
    return '\n'.join([l.rstrip() for l in s.rstrip('\n').split('\n')])

def _short(v):
    s = repr(v)
    return s if len(s) <= 60 else s[:57] + '...'

def _snap(g):
    # The program's own variables (not functions, modules or what Darsi gives it), as short text.
    out = {}
    for k, v in g.items():
        if k.startswith('_') or k in ('print', 'input') or callable(v) or type(v).__name__ == 'module':
            continue
        out[k] = _short(v)
    return out

_TRACE_MAX = 300

def _one(src, case, cap, board, tracing=False):
    out = _Out(cap)
    def _print(*args, sep=' ', end='\n', file=None, flush=False):
        out.write(sep.join([str(a) for a in args]) + end)
    given = list(case.get('input') or [])
    def _input(prompt=''):
        v = given.pop(0) if given else ''
        out.write(str(prompt) + v + '\n', False)
        return v
    _now[0] = 0
    machine = None
    timeup = False
    if board is not None:
        # The virtual board (lib/machine.py): the step's sensors and buttons, with a test's own values over them.
        import machine
        mine = case.get('board') or {}
        sensors = dict(board.get('sensors') or {})
        sensors.update(mine.get('sensors') or {})
        buttons = dict(board.get('buttons') or {})
        buttons.update(mine.get('buttons') or {})
        machine._reset(sensors, buttons)
        _limit[0] = int((board.get('seconds') or 20) * 1000)
    g = {'__name__': '__main__', 'print': _print, 'input': _input}
    err = None
    fail = None
    # Step through: each line of the program as it runs, with its function, call depth and the variables then.
    # MicroPython's frames have no locals, so inside a function the variables shown are the program's own.
    steps = None
    if tracing:
        steps = []
        def _tr(frame, event, arg):
            if frame.f_code.co_filename != 'main.py' or len(steps) >= _TRACE_MAX:
                return None
            if event == 'line':
                depth = 0
                f = frame.f_back
                while f is not None:
                    if f.f_code.co_filename == 'main.py':
                        depth += 1
                    f = f.f_back
                step = {'line': frame.f_lineno, 'fn': frame.f_code.co_name, 'depth': depth, 'vars': _snap(frame.f_globals)}
                # MicroPython reports a for line twice per turn: a step where nothing changed shows nothing new.
                if not steps or steps[-1] != step:
                    steps.append(step)
            return _tr
        sys.settrace(_tr)
    try:
        exec(compile(src, 'main.py', 'exec'), g)
    except _TimeUp:
        timeup = True
    except BaseException as e:
        err = e
    if tracing:
        sys.settrace(None)
    _limit[0] = None
    if err is None and case.get('check'):
        try:
            exec(compile(case['check'], 'check.py', 'exec'), g)
        except AssertionError as e:
            fail = str(e) or 'check'
        except BaseException as e:
            fail = type(e).__name__ + ': ' + str(e)
    g.clear()
    g = None
    gc.collect()
    r = {'out': out.text()}
    printed = ''.join(out.printed)
    out = None
    if machine is not None:
        r['board'] = machine._report()
        r['board']['timeUp'] = timeup
    if steps is not None:
        r['trace'] = steps
        if len(steps) >= _TRACE_MAX:
            r['traceCut'] = True
    if err is not None:
        r['error'] = _format(err)
        err = None
        n = _line_of(r['error'])
        if n:
            r['line'] = n
    if 'output' in case or 'check' in case:
        ok = 'error' not in r and fail is None
        if ok and 'output' in case:
            ok = _norm(printed) == _norm(case['output'])
        r['passed'] = ok
        if fail is not None:
            r['message'] = fail
    gc.collect()
    return r

def _darsi_run(req):
    req = json.loads(req)
    for f in req.get('files') or []:
        with open(f['name'], 'w') as fh:
            fh.write(f['text'])
    cases = req.get('tests') or [{'input': req.get('inputs') or []}]
    cap = req.get('cap') or 20000
    runs = [_one(req['code'], c, cap, req.get('board'), req.get('trace')) for c in cases]
    gc.collect()
    # Strings like str(i) are interned for good, so the heap only grows: the caller starts afresh above HEAP_RESTART.
    return json.dumps({'runs': runs, 'heap': gc.mem_alloc()})
`;

/**
 * Does a query's result match the solution's? Values only (column names may differ), numbers to 9 decimals, and in the
 * same order only when the solution sorts (ORDER BY). Self-contained: the sandbox worker runs its source.
 */
export function sameRows(got: { values: unknown[][] } | undefined, want: { values: unknown[][] } | undefined, ordered: boolean): boolean {
  if (!got || !want) return !got && !want;
  const cell = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1e9) / 1e9) : v === null ? "NULL" : String(v));
  const rows = (t: { values: unknown[][] }) => t.values.map((r) => JSON.stringify(r.map(cell)));
  const a = rows(got), b = rows(want);
  if (!ordered) { a.sort(); b.sort(); }
  return a.length === b.length && a.every((r, i) => r === b[i]);
}
/** The solution sorts its rows, so the order counts. */
export function isOrdered(solution: string) { return /\border\s+by\b/i.test(solution); }

interface SqlDb { exec(sql: string): SqlTable[]; close(): void }
/**
 * Runs a query on fresh tables (\`setup\`), and with a solution grades it. The result is the last statement's rows.
 * Self-contained apart from sameRows and isOrdered, which the sandbox worker defines next to it.
 */
export function runSql(SQL: { Database: new () => SqlDb }, req: RunRequest): RunOne {
  const run = (code: string): { table?: SqlTable; error?: string } => {
    const db = new SQL.Database();
    try {
      if (req.setup) db.exec(req.setup);
      const res = db.exec(code);
      return { table: res.length ? res[res.length - 1] : { columns: [], values: [] } };
    } catch (e) { return { error: String((e as Error).message ?? e) }; }
    finally { db.close(); }
  };
  const mine = run(req.code);
  const r: RunOne = mine.error ? { out: "", error: mine.error } : { out: "", table: mine.table };
  if (req.solution !== undefined) {
    const want = run(req.solution);
    r.passed = !mine.error && !want.error && sameRows(mine.table, want.table, isOrdered(req.solution));
  }
  // Graded on every row; only the first 200 go back to the page, which shows 50 (a lab 100). A runaway join's hundreds of
  // thousands would be copied there after the time limit, stalling the phone and staying in its memory.
  const t = r.table;
  if (t && t.values.length > 200) r.table = { columns: t.columns, values: t.values.slice(0, 200), rowCount: t.values.length };
  return r;
}

/* ---------- What a phone keyboard types ---------- */

// Arabic keyboards type ٠–٩ (Persian ones ۰–۹) and the Arabic comma, semicolon, decimal point and percent sign; iOS and
// pasted text bring curly quotes; Arabic lesson text, where code sits in invisible left-to-right isolates, brings those
// marks and no-break spaces when copied. Python and SQL read each of them as a syntax error.
const CURLY = /[\u2018-\u201f]/g;
const PUNCT: Record<string, string> = { "\u060c": ",", "\u061b": ";", "\u066b": ".", "\u066a": "%" };
const SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/;
const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
/** One character outside strings and comments, as code reads it. */
function codeChar(c: string): string {
  const n = c.charCodeAt(0);
  if (n < 0x80) return c;
  if (n >= 0x660 && n <= 0x669) return String.fromCharCode(n - 0x630); // ٠–٩
  if (n >= 0x6f0 && n <= 0x6f9) return String.fromCharCode(n - 0x6c0); // ۰–۹
  return PUNCT[c] ?? (SPACE.test(c) ? " " : INVISIBLE.test(c) ? "" : c);
}
/** A quote as code reads it: ‘ ’ ‚ ‛ are ', and “ ” „ ‟ are ". */
const straight = (c: string) => (c >= "\u2018" && c <= "\u201b" ? "'" : c >= "\u201c" && c <= "\u201f" ? "\"" : c);
const straighten = (s: string) => s.replace(CURLY, straight);
/**
 * A curly quote of a string's own kind (q), inside it: text, or the string's end? iOS types curly quotes, the symbol
 * row and most keyboards straight ones, so a string may open with one kind and hold or end with the other. An
 * apostrophe before a letter (don’t) is text. In a string opened with a curly quote, any other one ends it, as a
 * straight one would (input(“Name? “)). In one opened with a straight quote, it is text while a straight one still has
 * to end the string on this line ("he said “hi”", 'the pupils’ marks'), and the end otherwise ("hello”, and "a”, "b”).
 */
function curlyIsText(src: string, i: number, q: string, straightOpened: boolean): boolean {
  if (q === "'" && src[i] === "\u2019" && /[\p{L}\p{N}]/u.test(src[i + 1] ?? "")) return true;
  if (!straightOpened) return false;
  const e = src.indexOf("\n", i + 1), rest = src.slice(i + 1, e < 0 ? src.length : e);
  // An odd number of straight quotes still to come: one of them ends this string. Unless the next quote of the kind is
  // a straight one and a curly one comes later: the learner closes each string with a curly quote.
  let straights = 0, curlies = 0, nextCurly: boolean | undefined;
  for (const ch of rest) {
    if (straight(ch) !== q) continue;
    nextCurly ??= ch !== q;
    if (ch === q) straights++; else curlies++;
  }
  return straights % 2 === 1 && (curlies === 0 || nextCurly === true);
}

const PY_PREFIXES = new Set(["r", "u", "b", "f", "br", "rb", "fr", "rf"]);
function normalizePython(src: string): string {
  let i = 0, out = "";
  const n = src.length;
  // Code: to the end, or in an f-string's {…} up to its closing brace (which the string takes).
  const code = (field: boolean, oneLine: boolean) => {
    let depth = 0;
    while (i < n) {
      const c = src[i], s = straight(c);
      if (field && ((c === "}" && depth === 0) || (c === "\n" && oneLine))) return;
      if (c === "#" && !field) { const e = src.indexOf("\n", i), stop = e < 0 ? n : e; out += straighten(src.slice(i, stop)); i = stop; }
      else if (s === "'" || s === "\"") text();
      else if (c === "«" || c === "»") quoted();
      else {
        if (field) depth += c === "{" || c === "(" || c === "[" ? 1 : c === "}" || c === ")" || c === "]" ? -1 : 0;
        out += codeChar(c); i++;
      }
    }
  };
  // A string as typed, but for curly quotes (a quote after a backslash never ends it), with an f-string's fields read
  // as code. A curly quote of the string's own kind that is text is escaped (\"); a raw string keeps it as typed.
  const text = () => {
    let j = i;
    while (j > 0 && /\w/.test(src[j - 1])) j--;
    const prefix = src.slice(j, i).toLowerCase(), known = PY_PREFIXES.has(prefix);
    const f = known && prefix.includes("f"), raw = known && prefix.includes("r");
    const q = straight(src[i]), end = src.startsWith(q + q + q, i) ? q + q + q : q, straightOpened = src[i] === q;
    out += end; i += end.length;
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += straighten(src.slice(i, i + 2)); i += 2; }
      else if (src.startsWith(end, i)) { out += end; i += end.length; return; }
      else if (c === "\n" && end.length === 1) return; // never closed: the line ends it
      else if (f && c === "{" && src[i + 1] === "{") { out += "{{"; i += 2; }
      else if (f && c === "{") { out += c; i++; code(true, end.length === 1); if (src[i] === "}") { out += "}"; i++; } }
      else if (c !== q && straight(c) === q) {
        if (end.length === 1 && !curlyIsText(src, i, q, straightOpened)) { out += q; i++; return; }
        out += raw ? c : `\\${q}`; i++;
      }
      else { out += straight(c); i++; }
    }
  };
  // Arabic quotation marks « » (either way round) around a value outside a string: a string in "…".
  const quoted = () => {
    out += "\""; i++;
    while (i < n && src[i] !== "\n") {
      const c = src[i];
      if (c === "«" || c === "»") { out += "\""; i++; return; }
      if (c === "\\") { out += straighten(src.slice(i, i + 2)); i += 2; } else { const s = straight(c); out += s === "\"" ? "\\\"" : s; i++; }
    }
  };
  code(false, false);
  return out;
}

function normalizeSql(src: string): string {
  let i = 0, out = "";
  const n = src.length;
  // A string ('…', with '' inside) or a quoted name ("…", `…`, […]), as typed but for curly quotes: one of the string's
  // own kind is doubled when it is text, or ends it (curlyIsText).
  const quoted = (close: string) => {
    const straightOpened = src[i] === close;
    out += close === "]" ? "[" : close; i++;
    while (i < n) {
      const c = src[i];
      if (c === close) {
        if (close !== "]" && src[i + 1] === close) { out += c + c; i += 2; continue; }
        out += c; i++; return;
      }
      if (straight(c) === close) {
        if (!curlyIsText(src, i, close, straightOpened)) { out += close; i++; return; }
        out += close + close; i++; continue;
      }
      out += straight(c); i++;
    }
  };
  while (i < n) {
    const c = src[i], s = straight(c);
    if (c === "-" && src[i + 1] === "-") { const e = src.indexOf("\n", i), stop = e < 0 ? n : e; out += straighten(src.slice(i, stop)); i = stop; }
    else if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2), stop = e < 0 ? n : e + 2; out += straighten(src.slice(i, stop)); i = stop; }
    else if (s === "'" || s === "\"" || c === "`") quoted(s);
    else if (c === "[") quoted("]");
    else if (c === "«" || c === "»") { // Arabic quotation marks around a value: a string in '…'
      out += "'"; i++;
      while (i < n && src[i] !== "«" && src[i] !== "»" && src[i] !== "\n") { const t = straight(src[i]); out += t === "'" ? "''" : t; i++; }
      if (i < n && src[i] !== "\n") { out += "'"; i++; }
    }
    else { out += codeChar(c); i++; }
  }
  return out;
}

/**
 * Mends what a phone keyboard types that code can't read. Outside strings and comments: Arabic-Indic and Persian digits
 * become 0–9; the Arabic comma, semicolon, decimal point and percent sign become , ; . %; no-break and other wide spaces
 * become spaces; invisible direction marks and zero-width characters go; Arabic quotation marks « » around a value
 * become a string's quotes. Curly quotes ‘ ’ “ ” become straight ones (a test's expected output has straight ones): a
 * string's own quotes, and inside a string, where one of the string's kind is escaped (\" in Python, '' in SQL) so the
 * string still ends where it should (a raw string keeps it as typed). Strings and comments otherwise keep what was typed:
 * print("٣، ٤") still prints Arabic digits.
 */
export function normalizeCode(code: string, lang: CodeLang): string {
  if (!/[^\x00-\x7f]/.test(code)) return code;
  return lang === "sql" ? normalizeSql(code) : normalizePython(code);
}
