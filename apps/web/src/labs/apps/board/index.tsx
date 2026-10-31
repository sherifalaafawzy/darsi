import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { sandbox } from "../../../code/sandbox";
import type { RunOne } from "../../../code/harness";
import { RUNTIMES } from "../../../content/runtimes";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { EXAMPLES, PIN, SECONDS, SPEED, boardRun, endOf, freqAt, levelAt, lightRaw, tempRaw, type ExampleId, type Press } from "./model";

const C = (t: string) => <code className="lb-code-inline" dir="ltr">{t}</code>;

const S = {
  en: {
    intro: "A Raspberry Pi Pico is a small, cheap board that runs MicroPython. Parts are wired to its pins, and the machine module reads and drives them. This one is drawn on your phone; the same code runs on a real board.",
    example: "Example", ex: { blink: "Blink", night: "Night light", alarm: "Heat alarm" } as Record<ExampleId, string>,
    board: "The board", editor: "The program (you can change it)", run: "Run on the board", stop: "Stop", restore: "Back to the example", again: "Play again",
    loading: (mb: string) => `Getting Python ready (${mb} MB, once)…`, offline: (mb: string) => `Python needs one download (${mb} MB). Connect once, then it works offline too.`,
    timeout: <>Stopped after 3 seconds. On the board, time only moves when the program sleeps: does your loop call {C("time.sleep()")}?</> as ReactNode,
    failed: "Python could not run this.", errorOn: (n: string) => `Error on line ${n}`,
    deg: (n: string) => `${n} °C`, light: "Light sensor (GP26)", temp: "Temperature sensor (GP27)", button: "Button (GP14)",
    never: "Not pressed", at3: "Pressed at 3 s", held: "Held down",
    reads: (l: string, t: string) => <>{C("read_u16()")} gives {l} for the light and {t} for the temperature (out of 65,535).</>,
    clock: (t: string, total: string) => `Board time: ${t} s of ${total} s`, speed: "Played back twice as fast.",
    live: "Move a slider or the button: the program runs again by itself.",
    parts: "What the parts are doing", led: "LED", buzzer: "Buzzer", btn: "Button", on: "on", off: "off", dim: (p: string) => `on at ${p}`,
    quiet: "quiet", hz: (n: string) => `${n} Hz`, pressed: "pressed", notPressed: "not pressed", printed: "Printed",
    try1: "Run “Night light” and slide the light down below a third: the LED comes on. Where in the code is that decided?",
    try2: "Run “Heat alarm” at 40 °C, then choose “Pressed at 3 s”: the buzzer stops at second 3 and stays quiet.",
    try3: <>In “Blink”, change {C("time.sleep(0.5)")} to {C("time.sleep(0.1)")} and run it again: faster blinking.</> as ReactNode,
    takeaway: "Most devices around us are a loop like these: read the sensors, decide, set the outputs, sleep, repeat. A few lines of MicroPython on a board that costs a few dollars can run a night light, an alarm or a watering system.",
  },
  ar: {
    intro: "لوحة Raspberry Pi Pico لوحة صغيرة ورخيصة تشغّل MicroPython. تُوصَل القطع بمنافذها، وتقرأ وحدة machine هذه القطع وتتحكّم فيها. وهذه اللوحة مرسومة على هاتفك، والكود نفسه يعمل على لوحة حقيقية.",
    example: "المثال", ex: { blink: "وميض", night: "مصباح ليلي", alarm: "إنذار الحرارة" } as Record<ExampleId, string>,
    board: "اللوحة", editor: "البرنامج (يمكنك تغييره)", run: "شغّل على اللوحة", stop: "أوقف", restore: "عُد إلى المثال", again: "أعد العرض",
    loading: (mb: string) => `جارٍ تجهيز Python (${mb} ميغابايت، مرة واحدة)…`, offline: (mb: string) => `تحتاج Python إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم تعمل دون اتصال أيضًا.`,
    timeout: <>توقّف بعد ٣ ثوانٍ. فعلى اللوحة لا يتقدّم الوقت إلا حين ينام البرنامج: هل تستدعي حلقتك {C("time.sleep()")}؟</> as ReactNode,
    failed: "لم تستطع Python تشغيل هذا.", errorOn: (n: string) => `خطأ في السطر ${n}`,
    deg: (n: string) => `${n}°م`, light: "مستشعر الضوء (GP26)", temp: "مستشعر الحرارة (GP27)", button: "الزر (GP14)",
    never: "غير مضغوط", at3: "يُضغط عند الثانية ٣", held: "مضغوط باستمرار",
    reads: (l: string, t: string) => <>تعطي {C("read_u16()")} القيمة {l} للضوء و{t} للحرارة (من أصل ٦٥٥٣٥).</>,
    clock: (t: string, total: string) => `وقت اللوحة: ${t} ث من ${total} ث`, speed: "يُعرض بضعف السرعة.",
    live: "حرّك أحد المنزلقات أو غيّر الزر: يعمل البرنامج من جديد وحده.",
    parts: "ماذا تفعل القطع", led: "مصباح LED", buzzer: "الطنّان", btn: "الزر", on: "مضاء", off: "مطفأ", dim: (p: string) => `مضاء بنسبة ${p}`,
    quiet: "صامت", hz: (n: string) => `${n} هرتز`, pressed: "مضغوط", notPressed: "غير مضغوط", printed: "ما طُبع",
    try1: "شغّل «مصباح ليلي» وأنزل الضوء إلى أقل من الثلث: يضيء المصباح. أين يُتّخذ هذا القرار في الكود؟",
    try2: "شغّل «إنذار الحرارة» عند ٤٠°م، ثم اختر «يُضغط عند الثانية ٣»: يتوقّف الطنّان عند الثانية ٣ ويبقى صامتًا.",
    try3: <>في «وميض»، غيّر {C("time.sleep(0.5)")} إلى {C("time.sleep(0.1)")} وشغّله من جديد: وميض أسرع.</> as ReactNode,
    takeaway: "معظم الأجهزة من حولنا حلقة كهذه: اقرأ المستشعرات، وقرّر، واضبط المخرجات، ونَم قليلًا، ثم كرّر. وبضعة أسطر من MicroPython على لوحة ثمنها بضعة دولارات تكفي لتشغيل مصباح ليلي أو إنذار أو نظام ريّ.",
  },
};

/** The program as editable text: line numbers (the error's line marked), a symbol row, and Tab to indent. */
function Editor({ value, onChange, label, errorLine }: { value: string; onChange: (v: string) => void; label: string; errorLine?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = value.split("\n").length;
  const insert = (text: string) => { const el = ref.current; if (!el) return; el.focus(); el.setRangeText(text, el.selectionStart, el.selectionEnd, "end"); onChange(el.value); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); insert("    "); } };
  return (
    <div className="lb-code">
      <div className="lb-code-box" dir="ltr">
        <div className="lb-code-gutter" aria-hidden>{Array.from({ length: lines }, (_, i) => <span key={i} className={errorLine === i + 1 ? "is-err" : undefined}>{i + 1}</span>)}</div>
        <textarea ref={ref} className="lb-code-text" value={value} rows={Math.max(5, lines)} dir="ltr" wrap="off" translate="no" spellCheck={false}
          autoCapitalize="off" autoCorrect="off" autoComplete="off" aria-label={label} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} />
      </div>
      <div className="lb-code-keys" dir="ltr">
        {["⇥", ":", "=", "(", ")", ".", "<", ">"].map((k) => (
          <button key={k} type="button" className="lb-code-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k === "⇥" ? "    " : k)} aria-label={k === "⇥" ? "Tab" : k}>{k}</button>
        ))}
      </div>
    </div>
  );
}

/** The board as a drawing (always left to right, like a wiring diagram): parts on the left and right, wires to the pins. */
function Drawing({ led, buzz, pressed, light, label }: { led: number; buzz: boolean; pressed: boolean; light: number; label: string }) {
  const pin = (x: number, y: number, name: string, side: "l" | "r") => (
    <g key={name}>
      <circle cx={x} cy={y} r={4} className="lb-board-pad" />
      <text x={side === "l" ? x + 9 : x - 9} y={y + 4} textAnchor={side === "l" ? "start" : "end"} className="lb-board-pin">{name}</text>
    </g>
  );
  return (
    <svg className="lb-board-svg" viewBox="0 0 300 200" role="img" aria-label={label}>
      {[56, 100, 144].map((y) => <line key={y} x1={62} y1={y} x2={96} y2={y} className="lb-board-wire" />)}
      {[70, 130].map((y) => <line key={y} x1={204} y1={y} x2={240} y2={y} className="lb-board-wire" />)}
      <rect x={136} y={6} width={28} height={14} rx={3} className="lb-board-usb" />
      <rect x={96} y={14} width={108} height={180} rx={8} className="lb-board-pcb" />
      <text x={150} y={42} textAnchor="middle" className="lb-board-name">Pico</text>
      <rect x={142} y={152} width={34} height={30} rx={3} className="lb-board-chip" />
      {pin(96, 56, "GP14", "l")}{pin(96, 100, "GP15", "l")}{pin(96, 144, "GP16", "l")}
      {pin(204, 70, "GP26", "r")}{pin(204, 130, "GP27", "r")}
      {/* Button, LED, buzzer */}
      <rect x={31} y={40} width={30} height={32} rx={6} className={pressed ? "lb-board-btn is-on" : "lb-board-btn"} />
      <circle cx={46} cy={56} r={8} className="lb-board-cap" />
      {led > 0 && <circle cx={46} cy={100} r={19} className="lb-board-glow" style={{ opacity: 0.25 + 0.5 * led }} />}
      <circle cx={46} cy={100} r={13} className={led > 0 ? "lb-board-led is-on" : "lb-board-led"} style={led > 0 && led < 1 ? { opacity: 0.4 + 0.6 * led } : undefined} />
      <circle cx={46} cy={144} r={14} className={buzz ? "lb-board-buzz is-on" : "lb-board-buzz"} />
      <text x={46} y={149} textAnchor="middle" className="lb-board-note">♪</text>
      {buzz && <path d="M24 134a14 14 0 0 0 0 20M16 128a22 22 0 0 0 0 32" className="lb-board-wave" />}
      {/* Light and temperature sensors */}
      <circle cx={256} cy={70} r={14} className="lb-board-ldr" style={{ opacity: 0.35 + 0.65 * (light / 100) }} />
      <circle cx={256} cy={70} r={14} className="lb-board-ldr-ring" />
      <rect x={250} y={112} width={12} height={28} rx={6} className="lb-board-therm" />
      <circle cx={256} cy={144} r={8} className="lb-board-bulb" />
    </svg>
  );
}

export default function Board({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [ex, setEx] = useState<ExampleId>("night");
  const [code, setCode] = useState(EXAMPLES.night);
  const [light, setLight] = useState(70);
  const [temp, setTemp] = useState(25);
  const [press, setPress] = useState<Press>("never");
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [run, setRun] = useState<RunOne | null>(null);
  const [note, setNote] = useState<ReactNode>(null);
  const [ran, setRan] = useState(new Set<ExampleId>());
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const busy = useRef(false);
  busy.current = state === "running";
  useEffect(() => () => { if (busy.current) sandbox().stop(); }, []);
  useEffect(() => { if (ran.size >= 2) onDone?.(); }, [ran.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    const sb = sandbox();
    setNote(null);
    try {
      setState("loading");
      await sb.prepare("python");
      setState("running");
      const r = await sb.run({ lang: "python", code, board: boardRun(light, temp, press) });
      setState("idle");
      if (r.stopped) return;
      if (r.timeout) { setNote(s.timeout); setRun(null); return; }
      if (r.failed) { setNote(s.failed); setRun(null); return; }
      setRun(r.runs[0] ?? null); setT(0); setPlaying(true);
      setRan((x) => new Set(x).add(ex));
    } catch (e) {
      const offline = (e as Error).message === "offline";
      setState(offline ? "offline" : "idle");
      if (!offline) setNote(s.failed);
    }
  };
  // After a first run, changing a sensor or the button runs the program again by itself (once the learner stops moving).
  const goRef = useRef(go);
  goRef.current = go;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!run) return;
    const id = setTimeout(() => { if (!busy.current) void goRef.current(); }, 400);
    return () => clearTimeout(id);
  }, [light, temp, press]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback on board time, twice as fast as real time, ten redraws a second; it stops by itself.
  const report = run?.board;
  const end = report ? endOf(report) : 0;
  const startAt = useRef(0);
  useEffect(() => {
    if (!playing || !report) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setT(end); setPlaying(false); return; }
    startAt.current = performance.now();
    const id = setInterval(() => {
      const v = Math.min(end, (performance.now() - startAt.current) * SPEED);
      setT(v);
      if (v >= end || document.hidden) { clearInterval(id); setPlaying(false); }
    }, 100);
    return () => clearInterval(id);
  }, [playing, report, end]);

  const pick = (id: ExampleId) => {
    setEx(id); setCode(EXAMPLES[id]); setRun(null); setNote(null); setPlaying(false); setT(0);
    if (id === "alarm") setTemp(40); else if (id === "night") setLight(70);
  };
  const ev = report?.events ?? [];
  const led = levelAt(ev, PIN.led, t), buzz = levelAt(ev, PIN.buzzer, t) > 0, hz = freqAt(ev, PIN.buzzer, t);
  const pressed = press === "held" || (press === "at3" && Math.floor(t / 1000) === 3 && !!report);
  const mb = num(RUNTIMES.python.sizeMB);
  const secs = (ms: number) => num(Math.round(ms / 100) / 10);
  const pct = (v: number) => num(v / 100, { style: "percent" });

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { pick("night"); setLight(70); setTemp(25); setPress("never"); }}>
      <Segmented label={s.example} value={ex} onChange={pick} options={(["blink", "night", "alarm"] as const).map((id) => [id, s.ex[id]] as const)} />
      <div className="lb-two">
        <div className="stack">
          <Drawing led={led} buzz={buzz} pressed={pressed} light={light} label={s.board} />
          <ul className="lb-board-parts" aria-label={s.parts}>
            <li><span className={led > 0 ? "lb-board-dot is-led" : "lb-board-dot"} aria-hidden /><span>{s.led} <bdi className="lb-board-ref">GP15</bdi></span><strong>{led <= 0 ? s.off : led < 1 ? s.dim(pct(led * 100)) : s.on}</strong></li>
            <li><span className={buzz ? "lb-board-dot is-buzz" : "lb-board-dot"} aria-hidden /><span>{s.buzzer} <bdi className="lb-board-ref">GP16</bdi></span><strong>{buzz ? s.hz(num(hz)) : s.quiet}</strong></li>
            <li><span className={pressed ? "lb-board-dot is-btn" : "lb-board-dot"} aria-hidden /><span>{s.btn} <bdi className="lb-board-ref">GP14</bdi></span><strong>{pressed ? s.pressed : s.notPressed}</strong></li>
          </ul>
          {report && (
            <div className="lb-row">
              <span className="lb-note" role="status">{s.clock(secs(t), num(SECONDS))}</span>
              {!playing && <Button size="sm" variant="ghost" icon="play" onClick={() => { setT(0); setPlaying(true); }}>{s.again}</Button>}
            </div>
          )}
          {report && <p className="lb-note">{s.speed} {s.live}</p>}
        </div>
        <div className="stack">
          <Slider label={s.light} value={light} min={0} max={100} step={5} onChange={setLight} format={pct} />
          <Slider label={s.temp} value={temp} min={0} max={50} onChange={setTemp} format={(v) => s.deg(num(v))} />
          <Segmented label={s.button} value={press} onChange={setPress} options={[["never", s.never], ["at3", s.at3], ["held", s.held]]} />
          <p className="lb-note">{s.reads(num(lightRaw(light)), num(tempRaw(temp)))}</p>
        </div>
      </div>
      <Editor value={code} onChange={setCode} label={s.editor} errorLine={run?.line} />
      <div className="lb-runbar">
        {state === "running"
          ? <Button size="sm" variant="secondary" icon="pause" onClick={() => sandbox().stop()}>{s.stop}</Button>
          : <Button size="sm" icon="play" loading={state === "loading"} onClick={go}>{s.run}</Button>}
        <Button size="sm" variant="ghost" icon="undo" disabled={code === EXAMPLES[ex]} onClick={() => setCode(EXAMPLES[ex])}>{s.restore}</Button>
      </div>
      {state === "loading" && <p className="lb-note">{s.loading(mb)}</p>}
      {state === "offline" && <p className="notice">{s.offline(mb)}</p>}
      {note && <p className="lb-verdict is-warn" role="alert">{note}</p>}
      {run && (run.out || run.error) && (
        <section className="lb-code-out" aria-label={s.printed}>
          {run.out && <><h3 className="lb-board-h">{s.printed}</h3><pre className="lb-code-print" dir="ltr" translate="no">{run.out}</pre></>}
          {run.error && <><p className="lb-code-err-h">{s.errorOn(num(run.line ?? 0))}</p><pre className="lb-code-err" dir="ltr" translate="no">{run.error}</pre></>}
        </section>
      )}
    </LabShell>
  );
}
