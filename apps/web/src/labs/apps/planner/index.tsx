import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TOOLS, type Lang, type ToolCall, type Turn } from "../../../tinylm";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { runTurn, specOf } from "../agentloop/agent";
import { LangPick, TinyGate, Turns, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { calledTools, GOALS, provenance, samePlan, wentAheadAfterError, type Goal } from "./model";

const S = {
  en: {
    intro: "Some goals need more than one tool. Darsi Tiny first writes a one-line plan, then calls the tools one after the other, and the second call can use what the first tool returned. Guess the plan, then run it.",
    goals: "Goals", lang: "Goals in", guess: "Your plan", first: "First tool", then: "Then", nothing: "nothing else", run: "Run the plan", stop: "Stop",
    plan: "Darsi Tiny's plan", yours: (a: string) => `Your plan: ${a}.`, its: (a: string) => `Darsi Tiny's: ${a}.`, joinThen: ", then ", none: "no tool",
    same: "Same plan as yours.", differ: "A different plan from yours.",
    legend: "Where each copied word of the call came from (days, times and numbers are worked out from your words):", fromReq: "your request", fromRes: "an earlier result", fromNone: "nowhere",
    failed: (e: string) => `This step failed (“${e}”), but Darsi Tiny went ahead with the next step anyway. It never checks a result before using it, so an agent needs a check here, in code or by a person.`,
    count: (n: string) => `Two-step goals run: ${n} of 2.`,
    try1: "Pick the trip from Kafi to Dala, guess the two tools in order, then run it and compare your plan with Darsi Tiny's.",
    try2: "Run “6B's first lesson + a reminder”: the reminder's text joins words from your request (6B) and from the timetable's result.",
    try3: "Run the same goal for Saturday, when there is no school: does Darsi Tiny notice before it sets the reminder?",
    takeaway: "An agent reaches a goal by breaking it into steps and feeding one step's result into the next. Each step can fail, so a good agent checks a result before it builds on it.",
  },
  ar: {
    intro: "تحتاج بعض الأهداف إلى أكثر من أداة. يكتب «درسي الصغير» أولًا خطة من سطر واحد، ثم يستدعي الأدوات واحدة بعد الأخرى، ويمكن أن يستعمل الاستدعاء الثاني ما أعادته الأداة الأولى. خمّن الخطة، ثم شغّلها.",
    goals: "الأهداف", lang: "لغة الأهداف", guess: "خطتك", first: "الأداة الأولى", then: "ثم", nothing: "لا شيء آخر", run: "شغّل الخطة", stop: "أوقف",
    plan: "خطة «درسي الصغير»", yours: (a: string) => `خطتك: ${a}.`, its: (a: string) => `خطة «درسي الصغير»: ${a}.`, joinThen: "، ثم ", none: "بلا أداة",
    same: "الخطة نفسها التي توقعتها.", differ: "خطة مختلفة عن خطتك.",
    legend: "من أين جاءت كل كلمة منسوخة في الاستدعاء (الأيام والأوقات والأرقام يستخرجها من كلماتك):", fromReq: "طلبك", fromRes: "نتيجة سابقة", fromNone: "لا مكان",
    failed: (e: string) => `فشلت هذه الخطوة («${e}»)، لكن «درسي الصغير» مضى إلى الخطوة التالية رغم ذلك. فهو لا يفحص النتيجة قبل أن يستعملها، لذا يحتاج الوكيل إلى فحص هنا، في الكود أو من إنسان.`,
    count: (n: string) => `الأهداف ذات الخطوتين التي شغّلتها: ${n} من ٢.`,
    try1: "اختر الرحلة من كافي إلى دالا، وخمّن الأداتين بالترتيب، ثم شغّلها وقارن خطتك بخطة «درسي الصغير».",
    try2: "شغّل «الحصة الأولى للصف 6B مع تذكير»: يجمع نص التذكير كلمات من طلبك (6B) ومن نتيجة الجدول.",
    try3: "شغّل الهدف نفسه ليوم السبت، ولا دوام فيه: هل ينتبه «درسي الصغير» قبل أن يضبط التذكير؟",
    takeaway: "يبلغ الوكيل هدفه بتقسيمه إلى خطوات، وبإدخال نتيجة كل خطوة في التي تليها. وقد تفشل أي خطوة، فالوكيل الجيد يفحص النتيجة قبل أن يبني عليها.",
  },
};

export default function Planner({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui, num } = useI18n();
  const fid = useId(), tid = useId();
  const tiny = useTiny();
  const [lang, setLang] = useState<Lang>(ui === "ar" ? "ar" : "en");
  const [goal, setGoal] = useState<Goal>(GOALS[0]);
  const [first, setFirst] = useState("route");
  const [second, setSecond] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState<{ guess: string[]; did: string[] } | null>(null);
  const [twoStep, setTwoStep] = useState(() => new Set<string>());
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => { if (twoStep.size >= 2) onDone?.(); }, [twoStep.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (g: Goal) => { if (busy) return; setGoal(g); setTurns([]); setRan(null); };
  const run = async () => {
    if (busy) return;
    setBusy(true);
    stopped.current = false;
    const guess = [first, second].filter(Boolean);
    const start: Turn[] = [{ role: "user", text: goal.text[lang] }];
    setTurns(start);
    setRan(null);
    try {
      await tiny.prepare();
      const { turns: done } = await runTurn({ tools: TOOLS, turns: start }, tiny.gen, tiny.run, { stopped: () => stopped.current, onStep: (_, t) => setTurns([...t]) });
      const did = calledTools(done);
      setRan({ guess, did });
      if (did.length >= 2 && done[done.length - 1]?.role === "answer" && !goal.fails) setTwoStep((x) => new Set(x).add(goal.id));
    } catch { /* TinyGate shows it */ } finally { setBusy(false); }
  };

  const planText = (turns.find((t) => t.role === "plan") as { text: string } | undefined)?.text;
  const request = goal.text[lang];
  const results = (upto: number) => turns.slice(0, upto).filter((t) => t.role === "result").map((t) => (t as { result: unknown }).result);
  const ahead = wentAheadAfterError(turns);
  const list = (tools: string[]) => (tools.length ? tools.join(s.joinThen) : s.none);

  const notes = (i: number) => {
    const t = turns[i];
    if (t.role === "call") {
      return (
        <div className="lb-ag-prov">
          {Object.entries((t.call as ToolCall).args).map(([k, v]) => (
            <span key={k} className="lb-ag-prov-row" dir="ltr">
              <code translate="no">{k}</code>
              {specOf((t.call as ToolCall).tool)?.args.find((a) => a.name === k)?.kind !== "text" ? <span className="lb-ag-src">{typeof v === "string" ? v : JSON.stringify(v)}</span> : provenance(v, request, results(i)).map((p, n) => p.from
                ? <span key={n} className={`lb-ag-src is-${p.from}`} lang={/[؀-ۿ]/.test(p.text) ? "ar" : undefined}>{p.text}</span>
                : <span key={n}>{p.text}</span>)}
            </span>
          ))}
        </div>
      );
    }
    if (ahead && i === ahead.failed) return <p className="lb-verdict is-warn">{s.failed(String((t as { result: { error: string } }).result.error))}</p>;
    return null;
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <LangPick value={lang} onChange={(l) => { setLang(l); setTurns([]); setRan(null); }} label={s.lang} />
          <div className="lb-ag-exs" role="group" aria-label={s.goals}>
            {GOALS.map((g) => <button key={g.id} type="button" className={g === goal ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={g === goal} onClick={() => pick(g)}><Txt text={g.text[lang]} /></button>)}
          </div>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.guess}</span>
          <div className="lb-ag-guess">
            <label htmlFor={fid}>{s.first}</label>
            <select id={fid} className="dr-field-input" dir="ltr" value={first} onChange={(e) => setFirst(e.target.value)}>{TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <label htmlFor={tid}>{s.then}</label>
            <select id={tid} className="dr-field-input" dir="ltr" value={second} onChange={(e) => setSecond(e.target.value)}>
              <option value="">{s.nothing}</option>{TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="lb-row">
            {busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button> : <Button icon="play" onClick={run}>{s.run}</Button>}
          </div>
          <TinyGate tiny={tiny} onRetry={run} />
        </div>
      </div>
      {planText !== undefined && <p className="lb-ag-plan"><span className="lb-note">{s.plan}</span> <Txt text={planText} /></p>}
      {turns.some((t) => t.role === "call") && (
        <p className="lb-note">{s.legend} <span className="lb-ag-src is-request">{s.fromReq}</span> <span className="lb-ag-src is-result">{s.fromRes}</span> <span className="lb-ag-src is-none">{s.fromNone}</span></p>
      )}
      <Turns turns={turns} live={tiny.live} notes={notes} />
      {ran && (
        <div className="lb-panel" aria-live="polite">
          <p className="lb-note" dir="auto">{s.yours(list(ran.guess))}</p>
          <p className="lb-note" dir="auto">{s.its(list(ran.did))}</p>
          <p className="lb-verdict">{samePlan(ran.guess, ran.did) ? s.same : s.differ}</p>
        </div>
      )}
      <p className="lb-note">{s.count(num(Math.min(2, twoStep.size)))}</p>
    </LabShell>
  );
}
