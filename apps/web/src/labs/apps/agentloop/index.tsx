import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { renderPrompt, TOOLS, type Lang, type Turn } from "../../../tinylm";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { advance, nextOf, type StepOut } from "./agent";
import { EXAMPLES, stageOf, STAGES, type Stage } from "./model";
import { Code, Examples, LangPick, TinyGate, Turns, useStopWhenHidden, useTiny, useTinyS } from "./lab-agents";

const S = {
  en: {
    intro: "An AI agent is a language model in a loop: it reads a request, writes a plan, asks for a tool, reads the tool's result, and answers. Here the model is Darsi Tiny, small enough to run on this phone. Pick a request and take it one step at a time.",
    examples: "Requests to try", lang: "Requests in", own: "Or type your own request", ownHint: "Darsi Tiny only knows school requests like these. Anything else gets “I can't”, or a wrong guess.",
    step: "One step", all: "Run to the end", again: "New request", stop: "Stop",
    next: {
      start: "Next: you send the request.", plan: "Next: Darsi Tiny writes a short plan.", call: "Next: Darsi Tiny writes a tool call.",
      answer: "Next: Darsi Tiny answers without a tool.", tool: "Next: the app runs the tool and adds its result.",
      after: "Next: Darsi Tiny reads the result, then writes another call or the answer.", done: "Done: the answer ends this turn.",
    } as Record<string, string>,
    stage: { request: "Request", plan: "Plan", call: "Tool call", result: "Result", answer: "Answer" } as Record<Stage, string>,
    whoStage: { request: "you", plan: "Darsi Tiny", call: "Darsi Tiny", result: "the app", answer: "Darsi Tiny" } as Record<Stage, string>,
    again2: "as often as needed",
    bad: "Darsi Tiny wrote something that isn't a tool call the app can read, so the loop stops here.",
    tokens: { one: "{n} token", other: "{n} tokens" } as Forms,
    wrote: (n: string, s: string, r: string) => `Darsi Tiny wrote ${n} in ${s} s (${r} a second) on this phone.`,
    sees: "What Darsi Tiny sees", seesNote: "The whole conversation is one text. Markers like <|call|> are single tokens; only the app adds them, and only the app runs tools.",
    done: (n: string) => `Requests answered: ${n} of 3.`,
    try1: "Pick “What's the weather in Kafi tomorrow?” and press One step five times: your request, the plan, the tool call, the result (from the app, not the model) and the answer.",
    try2: "Run the trip from Kafi to Dala: Darsi Tiny calls two tools, one after the other, before it answers.",
    try3: "Open “What Darsi Tiny sees”: the plan, the call and the result are all one text, and the loop is the app adding to it.",
    takeaway: "An agent is a loop around a language model: the model writes a plan and a tool call as text, the app runs the tool and adds the result, and the model goes on until it can answer.",
  },
  ar: {
    intro: "الوكيل الذكي نموذج لغوي يعمل في حلقة: يقرأ الطلب، ويكتب خطة، ويطلب أداة، ويقرأ نتيجتها، ثم يجيب. والنموذج هنا «درسي الصغير»، وهو صغير بما يكفي ليعمل على هذا الهاتف. اختر طلبًا وتابعه خطوة بخطوة.",
    examples: "طلبات لتجرّبها", lang: "لغة الطلبات", own: "أو اكتب طلبك", ownHint: "لا يعرف «درسي الصغير» إلا طلبات مدرسية مثل هذه. وأي طلب آخر يلقى «لا أستطيع» أو تخمينًا خاطئًا.",
    step: "خطوة واحدة", all: "شغّل حتى النهاية", again: "طلب جديد", stop: "أوقف",
    next: {
      start: "التالي: ترسل أنت الطلب.", plan: "التالي: يكتب «درسي الصغير» خطة قصيرة.", call: "التالي: يكتب «درسي الصغير» استدعاء أداة.",
      answer: "التالي: يجيب «درسي الصغير» دون أداة.", tool: "التالي: يشغّل التطبيق الأداة ويضيف نتيجتها.",
      after: "التالي: يقرأ «درسي الصغير» النتيجة، ثم يكتب استدعاءً آخر أو الجواب.", done: "انتهى: الجواب يُنهي هذا الدور.",
    },
    stage: { request: "الطلب", plan: "الخطة", call: "استدعاء أداة", result: "النتيجة", answer: "الجواب" },
    whoStage: { request: "أنت", plan: "درسي الصغير", call: "درسي الصغير", result: "التطبيق", answer: "درسي الصغير" },
    again2: "بقدر الحاجة",
    bad: "كتب «درسي الصغير» شيئًا ليس استدعاء أداة يستطيع التطبيق قراءته، فتتوقف الحلقة هنا.",
    tokens: { zero: "{n} توكن", one: "توكنًا واحدًا", two: "توكنين", few: "{n} توكنز", many: "{n} توكنًا", other: "{n} توكن" } as Forms,
    wrote: (n: string, s: string, r: string) => `كتب «درسي الصغير» ${n} في ${s} ثانية (${r} في الثانية) على هذا الهاتف.`,
    sees: "ما يراه «درسي الصغير»", seesNote: "المحادثة كلها نص واحد. والعلامات مثل <|call|> توكن واحد لكل منها، لا يضيفها إلا التطبيق، ولا يشغّل الأدوات إلا التطبيق.",
    done: (n: string) => `الطلبات التي أُجيبت: ${n} من ٣.`,
    try1: "اختر «ما حالة الطقس في كافي غدًا؟» واضغط «خطوة واحدة» خمس مرات: طلبك، ثم الخطة، ثم استدعاء الأداة، ثم النتيجة (من التطبيق لا من النموذج)، ثم الجواب.",
    try2: "شغّل الرحلة من كافي إلى دالا: يستدعي «درسي الصغير» أداتين، واحدة بعد الأخرى، قبل أن يجيب.",
    try3: "افتح «ما يراه درسي الصغير»: الخطة والاستدعاء والنتيجة كلها نص واحد، والحلقة هي التطبيق يضيف إليه.",
    takeaway: "الوكيل حلقة حول نموذج لغوي: يكتب النموذج خطة واستدعاء أداة نصًّا، ويشغّل التطبيق الأداة ويضيف نتيجتها، ويتابع النموذج حتى يستطيع أن يجيب.",
  },
};

export default function AgentLoop({ meta, onDone }: LabProps) {
  const s = useS(S);
  const ts = useTinyS();
  const { lang: ui, num } = useI18n();
  const plural = usePlural();
  const id = useId();
  const tiny = useTiny();
  const [lang, setLang] = useState<Lang>(ui === "ar" ? "ar" : "en");
  const [text, setText] = useState(EXAMPLES[ui === "ar" ? "ar" : "en"][0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [last, setLast] = useState<StepOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(() => new Set<string>());
  const [stats, setStats] = useState({ tokens: 0, ms: 0 });
  const stopped = useRef(false);
  useStopWhenHidden(busy, () => { stopped.current = true; tiny.lm.stop(); });
  useEffect(() => { if (answered.size >= 3) onDone?.(); }, [answered.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setTurns([]); setLast(null); setStats({ tokens: 0, ms: 0 }); };
  const pick = (x: string) => { if (busy) return; setText(x); reset(); };

  /** One step, or every step to the answer. */
  const go = async (all: boolean) => {
    if (busy || !text.trim()) return;
    setBusy(true);
    stopped.current = false;
    try {
      await tiny.prepare();
      let cur: Turn[] = turns.length && nextOf(turns) !== "done" ? turns : [{ role: "user", text: text.trim() }];
      if (cur !== turns) { setTurns(cur); setLast(null); setStats({ tokens: 0, ms: 0 }); if (!all) return; }
      for (let i = 0; i < 8 && nextOf(cur) !== "done" && !stopped.current; i++) {
        const { out, add } = await advance({ tools: TOOLS, turns: cur }, tiny.gen, tiny.run);
        cur = [...cur, ...add];
        setTurns(cur);
        setLast(out);
        if ("gen" in out) { const g = out.gen; setStats((x) => ({ tokens: x.tokens + g.ids.length, ms: x.ms + g.decodeMs + g.prefillMs })); }
        if (out.kind === "answer") setAnswered((a) => new Set(a).add(text.trim()));
        if (out.kind === "bad" || out.kind === "stopped" || !all) break;
      }
    } catch { /* TinyGate shows what went wrong */ } finally { setBusy(false); }
  };

  const nx = nextOf(turns);
  const nextKey = !turns.length ? "start" : nx === "plan" ? "plan" : nx === "tool" ? "tool" : nx === "done" ? "done"
    : turns[turns.length - 1].role === "result" ? "after" : last?.kind === "plan" && last.then === "answer" ? "answer" : "call";
  const st = stageOf(turns, last?.kind === "plan" ? last.then : null);
  const sec = stats.ms / 1000;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <LangPick value={lang} onChange={(l) => { setLang(l); pick(EXAMPLES[l][0]); }} label={s.lang} />
          <Examples items={EXAMPLES[lang]} value={text} onPick={pick} label={s.examples} />
          <label className="dr-field-label" htmlFor={id}>{s.own}</label>
          <input id={id} className="dr-field-input" dir="auto" value={text} maxLength={160} disabled={busy} onChange={(e) => { setText(e.target.value); reset(); }} />
          <p className="lb-note">{s.ownHint}</p>
          <div className="lb-row">
            {busy
              ? <Button variant="secondary" icon="pause" onClick={() => { stopped.current = true; tiny.lm.stop(); }}>{s.stop}</Button>
              : <>
                  <Button icon="next" onClick={() => go(false)} disabled={!text.trim() || nx === "done" && turns.length > 0}>{s.step}</Button>
                  <Button variant="secondary" icon="play" onClick={() => go(true)} disabled={!text.trim() || nx === "done" && turns.length > 0}>{s.all}</Button>
                  {turns.length > 0 && <Button variant="ghost" icon="sync" onClick={reset}>{s.again}</Button>}
                </>}
          </div>
          <TinyGate tiny={tiny} onRetry={() => go(false)} />
        </div>
        <div className="stack">
          <span className="dr-field-label">{ts.loop}</span>
          <ol className="lb-ag-loop">
            {STAGES.map((g) => (
              <li key={g} className={st.done.has(g) ? "is-done" : st.next === g ? "is-next" : undefined}>
                <strong>{s.stage[g]}</strong><span>{s.whoStage[g]}</span>{g === "result" && <small>↺ {s.again2}</small>}
              </li>
            ))}
          </ol>
          <p className="lb-verdict" aria-live="polite">{s.next[nextKey]}</p>
          {last?.kind === "bad" && <p className="lb-verdict is-warn">{s.bad} <Code text={last.text.slice(0, 80)} /></p>}
          {stats.tokens > 0 && <p className="lb-note">{s.wrote(plural(stats.tokens, s.tokens), num(Math.round(sec * 10) / 10), num(Math.round(stats.tokens / Math.max(sec, 0.001))))}</p>}
        </div>
      </div>
      <Turns turns={turns} live={tiny.live} label={ts.loop} />
      {turns.length > 0 && (
        <details className="lb-doc">
          <summary>{s.sees}</summary>
          <p className="lb-note">{s.seesNote}</p>
          <Code block text={renderPrompt({ tools: TOOLS, turns })} />
        </details>
      )}
      <p className="lb-note">{s.done(num(Math.min(3, answered.size)))}</p>
    </LabShell>
  );
}
