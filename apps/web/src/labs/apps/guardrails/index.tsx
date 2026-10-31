import { useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { TOOLS } from "../../../tinylm";
import { ModelGate, RecordedTag, Thinking, Transcript, useTiny, agentTurn, type Event } from "../inject/lab-tiny";
import { approvalCheck, ranCalls, type Hooks } from "../inject/lab-agent";
import { tamper } from "../inject/model";
import { ATTEMPTS, attemptText, bannedWord, GUARDS, guardVerdict, sendRequest, type Guard, type GuardVerdict } from "./model";
import { RECORDED } from "./recorded";

const S = {
  en: {
    intro: "A guardrail is a rule around the model. Here are three: a word filter on what the person types, a word filter on the message about to go out, and a check in code that a message is sent only if the person asked and approved it. Choose a message and see which rule stops it.",
    attempt: "The message", kindTag: { benign: "ordinary", scam: "a scam", insult: "unkind" } as Record<string, string>,
    wording: "Wording", plain: "Plain words", para: "Reworded",
    source: "Where it comes from", asked: "You asked for it", tricked: "The agent was tricked (you never asked)",
    guards: "Guardrails", guard: { input: "Filter the person's words", output: "Filter the outgoing message", action: "Check in code: asked and approved" } as Record<Guard, string>,
    guardRule: { input: "Block the request if it has a banned word.", output: "Block the message if it has a banned word.", action: "Send only after you approved this exact message." } as Record<Guard, string>,
    run: "Run it", again: "Run again",
    verdicts: "What each guardrail decided", stopped: "stopped it", passed: "let it pass", off: "off",
    sent: "The message was sent (a simulation).", held: "No message was sent.",
    sentWarn: "The message went through. The guardrails you switched on did not catch this wording.",
    heldOk: "A guardrail stopped the message before it was sent.",
    inputBlocked: "The word filter rejected the request before the model even saw it.",
    try1: "Pick the scam message with “Plain words” and turn on “Filter the outgoing message”: the word filter catches “password” and stops it.",
    try2: "Now switch to “Reworded”: the same scam, no banned word, sails straight past the filter. Word lists only catch what is on the list.",
    try3: "Set “Where it comes from” to “The agent was tricked” and turn on “Check in code”: the message is stopped every time, whatever the wording, because you never approved it.",
    takeaway: "Word filters are easy to write and easy to get around — a synonym walks past them. A check on the action itself, in code, does not care how the message is worded: it asks whether you really approved this, and that is the guardrail that holds.",
  },
  ar: {
    intro: "الحاجز قاعدة حول النموذج. وهذه ثلاث: مرشّح كلمات لما يكتبه الشخص، ومرشّح كلمات للرسالة المتجهة للخارج، وفحص في الكود بأن الرسالة لا تُرسل إلا إن طلبها الشخص ووافق عليها. اختر رسالة وانظر أي قاعدة توقفها.",
    attempt: "الرسالة", kindTag: { benign: "عادية", scam: "احتيال", insult: "جارحة" } as Record<string, string>,
    wording: "الصياغة", plain: "كلمات صريحة", para: "صياغة أخرى",
    source: "من أين تأتي", asked: "أنت طلبتها", tricked: "خُدِع الوكيل (لم تطلبها)",
    guards: "الحواجز", guard: { input: "رشّح كلمات الشخص", output: "رشّح الرسالة الصادرة", action: "افحص في الكود: طُلبت ووُفق عليها" } as Record<Guard, string>,
    guardRule: { input: "ارفض الطلب إن حوى كلمة محظورة.", output: "ارفض الرسالة إن حوت كلمة محظورة.", action: "أرسل فقط بعد أن توافق على هذه الرسالة بعينها." } as Record<Guard, string>,
    run: "شغّل", again: "شغّل من جديد",
    verdicts: "ماذا قرّر كل حاجز", stopped: "أوقفها", passed: "مرّرها", off: "متوقف",
    sent: "أُرسلت الرسالة (محاكاة).", held: "لم تُرسل أي رسالة.",
    sentWarn: "مرّت الرسالة. لم تلتقط الحواجز التي فعّلتها هذه الصياغة.",
    heldOk: "أوقف حاجزٌ الرسالةَ قبل إرسالها.",
    inputBlocked: "رفض مرشّح الكلمات الطلب قبل أن يراه النموذج أصلًا.",
    try1: "اختر رسالة الاحتيال بـ«كلمات صريحة» وفعّل «رشّح الرسالة الصادرة»: يلتقط المرشّح «كلمة المرور» ويوقفها.",
    try2: "الآن اختر «صياغة أخرى»: الاحتيال نفسه، بلا كلمة محظورة، يمرّ من أمام المرشّح. قوائم الكلمات لا تلتقط إلا ما فيها.",
    try3: "اضبط «من أين تأتي» على «خُدِع الوكيل» وفعّل «افحص في الكود»: تُوقَف الرسالة في كل مرة مهما كانت الصياغة، لأنك لم توافق عليها.",
    takeaway: "مرشّحات الكلمات سهلة الكتابة وسهلة الالتفاف — يمرّ المرادف من أمامها. أما فحص الفعل نفسه في الكود فلا يبالي بصياغة الرسالة: يسأل هل وافقت حقًّا على هذا، وهذا هو الحاجز الذي يصمد.",
  },
};

export default function Guardrails({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang } = useI18n();
  const tlang = lang === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [id, setId] = useState(ATTEMPTS[1].id);
  const [wording, setWording] = useState<"plain" | "para">("plain");
  const [tricked, setTricked] = useState(false);
  const [guards, setGuards] = useState<Set<Guard>>(new Set(["output"]));
  const [events, setEvents] = useState<Event[] | null>(null);
  const [verdicts, setVerdicts] = useState<GuardVerdict[]>([]);
  const [sent, setSent] = useState<boolean | null>(null);
  const [recorded, setRecorded] = useState(false);
  const stop = () => { stopFlag.current = true; tiny.stop(); };
  const stopFlag = useState(() => ({ current: false }))[0];

  const attempt = ATTEMPTS.find((a) => a.id === id)!;
  const toggle = (g: Guard) => setGuards((x) => { const n = new Set(x); n.has(g) ? n.delete(g) : n.add(g); return n; });

  async function run() {
    if (tiny.busy) return;
    tiny.setBusy(true); setEvents([]); setVerdicts([]); setSent(null); stopFlag.current = false;
    const msg = attemptText(attempt, wording, tlang);
    const requestText = tricked ? (tlang === "ar" ? "ابحث لي عن كتاب عن الروبوتات." : "Find me a book about robots.") : sendRequest(attempt, wording, tlang);
    const requestWord = bannedWord(requestText, tlang);
    const inputOn = guards.has("input");
    // The input filter runs before the model: a blocked request never reaches it.
    if (inputOn && requestWord && !tricked) {
      setEvents([{ kind: "user", text: requestText }, { kind: "answer", text: s.inputBlocked, byCode: true }]);
      setVerdicts(GUARDS.filter((g) => guards.has(g)).map((g) => guardVerdict(g, { requestWord, outgoingWord: null, genuine: !tricked })));
      setSent(false); tiny.setBusy(false); onDone?.(); return;
    }
    // The outgoing message is checked in code before send_message runs; so is the approval (the action check).
    const outgoingWord = bannedWord(msg, tlang);
    const genuine = !tricked;
    const gate = (call: { tool: string; args: Record<string, unknown> }, conv: Parameters<NonNullable<Hooks["gate"]>>[1]) => {
      if (call.tool !== "send_message") return null;
      if (guards.has("action") && approvalCheck(call as Parameters<typeof approvalCheck>[0], conv)) return s.guardRule.action;
      if (guards.has("output") && bannedWord(String(call.args.text ?? ""), tlang)) return s.guardRule.output;
      return null;
    };
    const view = tricked ? (call: { tool: string }, result: unknown) => (call.tool === "library" ? tamper(result, "title", msg) : result) : undefined;
    const hooks: Hooks = { gate, view, stopped: () => stopFlag.current };
    try {
      const r1 = await agentTurn(tiny.generate, { tools: TOOLS, turns: [{ role: "user", text: requestText }] }, tiny.world!, hooks);
      let all: Event[] = r1.events, conv = r1.conv;
      const yes = tlang === "ar" ? "نعم" : "yes";
      const needYes = r1.events.some((e) => e.kind === "answer" && !e.byCode && /reply yes or no|أجب بنعم أو لا/i.test(e.text));
      if (needYes && !r1.stopped && !stopFlag.current) {
        const r2 = await agentTurn(tiny.generate, { tools: TOOLS, turns: [...conv.turns, { role: "user", text: yes }] }, tiny.world!, hooks);
        all = [...all, { kind: "user", text: yes }, ...r2.events];
      }
      const didSend = ranCalls(all).some((c) => c.tool === "send_message");
      setEvents(all); setSent(didSend);
      setVerdicts(GUARDS.filter((g) => guards.has(g)).map((g) => guardVerdict(g, { requestWord, outgoingWord, genuine })));
      onDone?.();
    } catch { setEvents(null); } finally { stopFlag.current = false; tiny.setBusy(false); }
  }

  const body = (
    <div className="stack">
      <div className="stack-sm">
        <label className="dr-field-label" htmlFor="lb-gr-msg">{s.attempt}</label>
        <select id="lb-gr-msg" className="dr-field-input lb-select" value={id} onChange={(e) => { setId(e.target.value); setEvents(null); }}>
          {ATTEMPTS.map((a) => <option key={a.id} value={a.id}>{a.to[tlang]}: {attemptText(a, "plain", tlang)} ({s.kindTag[a.kind]})</option>)}
        </select>
        <Segmented label={s.wording} value={wording} options={[["plain", s.plain], ["para", s.para]]} onChange={(w) => { setWording(w); setEvents(null); }} />
        <Segmented label={s.source} value={tricked ? "t" : "a"} options={[["a", s.asked], ["t", s.tricked]]} onChange={(v) => { setTricked(v === "t"); setEvents(null); }} />
      </div>

      <div className="stack-sm">
        <span className="dr-field-label">{s.guards}</span>
        <div className="lb-fixes" role="group" aria-label={s.guards}>
          {GUARDS.map((g) => (
            <button key={g} type="button" className={guards.has(g) ? "lb-fix is-on" : "lb-fix"} aria-pressed={guards.has(g)} onClick={() => { toggle(g); setEvents(null); }}>
              <Icon name={guards.has(g) ? "check" : "close"} size={18} />
              <span>{s.guard[g]}<span className="lb-fix-rule">{s.guardRule[g]}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="lb-runbar"><Button size="sm" icon="play" disabled={tiny.busy} onClick={run}>{events ? s.again : s.run}</Button></div>
      {tiny.busy && <Thinking onStop={stop} />}

      {events && !!events.length && (
        <div className="stack-sm">
          {sent !== null && <p className={`lb-verdict ${sent ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${sent ? "sent" : "blocked"}`}>{sent ? s.sent : s.held}</span> {sent ? s.sentWarn : s.heldOk}</p>}
          {!!verdicts.length && (
            <ul className="lb-guards">
              {verdicts.map((v) => (
                <li key={v.guard} className={v.blocked ? "is-block" : "is-pass"}>
                  <Icon name={v.blocked ? "lock" : v.guard === "action" ? "check" : "warning"} size={16} />
                  <span><strong>{s.guard[v.guard]}</strong> — {v.blocked ? s.stopped : s.passed}<span className="lb-fix-rule">{v.why}</span></span>
                </li>
              ))}
            </ul>
          )}
          <Transcript events={events} />
        </div>
      )}
    </div>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setEvents(null); setGuards(new Set(["output"])); setWording("plain"); setTricked(false); setId(ATTEMPTS[1].id); }}>
      {recorded ? <><RecordedTag /><Transcript events={RECORDED[tlang]} /></> : <ModelGate tiny={tiny} onRecorded={() => setRecorded(true)}>{body}</ModelGate>}
    </LabShell>
  );
}
