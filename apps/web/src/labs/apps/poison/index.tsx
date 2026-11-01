import { useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Slider, Stats } from "../../kit/controls";
import { Plot, type Dot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useKit } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { accuracy, batchOf, makeData, makeNet, poison, predict, RATE, suspects } from "./model";

const N = 40, TEST = 60, MAX = 300, HEAT = 24;
const S = {
  en: {
    intro: "A model learns to tell two kinds of fruit apart from their size and sweetness. An attacker can't touch the model — but they can slip wrong examples into its training data. Flip some labels, train, and watch the line it learns go wrong.",
    poisoned: "Poisoned labels", train: "Train", acc: "Accuracy on clean fruit", flipped: "Flipped", found: "Suspects found",
    find: "Find the odd ones out", remove: "Drop suspects and retrain", clean: "Start over, clean",
    classA: "Kind A", classB: "Kind B", xlab: "size", ylab: "sweetness",
    note: "Ringed points have flipped labels. Squares are the ones the neighbour check suspects.",
    howFound: (n: string, k: string, f: string) => `The neighbour check flagged ${n} points: ${k} really poisoned, ${f} ordinary points near the border.`,
    retrained: (a: string) => `Trained again without the suspects. Accuracy back to ${a}.`,
    needTrain: "Press Train to fit the line.",
    try1: "Set poisoned labels to 0 and train: the line splits the two kinds cleanly, accuracy near 100%.",
    try2: "Raise poisoned labels to 8 and train again: flipped points drag the line across, and accuracy drops.",
    try3: "Press “Find the odd ones out”: the neighbour check marks points whose neighbours disagree. Drop them and retrain — most of the damage is undone.",
    takeaway: "You don't need to touch a model to break it — spoiling its training data is enough. Clean data matters as much as clean code. Points that sit among the wrong crowd are a clue, but the check also flags honest borderline points, so cleaning data always costs some good examples too.",
  },
  ar: {
    intro: "يتعلّم نموذج أن يميّز نوعين من الفاكهة من حجمهما وحلاوتهما. لا يستطيع المهاجم لمس النموذج، لكنه يستطيع دسّ أمثلة خاطئة في بيانات تدريبه. اقلب بعض التسميات، ودرّب، وراقب الخط الذي يتعلّمه وهو يخطئ.",
    poisoned: "تسميات مسمّمة", train: "درّب", acc: "الدقة على فاكهة سليمة", flipped: "مقلوبة", found: "مشتبه بها",
    find: "اعثر على الأمثلة الشاذّة", remove: "احذف المشتبه بها ودرّب", clean: "ابدأ نظيفًا من جديد",
    classA: "النوع أ", classB: "النوع ب", xlab: "الحجم", ylab: "الحلاوة",
    note: "النقاط المطوّقة تسمياتها مقلوبة. والمربّعات هي ما يشتبه به فحص الجيران.",
    howFound: (n: string, k: string, f: string) => `أشار فحص الجيران إلى ${n} نقطة: ${k} مسمّمة فعلًا، و${f} نقاط عادية قرب الحدّ.`,
    retrained: (a: string) => `دُرّب من جديد دون المشتبه بها. عادت الدقة إلى ${a}.`,
    needTrain: "اضغط «درّب» لملاءمة الخط.",
    try1: "اضبط التسميات المسمّمة على ٠ ودرّب: يفصل الخط النوعين بنظافة، والدقة قرب ١٠٠٪.",
    try2: "ارفع التسميات المسمّمة إلى ٨ ودرّب من جديد: تجرّ النقاط المقلوبة الخط، فتهبط الدقة.",
    try3: "اضغط «اعثر على الأمثلة الشاذّة»: يعلّم فحص الجيران النقاط التي يخالفها جيرانها. احذفها ودرّب من جديد — يزول معظم الضرر.",
    takeaway: "لا تحتاج إلى لمس النموذج لتكسره — يكفي إفساد بيانات تدريبه. فنظافة البيانات تهمّ بقدر نظافة الكود. والنقاط الجالسة وسط الجمهور الخطأ دليل، لكن الفحص يعلّم أيضًا نقاطًا حدّية صادقة، فتنظيف البيانات يكلّف دائمًا بعض الأمثلة الجيدة.",
  },
};

export default function Poison({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const [seed, setSeed] = useState(1);
  const [nPoison, setNPoison] = useState(8);
  const test = useMemo(() => makeData(TEST, 99), []);
  const base = useMemo(() => makeData(N, seed), [seed]);
  const { data, flipped } = useMemo(() => poison(base, nPoison, seed * 31 + 3), [base, nPoison, seed]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [sus, setSus] = useState<number[] | null>(null);
  const net = useRef(makeNet());
  const [round, setRound] = useState(0);
  const [acc, setAcc] = useState<number | null>(null);
  const [, redraw] = useState(0);

  const trainPts = useMemo(() => data.filter((_, i) => !removed.has(i)), [data, removed]);
  const loop = useLoop(() => {
    const b = batchOf(trainPts);
    net.current.train(b.X, b.T, RATE);
    const n = round + 1; setRound(n); setAcc(accuracy(net.current, test)); redraw((x) => x + 1);
    if (n >= MAX) return false;
  }, { maxPerFrame: 3 });

  const reset = (newSeed = seed) => { loop.stop(); setSeed(newSeed); net.current = makeNet(); setRound(0); setAcc(null); setSus(null); setRemoved(new Set()); };

  const heat = useMemo(() => {
    const vals = new Float32Array(HEAT * HEAT);
    for (let r = 0; r < HEAT; r++) for (let c = 0; c < HEAT; c++) vals[r * HEAT + c] = predict(net.current, { x: c / (HEAT - 1), y: (HEAT - 1 - r) / (HEAT - 1), label: 0 });
    return { n: HEAT, values: vals };
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const dots: Dot[] = data.map((p, i) => ({ x: p.x, y: p.y, tone: p.label ? "b" : "a", ring: flipped.has(i), shape: sus?.includes(i) ? "square" : "circle", r: removed.has(i) ? 3 : 6 }));

  const find = () => { const found = suspects(data, 5); setSus(found); redraw((x) => x + 1); onDone?.(); };
  const dropRetrain = () => { if (!sus) return; loop.stop(); setRemoved(new Set(sus)); net.current = makeNet(); setRound(0); setAcc(null); setTimeout(() => loop.start(), 0); };

  const foundReal = sus ? sus.filter((i) => flipped.has(i)).length : 0;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => reset(seed + 1)}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 1]} y={[0, 1]} heat={heat} dots={dots} label={`${s.classA} / ${s.classB}`} xLabel={s.xlab} yLabel={s.ylab} height={240} ticks={0} />
          <p className="lb-note">{s.note}</p>
        </div>
        <div className="stack">
          <Slider label={s.poisoned} value={nPoison} min={0} max={14} onChange={(v) => { loop.stop(); setNPoison(v); setRemoved(new Set()); setSus(null); setRound(0); setAcc(null); }} format={(v) => num(v)} />
          <RunBar running={loop.running} runLabel={s.train} onToggle={() => { if (!loop.running && round >= MAX) { net.current = makeNet(); setRound(0); } loop.toggle(); }} />
          <Stats items={[{ label: k.epoch, value: num(round) }, { label: s.acc, value: acc === null ? "—" : num(acc, { style: "percent" }) }, { label: s.flipped, value: num(flipped.size) }]} />
          {acc === null && !loop.running && <p className="lb-note">{s.needTrain}</p>}
          <div className="lb-row">
            <Button size="sm" variant="secondary" onClick={find} disabled={loop.running}>{s.find}</Button>
            {sus && <Button size="sm" onClick={dropRetrain} disabled={loop.running}>{s.remove}</Button>}
          </div>
          {sus && <p className="lb-note" aria-live="polite">{s.howFound(num(sus.length), num(foundReal), num(sus.length - foundReal))}</p>}
          {sus && removed.size > 0 && acc !== null && !loop.running && <p className="lb-answer is-ok">{s.retrained(num(acc, { style: "percent" }))}</p>}
        </div>
      </div>
    </LabShell>
  );
}
