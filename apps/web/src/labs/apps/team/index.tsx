import { useEffect, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TOOLS, type ToolCall, type Turn } from "../../../tinylm";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { askedApproval, callText, langOfTurns, runTurn } from "../agentloop/agent";
import { Code, TinyGate, Turns, Txt, Toggle, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { REQUESTS, review, RULES, verdict, type Check, type Request, type Rule } from "./model";

const S = {
  en: {
    intro: "Big agents are often split into roles that hand work to each other. Here Darsi Tiny is the planner: it proposes each tool call. A checker reviews the call before the app runs it, and hands it to you when a person is needed.",
    roles: "The team", planner: "Planner", plannerWho: "Darsi Tiny, a model", checker: "Checker", checkerWho: "five rules written in code", runner: "Runner", runnerWho: "the app runs the tool", you: "You", youWho: "approve actions, or ask again",
    honest: "Only the planner is a model. The checker and the hand-offs are scripted: simple rules are often the safest checker, because they never guess.",
    on: "Checker on", onNote: "Off: every call the planner proposes runs at once.",
    requests: "Requests", run: "Send to the team", stop: "Stop",
    rule: {
      tool: "The tool is on the list", shape: "Every detail has the right shape", said: "Every name and number comes from your words or a tool's result",
      after: "No step before it failed", person: "A person said yes to any action",
    } as Record<Rule, string>,
    report: "Checker's report", reportOff: "Checker's report (it is off, so the call ran anyway)",
    v: { run: "Passed: the runner runs the tool.", ask: "Handed to you: this action needs a person's OK.", stop: "Stopped before anything ran. Darsi Tiny was never trained to take a checker's feedback, so the team hands it back to you: ask again in other words." },
    approve: "Approve", deny: "Deny", allow: "Allow", refuse: "Don't allow", asks: "The planner asks for your approval:", allowQ: "Allow this action?",
    did: "What ran", ran: "Ran", stopped: "Stopped by the checker", denied: "You said no",
    goal: (a: boolean, b: boolean) => `${a ? "✓" : "○"} the checker stopped a bad call ${b ? "✓" : "○"} an action ran after your OK`,
    try1: "Send “What's the weather in Kafi tomorrow?”: the planner proposes, the checker passes it, the runner runs it.",
    try2: "Send “Remind me to tidy the library…” and “What does 9Z have tomorrow?”: the planner copies a word wrongly, and the checker stops it. Turn the checker off and send them again.",
    try3: "Send the Saturday lesson request: the first step fails, so the checker stops the reminder that would have been set anyway.",
    takeaway: "Splitting an agent into roles lets one part check another before anything happens. The checker doesn't need to be clever: a few strict rules catch a model's slips, and a person decides the rest.",
  },
  ar: {
    intro: "كثيرًا ما يُقسَّم الوكيل الكبير إلى أدوار يسلّم بعضها العمل إلى بعض. هنا «درسي الصغير» هو المخطِّط: يقترح كل استدعاء أداة. ويراجع المدقِّق الاستدعاء قبل أن يشغّله التطبيق، ويسلّمه إليك حين يلزم إنسان.",
    roles: "الفريق", planner: "المخطِّط", plannerWho: "«درسي الصغير»، نموذج", checker: "المدقِّق", checkerWho: "خمس قواعد مكتوبة في الكود", runner: "المنفِّذ", runnerWho: "التطبيق يشغّل الأداة", you: "أنت", youWho: "توافق على التصرفات، أو تعيد السؤال",
    honest: "المخطِّط وحده نموذج. أما المدقِّق والتسليم بين الأدوار فمكتوبان مسبقًا: فالقواعد البسيطة كثيرًا ما تكون أأمن مدقِّق، لأنها لا تخمّن أبدًا.",
    on: "المدقِّق يعمل", onNote: "إن أطفأته: يعمل كل استدعاء يقترحه المخطِّط فورًا.",
    requests: "الطلبات", run: "أرسل إلى الفريق", stop: "أوقف",
    rule: {
      tool: "الأداة في القائمة", shape: "شكل كل تفصيل صحيح", said: "كل اسم ورقم جاء من كلماتك أو من نتيجة أداة",
      after: "لم تفشل خطوة قبله", person: "وافق إنسان على أي تصرّف",
    },
    report: "تقرير المدقِّق", reportOff: "تقرير المدقِّق (هو مطفأ، فعمل الاستدعاء رغم ذلك)",
    v: { run: "نجح: يشغّل المنفِّذ الأداة.", ask: "سُلّم إليك: يحتاج هذا التصرّف إلى موافقة إنسان.", stop: "أُوقف قبل أن يعمل أي شيء. لم يتدرّب «درسي الصغير» قط على تلقّي ملاحظات المدقِّق، لذا يعيده الفريق إليك: اسأل مجددًا بكلمات أخرى." },
    approve: "وافق", deny: "ارفض", allow: "اسمح", refuse: "لا تسمح", asks: "يطلب المخطِّط موافقتك:", allowQ: "هل تسمح بهذا التصرّف؟",
    did: "ما عمل", ran: "عمل", stopped: "أوقفه المدقِّق", denied: "قلت لا",
    goal: (a: boolean, b: boolean) => `${a ? "✓" : "○"} أوقف المدقِّق استدعاءً خاطئًا ${b ? "✓" : "○"} عمل تصرّف بعد موافقتك`,
    try1: "أرسل «ما حالة الطقس في كافي غدًا؟»: يقترح المخطِّط، فيجيزه المدقِّق، فيشغّله المنفِّذ.",
    try2: "أرسل «ماذا لدى 9Z غدًا؟» و«اشرح مصطلح البرمجيات الخبيثة.»: ينسخ المخطِّط كلمة خطأً، فيوقفه المدقِّق. أطفئ المدقِّق وأرسلهما مجددًا.",
    try3: "أرسل طلب حصة يوم السبت: تفشل الخطوة الأولى، فيوقف المدقِّق التذكير الذي كان سيُضبط رغم ذلك.",
    takeaway: "تقسيم الوكيل إلى أدوار يتيح لجزء أن يفحص جزءًا آخر قبل أن يحدث أي شيء. ولا يحتاج المدقِّق إلى الذكاء: بضع قواعد صارمة تلتقط زلّات النموذج، والإنسان يقرر الباقي.",
  },
};

export default function Team({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui } = useI18n();
  const lang = ui === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [on, setOn] = useState(true);
  const [req, setReq] = useState<Request>(REQUESTS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<Record<number, Check[]>>({});
  const [waiting, setWaiting] = useState<null | "message" | ToolCall>(null);
  const [log, setLog] = useState<{ kind: "ran" | "stopped" | "denied"; call: ToolCall }[]>([]);
  const [goal, setGoal] = useState({ stopped: false, approved: false });
  const allowed = useRef(new Set<string>());
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => { if (goal.stopped && goal.approved) onDone?.(); }, [goal.stopped && goal.approved]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (start: Turn[], checker = on) => {
    setBusy(true);
    stopped.current = false;
    setWaiting(null);
    setTurns(start);
    try {
      await tiny.prepare();
      const guard = (call: ToolCall, ts: readonly Turn[]) => {
        const at = ts.length - 1;
        const checks = review(call, ts, TOOLS, allowed.current.has(callText(call)));
        setReports((r) => ({ ...r, [at]: checks }));
        const v = verdict(checks);
        if (v === "run" || !checker) {
          setLog((l) => [{ kind: "ran", call }, ...l]);
          if (v === "run" && allowed.current.has(callText(call)) || (call.tool === "send_message" && v === "run")) setGoal((g) => ({ ...g, approved: true }));
          return { ok: true as const };
        }
        if (v === "stop") { setLog((l) => [{ kind: "stopped", call }, ...l]); setGoal((g) => ({ ...g, stopped: true })); }
        return { ok: false as const, reason: v };
      };
      const { turns: done, outs } = await runTurn({ tools: TOOLS, turns: start }, tiny.gen, tiny.run, { guard, stopped: () => stopped.current, onStep: (_, t) => setTurns([...t]) });
      const last = outs[outs.length - 1];
      if (last?.kind === "blocked" && last.reason === "ask") setWaiting(last.call);
      const end = done[done.length - 1];
      if (end?.role === "answer" && askedApproval(end.text)) setWaiting("message");
    } catch { /* TinyGate */ } finally { setBusy(false); }
  };
  const send = () => { if (busy) return; allowed.current.clear(); setReports({}); go([{ role: "user", text: req.text[lang] }]); };
  const reply = (yes: boolean) => { const l = langOfTurns(turns); go([...turns, { role: "user", text: yes ? (l === "ar" ? "نعم" : "yes") : l === "ar" ? "لا" : "no" }]); };
  const allow = (yes: boolean) => {
    if (!waiting || waiting === "message") return;
    if (yes) { allowed.current.add(callText(waiting)); go(turns); }
    else { setLog((l) => [{ kind: "denied", call: waiting }, ...l]); setWaiting(null); }
  };

  const notes = (i: number) => {
    const checks = reports[i];
    if (!checks) return null;
    const v = verdict(checks);
    return (
      <div className={`lb-ag-report${on ? "" : " is-off"}`}>
        <strong>{on ? s.report : s.reportOff}</strong>
        <ul>
          {RULES.map((r) => { const c = checks.find((x) => x.rule === r)!; return <li key={r} className={c.ok ? "is-ok" : "is-bad"}><span aria-hidden>{c.ok ? "✓" : "✗"}</span><span>{s.rule[r]}{c.detail && !c.ok ? <>: <Code text={c.detail} /></> : null}</span></li>; })}
        </ul>
        {on && <p className={v === "stop" ? "lb-verdict is-warn" : "lb-verdict"}>{s.v[v]}</p>}
      </div>
    );
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.roles}</span>
          <ul className="lb-ag-roles">
            <li className="is-model"><strong>{s.planner}</strong><span>{s.plannerWho}</span></li>
            <li className="is-rules"><strong>{s.checker}</strong><span>{s.checkerWho}</span></li>
            <li><strong>{s.runner}</strong><span>{s.runnerWho}</span></li>
            <li><strong>{s.you}</strong><span>{s.youWho}</span></li>
          </ul>
          <p className="lb-note">{s.honest}</p>
          <Toggle label={s.on} note={s.onNote} checked={on} onChange={setOn} disabled={busy} />
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.requests}</span>
          <div className="lb-ag-exs">
            {REQUESTS.map((r) => <button key={r.id} type="button" className={r === req ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={r === req} onClick={() => !busy && setReq(r)}><Txt text={r.text[lang]} /></button>)}
          </div>
          <div className="lb-row">{busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button> : <Button icon="play" onClick={send}>{s.run}</Button>}</div>
          <TinyGate tiny={tiny} onRetry={send} />
        </div>
      </div>
      <Turns turns={turns} live={tiny.live} notes={notes} />
      {waiting === "message" && !busy && (
        <div className="lb-panel lb-ag-ask"><p className="lb-verdict">{s.asks}</p>
          <div className="lb-row"><Button icon="check" onClick={() => reply(true)}>{s.approve}</Button><Button variant="secondary" icon="close" onClick={() => reply(false)}>{s.deny}</Button></div></div>
      )}
      {waiting && waiting !== "message" && !busy && (
        <div className="lb-panel lb-ag-ask"><p className="lb-verdict">{s.allowQ}</p><Code text={callText(waiting)} />
          <div className="lb-row"><Button icon="check" onClick={() => allow(true)}>{s.allow}</Button><Button variant="secondary" icon="close" onClick={() => allow(false)}>{s.refuse}</Button></div></div>
      )}
      {log.length > 0 && (
        <div className="stack">
          <span className="dr-field-label">{s.did}</span>
          <ul className="lb-ag-log">{log.map((e, i) => <li key={log.length - i} className={`is-${e.kind}`}><strong>{s[e.kind]}</strong><Code text={callText(e.call)} /></li>)}</ul>
        </div>
      )}
      <p className="lb-note">{s.goal(goal.stopped, goal.approved)}</p>
    </LabShell>
  );
}
