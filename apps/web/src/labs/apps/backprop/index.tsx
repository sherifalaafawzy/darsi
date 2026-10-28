import { useState, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { backward, error, forward, START, train, update, type W } from "./model";

const X: [number, number] = [1, 0.5];
const T = 1;
const S = {
  en: {
    intro: "A network learns by passing an example forward to get an answer, measuring how wrong it is, then passing the blame backwards so every weight knows which way to move. Step through it with real numbers.",
    stages: ["Ready", "Forward: hidden neurons", "Forward: output", "How wrong?", "Blame at the output", "Blame passed back", "Fix every weight"],
    explain: [
      "Inputs x₁ = 1 and x₂ = 0.5. We want the output to be 1. The numbers on the lines are the weights.",
      "Each hidden neuron adds its weighted inputs (z) and squashes the sum with the sigmoid (h).",
      "The output neuron does the same with the hidden neurons' answers.",
      "The error compares the answer with the target. Smaller is better.",
      "How much would the error change if the output's sum changed? Multiply by each hidden answer to get the blame for each output weight.",
      "The blame flows back along each weight to the hidden neurons, and on to the first weights. This is backpropagation: the chain rule, one link at a time.",
      "Every weight moves a little against its blame. Next shows the new error.",
    ],
    next: "Next", again: "Start again", train100: "Learn 100 more times", rate: "Step size", error: "Error", learned: "Examples learned", answer: "Answer",
    old: "Old", blame: "Blame", newW: "New", weight: "Weight",
    try1: (a: string, b: string) => `Press Next until “Fix every weight”, then once more: the weights change, the Answer rises from ${a} to ${b} and the Error falls.`,
    try2: "At “Fix every weight”, look at the Blame column: a negative blame makes a weight grow, a positive one makes it shrink. The weights into h₂ shrink, because h₂ pulls the answer down through its negative weight v₂.",
    try3: (a: string, b: string) => `Set the step size to 3 and press “Learn 100 more times”: the answer gets to about ${a}. Press Start again, set the step size to 0.5 and do the same: it only reaches about ${b}.`,
    takeaway: "Backpropagation is how almost every neural network learns: a forward pass for the answer, a backward pass that hands each weight its share of the blame, and a small step for every weight.",
  },
  ar: {
    intro: "تتعلّم الشبكة بتمرير المثال إلى الأمام للحصول على إجابة، ثم قياس مقدار خطئها، ثم تمرير المسؤولية إلى الخلف ليعرف كل وزن في أي اتجاه يتحرك. تابعها خطوة بخطوة بأرقام حقيقية.",
    stages: ["جاهزة", "إلى الأمام: الخلايا المخفية", "إلى الأمام: المخرج", "ما مقدار الخطأ؟", "المسؤولية عند المخرج", "تمرير المسؤولية إلى الخلف", "تصحيح كل وزن"],
    explain: [
      "المدخلات x₁ = ١ و x₂ = ٠٫٥، ونريد أن يكون المخرج ١. الأرقام على الخطوط هي الأوزان.",
      "تجمع كل خلية مخفية مدخلاتها الموزونة (z) ثم تضغط المجموع بدالة السيغمويد (h).",
      "تفعل خلية المخرج الشيء نفسه بإجابات الخلايا المخفية.",
      "يقارن الخطأ الإجابة بالهدف. والأصغر أفضل.",
      "بكم سيتغيّر الخطأ لو تغيّر مجموع المخرج؟ اضرب ذلك في إجابة كل خلية مخفية لتحصل على مسؤولية كل وزن من أوزان المخرج.",
      "تتدفق المسؤولية إلى الخلف عبر كل وزن حتى الخلايا المخفية، ثم إلى الأوزان الأولى. هذا هو الانتشار العكسي: قاعدة السلسلة، حلقة بعد حلقة.",
      "يتحرك كل وزن قليلًا عكس مسؤوليته. اضغط «التالي» لترى الخطأ الجديد.",
    ],
    next: "التالي", again: "ابدأ من جديد", train100: "تعلّم ١٠٠ مرة أخرى", rate: "حجم الخطوة", error: "الخطأ", learned: "الأمثلة المتعلَّمة", answer: "الإجابة",
    old: "القديم", blame: "المسؤولية", newW: "الجديد", weight: "الوزن",
    try1: (a: string, b: string) => `اضغط «التالي» حتى تصل إلى «تصحيح كل وزن»، ثم اضغطه مرة أخرى: تتغيّر الأوزان، وترتفع الإجابة من ${a} إلى ${b}، وينخفض الخطأ.`,
    try2: "في «تصحيح كل وزن» انظر إلى عمود «المسؤولية»: المسؤولية السالبة تكبّر الوزن، والموجبة تصغّره. وتصغر الأوزان الداخلة إلى h₂، لأن h₂ تسحب الإجابة إلى الأسفل عبر وزنها السالب v₂.",
    try3: (a: string, b: string) => `اجعل حجم الخطوة ٣ واضغط «تعلّم ١٠٠ مرة أخرى»: تصل الإجابة إلى ${a} تقريبًا. ثم اضغط «ابدأ من جديد»، واجعل حجم الخطوة ٠٫٥ وكرّر ذلك: لا تصل إلا إلى ${b} تقريبًا.`,
    takeaway: "الانتشار العكسي هو طريقة تعلّم كل الشبكات العصبية تقريبًا: تمرير أمامي للإجابة، وتمرير عكسي يعطي كل وزن نصيبه من المسؤولية، وخطوة صغيرة لكل وزن.",
  },
};
// What "Try this" promises, worked out from the model: the answer before and after one fix (step size 1), and after
// 100 fixes with a big and a small step.
const Y0 = forward(START, X).y, Y1 = forward(train(START, X, T, 1, 1), X).y;
const Y_BIG = forward(train(START, X, T, 3, 100), X).y, Y_SMALL = forward(train(START, X, T, 0.5, 100), X).y;
const NAMES: (keyof W)[] = ["w11", "w12", "b1", "w21", "w22", "b2", "v1", "v2", "c"];
const SUB: Record<keyof W, string> = { w11: "w₁₁", w12: "w₁₂", b1: "b₁", w21: "w₂₁", w22: "w₂₂", b2: "b₂", v1: "v₁", v2: "v₂", c: "c" };

export default function Backprop({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [w, setW] = useState<W>(START);
  const [stage, setStage] = useState(0);
  const [rate, setRate] = useState(1);
  const [learned, setLearned] = useState(0);
  const b = backward(w, X, T), f = b.f, E = error(f.y, T);
  const n = (v: number) => num(Math.round(v * 1000) / 1000), n2 = (v: number) => num(Math.round(v * 100) / 100);
  const eq = (...parts: (string | number)[]) => <p className="lb-mono" dir="ltr">{parts.map((p, i) => <bdi key={i}>{typeof p === "number" ? n(p) : p}</bdi>)}</p>;
  const next = () => {
    if (stage < 6) setStage(stage + 1);
    else { setW(update(w, b.g, rate)); setLearned(learned + 1); setStage(1); if (learned + 1 >= 3) onDone?.(); }
  };
  const body: ReactNode[] = [
    eq("x₁ = ", X[0], "   x₂ = ", X[1], "   t = ", T),
    <>{eq("z₁ = ", w.w11, " × ", X[0], " + ", w.w12, " × ", X[1], " + ", w.b1, " = ", f.z1)}{eq("h₁ = σ(", f.z1, ") = ", f.h1)}{eq("z₂ = ", w.w21, " × ", X[0], " + ", w.w22, " × ", X[1], " + ", w.b2, " = ", f.z2)}{eq("h₂ = σ(", f.z2, ") = ", f.h2)}</>,
    <>{eq("z = ", w.v1, " × ", f.h1, " + ", w.v2, " × ", f.h2, " + ", w.c, " = ", f.zo)}{eq("y = σ(", f.zo, ") = ", f.y)}</>,
    eq("E = ½ × (", f.y, " − ", T, ")² = ", E),
    <>{eq("δ = (", f.y, " − ", T, ") × ", f.y, " × (1 − ", f.y, ") = ", b.dO)}{eq("∂E/∂v₁ = δ × h₁ = ", b.g.v1, "   ∂E/∂v₂ = δ × h₂ = ", b.g.v2)}</>,
    <>{eq("δ₁ = δ × v₁ × h₁ × (1 − h₁) = ", b.d1)}{eq("δ₂ = δ × v₂ × h₂ × (1 − h₂) = ", b.d2)}{eq("∂E/∂w₁₁ = δ₁ × x₁ = ", b.g.w11, "   ∂E/∂w₂₂ = δ₂ × x₂ = ", b.g.w22)}</>,
    <table className="lb-table" dir="ltr"><thead><tr><th>{s.weight}</th><th>{s.old}</th><th>{s.blame}</th><th>{s.newW}</th></tr></thead>
      <tbody>{NAMES.map((k) => <tr key={k}><td><bdi>{SUB[k]}</bdi></td><td><bdi>{n(w[k])}</bdi></td><td><bdi>{n(b.g[k])}</bdi></td><td><bdi>{n(w[k] - rate * b.g[k])}</bdi></td></tr>)}</tbody></table>,
  ];

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1(n(Y0), n(Y1)), s.try2, s.try3(n2(Y_BIG), n2(Y_SMALL))]} takeaway={s.takeaway} onReset={() => { setW(START); setStage(0); setLearned(0); }}>
      <ol className="lb-stages">{s.stages.map((st, i) => <li key={i} className={i === stage ? "is-on" : i < stage ? "is-past" : ""} aria-current={i === stage ? "step" : undefined}>{st}</li>)}</ol>
      <div className="lb-two">
        <BackpropDiagram w={w} f={f} stage={stage} fmt={n} />
        <div className="stack">
          <strong>{s.stages[stage]}</strong>
          <p className="lb-note">{s.explain[stage]}</p>
          {body[stage]}
          <div className="lb-row">
            <Button size="sm" icon="next" onClick={next}>{s.next}</Button>
            <Button size="sm" variant="secondary" onClick={() => { setW(train(w, X, T, rate, 100)); setLearned(learned + 100); setStage(0); onDone?.(); }}>{s.train100}</Button>
          </div>
          <Segmented label={s.rate} value={rate} options={[[0.5, num(0.5)], [1, num(1)], [3, num(3)]]} onChange={setRate} />
          <Stats items={[{ label: s.answer, value: n(f.y) }, { label: s.error, value: n(E) }, { label: s.learned, value: num(learned) }]} />
        </div>
      </div>
    </LabShell>
  );
}

/** x₁, x₂ → h₁, h₂ → y. Forward stages light the forward wires; backward stages light them as the blame flows back. */
function BackpropDiagram({ w, f, stage, fmt }: { w: W; f: ReturnType<typeof backward>["f"]; stage: number; fmt: (v: number) => string }) {
  const P = { x1: [36, 50], x2: [36, 150], h1: [150, 50], h2: [150, 150], y: [262, 100] } as const;
  const lit = (layer: "in" | "out") => (layer === "in" ? stage === 1 || stage === 5 : stage === 2 || stage === 4);
  const wire = (a: keyof typeof P, b: keyof typeof P, v: number, layer: "in" | "out") => (
    <g key={`${a}${b}`}>
      <line x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} className={`lb-wire ${v < 0 ? "lb-tone-b" : "lb-tone-a"}`} strokeWidth={lit(layer) ? 5 : 2} strokeDasharray={v < 0 ? "6 4" : undefined} />
      <text x={(P[a][0] + P[b][0]) / 2} y={(P[a][1] + P[b][1]) / 2 - 4} textAnchor="middle" className="lb-node-text">{fmt(v)}</text>
    </g>
  );
  const node = (k: keyof typeof P, label: string, value?: number, cls = "lb-node") => (
    <g key={k}><circle cx={P[k][0]} cy={P[k][1]} r={20} className={cls} /><text x={P[k][0]} y={P[k][1] + (value === undefined ? 4 : -2)} textAnchor="middle" className="lb-node-text">{label}</text>
      {value !== undefined && <text x={P[k][0]} y={P[k][1] + 12} textAnchor="middle" className="lb-node-text">{fmt(value)}</text>}</g>
  );
  return (
    <svg viewBox="0 0 300 200" className="lb-diagram" role="img" aria-hidden direction="ltr">
      {wire("x1", "h1", w.w11, "in")}{wire("x2", "h1", w.w12, "in")}{wire("x1", "h2", w.w21, "in")}{wire("x2", "h2", w.w22, "in")}
      {wire("h1", "y", w.v1, "out")}{wire("h2", "y", w.v2, "out")}
      {node("x1", "x₁", X[0])}{node("x2", "x₂", X[1])}
      {node("h1", "h₁", stage >= 1 ? f.h1 : undefined, "lb-node is-main")}{node("h2", "h₂", stage >= 1 ? f.h2 : undefined, "lb-node is-main")}
      {node("y", "y", stage >= 2 ? f.y : undefined, "lb-node is-out")}
    </svg>
  );
}
