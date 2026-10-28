import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { Segmented, Slider } from "../../kit/controls";
import { rng } from "../../kit/rng";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { CORPUS, DIMS, END, pick, PROMPTS, show, think, tokenize, train } from "./model";

const MAX_WORDS = 16;
const S = {
  en: {
    intro: "An LLM writes one token at a time, always in the same loop. Follow the loop here, one token at a time, with a tiny model trained on 24 sentences. Every number below is really computed.",
    start: "Start with", temp: "Temperature", safe: "Safe", balanced: "Balanced", wild: "Adventurous", ctx: "How much it uses attention",
    text: "Text so far", next: "Next token", write: "Write to the end", again: "Start again", ended: "The model chose “end of text”.",
    s1: "1. Tokens", s1b: "The text is cut into tokens, and each token has an id number. (Here one token is one word; real models also cut words into pieces.)",
    s2: "2. Numbers", s2b: (n: string) => `Each token becomes a list of numbers that carries its meaning (an embedding). Ours have ${n} numbers; real ones have thousands.`,
    s3: "3. Attention", s3b: (w: string) => `The last token, “${w}”, looks back at every token so far. Tokens that match it, and rare words that carry the meaning, get the most attention. Darker: more attention. The mix becomes the context.`,
    s4: "4. Scores and probabilities", s4b: "Every word that could come next gets a score: how often it followed these words in training, plus how well it fits the context (its fit). Softmax turns scores into probabilities.",
    s5: "5. Pick, then repeat", s5b: (w: string, p: string) => `Picked “${w}” (${p} likely). It is added to the text and the loop starts again.`, s5none: "Press Next token to pick one.",
    end: "end of text", unknown: "unknown", count: { one: "seen once", other: "seen {n}×" } as Forms, fit: (v: string) => `fit ${v}`,
    try1: "Press Next token a few times and follow the loop: step 4 lists the words that could come next with their chances, and step 5 says which one it drew.",
    try2: "When several words could come next, drag “How much it uses attention” between 0 and 4 and watch step 4: the words that fit the earlier words gain. After “The cat sleeps on the” that is “bed”; after “The teacher writes on the”, “board”.",
    try3: "Press Write to the end a few times (Start again in between) with Temperature on Safe, then on Adventurous: safe keeps to the likeliest words; adventurous takes rarer ones, and writes more odd sentences.",
    takeaway: "That loop is all an LLM does: tokens, numbers, attention, probabilities, pick, repeat. Real models do steps 2 to 4 with a neural network of billions of numbers learned from huge amounts of text, which is why they write so well, and why they can be confidently wrong.",
  },
  ar: {
    intro: "يكتب النموذج اللغوي الكبير رمزًا واحدًا في كل مرة، وبالحلقة نفسها دائمًا. تتبّع الحلقة هنا، رمزًا بعد رمز، مع نموذج صغير تدرّب على ٢٤ جملة. كل رقم أدناه محسوب فعلًا.",
    start: "ابدأ بـ", temp: "درجة الحرارة", safe: "حذِر", balanced: "متوازن", wild: "جريء", ctx: "مقدار استعماله للانتباه",
    text: "النص حتى الآن", next: "الرمز التالي", write: "اكتب حتى النهاية", again: "ابدأ من جديد", ended: "اختار النموذج «نهاية النص».",
    s1: "١. الرموز", s1b: "يُقطَّع النص إلى رموز، ولكل رمز رقم تعريف. (هنا الرمز كلمة واحدة، أما النماذج الحقيقية فتقطّع الكلمات أيضًا إلى أجزاء.)",
    s2: "٢. الأرقام", s2b: (n: string) => `يصبح كل رمز قائمة أرقام تحمل معناه (تضمينًا). في نموذجنا ${n} أرقام، وفي النماذج الحقيقية آلاف.`,
    s3: "٣. الانتباه", s3b: (w: string) => `ينظر آخر رمز، «${w}»، إلى كل الرموز السابقة. وتنال أكثرَ الانتباه الرموزُ التي تشبهه، والكلماتُ النادرة التي تحمل المعنى. الأغمق: انتباه أكثر. ويصبح المزيج هو السياق.`,
    s4: "٤. الدرجات والاحتمالات", s4b: "تحصل كل كلمة يمكن أن تأتي بعد ذلك على درجة: كم مرة جاءت بعد هذه الكلمات في التدريب، مضافًا إليها مدى ملاءمتها للسياق (الملاءمة). وتحوّل دالة softmax الدرجات إلى احتمالات.",
    s5: "٥. الاختيار ثم التكرار", s5b: (w: string, p: string) => `اختار «${w}» (احتمالها ${p}). تُضاف إلى النص وتبدأ الحلقة من جديد.`, s5none: "اضغط «الرمز التالي» ليختار.",
    end: "نهاية النص", unknown: "غير معروف", count: { one: "رآها مرة واحدة", two: "رآها مرتين", few: "رآها {n} مرات", other: "رآها {n} مرة" } as Forms, fit: (v: string) => `الملاءمة ${v}`,
    try1: "اضغط «الرمز التالي» بضع مرات وتتبّع الحلقة: تعرض الخطوة ٤ الكلمات التي يمكن أن تأتي بعد ذلك مع احتمالاتها، وتقول الخطوة ٥ أيها اختار.",
    try2: "حين تتعدّد الكلمات الممكنة، حرّك «مقدار استعماله للانتباه» بين ٠ و٤ وراقب الخطوة ٤: تكسب الكلمات التي تلائم ما سبقها. فبعد «المعلم يشرب الشاي بعد» تكسب «الدرس»، لأن الانتباه ينظر إلى «المعلم».",
    try3: "اضغط «اكتب حتى النهاية» بضع مرات (و«ابدأ من جديد» بينها) ودرجة الحرارة على «حذِر»، ثم على «جريء»: يلتزم الحذِر بالكلمات الأرجح، ويأخذ الجريء كلمات أندر فتكثر جمله الغريبة.",
    takeaway: "هذه الحلقة هي كل ما يفعله النموذج اللغوي الكبير: رموز، أرقام، انتباه، احتمالات، اختيار، تكرار. والنماذج الحقيقية تنفّذ الخطوات من ٢ إلى ٤ بشبكة عصبية فيها مليارات الأرقام تعلّمتها من كميات هائلة من النصوص؛ لذلك تكتب جيدًا، ولذلك أيضًا قد تخطئ وهي واثقة.",
  },
};

export default function Llm({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const plural = usePlural();
  const L = lang === "ar" ? "ar" : "en";
  const lm = useMemo(() => train(CORPUS[L]), [L]);
  const [prompt, setPrompt] = useState(PROMPTS[L][0]);
  const [ctx, setCtx] = useState(() => tokenize(lm, prompt).map((t) => t.key));
  const [last, setLast] = useState<{ key: string; p: number } | null>(null);
  const [temp, setTemp] = useState(1);
  const [useCtx, setUseCtx] = useState(1.5);
  const [made, setMade] = useState(0);
  const r = useRef(rng(7));
  const done = last?.key === END || ctx.length >= MAX_WORDS;
  const begin = (p: string) => { loop.stop(); setPrompt(p); setCtx(tokenize(lm, p).map((t) => t.key)); setLast(null); };
  useEffect(() => { begin(PROMPTS[L][0]); }, [L]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (made >= 5) onDone?.(); }, [made >= 5]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = think(lm, ctx, temp, useCtx);
  const advance = () => {
    if (done) return false;
    const w = pick(st.cands, r.current());
    setLast({ key: w, p: st.cands.find((c) => c.key === w)?.p ?? 0 });
    if (w !== END) setCtx((c) => [...c, w]);
    setMade((m) => m + 1);
    return w !== END && ctx.length + 1 < MAX_WORDS;
  };
  // About three tokens a second whatever the screen's frame rate, so the loop can be followed.
  const lastAt = useRef(0);
  const loop = useLoop(() => { const now = performance.now(); if (now - lastAt.current < 330) return true; lastAt.current = now; return advance(); }, { maxPerFrame: 1 });

  const word = (k: string, i?: number) => { if (k === END) return s.end; const w = show(lm, k); return i === 0 && L === "en" ? w[0].toUpperCase() + w.slice(1) : w; };
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const pct = (v: number) => num(v, { style: "percent" });
  const sep = L === "ar" ? "، " : ", ";
  const toks = ctx.map((key) => ({ key, id: lm.ids.get(key) ?? -1 }));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.start} value={prompt} options={PROMPTS[L].map((p) => [p, p] as const)} onChange={begin} />
      <div className="lb-two">
        <Segmented label={s.temp} value={temp} options={[[0.3, s.safe], [1, s.balanced], [1.8, s.wild]]} onChange={setTemp} />
        <Slider label={s.ctx} value={useCtx} min={0} max={4} step={0.5} onChange={setUseCtx} format={(v) => num(v)} />
      </div>
      <span className="dr-field-label">{s.text}</span>
      <p className="lb-llm-text" aria-live="polite">{ctx.map((k, i) => word(k, i)).join(" ")}{done && last?.key === END ? "." : " …"}</p>
      <div className="lb-row">
        <Button size="sm" icon="next" disabled={done || loop.running} onClick={() => advance()}>{s.next}</Button>
        <Button size="sm" variant="secondary" icon={loop.running ? "pause" : "play"} disabled={done && !loop.running} onClick={() => { lastAt.current = 0; loop.toggle(); }}>{s.write}</Button>
        <Button size="sm" variant="ghost" icon="sync" onClick={() => begin(prompt)}>{s.again}</Button>
      </div>
      {last?.key === END && <p className="lb-note">{s.ended}</p>}

      <ol className="lb-pipe">
        <li>
          <h3>{s.s1}</h3><p className="lb-note">{s.s1b}</p>
          <div className="lb-chips is-compact">{toks.map((t, i) => <span key={i} className="lb-tok"><span>{word(t.key, i)}</span><small>{t.id < 0 ? s.unknown : num(t.id)}</small></span>)}</div>
        </li>
        <li>
          <h3>{s.s2}</h3><p className="lb-note">{s.s2b(num(DIMS))}</p>
          <div className="stack-sm">
            {toks.slice(-3).map((t, i) => (
              <p key={i} className="lb-vec"><span>{word(t.key)}</span><span className="lb-mono" dir="ltr">{(lm.emb.get(t.key) ?? new Array<number>(DIMS).fill(0)).map((v, d) => <bdi key={d}>{d ? ", " : "["}{n2(v)}</bdi>)}<bdi>]</bdi></span></p>
            ))}
          </div>
        </li>
        <li>
          <h3>{s.s3}</h3><p className="lb-note">{s.s3b(word(ctx[ctx.length - 1] ?? ""))}</p>
          <div className="lb-chips is-compact">
            {toks.map((t, i) => (
              <span key={i} className={i === toks.length - 1 ? "lb-tok is-on" : "lb-tok"}>
                <span className="lb-attn-heat" style={{ opacity: 0.1 + 0.9 * ((st.attn[i] ?? 0) / Math.max(...st.attn, 1e-9)) }} aria-hidden />
                <span>{word(t.key, i)}</span><small>{pct(st.attn[i] ?? 0)}</small>
              </span>
            ))}
          </div>
        </li>
        <li>
          <h3>{s.s4}</h3><p className="lb-note">{s.s4b}</p>
          <ul className="lb-bars">
            {st.cands.slice(0, 6).map((c) => (
              <li key={c.key} className="lb-bar">
                <span>{word(c.key)} <span className="lb-note">{plural(c.count, s.count)}{c.key === END ? "" : `${sep}${s.fit(n2(c.fit))}`}</span></span>
                <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(c.p * 100)}%` }} /></span>
                <span>{pct(c.p)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <h3>{s.s5}</h3>
          <p className="lb-note">{last ? s.s5b(word(last.key), pct(last.p)) : s.s5none}</p>
        </li>
      </ol>
    </LabShell>
  );
}
