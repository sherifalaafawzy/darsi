import { useEffect, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { activate, DAYS, decide, score, weightedSum, type Activation } from "./model";

const S = {
  en: {
    intro: "A neuron takes some numbers, multiplies each by a weight (how much it matters), adds them up with a bias, and turns the total into an answer. This one decides: take an umbrella today?",
    inputs: ["How cloudy", "Chance of rain (forecast)", "Rainy season"], weight: "Weight", bias: "Bias (how keen to say yes)",
    activation: "Activation", step: "Step (yes or no)", sigmoid: "Sigmoid (how sure)",
    today: "Today", yes: "Take the umbrella", no: "Leave it at home", sure: "Sure", sum: "Weighted sum",
    challenge: "Challenge: set the weights so the neuron is right on all four days.", days: ["Sunny, dry season", "Cloudy, rain likely, rainy season", "Cloudy, dry forecast", "Light cloud, rain forecast"],
    expect: "Should", right: "Right", wrong: "Wrong", solved: "All four right. You just did what training does: you found weights that work.",
    curve: "The activation turns the sum into the output", input: "Input", output: "Output",
    try1: (b: string) => `Drag the bias down to ${b}: “Today” flips to “Leave it at home”. A negative bias makes the neuron harder to convince.`,
    try2: "Now raise the weight of input 2 (the forecast) bit by bit and watch the table: at 0.9, all four days are right. You found working weights by hand.",
    try3: "Switch the activation to Step: every answer stays the same, but you no longer see how sure the neuron is.",
    takeaway: "A neuron multiplies each input by a weight, adds a bias, and squashes the total. Learning means finding good weights: a network does it with thousands of neurons and millions of examples.",
  },
  ar: {
    intro: "تأخذ الخلية العصبية بعض الأرقام، وتضرب كلًّا منها في وزن (مدى أهميته)، وتجمعها مع انحياز، ثم تحوّل المجموع إلى إجابة. هذه الخلية تقرّر: هل تأخذ المظلة اليوم؟",
    inputs: ["مدى الغيوم", "احتمال المطر (النشرة)", "موسم الأمطار"], weight: "الوزن", bias: "الانحياز (مدى ميلها لقول نعم)",
    activation: "دالة التنشيط", step: "درجة (نعم أو لا)", sigmoid: "سيغمويد (مدى التأكد)",
    today: "اليوم", yes: "خذ المظلة", no: "اتركها في البيت", sure: "التأكد", sum: "المجموع الموزون",
    challenge: "التحدي: اضبط الأوزان لتصيب الخلية في الأيام الأربعة كلها.", days: ["مشمس، موسم جاف", "غائم، المطر مرجّح، موسم الأمطار", "غائم، النشرة جافة", "غيوم خفيفة، النشرة ممطرة"],
    expect: "المطلوب", right: "صحيح", wrong: "خطأ", solved: "الأيام الأربعة صحيحة. لقد فعلت ما يفعله التدريب: وجدت أوزانًا تنجح.",
    curve: "دالة التنشيط تحوّل المجموع إلى المخرج", input: "المدخل", output: "المخرج",
    try1: (b: string) => `اسحب الانحياز إلى ${b}: يتحوّل «اليوم» إلى «اتركها في البيت». الانحياز السالب يجعل إقناع الخلية أصعب.`,
    try2: "ارفع الآن وزن المدخل ٢ (النشرة) قليلًا قليلًا وراقب الجدول: عند ٠٫٩ تصح الأيام الأربعة كلها. لقد وجدت بيدك أوزانًا تنجح.",
    try3: "بدّل دالة التنشيط إلى «درجة»: تبقى كل الإجابات كما هي، لكنك لم تعد ترى مدى تأكد الخلية.",
    takeaway: "تضرب الخلية العصبية كل مدخل في وزن، وتضيف انحيازًا، ثم تضغط المجموع. التعلّم يعني إيجاد أوزان جيدة، والشبكة تفعل ذلك بآلاف الخلايا وملايين الأمثلة.",
  },
};
const START = { w: [1, 0, 0], b: 0 };

export default function Neuron({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [x, setX] = useState<[number, number, number]>([0.6, 0.5, 1]);
  const [w, setW] = useState(START.w);
  const [b, setB] = useState(START.b);
  const [f, setF] = useState<Activation>("sigmoid");
  const z = weightedSum(x, w, b), y = activate(z, f), yes = y >= 0.5;
  const right = score(w, b, f);
  useEffect(() => { if (right === DAYS.length) onDone?.(); }, [right]); // eslint-disable-line react-hooks/exhaustive-deps
  const n2 = (v: number) => num(Math.round(v * 100) / 100, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const curve = Array.from({ length: 61 }, (_, i) => { const t = -6 + i * 0.2; return [t, activate(t, f)] as const; });

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1(num(-1)), s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setW(START.w); setB(START.b); }}>
      <div className="lb-two">
        <div className="stack">
          {s.inputs.map((label, i) => (
            <div key={i} className="lb-panel">
              {i < 2
                ? <Slider label={`${s.input} ${num(i + 1)}: ${label}`} value={x[i]} min={0} max={1} step={0.05} format={n2} onChange={(v) => setX(x.map((o, k) => (k === i ? v : o)) as typeof x)} />
                : <Segmented label={`${s.input} ${num(3)}: ${label}`} value={x[2]} options={[[0, "0"], [1, "1"]]} onChange={(v) => setX([x[0], x[1], v])} />}
              <Slider label={s.weight} value={w[i]} min={-3} max={3} step={0.1} format={n2} onChange={(v) => setW(w.map((o, k) => (k === i ? v : o)))} />
            </div>
          ))}
          <Slider label={s.bias} value={b} min={-4} max={4} step={0.1} format={n2} onChange={setB} />
          <Segmented label={s.activation} value={f} options={[["step", s.step], ["sigmoid", s.sigmoid]]} onChange={setF} />
        </div>
        <div className="stack">
          <NeuronDiagram x={x} w={w} y={y} fmt={n2} />
          {/* Each number is its own isolate: Arabic-Indic digits would otherwise turn the whole formula right-to-left. */}
          <p className="lb-mono" dir="ltr" aria-label={s.sum}>
            {[...x.flatMap((xi, i) => [...(i ? [" + "] : []), n2(xi), " × ", n2(w[i])]), b < 0 ? " − " : " + ", n2(Math.abs(b)), " = ", n2(z)].map((part, i) => <bdi key={i}>{part}</bdi>)}
          </p>
          <div className={yes ? "notice ok" : "notice"} role="status">
            <strong>{s.today}: {yes ? s.yes : s.no}</strong>{f === "sigmoid" && <span> ({s.sure}: {num(y, { style: "percent" })})</span>}
          </div>
          <Plot x={[-6, 6]} y={[0, 1]} height={160} label={s.curve} lines={[{ points: curve, tone: "a" }]} dots={[{ x: Math.max(-6, Math.min(6, z)), y, tone: "b", r: 7 }]} xLabel={s.sum} yLabel={s.output} />
        </div>
      </div>

      <div className="lb-panel">
        <strong>{s.challenge}</strong>
        <div className="table-wrap"><table className="lb-table">
          <tbody>{DAYS.map((d, i) => {
            const got = decide(d.x, w, b, f), ok = got === d.umbrella;
            return <tr key={i}><td>{s.days[i]}</td><td>{s.expect}: {d.umbrella ? s.yes : s.no}</td>
              <td className={ok ? "lb-ok" : "lb-no"}><Icon name={ok ? "check" : "cross"} size={16} /> {ok ? s.right : s.wrong}</td></tr>;
          })}</tbody>
        </table></div>
        <Stats items={[{ label: s.right, value: `${num(right)} / ${num(DAYS.length)}` }]} />
        {right === DAYS.length && <p className="notice ok" role="status">{s.solved}</p>}
      </div>
    </LabShell>
  );
}

/** Inputs → weighted lines (thicker = bigger weight; dashed = negative) → the neuron → its output. */
function NeuronDiagram({ x, w, y, fmt }: { x: readonly number[]; w: readonly number[]; y: number; fmt: (v: number) => string }) {
  return (
    <svg viewBox="0 0 300 170" className="lb-diagram" role="img" aria-hidden direction="ltr">
      {x.map((xi, i) => {
        const cy = 30 + i * 55;
        return (
          <g key={i}>
            <line x1={44} y1={cy} x2={180} y2={85} className={`lb-wire ${w[i] < 0 ? "lb-tone-b" : "lb-tone-a"}`} strokeWidth={1 + Math.min(8, Math.abs(w[i]) * 2.5)} strokeDasharray={w[i] < 0 ? "7 5" : undefined} />
            <circle cx={30} cy={cy} r={18} className="lb-node" /><text x={30} y={cy + 5} textAnchor="middle" className="lb-node-text">{fmt(xi)}</text>
          </g>
        );
      })}
      <line x1={204} y1={85} x2={262} y2={85} className="lb-wire lb-tone-ink" strokeWidth={3} />
      <circle cx={180} cy={85} r={26} className="lb-node is-main" />
      <text x={180} y={91} textAnchor="middle" className="lb-node-text">Σ</text>
      <circle cx={276} cy={85} r={16} className="lb-node is-out" style={{ fillOpacity: 0.15 + y * 0.85 }} />
    </svg>
  );
}
