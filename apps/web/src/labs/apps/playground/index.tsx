import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Slider, Stats } from "../../kit/controls";
import type { Act, Net } from "../../kit/nn";
import { Plot } from "../../kit/Plot";
import { rng } from "../../kit/rng";
import { useKit, useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { accuracy, epoch, field, makeData, makeNet, type Dataset } from "./model";

const S = {
  en: {
    intro: "Each dot is an example: a circle is one kind, a square the other. Press Train and the network adjusts its weights round after round. The background shows what it would answer at every spot.",
    data: "Data", blobs: "Two groups", circle: "Circle", xor: "Corners (XOR)", spiral: "Spiral", noise: "Noise",
    layers: "Hidden layers", neurons: "Neurons per layer", activation: "Activation", rate: "Learning rate",
    weights: (n: string) => `This network has ${n} weights to learn.`,
    hint: { blobs: "A straight line is enough here: even zero hidden layers works.", circle: "No straight line can do this. Add a hidden layer with a few neurons.", xor: "Each neuron draws one line; you need at least two lines. Try 1 layer with 3 or more neurons.", spiral: "The hardest: try 2–3 layers of 8 neurons. Be patient." } as Record<Dataset, string>,
    lossChart: "Error going down as the network learns", done: "It works! The network learned this shape.", stuck: "Stopped: try more neurons, another activation or a different learning rate.",
    takeaway: "One neuron can only draw one straight line. Layers of neurons combine and bend those lines, so a network can learn shapes a single neuron never could. Training is just many small weight changes that lower the error.",
    map: "What the network answers across the plane",
  },
  ar: {
    intro: "كل نقطة مثال: الدائرة نوع، والمربع نوع آخر. اضغط «درّب» وستعدّل الشبكة أوزانها جولة بعد جولة. وتُظهر الخلفية ما ستجيب به عند كل موضع.",
    data: "البيانات", blobs: "مجموعتان", circle: "دائرة", xor: "الزوايا (XOR)", spiral: "حلزون", noise: "التشويش",
    layers: "الطبقات المخفية", neurons: "الخلايا في كل طبقة", activation: "دالة التنشيط", rate: "معدّل التعلّم",
    weights: (n: string) => `في هذه الشبكة ${n} وزنًا عليها أن تتعلّمها.`,
    hint: { blobs: "يكفي خط مستقيم هنا: حتى صفر طبقات مخفية ينجح.", circle: "لا يستطيع أي خط مستقيم فعل هذا. أضف طبقة مخفية فيها بضع خلايا.", xor: "كل خلية ترسم خطًا واحدًا، وتحتاج إلى خطين على الأقل. جرّب طبقة واحدة بثلاث خلايا أو أكثر.", spiral: "الأصعب: جرّب ٢ أو ٣ طبقات بثماني خلايا. وتحلَّ بالصبر." } as Record<Dataset, string>,
    lossChart: "الخطأ ينخفض بينما تتعلّم الشبكة", done: "نجحت! تعلّمت الشبكة هذا الشكل.", stuck: "توقّف التدريب: جرّب خلايا أكثر، أو دالة تنشيط أخرى، أو معدّل تعلّم مختلفًا.",
    takeaway: "الخلية الواحدة لا ترسم إلا خطًا مستقيمًا واحدًا. أما طبقات الخلايا فتجمع هذه الخطوط وتثنيها، فتتعلّم الشبكة أشكالًا لا تستطيعها خلية واحدة. والتدريب ما هو إلا تغييرات صغيرة كثيرة في الأوزان تقلّل الخطأ.",
    map: "ما تجيب به الشبكة في كل أنحاء المستوى",
  },
};
const MAX_ROUNDS = 3000;

export default function Playground({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const [data, setData] = useState<Dataset>("circle");
  const [noise, setNoise] = useState(0);
  const [layers, setLayers] = useState(1);
  const [neurons, setNeurons] = useState(4);
  const [act, setAct] = useState<Act>("tanh");
  const [lr, setLr] = useState(0.3);
  const points = useMemo(() => makeData(data, 160, noise), [data, noise]);
  const net = useRef<Net>(makeNet({ layers, neurons, act }));
  const r = useRef(rng(11));
  const hist = useRef<number[]>([]);
  const [round, setRound] = useState(0);
  const [stopped, setStopped] = useState<"" | "done" | "stuck">("");
  const reset = () => { net.current = makeNet({ layers, neurons, act, seed: Math.floor(Math.random() * 1e6) }); hist.current = []; setRound(0); setStopped(""); };
  useEffect(() => { loop.stop(); reset(); }, [layers, neurons, act, data, noise]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = () => {
    const loss = epoch(net.current, points, lr, r.current);
    hist.current.push(loss);
    const n = hist.current.length;
    if (loss < 0.02) { setStopped("done"); setRound(n); return false; }
    if (n >= MAX_ROUNDS) { setStopped(accuracy(net.current, points) >= 0.95 ? "done" : "stuck"); setRound(n); return false; }
    setRound(n);
  };
  const loop = useLoop(step, { budgetMs: 6, maxPerFrame: 4 });
  const acc = accuracy(net.current, points);
  useEffect(() => { if (acc >= 0.95 && data !== "blobs") onDone?.(); }, [acc >= 0.95]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = { n: 24, values: field(net.current, 24) };
  const loss = hist.current.at(-1);
  const h = hist.current, stride = Math.max(1, Math.ceil(h.length / 150));
  const lossLine = h.filter((_, i) => i % stride === 0 || i === h.length - 1).map((v, i) => [Math.min(h.length, i * stride), v] as const);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.data} value={data} options={(["blobs", "circle", "xor", "spiral"] as const).map((d) => [d, s[d]] as const)} onChange={setData} />
      <p className="lb-note">{s.hint[data]}</p>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[-1, 1]} y={[-1, 1]} label={s.map} heat={heat} height={320} ticks={2}
            dots={points.map((p) => ({ x: p.x, y: p.y, tone: p.label ? "b" : "a", shape: p.label ? "square" : "circle", r: 4.5 }))} />
          <RunBar running={loop.running} onToggle={() => { if (stopped) reset(); loop.toggle(); }} runLabel={k.train} onStep={() => { step(); loop.redraw(); }} onReset={() => { loop.stop(); reset(); }} />
          <Stats items={[{ label: k.epoch, value: num(round) }, { label: k.loss, value: loss === undefined ? "—" : num(Math.round(loss * 1000) / 1000) }, { label: k.accuracy, value: num(acc, { style: "percent" }) }]} />
          {stopped && <p className={stopped === "done" ? "notice ok" : "notice"} role="status">{stopped === "done" ? s.done : s.stuck}</p>}
        </div>
        <div className="stack">
          <Segmented label={s.layers} value={layers} options={[0, 1, 2, 3].map((n) => [n, num(n)] as const)} onChange={setLayers} />
          <Slider label={s.neurons} value={neurons} min={1} max={8} disabled={layers === 0} format={(v) => num(v)} onChange={setNeurons} />
          <Segmented label={s.activation} value={act} options={[["tanh", "tanh"], ["relu", "ReLU"], ["sigmoid", "sigmoid"]]} onChange={setAct} />
          <Segmented label={s.rate} value={lr} options={[0.03, 0.1, 0.3, 1].map((v) => [v, num(v)] as const)} onChange={setLr} />
          <Slider label={s.noise} value={noise} min={0} max={1} step={0.25} format={(v) => num(v, { style: "percent" })} onChange={setNoise} />
          <NetDiagram net={net.current} />
          <p className="lb-note">{s.weights(num(net.current.weightCount))}</p>
          {h.length > 1 && <Plot x={[0, Math.max(10, h.length)]} y={[0, Math.max(0.8, ...h.slice(0, 5))]} height={150} label={s.lossChart} lines={[{ points: lossLine, tone: "b" }]} xLabel={k.epoch} yLabel={k.loss} />}
        </div>
      </div>
    </LabShell>
  );
}

/** Layers of neurons; each line is a weight (thicker = bigger, dashed = negative). Kept left-to-right like the maths. */
function NetDiagram({ net }: { net: Net }) {
  const W = 300, H = 170, cols = net.sizes.length;
  const pos = (l: number, j: number) => ({ x: 20 + (l * (W - 40)) / (cols - 1), y: H / 2 + (j - (net.sizes[l] - 1) / 2) * Math.min(20, (H - 20) / net.sizes[l]) });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lb-diagram" role="img" aria-hidden direction="ltr">
      {net.W.map((w, l) => Array.from(w, (v, k) => {
        const n = net.sizes[l], j = Math.floor(k / n), i = k % n, a = pos(l, i), b = pos(l + 1, j);
        return <line key={`${l}-${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`lb-wire ${v < 0 ? "lb-tone-b" : "lb-tone-a"}`} strokeWidth={0.5 + Math.min(4, Math.abs(v) * 1.2)} strokeDasharray={v < 0 ? "4 3" : undefined} />;
      }))}
      {net.sizes.map((n, l) => Array.from({ length: n }, (_, j) => { const p = pos(l, j); return <circle key={`n${l}-${j}`} cx={p.x} cy={p.y} r={7} className={l === cols - 1 ? "lb-node is-out" : l === 0 ? "lb-node" : "lb-node is-main"} />; }))}
    </svg>
  );
}
