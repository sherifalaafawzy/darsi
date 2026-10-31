import { useEffect, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { type ToolCall, type Turn } from "../../../tinylm";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { askedApproval, callText, langOfTurns, runTurn, type StepOut } from "../agentloop/agent";
import { Code, TinyGate, Turns, Txt, Toggle, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { guardFor, LEVELS, NO, SCENARIOS, toolsFor, YES, type Level, type Scenario, type Why } from "./model";

const S = {
  en: {
    intro: "An agent that can act (set a reminder, send a message) needs a person in charge. Choose what Darsi Tiny may do, then try the requests. Darsi Tiny learned to ask before it sends a message, but learned behaviour can fail, so the app checks too.",
    level: "What the agent may do", levels: { read: "Read only", ask: "Ask first", free: "Allowed" } as Record<Level, string>,
    rows: { read: "Read (timetable, weather, library…)", reminder: "Set a reminder", message: "Send a message" },
    cell: { yes: "✓ yes", no: "✗ no", asks: "asks you", yesAfter: "after your yes" },
    check: "Check the approval in code", checkNote: "Before a message goes out, the app checks that Darsi Tiny asked about exactly this message and that you said yes.",
    requests: "Requests", run: "Send the request", stop: "Stop",
    scen: { message: "", reminder: "", noask: "", yes: "This one is Arabic for “Yes, send it.”, with nothing asked before it.", read: "" } as Record<string, string>,
    approve: "Approve", deny: "Deny", asksYou: "Darsi Tiny asks for your approval:",
    wants: "Darsi Tiny wants to set a reminder. The app asks you first:", allow: "Allow", refuse: "Don't allow",
    why: {
      "read-only": "Blocked by the app: this agent may only read.",
      "no-question": "Blocked by the app: no one was asked to approve this message.",
      "no-yes": "Blocked by the app: you didn't say yes to this message.",
      "changed": "Blocked by the app: this isn't the message you approved.",
      "needs-you": "Waiting for you.",
      denied: "You said no, so nothing was done.",
    } as Record<Why | "denied", string>,
    log: "What the agent did", none: "Nothing yet.",
    did: { read: "Read", sent: "Sent (simulated: nothing leaves this phone)", set: "Set a reminder", blocked: "Blocked", denied: "Not allowed" } as Record<string, string>,
    goal: (a: boolean, b: boolean) => `${a ? "✓" : "○"} a message sent after your yes ${b ? "✓" : "○"} a blocked action`,
    try1: "At “Ask first”, send the message to Mrs Mensah: Darsi Tiny asks first. Deny it, then send it again and approve it.",
    try2: "Turn the code check off and choose “Allowed”, then send «نعم، أرسلها.» (“Yes, send it.”) with nothing before it: Darsi Tiny makes up a message and sends it. Turn the check on and choose “Ask first”, then send it again.",
    try3: "Choose “Read only” and ask for a reminder, then for the weather.",
    takeaway: "Let an agent read freely, but make it ask before it acts. A model's “I'll ask first” is learned and can fail, so the app must check the approval in code too, and keep a record of what was done.",
  },
  ar: {
    intro: "الوكيل الذي يستطيع أن يتصرف (يضبط تذكيرًا، يرسل رسالة) يحتاج إلى إنسان يتولى الأمر. اختر ما يُسمح لـ«درسي الصغير» بفعله، ثم جرّب الطلبات. لقد تعلّم «درسي الصغير» أن يسأل قبل أن يرسل رسالة، لكن السلوك المتعلَّم قد يخطئ، لذا يتحقق التطبيق أيضًا.",
    level: "ما يُسمح للوكيل بفعله", levels: { read: "القراءة فقط", ask: "اسأل أولًا", free: "مسموح" },
    rows: { read: "القراءة (الجدول، الطقس، المكتبة…)", reminder: "ضبط تذكير", message: "إرسال رسالة" },
    cell: { yes: "✓ نعم", no: "✗ لا", asks: "يسألك", yesAfter: "بعد موافقتك" },
    check: "تحقّق من الموافقة في الكود", checkNote: "قبل أن تخرج رسالة، يتحقق التطبيق من أن «درسي الصغير» سأل عن هذه الرسالة بعينها وأنك قلت نعم.",
    requests: "الطلبات", run: "أرسل الطلب", stop: "أوقف",
    scen: { message: "", reminder: "", noask: "", yes: "هذا الطلب «نعم، أرسلها.» دون أن يُسأل أي سؤال قبله.", read: "" },
    approve: "وافق", deny: "ارفض", asksYou: "يطلب «درسي الصغير» موافقتك:",
    wants: "يريد «درسي الصغير» ضبط تذكير. يسألك التطبيق أولًا:", allow: "اسمح", refuse: "لا تسمح",
    why: {
      "read-only": "أوقفه التطبيق: هذا الوكيل مسموح له بالقراءة فقط.",
      "no-question": "أوقفه التطبيق: لم يُسأل أحد ليوافق على هذه الرسالة.",
      "no-yes": "أوقفه التطبيق: لم تقل نعم لهذه الرسالة.",
      "changed": "أوقفه التطبيق: ليست هذه الرسالة التي وافقت عليها.",
      "needs-you": "بانتظارك.",
      denied: "قلت لا، فلم يُفعل شيء.",
    },
    log: "ما فعله الوكيل", none: "لا شيء بعد.",
    did: { read: "قرأ", sent: "أرسل (محاكاة: لا يخرج شيء من هذا الهاتف)", set: "ضبط تذكيرًا", blocked: "أُوقف", denied: "لم يُسمح" },
    goal: (a: boolean, b: boolean) => `${a ? "✓" : "○"} رسالة أُرسلت بعد موافقتك ${b ? "✓" : "○"} تصرّف أُوقف`,
    try1: "على «اسأل أولًا» أرسل الرسالة إلى الأستاذة مينسا: يسألك «درسي الصغير» أولًا. ارفضها، ثم أرسلها مجددًا ووافق عليها.",
    try2: "أطفئ التحقق في الكود واختر «مسموح»، ثم أرسل «نعم، أرسلها.» دون شيء قبلها: يختلق «درسي الصغير» رسالة ويرسلها. شغّل التحقق واختر «اسأل أولًا»، ثم أرسلها مجددًا.",
    try3: "اختر «القراءة فقط» واطلب تذكيرًا، ثم اسأل عن الطقس.",
    takeaway: "دع الوكيل يقرأ بحرية، لكن اجعله يسأل قبل أن يتصرف. فقول النموذج «سأسأل أولًا» سلوك متعلَّم قد يخطئ، لذا يجب أن يتحقق التطبيق من الموافقة في الكود أيضًا، وأن يحفظ سجلًّا بما فُعل.",
  },
};

interface Entry { kind: "read" | "sent" | "set" | "blocked" | "denied"; call?: ToolCall; why?: string }

export default function Approve({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui } = useI18n();
  const tiny = useTiny();
  const lang = ui === "ar" ? "ar" : "en";
  const [level, setLevel] = useState<Level>("ask");
  const [code, setCode] = useState(true);
  const [sc, setSc] = useState<Scenario>(SCENARIOS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tools, setTools] = useState<string[]>(toolsFor("ask"));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<null | "message" | ToolCall>(null);
  const [stopBy, setStopBy] = useState<string | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [goal, setGoal] = useState({ sent: false, blocked: false });
  const allowed = useRef(new Set<string>());
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => { if (goal.sent && goal.blocked) onDone?.(); }, [goal.sent && goal.blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (start: Turn[], ts = tools, lv = level, ck = code) => {
    setBusy(true);
    stopped.current = false;
    setPending(null);
    setStopBy(null);
    setTurns(start);
    try {
      await tiny.prepare();
      const guard = guardFor(lv, ck, (c) => allowed.current.has(callText(c)));
      const onStep = (o: StepOut, t: Turn[]) => {
        setTurns([...t]);
        if (o.kind === "result") {
          const call = (t[t.length - 2] as { call: ToolCall }).call;
          const kind = call.tool === "send_message" ? "sent" : call.tool === "reminder" ? "set" : "read";
          setLog((l) => [{ kind, call }, ...l]);
          if (kind === "sent" && lv === "ask" && ck) setGoal((g) => ({ ...g, sent: true }));
        }
        if (o.kind === "blocked") {
          if (o.reason === "needs-you") setPending(o.call);
          else { setStopBy(o.reason); setLog((l) => [{ kind: "blocked", call: o.call, why: o.reason }, ...l]); setGoal((g) => ({ ...g, blocked: true })); }
        }
      };
      const { turns: done } = await runTurn({ tools: ts, turns: start }, tiny.gen, tiny.run, { guard, onStep, stopped: () => stopped.current });
      const end = done[done.length - 1];
      if (end?.role === "answer" && askedApproval(end.text)) setPending("message");
    } catch { /* TinyGate shows it */ } finally { setBusy(false); }
  };
  const start = () => { if (busy) return; const ts = toolsFor(level); setTools(ts); allowed.current.clear(); go([{ role: "user", text: sc.text[lang] }], ts); };
  const reply = (yes: boolean) => { const l = langOfTurns(turns); go([...turns, { role: "user", text: yes ? YES[l] : NO[l] }]); };
  const allow = (yes: boolean) => {
    if (typeof pending !== "object" || !pending) return;
    if (yes) { allowed.current.add(callText(pending)); go(turns); }
    else { setLog((l) => [{ kind: "denied", call: pending }, ...l]); setStopBy("denied"); setPending(null); setGoal((g) => ({ ...g, blocked: true })); }
  };

  const cell = (row: "read" | "reminder" | "message", lv: Level) =>
    row === "read" || lv === "free" ? s.cell.yes : lv === "read" ? s.cell.no : row === "reminder" ? s.cell.asks : s.cell.yesAfter;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <div className="lb-seg" role="radiogroup" aria-label={s.level}>
            <span className="lb-seg-label">{s.level}</span>
            {LEVELS.map((l) => <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => !busy && setLevel(l)}>{s.levels[l]}</button>)}
          </div>
          <div className="lb-scroll" role="region" aria-label={s.level} tabIndex={0}>
            <table className="lb-dt lb-ag-perm">
              <thead><tr><th scope="col"><span className="lb-ag-sr">{s.level}</span></th>{LEVELS.map((l) => <th key={l} scope="col" className={l === level ? "is-on" : undefined}>{s.levels[l]}</th>)}</tr></thead>
              <tbody>{(["read", "reminder", "message"] as const).map((r) => <tr key={r}><th scope="row">{s.rows[r]}</th>{LEVELS.map((l) => <td key={l} className={l === level ? "is-on" : undefined}>{cell(r, l)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {level === "ask" && <Toggle label={s.check} note={s.checkNote} checked={code} onChange={setCode} disabled={busy} />}
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.requests}</span>
          <div className="lb-ag-exs">
            {SCENARIOS.map((x) => <button key={x.id} type="button" className={x === sc ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={x === sc} onClick={() => !busy && setSc(x)}><Txt text={x.text[lang]} /></button>)}
          </div>
          {s.scen[sc.id] && <p className="lb-note">{s.scen[sc.id]}</p>}
          <div className="lb-row">
            {busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button> : <Button icon="play" onClick={start}>{s.run}</Button>}
          </div>
          <TinyGate tiny={tiny} onRetry={start} />
        </div>
      </div>
      <Turns turns={turns} live={tiny.live} />
      {pending === "message" && !busy && (
        <div className="lb-panel lb-ag-ask" aria-live="polite">
          <p className="lb-verdict">{s.asksYou}</p>
          <div className="lb-row"><Button icon="check" onClick={() => reply(true)}>{s.approve}</Button><Button variant="secondary" icon="close" onClick={() => reply(false)}>{s.deny}</Button></div>
        </div>
      )}
      {pending && typeof pending === "object" && !busy && (
        <div className="lb-panel lb-ag-ask" aria-live="polite">
          <p className="lb-verdict">{s.wants}</p>
          <Code text={callText(pending)} />
          <div className="lb-row"><Button icon="check" onClick={() => allow(true)}>{s.allow}</Button><Button variant="secondary" icon="close" onClick={() => allow(false)}>{s.refuse}</Button></div>
        </div>
      )}
      {stopBy && <p className="lb-verdict is-warn" aria-live="polite">{s.why[stopBy as Why | "denied"]}</p>}
      <div className="stack">
        <span className="dr-field-label">{s.log}</span>
        {log.length ? (
          <ul className="lb-ag-log">
            {log.map((e, i) => (
              <li key={log.length - i} className={`is-${e.kind}`}>
                <strong>{s.did[e.kind]}</strong>
                {e.call && <Code text={callText(e.call)} />}
                {e.why && <span className="lb-note">{s.why[e.why as Why]}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="lb-note">{s.none}</p>}
        <p className="lb-note">{s.goal(goal.sent, goal.blocked)}</p>
      </div>
    </LabShell>
  );
}
