import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { fit, mse, sample, verdict } from "./model";

const S = {
  en: {
    intro: "Circles are the examples the model learns from. Squares are new examples it has never seen: the real test. Give the model more freedom (a bendier curve) and compare the two errors.",
    freedom: "Freedom (how bendy the curve may be)", noise: "Noise in the data", data: "Training examples", few: "Few (10)", many: "Many (40)",
    train: "Error on training examples", test: "Error on new examples", chart: "Training examples (circles), new examples (squares) and the model's curve",
    under: "Too stiff: it misses the pattern on both. This is underfitting.", good: "About right: it follows the pattern and does well on new examples.",
    over: "It hugs the training examples but goes wild between them, so it gets new examples wrong. This is overfitting.",
    calm: "With more examples, the same freedom can't simply memorise: the curve calms down.",
    try1: "Drag Freedom up to 9: the curve now passes through every circle but swings wildly between them, and the error on new examples shoots up.",
    try2: "Keep Freedom at 9 and pick Many (40): with more examples to follow, the curve calms down and both errors are low.",
    try3: "Set Freedom to 1: a straight line can't follow the wave, so both errors are high. That is underfitting.",
    takeaway: "A model that is perfect on its training data may still fail on new data. That is why AI is always tested on examples it never saw, and why more (and more varied) data helps.",
  },
  ar: {
    intro: "الدوائر هي الأمثلة التي يتعلّم منها النموذج، والمربعات أمثلة جديدة لم يرها من قبل: إنها الاختبار الحقيقي. امنح النموذج حرية أكبر (منحنى أكثر انثناءً) وقارن بين الخطأين.",
    freedom: "الحرية (مدى انثناء المنحنى)", noise: "التشويش في البيانات", data: "أمثلة التدريب", few: "قليلة (١٠)", many: "كثيرة (٤٠)",
    train: "الخطأ في أمثلة التدريب", test: "الخطأ في الأمثلة الجديدة", chart: "أمثلة التدريب (دوائر)، والأمثلة الجديدة (مربعات)، ومنحنى النموذج",
    under: "متصلّب جدًا: يفوته النمط في الحالتين. هذا هو نقص المطابقة.", good: "مناسب تقريبًا: يتبع النمط ويُحسن في الأمثلة الجديدة.",
    over: "يلتصق بأمثلة التدريب لكنه يتخبّط بينها، فيخطئ في الأمثلة الجديدة. هذا هو الإفراط في المطابقة.",
    calm: "مع أمثلة أكثر، لا تستطيع الحرية نفسها أن تحفظ ببساطة: يهدأ المنحنى.",
    try1: "اسحب «الحرية» إلى ٩: يمرّ المنحنى الآن بكل الدوائر، لكنه يتأرجح بعنف بينها، ويقفز الخطأ في الأمثلة الجديدة.",
    try2: "أبقِ «الحرية» على ٩ واختر «كثيرة (٤٠)»: مع أمثلة أكثر يتبعها، يهدأ المنحنى ويصبح الخطآن صغيرين.",
    try3: "اجعل «الحرية» ١: لا يستطيع الخط المستقيم أن يتبع الموجة، فيكون الخطآن كبيرين. هذا هو نقص المطابقة.",
    takeaway: "النموذج المثالي على بيانات تدريبه قد يفشل مع بيانات جديدة. لهذا يُختبر الذكاء الاصطناعي دائمًا على أمثلة لم يرها، ولهذا تساعد البيانات الأكثر والأكثر تنوعًا.",
  },
};

export default function Overfit({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [deg, setDeg] = useState(3);
  const [noise, setNoise] = useState(0.15);
  const [many, setMany] = useState(false);
  const [sawOverfit, setSawOverfit] = useState(false);
  const train = useMemo(() => sample(many ? 40 : 10, noise, 21), [many, noise]);
  const test = useMemo(() => sample(30, noise, 99), [noise]);
  const f = useMemo(() => fit(train, deg), [train, deg]);
  const eTrain = mse(f, train), eTest = mse(f, test);
  const v = verdict(eTrain, eTest, noise, deg, many), overfit = v === "over";
  useEffect(() => { if (overfit) setSawOverfit(true); }, [overfit]);
  useEffect(() => { if (sawOverfit && many && deg >= 7) onDone?.(); }, [sawOverfit, many, deg]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kept inside the chart: a wild curve runs along its top or bottom edge instead of over the axis labels.
  const curve = Array.from({ length: 121 }, (_, i) => { const x = -1 + i / 60; return [x, Math.max(-1.6, Math.min(1.6, f(x)))] as const; });
  const n3 = (v: number) => num(Math.round(v * 1000) / 1000);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <Plot x={[-1, 1]} y={[-1.6, 1.6]} height={280} ticks={2} label={s.chart}
          lines={[{ points: curve, tone: "ink", width: 3 }]}
          dots={[...test.map((p) => ({ x: p.x, y: p.y, tone: "b" as const, shape: "square" as const, r: 4 })), ...train.map((p) => ({ x: p.x, y: p.y, tone: "a" as const, r: 5.5 }))]} />
        <div className="stack">
          <Slider label={s.freedom} value={deg} min={1} max={12} format={(v) => num(v)} onChange={setDeg} />
          <Slider label={s.noise} value={noise} min={0} max={0.4} step={0.05} format={(v) => num(Math.round(v * 100) / 100)} onChange={setNoise} />
          <Segmented label={s.data} value={many ? 1 : 0} options={[[0, s.few], [1, s.many]]} onChange={(v) => setMany(v === 1)} />
          <ul className="lb-bars">
            {[{ label: s.train, v: eTrain }, { label: s.test, v: eTest }].map((r) => (
              <li key={r.label} className="lb-bar"><span>{r.label}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.min(100, Math.round((r.v / 0.3) * 100))}%` }} /></span><span>{n3(r.v)}</span></li>
            ))}
          </ul>
          <p className={overfit ? "notice err" : "notice"} role="status">{s[v]}</p>
        </div>
      </div>
    </LabShell>
  );
}
