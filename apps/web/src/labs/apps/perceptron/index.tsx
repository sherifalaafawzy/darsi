import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { usePlural, type Forms } from "../../kit/plural";
import { useKit, useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { boundary, learn, MAX_PASSES, mistakes, predict, preset, RATE, START, type Neuron, type Preset, type Pt } from "./model";

const S = {
  en: {
    intro: "One neuron draws one straight line: one side says circle, the other says square. It looks at the points one by one. Each time it gets one wrong, it moves the line a little towards the right answer.",
    data: "Points", easy: "Far apart", close: "Close together", xor: "Corners (XOR)", add: "Tap the picture to add a", circle: "circle", square: "square",
    passes: "Passes", wrong: "Wrong now", rule: "Its line", map: "The neuron's line and the points; the current point has a ring",
    count: { one: "{n} pass", other: "{n} passes" } as Forms,
    done: (n: string) => `Learned! Every point is on the right side after ${n}.`,
    stuck: (n: string) => `After ${n} it still gets some wrong, and it would keep going for ever. When no single straight line can separate the points, as with the corners, one neuron never finishes: you need more neurons working together (try the Network playground).`,
    try1: "With “Far apart”, press Train: the line swings each time it gets a point wrong, then stops once every point is on its side.",
    try2: "Pick “Corners (XOR)” and press Train: the line keeps jumping and never gets them all. No single straight line can split the corners.",
    try3: "Back on “Far apart”, add two or three squares among the circles and train again: now no line fits, so one neuron can never finish.",
    takeaway: "Learning from mistakes is how neurons are trained: look at an example, check the answer, nudge the weights. But one neuron can only learn straight-line rules.",
  },
  ar: {
    intro: "الخلية العصبية الواحدة ترسم خطًا مستقيمًا واحدًا: جانب يقول دائرة، والآخر يقول مربع. إنها تنظر إلى النقاط واحدة تلو الأخرى، وكلما أخطأت في نقطة حرّكت الخط قليلًا نحو الإجابة الصحيحة.",
    data: "النقاط", easy: "متباعدة", close: "متقاربة", xor: "الزوايا (XOR)", add: "اضغط على الصورة لإضافة", circle: "دائرة", square: "مربع",
    passes: "الجولات", wrong: "الأخطاء الآن", rule: "خطّها", map: "خط الخلية العصبية والنقاط، والنقطة الحالية محاطة بحلقة",
    count: { one: "جولة واحدة", two: "جولتين", few: "{n} جولات", many: "{n} جولة", other: "{n} جولة" } as Forms,
    done: (n: string) => `تعلّمت! كل النقاط في الجانب الصحيح بعد ${n}.`,
    stuck: (n: string) => `بعد ${n} ما زالت تخطئ في بعض النقاط، وستظل تحاول إلى الأبد. حين لا يستطيع أي خط مستقيم واحد أن يفصل النقاط، كما في الزوايا، لا تنتهي الخلية الواحدة أبدًا: تحتاج إلى خلايا أكثر تعمل معًا (جرّب ملعب الشبكات العصبية).`,
    try1: "مع «متباعدة» اضغط «درّب»: يتأرجح الخط كلما أخطأت الخلية في نقطة، ثم يتوقف حين تصبح كل نقطة في جانبها الصحيح.",
    try2: "اختر «الزوايا (XOR)» واضغط «درّب»: يظل الخط يقفز ولا يصيب الجميع أبدًا. لا يستطيع خط مستقيم واحد أن يفصل الزوايا.",
    try3: "ارجع إلى «متباعدة»، وأضف مربعين أو ثلاثة بين الدوائر، ثم درّب من جديد: لم يعد أي خط يناسبها، فلن تنتهي الخلية الواحدة أبدًا.",
    takeaway: "التعلّم من الأخطاء هو طريقة تدريب الخلايا العصبية: انظر إلى مثال، وتحقّق من الإجابة، وعدّل الأوزان قليلًا. لكن الخلية الواحدة لا تتعلّم إلا قواعد الخط المستقيم.",
  },
};
/** One look every 50 ms (20 a second), on any screen: slow enough to follow the line moving. */
const LOOK_MS = 50;

export default function Perceptron({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const count = usePlural();
  const [kind, setKind] = useState<Preset>("easy");
  const [pts, setPts] = useState<Pt[]>(() => preset("easy"));
  const [addAs, setAddAs] = useState<0 | 1>(0);
  const [n, setN] = useState<Neuron>(START);
  // The neuron also lives in a ref, so a look always builds on the last one (even right after Start again).
  const nRef = useRef<Neuron>(START), at = useRef(0), passes = useRef(0), changedThisPass = useRef(false), lastAt = useRef(0);
  const [status, setStatus] = useState<"" | "done" | "stuck">("");
  const restart = () => { nRef.current = START; setN(START); at.current = 0; passes.current = 0; changedThisPass.current = false; setStatus(""); };
  useEffect(() => { setPts(preset(kind)); restart(); loop.stop(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = () => {
    if (!pts.length) return false;
    const r = learn(nRef.current, pts[at.current], RATE);
    nRef.current = r.n; setN(r.n);
    changedThisPass.current ||= r.changed;
    at.current++;
    if (at.current >= pts.length) {
      at.current = 0; passes.current++;
      if (!changedThisPass.current) { setStatus("done"); if (kind !== "xor") onDone?.(); return false; }
      if (passes.current >= MAX_PASSES) { setStatus("stuck"); return false; }
      changedThisPass.current = false;
    }
  };
  const loop = useLoop(() => { const now = performance.now(); if (now - lastAt.current < LOOK_MS) return true; lastAt.current = now; return look(); }, { maxPerFrame: 1 });
  const line = boundary(n);
  const heat = { n: 16, values: Float32Array.from({ length: 256 }, (_, i) => predict(n, { x: -1 + ((i % 16) + 0.5) / 8, y: 1 - (Math.floor(i / 16) + 0.5) / 8 })) };
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  const current = pts[at.current], started = at.current > 0 || passes.current > 0;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.data} value={kind} options={[["easy", s.easy], ["close", s.close], ["xor", s.xor]]} onChange={setKind} />
      <div className="lb-two">
        <div className="stack">
          <Plot x={[-1, 1]} y={[-1, 1]} height={320} ticks={2} label={s.map} heat={heat}
            lines={line.length === 2 ? [{ points: line, tone: "ink", width: 3 }] : []}
            dots={[...pts.map((p) => ({ x: p.x, y: p.y, tone: p.label ? "b" as const : "a" as const, shape: p.label ? "square" as const : "circle" as const, r: 5 })),
              ...(current && !status && (loop.running || started) ? [{ x: current.x, y: current.y, tone: "ink" as const, ring: true, r: 10 }] : [])]}
            onPick={(x, y) => { setPts([...pts, { x, y, label: addAs }]); setStatus(""); }} />
          <Segmented label={s.add} value={addAs} options={[[0, s.circle], [1, s.square]]} onChange={setAddAs} />
        </div>
        <div className="stack">
          <RunBar running={loop.running} onToggle={() => { if (status) restart(); loop.toggle(); }} runLabel={k.train} onStep={() => { if (status) restart(); look(); }} onReset={() => { loop.stop(); restart(); }} />
          <Stats items={[{ label: s.passes, value: num(passes.current) }, { label: s.wrong, value: `${num(mistakes(n, pts))} / ${num(pts.length)}` }]} />
          <div className="stack-sm">
            <span className="dr-field-label">{s.rule}</span>
            <p className="lb-mono" dir="ltr">{[n2(n.w1), " × x", n.w2 < 0 ? " − " : " + ", n2(Math.abs(n.w2)), " × y", n.b < 0 ? " − " : " + ", n2(Math.abs(n.b)), " = 0"].map((p, i) => <bdi key={i}>{p}</bdi>)}</p>
          </div>
          {status && <p className={status === "done" ? "notice ok" : "notice"} role="status">{status === "done" ? s.done(count(passes.current, s.count)) : s.stuck(count(passes.current, s.count))}</p>}
        </div>
      </div>
    </LabShell>
  );
}
