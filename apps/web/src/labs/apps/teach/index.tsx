import { useEffect, useRef, useState } from "react";
import { Button, ProgressBar } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { storage } from "../../../platform";
import { runTool, type ToolCall, type Turn } from "../../../tinylm";
import { Segmented } from "../../kit/controls";
import { LabShell } from "../../kit/LabShell";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { callText, runTurn, sameCall } from "../agentloop/agent";
import { Code, TinyGate, Turns, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { ASK, BLOCKS, BUS_TOOLS, EXAMPLES, LR, oldPhoneMinutes, REPLAYS, runBus, SAVE_KEY, STEPS, TESTS } from "./model";

const S = {
  en: {
    intro: "Fine-tuning teaches a model something new from examples. Here you teach Darsi Tiny a new tool, bus, from 16 example conversations, on this phone: only its top layer learns. Then you test the new tool, and its old skills.",
    tool: "The new tool", toolText: "tells the next bus from a village and how often buses go. It takes:",
    ask: "Ask about a bus", askNote: "Before teaching, Darsi Tiny has never seen the bus tool, even though it is in its tools line.",
    examples: (n: string) => `The ${n} examples`,
    replay: "Old conversations mixed in", replayNote: "Ordinary conversations Darsi Tiny was trained on, practised again alongside the new examples so it doesn't forget them.",
    estimate: (n: string, m: string) => `${n} examples a step, ${STEPS} steps: about ${m} minutes on an old phone (0.7 s per example per step), and much less on a newer one. You can stop at any time.`,
    teach: "Teach", stop: "Stop", cont: "Continue", test: "Test it",
    reading: "Reading the examples…", step: (a: string, b: string) => `Step ${a} of ${b}`,
    left: (sec: string, left: string) => `This phone: ${sec} s a step. About ${left} left.`,
    took: (t: string) => `Teaching took ${t} on this phone.`,
    stopped: (a: string) => `Stopped after step ${a}. What it learned so far is in use; Continue goes on from there.`,
    hidden: "Stopped because the screen was hidden: nothing trains in the background.",
    loss: "Error on the examples", lossLabel: "Error after each step",
    testing: "Testing…", results: "Test results",
    newTool: (a: string, b: string) => `New tool, villages it never saw: ${a} of ${b} right.`,
    oldSkills: (a: string, b: string) => `Old skills: ${a} of ${b} right.`,
    runs: "Your teaching runs", mixed: "Mixed in", newCol: "New tool", oldCol: "Old skills", timeCol: "Time", before: "before",
    model: "Model in use", original: "Original", taught: "Taught here",
    saved: (mb: string) => `Saved on this phone (${mb} MB). It comes back when you open this lab again.`, del: "Delete it",
    dur: (m: string, sec: string) => `${m} min ${sec} s`, durS: (sec: string) => `${sec} s`,
    forgot: "Without old conversations, Darsi Tiny learned the bus tool and forgot much of what it knew: that's called catastrophic forgetting.",
    wants: "Expected", got: "Darsi Tiny's call",
    try1: "Ask about a bus before teaching: Darsi Tiny calls another tool, or answers without one.",
    try2: "Teach with 48 old conversations mixed in, then test: the bus tool works for villages it never saw, and the old skills still work.",
    try3: "Teach again with none mixed in: faster, but test the old skills.",
    takeaway: "Fine-tuning changes a model's numbers so it learns from examples, but it can forget what it knew; practising old examples alongside the new ones keeps them. Test both before you trust the result.",
  },
  ar: {
    intro: "الضبط الدقيق يعلّم النموذج شيئًا جديدًا من أمثلة. هنا تعلّم «درسي الصغير» أداة جديدة اسمها bus من ١٦ محادثة نموذجية، على هذا الهاتف: لا تتعلّم إلا طبقته العليا. ثم تختبر الأداة الجديدة، ومهاراته القديمة.",
    tool: "الأداة الجديدة", toolText: "تخبر بموعد الحافلة التالية من قرية، وكل كم دقيقة تمر الحافلات. تأخذ:",
    ask: "اسأل عن حافلة", askNote: "قبل التعليم، لم يرَ «درسي الصغير» أداة bus قط، مع أنها في سطر أدواته.",
    examples: (n: string) => `الأمثلة الـ${n}`,
    replay: "المحادثات القديمة الممزوجة", replayNote: "محادثات عادية تدرّب عليها «درسي الصغير»، يتمرّن عليها مجددًا مع الأمثلة الجديدة كي لا ينساها.",
    estimate: (n: string, m: string) => `${n} مثالًا في كل خطوة، و١٥ خطوة: نحو ${m} دقيقة على هاتف قديم (٠٫٧ ثانية لكل مثال في كل خطوة)، وأقل بكثير على هاتف أحدث. يمكنك الإيقاف في أي وقت.`,
    teach: "علّمه", stop: "أوقف", cont: "تابع", test: "اختبره",
    reading: "يقرأ الأمثلة…", step: (a: string, b: string) => `الخطوة ${a} من ${b}`,
    left: (sec: string, left: string) => `هذا الهاتف: ${sec} ثانية لكل خطوة. يبقى نحو ${left}.`,
    took: (t: string) => `استغرق التعليم ${t} على هذا الهاتف.`,
    stopped: (a: string) => `توقف بعد الخطوة ${a}. ما تعلّمه حتى الآن قيد الاستعمال، و«تابع» يكمل من هناك.`,
    hidden: "توقف لأن الشاشة أُخفيت: لا شيء يتدرّب في الخلفية.",
    loss: "الخطأ في الأمثلة", lossLabel: "الخطأ بعد كل خطوة",
    testing: "يختبر…", results: "نتائج الاختبار",
    newTool: (a: string, b: string) => `الأداة الجديدة، مع قرى لم يرها: ${a} من ${b} صحيحة.`,
    oldSkills: (a: string, b: string) => `المهارات القديمة: ${a} من ${b} صحيحة.`,
    runs: "جولات التعليم", mixed: "الممزوج", newCol: "الأداة الجديدة", oldCol: "المهارات القديمة", timeCol: "الوقت", before: "قبل",
    model: "النموذج المستعمل", original: "الأصلي", taught: "المعلَّم هنا",
    saved: (mb: string) => `محفوظ على هذا الهاتف (${mb} ميغابايت). يعود حين تفتح هذا المختبر مجددًا.`, del: "احذفه",
    dur: (m: string, sec: string) => `${m} دقيقة و${sec} ثانية`, durS: (sec: string) => `${sec} ثانية`,
    forgot: "دون محادثات قديمة، تعلّم «درسي الصغير» أداة bus ونسي كثيرًا مما كان يعرفه: هذا ما يسمّى النسيان الكارثي.",
    wants: "المتوقع", got: "استدعاء «درسي الصغير»",
    try1: "اسأل عن حافلة قبل التعليم: يستدعي «درسي الصغير» أداة أخرى، أو يجيب دون أداة، بل قد يرفض الطلب.",
    try2: "علّمه مع ٤٨ محادثة قديمة ممزوجة، ثم اختبره: تعمل أداة bus مع قرى لم يرها، وتبقى المهارات القديمة.",
    try3: "علّمه مجددًا دون أي محادثة قديمة: أسرع، لكن اختبر المهارات القديمة.",
    takeaway: "يغيّر الضبط الدقيق أرقام النموذج فيتعلّم من الأمثلة، لكنه قد ينسى ما كان يعرفه؛ والتمرّن على أمثلة قديمة مع الجديدة يحفظها. اختبر الاثنين قبل أن تثق بالنتيجة.",
  },
};

interface Run { replay: number; newOk: number; oldOk: number; ms: number }
interface Saved { buf: ArrayBuffer; replay: number }
type Row = { text: string; want: ToolCall; got?: ToolCall; ok: boolean; kind: "new" | "old" };

export default function Teach({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui, num } = useI18n();
  const tiny = useTiny();
  const lang = ui === "ar" ? "ar" : "en";
  const [replay, setReplay] = useState<number>(48);
  const [phase, setPhase] = useState<"idle" | "reading" | "training" | "testing">("idle");
  const [losses, setLosses] = useState<number[]>([]);
  const [stepMs, setStepMs] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [partial, setPartial] = useState<{ buf: ArrayBuffer; done: number; replay: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [use, setUse] = useState<"original" | "taught">("original");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const t0 = useRef(0);
  const busy = phase !== "idle" || asking;
  const stop = (why?: "hidden") => { if (why) setHidden(true); tiny.lm.stop(); };
  useStopWhenHidden(phase === "training" || phase === "reading", () => stop("hidden"));

  // A fine-tune saved earlier on this phone comes back (not applied until the learner picks it).
  useEffect(() => {
    let alive = true;
    storage.get<Saved>(SAVE_KEY).then((x) => { if (alive && x?.buf) setSaved(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const runOne = (call: ToolCall, l: "en" | "ar") => (call.tool === "bus" ? runBus(call.args) : runTool(tiny.world.current!, call.tool, call.args, l));
  const askBus = async () => {
    if (busy) return;
    setAsking(true);
    const start: Turn[] = [{ role: "user", text: ASK[lang][0].replace("{p}", lang === "en" ? "Kafi" : "كافي") }];
    setTurns(start);
    try {
      await tiny.prepare();
      const { turns: done } = await runTurn({ tools: BUS_TOOLS, turns: start }, tiny.gen, runOne, { onStep: (_, t) => setTurns([...t]) });
      setTurns(done);
    } catch { /* TinyGate */ } finally { setAsking(false); }
  };

  const calc = (e: string) => { const r = runTool(tiny.world.current!, "calculator", { expr: e }, "en"); return typeof r.value === "number" ? r.value : null; };
  const test = async (): Promise<Row[]> => {
    setPhase("testing");
    await tiny.prepare();
    const out: Row[] = [];
    for (const t of TESTS) {
      const r = await tiny.lm.generate({ tools: BUS_TOOLS, turns: [{ role: "user", text: t.text }] }, { maxTokens: 40 });
      out.push({ text: t.text, want: t.want, got: r.step.call, ok: sameCall(t.want, r.step.call, calc).args, kind: t.kind });
      setRows([...out]);
    }
    return out;
  };

  const teach = async (resume?: { buf: ArrayBuffer; done: number; replay: number }) => {
    if (busy) return;
    const rp = resume?.replay ?? replay, from = resume?.done ?? 0;
    setHidden(false);
    setRows(null);
    if (!resume) { setLosses([]); setElapsed(0); }
    setPhase("reading");
    try {
      await tiny.prepare();
      t0.current = performance.now() - (resume ? elapsed : 0);
      let steps = from;
      const buf = await tiny.lm.finetune(EXAMPLES, {
        steps: STEPS - from, blocks: BLOCKS, lr: LR, replay: rp, resume: resume?.buf,
        onReady: () => setPhase("training"),
        onStep: (st) => { steps++; setLosses((l) => [...l, st.loss]); setStepMs(st.ms); setElapsed(performance.now() - t0.current); },
      });
      setUse("taught");
      if (steps < STEPS) { setPartial({ buf, done: steps, replay: rp }); setPhase("idle"); return; }
      setPartial(null);
      const ms = performance.now() - t0.current;
      const res = await test();
      setRuns((r) => [...r, { replay: rp, newOk: res.filter((x) => x.kind === "new" && x.ok).length, oldOk: res.filter((x) => x.kind === "old" && x.ok).length, ms }]);
      setSaved({ buf, replay: rp });
      await storage.set(SAVE_KEY, { buf, replay: rp } satisfies Saved).catch(() => {});
      onDone?.();
    } catch { /* TinyGate */ } finally { setPhase("idle"); }
  };

  const pick = async (u: "original" | "taught") => {
    if (busy) return;
    setUse(u);
    setRows(null);
    await tiny.lm.useFineTune(u === "taught" && saved ? saved.buf : null);
  };
  const forget = async () => { if (busy) return; await storage.remove(SAVE_KEY).catch(() => {}); setSaved(null); await pick("original"); };

  const done = losses.length, total = STEPS;
  const secs = (ms: number) => (ms >= 60_000 ? s.dur(num(Math.floor(ms / 60_000)), num(Math.round((ms % 60_000) / 1000))) : s.durS(num(Math.round(ms / 100) / 10)));
  const n = EXAMPLES.length + replay;
  const newRows = rows?.filter((r) => r.kind === "new") ?? [], oldRows = rows?.filter((r) => r.kind === "old") ?? [];
  const lastRun = runs[runs.length - 1];

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.tool}</span>
          <p className="lb-intro"><code className="lb-ag-inline" dir="ltr">bus</code> {s.toolText} <code className="lb-ag-inline" dir="ltr">from</code></p>
          <div className="lb-row"><Button variant="secondary" icon="chat" onClick={askBus} disabled={busy}>{s.ask}</Button></div>
          {!saved && !runs.length && <p className="lb-note">{s.askNote}</p>}
          <Turns turns={turns} live={asking ? tiny.live : null} />
          <details className="lb-doc">
            <summary>{s.examples(num(EXAMPLES.length))}</summary>
            <ol className="lb-ag-list">
              {EXAMPLES.map((e, i) => <li key={i}><Txt text={(e.turns[0] as { text: string }).text} /> <Code text={callText((e.turns[2] as { call: ToolCall }).call)} /></li>)}
            </ol>
          </details>
        </div>
        <div className="stack">
          <Segmented label={s.replay} value={replay} options={REPLAYS.map((r) => [r, num(r)] as const)} onChange={(v) => !busy && setReplay(v)} />
          <p className="lb-note">{s.replayNote}</p>
          <p className="lb-note">{s.estimate(num(n), num(Math.round(oldPhoneMinutes(n))))}</p>
          <div className="lb-row">
            {phase === "reading" || phase === "training" ? <Button variant="secondary" icon="pause" onClick={() => stop()}>{s.stop}</Button>
              : <>
                  <Button icon="play" onClick={() => teach()} disabled={busy}>{s.teach}</Button>
                  {partial && <Button variant="secondary" icon="next" onClick={() => teach(partial)} disabled={busy}>{s.cont}</Button>}
                </>}
          </div>
          <TinyGate tiny={tiny} onRetry={() => teach()} />
          {phase === "reading" && <p className="lb-note" aria-live="polite">{s.reading}</p>}
          {(phase === "training" || done > 0) && (
            <div className="stack" aria-live="polite">
              <ProgressBar value={Math.round((100 * done) / total)} label={s.step(num(done), num(total))} valueText={`${num(done)}/${num(total)}`} />
              {phase === "training" && stepMs > 0 && <p className="lb-note">{s.left(num(Math.round(stepMs / 100) / 10), secs(stepMs * (total - done)))}</p>}
              {phase !== "training" && done === total && lastRun && <p className="lb-note">{s.took(secs(lastRun.ms))}</p>}
              {partial && phase === "idle" && <p className="lb-verdict is-warn">{hidden ? s.hidden : s.stopped(num(partial.done))}</p>}
              {losses.length > 1 && (
                <Plot x={[1, STEPS]} y={[0, Math.max(...losses) * 1.1]} label={s.lossLabel} height={160} xLabel={s.step(num(STEPS), num(STEPS))} yLabel={s.loss}
                  lines={[{ points: losses.map((l, i) => [i + 1, l] as const), tone: "b" }]} ticks={3} />
              )}
            </div>
          )}
        </div>
      </div>

      {(saved || runs.length > 0) && (
        <div className="lb-panel">
          <Segmented label={s.model} value={use} options={[["original", s.original], ["taught", s.taught]] as const} onChange={(v) => { if (v === "original" || saved) pick(v); }} />
          {saved && <div className="lb-row"><p className="lb-note">{s.saved(num(Math.round(saved.buf.byteLength / 1e5) / 10))}</p><Button variant="ghost" icon="close" onClick={forget} disabled={busy}>{s.del}</Button></div>}
          <div className="lb-row"><Button variant="secondary" icon="target" onClick={() => test().finally(() => setPhase("idle"))} disabled={busy}>{s.test}</Button></div>
        </div>
      )}

      {rows && (
        <div className="stack" aria-live="polite">
          <span className="dr-field-label">{phase === "testing" ? s.testing : s.results}</span>
          <p className="lb-verdict">{s.newTool(num(newRows.filter((r) => r.ok).length), num(newRows.length))}</p>
          <p className="lb-verdict">{s.oldSkills(num(oldRows.filter((r) => r.ok).length), num(oldRows.length))}</p>
          {lastRun && lastRun.replay === 0 && lastRun.oldOk < 6 && <p className="lb-verdict is-warn">{s.forgot}</p>}
          <ul className="lb-ag-results">
            {rows.map((r, i) => (
              <li key={i} className={r.ok ? "is-ok" : "is-bad"}>
                <span aria-hidden>{r.ok ? "✓" : "✗"}</span>
                <span className="lb-ag-body"><Txt text={r.text} /><br /><span className="lb-note">{s.got}: </span><Code text={r.got ? callText(r.got) : "—"} />{!r.ok && <><br /><span className="lb-note">{s.wants}: </span><Code text={callText(r.want)} /></>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {runs.length > 0 && (
        <div className="lb-scroll" role="region" aria-label={s.runs} tabIndex={0}>
          <table className="lb-dt">
            <caption className="lb-dt-cap">{s.runs}</caption>
            <thead><tr><th scope="col">{s.mixed}</th><th scope="col">{s.newCol}</th><th scope="col">{s.oldCol}</th><th scope="col">{s.timeCol}</th></tr></thead>
            <tbody>{runs.map((r, i) => <tr key={i}><td>{num(r.replay)}</td><td>{num(r.newOk)}/{num(8)}</td><td>{num(r.oldOk)}/{num(8)}</td><td>{secs(r.ms)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </LabShell>
  );
}
