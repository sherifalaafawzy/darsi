import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { attend, FEATURES, matrix, SENTENCES } from "./model";

type Id = keyof typeof SENTENCES;
const S = {
  en: {
    intro: "In “The dog drank the milk because it was hungry”, how does a model know that “it” is the dog? With attention: the word asks a question, every word offers a label, and the best matches get most of its attention.",
    sentence: "Sentence ending", names: { hungry: "…hungry", fresh: "…fresh", strong: "…strong", light: "…light", reads: "reads" } as Record<Id, string>,
    tap: "Tap a word to see what it pays attention to", looks: (w: string) => `What “${w}” pays attention to`,
    question: "Its question (query)", match: "Match", share: "Share of attention", word: "Word",
    meaning: (w: string) => `What “${w}” means after attention (the mix it takes from the words)`,
    feature: { alive: "alive", thing: "thing", action: "action", quality: "describes" } as Record<(typeof FEATURES)[number], string>,
    focus: "How sharply it focuses", all: "Every word does this at once (row: the word asking; darker: more attention)",
    takeaway: "Attention lets each word gather meaning from the words that matter to it. An LLM runs dozens of attention layers with many “heads” each, and learns the question and label numbers itself instead of us setting them by hand.",
  },
  ar: {
    intro: "في جملة «شرب الكلب الحليب لأنه كان جائعًا»، كيف يعرف النموذج أن الضمير في «لأنه» يعود إلى الكلب؟ بالانتباه: تطرح الكلمة سؤالًا، وتقدّم كل كلمة وصفًا لنفسها، وتنال أنسب الكلمات معظم الانتباه.",
    sentence: "آخر الجملة", names: { hungry: "…جائعًا", fresh: "…طازجًا", strong: "…قويًا", light: "…خفيفًا", reads: "يقرأ" } as Record<Id, string>,
    tap: "المس كلمة لترى إلامَ تنتبه", looks: (w: string) => `إلامَ تنتبه «${w}»`,
    question: "سؤالها (الاستعلام)", match: "التطابق", share: "حصة الانتباه", word: "الكلمة",
    meaning: (w: string) => `معنى «${w}» بعد الانتباه (المزيج الذي تأخذه من الكلمات)`,
    feature: { alive: "حيّ", thing: "شيء", action: "فعل", quality: "صفة" } as Record<(typeof FEATURES)[number], string>,
    focus: "حدّة التركيز", all: "كل الكلمات تفعل هذا في آنٍ واحد (الصف: الكلمة السائلة، والأغمق: انتباه أكثر)",
    takeaway: "يتيح الانتباه لكل كلمة أن تجمع المعنى من الكلمات التي تهمّها. والنموذج اللغوي الكبير يشغّل عشرات طبقات الانتباه، في كل منها «رؤوس» كثيرة، ويتعلّم أرقام الأسئلة والأوصاف بنفسه بدل أن نضعها نحن يدويًا.",
  },
};

export default function Attention({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const [id, setId] = useState<Id>("hungry");
  const toks = SENTENCES[id][lang === "ar" ? "ar" : "en"];
  const [sel, setSel] = useState(() => toks.findIndex((x) => x.focus));
  const [focus, setFocus] = useState(3);
  const [seen, setSeen] = useState(() => new Set<Id>(["hungry"]));
  useEffect(() => { setSel(toks.findIndex((x) => x.focus)); }, [id, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (seen.size >= 3) onDone?.(); }, [seen.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const i = Math.max(0, Math.min(toks.length - 1, sel));
  const a = attend(toks, i, focus), M = matrix(toks, focus);
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const pct = (v: number) => num(v, { style: "percent" });
  const top = toks.map((w, j) => ({ w, j, p: a.weights[j] })).sort((x, y) => y.p - x.p).slice(0, 4);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.sentence} value={id} options={(Object.keys(SENTENCES) as Id[]).map((k) => [k, s.names[k]] as const)} onChange={(v) => { setId(v); setSeen((x) => new Set(x).add(v)); }} />
      <p className="lb-note">{s.tap}</p>
      <div className="lb-attn-sentence" role="group" aria-label={s.tap}>
        {toks.map((w, j) => (
          <button key={j} type="button" className={j === i ? "lb-attn-word is-on" : "lb-attn-word"} aria-pressed={j === i} onClick={() => setSel(j)}>
            <span className="lb-attn-heat" style={{ opacity: j === i ? 0 : a.weights[j] }} aria-hidden />
            <span>{w.text}</span>
          </button>
        ))}
      </div>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.looks(toks[i].text)}</span>
          <ul className="lb-bars">
            {top.map(({ w, j, p }) => (
              <li key={j} className="lb-bar"><span>{w.text}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(p * 100)}%` }} /></span><span>{pct(p)}</span></li>
            ))}
          </ul>
          <Slider label={s.focus} value={focus} min={0} max={8} step={0.5} onChange={setFocus} format={(v) => num(v)} />
          <span className="dr-field-label">{s.meaning(toks[i].text)}</span>
          <ul className="lb-bars">
            {FEATURES.map((f, d) => (
              <li key={f} className="lb-bar"><span>{s.feature[f]}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(a.mix[d] * 100)}%` }} /></span><span>{n2(a.mix[d])}</span></li>
            ))}
          </ul>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.question}</span>
          <p className="lb-note">{FEATURES.map((f, d) => `${s.feature[f]} ${n2(a.q[d])}`).join(lang === "ar" ? "، " : ", ")}</p>
          <table className="lb-table">
            <thead><tr><th>{s.word}</th><th>{s.match}</th><th>{s.share}</th></tr></thead>
            <tbody>{toks.map((w, j) => <tr key={j} className={j === i ? "is-on" : undefined}><td>{w.text}</td><td>{n2(a.scores[j])}</td><td>{pct(a.weights[j])}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <span className="dr-field-label">{s.all}</span>
      <div className="lb-attn-matrix" style={{ gridTemplateColumns: `auto repeat(${toks.length}, minmax(0, 1fr))` }}>
        <span />
        {toks.map((w, j) => <span key={`h${j}`} className="lb-attn-col">{w.text}</span>)}
        {M.map((row, r) => [
          <button key={`r${r}`} type="button" className={r === i ? "lb-attn-row is-on" : "lb-attn-row"} onClick={() => setSel(r)}>{toks[r].text}</button>,
          ...row.map((p, c) => <span key={`${r}-${c}`} className="lb-attn-cell" title={pct(p)}><span style={{ opacity: p }} /></span>),
        ])}
      </div>
    </LabShell>
  );
}
