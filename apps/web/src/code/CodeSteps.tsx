/**
 * The code steps, in their own lazy chunk (loader.tsx): write and run (code), put lines in order (parsons), fill the
 * gaps (codefill), find the bug (bug) and the robot (blocks). Code is always left to right, in every language.
 * Programs run only on Run, in the sandbox (sandbox.ts); the robot's walk is paced by time and stops by itself.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, QuestionHeader } from "@darsi/design-system";
import { useI18n } from "../i18n";
import type { BlocksStep, Board, BugStep, CodeFillStep, CodeLang, CodeStep, ParsonsStep, RobotBlock, RobotCommand } from "../content/types";
import { MAX_TIMES, runRobot, type RobotOutcome } from "../content/robot";
import { shuffled } from "../lesson/engine";
import type { StepViewProps } from "../lesson/StepView";
import { CodeBlock, CodeLine } from "./CodeBlock";
import { RUNTIMES } from "../content/runtimes";
import { sandbox, TIME_LIMIT } from "./sandbox";
import { normalizeCode, type BoardReport, type BoardRun, type RunOne, type RunResult } from "./harness";
import "../styles/code.css";

const STRINGS = {
  en: {
    run: "Run", stop: "Stop", again: "Start again", output: "Output", nothing: "Nothing printed.", running: "Running…",
    loading: (lang: string, mb: string) => `Getting ${lang} ready (${mb} MB, once)…`,
    offline: (lang: string, mb: string) => `${lang} needs one download (${mb} MB). Connect once, then it works offline too.`,
    // A program that is too slow for its data stops at the limit too, so the message names both (a hint the test has
    // for the slow way can't show: a stopped run has no test results).
    timeout: (s: string) => `Stopped after ${s} seconds. Does a loop never end? Or is the program too slow for this much data, with a loop inside a loop?`,
    timeoutSql: (s: string) => `Stopped after ${s} seconds. Does WITH RECURSIVE repeat without end, or does a join make far too many rows?`, stopped: "Stopped.",
    errorLine: (n: string) => `Error on line ${n}`, runFirst: "Run your code, then press Check.",
    inputGets: (v: string) => `input() gets: ${v}`, tests: "Tests", test: (n: string) => `Test ${n}`, pass: "Passed", fail: "Not yet",
    hint: "Show a hint", hintN: (n: string, total: string) => `Hint ${n} of ${total}`, keys: "Symbols", editor: "Your code",
    tabHint: "Tab indents. To leave the editor, press Esc, then Tab or Shift+Tab.",
    rows: (n: string) => `Rows: ${n}`, more: (n: string) => `and ${n} more`,
    pool: "Lines to use", program: "Your program", tapLines: "Tap the lines in the right order.", indent: "Indent", outdent: "Indent less",
    remove: "Take out", start: "Tap a line to start.", rightOrder: "The right order:",
    tapGap: "Tap a gap, then a word.", gap: (n: string) => `Gap ${n}`, empty: "empty", words: "Words",
    tapBug: "Tap the line with the mistake.", line: (n: string) => `Line ${n}`, fix: "The fix:",
    forward: "Forward", left: "Turn left", right: "Turn right", cards: (n: string, max: string) => `Cards: ${n} of ${max}`, clear: "Clear",
    runRobot: "Run the robot", tapCard: "Tap a card in your program to repeat it, up to 4 times.", full: "No more cards: take one out first.",
    program2: "Your program", palette: "Commands", grid: "The robot's grid",
    board: "The board", clock: (t: string, total: string) => `Board time: ${t} s of ${total} s`, again2: "Play again", pin: (n: string) => `pin ${n}`,
    on: "on", off: "off", quiet: "quiet", pressed: "pressed", notPressed: "not pressed", led: "LED", buzzer: "Buzzer",
    timeUp: "Board time is up: on a real board the program would keep going.",
    sensor: { light: "Light", temperature: "Temperature", moisture: "Soil moisture", distance: "Distance", sound: "Sound" } as Record<string, string>,
    outcome: { goal: "The robot reached the goal!", wall: "The robot bumped into a wall.", edge: "The robot reached the edge of the grid.", short: "The robot stopped before the goal." } as Record<RobotOutcome, string>,
  },
  ar: {
    run: "شغّل", stop: "أوقف", again: "ابدأ من جديد", output: "الناتج", nothing: "لم يُطبع شيء.", running: "جارٍ التشغيل…",
    loading: (lang: string, mb: string) => `جارٍ تجهيز ${lang} (${mb} ميغابايت، مرة واحدة)…`,
    offline: (lang: string, mb: string) => `يحتاج ${lang} إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم يعمل دون اتصال أيضًا.`,
    timeout: (s: string) => `توقّف بعد ${s} ثوانٍ. هل توجد حلقة لا تنتهي؟ أم أن البرنامج أبطأ من أن يعالج هذا القدر من البيانات، بحلقة داخل حلقة مثلًا؟`,
    timeoutSql: (s: string) => `توقّف بعد ${s} ثوانٍ. هل يتكرّر WITH RECURSIVE بلا توقّف، أم يصنع الربط صفوفًا أكثر من اللازم بكثير؟`, stopped: "توقّف.",
    errorLine: (n: string) => `خطأ في السطر ${n}`, runFirst: "شغّل الكود، ثم اضغط «تحقّق».",
    inputGets: (v: string) => `تأخذ input() القيمة: ${v}`, tests: "الاختبارات", test: (n: string) => `الاختبار ${n}`, pass: "نجح", fail: "ليس بعد",
    hint: "أظهر تلميحًا", hintN: (n: string, total: string) => `التلميح ${n} من ${total}`, keys: "الرموز", editor: "الكود الذي تكتبه",
    tabHint: "مفتاح Tab يُزيح السطر إلى الداخل. للخروج من محرّر الكود اضغط Esc ثم Tab أو Shift+Tab.",
    rows: (n: string) => `الصفوف: ${n}`, more: (n: string) => `و${n} غيرها`,
    pool: "الأسطر المتاحة", program: "برنامجك", tapLines: "انقر الأسطر بالترتيب الصحيح.", indent: "أزِح إلى الداخل", outdent: "أزِح إلى الخارج",
    remove: "أخرِج السطر", start: "انقر سطرًا لتبدأ.", rightOrder: "الترتيب الصحيح:",
    tapGap: "انقر فراغًا، ثم كلمة.", gap: (n: string) => `الفراغ ${n}`, empty: "فارغ", words: "الكلمات",
    tapBug: "انقر السطر الذي فيه الخطأ.", line: (n: string) => `السطر ${n}`, fix: "التصحيح:",
    forward: "إلى الأمام", left: "استدر يسارًا", right: "استدر يمينًا", cards: (n: string, max: string) => `البطاقات: ${n} من ${max}`, clear: "امسح الكل",
    runRobot: "شغّل الروبوت", tapCard: "انقر بطاقة في برنامجك لتكرّرها حتى ٤ مرات.", full: "لا مكان لبطاقة أخرى: أخرِج واحدة أولًا.",
    program2: "برنامجك", palette: "الأوامر", grid: "شبكة الروبوت",
    board: "اللوحة", clock: (t: string, total: string) => `وقت اللوحة: ${t} ث من ${total} ث`, again2: "أعد العرض", pin: (n: string) => `المنفذ ${n}`,
    on: "مضاء", off: "مطفأ", quiet: "صامت", pressed: "مضغوط", notPressed: "غير مضغوط", led: "مصباح LED", buzzer: "الطنّان",
    timeUp: "انتهى وقت اللوحة: على لوحة حقيقية كان البرنامج سيستمر.",
    sensor: { light: "الضوء", temperature: "الحرارة", moisture: "رطوبة التربة", distance: "المسافة", sound: "الصوت" } as Record<string, string>,
    outcome: { goal: "وصل الروبوت إلى الهدف!", wall: "اصطدم الروبوت بجدار.", edge: "وصل الروبوت إلى حافة الشبكة.", short: "توقّف الروبوت قبل الهدف." } as Record<RobotOutcome, string>,
  },
};
type S = typeof STRINGS.en;
const useS = (): S => { const { lang } = useI18n(); return lang === "ar" ? STRINGS.ar : STRINGS.en; };
const LANG_NAME: Record<CodeLang, string> = { python: "Python", sql: "SQL" };

export default function CodeSteps(p: StepViewProps) {
  const { t, L } = useI18n();
  const s = p.step;
  const head = (key: "q.code" | "q.parsons" | "q.codefill" | "q.bug" | "q.blocks", hint?: string) =>
    <QuestionHeader type="type" icon="code" typeLabel={t(key)} prompt={L(s.prompt)} hint={hint} />;
  switch (s.type) {
    case "code": return <WriteRun {...p} step={s} header={head("q.code")} />;
    case "parsons": return <Parsons {...p} step={s} header={head("q.parsons")} />;
    case "codefill": return <Fill {...p} step={s} header={head("q.codefill")} />;
    case "bug": return <Bug {...p} step={s} header={head("q.bug")} />;
    case "blocks": return <Blocks {...p} step={s} header={head("q.blocks")} />;
    default: return null;
  }
}
type ViewProps<T> = StepViewProps & { step: T; header: ReactNode };

type FindFocus = (root: HTMLElement) => Element | null | undefined;
/**
 * Keyboard focus stays in the exercise. A control that goes away or is disabled when pressed (a line moved out of the
 * pool, the last hint, Run while Python loads, the robot's Run while it walks) would drop the focus to the page, and a
 * keyboard or screen reader user would lose their place. `keep(e, to)`, in its click handler, hands the focus on to
 * what `to` finds in the step, as soon as that is enabled: only when the pressed control had the focus, and only while
 * nothing else has taken it since.
 */
function useKeepFocus() {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<{ from: Element; to: FindFocus } | null>(null);
  useLayoutEffect(() => {
    const p = pending.current, box = root.current;
    if (!p || !box) return;
    const now = document.activeElement;
    if (now && now !== document.body && now !== p.from) { pending.current = null; return; }
    const el = p.to(box);
    if (!(el instanceof HTMLElement) || (el as HTMLButtonElement).disabled) return; // not ready: after a later render
    pending.current = null;
    if (el !== now) el.focus({ preventScroll: true });
  });
  const keep = (e: { currentTarget: Element }, to: FindFocus) => {
    if (e.currentTarget === document.activeElement) pending.current = { from: e.currentTarget, to };
  };
  return { root, keep };
}

/* ---------- Write and run ---------- */

// What a learner typed survives the lesson's retry of the step (it remounts), for as long as the app is open; a new
// starter (the editor's preview) starts afresh.
const drafts = new Map<string, string>();
const PY_KEYS = ["⇥", ":", "(", ")", "[", "]", "\"", "'", "=", "<", ">", "#", "+", "*"];
const SQL_KEYS = ["*", ",", "(", ")", "'", "=", "<", ">", ";", "%"];
// Pressed on their own (as before Shift+Tab), these keep Escape's way out open.
const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta"]);

function Editor({ value, onChange, lang, label, errorLine, disabled }: { value: string; onChange: (v: string) => void; lang: CodeLang; label: string; errorLine?: number; disabled?: boolean }) {
  const s = useS();
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const leave = useRef(false); // Escape, then Tab or Shift+Tab, leaves the editor (Tab alone indents)
  // A keyboard is in use (Tab or Escape pressed here): the hint on leaving shows on touch screens too (code.css).
  const [keyboard, setKeyboard] = useState(false);
  const lines = value.split("\n").length;
  const insert = (text: string) => {
    const el = ref.current; if (!el) return;
    el.focus();
    el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    onChange(el.value);
  };
  const outdent = () => {
    const el = ref.current; if (!el) return;
    const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1, lead = /^ {1,4}/.exec(el.value.slice(start))?.[0].length ?? 0;
    if (!lead) return;
    const at = el.selectionStart;
    el.setRangeText("", start, start + lead, "preserve");
    el.selectionStart = el.selectionEnd = Math.max(start, at - lead);
    onChange(el.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (MODIFIERS.has(e.key)) return;
    if (e.key === "Escape") { leave.current = true; setKeyboard(true); return; }
    if (e.key === "Tab" && !leave.current && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setKeyboard(true); if (e.shiftKey) outdent(); else insert("    "); return; }
    leave.current = false;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const el = e.currentTarget, line = el.value.slice(el.value.lastIndexOf("\n", el.selectionStart - 1) + 1, el.selectionStart);
      let indent = /^ */.exec(line)![0];
      if (lang === "python" && /:\s*$/.test(line)) indent += "    ";
      if (indent) { e.preventDefault(); insert(`\n${indent}`); }
    }
  };
  return (
    <div className="cd-edit">
      <div className="cd-editor" dir="ltr">
        <div className="cd-gutter" aria-hidden>{Array.from({ length: lines }, (_, i) => <span key={i} className={errorLine === i + 1 ? "is-err" : undefined}>{i + 1}</span>)}</div>
        <textarea ref={ref} className="cd-text" value={value} rows={Math.max(5, lines + 1)} dir="ltr" wrap="off" translate="no" spellCheck={false}
          autoCapitalize="off" autoCorrect="off" autoComplete="off" enterKeyHint="enter" aria-label={label} aria-describedby={disabled ? undefined : hintId} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onBlur={() => { leave.current = false; }} />
      </div>
      <div className="cd-keys" role="toolbar" aria-label={s.keys} dir="ltr">
        {(lang === "python" ? PY_KEYS : SQL_KEYS).map((k) => (
          <button key={k} type="button" className="cd-key" disabled={disabled} aria-label={k === "⇥" ? s.indent : k}
            onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k === "⇥" ? "    " : k)}>{k}</button>
        ))}
      </div>
      {!disabled && <p id={hintId} className={keyboard ? "muted small cd-tab-hint is-shown" : "muted small cd-tab-hint"}>{s.tabHint}</p>}
    </div>
  );
}

function WriteRun({ step, header, result, onAnswer }: ViewProps<CodeStep>) {
  const s = useS();
  const { L, num } = useI18n();
  const draft = `${step.id}\n${step.starter}`;
  const [code, setCode] = useState(() => drafts.get(draft) ?? step.starter);
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [res, setRes] = useState<RunResult | null>(null);
  const [hints, setHints] = useState(0);
  const { root, keep } = useKeepFocus();
  const toRun: FindFocus = (r) => r.querySelector(".cd-run"); // Run, which is Stop while a program runs
  const running = useRef(false);
  running.current = state === "running";
  // Leaving the step stops a program still running.
  useEffect(() => () => { if (running.current) sandbox().stop(); }, []);
  const edit = (v: string) => { setCode(v); drafts.set(draft, v); if (res) { setRes(null); onAnswer(null); } };
  // Run runs the program and its tests together (one trip to the sandbox); the lesson's Check then reveals the verdict.
  const run = async () => {
    // What a phone keyboard types that code can't read (Arabic digits and commas, curly quotes…) is mended first, in the
    // editor too, so the learner sees what ran (harness.ts normalizeCode). Strings and comments keep what was typed.
    const src = normalizeCode(code, step.lang);
    if (src !== code) { setCode(src); drafts.set(draft, src); }
    const sb = sandbox();
    try {
      setState("loading");
      await sb.prepare(step.lang);
      setState("running");
      const r = await sb.run(step.lang === "sql" ? { lang: step.lang, code: src, setup: step.setup, solution: step.solution }
        : { lang: step.lang, code: src, tests: step.tests, files: step.files, ...(step.board ? { board: boardRun(step.board) } : {}) });
      setRes(r);
      setState("idle");
      const passed = !r.timeout && !r.stopped && !r.failed && r.runs.length > 0 && r.runs.every((x) => x.passed);
      onAnswer(r.stopped ? null : { kind: "code", passed });
    } catch (e) {
      const offline = (e as Error).message === "offline";
      setState(offline ? "offline" : "idle");
      if (!offline) setRes({ runs: [], ms: 0, failed: String((e as Error).message) });
    }
  };
  const shown = res?.runs[0];
  const mb = num(Math.round(RUNTIMES[step.lang].sizeMB * 10) / 10);
  const firstInput = step.tests?.[0]?.input;
  const checked = result !== null;
  return (
    <div className="stack cd-step" ref={root}>
      {header}
      {firstInput?.length ? <p className="muted small" dir="auto">{s.inputGets(firstInput.join(", "))}</p> : null}
      <Editor value={code} onChange={edit} lang={step.lang} label={s.editor} errorLine={shown?.line} disabled={checked} />
      <div className="row-gap">
        {/* One button, Run or Stop: it keeps the focus while a program starts, runs and ends. */}
        {state === "running"
          ? <Button size="sm" variant="secondary" icon="pause" className="cd-run" onClick={() => sandbox().stop()}>{s.stop}</Button>
          : <Button size="sm" icon="play" className="cd-run" onClick={(e) => { keep(e, toRun); void run(); }} loading={state === "loading"} disabled={checked}>{s.run}</Button>}
        <Button size="sm" variant="ghost" icon="undo" disabled={checked || code === step.starter} onClick={(e) => { keep(e, toRun); edit(step.starter); }}>{s.again}</Button>
        {step.hints?.length ? <Button size="sm" variant="ghost" icon="idea" disabled={hints >= step.hints.length}
          onClick={(e) => { if (hints + 1 >= step.hints!.length) keep(e, (r) => [...r.querySelectorAll(".cd-hint")].pop()); setHints(hints + 1); }}>{s.hint}</Button> : null}
      </div>
      {state === "loading" && <p className="muted small">{s.loading(LANG_NAME[step.lang], mb)}</p>}
      {state === "offline" && <p className="notice">{s.offline(LANG_NAME[step.lang], mb)}</p>}
      {step.hints?.slice(0, hints).map((h, i) => <p key={i} className="cd-hint" tabIndex={-1}><strong>{s.hintN(num(i + 1), num(step.hints!.length))}</strong> {L(h)}</p>)}
      {step.board && <BoardView board={step.board} report={shown?.board} />}
      {(res || state === "running") && <Output res={res} running={state === "running"} lang={step.lang} />}
      {!res && state === "idle" && !checked && <p className="muted small">{s.runFirst}</p>}
      {checked && res && step.lang === "python" && <Tests runs={res.runs} step={step} />}
    </div>
  );
}

/* ---------- The virtual board ---------- */

/** The step's board as the sandbox wants it: board time, and the readings and presses per second, by pin. */
const boardRun = (b: Board): BoardRun => ({
  seconds: b.seconds ?? 20,
  sensors: Object.fromEntries((b.sensors ?? []).map((x) => [String(x.pin), x.values])),
  buttons: Object.fromEntries((b.buttons ?? []).map((x) => [String(x.pin), x.presses ?? [0]])),
});
const BOARD_SPEED = 4; // board seconds play back four times faster
const atSecond = (values: number[] | undefined, t: number) => (values?.length ? values[Math.min(values.length - 1, Math.floor(t / 1000))] : 0);

/**
 * What the program did on the board, played back after a run on board time (4× faster, then it stops; at once when
 * the phone asks for less motion): LEDs lit or dimmed, the buzzer's note, buttons and each sensor's reading.
 */
function BoardView({ board, report }: { board: Board; report?: BoardReport }) {
  const s = useS();
  const { L, num, t: tr } = useI18n();
  const total = (board.seconds ?? 20) * 1000;
  const end = report ? (report.timeUp ? total : Math.min(total, Math.max(0, ...report.events.map((e) => e[0])) + 500)) : 0;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (report) { setT(0); setPlaying(true); } }, [report]);
  useEffect(() => {
    if (!playing) return;
    if (t >= end || matchMedia("(prefers-reduced-motion: reduce)").matches) { setT(end); setPlaying(false); return; }
    const id = setTimeout(() => setT(Math.min(end, t + 100 * BOARD_SPEED)), 100);
    return () => clearTimeout(id);
  }, [playing, t, end]);
  // A pin's level at board time t: 0 or 1 from Pin writes, a fraction from PWM duty; and its last frequency.
  const level = (pin: number) => {
    let v = 0;
    for (const [ms, p, kind, value] of report?.events ?? []) { if (ms > t) break; if (p === pin && kind !== "freq") v = kind === "duty" ? value / 65535 : value; }
    return v;
  };
  const freq = (pin: number) => {
    let v = 0;
    for (const [ms, p, kind, value] of report?.events ?? []) { if (ms > t) break; if (p === pin && kind === "freq") v = value; }
    return v;
  };
  const secs = (ms: number) => num(Math.round(ms / 100) / 10);
  const pin = (n: number) => <span className="muted small">{s.pin(num(n))}</span>;
  return (
    <section className="cd-board" aria-label={s.board}>
      <h3 className="cd-out-h">{s.board}</h3>
      <ul className="cd-parts">
        {(board.leds ?? []).map((x) => {
          const lv = level(x.pin);
          return <li key={`l${x.pin}`} className="cd-part">
            <span className={`cd-led is-${x.color}${lv > 0 ? " is-on" : ""}`} style={lv > 0 && lv < 1 ? { opacity: 0.35 + 0.65 * lv } : undefined} aria-hidden />
            <span>{x.label ? L(x.label) : s.led} {pin(x.pin)}</span>
            <strong className="cd-part-state">{lv > 0 ? s.on : s.off}</strong>
          </li>;
        })}
        {board.buzzer && <li className="cd-part">
          <span className={level(board.buzzer.pin) > 0 ? "cd-buzz is-on" : "cd-buzz"} aria-hidden>♪</span>
          <span>{board.buzzer.label ? L(board.buzzer.label) : s.buzzer} {pin(board.buzzer.pin)}</span>
          <strong className="cd-part-state" dir="ltr">{level(board.buzzer.pin) > 0 ? `${num(freq(board.buzzer.pin))} Hz` : s.quiet}</strong>
        </li>}
        {(board.buttons ?? []).map((x) => {
          const down = !!atSecond(x.presses, t);
          return <li key={`b${x.pin}`} className="cd-part">
            <span className={down ? "cd-btn is-on" : "cd-btn"} aria-hidden />
            <span>{L(x.label)} {pin(x.pin)}</span>
            <strong className="cd-part-state">{down ? s.pressed : s.notPressed}</strong>
          </li>;
        })}
        {(board.sensors ?? []).map((x) => {
          const v = atSecond(x.values, t);
          return <li key={`s${x.pin}`} className="cd-part">
            <span>{L(x.label)} <span className="muted small">{s.sensor[x.kind]}{tr("common.sep")}{s.pin(num(x.pin))}</span></span>
            <span className="cd-meter" aria-hidden><span className="cd-meter-fill" style={{ inlineSize: `${Math.round((v / 65535) * 100)}%` }} /></span>
            <strong className="cd-part-state" dir="ltr">{num(v)}</strong>
          </li>;
        })}
      </ul>
      {report && <div className="row-gap">
        <span className="muted small" role="status">{s.clock(secs(t), secs(total))}</span>
        {!playing && <Button size="sm" variant="ghost" icon="play" onClick={() => { setT(0); setPlaying(true); }}>{s.again2}</Button>}
      </div>}
      {report?.timeUp && !playing && <p className="muted small">{s.timeUp}</p>}
    </section>
  );
}

function Output({ res, running, lang }: { res: RunResult | null; running: boolean; lang: CodeLang }) {
  const s = useS();
  const { num } = useI18n();
  const r = res?.runs[0];
  return (
    <section className="cd-out" aria-live="polite" aria-label={s.output}>
      <h3 className="cd-out-h">{s.output}</h3>
      {running ? <p className="muted small">{s.running}</p>
        : res?.timeout ? <p className="cd-err-msg">{(lang === "sql" ? s.timeoutSql : s.timeout)(num(TIME_LIMIT / 1000))}</p>
        : res?.stopped ? <p className="muted small">{s.stopped}</p>
        : res?.failed ? <pre className="cd-err" dir="ltr">{res.failed}</pre>
        : r ? <>
          {lang === "sql" && r.table ? <Table table={r.table} /> : r.out ? <pre className="cd-out-text" dir="ltr" translate="no">{r.out}</pre> : !r.error && <p className="muted small">{s.nothing}</p>}
          {r.error && <>{r.line && <p className="cd-err-msg">{s.errorLine(num(r.line))}</p>}<pre className="cd-err" dir="ltr" translate="no">{r.error}</pre></>}
        </> : null}
    </section>
  );
}

function Table({ table }: { table: NonNullable<RunOne["table"]> }) {
  const s = useS();
  const { num } = useI18n();
  const MAX = 50, rows = table.values.slice(0, MAX), count = table.rowCount ?? table.values.length; // a run sends 200 at most
  return (
    <div className="cd-table-wrap" dir="ltr">
      <table className="cd-table">
        <thead><tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} dir="auto">{v === null ? "NULL" : String(v)}</td>)}</tr>)}</tbody>
      </table>
      <p className="muted small" dir="auto">{s.rows(num(count))}{count > MAX ? ` (${s.more(num(count - MAX))})` : ""}</p>
    </div>
  );
}

function Tests({ runs, step }: { runs: RunOne[]; step: CodeStep }) {
  const s = useS();
  const { L, num } = useI18n();
  return (
    <section className="cd-tests" aria-label={s.tests}>
      <h3 className="cd-out-h">{s.tests}</h3>
      <ul>{runs.map((r, i) => {
        const test = step.tests?.[i];
        return <li key={i} className={r.passed ? "is-pass" : "is-fail"}>
          <strong>{s.test(num(i + 1))}: {r.passed ? s.pass : s.fail}</strong>
          {test?.input?.length ? <span className="muted small" dir="ltr"> ({test.input.join(", ")})</span> : null}
          {!r.passed && (r.message || test?.hint) && <span className="cd-test-why">{test?.hint ? L(test.hint) : r.message}</span>}
        </li>;
      })}</ul>
    </section>
  );
}

/* ---------- Put the lines in order ---------- */

function Parsons({ step, header, result, onAnswer, attempt }: ViewProps<ParsonsStep>) {
  const s = useS();
  const pool = useMemo(() => shuffled([...step.lines, ...(step.distractors ?? [])].map((text, id) => ({ id, text: text.trim() })), `${step.id}-${attempt}`), [step, attempt]);
  const [placed, setPlaced] = useState<{ id: number; indent: number }[]>([]);
  const py = step.lang === "python";
  const update = (next: typeof placed) => {
    setPlaced(next);
    onAnswer(next.length === step.lines.length ? { kind: "parsons", lines: next.map((x) => " ".repeat(4 * x.indent) + pool.find((l) => l.id === x.id)!.text) } : null);
  };
  const checked = result !== null;
  // A picked line hands the focus to the next line in the pool (to the pool's heading once it is empty), a row taken
  // out to the row now in its place, and an indent button that can go no further to the other one.
  const { root, keep } = useKeepFocus();
  const rowTool = (i: number, tool: string): FindFocus => (r) => r.querySelectorAll(".cd-row")[i]?.querySelector(`[data-tool=${tool}]`);
  const lineOk = (i: number) => {
    const x = placed[i], want = step.lines[i];
    if (!x || want === undefined) return false;
    const text = pool.find((l) => l.id === x.id)!.text;
    return text === want.trim() && (!py || x.indent * 4 === want.length - want.trimStart().length);
  };
  return (
    <div className="stack cd-step" ref={root}>
      {header}
      <p className="muted small">{s.tapLines}</p>
      <section aria-label={s.program}>
        <h3 className="cd-out-h" tabIndex={-1} data-focus="program">{s.program}</h3>
        <ol className="cd-parsons" dir="ltr">
          {placed.length === 0 && <li className="cd-empty">{s.start}</li>}
          {placed.map((x, i) => (
            <li key={x.id} className={checked ? (lineOk(i) ? "cd-row is-pass" : "cd-row is-fail") : "cd-row"}>
              <code className="cd-row-code" style={{ paddingInlineStart: `${x.indent * 1.5}em` }} translate="no"><CodeLine text={pool.find((l) => l.id === x.id)!.text} lang={step.lang} /></code>
              {!checked && <span className="cd-row-tools">
                {py && <button type="button" className="cd-tool" data-tool="outdent" aria-label={s.outdent} disabled={!x.indent}
                  onClick={(e) => { if (x.indent === 1) keep(e, rowTool(i, "indent")); update(placed.map((y, j) => (j === i ? { ...y, indent: y.indent - 1 } : y))); }}>⇤</button>}
                {py && <button type="button" className="cd-tool" data-tool="indent" aria-label={s.indent} disabled={x.indent >= 4}
                  onClick={(e) => { if (x.indent === 3) keep(e, rowTool(i, "outdent")); update(placed.map((y, j) => (j === i ? { ...y, indent: y.indent + 1 } : y))); }}>⇥</button>}
                <button type="button" className="cd-tool" data-tool="remove" aria-label={s.remove}
                  onClick={(e) => { keep(e, (r) => rowTool(Math.min(i, placed.length - 2), "remove")(r) ?? r.querySelector("[data-focus=program]")); update(placed.filter((_, j) => j !== i)); }}>×</button>
              </span>}
            </li>
          ))}
        </ol>
      </section>
      {!checked && <section aria-label={s.pool}>
        <h3 className="cd-out-h" tabIndex={-1} data-focus="pool">{s.pool}</h3>
        <div className="cd-pool" dir="ltr">
          {pool.filter((l) => !placed.some((x) => x.id === l.id)).map((l, k, left) => (
            <button key={l.id} type="button" className="cd-line-btn" translate="no"
              onClick={(e) => {
                keep(e, (r) => r.querySelectorAll(".cd-pool > button")[Math.min(k, left.length - 2)] ?? r.querySelector("[data-focus=pool]"));
                update([...placed, { id: l.id, indent: py && placed.length ? placed[placed.length - 1].indent : 0 }]);
              }}><CodeLine text={l.text} lang={step.lang} /></button>
          ))}
        </div>
      </section>}
      {checked && !result && <><p className="small">{s.rightOrder}</p><CodeBlock text={step.lines.join("\n")} lang={step.lang} /></>}
    </div>
  );
}

/* ---------- Fill the gaps ---------- */

function Fill({ step, header, result, onAnswer, attempt }: ViewProps<CodeFillStep>) {
  const s = useS();
  const { num } = useI18n();
  const bank = useMemo(() => shuffled([...new Set([...step.answers, ...(step.distractors ?? [])])], `${step.id}-${attempt}`), [step, attempt]);
  const n = step.answers.length;
  const [tokens, setTokens] = useState<Record<number, string>>({});
  const [sel, setSel] = useState(0);
  const checked = result !== null;
  const update = (next: Record<number, string>) => { setTokens(next); onAnswer(Object.keys(next).length === n ? { kind: "codefill", tokens: next } : null); };
  const put = (tok: string) => {
    const next = { ...tokens, [sel]: tok };
    update(next);
    const empty = Array.from({ length: n }, (_, i) => i).find((i) => !(i in next));
    if (empty !== undefined) setSel(empty);
  };
  // The code, split into lines so each part keeps its colouring; gaps are buttons.
  const lines: ReactNode[][] = [[]];
  step.code.forEach((part, k) => {
    if (typeof part === "string") part.split("\n").forEach((seg, j) => { if (j) lines.push([]); if (seg) lines[lines.length - 1].push(<CodeLine key={`${k}-${j}`} text={seg} lang={step.lang} />); });
    else {
      const b = part.blank, tok = tokens[b], ok = checked && tok === step.answers[b];
      lines[lines.length - 1].push(
        <button key={`g${k}`} type="button" disabled={checked}
          className={`cd-gap${sel === b && !checked ? " is-sel" : ""}${checked ? (ok ? " is-pass" : " is-fail") : ""}`}
          aria-label={`${s.gap(num(b + 1))}: ${tok ?? s.empty}`}
          onClick={() => { if (tok !== undefined && sel === b) { const next = { ...tokens }; delete next[b]; update(next); } setSel(b); }}>
          {checked && !ok ? step.answers[b] : tok ?? "    "}
        </button>);
    }
  });
  return (
    <div className="stack cd-step">
      {header}
      <p className="muted small">{s.tapGap}</p>
      <pre className="code-block cd-fill" dir="ltr" translate="no"><code>{lines.map((l, i) => <span key={i} className="cb-line">{l}</span>)}</code></pre>
      {!checked && <div className="cd-pool" dir="ltr" role="group" aria-label={s.words}>
        {bank.map((tok) => <button key={tok} type="button" className="cd-token" translate="no" onClick={() => put(tok)}>{tok}</button>)}
      </div>}
    </div>
  );
}

/* ---------- Find the bug ---------- */

function Bug({ step, header, result, onAnswer }: ViewProps<BugStep>) {
  const s = useS();
  const { num } = useI18n();
  const [sel, setSel] = useState<number>();
  const checked = result !== null;
  const lines = step.code.replace(/\n$/, "").split("\n");
  return (
    <div className="stack cd-step">
      {header}
      <p className="muted small">{s.tapBug}</p>
      <div className="cd-bug" role="radiogroup" aria-label={s.tapBug} dir="ltr">
        {lines.map((line, i) => {
          const n = i + 1, state = checked ? (n === step.line ? " is-pass" : n === sel ? " is-fail" : "") : n === sel ? " is-sel" : "";
          return <button key={i} type="button" role="radio" aria-checked={sel === n} aria-label={`${s.line(num(n))}: ${line.trim()}`} disabled={checked}
            className={`cd-bug-line${state}`} onClick={() => { setSel(n); onAnswer({ kind: "bug", line: n }); }}>
            <span className="cb-n" aria-hidden>{n}</span><code translate="no"><CodeLine text={line} lang={step.lang} /></code>
          </button>;
        })}
      </div>
      {checked && <><p className="small">{s.fix}</p><CodeBlock text={step.fix} lang={step.lang} /></>}
    </div>
  );
}

/* ---------- The robot ---------- */

const CELL = 40;
const ARROW: Record<RobotCommand, string> = { forward: "M12 19V5M6 11l6-6 6 6", left: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", right: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" };
const CmdIcon = ({ cmd }: { cmd: RobotCommand }) => (
  <svg className="cd-cmd-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d={ARROW[cmd]} /></svg>
);

function Blocks({ step, header, result, onAnswer }: ViewProps<BlocksStep>) {
  const s = useS();
  const { num } = useI18n();
  const w = step.world;
  const [program, setProgram] = useState<RobotBlock[]>([]);
  const [shown, setShown] = useState(0); // how far along the path the robot is drawn
  const [walking, setWalking] = useState(false);
  const [outcome, setOutcome] = useState<RobotOutcome | null>(null);
  const run = useMemo(() => runRobot(w, program), [w, program]);
  const checked = result !== null;
  const update = (next: RobotBlock[]) => { setProgram(next); setShown(0); setOutcome(null); setWalking(false); onAnswer(next.length ? { kind: "blocks", program: next } : null); };
  // The walk: one square every 350 ms, then it stops by itself; at once when the phone asks for less motion.
  useEffect(() => {
    if (!walking) return;
    if (shown >= run.path.length - 1 || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(run.path.length - 1); setWalking(false); setOutcome(run.outcome); return; }
    const id = setTimeout(() => setShown(shown + 1), 350);
    return () => clearTimeout(id);
  }, [walking, shown, run]);
  const pose = run.path[Math.min(shown, run.path.length - 1)];
  const label: Record<RobotCommand, string> = { forward: s.forward, left: s.left, right: s.right };
  const full = program.length >= step.maxBlocks;
  const rot = { N: 0, E: 90, S: 180, W: 270 }[pose.dir];
  // Run hands the focus back once the walk ends; the card that fills the program hands it to Run, a card taken out to
  // the next card's ×, and Clear to the commands.
  const { root, keep } = useKeepFocus();
  const toRun: FindFocus = (r) => r.querySelector(".cd-run-robot");
  const toPalette: FindFocus = (r) => r.querySelector(".cd-palette button:not(:disabled)");
  return (
    <div className="stack cd-step" ref={root}>
      {header}
      <svg className="cd-world" viewBox={`0 0 ${w.cols * CELL} ${w.rows * CELL}`} role="img" aria-label={s.grid}>
        {Array.from({ length: w.rows }, (_, y) => Array.from({ length: w.cols }, (_, x) => (
          <rect key={`${x},${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} className={(w.walls ?? []).some((p) => p.x === x && p.y === y) ? "cd-wall" : "cd-cell"} />
        )))}
        <g transform={`translate(${w.goal.x * CELL + CELL / 2} ${w.goal.y * CELL + CELL / 2})`} className="cd-goal"><circle r={13} /><circle r={6} className="cd-goal-in" /></g>
        {run.path.slice(1, shown + 1).map((p, i) => <circle key={i} cx={p.x * CELL + CELL / 2} cy={p.y * CELL + CELL / 2} r={3} className="cd-trail" />)}
        <g transform={`translate(${pose.x * CELL + CELL / 2} ${pose.y * CELL + CELL / 2}) rotate(${rot})`} className="cd-robot">
          <rect x={-12} y={-12} width={24} height={24} rx={6} /><path d="M-6 3L0 -8L6 3Z" className="cd-robot-face" />
        </g>
      </svg>
      {outcome && <p className={outcome === "goal" ? "cd-outcome is-pass" : "cd-outcome is-fail"} role="status">{s.outcome[outcome]}</p>}
      <section aria-label={s.program2}>
        <h3 className="cd-out-h">{s.program2} <span className="muted small">{s.cards(num(program.length), num(step.maxBlocks))}</span></h3>
        <ol className="cd-program">
          {program.map((b, i) => (
            <li key={i}>
              <button type="button" className="cd-card" disabled={checked} aria-label={`${label[b.cmd]} ×${num(b.times)}`}
                onClick={() => update(program.map((x, j) => (j === i ? { ...x, times: (x.times % MAX_TIMES) + 1 } : x)))}>
                <CmdIcon cmd={b.cmd} /><span>{label[b.cmd]}</span>{b.times > 1 && <span className="cd-times">×{num(b.times)}</span>}
              </button>
              {!checked && <button type="button" className="cd-tool" data-tool="remove" aria-label={s.remove}
                onClick={(e) => { keep(e, (r) => r.querySelectorAll(".cd-program [data-tool=remove]")[Math.min(i, program.length - 2)] ?? toPalette(r)); update(program.filter((_, j) => j !== i)); }}>×</button>}
            </li>
          ))}
        </ol>
        {program.length > 0 && !checked && <p className="muted small">{s.tapCard}</p>}
      </section>
      {!checked && <section aria-label={s.palette}>
        <h3 className="cd-out-h">{s.palette}</h3>
        <div className="cd-palette">
          {step.commands.map((cmd) => <button key={cmd} type="button" className="cd-card is-new" disabled={full}
            onClick={(e) => { if (program.length + 1 >= step.maxBlocks) keep(e, toRun); update([...program, { cmd, times: 1 }]); }}><CmdIcon cmd={cmd} /><span>{label[cmd]}</span></button>)}
        </div>
        {full && <p className="muted small">{s.full}</p>}
      </section>}
      <div className="row-gap">
        <Button size="sm" icon="play" className="cd-run-robot" disabled={!program.length || walking} onClick={(e) => { keep(e, toRun); setShown(0); setOutcome(null); setWalking(true); }}>{s.runRobot}</Button>
        {!checked && <Button size="sm" variant="ghost" icon="undo" disabled={!program.length} onClick={(e) => { keep(e, toPalette); update([]); }}>{s.clear}</Button>}
      </div>
    </div>
  );
}
