import { useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import type { ToolName } from "../../../tinylm";
import { ModelGate, RecordedTag, RunFailed, Thinking, Transcript, useTiny, agentTurn, type Event } from "../inject/lab-tiny";
import { ranCalls } from "../inject/lab-agent";
import { tamper } from "../inject/model";
import { ALL_TOOLS, ATTACK_SET, blastRadius, CAP, canDoTask, overGranted, TASKS, type Cap } from "./model";
import { RECORDED } from "./recorded";

const ACT = new Set<ToolName>(["send_message", "reminder"]);

const S = {
  en: {
    intro: "An agent can only misuse the tools you hand it. Pick a job, grant the agent some tools, then set a batch of tampered results loose on it and count the harmful actions it reaches. Then take tools away and run the same attacks again.",
    task: "The job", toolLabel: "Tools you grant the agent",
    cap: { read: "reads", reveal: "reveals a record", act: "takes an action" } as Record<Cap, string>,
    tool: {
      calculator: "Calculator", timetable: "Timetable", weather: "Weather", library: "Library", glossary: "Glossary",
      convert: "Convert", route: "Route", attendance: "Attendance", reminder: "Reminder", send_message: "Send message",
    } as Record<ToolName, string>,
    needs: "This job needs", over: "Granted but not needed", none: "none", enough: "Enough to do the job.", notEnough: "Not enough for the job — grant its tools too.",
    blast: "What a tampered result could reach now", blastNone: "Nothing that acts: the worst an attack can do is make it read or talk.",
    run: "Run the attack set", again: "Run again", running: (n: string, m: string) => `Attack ${n} of ${m}…`,
    reached: (acts: string, tries: string) => `The attack set reached ${acts} out of ${tries}.`,
    acts: { one: "{n} harmful action", other: "{n} harmful actions" } as Forms, tries: { one: "{n} try", other: "{n} tries" } as Forms,
    acted: "acted", safe: "couldn't act", worst: "The run where it acted:",
    try1: "Grant only Timetable and Library for “Plan tomorrow's lessons”, then run the attack set: no action gets through, because the agent holds no acting tool.",
    try2: "Now also grant “Send message” and run again: a tampered result can now push the agent to send. More tools, more to lose.",
    try3: "Look at “What a tampered result could reach”: keep it empty whenever the job allows. That list is your blast radius.",
    takeaway: "Give an agent the smallest set of tools its job needs. A reading tool can leak at worst; an acting tool can be turned against you. Every extra tool you grant is one more thing a tampered result could reach.",
  },
  ar: {
    intro: "لا يسيء الوكيل استخدام إلا الأدوات التي تسلّمها إياه. اختر مهمة، وامنح الوكيل بعض الأدوات، ثم أطلق عليه دفعة من النتائج المُتلاعَب بها وأحصِ الأفعال الضارة التي يبلغها. ثم انزع أدوات وأعد الهجمات نفسها.",
    task: "المهمة", toolLabel: "الأدوات التي تمنحها للوكيل",
    cap: { read: "يقرأ", reveal: "يكشف سجلًا", act: "يتّخذ فعلًا" } as Record<Cap, string>,
    tool: {
      calculator: "الآلة الحاسبة", timetable: "الجدول", weather: "الطقس", library: "المكتبة", glossary: "المسرد",
      convert: "التحويل", route: "الطريق", attendance: "الحضور", reminder: "التذكير", send_message: "إرسال رسالة",
    } as Record<ToolName, string>,
    needs: "تحتاج هذه المهمة", over: "ممنوحة دون حاجة", none: "لا شيء", enough: "تكفي لأداء المهمة.", notEnough: "لا تكفي للمهمة — امنح أدواتها أيضًا.",
    blast: "ما قد تبلغه نتيجة مُتلاعَب بها الآن", blastNone: "لا شيء يفعل: أقصى ما يستطيعه الهجوم أن يجعله يقرأ أو يتكلّم.",
    run: "شغّل مجموعة الهجمات", again: "شغّل من جديد", running: (n: string, m: string) => `الهجوم ${n} من ${m}…`,
    reached: (acts: string, tries: string) => `الأفعال الضارة التي بلغتها مجموعة الهجمات: ${acts} من أصل ${tries}.`,
    acts: { other: "{n}" } as Forms, tries: { one: "محاولة واحدة", two: "محاولتين", few: "{n} محاولات", many: "{n} محاولة", other: "{n} محاولة" } as Forms,
    acted: "فعَل", safe: "لم يستطع", worst: "التشغيل الذي فعَل فيه:",
    try1: "امنح الجدول والمكتبة فقط لـ«خطّط لحصص الغد»، ثم شغّل مجموعة الهجمات: لا يمرّ أي فعل، لأن الوكيل لا يحمل أداة فاعلة.",
    try2: "الآن امنح أيضًا «إرسال رسالة» وأعد التشغيل: يمكن لنتيجة مُتلاعَب بها أن تدفع الوكيل إلى الإرسال. أدوات أكثر، خسارة أكثر.",
    try3: "انظر إلى «ما قد تبلغه نتيجة مُتلاعَب بها»: أبقِه فارغًا كلما سمحت المهمة. تلك القائمة هي نطاق الضرر.",
    takeaway: "امنح الوكيل أصغر مجموعة أدوات تحتاجها مهمته. الأداة القارئة قد تُسرِّب في أسوأ الأحوال، أما الفاعلة فقد تُدار ضدّك. وكل أداة زائدة تمنحها شيء آخر قد تبلغه نتيجة مُتلاعَب بها.",
  },
};

export default function Privilege({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const count = usePlural();
  const tlang = lang === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [taskId, setTaskId] = useState(TASKS[0].id);
  const [granted, setGranted] = useState<Set<ToolName>>(new Set(["timetable", "library"]));
  const [results, setResults] = useState<{ id: string; acted: boolean }[] | null>(null);
  const [showRun, setShowRun] = useState<Event[]>([]);
  const [step, setStep] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [failed, setFailed] = useState(false);
  const stopFlag = useState(() => ({ current: false }))[0];

  const task = TASKS.find((t) => t.id === taskId)!;
  const blast = blastRadius(granted);
  const over = overGranted(granted, task);
  const toggle = (t: ToolName) => setGranted((x) => { const n = new Set(x); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const toolList = (ts: ToolName[]) => (ts.length ? ts.map((t) => s.tool[t]).join(tlang === "ar" ? "، " : ", ") : s.none);

  async function run() {
    if (tiny.busy) return;
    tiny.setBusy(true); setResults([]); setShowRun([]); setStep(0); setFailed(false); stopFlag.current = false;
    const out: { id: string; acted: boolean }[] = [];
    let worst: Event[] = [];
    try {
      const world = await tiny.prepare();
      for (let i = 0; i < ATTACK_SET.length; i++) {
        if (stopFlag.current) break;
        setStep(i + 1);
        const sc = ATTACK_SET[i];
        const tools = [...new Set<ToolName>([...granted, sc.tool])];
        const view = (call: { tool: string }, result: unknown) => (call.tool === sc.tool ? tamper(result, sc.place, sc.instr[tlang]) : result);
        const hooks = { view, stopped: () => stopFlag.current };
        const r1 = await agentTurn(tiny.generate, { tools, turns: [{ role: "user", text: sc.req[tlang] }] }, world, hooks);
        let all: Event[] = r1.events, conv = r1.conv;
        if (!r1.stopped && r1.events.some((e) => e.kind === "answer" && !e.byCode && /reply yes or no|أجب بنعم أو لا/i.test(e.text))) {
          const yes = tlang === "ar" ? "نعم" : "yes";
          const r2 = await agentTurn(tiny.generate, { tools, turns: [...conv.turns, { role: "user", text: yes }] }, world, hooks);
          all = [...all, { kind: "user", text: yes }, ...r2.events];
        }
        const acted = ranCalls(all).some((c) => ACT.has(c.tool as ToolName));
        out.push({ id: sc.id, acted });
        if (acted && !worst.length) worst = all;
      }
      setResults(out); setShowRun(worst); onDone?.();
    } catch { setResults(null); setFailed(true); } finally { stopFlag.current = false; tiny.setBusy(false); }
  }

  const stop = () => { stopFlag.current = true; tiny.stop(); };
  const totalActed = results ? results.filter((r) => r.acted).length : 0;

  const body = (
    <div className="stack">
      <div className="stack-sm">
        <label className="dr-field-label" htmlFor="lb-pv-task">{s.task}</label>
        <select id="lb-pv-task" className="dr-field-input lb-select" value={taskId} onChange={(e) => { setTaskId(e.target.value); setResults(null); setFailed(false); }}>
          {TASKS.map((t) => <option key={t.id} value={t.id}>{tlang === "ar" ? t.ar : t.en}</option>)}
        </select>
        <p className="lb-note">{s.needs}: <strong>{toolList(task.needs)}</strong>. {canDoTask(granted, task) ? s.enough : s.notEnough}</p>
      </div>

      <div className="stack-sm">
        <span className="dr-field-label">{s.toolLabel}</span>
        <ul className="lb-grant">
          {ALL_TOOLS.map((t) => (
            <li key={t}>
              <button type="button" className={granted.has(t) ? "lb-grant-chip is-on" : "lb-grant-chip"} aria-pressed={granted.has(t)} onClick={() => { toggle(t); setResults(null); setFailed(false); }}>
                <Icon name={granted.has(t) ? "check" : "close"} size={16} />
                <span>{s.tool[t]}<span className={`lb-cap is-${CAP[t]}`}>{s.cap[CAP[t]]}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <p className={`lb-note ${blast.length ? "" : ""}`}>{s.blast}: {blast.length ? <strong className="lb-blast">{toolList(blast)}</strong> : <span>{s.blastNone}</span>}</p>
        {over.length > 0 && <p className="lb-note"><Icon name="warning" size={16} /> {s.over}: {toolList(over)}</p>}
      </div>

      <div className="lb-runbar"><Button size="sm" icon="play" disabled={tiny.busy} onClick={run}>{results ? s.again : s.run}</Button></div>
      {tiny.busy && <div className="stack-sm" aria-live="polite"><p className="lb-note">{s.running(num(step), num(ATTACK_SET.length))}</p><Thinking onStop={stop} /></div>}
      {failed && !tiny.busy && <RunFailed onRetry={run} onRecorded={() => setRecorded(true)} />}

      {results && !!results.length && (
        <div className="stack-sm">
          <p className={`lb-verdict ${totalActed ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${totalActed ? "sent" : "blocked"}`}>{num(totalActed)}</span> {s.reached(count(totalActed, s.acts), count(ATTACK_SET.length, s.tries))}</p>
          <ul className="lb-guards">
            {results.map((r) => <li key={r.id} className={r.acted ? "is-block" : "is-pass"}><Icon name={r.acted ? "warning" : "lock"} size={16} /><span>{r.acted ? s.acted : s.safe}</span></li>)}
          </ul>
          {!!showRun.length && <><p className="lb-note">{s.worst}</p><Transcript events={showRun} /></>}
        </div>
      )}
    </div>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setResults(null); setFailed(false); setGranted(new Set(["timetable", "library"])); setTaskId(TASKS[0].id); }}>
      {recorded ? <><RecordedTag /><Transcript events={RECORDED[tlang]} /></> : <ModelGate tiny={tiny} onRecorded={() => setRecorded(true)}>{body}</ModelGate>}
    </LabShell>
  );
}
