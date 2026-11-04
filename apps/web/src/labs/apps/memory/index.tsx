import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { renderPrompt, TOOLS, type Lang, type Turn } from "../../../tinylm";
import { Segmented, Slider } from "../../kit/controls";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { advance, nextOf, type GenResult } from "../agentloop/agent";
import { Code, LangPick, TinyGate, Turns, Txt, useStopWhenHidden, useTiny } from "../agentloop/lab-agents";
import { BIG_WINDOW, fit, RESERVE, SCRIPT, toolsCost, turnCost, turnText, visible, type Fate, type Strategy } from "./model";

const S = {
  en: {
    intro: "A language model sees only a window of tokens: the tools line, the conversation so far, and room to write. Darsi Tiny's window holds 384 tokens, about three or four requests. Send messages and watch the window fill, then choose what the app does when it's full.",
    strategy: "When the window is full", all: "Keep everything", drop: "Drop the oldest", notes: "Keep notes",
    explain: {
      all: "Everything stays. When there's no room left, Darsi Tiny stops mid-answer, then can't answer at all.",
      drop: "The oldest turns fall out of the window, one at a time. Darsi Tiny no longer sees them.",
      notes: "Finished requests keep only what was asked and answered: their plan stays, the tool call and result go. The oldest fall out only if that's still too much.",
    } as Record<Strategy, string>,
    size: "Window size", tokens: (n: string) => `${n} tokens`,
    lang: "Messages in", next: "Send the next message", own: "Or type a message", send: "Send", stop: "Stop", fresh: "New conversation",
    used: (u: string, w: string) => `In the window: ${u} of ${w} tokens.`, room: (r: string) => `${r} tokens are kept free for Darsi Tiny to write.`,
    legend: { tools: "tools line", user: "you", plan: "plan", call: "call", result: "result", answer: "answer", free: "free" } as Record<string, string>,
    fate: { out: "fell out", noted: "dropped by the notes" } as Record<string, string>,
    count: { one: "{n} token", other: "{n} tokens" } as Forms,
    cut: "Darsi Tiny ran out of room in its window and stopped mid-way.",
    full: "The window is full: nothing more fits. Start a new conversation, or let the app drop or shorten old turns.",
    read: (p: string, r: string, w: string) => `Last step: Darsi Tiny read ${p} tokens (${r} of them kept from the step before) and wrote ${w}.`,
    sees: "What Darsi Tiny sees now", allSent: "All the messages are sent. Start a new conversation to try another way.",
    big: (n: string) => `Large cloud models read about ${n} tokens at once (typical in 2026), so a chat rarely fills their window. They still forget what doesn't fit, and long windows cost time and money, so apps keep notes too.`,
    try1: "With “Keep everything”, send the messages one by one. The fourth answer is cut off, and after it nothing fits.",
    try2: "Start again with “Drop the oldest” and the window at 128 tokens. When you say “yes”, the question has fallen out; and “Dala” gets today's weather, because “tomorrow” fell out.",
    try3: "Start again with “Keep notes” at 384: all seven messages work, because finished requests keep only the question and the answer.",
    takeaway: "The context window is a model's only memory: what doesn't fit falls out and is forgotten. Apps decide what stays, and short notes keep what matters in fewer tokens.",
  },
  ar: {
    intro: "لا يرى النموذج اللغوي إلا نافذة من التوكنز (قطع النص): سطر الأدوات، والمحادثة حتى الآن، ومساحة ليكتب. تتسع نافذة «درسي الصغير» لـ٣٨٤ توكنًا، أي نحو ثلاثة طلبات أو أربعة. أرسل رسائل وراقب النافذة وهي تمتلئ، ثم اختر ما يفعله التطبيق حين تمتلئ.",
    strategy: "حين تمتلئ النافذة", all: "احتفظ بكل شيء", drop: "أسقِط الأقدم", notes: "احتفظ بملاحظات",
    explain: {
      all: "يبقى كل شيء. وحين لا تبقى مساحة، يتوقف «درسي الصغير» في منتصف الجواب، ثم لا يستطيع أن يجيب أصلًا.",
      drop: "تسقط أقدم الأدوار من النافذة واحدًا بعد الآخر، فلا يراها «درسي الصغير» بعد ذلك.",
      notes: "تحتفظ الطلبات المنتهية بما سُئل وما أُجيب فقط: تبقى خطتها، ويذهب استدعاء الأداة ونتيجتها. ولا يسقط الأقدم إلا إن بقي ذلك كثيرًا.",
    },
    size: "حجم النافذة", tokens: (n: string) => `${n} توكنًا`,
    lang: "لغة الرسائل", next: "أرسل الرسالة التالية", own: "أو اكتب رسالة", send: "أرسل", stop: "أوقف", fresh: "محادثة جديدة",
    used: (u: string, w: string) => `في النافذة: ${u} من ${w} توكنًا.`, room: (r: string) => `يبقى مكان فارغ لـ${r} توكنًا يكتبها «درسي الصغير».`,
    legend: { tools: "سطر الأدوات", user: "أنت", plan: "الخطة", call: "الاستدعاء", result: "النتيجة", answer: "الجواب", free: "فارغ" },
    fate: { out: "سقط من النافذة", noted: "حذفته الملاحظات" },
    count: { zero: "لا توكنز", one: "توكن واحد", two: "توكنان", few: "{n} توكنز", many: "{n} توكنًا", other: "{n} توكن" },
    cut: "نفدت المساحة في نافذة «درسي الصغير» فتوقف في منتصف الطريق.",
    full: "امتلأت النافذة: لا يتسع لشيء آخر. ابدأ محادثة جديدة، أو دع التطبيق يُسقط الأدوار القديمة أو يختصرها.",
    read: (p: string, r: string, w: string) => `آخر خطوة: قرأ «درسي الصغير» ${p} توكنًا (${r} منها محفوظة من الخطوة السابقة) وكتب ${w}.`,
    sees: "ما يراه «درسي الصغير» الآن", allSent: "أُرسلت كل الرسائل. ابدأ محادثة جديدة لتجرّب طريقة أخرى.",
    big: (n: string) => `تقرأ النماذج السحابية الكبيرة نحو ${n} توكن دفعة واحدة (هذا المعتاد في ٢٠٢٦)، فنادرًا ما تملأ المحادثة نافذتها. لكنها أيضًا تنسى ما لا يتسع، والنوافذ الطويلة تكلّف وقتًا ومالًا، لذا تحتفظ التطبيقات بملاحظات أيضًا.`,
    try1: "مع «احتفظ بكل شيء» أرسل الرسائل واحدة بعد الأخرى. ينقطع الجواب الرابع، ثم لا يتسع لشيء بعده.",
    try2: "ابدأ من جديد مع «أسقِط الأقدم» والنافذة على ١٢٨ توكنًا. حين تقول «نعم» يكون السؤال قد سقط؛ فانظر ماذا يفعل «درسي الصغير».",
    try3: "ابدأ من جديد مع «احتفظ بملاحظات» على ٣٨٤: تنجح الرسائل السبع كلها، لأن الطلبات المنتهية لا تحتفظ إلا بالسؤال والجواب.",
    takeaway: "نافذة السياق هي ذاكرة النموذج الوحيدة: ما لا يتسع يسقط ويُنسى. والتطبيق هو الذي يقرر ما يبقى، والملاحظات القصيرة تحفظ المهم بتوكنز أقل.",
  },
};

const ROLES = ["user", "plan", "call", "result", "answer"] as const;

export default function Memory({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang: ui, num } = useI18n();
  const plural = usePlural();
  const id = useId();
  const tiny = useTiny();
  const [lang, setLang] = useState<Lang>(ui === "ar" ? "ar" : "en");
  const [strategy, setStrategy] = useState<Strategy>("all");
  const [size, setSize] = useState(384);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cost, setCost] = useState<number[]>([]);
  const [head, setHead] = useState(0);
  const [fate, setFate] = useState<Fate[]>([]);
  const [sent, setSent] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [cut, setCut] = useState(false);
  const [full, setFull] = useState(false);
  const [last, setLast] = useState<GenResult | null>(null);
  const [lessons, setLessons] = useState({ out: false, notes: false });
  const counts = useRef(new Map<string, number>());
  const stopped = useRef(false);
  const stop = () => { stopped.current = true; tiny.lm.stop(); };
  useStopWhenHidden(busy, stop);
  useEffect(() => { if (lessons.out && lessons.notes) onDone?.(); }, [lessons.out && lessons.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const tokens = async (t: string) => {
    const c = counts.current.get(t);
    if (c !== undefined) return c;
    const n = (await tiny.lm.tokenize(t)).ids.length;
    counts.current.set(t, n);
    return n;
  };
  const costs = async (ts: Turn[]) => { const out: number[] = []; for (const t of ts) out.push(turnCost(t, await tokens(turnText(t)))); return out; };

  const reset = () => { if (busy) return; setTurns([]); setCost([]); setFate([]); setSent(0); setCut(false); setFull(false); setLast(null); };
  const send = async (msg: string, fromScript: boolean) => {
    if (busy || !msg.trim() || full) return;
    setBusy(true);
    stopped.current = false;
    setCut(false);
    try {
      await tiny.prepare();
      const h = toolsCost(await tokens(TOOLS.join(" ")));
      setHead(h);
      let t: Turn[] = [...turns, { role: "user", text: msg.trim() }];
      let lastFate: Fate[] = [...fate];
      if (fromScript) setSent((n) => n + 1);
      setTurns(t);
      for (let k = 0; k < 8 && nextOf(t) !== "done" && !stopped.current; k++) {
        if (nextOf(t) === "tool") { const { add } = await advance({ tools: TOOLS, turns: t }, tiny.gen, tiny.run); t = [...t, ...add]; setTurns(t); continue; }
        const c = await costs(t);
        const w = fit(t, c, h, size, strategy);
        setCost(c); setFate(w.fate);
        lastFate = w.fate;
        if (w.fate.includes("out")) setLessons((x) => (x.out ? x : { ...x, out: true }));
        const room = size - w.used;
        if (room <= 4) {
          // Nothing fits: the message doesn't go in (it would have no room for an answer).
          if (k === 0) { t = t.slice(0, -1); setTurns(t); if (fromScript) setSent((n) => n - 1); }
          setFull(true);
          break;
        }
        const { out, add } = await advance({ tools: TOOLS, turns: visible(t, w.fate) }, tiny.gen, tiny.run, undefined, room);
        if ("gen" in out) setLast(out.gen);
        t = [...t, ...add];
        setTurns(t);
        if ((out.kind === "answer" && out.cut) || out.kind === "bad") { setCut(true); break; }
        if (out.kind === "stopped") break;
      }
      setCost(await costs(t));
      setFate([...lastFate, ...t.slice(lastFate.length).map((): Fate => "kept")]);
      if (strategy === "notes" && t[t.length - 1]?.role === "answer") setLessons((x) => ({ ...x, notes: true }));
      setText("");
    } catch { /* TinyGate shows it */ } finally { setBusy(false); }
  };

  const script = SCRIPT[lang];
  const kept = turns.map((_, i) => fate[i] ?? "kept");
  // A cut-off answer has no end marker, so the sum can pass the window by one: the window itself never does.
  const used = Math.min(size, head + kept.reduce((a, f, i) => a + (f === "kept" ? cost[i] ?? 0 : 0), 0));
  const pct = (n: number) => `${Math.max(0, Math.min(100, (100 * n) / size))}%`;
  const notes = (i: number) => (
    <span className="lb-ag-cost">
      <span>{cost[i] !== undefined ? plural(cost[i], s.count) : ""}</span>
      {kept[i] !== "kept" && <strong>{s.fate[kept[i]]}</strong>}
    </span>
  );

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.strategy} value={strategy} options={[["all", s.all], ["drop", s.drop], ["notes", s.notes]] as const} onChange={(v) => { if (!busy) { setStrategy(v); reset(); } }} />
          <p className="lb-note">{s.explain[strategy]}</p>
          <Slider label={s.size} value={size} min={128} max={384} step={32} onChange={(v) => { if (!busy) { setSize(v); reset(); } }} format={(v) => s.tokens(num(v))} disabled={busy} />
          <LangPick value={lang} onChange={(l) => { if (!busy) { setLang(l); reset(); } }} label={s.lang} />
        </div>
        <div className="stack">
          {sent < script.length
            ? <ol className="lb-ag-script">{script.map((m, i) => <li key={i} className={i < sent ? "is-done" : i === sent ? "is-next" : undefined}><Txt text={m} /></li>)}</ol>
            : <p className="lb-note">{s.allSent}</p>}
          <div className="lb-row">
            {busy ? <Button variant="secondary" icon="pause" onClick={stop}>{s.stop}</Button>
              : <Button icon="next" onClick={() => send(script[sent], true)} disabled={sent >= script.length || full}>{s.next}</Button>}
            {!busy && turns.length > 0 && <Button variant="ghost" icon="sync" onClick={reset}>{s.fresh}</Button>}
          </div>
          <div className="lb-ask-row">
            <label className="lb-ag-sr" htmlFor={id}>{s.own}</label>
            <input id={id} className="dr-field-input" size={1} dir="auto" placeholder={s.own} value={text} maxLength={120} disabled={busy || full} onChange={(e) => setText(e.target.value)} />
            <Button variant="secondary" icon="chat" onClick={() => send(text, false)} disabled={busy || full || !text.trim()}>{s.send}</Button>
          </div>
          <TinyGate tiny={tiny} onRetry={() => send(script[sent] ?? text, false)} />
        </div>
      </div>

      <div className="stack" aria-live="polite">
        <div className="lb-ag-meter" role="img" aria-label={s.used(num(used), num(size))}>
          {head > 0 && <span className="is-tools" style={{ inlineSize: pct(head) }} />}
          {turns.map((t, i) => kept[i] === "kept" && cost[i] ? <span key={i} className={`is-${t.role}`} style={{ inlineSize: pct(cost[i]) }} /> : null)}
        </div>
        <ul className="lb-ag-legend">
          {(["tools", ...ROLES, "free"] as const).map((r) => <li key={r}><span className={`lb-ag-key is-${r}`} />{s.legend[r]}</li>)}
        </ul>
        <p className="lb-note">{s.used(num(used), num(size))} {s.room(num(RESERVE))}</p>
        {cut && <p className="lb-verdict is-warn">{s.cut}</p>}
        {full && <p className="lb-verdict is-warn">{s.full}</p>}
        {last && <p className="lb-note">{s.read(num(last.promptTokens), num(last.reused), num(last.ids.length))}</p>}
      </div>
      <Turns turns={turns} live={tiny.live} out={(i) => kept[i] !== "kept"} notes={notes} />
      {turns.length > 0 && (
        <details className="lb-doc">
          <summary>{s.sees}</summary>
          <Code block text={renderPrompt({ tools: TOOLS, turns: visible(turns, kept) })} />
        </details>
      )}
      <p className="lb-note">{s.big(num(BIG_WINDOW))}</p>
    </LabShell>
  );
}
