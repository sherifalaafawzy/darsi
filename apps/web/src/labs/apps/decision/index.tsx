import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { breakEven, CRITERIA, ev, OPTIONS, PAYOFF, SCORES, totals, WEIGHTS, winner, type Criterion, type Option, type Payoff, type Scores } from "./model";

const S = {
  en: {
    intro: "Decision models make choices step by step and in the open. Try two classic ones: a weighted matrix for choices with several goals, and expected value for choices under uncertainty.",
    tool: "Tool", matrix: "Weighted choice", expected: "Expected value",
    trip: "Where should the class go on its trip? Score each place from 1 to 5 (5 is best: cheapest, most to learn, shortest trip, safest), then set how much each thing matters.",
    opt: { museum: "Museum", farm: "Farm", science: "Science centre" } as Record<Option, string>,
    crit: { cost: "Cost", learning: "Learning", travel: "Travel time", safety: "Safety" } as Record<Criterion, string>,
    matters: "How much each thing matters (0 to 5)", scores: "Scores (1 to 5)", score: (o: string, c: string) => `${o}: ${c}`,
    result: "Weighted score (share of a perfect score)", pick: (o: string) => `Best choice with these weights: ${o}.`,
    sports: "Sports day: outside or in the hall? Each choice is scored from 0 to 10 for a dry day and a rainy day. Set the chance of rain.",
    rain: "Chance of rain", outside: "Outside", hall: "In the hall", dry: "Dry", wet: "Rain",
    evLine: (o: string, h: string) => `On average: outside ${o}, in the hall ${h}.`,
    evPick: (c: string) => `Better on average: ${c}.`, even: (p: string) => `Above ${p} chance of rain, the hall is the better bet.`, noEven: "With these scores one choice is always better.",
    chart: "Average score of each choice for every chance of rain (the ring is today's forecast)", chanceAxis: "chance of rain", valueAxis: "average score",
    takeaway: "Decision models don't decide what matters: people choose the weights and the payoffs. What the model adds is honesty: everyone can see the trade-offs and test “what if this mattered more?”. AI systems that recommend or decide work the same way, with learned chances and values.",
  },
  ar: {
    intro: "تتخذ نماذج القرار خياراتها خطوة بخطوة وعلى مرأى من الجميع. جرّب نموذجين شهيرين: المصفوفة الموزونة للخيارات ذات الأهداف المتعددة، والقيمة المتوقعة للخيارات في ظل عدم اليقين.",
    tool: "الأداة", matrix: "اختيار موزون", expected: "القيمة المتوقعة",
    trip: "إلى أين يذهب الصف في رحلته؟ قيّم كل مكان من ١ إلى ٥ (٥ الأفضل: الأرخص، والأكثر فائدة، والأقصر طريقًا، والأكثر أمانًا)، ثم حدّد أهمية كل أمر.",
    opt: { museum: "المتحف", farm: "المزرعة", science: "مركز العلوم" } as Record<Option, string>,
    crit: { cost: "الكلفة", learning: "التعلّم", travel: "مدة السفر", safety: "الأمان" } as Record<Criterion, string>,
    matters: "أهمية كل أمر (من ٠ إلى ٥)", scores: "الدرجات (من ١ إلى ٥)", score: (o: string, c: string) => `${o}: ${c}`,
    result: "الدرجة الموزونة (نسبةً إلى الدرجة الكاملة)", pick: (o: string) => `أفضل خيار بهذه الأوزان: ${o}.`,
    sports: "اليوم الرياضي: في الخارج أم في القاعة؟ يحصل كل خيار على درجة من ٠ إلى ١٠ ليوم جاف وليوم ممطر. حدّد احتمال المطر.",
    rain: "احتمال المطر", outside: "في الخارج", hall: "في القاعة", dry: "جاف", wet: "مطر",
    evLine: (o: string, h: string) => `في المتوسط: في الخارج ${o}، وفي القاعة ${h}.`,
    evPick: (c: string) => `الأفضل في المتوسط: ${c}.`, even: (p: string) => `إذا تجاوز احتمال المطر ${p} فالقاعة هي الرهان الأفضل.`, noEven: "بهذه الدرجات يكون أحد الخيارين أفضل دائمًا.",
    chart: "متوسط درجة كل خيار لكل احتمال للمطر (الحلقة هي توقّع اليوم)", chanceAxis: "احتمال المطر", valueAxis: "متوسط الدرجة",
    takeaway: "نماذج القرار لا تقرّر ما المهم: الناس هم من يختارون الأوزان والعوائد. وما يضيفه النموذج هو الشفافية: يرى الجميع المقايضات ويختبرون «ماذا لو كان هذا أهم؟». وأنظمة الذكاء الاصطناعي التي توصي أو تقرّر تعمل بالطريقة نفسها، مع احتمالات وقيم متعلَّمة.",
  },
};

export default function Decision({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [tool, setTool] = useState<"matrix" | "expected">("matrix");
  const [scores, setScores] = useState<Scores>(SCORES);
  const [weights, setWeights] = useState(WEIGHTS);
  const [p, setP] = useState(0.3);
  const [pay, setPay] = useState<Payoff>(PAYOFF);
  const [touched, setTouched] = useState(() => new Set<string>());
  const mark = (k: string) => setTouched((x) => new Set(x).add(k));
  useEffect(() => { if (touched.has("matrix") && touched.has("expected")) onDone?.(); }, [touched.has("matrix") && touched.has("expected")]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = totals(scores, weights), w = winner(t), e = ev(p, pay), be = breakEven(pay);
  const n1 = (v: number) => num(Math.round(v * 10) / 10);
  const pct = (v: number) => num(v, { style: "percent" });
  const cell = (v: number, set: (n: number) => void, label: string, max: number) => (
    <input type="number" className="dr-field-input lb-num" min={max === 5 ? 1 : 0} max={max} step={1} value={v} aria-label={label}
      onChange={(ev2) => { const n = Math.max(max === 5 ? 1 : 0, Math.min(max, Math.round(Number(ev2.target.value) || 0))); set(n); }} />
  );

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.tool} value={tool} options={[["matrix", s.matrix], ["expected", s.expected]]} onChange={setTool} />
      {tool === "matrix" ? (
        <>
          <p className="lb-note">{s.trip}</p>
          <div className="lb-two">
            <div className="stack-sm">
              <span className="dr-field-label">{s.matters}</span>
              {CRITERIA.map((c) => <Slider key={c} label={s.crit[c]} value={weights[c]} min={0} max={5} onChange={(v) => { setWeights((x) => ({ ...x, [c]: v })); mark("matrix"); }} format={(v) => num(v)} />)}
            </div>
            <div className="stack-sm">
              <span className="dr-field-label">{s.scores}</span>
              <table className="lb-table lb-matrix-table">
                <thead><tr><th />{OPTIONS.map((o) => <th key={o}>{s.opt[o]}</th>)}</tr></thead>
                <tbody>
                  {CRITERIA.map((c) => (
                    <tr key={c}>
                      <th>{s.crit[c]}</th>
                      {OPTIONS.map((o) => <td key={o}>{cell(scores[o][c], (n) => { setScores((x) => ({ ...x, [o]: { ...x[o], [c]: n } })); mark("matrix"); }, s.score(s.opt[o], s.crit[c]), 5)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <span className="dr-field-label">{s.result}</span>
          <ul className="lb-bars">
            {OPTIONS.map((o) => <li key={o} className={o === w ? "lb-bar is-on" : "lb-bar"}><span>{s.opt[o]}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(t[o] * 100)}%` }} /></span><span>{pct(t[o])}</span></li>)}
          </ul>
          <p className="lb-verdict" aria-live="polite">{s.pick(s.opt[w])}</p>
        </>
      ) : (
        <>
          <p className="lb-note">{s.sports}</p>
          <div className="lb-two">
            <div className="stack">
              <Slider label={s.rain} value={p} min={0} max={1} step={0.05} onChange={(v) => { setP(v); mark("expected"); }} format={pct} />
              <table className="lb-table">
                <thead><tr><th /><th>{s.dry}</th><th>{s.wet}</th></tr></thead>
                <tbody>
                  <tr><th>{s.outside}</th><td>{cell(pay.outsideDry, (n) => setPay((x) => ({ ...x, outsideDry: n })), `${s.outside}: ${s.dry}`, 10)}</td><td>{cell(pay.outsideRain, (n) => setPay((x) => ({ ...x, outsideRain: n })), `${s.outside}: ${s.wet}`, 10)}</td></tr>
                  <tr><th>{s.hall}</th><td>{cell(pay.hallDry, (n) => setPay((x) => ({ ...x, hallDry: n })), `${s.hall}: ${s.dry}`, 10)}</td><td>{cell(pay.hallRain, (n) => setPay((x) => ({ ...x, hallRain: n })), `${s.hall}: ${s.wet}`, 10)}</td></tr>
                </tbody>
              </table>
              <p className="lb-note">{s.evLine(n1(e.outside), n1(e.hall))}</p>
              <p className="lb-verdict" aria-live="polite">{s.evPick(e.outside >= e.hall ? s.outside : s.hall)}</p>
              <p className="lb-note">{be === null ? s.noEven : s.even(pct(Math.round(be * 100) / 100))}</p>
            </div>
            <div className="stack">
              <Plot x={[0, 1]} y={[0, 10]} height={240} label={s.chart} xLabel={s.chanceAxis} yLabel={s.valueAxis}
                lines={[{ points: [[0, pay.outsideDry], [1, pay.outsideRain]], tone: "b" }, { points: [[0, pay.hallDry], [1, pay.hallRain]], tone: "a" }]}
                dots={[{ x: p, y: e.outside, r: 6, tone: "b", ring: true }, { x: p, y: e.hall, r: 6, tone: "a", ring: true, shape: "square" }]}>
                {({ px, py }) => <>
                  <text x={px(0.02)} y={py(pay.outsideDry) - 6} className="lb-plot-label is-on">{s.outside}</text>
                  <text x={px(0.02)} y={py(pay.hallDry) - 6} className="lb-plot-label is-on">{s.hall}</text>
                </>}
              </Plot>
            </div>
          </div>
        </>
      )}
    </LabShell>
  );
}
