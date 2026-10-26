import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Stats } from "../../kit/controls";
import { argmax } from "../../kit/math";
import { PixelGrid } from "../../kit/PixelGrid";
import { blank } from "../../kit/raster";
import { useKit, useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { accuracy, batch, guess, isBlank, makeNet, N, RATE, SHAPES, starters, type Example, type Shape } from "./model";

const MAX_ROUNDS = 600;
const S = {
  en: {
    intro: "Nobody tells this network what a circle is. It only gets examples: drawings with the right answer. Add your own drawings, press Train, then draw something new and see what it thinks.",
    draw: "Your drawing", add: { circle: "Add as a circle", cross: "Add as a cross", line: "Add as a line" } as Record<Shape, string>,
    group: { circle: "Circles", cross: "Crosses (×)", line: "Lines" } as Record<Shape, string>,
    one: { circle: "a circle", cross: "a cross", line: "a line" } as Record<Shape, string>,
    examples: "Examples it learns from (tap one to remove it)", count: (group: string, n: string) => `${group}: ${n}`, remove: "Remove this example",
    sees: "What the network thinks", thinks: (shape: string, p: string) => `It thinks this is ${shape} (${p} sure).`,
    drawToTest: "Draw a shape on the grid to test it.", trainFirst: "Train it first, then draw a shape to test it.",
    weights: (n: string) => `This network has ${n} numbers to learn: one for every link from each of the 144 pixels to 16 hidden neurons, and from those to the 3 answers.`,
    fresh: "Not trained yet. Press Train.", changed: "You changed the examples. Train again so it learns them.", done: "Trained. Now draw a new shape and test it.",
    stuck: "It could not learn every example. Check for a drawing added under the wrong shape.", few: "Give it at least 2 examples of each shape.",
    takeaway: "The network learned from examples, not rules. More varied examples make it better; a drawing unlike any example confuses it. Real vision AI learns the same way, from millions of photos.",
  },
  ar: {
    intro: "لا أحد يخبر هذه الشبكة ما الدائرة. كل ما تحصل عليه أمثلة: رسومات ومعها الإجابة الصحيحة. أضف رسوماتك، واضغط «درّب»، ثم ارسم شيئًا جديدًا وانظر ماذا تظن.",
    draw: "رسمتك", add: { circle: "أضفها دائرةً", cross: "أضفها علامة ×", line: "أضفها خطًا" } as Record<Shape, string>,
    group: { circle: "الدوائر", cross: "علامات ×", line: "الخطوط" } as Record<Shape, string>,
    one: { circle: "دائرة", cross: "علامة ×", line: "خط" } as Record<Shape, string>,
    examples: "الأمثلة التي تتعلّم منها (المس مثالًا لحذفه)", count: (group: string, n: string) => `${group}: ${n}`, remove: "احذف هذا المثال",
    sees: "ماذا تظن الشبكة", thinks: (shape: string, p: string) => `تظن الشبكة أنها ${shape} (متأكدة بنسبة ${p}).`,
    drawToTest: "ارسم شكلًا على الشبكة لتختبرها.", trainFirst: "درّبها أولًا، ثم ارسم شكلًا لتختبرها.",
    weights: (n: string) => `في هذه الشبكة ${n} رقمًا عليها أن تتعلّمها: رقم لكل وصلة من كل بكسل من البكسلات الـ١٤٤ إلى ١٦ خلية مخفية، ومنها إلى الإجابات الثلاث.`,
    fresh: "لم تتدرّب بعد. اضغط «درّب».", changed: "غيّرت الأمثلة. درّبها من جديد لتتعلّمها.", done: "تدرّبت. ارسم الآن شكلًا جديدًا واختبرها.",
    stuck: "لم تستطع تعلّم كل الأمثلة. تحقّق من رسمة أُضيفت تحت الشكل الخطأ.", few: "أعطها مثالين على الأقل من كل شكل.",
    takeaway: "تعلّمت الشبكة من الأمثلة لا من القواعد. كلما تنوّعت الأمثلة تحسّنت، والرسمة التي لا تشبه أي مثال تربكها. والذكاء الاصطناعي البصري الحقيقي يتعلّم بالطريقة نفسها من ملايين الصور.",
  },
};

type Status = "fresh" | "changed" | "done" | "stuck";

export default function Shapes({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const [examples, setExamples] = useState<Example[]>(() => starters());
  const [drawing, setDrawing] = useState(() => blank(N));
  const net = useRef(makeNet());
  const data = useRef(batch(examples));
  const [round, setRound] = useState(0);
  const [loss, setLoss] = useState<number>();
  const [status, setStatus] = useState<Status>("fresh");
  const [trained, setTrained] = useState(false); // has finished training at least once, so its guesses mean something
  const enough = SHAPES.every((x) => examples.filter((e) => e.shape === x).length >= 2);

  const loop = useLoop(() => {
    const l = net.current.train(data.current.X, data.current.T, RATE);
    const n = round + 1;
    setRound(n); setLoss(l);
    if (l < 0.02 || n >= MAX_ROUNDS) { setStatus(l < 0.02 ? "done" : "stuck"); setTrained(true); return false; }
  }, { maxPerFrame: 1 });
  const change = (next: Example[]) => { loop.stop(); setExamples(next); data.current = batch(next); if (status !== "fresh") setStatus("changed"); setRound(0); };
  const reset = () => { loop.stop(); net.current = makeNet(Math.floor(Math.random() * 1e6)); const ex = starters(); setExamples(ex); data.current = batch(ex); setDrawing(blank(N)); setRound(0); setLoss(undefined); setStatus("fresh"); setTrained(false); };

  const probs = useMemo(() => (trained && !isBlank(drawing) ? guess(net.current, drawing) : null), [trained, drawing, round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (probs) onDone?.(); }, [probs !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const acc = trained || round ? accuracy(net.current, examples) : 0;
  const best = probs ? argmax(probs) : -1;

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway} onReset={reset}>
      <div className="lb-two">
        <div className="stack">
          <PixelGrid n={N} value={drawing} onChange={setDrawing} label={s.draw} />
          <div className="lb-row">
            {SHAPES.map((x) => <Button key={x} size="sm" variant="secondary" disabled={isBlank(drawing)} onClick={() => { change([...examples, { shape: x, img: drawing }]); setDrawing(blank(N)); }}>{s.add[x]}</Button>)}
            <Button size="sm" variant="ghost" icon="close" onClick={() => setDrawing(blank(N))}>{k.clear}</Button>
          </div>
          <div className="stack-sm" aria-live="polite">
            <span className="dr-field-label">{s.sees}</span>
            {!trained ? <p className="lb-note">{s.trainFirst}</p> : !probs ? <p className="lb-note">{s.drawToTest}</p> : (
              <>
                <p><strong>{s.thinks(s.one[SHAPES[best]], num(probs[best], { style: "percent" }))}</strong></p>
                <ul className="lb-bars">
                  {SHAPES.map((x, i) => (
                    <li key={x} className="lb-bar">
                      <span>{s.group[x]}</span>
                      <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round(probs[i] * 100)}%` }} /></span>
                      <span>{num(probs[i], { style: "percent" })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.examples}</span>
          {SHAPES.map((x) => {
            const mine = examples.map((e, i) => [e, i] as const).filter(([e]) => e.shape === x);
            return (
              <div key={x} className="stack-sm">
                <span className="lb-note">{s.count(s.group[x], num(mine.length))}</span>
                <div className="lb-thumbs">
                  {mine.map(([e, i]) => (
                    <button key={i} type="button" className="lb-thumb" aria-label={`${s.remove}: ${s.one[x]}`} onClick={() => change(examples.filter((_, j) => j !== i))}>
                      <PixelGrid n={N} value={e.img} label={s.one[x]} readOnly />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <RunBar running={loop.running} runLabel={k.train} onToggle={() => { if (!enough) return; if (!loop.running && status !== "fresh" && round >= MAX_ROUNDS) setRound(0); loop.toggle(); }} />
          {!enough && <p className="lb-note">{s.few}</p>}
          <Stats items={[{ label: k.epoch, value: num(round) }, { label: k.loss, value: loss === undefined ? "—" : num(Math.round(loss * 1000) / 1000) }, { label: k.accuracy, value: num(acc, { style: "percent" }) }]} />
          <p className="lb-note" aria-live="polite">{s[status]}</p>
          <p className="lb-note">{s.weights(num(net.current.weightCount))}</p>
        </div>
      </div>
    </LabShell>
  );
}
