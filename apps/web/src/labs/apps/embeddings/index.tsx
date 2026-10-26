import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Plot, spreadLabels } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { matchKey } from "../../kit/text";
import type { LabProps } from "../../types";
import { build, CORPUS, nearest } from "./model";

const MAP_H = 360;
const S = {
  en: {
    intro: "A computer can't use words directly, so it turns each word into a list of numbers. Here a word's numbers say which other words it shows up with. Words that keep the same company get similar lists, and land close together on the map.",
    map: "Each word placed by its numbers: close together means used in a similar way", pick: "Pick a word", near: (w: string) => `Words closest to “${w}”`,
    numbers: (w: string, n: string) => `“${w}” as ${n} numbers (darker: seen together more often than chance)`,
    add: "Add your own sentence", addHint: "Use words from the map, for example: The dog eats grass on the farm.", addBtn: "Add and redraw", known: (n: string) => `${n} words on the map`,
    takeaway: "Meaning becomes position: similar words get similar numbers. Language models learn lists like these (embeddings) for every token, hundreds of numbers long, from billions of sentences.",
  },
  ar: {
    intro: "لا يستطيع الحاسوب استعمال الكلمات مباشرةً، فيحوّل كل كلمة إلى قائمة أرقام. وهنا تقول أرقام الكلمة ما الكلمات الأخرى التي تظهر معها. والكلمات التي ترافق الكلمات نفسها تحصل على قوائم متشابهة، فتتجاور على الخريطة.",
    map: "كل كلمة في موضعها بحسب أرقامها: التجاور يعني استعمالًا متشابهًا", pick: "اختر كلمة", near: (w: string) => `أقرب الكلمات إلى «${w}»`,
    numbers: (w: string, n: string) => `«${w}» في صورة ${n} رقمًا (الأغمق: يظهران معًا أكثر مما تتوقعه الصدفة)`,
    add: "أضف جملة من عندك", addHint: "استعمل كلمات من الخريطة، مثلًا: يشرب الكلب الحليب في المزرعة.", addBtn: "أضف وأعد الرسم", known: (n: string) => `${n} كلمة على الخريطة`,
    takeaway: "يصبح المعنى موضعًا: الكلمات المتشابهة تحصل على أرقام متشابهة. والنماذج اللغوية تتعلّم قوائم كهذه (التضمينات) لكل رمز، طول كل منها مئات الأرقام، من مليارات الجمل.",
  },
};

export default function Embeddings({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const base = lang === "ar" ? CORPUS.ar : CORPUS.en;
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const m = useMemo(() => build([base, ...extra].join("\n")), [base, extra]);
  const [sel, setSel] = useState<string>(() => matchKey(lang === "ar" ? "القطة" : "cat"));
  const [picked, setPicked] = useState(() => new Set<string>());
  useEffect(() => { setExtra([]); setSel(matchKey(lang === "ar" ? "القطة" : "cat")); }, [lang]);
  useEffect(() => { if (picked.size >= 3 || extra.length) onDone?.(); }, [picked.size >= 3 || extra.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const near = nearest(m, sel, 5), nearSet = new Set(near.map((n) => n.key));
  const i = m.v.keys.indexOf(sel), word = (k: string) => m.v.surface.get(k) ?? k;
  const xs = m.xy.map((p) => p[0]), ys = m.xy.map((p) => p[1]);
  const pad = (lo: number, hi: number): [number, number] => { const d = (hi - lo || 1) * 0.12; return [lo - d, hi + d]; };
  const choose = (k: string) => { setSel(k); setPicked((p) => new Set(p).add(k)); };

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={pad(Math.min(...xs), Math.max(...xs))} y={pad(Math.min(...ys), Math.max(...ys))} label={s.map} height={MAP_H} ticks={0}
            dots={m.xy.map(([x, y], j) => ({ x, y, r: m.v.keys[j] === sel ? 7 : 4, tone: m.v.keys[j] === sel ? "b" : nearSet.has(m.v.keys[j]) ? "a" : "muted" }))}>
            {({ px, py }) => {
              const anchors = m.xy.map(([x, y], j) => ({ x: px(x), y: py(y), w: word(m.v.keys[j]).length * 7 + 4 }));
              const at = spreadLabels(anchors, { x0: 30, y0: 10, x1: 310, y1: MAP_H - 30 });
              return m.xy.map((_, j) => {
                const k = m.v.keys[j], on = k === sel || nearSet.has(k), a = anchors[j], p = at[j];
                const far = Math.hypot(p.x - a.x - 6, p.y - a.y + 4) > 6;
                return (
                  <g key={j}>
                    {far && <line x1={a.x} y1={a.y} x2={p.x} y2={p.y - 4} className="lb-plot-leader" />}
                    <text x={p.x} y={p.y} className={on ? "lb-plot-label is-on" : "lb-plot-label"}>{word(k)}</text>
                  </g>
                );
              });
            }}
          </Plot>
          <p className="lb-note">{s.known(num(m.v.keys.length))}</p>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.pick}</span>
          <div className="lb-chips is-compact" role="group" aria-label={s.pick}>
            {m.v.keys.map((k) => <button key={k} type="button" className={k === sel ? "lb-chip is-on" : "lb-chip"} aria-pressed={k === sel} onClick={() => choose(k)} dir="auto">{word(k)}</button>)}
          </div>
          {i >= 0 && (
            <>
              <span className="dr-field-label">{s.near(word(sel))}</span>
              <ul className="lb-bars">
                {near.map((n) => (
                  <li key={n.key} className="lb-bar">
                    <span dir="auto">{word(n.key)}</span>
                    <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.max(0, Math.round(n.sim * 100))}%` }} /></span>
                    <span>{num(Math.round(n.sim * 100) / 100)}</span>
                  </li>
                ))}
              </ul>
              <span className="lb-note">{s.numbers(word(sel), num(m.v.keys.length))}</span>
              <div className="lb-strip" dir="ltr" aria-hidden>
                {m.vectors[i].map((v, j) => <span key={j} title={word(m.v.keys[j])} style={{ opacity: 0.08 + 0.92 * Math.min(1, v * 2) }} />)}
              </div>
            </>
          )}
          <label className="dr-field-label" htmlFor="lb-emb-add">{s.add}</label>
          <input id="lb-emb-add" className="dr-field-input" dir="auto" value={draft} placeholder={s.addHint} onChange={(e) => setDraft(e.target.value)} />
          <div className="lb-row"><Button size="sm" variant="secondary" disabled={!draft.trim()} onClick={() => { setExtra((x) => [...x, draft.trim()]); setDraft(""); }}>{s.addBtn}</Button></div>
        </div>
      </div>
    </LabShell>
  );
}
