import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { fit, mse, sample } from "./model";

const S = {
  en: {
    intro: "Circles are the examples the model learns from. Squares are new examples it has never seen: the real test. Give the model more freedom (a bendier curve) and compare the two errors.",
    freedom: "Freedom (how bendy the curve may be)", noise: "Noise in the data", data: "Training examples", few: "Few (10)", many: "Many (40)",
    train: "Error on training examples", test: "Error on new examples", chart: "Training examples (circles), new examples (squares) and the model's curve",
    under: "Too stiff: it misses the pattern on both. This is underfitting.", good: "About right: it follows the pattern and does well on new examples.",
    over: "It passes through the training examples but goes wild between them, so new examples are wrong. This is overfitting.",
    calm: "With more examples, the same freedom can't simply memorise: the curve calms down.",
    takeaway: "A model that is perfect on its training data may still fail on new data. That is why AI is always tested on examples it never saw, and why more (and more varied) data helps.",
  },
  ar: {
    intro: "الدوائر هي الأمثلة التي يتعلّم منها النموذج، والمربعات أمثلة جديدة لم يرها من قبل: إنها الاختبار الحقيقي. امنح النموذج حرية أكبر (منحنى أكثر انثناءً) وقارن بين الخطأين.",
    freedom: "الحرية (مدى انثناء المنحنى)", noise: "التشويش في البيانات", data: "أمثلة التدريب", few: "قليلة (١٠)", many: "كثيرة (٤٠)",
    train: "الخطأ في أمثلة التدريب", test: "الخطأ في الأمثلة الجديدة", chart: "أمثلة التدريب (دوائر)، والأمثلة الجديدة (مربعات)، ومنحنى النموذج",
    under: "متصلّب جدًا: يفوته النمط في الحالتين. هذا هو نقص المطابقة.", good: "مناسب تقريبًا: يتبع النمط ويُحسن في الأمثلة الجديدة.",
    over: "يمرّ بأمثلة التدريب لكنه يتخبّط بينها، فتخطئ الأمثلة الجديدة. هذا هو الإفراط في المطابقة.",
    calm: "مع أمثلة أكثر، لا تستطيع الحرية نفسها أن تحفظ ببساطة: يهدأ المنحنى.",
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
  const overfit = !many && deg >= 7 && eTest > 2 * eTrain + 0.02;
  useEffect(() => { if (overfit) setSawOverfit(true); }, [overfit]);
  useEffect(() => { if (sawOverfit && many && deg >= 7) onDone?.(); }, [sawOverfit, many, deg]); // eslint-disable-line react-hooks/exhaustive-deps
  const curve = Array.from({ length: 121 }, (_, i) => { const x = -1 + i / 60; return [x, Math.max(-2, Math.min(2, f(x)))] as const; });
  const verdict = deg <= 1 ? s.under : overfit ? s.over : many && deg >= 7 ? s.calm : s.good;
  const n3 = (v: number) => num(Math.round(v * 1000) / 1000);
  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
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
          <p className={overfit ? "notice err" : "notice"} role="status">{verdict}</p>
        </div>
      </div>
    </LabShell>
  );
}
