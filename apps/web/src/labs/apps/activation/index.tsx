import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider } from "../../kit/controls";
import { Plot, type Tone } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { apply, curve, FNS, type Fn } from "./model";

const S = {
  en: {
    intro: "A neuron adds up its weighted inputs into one number (the sum). The activation function then turns that sum into the neuron's output. Move the sum and compare the four most common ones.",
    fn: "Activation", sum: "The neuron's sum", out: "Output", all: "Show all four", inputs: "Some sums and what comes out",
    names: { step: "Step", sigmoid: "Sigmoid", tanh: "tanh", relu: "ReLU" } as Record<Fn, string>,
    about: {
      step: "Yes or no: 1 if the sum is 0 or more, otherwise 0. Simple, but learning can't tell which way to adjust.",
      sigmoid: "A smooth yes/no from 0 to 1, read as \"how sure\". Used for the last neuron when the answer is a probability.",
      tanh: "Like sigmoid but from −1 to 1, centred on 0, which often helps hidden layers learn faster.",
      relu: "0 for negative sums, the sum itself otherwise. Very cheap to compute, so deep networks use it everywhere.",
    } as Record<Fn, string>,
    takeaway: "Activation functions bend a neuron's output. Without that bend, stacking many neurons would still only ever draw straight lines.",
  },
  ar: {
    intro: "تجمع الخلية العصبية مدخلاتها الموزونة في رقم واحد (المجموع)، ثم تحوّل دالة التنشيط هذا المجموع إلى مخرج الخلية. حرّك المجموع وقارن بين الدوال الأربع الأكثر شيوعًا.",
    fn: "دالة التنشيط", sum: "مجموع الخلية", out: "المخرج", all: "اعرض الأربع معًا", inputs: "بعض المجاميع وما يخرج منها",
    names: { step: "الدرجة", sigmoid: "سيغمويد", tanh: "tanh", relu: "ReLU" } as Record<Fn, string>,
    about: {
      step: "نعم أو لا: ١ إذا كان المجموع صفرًا أو أكثر، وإلا ٠. بسيطة، لكن التعلّم لا يعرف معها في أي اتجاه يعدّل.",
      sigmoid: "نعم أو لا ناعمة من ٠ إلى ١، تُقرأ على أنها «مدى التأكد». تُستخدم للخلية الأخيرة حين تكون الإجابة احتمالًا.",
      tanh: "مثل السيغمويد لكن من −١ إلى ١، ومتمركزة حول الصفر، وهذا يساعد الطبقات المخفية غالبًا على التعلّم أسرع.",
      relu: "صفر للمجاميع السالبة، والمجموع نفسه غير ذلك. حسابها رخيص جدًا، لذلك تستخدمها الشبكات العميقة في كل مكان.",
    } as Record<Fn, string>,
    takeaway: "دوال التنشيط تثني مخرج الخلية العصبية. ومن دون هذا الانثناء، فإن تكديس خلايا كثيرة لن يرسم إلا خطوطًا مستقيمة.",
  },
};
const TONE: Record<Fn, Tone> = { step: "ink", sigmoid: "a", tanh: "b", relu: "c" };
const SAMPLES = [-4, -1, 0, 1, 4];

export default function Activation({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num, dir } = useI18n();
  const arrow = dir === "rtl" ? "←" : "→";
  const [fn, setFn] = useState<Fn>("sigmoid");
  const [z, setZ] = useState(1);
  const [all, setAll] = useState(false);
  const [seen, setSeen] = useState<Set<Fn>>(() => new Set(["sigmoid"]));
  useEffect(() => { setSeen((x) => new Set(x).add(fn)); }, [fn]);
  useEffect(() => { if (seen.size === FNS.length) onDone?.(); }, [seen.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const y = apply[fn](z);
  const shown = all ? FNS : [fn];
  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.fn} value={fn} options={FNS.map((f) => [f, s.names[f]] as const)} onChange={setFn} />
      <p className="lb-note">{s.about[fn]}</p>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[-6, 6]} y={[-1.2, all || fn === "relu" ? 6 : 1.2]} height={240} label={`${s.names[fn]}: ${s.out}`}
            lines={shown.map((f) => ({ points: curve(f), tone: TONE[f], dashed: f !== fn, width: f === fn ? 3 : 1.5 }))}
            dots={[{ x: z, y: Math.min(6, y), tone: "b", r: 7 }]} xLabel={s.sum} yLabel={s.out} />
          <label className="lb-row"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {s.all}</label>
        </div>
        <div className="stack">
          <Slider label={s.sum} value={z} min={-6} max={6} step={0.1} format={n2} onChange={setZ} />
          <p className="lb-big" dir="ltr"><bdi>{s.names[fn]}</bdi> <bdi>(</bdi><bdi>{n2(z)}</bdi><bdi>) = </bdi><bdi>{n2(y)}</bdi></p>
          <span className="dr-field-label">{s.inputs}</span>
          <table className="lb-table"><tbody>
            {SAMPLES.map((v) => <tr key={v}><td dir="ltr"><bdi>{n2(v)}</bdi></td><td aria-hidden>{arrow}</td><td dir="ltr"><bdi>{n2(apply[fn](v))}</bdi></td></tr>)}
          </tbody></table>
        </div>
      </div>
    </LabShell>
  );
}
