import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { breakEven, CRITERIA, ev, leaders, OPTIONS, PAYOFF, SCORES, totals, WEIGHTS, type Criterion, type Option, type Payoff, type Scores } from "./model";

/** "A and B", "A, B and C" */
const andEn = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join(""));

const S = {
  en: {
    intro: "Decision models make choices step by step and in the open. Try two classic ones: a weighted matrix for choices with several goals, and expected value for choices under uncertainty.",
    tool: "Tool", matrix: "Weighted choice", expected: "Expected value",
    trip: "Where should the class go on its trip? Score each place from 1 to 5 (5 is best: cheapest, most to learn, shortest trip, safest), then set how much each thing matters.",
    opt: { museum: "Museum", farm: "Farm", science: "Science centre" } as Record<Option, string>,
    crit: { cost: "Cost", learning: "Learning", travel: "Travel time", safety: "Safety" } as Record<Criterion, string>,
    matters: "How much each thing matters (0 to 5)", scores: "Scores (1 to 5)", score: (o: string, c: string) => `${o}: ${c}`,
    result: "Weighted score (share of a perfect score)", pick: (o: string) => `Best choice with these weights: ${o}.`, nothing: "Nothing matters yet: give at least one thing a weight.",
    pickTie: (names: string[]) => `A tie with these weights: ${andEn(names)}. Change one weight to break it.`,
    sports: "Sports day: outside or in the hall? Each choice is scored from 0 to 10 for a dry day and a rainy day. Set the chance of rain.",
    rain: "Chance of rain", outside: "Outside", hall: "In the hall", dry: "Dry", wet: "Rain",
    evLine: (o: string, h: string) => `On average: outside ${o}, in the hall ${h}.`,
    evPick: (c: string) => `Better on average: ${c}.`, tie: "On average both choices are equally good.",
    even: (p: string, hall: boolean) => `Above ${p} chance of rain, ${hall ? "the hall" : "outside"} is the better bet.`, noEven: "With these scores one choice is always better.",
    chart: "Average score of each choice for every chance of rain (the ring is today's forecast)", chanceAxis: "chance of rain", valueAxis: "average score",
    try1: "Set Cost to 5 and the other three to 0: the Farm, the cheapest, wins. Now set Learning to 5 and Cost to 0: the Science centre wins. The scores didn't change; what matters did.",
    try2: "Switch to Expected value and drag the chance of rain past 50 %: the better choice flips from outside to the hall, just where the two lines cross.",
    takeaway: "Decision models don't decide what matters: people choose the weights and the payoffs. What the model adds is honesty: everyone can see the trade-offs and test “what if this mattered more?”. AI systems that recommend or decide work the same way, with learned chances and values.",
  },
  ar: {
    intro: "تتخذ نماذج القرار خياراتها خطوة بخطوة وعلى مرأى من الجميع. جرّب نموذجين شهيرين: المصفوفة الموزونة للخيارات ذات الأهداف المتعددة، والقيمة المتوقعة للخيارات في ظل عدم اليقين.",
    tool: "الأداة", matrix: "اختيار موزون", expected: "القيمة المتوقعة",
    trip: "إلى أين يذهب الفصل في رحلته؟ قيّم كل مكان من ١ إلى ٥ (٥ الأفضل: الأرخص، والأكثر فائدة، والأقصر طريقًا، والأكثر أمانًا)، ثم حدّد أهمية كل أمر.",
    opt: { museum: "المتحف", farm: "المزرعة", science: "مركز العلوم" } as Record<Option, string>,
    crit: { cost: "الكلفة", learning: "التعلّم", travel: "مدة السفر", safety: "الأمان" } as Record<Criterion, string>,
    matters: "أهمية كل أمر (من ٠ إلى ٥)", scores: "الدرجات (من ١ إلى ٥)", score: (o: string, c: string) => `${o}: ${c}`,
    result: "الدرجة الموزونة (نسبةً إلى الدرجة الكاملة)", pick: (o: string) => `أفضل خيار بهذه الأوزان: ${o}.`, nothing: "لا شيء مهم بعد: أعطِ أمرًا واحدًا على الأقل وزنًا.",
    pickTie: (names: string[]) => `تعادل بهذه الأوزان: ${names.join(" و")}. غيّر وزنًا واحدًا لتحسم الأمر.`,
    sports: "اليوم الرياضي: في الخارج أم في القاعة؟ يحصل كل خيار على درجة من ٠ إلى ١٠ ليوم جاف وليوم ممطر. حدّد احتمال المطر.",
    rain: "احتمال المطر", outside: "في الخارج", hall: "في القاعة", dry: "جاف", wet: "مطر",
    evLine: (o: string, h: string) => `في المتوسط: في الخارج ${o}، وفي القاعة ${h}.`,
    evPick: (c: string) => `الأفضل في المتوسط: ${c}.`, tie: "الخياران متساويان في المتوسط.",
    even: (p: string, hall: boolean) => `إذا تجاوز احتمال المطر ${p} ${hall ? "فالقاعة هي الرهان الأفضل" : "فالخارج هو الرهان الأفضل"}.`, noEven: "بهذه الدرجات يكون أحد الخيارين أفضل دائمًا.",
    chart: "متوسط درجة كل خيار لكل احتمال للمطر (الحلقة هي توقّع اليوم)", chanceAxis: "احتمال المطر", valueAxis: "متوسط الدرجة",
    try1: "اضبط «الكلفة» على ٥ والثلاثة الأخرى على ٠: تفوز المزرعة، الأرخص. ثم اضبط «التعلّم» على ٥ و«الكلفة» على ٠: يفوز مركز العلوم. لم تتغيّر الدرجات، بل تغيّر ما يهمّ.",
    try2: "انتقل إلى «القيمة المتوقعة» واسحب احتمال المطر إلى ما بعد ٥٠٪: ينقلب الخيار الأفضل من الخارج إلى القاعة، عند تقاطع الخطين تمامًا.",
    takeaway: "نماذج القرار لا تقرّر ما المهم: الناس هم من يختارون الأوزان والعوائد. وما يضيفه النموذج هو الشفافية: يرى الجميع الموازنات ويختبرون «ماذا لو كان هذا أهم؟». وأنظمة الذكاء الاصطناعي التي توصي أو تقرّر تعمل بالطريقة نفسها، مع احتمالات وقيم متعلَّمة.",
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
  const t = totals(scores, weights), e = ev(p, pay), be = breakEven(pay);
  const anyWeight = CRITERIA.some((c) => weights[c] > 0), top = anyWeight ? leaders(t) : [];
  const n1 = (v: number) => num(Math.round(v * 10) / 10);
  const pct = (v: number) => num(v, { style: "percent" });
  // What is being typed stays as typed until it is a whole number in range; leaving the cell clamps it. Clamping every
  // keystroke turned a cleared "3" into "1", and the next digit into "14", then "5", so a phone couldn't retype a score.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const cell = (key: string, v: number, set: (n: number) => void, label: string, max: number) => {
    const min = max === 5 ? 1 : 0;
    const drop = () => setDraft((d) => { const next = { ...d }; delete next[key]; return next; });
    return (
      <input type="number" inputMode="numeric" className="dr-field-input lb-num" min={min} max={max} step={1} value={draft[key] ?? String(v)} aria-label={label}
        onChange={(ev2) => {
          const raw = ev2.target.value, n = Number(raw);
          setDraft((d) => ({ ...d, [key]: raw }));
          if (raw.trim() !== "" && Number.isInteger(n) && n >= min && n <= max) set(n);
        }}
        onBlur={() => {
          const raw = draft[key];
          if (raw === undefined) return;
          const n = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(n)) { const c = Math.max(min, Math.min(max, Math.round(n))); if (c !== v) set(c); }
          drop();
        }} />
    );
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
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
                      {OPTIONS.map((o) => <td key={o}>{cell(`${o}:${c}`, scores[o][c], (n) => { setScores((x) => ({ ...x, [o]: { ...x[o], [c]: n } })); mark("matrix"); }, s.score(s.opt[o], s.crit[c]), 5)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <span className="dr-field-label">{s.result}</span>
          <ul className="lb-bars">
            {OPTIONS.map((o) => <li key={o} className={top.includes(o) ? "lb-bar is-on" : "lb-bar"}><span>{s.opt[o]}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(t[o] * 100)}%` }} /></span><span>{pct(t[o])}</span></li>)}
          </ul>
          <p className="lb-verdict" aria-live="polite">{!anyWeight ? s.nothing : top.length > 1 ? s.pickTie(top.map((o) => s.opt[o])) : s.pick(s.opt[top[0]])}</p>
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
                  <tr><th>{s.outside}</th><td>{cell("pay:outsideDry", pay.outsideDry, (n) => setPay((x) => ({ ...x, outsideDry: n })), `${s.outside}: ${s.dry}`, 10)}</td><td>{cell("pay:outsideRain", pay.outsideRain, (n) => setPay((x) => ({ ...x, outsideRain: n })), `${s.outside}: ${s.wet}`, 10)}</td></tr>
                  <tr><th>{s.hall}</th><td>{cell("pay:hallDry", pay.hallDry, (n) => setPay((x) => ({ ...x, hallDry: n })), `${s.hall}: ${s.dry}`, 10)}</td><td>{cell("pay:hallRain", pay.hallRain, (n) => setPay((x) => ({ ...x, hallRain: n })), `${s.hall}: ${s.wet}`, 10)}</td></tr>
                </tbody>
              </table>
              <p className="lb-note">{s.evLine(n1(e.outside), n1(e.hall))}</p>
              <p className="lb-verdict" aria-live="polite">{Math.abs(e.outside - e.hall) < 1e-9 ? s.tie : s.evPick(e.outside > e.hall ? s.outside : s.hall)}</p>
              <p className="lb-note">{be === null ? s.noEven : s.even(pct(Math.round(be * 100) / 100), pay.hallRain > pay.outsideRain)}</p>
            </div>
            <div className="stack">
              <Plot x={[0, 1]} y={[0, 10]} height={240} label={s.chart} xLabel={s.chanceAxis} yLabel={s.valueAxis}
                lines={[{ points: [[0, pay.outsideDry], [1, pay.outsideRain]], tone: "b" }, { points: [[0, pay.hallDry], [1, pay.hallRain]], tone: "a" }]}
                dots={[{ x: p, y: e.outside, r: 6, tone: "b", ring: true }, { x: p, y: e.hall, r: 6, tone: "a", ring: true, shape: "square" }]}>
                {({ px, py }) => {
                  // A label sits just above the start of its line. A line that starts at the top (a dry-day score of 10) has
                  // no room above it, and the label was cut off: it goes under a line that is nearly flat, or along a falling
                  // line to where it has come down far enough, above it there (under it, the line would cross the word).
                  const at = (dry: number, rain: number): [number, number] => {
                    const y0 = py(dry), y1 = py(rain);
                    if (y0 >= 20) return [px(0.02), y0 - 6];
                    if (y1 - y0 <= 24) return [px(0.02), y0 + 18];
                    return [px((25 - y0) / (y1 - y0)) + 2, 19];
                  };
                  const [ox, oy] = at(pay.outsideDry, pay.outsideRain), [hx, hy] = at(pay.hallDry, pay.hallRain);
                  return <>
                    <text x={ox} y={oy} className="lb-plot-label is-on">{s.outside}</text>
                    <text x={hx} y={hy} className="lb-plot-label is-on">{s.hall}</text>
                  </>;
                }}
              </Plot>
            </div>
          </div>
        </>
      )}
    </LabShell>
  );
}
