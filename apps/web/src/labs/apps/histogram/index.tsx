import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { bins, heights, journeys, shape } from "./model";

const S = {
  en: {
    intro: "A histogram counts how many values fall in each equal-width bin. Choose a dataset and a bin width.",
    data: "Data", h: "Heights (cm)", j: "Journey to school (minutes)", width: "Bin width", chart: "Histogram: how many pupils fall in each bin",
    symmetric: "Roughly symmetric: most values sit in the middle, with fewer on each side.",
    right: "Skewed right: most values are small, and a long tail stretches towards large values.",
    left: "Skewed left: a long tail stretches towards small values.",
    tooFew: "So few bins hide the shape.", tooMany: "So many thin bins make the shape noisy and gappy.",
    try1: "With heights, set the bin width to 20: two or three fat bars hide the hill shape completely.",
    try2: "Set the bin width to 1: the bars become a jagged comb. Somewhere between 3 and 6 shows the shape best.",
    try3: "Switch to journey times: most pupils live close, a few live far, so the shape is skewed right.",
    takeaway: "The shape of a distribution (symmetric or skewed, one hill or two) tells you which average to trust, but the bin width you choose can hide it.",
  },
  ar: {
    intro: "المدرج التكراري يعدّ القيم التي تقع في كل فئة متساوية العرض. اختر مجموعة بيانات وعرضًا للفئة.",
    data: "البيانات", h: "الأطوال (سم)", j: "زمن الوصول إلى المدرسة (دقائق)", width: "عرض الفئة", chart: "مدرج تكراري: عدد التلاميذ في كل فئة",
    symmetric: "متماثل تقريبًا: معظم القيم في الوسط، وعدد أقل على كل جانب.",
    right: "ملتوٍ إلى اليمين: معظم القيم صغيرة، وذيل طويل يمتد نحو القيم الكبيرة.",
    left: "ملتوٍ إلى اليسار: ذيل طويل يمتد نحو القيم الصغيرة.",
    tooFew: "فئات قليلة جدًا تُخفي الشكل.", tooMany: "فئات كثيرة رفيعة تجعل الشكل مشوّشًا ومليئًا بالفجوات.",
    try1: "مع الأطوال، اجعل عرض الفئة ٢٠: عمودان أو ثلاثة أعمدة عريضة تُخفي شكل التلّ تمامًا.",
    try2: "اجعل عرض الفئة ١: تصبح الأعمدة كالمشط المسنّن. عرض بين ٣ و٦ يُظهر الشكل أفضل.",
    try3: "انتقل إلى أزمنة الوصول: معظم التلاميذ يسكنون قريبًا وقليل منهم بعيدًا، فالشكل ملتوٍ إلى اليمين.",
    takeaway: "شكل التوزيع (متماثل أو ملتوٍ، تلّ واحد أو تلّان) يخبرك أيّ متوسط تثق به، لكن عرض الفئة الذي تختاره قد يُخفيه.",
  },
};

export default function Histogram({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [set, setSet] = useState<"h" | "j">("h");
  const [w, setW] = useState(5);
  const xs = useMemo(() => (set === "h" ? heights() : journeys()), [set]);
  const bs = bins(xs, w), top = Math.max(...bs.map((b) => b.count));
  const [tried, setTried] = useState({ wide: false, thin: false, j: false });
  useEffect(() => { setTried((t) => ({ wide: t.wide || w >= 15, thin: t.thin || w <= 1, j: t.j || set === "j" })); }, [w, set]);
  useEffect(() => { if (tried.wide && tried.thin && tried.j) onDone?.(); }, [tried]); // eslint-disable-line react-hooks/exhaustive-deps
  const x0 = bs[0].from, x1 = bs[bs.length - 1].to;
  const note = bs.length <= 3 ? s.tooFew : bs.length > 25 ? s.tooMany : s[shape(xs)];
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <Plot x={[x0, x1]} y={[0, top]} height={260} ticks={4} yTicks={2} label={s.chart} fmt={(v) => num(Math.round(v))}>
          {({ px, py }) => bs.map((b) => <rect key={b.from} x={px(b.from) + 0.5} y={py(b.count)} width={Math.max(0.5, px(b.to) - px(b.from) - 1)} height={py(0) - py(b.count)} style={{ fill: "var(--lagoon)" }} />)}
        </Plot>
        <div className="stack">
          <Segmented label={s.data} value={set} options={[["h", s.h], ["j", s.j]]} onChange={setSet} />
          <Slider label={s.width} value={w} min={1} max={20} format={(v) => num(v)} onChange={setW} />
          <p className="notice" role="status">{note}</p>
        </div>
      </div>
    </LabShell>
  );
}
