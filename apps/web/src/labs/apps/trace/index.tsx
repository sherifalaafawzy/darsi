import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { CodeBlock } from "../../../code/CodeBlock";
import { sandbox } from "../../../code/sandbox";
import type { RunOne } from "../../../code/harness";
import { RUNTIMES } from "../../../content/runtimes";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { EXAMPLES, PACE_MS, changed, names, stackAt, type ExampleId } from "./model";

const C = (t: string) => <code className="lb-code-inline" dir="ltr">{t}</code>;

const S = {
  en: {
    intro: "A computer runs a program one line at a time, and each line can change the values stored in variables. Record a run, then step through it.",
    example: "Example", ex: { loop: "A loop that adds", ifelse: "if and else", function: "A function" } as Record<ExampleId, string>,
    editor: "The program (you can change it)", record: "Run and record", restore: "Back to the example", edit: "Change the code",
    loading: (mb: string) => `Getting Python ready (${mb} MB, once)…`, offline: (mb: string) => `Python needs one download (${mb} MB). Connect once, then it works offline too.`,
    timeout: "Stopped after 3 seconds. Does a loop never end?", failed: "Python could not run this.",
    step: (k: string, total: string) => `Step ${k} of ${total}`, nextLine: (n: string) => `Next to run: line ${n}`, finished: "The program has finished.",
    back: "Back", next: "Next", play: "Play", pause: "Pause", scrub: "Jump to a step",
    vars: "Variables", name: "Name", value: "Value", was: (v: string) => `was ${v}`, none: "No variables yet.",
    inside: (fn: ReactNode, line: string) => <>Inside {fn}, called from line {line}.</>,
    scope: (params: ReactNode) => <>Its own variables ({params}) live only inside it while it runs; the list shows the program's.</>,
    printed: "Printed", nothing: "Nothing printed.", error: (n: string) => `Stopped with an error on line ${n}:`, cut: "Only the first 300 steps were recorded.",
    try1: "Run “A loop that adds”. Before each Next, say what total will become: the variable that just changed is highlighted.",
    try2: "In “if and else”, follow m: for 7 the program jumps over the pass lines to the else.",
    try3: <>Change {C("range(1, 5)")} to {C("range(1, 11)")}, run it again and jump to the end: total is 55.</> as ReactNode,
    takeaway: "Reading a program the way the computer does, line by line, keeping track of every variable, is how programmers predict what code will do and find where it goes wrong.",
  },
  ar: {
    intro: "ينفّذ الحاسوب البرنامج سطرًا سطرًا، وكل سطر قد يغيّر القيم المخزّنة في المتغيّرات. سجّل تشغيلًا، ثم تتبّعه خطوة بخطوة.",
    example: "المثال", ex: { loop: "حلقة تجمع", ifelse: "if وelse", function: "دالة" } as Record<ExampleId, string>,
    editor: "البرنامج (يمكنك تغييره)", record: "شغّل وسجّل", restore: "عُد إلى المثال", edit: "غيّر الكود",
    loading: (mb: string) => `جارٍ تجهيز Python (${mb} ميغابايت، مرة واحدة)…`, offline: (mb: string) => `تحتاج Python إلى تنزيل واحد (${mb} ميغابايت). اتصل بالإنترنت مرة واحدة، ثم تعمل دون اتصال أيضًا.`,
    timeout: "توقّف بعد ٣ ثوانٍ. هل توجد حلقة لا تنتهي؟", failed: "لم تستطع Python تشغيل هذا.",
    step: (k: string, total: string) => `الخطوة ${k} من ${total}`, nextLine: (n: string) => `التالي: السطر ${n}`, finished: "انتهى البرنامج.",
    back: "رجوع", next: "التالي", play: "شغّل", pause: "أوقف مؤقتًا", scrub: "انتقل إلى خطوة",
    vars: "المتغيّرات", name: "الاسم", value: "القيمة", was: (v: string) => `كانت ${v}`, none: "لا متغيّرات بعد.",
    inside: (fn: ReactNode, line: string) => <>داخل الدالة {fn}، وقد استُدعيت من السطر {line}.</>,
    scope: (params: ReactNode) => <>متغيّراتها الخاصة ({params}) لا توجد إلا داخلها أثناء تنفيذها، والقائمة تعرض متغيّرات البرنامج.</>,
    printed: "ما طُبع", nothing: "لم يُطبع شيء.", error: (n: string) => `توقّف بسبب خطأ في السطر ${n}:`, cut: "سُجّلت أول ٣٠٠ خطوة فقط.",
    try1: "شغّل «حلقة تجمع». وقبل كل ضغطة على «التالي»، قل ماذا ستصير قيمة total: المتغيّر الذي تغيّر للتو يظهر مميّزًا.",
    try2: "في «if وelse»، تتبّع m: مع ٧ يقفز البرنامج فوق أسطر النجاح إلى else.",
    try3: <>غيّر {C("range(1, 5)")} إلى {C("range(1, 11)")}، وشغّله من جديد، وانتقل إلى النهاية: قيمة total هي ٥٥.</> as ReactNode,
    takeaway: "قراءة البرنامج كما يقرؤه الحاسوب، سطرًا سطرًا مع متابعة كل متغيّر، هي الطريقة التي يتوقّع بها المبرمجون ما سيفعله الكود ويجدون بها موضع الخطأ.",
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
        {["⇥", ":", "=", "(", ")", "\"", "+"].map((k) => (
          <button key={k} type="button" className="lb-code-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k === "⇥" ? "    " : k)} aria-label={k === "⇥" ? "Tab" : k}>{k}</button>
        ))}
      </div>
    </div>
  );
}

export default function Trace({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [ex, setEx] = useState<ExampleId>("loop");
  const [code, setCode] = useState(EXAMPLES.loop);
  const [state, setState] = useState<"idle" | "loading" | "running" | "offline">("idle");
  const [run, setRun] = useState<RunOne | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ends, setEnds] = useState(0);
  const busy = useRef(false);
  busy.current = state === "running";
  useEffect(() => () => { if (busy.current) sandbox().stop(); }, []);

  const trace = run?.trace ?? [];
  const stepping = !!run && trace.length > 0;
  const last = trace.length; // the step after the last line: the program has finished
  useEffect(() => {
    if (!playing) return;
    if (k >= last) { setPlaying(false); return; }
    const id = setTimeout(() => { if (document.hidden) setPlaying(false); else setK(k + 1); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : PACE_MS);
    return () => clearTimeout(id);
  }, [playing, k, last]);
  useEffect(() => { if (stepping && k === last) setEnds((e) => e + 1); }, [stepping && k === last]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ends >= 2) onDone?.(); }, [ends >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: ExampleId) => { setEx(id); setCode(EXAMPLES[id]); setRun(null); setNote(null); setK(0); setPlaying(false); };
  const record = async () => {
    const sb = sandbox();
    setNote(null);
    try {
      setState("loading");
      await sb.prepare("python");
      setState("running");
      const r = await sb.run({ lang: "python", code, trace: true });
      setState("idle");
      if (r.timeout) setNote(s.timeout);
      else if (r.failed) setNote(s.failed);
      setRun(r.runs[0] ?? null); setK(0); setPlaying(false);
    } catch (e) {
      setState((e as Error).message === "offline" ? "offline" : "idle");
      if ((e as Error).message !== "offline") setNote(s.failed);
    }
  };

  const mb = num(RUNTIMES.python.sizeMB);
  const cur = trace[Math.min(k, last - 1)], prev = k > 0 ? trace[k - 1] : undefined;
  const now = k < last ? trace[k] : undefined;
  const fresh = k < last ? changed(prev, now) : new Set<string>();
  const order = names(trace);
  const where = now ? stackAt(trace, k) : [];
  const params = where.length > 1 ? /def\s+\w+\s*\(([^)]*)\)/.exec(code.split("\n").find((l) => new RegExp(`def\\s+${where[where.length - 1].fn}\\b`).test(l)) ?? "")?.[1].trim() : "";

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => pick(ex)}>
      <Segmented label={s.example} value={ex} onChange={pick} options={(["loop", "ifelse", "function"] as const).map((id) => [id, s.ex[id]] as const)} />
      {!stepping ? (
        <>
          <Editor value={code} onChange={(v) => { setCode(v); setRun(null); }} label={s.editor} errorLine={run?.line} />
          <div className="lb-runbar">
            <Button size="sm" icon="play" loading={state === "loading" || state === "running"} onClick={record}>{s.record}</Button>
            <Button size="sm" variant="ghost" icon="undo" disabled={code === EXAMPLES[ex]} onClick={() => pick(ex)}>{s.restore}</Button>
          </div>
          {state === "loading" && <p className="lb-note">{s.loading(mb)}</p>}
          {state === "offline" && <p className="notice">{s.offline(mb)}</p>}
          {note && <p className="lb-verdict is-warn" role="alert">{note}</p>}
          {run?.error && <div className="lb-code-out"><p className="lb-code-err-h">{s.error(num(run.line ?? 0))}</p><pre className="lb-code-err" dir="ltr" translate="no">{run.error}</pre></div>}
        </>
      ) : (
        <>
          <p className="lb-trace-head" aria-live="polite"><strong>{s.step(num(k + 1), num(last + 1))}</strong> {now ? s.nextLine(num(now.line)) : s.finished}</p>
          <CodeBlock text={code} lang="python" numbers mark={now?.line} label={s.editor} />
          {where.length > 1 && (
            <p className="lb-trace-where">
              {s.inside(C(`${where[where.length - 1].fn}()`), num(where[where.length - 2].line))} {params ? s.scope(C(params)) : null}
            </p>
          )}
          <div className="lb-runbar">
            <Button size="sm" variant="secondary" disabled={!k || playing} onClick={() => setK(k - 1)}>{s.back}</Button>
            <Button size="sm" icon="next" disabled={k >= last || playing} onClick={() => setK(k + 1)}>{s.next}</Button>
            <Button size="sm" variant="secondary" icon={playing ? "pause" : "play"} disabled={k >= last && !playing} onClick={() => setPlaying(!playing)}>{playing ? s.pause : s.play}</Button>
            <Button size="sm" variant="ghost" icon="edit" onClick={() => { setRun(null); setPlaying(false); }}>{s.edit}</Button>
          </div>
          <Slider label={s.scrub} value={k} min={0} max={last} onChange={(v) => { setK(v); setPlaying(false); }} format={(v) => num(v + 1)} />
          <section className="lb-panel" aria-label={s.vars}>
            <h3 className="lb-trace-h">{s.vars}</h3>
            {order.some((n) => (now ?? cur)?.vars[n] !== undefined) ? (
              <table className="lb-trace-vars" dir="ltr">
                <thead><tr><th scope="col">{s.name}</th><th scope="col">{s.value}</th></tr></thead>
                <tbody>
                  {order.filter((n) => (now ?? cur)?.vars[n] !== undefined).map((n) => {
                    const v = (now ?? cur)!.vars[n], old = prev?.vars[n];
                    return (
                      <tr key={n} className={fresh.has(n) ? "is-changed" : undefined}>
                        <th scope="row">{n}</th>
                        <td>{v}{fresh.has(n) && old !== undefined && <small dir="auto"> {s.was(old)}</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="lb-note">{s.none}</p>}
          </section>
          {k >= last && (
            <section className="lb-code-out" aria-label={s.printed}>
              <h3 className="lb-trace-h">{s.printed}</h3>
              {run.out ? <pre className="lb-code-print" dir="ltr" translate="no">{run.out}</pre> : <p className="lb-note">{s.nothing}</p>}
              {run.error && <><p className="lb-code-err-h">{s.error(num(run.line ?? 0))}</p><pre className="lb-code-err" dir="ltr" translate="no">{run.error}</pre></>}
              {run.traceCut && <p className="lb-note">{s.cut}</p>}
            </section>
          )}
        </>
      )}
    </LabShell>
  );
}
