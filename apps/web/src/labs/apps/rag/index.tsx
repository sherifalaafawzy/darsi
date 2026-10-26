import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { answer, COVER, DOCS, ENOUGH, guess, index, QUESTIONS, search, shown, type Doc } from "./model";

const S = {
  en: {
    intro: "A chatbot on its own answers from memory, and sometimes makes things up. With RAG (retrieval-augmented generation) it first searches trusted documents, then answers from what it found and says where. Ask about this school.",
    ask: "Your question", askBtn: "Ask", try: "Or try one of these",
    step1: "1. Search the school's documents", step1b: "Each document gets a score for how well it matches your question (TF-IDF: rare shared words count most).",
    matched: (w: string) => `shared words: ${w}`, none: "no shared words", quote: (t: string) => `“${t}”`,
    step2: "2. Answer from the best document", from: (t: string) => `Source: ${t}`,
    noAnswer: "I can't find this in the school's documents, so I won't guess. Ask the office.",
    why: (score: string, cover: string, need: string, needCover: string) => `The best match scored ${score} and covered ${cover} of the question. It needs at least ${need} and ${needCover}.`,
    without: "Without sources (for comparison)", withoutB: "Sounds sure, but nothing backs it up. It may be right or wrong, and you can't check.",
    docs: "The school's documents (you can edit them)", edited: "Edit a document, then ask again: the answer follows the document.",
    takeaway: "Grounding an AI in real documents makes its answers checkable and lets it say “I don't know”. But it is only as good as its documents and its search: wrong or missing documents still give wrong or missing answers.",
  },
  ar: {
    intro: "يجيب روبوت المحادثة وحده من ذاكرته، وقد يختلق أحيانًا. أما مع RAG (التوليد المعزّز بالاسترجاع) فيبحث أولًا في وثائق موثوقة، ثم يجيب مما وجده ويذكر المصدر. اسأل عن هذه المدرسة.",
    ask: "سؤالك", askBtn: "اسأل", try: "أو جرّب أحد هذه الأسئلة",
    step1: "١. البحث في وثائق المدرسة", step1b: "تحصل كل وثيقة على درجة بحسب مطابقتها لسؤالك (TF-IDF: الكلمات المشتركة النادرة لها الوزن الأكبر).",
    matched: (w: string) => `كلمات مشتركة: ${w}`, none: "لا كلمات مشتركة", quote: (t: string) => `«${t}»`,
    step2: "٢. الإجابة من أفضل وثيقة", from: (t: string) => `المصدر: ${t}`,
    noAnswer: "لا أجد هذا في وثائق المدرسة، لذلك لن أخمّن. اسأل الإدارة.",
    why: (score: string, cover: string, need: string, needCover: string) => `أفضل تطابق حصل على ${score} وغطّى ${cover} من السؤال. والمطلوب ${need} على الأقل و${needCover}.`,
    without: "من دون مصادر (للمقارنة)", withoutB: "تبدو واثقة، لكن لا شيء يسندها. قد تكون صحيحة أو خاطئة، ولا تستطيع التحقق.",
    docs: "وثائق المدرسة (يمكنك تعديلها)", edited: "عدّل وثيقة ثم اسأل من جديد: الإجابة تتبع الوثيقة.",
    takeaway: "ربط الذكاء الاصطناعي بوثائق حقيقية يجعل إجاباته قابلة للتحقق ويتيح له أن يقول «لا أعرف». لكنه لا يكون أفضل من وثائقه وبحثه: الوثائق الخاطئة أو الناقصة تعطي إجابات خاطئة أو ناقصة.",
  },
};

export default function Rag({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const L = lang === "ar" ? "ar" : "en";
  const [docs, setDocs] = useState<Doc[]>(DOCS[L]);
  const [draft, setDraft] = useState(QUESTIONS[L][0]);
  const [q, setQ] = useState(QUESTIONS[L][0]);
  const [asked, setAsked] = useState(() => new Set<string>());
  useEffect(() => { setDocs(DOCS[L]); setDraft(QUESTIONS[L][0]); setQ(QUESTIONS[L][0]); }, [L]);
  useEffect(() => { if (asked.size >= 3) onDone?.(); }, [asked.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const ix = useMemo(() => index(docs), [docs]);
  const ranked = useMemo(() => search(ix, q), [ix, q]);
  const ans = useMemo(() => answer(ix, q), [ix, q]);
  const go = (text: string) => { const t = text.trim(); if (!t) return; setDraft(t); setQ(t); setAsked((a) => new Set(a).add(t)); };
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const best = Math.max(ranked[0]?.score ?? 0, 0.01);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <form className="lb-ask" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <label className="dr-field-label" htmlFor="lb-rag-q">{s.ask}</label>
        <div className="lb-ask-row">
          <input id="lb-rag-q" className="dr-field-input" dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button size="sm" type="submit">{s.askBtn}</Button>
        </div>
      </form>
      <span className="lb-note">{s.try}</span>
      <div className="lb-chips is-compact">{QUESTIONS[L].map((x) => <button key={x} type="button" className={x === q ? "lb-chip is-on" : "lb-chip"} aria-pressed={x === q} onClick={() => go(x)}>{x}</button>)}</div>

      <div className="lb-two">
        <div className="stack">
          <h3 className="lb-h">{s.step1}</h3>
          <p className="lb-note">{s.step1b}</p>
          <ul className="lb-bars">
            {ranked.slice(0, 4).map((r, i) => (
              <li key={r.doc.id} className={i === 0 && ans ? "lb-bar is-on" : "lb-bar"}>
                <span>{r.doc.title}<br /><span className="lb-note">{r.hits.length ? s.matched(shown(q, r.hits).join(L === "ar" ? "، " : ", ")) : s.none}</span></span>
                <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round((r.score / best) * 100)}%` }} /></span>
                <span>{n2(r.score)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="stack">
          <h3 className="lb-h">{s.step2}</h3>
          {ans ? (
            <blockquote className="lb-answer is-ok" aria-live="polite">
              <p>{s.quote(`${ans.quote}.`)}</p>
              <footer><Icon name="file" size={16} /> {s.from(ans.doc.title)}</footer>
            </blockquote>
          ) : (
            <div className="lb-answer" aria-live="polite">
              <p>{s.noAnswer}</p>
              <p className="lb-note">{s.why(n2(ranked[0]?.score ?? 0), num(ranked[0]?.coverage ?? 0, { style: "percent" }), n2(ENOUGH), num(COVER, { style: "percent" }))}</p>
            </div>
          )}
          <h3 className="lb-h">{s.without}</h3>
          <div className="lb-answer is-guess"><p>{s.quote(guess(q, L))}</p><p className="lb-note">{s.withoutB}</p></div>
        </div>
      </div>

      <h3 className="lb-h">{s.docs}</h3>
      <p className="lb-note">{s.edited}</p>
      <div className="stack-sm">
        {docs.map((d, i) => (
          <details key={d.id} className="lb-doc">
            <summary>{d.title}</summary>
            <textarea className="dr-field-input" dir="auto" rows={3} aria-label={d.title} value={d.text} onChange={(e) => setDocs((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          </details>
        ))}
      </div>
    </LabShell>
  );
}
