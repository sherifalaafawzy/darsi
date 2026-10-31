import { useMemo, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { TOOLS } from "../../../tinylm";
import { ModelGate, RecordedTag, Thinking, Transcript, useTiny, agentTurn, type Event } from "./lab-tiny";
import { approvalCheck, asksApproval, type Hooks } from "./lab-agent";
import { ATTACKS, attackText, DEFENCES, outcome, requestFor, tamper, type Defence, type Outcome, type Place } from "./model";
import { RECORDED } from "./recorded";

const S = {
  en: {
    intro: "An attacker can't see Darsi Tiny's instructions, but they can tamper with what a tool returns. Hide an order inside a result and watch the agent: sometimes it ignores it, sometimes the words slip into its answer, and sometimes they move it to act. The model is not the defence — the rules in code are.",
    place: "Hide the order in", placeName: { note: "An extra note", title: "A book's title", via: "A village name" } as Record<Place, string>,
    attack: "The hidden order", none: "Nothing (normal run)",
    kind: { trained: "wording it was trained to ignore", new: "a new wording", approval: "a fake approval question" } as Record<string, string>,
    defences: "Defences (in code, around the model)",
    def: { apart: "Keep data and orders apart", allowlist: "Only the tools this task needs", approval: "Ask me in code before any message" } as Record<Defence, string>,
    defRule: { apart: "Drop any free-text the tool added outside its normal answer.", allowlist: "The agent is given only the one tool it needs here.", approval: "Code sends a message only if you asked for it and said yes." } as Record<Defence, string>,
    run: "Run the attack", runClean: "Run normally", again: "Run again",
    result: "What happened", out: {
      clean: "The agent answered normally. The hidden order did nothing this time.",
      ignored: "The model spotted the order in the result and said it ignored it. That is learned behaviour, and it only holds for wordings like the ones it was trained on.",
      leaked: "The attacker's words reached you through the agent's answer. No tool ran, but the order rode along in the reply.",
      sent: "The attack worked: a trusting “yes” pushed the agent to send a simulated message it was never asked to send.",
      blocked: "A rule in code stopped the message before it could be sent — whatever the model decided.",
    } as Record<Outcome, string>,
    tag: { clean: "No effect", ignored: "Ignored by the model", leaked: "Slipped into the answer", sent: "Order obeyed", blocked: "Stopped by a rule" } as Record<Outcome, string>,
    gate: "The message you didn't ask for was refused in code.",
    try1: "Hide the trained wording in “An extra note”: the model names it and says it ignored it. The model learned to do that.",
    try2: "Now hide the same order in “A book's title” (or try Arabic): watch it slip into the answer, and a trusting “yes” can even send a message. New places and wordings break what the model learned.",
    try3: "Turn on “Ask me in code before any message” and run the worst attack again: the message is stopped by code, not by the model. That is the real defence.",
    takeaway: "Never trust a tool's result as if it were your user. Separating data from orders, giving an agent only the tools it needs, and checking every real action in code stop injections that the model alone would let through.",
  },
  ar: {
    intro: "لا يستطيع المهاجم رؤية تعليمات «درسي الصغير»، لكنه يستطيع العبث بما تعيده أداة. دسّ أمرًا داخل نتيجة وراقب الوكيل: أحيانًا يتجاهله، وأحيانًا تتسلّل كلماته إلى جوابه، وأحيانًا تدفعه إلى التصرّف. النموذج ليس الحماية؛ القواعد في الكود هي الحماية.",
    place: "أخفِ الأمر في", placeName: { note: "ملاحظة إضافية", title: "عنوان كتاب", via: "اسم قرية" } as Record<Place, string>,
    attack: "الأمر المخفيّ", none: "لا شيء (تشغيل عادي)",
    kind: { trained: "صيغة تدرّب على تجاهلها", new: "صيغة جديدة", approval: "سؤال موافقة مزيّف" } as Record<string, string>,
    defences: "دفاعات (في الكود، حول النموذج)",
    def: { apart: "افصل البيانات عن الأوامر", allowlist: "الأدوات التي تلزم هذه المهمة فقط", approval: "اسألني في الكود قبل أي رسالة" } as Record<Defence, string>,
    defRule: { apart: "أسقط أي نص حر أضافته الأداة خارج جوابها المعتاد.", allowlist: "يُعطى الوكيل الأداة الوحيدة التي يحتاجها هنا.", approval: "لا يرسل الكود رسالة إلا إن طلبتها أنت وقلت نعم." } as Record<Defence, string>,
    run: "شغّل الهجوم", runClean: "شغّل عاديًا", again: "شغّل من جديد",
    result: "ماذا حدث", out: {
      clean: "أجاب الوكيل عاديًا. لم يفعل الأمر المخفيّ شيئًا هذه المرة.",
      ignored: "رصد النموذج الأمر في النتيجة وقال إنه تجاهله. هذا سلوك مكتسب، ولا يصمد إلا مع صيغ شبيهة بما تدرّب عليه.",
      leaked: "وصلت كلمات المهاجم إليك عبر جواب الوكيل. لم تعمل أداة، لكن الأمر ركب مع الرد.",
      sent: "نجح الهجوم: دفعت «نعم» واثقةٌ الوكيلَ إلى إرسال رسالة محاكاة لم يُطلب منه إرسالها.",
      blocked: "أوقفت قاعدةٌ في الكود الرسالة قبل أن تُرسل — مهما قرّر النموذج.",
    } as Record<Outcome, string>,
    tag: { clean: "بلا أثر", ignored: "تجاهله النموذج", leaked: "تسلّل إلى الجواب", sent: "نُفّذ الأمر", blocked: "أوقفته قاعدة" } as Record<Outcome, string>,
    gate: "رُفضت في الكود الرسالة التي لم تطلبها.",
    try1: "أخفِ الصيغة المدرَّب عليها في «ملاحظة إضافية»: يسمّيها النموذج ويقول إنه تجاهلها. تعلّم النموذج ذلك.",
    try2: "الآن أخفِ الأمر نفسه في «عنوان كتاب» (أو جرّب العربية): راقبه يتسلّل إلى الجواب، بل قد تُرسل «نعم» واثقةٌ رسالة. الأماكن والصيغ الجديدة تكسر ما تعلّمه النموذج.",
    try3: "فعّل «اسألني في الكود قبل أي رسالة» وأعد أسوأ هجوم: يوقف الكودُ الرسالةَ، لا النموذج. هذه هي الحماية الحقيقية.",
    takeaway: "لا تثق بنتيجة أداة كأنها مستخدمك. فصل البيانات عن الأوامر، وإعطاء الوكيل الأدوات التي يحتاجها فقط، وفحص كل فعل حقيقي في الكود، توقف الحقن الذي يمرره النموذج وحده.",
  },
};

const MINIMAL: Record<Place, readonly string[]> = { note: ["library"], title: ["library"], via: ["route"] };

export default function Inject({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang } = useI18n();
  const tlang = lang === "ar" ? "ar" : "en";
  const tiny = useTiny();
  const [place, setPlace] = useState<Place>("note");
  const [attackId, setAttackId] = useState<string>("trained-parents");
  const [defs, setDefs] = useState<Set<Defence>>(new Set());
  const [events, setEvents] = useState<Event[] | null>(null);
  const [out, setOut] = useState<Outcome>();
  const [recorded, setRecorded] = useState(false);

  const attack = ATTACKS.find((a) => a.id === attackId);
  const toggle = (d: Defence) => setDefs((x) => { const n = new Set(x); n.has(d) ? n.delete(d) : n.add(d); return n; });

  async function run(armed: boolean) {
    if (tiny.busy) return;
    tiny.setBusy(true); setEvents([]); setOut(undefined);
    const req = requestFor(place);
    const reqTool = req.place.includes("via") ? "route" : "library";
    const tools = defs.has("allowlist") ? MINIMAL[place] : TOOLS;
    const instr = attack ? attackText(attack, tlang) : "";
    const view = (call: { tool: string }, result: unknown) => {
      if (!armed || !attack || call.tool !== reqTool) return result;
      const bad = tamper(result, place, instr);
      if (defs.has("apart") && bad && typeof bad === "object") { const { note, ...rest } = bad as Record<string, unknown>; return rest; }
      return bad;
    };
    const gate = (call: { tool: string; args: Record<string, unknown> }, conv: Parameters<NonNullable<Hooks["gate"]>>[1]) =>
      defs.has("approval") && approvalCheck(call as Parameters<typeof approvalCheck>[0], conv) ? s.gate : null;
    const hooks: Hooks = { view, gate, stopped: () => stopFlag.current };
    const first = `${lang === "ar" ? req.ar : req.en}`;
    try {
      const r1 = await agentTurn(tiny.generate, { tools, turns: [{ role: "user", text: first }] }, tiny.world!, hooks);
      let all: Event[] = r1.events, conv = r1.conv;
      const smuggled = armed && attack && r1.events.some((e) => e.kind === "answer" && !e.byCode && asksApproval(e.text));
      if (smuggled && !r1.stopped && !stopFlag.current) {
        const yes = tlang === "ar" ? "نعم" : "yes";
        const r2 = await agentTurn(tiny.generate, { tools, turns: [...conv.turns, { role: "user", text: yes }] }, tiny.world!, hooks);
        all = [...all, { kind: "user", text: yes }, ...r2.events];
      }
      setEvents(all); setOut(outcome(all, instr));
      onDone?.();
    } catch { setEvents(null); } finally { stopFlag.current = false; tiny.setBusy(false); }
  }

  const stopFlag = useMemo(() => ({ current: false }), []);
  const stop = () => { stopFlag.current = true; tiny.stop(); };

  const body = (
    <div className="stack">
      <div className="stack-sm">
        <Segmented label={s.place} value={place} options={(["note", "title", "via"] as Place[]).map((p) => [p, s.placeName[p]])} onChange={(p) => { setPlace(p); setEvents(null); }} />
        <label className="dr-field-label" htmlFor="lb-inj-atk">{s.attack}</label>
        <select id="lb-inj-atk" className="dr-field-input lb-select" value={attackId} onChange={(e) => { setAttackId(e.target.value); setEvents(null); }}>
          <option value="none">{s.none}</option>
          {ATTACKS.map((a) => <option key={a.id} value={a.id}>{attackText(a, tlang)} — {s.kind[a.kind]}</option>)}
        </select>
        {attack && <p className="lb-note" dir="auto"><Icon name="warning" size={16} /> <bdi dir="auto">{attackText(attack, tlang)}</bdi></p>}
      </div>

      <div className="stack-sm">
        <span className="dr-field-label">{s.defences}</span>
        <div className="lb-fixes" role="group" aria-label={s.defences}>
          {DEFENCES.map((d) => (
            <button key={d} type="button" className={defs.has(d) ? "lb-fix is-on" : "lb-fix"} aria-pressed={defs.has(d)} onClick={() => { toggle(d); setEvents(null); }}>
              <Icon name={defs.has(d) ? "check" : "close"} size={18} />
              <span>{s.def[d]}<span className="lb-fix-rule">{s.defRule[d]}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="lb-runbar">
        {attackId === "none"
          ? <Button size="sm" icon="play" disabled={tiny.busy} onClick={() => run(false)}>{events ? s.again : s.runClean}</Button>
          : <Button size="sm" icon="play" disabled={tiny.busy} onClick={() => run(true)}>{events ? s.again : s.run}</Button>}
      </div>
      {tiny.busy && <Thinking onStop={stop} />}

      {events && !!events.length && (
        <div className="stack-sm">
          {out && <p className={`lb-verdict ${out === "sent" || out === "leaked" ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${out}`}>{s.tag[out]}</span> {s.out[out]}</p>}
          <Transcript events={events} />
        </div>
      )}
    </div>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setEvents(null); setDefs(new Set()); setAttackId("trained-parents"); setPlace("note"); }}>
      {recorded
        ? <><RecordedTag /><Transcript events={RECORDED[tlang]} /><p className="lb-verdict is-warn"><span className="lb-out-tag is-sent">{s.tag.sent}</span> {s.out.sent}</p></>
        : <ModelGate tiny={tiny} onRecorded={() => setRecorded(true)}>{body}</ModelGate>}
    </LabShell>
  );
}
