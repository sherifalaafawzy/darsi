import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TOOLS, type Lang, type ToolName, type Turn } from "../../../tinylm";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { runTurn, specOf, type Issue } from "../agentloop/agent";
import { Code, LangPick, TinyGate, Turns, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { EXAMPLES, GROUP_ORDER, notSaid, outcome, TOOL_TEXT, type Example, type Kind } from "./model";

const S = {
  en: {
    intro: "Darsi Tiny reads two things: the list of tools that are on, and your request. From them it picks a tool and fills in what the tool needs, or it says it can't, or it asks you. Switch tools off and try the requests below.",
    tools: "The ten tools (tap to switch one off)", line: "The tools line Darsi Tiny reads",
    needs: "needs", on: "on", off: "off", allOn: "Switch all on",
    lang: "Requests in", own: "Or type your own request", ask: "Ask", stop: "Stop", reply: "Your reply", send: "Reply",
    groups: { use: "It uses a tool", none: "No tool can do it", ask: "A detail is missing", wrong: "Wrong or unknown details", self: "About itself" } as Record<string, string>,
    v: {
      used: (t: string) => `Darsi Tiny picked the ${t} tool and filled in every detail it needs.`,
      off: "The tool it needs is switched off, so Darsi Tiny said so instead of calling it.",
      cant: "None of the ten tools can do this, so Darsi Tiny said “I can't”.",
      ask: "A detail was missing, so Darsi Tiny asked instead of guessing. Reply below.",
      wrong: "Something in the call is wrong. The app should catch this before the tool runs:",
      error: (e: string) => `The call has the right shape, but the tool answered with an error: “${e}”.`,
      other: "Darsi Tiny answered without a tool.",
    } as Record<Kind, string | ((x: string) => string)>,
    issue: {
      off: (t: string) => `${t} is switched off.`, "unknown-tool": (t: string) => `there is no tool called ${t}.`,
      missing: (a: string) => `${a} is missing.`, extra: (a: string) => `${a} is not something this tool takes.`, type: (a: string) => `${a} has the wrong shape.`,
      said: (v: string) => `“${v}” is not in your request: it was copied wrongly or made up.`,
    },
    arg: "Detail", given: "Given", ok: "right", missingShort: "missing", optional: "optional, not given",
    notes: {
      france: "No tool knows capitals. With “What's”, Darsi Tiny says it can't; with “What is”, it guesses the glossary. A small change of words changes what a small model does.",
      ninez: "There is no class 9Z. Darsi Tiny copied it as 9C: it has seen 9C-like names far more often.",
      copy: "Darsi Tiny copied the wrong words into the call. It was never trained on this wording, so it doesn't know where the word starts.",
      self: "Switch a few tools off and ask again: does it still list them? It learned a fixed sentence, so the tools line, not its answer, is the truth.",
    } as Record<string, string>,
    seen: (n: string) => `Ways seen: ${n} of 4 (used a tool, tool off, can't, asked).`,
    try1: "Ask “What's the weather in Kafi tomorrow?”, then switch the weather tool off and ask again.",
    try2: "Ask “What's the weather tomorrow?”: Darsi Tiny asks which village. Reply “Dala”.",
    try3: "Compare “What's the capital of France?” with “What is the capital of France?”, then try “What does 9Z have tomorrow?” and read the check under the call.",
    takeaway: "A model picks a tool by reading the tools list and your words. A good agent says when a tool is off or missing and asks for what it needs, but a small one also guesses and copies wrongly, so the app must check every call.",
  },
  ar: {
    intro: "يقرأ «درسي الصغير» شيئين: قائمة الأدوات العاملة، وطلبك. ومنهما يختار أداة ويملأ ما تحتاجه، أو يقول إنه لا يستطيع، أو يسألك. أوقف بعض الأدوات وجرّب الطلبات أدناه.",
    tools: "الأدوات العشر (المس أداة لإيقافها)", line: "سطر الأدوات الذي يقرؤه «درسي الصغير»",
    needs: "تحتاج", on: "تعمل", off: "متوقفة", allOn: "شغّل الكل",
    lang: "لغة الطلبات", own: "أو اكتب طلبك", ask: "اسأل", stop: "أوقف", reply: "ردّك", send: "ردّ",
    groups: { use: "يستعمل أداة", none: "لا تقدر عليه أي أداة", ask: "ينقص تفصيل", wrong: "تفاصيل خاطئة أو مجهولة", self: "عن نفسه" },
    v: {
      used: (t: string) => `اختار «درسي الصغير» أداة ${t} وملأ كل تفصيل تحتاجه.`,
      off: "الأداة التي يحتاجها متوقفة، فقال «درسي الصغير» ذلك بدل أن يستدعيها.",
      cant: "لا تقدر أي أداة من الأدوات العشر على هذا، فقال «درسي الصغير»: «لا أستطيع».",
      ask: "نقص تفصيل، فسأل «درسي الصغير» بدل أن يخمّن. ردّ أدناه.",
      wrong: "في الاستدعاء خطأ. على التطبيق أن يكتشفه قبل أن تعمل الأداة:",
      error: (e: string) => `شكل الاستدعاء صحيح، لكن الأداة ردّت بخطأ: «${e}».`,
      other: "أجاب «درسي الصغير» دون أداة.",
    },
    issue: {
      off: (t: string) => `${t} متوقفة.`, "unknown-tool": (t: string) => `لا توجد أداة اسمها ${t}.`,
      missing: (a: string) => `${a} ناقص.`, extra: (a: string) => `${a} ليس مما تأخذه هذه الأداة.`, type: (a: string) => `شكل ${a} خاطئ.`,
      said: (v: string) => `«${v}» ليس في طلبك: نُسخ خطأً أو اختُلق.`,
    },
    arg: "التفصيل", given: "القيمة", ok: "صحيح", missingShort: "ناقص", optional: "اختياري، لم يُعطَ",
    notes: {
      france: "لا تعرف أي أداة العواصم. مع «What's» يقول «درسي الصغير» إنه لا يستطيع، ومع «What is» يخمّن المسرد. تغيير صغير في الكلمات يغيّر ما يفعله نموذج صغير.",
      ninez: "لا يوجد صف اسمه 9Z. نسخه «درسي الصغير» على أنه 9C: فقد رأى أسماء مثل 9C أكثر بكثير.",
      copy: "نسخ «درسي الصغير» كلمات خاطئة إلى الاستدعاء. لم يتدرّب قط على هذه الصيغة، فلا يعرف أين تبدأ الكلمة.",
      self: "أوقف بعض الأدوات واسأل مجددًا: هل ما زال يذكرها؟ لقد تعلّم جملة ثابتة، فالحقيقة في سطر الأدوات لا في جوابه.",
    },
    seen: (n: string) => `الحالات التي رأيتها: ${n} من ٤ (استعمل أداة، أداة متوقفة، لا يستطيع، سأل).`,
    try1: "اسأل «ما حالة الطقس في كافي غدًا؟»، ثم أوقف أداة الطقس واسأل مجددًا.",
    try2: "اسأل «كيف الطقس غدًا؟»: يسأل «درسي الصغير» عن القرية. ردّ بـ«دالا».",
    try3: "جرّب «ماذا لدى 9Z غدًا؟» واقرأ الفحص تحت الاستدعاء، ثم «اشرح مصطلح البرمجيات الخبيثة.».",
    takeaway: "يختار النموذج أداته بقراءة قائمة الأدوات وكلماتك. والوكيل الجيد يقول حين تكون الأداة متوقفة أو غير موجودة، ويسأل عمّا يحتاجه؛ لكن النموذج الصغير يخمّن أيضًا وينسخ خطأً، فعلى التطبيق أن يفحص كل استدعاء.",
  },
};

const fn = (x: string | ((v: string) => string), v = "") => (typeof x === "function" ? x(v) : x);

export default function Tools({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui, num } = useI18n();
  const id = useId(), rid = useId();
  const tiny = useTiny();
  const [on, setOn] = useState<Set<string>>(() => new Set(TOOLS));
  const [lang, setLang] = useState<Lang>(ui === "ar" ? "ar" : "en");
  const [ex, setEx] = useState<Example | null>(EXAMPLES[ui === "ar" ? "ar" : "en"][0]);
  const [text, setText] = useState(EXAMPLES[ui === "ar" ? "ar" : "en"][0].text);
  const [reply, setReply] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [toolsUsed, setToolsUsed] = useState<string[]>([...TOOLS]);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(() => new Set<Kind>());
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  const ways = [...seen].filter((k) => k === "used" || k === "off" || k === "cant" || k === "ask").length;
  useEffect(() => { if (ways >= 3) onDone?.(); }, [ways >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  const toolList = TOOLS.filter((t) => on.has(t));
  const res = outcome(turns, toolsUsed);
  const run = async (before: Turn[], said: string) => {
    if (busy || !said.trim()) return;
    setBusy(true);
    stopped.current = false;
    const tools = before.length ? toolsUsed : toolList;
    if (!before.length) setToolsUsed(tools);
    const start: Turn[] = [...before, { role: "user", text: said.trim() }];
    setTurns(start);
    try {
      await tiny.prepare();
      const { turns: done } = await runTurn({ tools, turns: start }, tiny.gen, tiny.run, { stopped: () => stopped.current, onStep: (_, t) => setTurns([...t]) });
      const o = outcome(done, tools);
      if (o) setSeen((x) => new Set(x).add(o.kind === "error" || o.kind === "wrong" ? "used" : o.kind));
      if (o?.kind === "ask") setReply(ex?.reply ?? "");
    } catch { /* TinyGate shows it */ } finally { setBusy(false); }
  };
  const pick = (e: Example) => { if (busy) return; setEx(e); setText(e.text); setTurns([]); };
  const toggle = (t: string) => setOn((x) => { const n = new Set(x); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const call = res?.call;
  const spec = call ? specOf(call.tool) : undefined;
  const said = turns.filter((t) => t.role === "user").map((t) => (t as { text: string }).text);
  const bad = call ? notSaid(call, said) : [];
  const issueText = (i: Issue) => i.kind === "off" || i.kind === "unknown-tool" ? s.issue[i.kind](i.tool) : s.issue[i.kind](i.arg);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.tools}</span>
          <ul className="lb-ag-tools">
            {TOOLS.map((t) => (
              <li key={t}>
                <button type="button" role="switch" aria-checked={on.has(t)} className={on.has(t) ? "lb-ag-tool is-on" : "lb-ag-tool"} onClick={() => toggle(t)} disabled={busy}>
                  <span className="lb-ag-tool-name"><code dir="ltr" translate="no">{t}</code><span>{on.has(t) ? s.on : s.off}</span></span>
                  <span className="lb-ag-tool-what">{TOOL_TEXT[t as ToolName][ui === "ar" ? "ar" : "en"]}. {s.needs} <code dir="ltr" translate="no">{TOOL_TEXT[t as ToolName].args}</code></span>
                </button>
              </li>
            ))}
          </ul>
          {on.size < TOOLS.length && <div className="lb-row"><Button variant="ghost" icon="sync" onClick={() => setOn(new Set(TOOLS))} disabled={busy}>{s.allOn}</Button></div>}
          <span className="dr-field-label">{s.line}</span>
          <Code block text={"<|tools|>" + toolList.join(" ")} />
        </div>
        <div className="stack">
          <LangPick value={lang} onChange={(l) => { setLang(l); pick(EXAMPLES[l][0]); }} label={s.lang} />
          {GROUP_ORDER.map((g) => (
            <div key={g} className="lb-ag-group">
              <span className="lb-note">{s.groups[g]}</span>
              <div className="lb-ag-exs">
                {EXAMPLES[lang].filter((e) => e.group === g).map((e) => (
                  <button key={e.text} type="button" className={e === ex ? "lb-ag-ex is-on" : "lb-ag-ex"} aria-pressed={e === ex} onClick={() => pick(e)}><Txt text={e.text} /></button>
                ))}
              </div>
            </div>
          ))}
          <label className="dr-field-label" htmlFor={id}>{s.own}</label>
          <input id={id} className="dr-field-input" dir="auto" value={text} maxLength={160} disabled={busy} onChange={(e) => { setText(e.target.value); setEx(null); setTurns([]); }} />
          <div className="lb-row">
            {busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button>
              : <Button icon="play" onClick={() => run([], text)} disabled={!text.trim()}>{s.ask}</Button>}
          </div>
          <TinyGate tiny={tiny} onRetry={() => run([], text)} />
        </div>
      </div>
      <Turns turns={turns} live={tiny.live} />
      {res && !busy && (
        <div className="lb-panel" aria-live="polite">
          <p className="lb-verdict">{res.kind === "used" ? fn(s.v.used, call?.tool) : res.kind === "error" ? fn(s.v.error, res.error) : fn(s.v[res.kind])}</p>
          {res.kind === "wrong" && <ul className="lb-ag-issues">{res.issues.map((i, n) => <li key={n}>{issueText(i)}</li>)}{bad.map((v) => <li key={v}><Txt text={s.issue.said(v)} /></li>)}</ul>}
          {call && spec && (
            <div className="lb-scroll" role="region" aria-label={s.arg} tabIndex={0}>
              <table className="lb-dt lb-ag-args">
                <thead><tr><th scope="col">{s.arg}</th><th scope="col">{s.given}</th><th scope="col"><span className="lb-ag-sr">✓</span></th></tr></thead>
                <tbody>
                  {spec.args.map((a) => {
                    const has = a.name in call.args;
                    const problem = res.issues.some((i) => "arg" in i && i.arg === a.name) || (has && bad.includes(String(call.args[a.name])));
                    return (
                      <tr key={a.name} className={problem || (!has && a.required) ? "is-bad" : undefined}>
                        <td><code dir="ltr" translate="no">{a.name}</code></td>
                        <td>{has ? <Code text={JSON.stringify(call.args[a.name])} /> : <span className="lb-note">{a.required ? s.missingShort : s.optional}</span>}</td>
                        <td>{problem || (!has && a.required) ? "✗" : has ? "✓" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ex?.note && <p className="lb-note">{s.notes[ex.note]}</p>}
          {res.kind === "ask" && (
            <div className="lb-ask-row">
              <label className="lb-ag-sr" htmlFor={rid}>{s.reply}</label>
              <input id={rid} className="dr-field-input" size={1} dir="auto" placeholder={s.reply} value={reply} maxLength={120} onChange={(e) => setReply(e.target.value)} />
              <Button icon="next" onClick={() => run(turns, reply)} disabled={!reply.trim()}>{s.send}</Button>
            </div>
          )}
        </div>
      )}
      <p className="lb-note">{s.seen(num(Math.min(4, ways)))}</p>
    </LabShell>
  );
}
