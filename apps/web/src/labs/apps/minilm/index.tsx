import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { usePlural, type Forms } from "../../kit/plural";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { CORPUS, END, generate, isCopy, nextWords, pick, show, train, vocabSize, type Order } from "./model";

const S = {
  en: {
    intro: "A language model learns from text which word tends to come next. This one learns by counting. Change its training sentences, train it, then let it write and look inside each choice.",
    corpus: "Training text (one sentence per line)", train: "Train the model", order: "Looks back", one: "1 word", two: "2 words",
    vocab: "Words it knows", pairs: "Patterns counted", temp: "Temperature", low: "Safe", mid: "Balanced", high: "Adventurous",
    next: "Next word", write: "Write a sentence", clear: "Start over", sentence: "Written so far", empty: "Press Next word or Write a sentence.",
    choices: "Its choices for the next word", end: "(end of sentence)", none: "It has never seen this, so it can't go on.",
    copy: "This sentence is copied from the training text: with little data, a model memorises.", fresh: "This sentence is not in the training text: the model combined patterns it learned.",
    count: { one: "seen once", other: "seen {n}×" } as Forms,
    try1: "Press Next word a few times: the bars show every word that followed the last one in the training text, and how often.",
    try2: "Set Temperature to 0.2 and press Write a sentence a few times (Start over in between): it keeps taking the most common word, so the same sentences come back, and it can even go round in circles. At 2 it takes more chances.",
    try3: "Set Looks back to 2 words and press Train the model: the sentences make more sense, but most of them are copied word for word from the training text.",
    takeaway: "A language model writes one word at a time by predicting what usually comes next. Ours counts the words in your training text; a real LLM uses a huge neural network trained on billions of sentences and looks back thousands of words. Same idea, vastly bigger.",
  },
  ar: {
    intro: "يتعلّم النموذج اللغوي من النصوص أي كلمة تأتي عادةً بعد غيرها. وهذا النموذج يتعلّم بالعدّ. غيّر جمل التدريب، ودرّبه، ثم دعه يكتب وانظر داخل كل اختيار.",
    corpus: "نص التدريب (جملة في كل سطر)", train: "درّب النموذج", order: "ينظر إلى الوراء", one: "كلمة واحدة", two: "كلمتين",
    vocab: "الكلمات التي يعرفها", pairs: "الأنماط المعدودة", temp: "درجة الحرارة", low: "حذِر", mid: "متوازن", high: "جريء",
    next: "الكلمة التالية", write: "اكتب جملة", clear: "ابدأ من جديد", sentence: "ما كُتب حتى الآن", empty: "اضغط «الكلمة التالية» أو «اكتب جملة».",
    choices: "اختياراته للكلمة التالية", end: "(نهاية الجملة)", none: "لم يرَ هذا من قبل، فلا يستطيع المتابعة.",
    copy: "هذه الجملة منسوخة من نص التدريب: حين تقلّ البيانات، يحفظ النموذج حفظًا.", fresh: "هذه الجملة ليست في نص التدريب: جمع النموذج أنماطًا تعلّمها.",
    count: { one: "رآها مرة واحدة", two: "رآها مرتين", few: "رآها {n} مرات", other: "رآها {n} مرة" } as Forms,
    try1: "اضغط «الكلمة التالية» بضع مرات: تعرض الأشرطة كل كلمة جاءت بعد الكلمة الأخيرة في نص التدريب، وكم مرة جاءت.",
    try2: "اضبط درجة الحرارة على ٠٫٢ واضغط «اكتب جملة» بضع مرات (و«ابدأ من جديد» بينها): يأخذ دائمًا تقريبًا الكلمة الأشيع، فتعود الجمل نفسها. وعند ٢ يجازف أكثر فتتنوّع جمله.",
    try3: "اختر «ينظر إلى الوراء: كلمتين» واضغط «درّب النموذج»: تصبح الجمل أكثر منطقية، لكن معظمها منسوخ كلمة بكلمة من نص التدريب.",
    takeaway: "يكتب النموذج اللغوي كلمة بعد كلمة بتوقّع ما يأتي عادةً بعدها. نموذجنا يعدّ الكلمات في نص التدريب، أما النموذج اللغوي الكبير فيستخدم شبكة عصبية ضخمة دُرّبت على مليارات الجمل وينظر إلى آلاف الكلمات السابقة. الفكرة نفسها، بحجم أكبر بكثير.",
  },
};

export default function MiniLm({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const plural = usePlural();
  const [text, setText] = useState(lang === "ar" ? CORPUS.ar : CORPUS.en);
  const [order, setOrder] = useState<Order>(1);
  const [trained, setTrained] = useState({ text, order });
  const model = useMemo(() => train(trained.text, trained.order), [trained]);
  const [temp, setTemp] = useState(1);
  const [out, setOut] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  // Switching language switches the training text, and retrains on it.
  useEffect(() => { const t = lang === "ar" ? CORPUS.ar : CORPUS.en; setText(t); setTrained((p) => (p.text === t ? p : { text: t, order: p.order })); }, [lang]);
  useEffect(() => { setOut([]); setDone(false); }, [model]);

  const choices = done ? [] : nextWords(model, out, temp);
  const stepWord = () => { const w = pick(choices, Math.random()); if (w === END) setDone(true); else setOut([...out, w]); };
  const writeAll = () => { const ws = generate(model, temp, Math.random, 14, out); setOut(ws); setDone(true); onDone?.(); };
  const pairs = [...model.counts.values()].reduce((a, m) => a + m.size, 0);
  const finished = done || (out.length > 0 && !choices.length);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <div className="dr-field">
            <label htmlFor="lm-corpus" className="dr-field-label">{s.corpus}</label>
            <textarea id="lm-corpus" className="dr-field-input" rows={8} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Segmented label={s.order} value={order} options={[[1, s.one], [2, s.two]]} onChange={setOrder} />
          <div className="lb-row">
            <Button size="sm" icon="sync" disabled={text === trained.text && order === trained.order} onClick={() => setTrained({ text, order })}>{s.train}</Button>
          </div>
          <Stats items={[{ label: s.vocab, value: num(vocabSize(model)) }, { label: s.pairs, value: num(pairs) }]} />
        </div>
        <div className="stack">
          <Slider label={s.temp} value={temp} min={0.2} max={2} step={0.1} format={(v) => `${num(v)} (${v < 0.7 ? s.low : v > 1.3 ? s.high : s.mid})`} onChange={setTemp} />
          <div className="lb-panel" aria-live="polite">
            <span className="dr-field-label">{s.sentence}</span>
            <p className="lb-big" dir="auto">{out.length ? show(model, out) : <span className="lb-note">{s.empty}</span>}</p>
            {finished && out.length > 0 && <p className={isCopy(model, out) ? "notice" : "notice ok"}>{isCopy(model, out) ? s.copy : s.fresh}</p>}
          </div>
          <div className="lb-row">
            <Button size="sm" icon="next" disabled={finished} onClick={stepWord}>{s.next}</Button>
            <Button size="sm" variant="secondary" disabled={finished} onClick={writeAll}>{s.write}</Button>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => { setOut([]); setDone(false); }}>{s.clear}</Button>
          </div>
          {!finished && (
            <div className="stack-sm">
              <span className="dr-field-label">{s.choices}</span>
              {choices.length === 0 ? <p className="lb-note">{s.none}</p> : (
                <ul className="lb-bars">
                  {choices.slice(0, 6).map((c) => (
                    <li key={c.word} className="lb-bar">
                      <span dir="auto">{c.word === END ? s.end : model.surface.get(c.word) ?? c.word} <span className="lb-note">{plural(c.count, s.count)}</span></span>
                      <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(c.p * 100)}%` }} /></span>
                      <span>{num(c.p, { style: "percent" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </LabShell>
  );
}
