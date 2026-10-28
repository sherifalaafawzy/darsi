import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { errorRate, leaves, missRate, train } from "./model";

const TEST_A = leaves(300, 0, 901), TEST_B = leaves(300, 1, 902);
const S = {
  en: {
    intro: "A phone app spots sick leaves from a photo. It was trained on 200 photos, mostly from the sunny valley (region A). In the cloudy hills (region B) photos come out darker, so sick spots look lighter. Change how many training photos come from region B.",
    share: "Training photos from the cloudy hills (B)", chart: "Training photos: filled circles sick, open squares healthy; the line is where the model switches from healthy to sick",
    dark: "how dark the spots look", light: "how bright the photo is", regionA: "sunny valley (A)", regionB: "cloudy hills (B)",
    overall: "Wrong overall, on photos like the training ones", errA: "Wrong in the sunny valley (A)", errB: "Wrong in the cloudy hills (B)", missB: "Sick leaves missed in the hills (B)",
    gap: (o: string, b: string) => `The headline score says it is wrong only ${o} of the time, yet it misses ${b} of sick leaves in the hills.`,
    fair: "With enough photos from both regions, the errors are close: the model learned that darker photos make spots look lighter.",
    try1: "At 5 %, read the bars: overall the app is wrong only about 3 % of the time, yet it misses about a third of the sick leaves in the hills.",
    try2: "Drag the slider to 50 %: the errors in the valley and the hills come close, and the dashed line tilts, because the model learns that darker photos make spots look lighter.",
    try3: "Set it to 0 %: with no photos from the hills at all, it misses nearly half of their sick leaves.",
    takeaway: "An AI is only as fair as its data. If a group is missing from the training data, the model can fail that group while its overall score still looks good. Ask who the data came from, and check errors for each group, not just overall. The same happens with faces, voices and accents.",
  },
  ar: {
    intro: "تطبيق هاتف يكتشف الأوراق المريضة من صورة. تدرّب على ٢٠٠ صورة معظمها من الوادي المشمس (المنطقة أ). وفي التلال الغائمة (المنطقة ب) تخرج الصور أغمق، فتبدو البقع المريضة أفتح. غيّر عدد صور التدريب الآتية من المنطقة ب.",
    share: "صور التدريب من التلال الغائمة (ب)", chart: "صور التدريب: الدوائر الممتلئة مريضة والمربعات المفرغة سليمة، والخط حيث ينتقل النموذج من «سليمة» إلى «مريضة»",
    dark: "مدى غمق البقع في الصورة", light: "سطوع الصورة", regionA: "الوادي المشمس (أ)", regionB: "التلال الغائمة (ب)",
    overall: "الخطأ الإجمالي في صور تشبه صور التدريب", errA: "الخطأ في الوادي المشمس (أ)", errB: "الخطأ في التلال الغائمة (ب)", missB: "الأوراق المريضة الفائتة في التلال (ب)",
    gap: (o: string, b: string) => `تقول النتيجة الإجمالية إنه يخطئ في ${o} فقط من الحالات، لكنه يفوّت ${b} من الأوراق المريضة في التلال.`,
    fair: "مع صور كافية من المنطقتين تتقارب الأخطاء: تعلّم النموذج أن الصور الأغمق تجعل البقع تبدو أفتح.",
    try1: "عند ٥٪ اقرأ الأشرطة: يخطئ التطبيق إجمالًا في نحو ٣٪ فقط من الحالات، لكنه يفوّت نحو ثلث الأوراق المريضة في التلال.",
    try2: "اسحب المؤشر إلى ٥٠٪: تتقارب الأخطاء في الوادي والتلال، ويميل الخط المتقطع أكثر، لأن النموذج يتعلّم أن الصور الأغمق تجعل البقع تبدو أفتح.",
    try3: "اضبطه على ٠٪: من دون أي صور من التلال، يفوّت التطبيق نحو نصف أوراقها المريضة.",
    takeaway: "لا يكون الذكاء الاصطناعي أعدل من بياناته. إذا غابت فئة عن بيانات التدريب فقد يخذلها النموذج بينما تبدو نتيجته الإجمالية جيدة. اسأل من أين جاءت البيانات، وافحص الأخطاء لكل فئة لا للمجموع فقط. ويحدث الشيء نفسه مع الوجوه والأصوات واللهجات.",
  },
};

export default function Bias({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [share, setShare] = useState(0.05);
  const [seen, setSeen] = useState(() => new Set([0.05]));
  const data = useMemo(() => leaves(200, share, 77), [share]);
  const m = useMemo(() => train(data), [data]);
  const same = useMemo(() => leaves(400, share, 903), [share]);
  useEffect(() => { if (seen.size >= 3) onDone?.(); }, [seen.size >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v: number) => num(v, { style: "percent" });
  const overall = errorRate(m, same), eA = errorRate(m, TEST_A), eB = errorRate(m, TEST_B), mB = missRate(m, TEST_B);
  // The model's boundary: w1·dark + w2·light + b = 0, drawn as dark = −(w2·light + b) / w1.
  const edge = [0, 1].map((y) => [-(m.w2 * y + m.b) / m.w1, y] as const);
  const rows = [{ label: s.overall, v: overall }, { label: s.errA, v: eA }, { label: s.errB, v: eB }, { label: s.missB, v: mB }];

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.share} value={share} min={0} max={0.5} step={0.05} onChange={(v) => { setShare(v); setSeen((x) => new Set(x).add(v)); }} format={pct} />
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 1]} y={[0, 1]} height={260} label={s.chart} xLabel={s.dark} yLabel={s.light}
            lines={[{ points: edge, tone: "ink", dashed: true }]}
            dots={data.map((l) => ({ x: l.dark, y: l.light, r: 4, tone: l.sick ? "b" as const : "a" as const, shape: l.sick ? "circle" as const : "square" as const, ring: !l.sick }))}>
            {({ px, py }) => <>
              <text x={px(0.02)} y={py(0.97)} className="lb-plot-label is-on">{s.regionA}</text>
              <text x={px(0.02)} y={py(0.2)} className="lb-plot-label is-on">{s.regionB}</text>
            </>}
          </Plot>
          <p className="lb-note">{s.chart}</p>
        </div>
        <div className="stack">
          <ul className="lb-bars">
            {rows.map((r) => <li key={r.label} className="lb-bar"><span>{r.label}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(r.v * 100)}%` }} /></span><span>{pct(r.v)}</span></li>)}
          </ul>
          <p className="lb-verdict" aria-live="polite">{mB > 0.15 ? s.gap(pct(overall), pct(mB)) : s.fair}</p>
        </div>
      </div>
    </LabShell>
  );
}
