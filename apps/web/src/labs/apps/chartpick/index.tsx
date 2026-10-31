import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { CHARTS, QUESTIONS, RATES, looksTimes, score, type Chart } from "./model";

const S = {
  en: {
    intro: "Each question needs a different chart. Choose one for each, then try the axis below.",
    q1: "Which fruit does our class like best?", q2: "How did rainfall change month by month this year?", q3: "How is the school budget shared out?",
    q4: "Do pupils who study more get higher marks?", q5: "How tall was our bean plant each day?",
    bar: "Bar", line: "Line", pie: "Pie", scatter: "Scatter", right: "Right", wrong: "Think again",
    score: "Right answers", base: "Where the axis starts (%)", last: "Last year", now: "This year",
    looks: "This year's bar looks {x} times as tall as last year's. The real rise is from {a}% to {b}%.",
    honest: "With the axis starting at zero, the bars show the change honestly.",
    try1: "Pick Line for the rainfall question: things that change over time usually belong on a line chart.",
    try2: "Drag where the axis starts up to 68: a rise of four points now looks three times as big.",
    try3: "Pick Scatter for the study question: two measurements of each pupil go on a scatter chart.",
    takeaway: "Choose the chart that fits the question, and check where the axis starts before believing a dramatic picture.",
  },
  ar: {
    intro: "كل سؤال يحتاج رسمًا مختلفًا. اختر رسمًا لكل سؤال، ثم جرّب المحور في الأسفل.",
    q1: "أيّ فاكهة يفضّلها فصلنا أكثر؟", q2: "كيف تغيّر المطر شهرًا بعد شهر هذا العام؟", q3: "كيف تُوزَّع ميزانية المدرسة؟",
    q4: "هل يحصل التلاميذ الذين يذاكرون أكثر على درجات أعلى؟", q5: "كم كان طول نبتة الفول كل يوم؟",
    bar: "أعمدة", line: "خطوط", pie: "دائري", scatter: "انتشار", right: "صحيح", wrong: "فكّر مرة أخرى",
    score: "الإجابات الصحيحة", base: "بداية المحور (٪)", last: "العام الماضي", now: "هذا العام",
    looks: "يبدو عمود هذا العام أطول من عمود العام الماضي {x} مرات. الارتفاع الحقيقي من {a}٪ إلى {b}٪.",
    honest: "حين يبدأ المحور من الصفر، تُظهر الأعمدة التغيّر بأمانة.",
    try1: "اختر «خطوط» لسؤال المطر: ما يتغير مع الوقت يناسبه غالبًا الرسم بالخطوط.",
    try2: "اسحب بداية المحور إلى ٦٨: ارتفاع أربع نقاط يبدو الآن أكبر بثلاث مرات.",
    try3: "اختر «انتشار» لسؤال المذاكرة: قياسان لكل تلميذ يوضعان على رسم انتشار.",
    takeaway: "اختر الرسم الذي يناسب السؤال، وانظر أين يبدأ المحور قبل أن تصدّق صورة مثيرة.",
  },
};

export default function ChartPick({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [picks, setPicks] = useState<Record<string, Chart | undefined>>({});
  const [base, setBase] = useState(0);
  const right = score(picks);
  useEffect(() => { if (right === QUESTIONS.length && base >= 60) onDone?.(); }, [right, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = looksTimes(RATES.last, RATES.now, base);
  const h = (v: number) => `${Math.max(2, ((v - base) / (100 - base)) * 100)}%`;
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="stack">
        {QUESTIONS.map((q) => (
          <div key={q.id} className="stack">
            <Segmented label={s[q.id as "q1"]} value={picks[q.id] ?? ("" as Chart)} options={CHARTS.map((c) => [c, s[c]] as const)} onChange={(c) => setPicks({ ...picks, [q.id]: c })} />
            {picks[q.id] && <p className={picks[q.id] === q.answer ? "notice" : "notice err"}>{picks[q.id] === q.answer ? s.right : s.wrong}</p>}
          </div>
        ))}
        <p role="status">{s.score}: {num(right)} / {num(QUESTIONS.length)}</p>
        <Slider label={s.base} value={base} min={0} max={72} step={2} format={(v) => num(v)} onChange={setBase} />
        <div className="lb-bars-v" style={{ display: "flex", gap: 24, alignItems: "flex-end", blockSize: 160 }}>
          {[{ l: s.last, v: RATES.last }, { l: s.now, v: RATES.now }].map((b) => (
            <div key={b.l} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", blockSize: "100%", textAlign: "center" }}>
              <div style={{ blockSize: h(b.v), background: "var(--lagoon)", borderRadius: 4 }} />
              <span>{b.l}</span>
            </div>
          ))}
        </div>
        <p className={base > 0 ? "notice err" : "notice"}>{base > 0 ? s.looks.replace("{x}", num(Math.round(x * 10) / 10)).replace("{a}", num(RATES.last)).replace("{b}", num(RATES.now)) : s.honest}</p>
      </div>
    </LabShell>
  );
}
