import { useEffect, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { STUDY, correlation, fitLine, meanMiss, strength, type P } from "./model";

const S = {
  en: {
    intro: "Each dot is a pupil: hours of study a week across, mark out of 20 up. Tap the chart to add a pupil.",
    chart: "Scatter chart of study hours and marks", fit: "Line of best fit", off: "Hidden", on: "Shown", reset: "Start again",
    r: "Correlation (r)", eq: "Line", miss: "Average miss (marks)", hours: "Predict for hours", pred: "Predicted mark",
    "strong+": "Strong positive: more study goes with higher marks.", "weak+": "Weak positive: a slight upward pattern.", none: "Little or no straight-line pattern.",
    "weak-": "Weak negative: a slight downward pattern.", "strong-": "Strong negative: as one goes up, the other goes down.",
    cause: "Correlation is not causation: pupils who study more may also sleep better or get help at home.",
    try1: "Tap near the bottom right (many hours, low mark) three times: watch r fall from about 0.96.",
    try2: "Show the line of best fit and set the hours to 10: the line predicts beyond the data, which is risky.",
    try3: "Start again and add one pupil at the top left: one unusual point can pull the line a lot.",
    takeaway: "A scatter chart shows whether two measurements move together; r measures how closely, and a fitted line can predict, but neither proves that one causes the other.",
  },
  ar: {
    intro: "كل نقطة تلميذ: ساعات المذاكرة في الأسبوع أفقيًا، والدرجة من ٢٠ رأسيًا. انقر على الرسم لإضافة تلميذ.",
    chart: "رسم انتشار لساعات المذاكرة والدرجات", fit: "أفضل خط", off: "مخفي", on: "ظاهر", reset: "ابدأ من جديد",
    r: "الارتباط (r)", eq: "الخط", miss: "متوسط الخطأ (درجات)", hours: "تنبّأ لعدد ساعات", pred: "الدرجة المتوقعة",
    "strong+": "ارتباط موجب قوي: المذاكرة الأكثر تصاحبها درجات أعلى.", "weak+": "ارتباط موجب ضعيف: نمط صاعد خفيف.", none: "لا يوجد نمط خطّي يُذكر.",
    "weak-": "ارتباط سالب ضعيف: نمط هابط خفيف.", "strong-": "ارتباط سالب قوي: حين يزيد أحدهما يقل الآخر.",
    cause: "الارتباط لا يعني السببية: من يذاكر أكثر قد ينام أفضل أو يجد مساعدة في البيت.",
    try1: "انقر قرب أسفل اليمين (ساعات كثيرة ودرجة منخفضة) ثلاث مرات: شاهد r ينخفض من حوالي ٠٫٩٦.",
    try2: "أظهر أفضل خط واجعل الساعات ١٠: يتنبأ الخط خارج حدود البيانات، وهذا محفوف بالمخاطر.",
    try3: "ابدأ من جديد وأضف تلميذًا واحدًا أعلى اليسار: نقطة واحدة غير معتادة قد تسحب الخط كثيرًا.",
    takeaway: "يُظهر رسم الانتشار هل يتحرك قياسان معًا، ويقيس r مدى قربهما، ويستطيع الخط أن يتنبأ، لكن لا أحد منهما يثبت أن أحدهما سبب الآخر.",
  },
};

export default function Scatter({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [pts, setPts] = useState<P[]>(STUDY);
  const [show, setShow] = useState(false);
  const [hours, setHours] = useState(4);
  const r = correlation(pts), l = fitLine(pts);
  useEffect(() => { if (show && pts.length > STUDY.length) onDone?.(); }, [show, pts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const r2 = (v: number) => num(Math.round(v * 100) / 100);
  const add = (x: number, y: number) => setPts([...pts, { x: Math.round(Math.min(10, Math.max(0, x)) * 2) / 2, y: Math.round(Math.min(20, Math.max(0, y))) }]);
  const y = (x: number) => l.intercept + l.slope * x;
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => setPts(STUDY)}>
      <div className="lb-two">
        <Plot x={[0, 10]} y={[0, 20]} height={280} ticks={5} yTicks={4} label={s.chart} onPick={add}
          lines={show ? [{ points: [[0, y(0)], [10, y(10)]], tone: "ink", width: 3 }] : []}
          dots={[...pts.map((p, i) => ({ x: p.x, y: p.y, tone: i < STUDY.length ? ("a" as const) : ("b" as const), r: 6 })), ...(show ? [{ x: hours, y: y(hours), tone: "ink" as const, shape: "square" as const, r: 6 }] : [])]} />
        <div className="stack">
          <Segmented label={s.fit} value={show ? 1 : 0} options={[[0, s.off], [1, s.on]]} onChange={(v) => setShow(v === 1)} />
          <Stats items={[
            { label: s.r, value: r2(r) },
            ...(show ? [{ label: s.eq, value: `y = ${r2(l.intercept)} + ${r2(l.slope)}x` }, { label: s.miss, value: r2(meanMiss(pts, l)) }, { label: s.pred, value: r2(y(hours)) }] : []),
          ]} />
          {show && <Slider label={s.hours} value={hours} min={0} max={10} step={0.5} format={(v) => num(v)} onChange={setHours} />}
          <p className="notice" role="status">{s[strength(r)]}</p>
          <p className="notice">{s.cause}</p>
          <Button size="sm" variant="ghost" onClick={() => setPts(STUDY)}>{s.reset}</Button>
        </div>
      </div>
    </LabShell>
  );
}
