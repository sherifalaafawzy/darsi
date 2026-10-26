import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useKit, useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { boundary, learn, mistakes, predict, preset, type Neuron, type Preset, type Pt } from "./model";

const S = {
  en: {
    intro: "One neuron draws one straight line: one side says circle, the other says square. It looks at the points one by one. Each time it gets one wrong, it moves the line a little towards the right answer.",
    data: "Points", easy: "Far apart", close: "Close together", xor: "Corners (XOR)", add: "Tap the picture to add a", circle: "circle", square: "square",
    passes: "Passes", wrong: "Wrong now", rule: "Its line", map: "The neuron's line and the points; the current point has a ring",
    done: (n: string) => `Learned! Every point is on the right side after ${n} passes.`,
    stuck: "It keeps moving and never gets them all. No single straight line can separate these corners: you need more neurons working together (try the Network playground).",
    takeaway: "Learning from mistakes is how neurons are trained: look at an example, check the answer, nudge the weights. But one neuron can only learn straight-line rules.",
  },
  ar: {
    intro: "الخلية العصبية الواحدة ترسم خطًا مستقيمًا واحدًا: جانب يقول دائرة، والآخر يقول مربع. إنها تنظر إلى النقاط واحدة تلو الأخرى، وكلما أخطأت في نقطة حرّكت الخط قليلًا نحو الإجابة الصحيحة.",
    data: "النقاط", easy: "متباعدة", close: "متقاربة", xor: "الزوايا (XOR)", add: "اضغط على الصورة لإضافة", circle: "دائرة", square: "مربع",
    passes: "الجولات", wrong: "الأخطاء الآن", rule: "خطّها", map: "خط الخلية العصبية والنقاط، والنقطة الحالية محاطة بحلقة",
    done: (n: string) => `تعلّمت! كل النقاط في الجانب الصحيح بعد ${n} جولات.`,
    stuck: "تظل تتحرك ولا تصيب الجميع أبدًا. لا يستطيع أي خط مستقيم واحد أن يفصل هذه الزوايا: تحتاج إلى خلايا أكثر تعمل معًا (جرّب ملعب الشبكات العصبية).",
    takeaway: "التعلّم من الأخطاء هو طريقة تدريب الخلايا العصبية: انظر إلى مثال، وتحقّق من الإجابة، وعدّل الأوزان قليلًا. لكن الخلية الواحدة لا تتعلّم إلا قواعد الخط المستقيم.",
  },
};
const START: Neuron = { w1: 0.3, w2: -0.8, b: 0.1 };
const MAX_PASSES = 30;

export default function Perceptron({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const [kind, setKind] = useState<Preset>("easy");
  const [pts, setPts] = useState<Pt[]>(() => preset("easy"));
  const [addAs, setAddAs] = useState<0 | 1>(0);
  const [n, setN] = useState<Neuron>(START);
  const at = useRef(0), passes = useRef(0), changedThisPass = useRef(false), tick = useRef(0);
  const [status, setStatus] = useState<"" | "done" | "stuck">("");
  const restart = () => { setN(START); at.current = 0; passes.current = 0; changedThisPass.current = false; setStatus(""); };
  useEffect(() => { setPts(preset(kind)); restart(); loop.stop(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = () => {
    if (!pts.length) return false;
    const r = learn(n, pts[at.current], 0.2);
    setN(r.n);
    changedThisPass.current ||= r.changed;
    at.current++;
    if (at.current >= pts.length) {
      at.current = 0; passes.current++;
      if (!changedThisPass.current) { setStatus("done"); if (kind !== "xor") onDone?.(); return false; }
      if (passes.current >= MAX_PASSES) { setStatus("stuck"); return false; }
      changedThisPass.current = false;
    }
  };
  // About 15 looks a second: slow enough to follow the line moving.
  const loop = useLoop(() => { if (++tick.current % 4) return; return look(); }, { maxPerFrame: 1 });
  const line = boundary(n);
  const heat = { n: 16, values: Float32Array.from({ length: 256 }, (_, i) => predict(n, { x: -1 + ((i % 16) + 0.5) / 8, y: 1 - (Math.floor(i / 16) + 0.5) / 8 })) };
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const current = pts[at.current];

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.data} value={kind} options={[["easy", s.easy], ["close", s.close], ["xor", s.xor]]} onChange={setKind} />
      <div className="lb-two">
        <div className="stack">
          <Plot x={[-1, 1]} y={[-1, 1]} height={320} ticks={2} label={s.map} heat={heat}
            lines={line.length === 2 ? [{ points: line, tone: "ink", width: 3 }] : []}
            dots={[...pts.map((p) => ({ x: p.x, y: p.y, tone: p.label ? "b" as const : "a" as const, shape: p.label ? "square" as const : "circle" as const, r: 5 })),
              ...(current && loop.running ? [{ x: current.x, y: current.y, tone: "ink" as const, ring: true, r: 10 }] : [])]}
            onPick={(x, y) => { setPts([...pts, { x, y, label: addAs }]); setStatus(""); }} />
          <Segmented label={s.add} value={addAs} options={[[0, s.circle], [1, s.square]]} onChange={setAddAs} />
        </div>
        <div className="stack">
          <RunBar running={loop.running} onToggle={() => { if (status) restart(); loop.toggle(); }} runLabel={k.train} onStep={() => { if (status) restart(); look(); }} onReset={() => { loop.stop(); restart(); }} />
          <Stats items={[{ label: s.passes, value: num(passes.current) }, { label: s.wrong, value: `${num(mistakes(n, pts))} / ${num(pts.length)}` }]} />
          <div className="stack-sm">
            <span className="dr-field-label">{s.rule}</span>
            <p className="lb-mono" dir="ltr">{[n2(n.w1), " × x + ", n2(n.w2), " × y + ", n2(n.b), " = 0"].map((p, i) => <bdi key={i}>{p}</bdi>)}</p>
          </div>
          {status && <p className={status === "done" ? "notice ok" : "notice"} role="status">{status === "done" ? s.done(num(passes.current)) : s.stuck}</p>}
        </div>
      </div>
    </LabShell>
  );
}
