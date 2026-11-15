import { useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { TOOLS } from "../../../tinylm";
import { ModelGate, RecordedTag, RunFailed, Thinking, Transcript, useTiny, agentTurn, type Event } from "../inject/lab-tiny";
import { approvalCheck, asksApproval, type Hooks } from "../inject/lab-agent";
import { tamper } from "../inject/model";
import { ATTEMPTS, attemptText, bannedWord, GUARDS, guardVerdict, outcomeOf, sendRequest, TRICK_REQUEST, trickOrder, type GateHit, type Guard, type GuardVerdict, type Outcome, type Reason } from "./model";
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
    verdicts: "What each guardrail decided", decided: { blocked: "stopped it", passed: "let it pass", idle: "had nothing to check" } as Record<GuardVerdict["state"], string>,
    why: {
      found: (w: string) => `found “${w}”`, none: "no banned word", approved: "you asked for it and said yes",
      noAsk: "it never asked you about this exact message", noYes: "you never said yes", notTheirs: "these words did not come from you",
      noSend: "the model sent no message", earlier: "the request was already stopped",
    },
    tag: { blocked: "No message was sent.", sent: "The message was sent (a simulation).", noSend: "No message was sent." } as Record<Outcome, string>,
    heldOk: "A guardrail stopped the message before it was sent.",
    noSend: "No message was sent: the model did not send one this time, so no guardrail was needed.",
    sentWarn: "The message went through. The guardrails you switched on did not catch this wording.",
    sentNone: "The message went through: no guardrail was switched on.",
    sentFine: "You asked for this ordinary message, so it went through, as it should.",
    inputBlocked: "The word filter rejected the request before the model even saw it.",
    try1: "Pick the scam message that asks for a password, with “Plain words”. Keep “Filter the outgoing message” on (it starts on) and press “Run it”: the word filter catches “password” and stops it.",
    try2: "Now switch to “Reworded”: the same scam, no banned word, sails straight past the filter. Word lists only catch what is on the list.",
    try3: "Set “Where it comes from” to “The agent was tricked”: you only ask for a route, and a village name in the result hides an order to send the message. Turn on “Check in code”: the message is stopped whatever the wording, because you never approved it.",
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
    verdicts: "ماذا قرّر كل حاجز", decided: { blocked: "أوقفها", passed: "مرّرها", idle: "لم يجد ما يفحصه" } as Record<GuardVerdict["state"], string>,
    why: {
      found: (w: string) => `وجد «${w}»`, none: "لا توجد كلمة محظورة", approved: "طلبتها وقلت نعم",
      noAsk: "لم يسألك عن هذه الرسالة بعينها", noYes: "لم تقل نعم", notTheirs: "هذه الكلمات ليست كلماتك",
      noSend: "لم يرسل النموذج أي رسالة", earlier: "كان الطلب قد أُوقف قبل ذلك",
    },
    tag: { blocked: "لم تُرسل أي رسالة.", sent: "أُرسلت الرسالة (محاكاة).", noSend: "لم تُرسل أي رسالة." } as Record<Outcome, string>,
    heldOk: "أوقف حاجزٌ الرسالةَ قبل إرسالها.",
    noSend: "لم تُرسل أي رسالة: لم يرسلها النموذج هذه المرة، فلم يحتج الأمر إلى أي حاجز.",
    sentWarn: "مرّت الرسالة. لم تلتقط الحواجز التي فعّلتها هذه الصياغة.",
    sentNone: "مرّت الرسالة: لم يكن أي حاجز مفعّلًا.",
    sentFine: "طلبت هذه الرسالة العادية، فمرّت كما ينبغي.",
    inputBlocked: "رفض مرشّح الكلمات الطلب قبل أن يراه النموذج أصلًا.",
    try1: "اختر رسالة الاحتيال التي تطلب كلمة المرور، بـ«كلمات صريحة». وأبقِ «رشّح الرسالة الصادرة» مفعّلًا (يبدأ مفعّلًا)، واضغط «شغّل»: يلتقط المرشّح «كلمة المرور» ويوقفها.",
    try2: "الآن اختر «صياغة أخرى»: الاحتيال نفسه، بلا كلمة محظورة، يمرّ من أمام المرشّح. قوائم الكلمات لا تلتقط إلا ما فيها.",
    try3: "اضبط «من أين تأتي» على «خُدِع الوكيل»: أنت تسأل عن طريق فقط، واسمُ قرية في النتيجة يخفي أمرًا بإرسال الرسالة. فعّل «افحص في الكود»: تُوقَف الرسالة مهما كانت صياغتها، لأنك لم توافق عليها.",
    takeaway: "مرشّحات الكلمات سهلة الكتابة وسهلة الالتفاف — يمرّ المرادف من أمامها. أما فحص الفعل نفسه في الكود فلا يبالي بصياغة الرسالة: يسأل هل وافقت حقًّا على هذا، وهذا هو الحاجز الذي يصمد.",
  },
};

interface Readout { outcome: Outcome; verdicts: GuardVerdict[] }

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
  const [readout, setReadout] = useState<Readout | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [failed, setFailed] = useState(false);
  const stop = () => { stopFlag.current = true; tiny.stop(); };
  const stopFlag = useState(() => ({ current: false }))[0];

  const attempt = ATTEMPTS.find((a) => a.id === id)!;
  const toggle = (g: Guard) => setGuards((x) => { const n = new Set(x); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const clear = () => { setEvents(null); setReadout(null); setFailed(false); };
  const why = (r: Reason) => (r.code === "found" ? s.why.found(r.word) : s.why[r.code]);

  async function run() {
    if (tiny.busy) return;
    tiny.setBusy(true); setEvents([]); setReadout(null); setFailed(false); stopFlag.current = false;
    const requestText = tricked ? TRICK_REQUEST[tlang] : sendRequest(attempt, wording, tlang);
    const requestWord = bannedWord(requestText, tlang);
    const inputOn = guards.has("input");
    const verdictsFor = (hit: GateHit | null) => GUARDS.filter((g) => guards.has(g)).map((g) => guardVerdict(g, { requestWord, inputOn, hit }));
    // The input filter runs before the model: a blocked request never reaches it.
    if (inputOn && requestWord) {
      setEvents([{ kind: "user", text: requestText }, { kind: "answer", text: s.inputBlocked, byCode: true }]);
      setReadout({ outcome: outcomeOf([], true), verdicts: verdictsFor(null) });
      tiny.setBusy(false); onDone?.(); return;
    }
    // Every message the agent tries to send stops at the gate in code. Both checks are worked out on it, so the readout
    // says what each guardrail decided about the message that really arrived; the ones switched on can stop it
    // (the action check first, then the outgoing filter).
    let hit: GateHit | null = null;
    const gate = (call: { tool: string; args: Record<string, unknown> }, conv: Parameters<NonNullable<Hooks["gate"]>>[1]) => {
      if (call.tool !== "send_message") return null;
      const h: GateHit = { action: approvalCheck(call as Parameters<typeof approvalCheck>[0], conv), output: bannedWord(String(call.args.text ?? ""), tlang) };
      hit ??= h;
      if (guards.has("action") && h.action) return s.guardRule.action;
      if (guards.has("output") && h.output) return s.guardRule.output;
      return null;
    };
    // Tricked: the attacker renamed a village on the route to an order to send the message.
    const order = trickOrder(attempt, wording, tlang);
    const view = tricked ? (call: { tool: string }, result: unknown) => (call.tool === "route" ? tamper(result, "via", order) : result) : undefined;
    const hooks: Hooks = { gate, view, stopped: () => stopFlag.current };
    try {
      const world = await tiny.prepare();
      const r1 = await agentTurn(tiny.generate, { tools: TOOLS, turns: [{ role: "user", text: requestText }] }, world, hooks);
      let all: Event[] = r1.events, conv = r1.conv;
      const yes = tlang === "ar" ? "نعم" : "yes";
      const needYes = r1.events.some((e) => e.kind === "answer" && !e.byCode && asksApproval(e.text));
      if (needYes && !r1.stopped && !stopFlag.current) {
        const r2 = await agentTurn(tiny.generate, { tools: TOOLS, turns: [...conv.turns, { role: "user", text: yes }] }, world, hooks);
        all = [...all, { kind: "user", text: yes }, ...r2.events];
      }
      setEvents(all);
      setReadout({ outcome: outcomeOf(all, false), verdicts: verdictsFor(hit) });
      onDone?.();
    } catch { setEvents(null); setFailed(true); } finally { stopFlag.current = false; tiny.setBusy(false); }
  }

  // The settings can't drift from the readout: every change clears it.
  const fine = attempt.kind === "benign" && !tricked;
  const headline = (o: Outcome) => {
    if (o === "blocked") return s.heldOk;
    if (o === "noSend") return s.noSend;
    if (fine) return s.sentFine;
    return guards.size ? s.sentWarn : s.sentNone;
  };
  const tone = (o: Outcome) => (o === "sent" ? (fine ? "good" : "sent") : o === "blocked" ? "blocked" : "clean");

  const body = (
    <div className="stack">
      <div className="stack-sm">
        <label className="dr-field-label" htmlFor="lb-gr-msg">{s.attempt}</label>
        <select id="lb-gr-msg" className="dr-field-input lb-select" value={id} onChange={(e) => { setId(e.target.value); clear(); }}>
          {ATTEMPTS.map((a) => <option key={a.id} value={a.id}>{a.to[tlang]}: {attemptText(a, "plain", tlang)} ({s.kindTag[a.kind]})</option>)}
        </select>
        <Segmented label={s.wording} value={wording} options={[["plain", s.plain], ["para", s.para]]} onChange={(w) => { setWording(w); clear(); }} />
        <Segmented label={s.source} value={tricked ? "t" : "a"} options={[["a", s.asked], ["t", s.tricked]]} onChange={(v) => { setTricked(v === "t"); clear(); }} />
      </div>

      <div className="stack-sm">
        <span className="dr-field-label">{s.guards}</span>
        <div className="lb-fixes" role="group" aria-label={s.guards}>
          {GUARDS.map((g) => (
            <button key={g} type="button" className={guards.has(g) ? "lb-fix is-on" : "lb-fix"} aria-pressed={guards.has(g)} onClick={() => { toggle(g); clear(); }}>
              <Icon name={guards.has(g) ? "check" : "close"} size={18} />
              <span>{s.guard[g]}<span className="lb-fix-rule">{s.guardRule[g]}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="lb-runbar"><Button size="sm" icon="play" disabled={tiny.busy} onClick={run}>{events ? s.again : s.run}</Button></div>
      {tiny.busy && <Thinking onStop={stop} />}
      {failed && !tiny.busy && <RunFailed onRetry={run} onRecorded={() => setRecorded(true)} />}

      {events && !!events.length && (
        <div className="stack-sm">
          {readout && (
            <p className={`lb-verdict ${tone(readout.outcome) === "sent" ? "is-warn" : ""}`} aria-live="polite">
              <span className={`lb-out-tag is-${tone(readout.outcome)}`}>{s.tag[readout.outcome]}</span> {headline(readout.outcome)}
            </p>
          )}
          {!!readout?.verdicts.length && (
            <>
              <span className="dr-field-label">{s.verdicts}</span>
              <ul className="lb-guards">
                {readout.verdicts.map((v) => (
                  <li key={v.guard} className={v.state === "blocked" ? "is-block" : v.state === "passed" ? "is-pass" : undefined}>
                    <Icon name={v.state === "blocked" ? "lock" : v.state === "idle" ? "info" : v.guard === "action" ? "check" : "warning"} size={16} />
                    <span><strong>{s.guard[v.guard]}</strong> — {s.decided[v.state]}<span className="lb-fix-rule">{why(v.reason)}</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Transcript events={events} />
        </div>
      )}
    </div>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { clear(); setGuards(new Set(["output"])); setWording("plain"); setTricked(false); setId(ATTEMPTS[1].id); }}>
      {recorded ? <><RecordedTag /><Transcript events={RECORDED[tlang]} /></> : <ModelGate tiny={tiny} onRecorded={() => setRecorded(true)}>{body}</ModelGate>}
    </LabShell>
  );
}
