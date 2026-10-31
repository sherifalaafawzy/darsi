import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { mean, median, modes, quartiles, range, withLast } from "./model";

const S = {
  en: {
    intro: "Nine pupils' marks out of 20. Each dot is one pupil. Drag the last pupil's mark and watch the numbers that describe the class.",
    last: "The ninth pupil's mark", chart: "Marks on a number line, with the mean (solid line) and the median (dashed line)",
    mean: "Mean", median: "Median", mode: "Mode", none: "none", range: "Range", iqr: "Middle half (IQR)",
    pulled: "One extreme mark pulls the mean, but the median hardly moves. When a set has extremes, the median describes a typical pupil better.",
    close: "The mean and the median are close: no extreme mark is pulling the mean.",
    try1: "Drag the ninth mark down to 0: the mean drops by more than a whole mark, but the median moves by only one mark.",
    try2: "Set the ninth mark to 12: now 12 appears three times, so it becomes the mode.",
    try3: "Watch the range when you drag to 20 or 0: one pupil changes it a lot, while the middle half (IQR) barely changes.",
    takeaway: "Always report a centre and a spread together, and choose the median when a few extreme values would mislead.",
  },
  ar: {
    intro: "درجات تسعة تلاميذ من ٢٠. كل نقطة تلميذ واحد. اسحب درجة التلميذ الأخير وشاهد الأرقام التي تصف الفصل.",
    last: "درجة التلميذ التاسع", chart: "الدرجات على خط الأعداد، مع المتوسط (خط متصل) والوسيط (خط متقطع)",
    mean: "المتوسط", median: "الوسيط", mode: "المنوال", none: "لا يوجد", range: "المدى", iqr: "النصف الأوسط (المدى الربيعي)",
    pulled: "درجة واحدة متطرفة تسحب المتوسط، أما الوسيط فبالكاد يتحرك. حين توجد قيم متطرفة، يصف الوسيط التلميذ المعتاد أفضل.",
    close: "المتوسط والوسيط متقاربان: لا توجد درجة متطرفة تسحب المتوسط.",
    try1: "اسحب الدرجة التاسعة إلى صفر: ينخفض المتوسط أكثر من درجة كاملة، بينما يتحرك الوسيط درجة واحدة فقط.",
    try2: "اجعل الدرجة التاسعة ١٢: تتكرر ١٢ الآن ثلاث مرات، فتصبح هي المنوال.",
    try3: "راقب المدى حين تسحب إلى ٢٠ أو إلى صفر: تلميذ واحد يغيّره كثيرًا، بينما بالكاد يتغير النصف الأوسط.",
    takeaway: "اذكر دائمًا مقياسًا للوسط ومقياسًا للتشتت معًا، واختر الوسيط حين تضلّل بعض القيم المتطرفة.",
  },
};

export default function Spread({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [last, setLast] = useState(14);
  const xs = withLast(last), m = mean(xs), md = median(xs), mo = modes(xs), { q1, q3 } = quartiles(xs);
  const pulled = Math.abs(m - md) >= 1;
  useEffect(() => { if (last <= 2 || last >= 19) onDone?.(); }, [last]); // eslint-disable-line react-hooks/exhaustive-deps
  const r1 = (v: number) => num(Math.round(v * 10) / 10);
  const seen = new Map<number, number>();
  const dots = xs.map((x, i) => { const k = seen.get(x) ?? 0; seen.set(x, k + 1); return { x, y: 0.5 + k, tone: i === xs.length - 1 ? ("b" as const) : ("a" as const), r: 7 }; });
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <Plot x={[0, 20]} y={[0, 4]} height={200} ticks={4} yTicks={0} label={s.chart}
          lines={[{ points: [[m, 0], [m, 4]], tone: "ink", width: 3 }, { points: [[md, 0], [md, 4]], tone: "muted", dashed: true, width: 3 }]} dots={dots} />
        <div className="stack">
          <Slider label={s.last} value={last} min={0} max={20} format={(v) => num(v)} onChange={setLast} />
          <Stats items={[
            { label: s.mean, value: r1(m) }, { label: s.median, value: r1(md) },
            { label: s.mode, value: mo.length ? mo.map((v) => num(v)).join(" ") : s.none },
            { label: s.range, value: num(range(xs)) }, { label: s.iqr, value: r1(q3 - q1) },
          ]} />
          <p className="notice" role="status">{pulled ? s.pulled : s.close}</p>
        </div>
      </div>
    </LabShell>
  );
}
