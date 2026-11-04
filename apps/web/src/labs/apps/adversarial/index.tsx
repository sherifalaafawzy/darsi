import { useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { argmax } from "../../kit/math";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { accuracy, attack, attackSuccessRate, fit, makeNet, probs, robustFit, SHAPES, trainingSet, type Shape } from "./model";

const S = {
  en: {
    intro: "This little model sorts drawings into circle, cross or line. Train it, then nudge a few pixels in exactly the way that raises its error. The picture looks the same to you; the model changes its answer.",
    train: "Train the model", tough: "Train it tough", toughening: "Training on tricky examples…", next: "Another drawing",
    original: "The drawing", attacked: "After the nudge", thinks: "It thinks", changed: (n: string) => `${n} pixels changed`,
    strength: "Nudge strength", pixels: "Pixels allowed", testAcc: "Accuracy on clean drawings", fooled: "Attacks that fool it",
    flipped: (a: string, b: string) => `It saw ${a}, now it says ${b}. Same picture to you.`, held: "The nudge wasn't enough to change its answer.",
    shape: { circle: "a circle", cross: "a cross", line: "a line" } as Record<Shape, string>,
    needTrain: "Train the model first.", toughNote: "Trained on its own tricky examples, the model now needs more pixels to fool.",
    try1: "Train the model, then raise “Pixels allowed” until the right picture flips to the wrong shape. Often six or seven pixels are enough.",
    try2: "Look at the two pictures: to your eye they are the same drawing. The model is reading tiny values you can barely see.",
    try3: "Press “Train it tough”, then attack again at the same budget: fewer attacks get through. “Attacks that fool it” drops.",
    takeaway: "A model can be sure and wrong at the same time. An attacker who can read it finds the exact pixels to push, and the change is invisible to us. Training on these tricky examples helps, but a small model stays foolable — never trust a single confident guess where it matters.",
  },
  ar: {
    intro: "يصنّف هذا النموذج الصغير الرسومات إلى دائرة أو علامة × أو خط. درّبه، ثم ادفع بضعة بكسلات بالطريقة التي ترفع خطأه تمامًا. تبدو الصورة لك كما هي؛ ويغيّر النموذج جوابه.",
    train: "درّب النموذج", tough: "درّبه بقسوة", toughening: "يتدرّب على أمثلة صعبة…", next: "رسمة أخرى",
    original: "الرسمة", attacked: "بعد الدفع", thinks: "يظنّها", changed: (n: string) => `تغيّر ${n} بكسلًا`,
    strength: "قوة الدفع", pixels: "البكسلات المسموحة", testAcc: "الدقة على رسومات سليمة", fooled: "الهجمات التي تخدعه",
    flipped: (a: string, b: string) => `رأى ${a}، والآن يقول ${b}. الصورة نفسها في عينيك.`, held: "لم يكفِ الدفع لتغيير جوابه.",
    shape: { circle: "دائرة", cross: "علامة ×", line: "خطًا" } as Record<Shape, string>,
    needTrain: "درّب النموذج أولًا.", toughNote: "بعد تدريبه على أمثلته الصعبة، صار يحتاج بكسلات أكثر ليُخدع.",
    try1: "درّب النموذج، ثم ارفع «البكسلات المسموحة» حتى تنقلب الصورة الصحيحة إلى الشكل الخطأ. غالبًا ستة أو سبعة بكسلات تكفي.",
    try2: "انظر إلى الصورتين: هما في عينيك الرسمة نفسها. النموذج يقرأ قيمًا دقيقة لا تكاد تراها.",
    try3: "اضغط «درّبه بقسوة»، ثم هاجم من جديد بالميزانية نفسها: يمرّ عدد أقل من الهجمات. و«الهجمات التي تخدعه» تهبط.",
    takeaway: "قد يكون النموذج واثقًا ومخطئًا في آن. المهاجم الذي يقرأه يجد البكسلات التي يدفعها بالضبط، والتغيير غير مرئي لنا. التدريب على هذه الأمثلة الصعبة يساعد، لكن النموذج الصغير يبقى قابلًا للخداع — لا تثق بتخمين واثق واحد حيث يهمّ الأمر.",
  },
};

export default function Adversarial({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num, lang } = useI18n();
  const test = useMemo(() => trainingSet(6, 777), []);
  const net = useRef(makeNet());
  const [trained, setTrained] = useState(false);
  const [tough, setTough] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const [eps, setEps] = useState(0.7);
  const [pixels, setPixels] = useState(6);
  const [, redraw] = useState(0);

  const sample = test[pick % test.length];
  const result = useMemo(() => (trained ? attack(net.current, sample.img, sample.label, eps, pixels) : null), [trained, sample, eps, pixels]); // eslint-disable-line react-hooks/exhaustive-deps
  const pOrig = trained ? probs(net.current, sample.img) : null;
  const pAdv = trained && result ? probs(net.current, result.img) : null;
  const sawLabel = pOrig ? argmax(pOrig) : -1;
  const nowLabel = pAdv ? argmax(pAdv) : -1;

  const doTrain = () => { net.current = makeNet(); fit(net.current, trainingSet(6, 1), 300); setTrained(true); setTough(false); redraw((x) => x + 1); onDone?.(); };
  const doTough = () => {
    setBusy(true);
    setTimeout(() => { net.current = makeNet(); robustFit(net.current, trainingSet(6, 1)); setTough(true); setBusy(false); redraw((x) => x + 1); }, 30);
  };

  const rate = trained ? attackSuccessRate(net.current, test, eps, pixels) : 0;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setTrained(false); setTough(false); setPick(0); setEps(0.7); setPixels(6); }}>
      <div className="stack">
        <div className="lb-runbar">
          <Button size="sm" icon="play" onClick={doTrain}>{s.train}</Button>
          {trained && <Button size="sm" variant="secondary" icon="target" loading={busy} onClick={doTough}>{s.tough}</Button>}
          {trained && <Button size="sm" variant="ghost" icon="sync" onClick={() => { setPick((p) => p + 1); }}>{s.next}</Button>}
        </div>
        {!trained ? <p className="lb-note">{s.needTrain}</p> : (
          <>
            <div className="lb-two">
              <div className="stack-sm">
                <span className="dr-field-label">{s.original}</span>
                <PixelGrid n={10} value={sample.img} label={s.original} readOnly />
                <p className="lb-note">{s.thinks}: <strong>{s.shape[SHAPES[sawLabel]]}</strong> ({num(pOrig![sawLabel], { style: "percent" })})</p>
              </div>
              <div className="stack-sm">
                <span className="dr-field-label">{s.attacked}</span>
                <PixelGrid n={10} value={result!.img} label={s.attacked} readOnly />
                <p className="lb-note">{s.thinks}: <strong>{s.shape[SHAPES[nowLabel]]}</strong> ({num(pAdv![nowLabel], { style: "percent" })}){lang === "ar" ? "، " : " · "}{s.changed(num(result!.changed.length))}</p>
              </div>
            </div>
            <p className={`lb-verdict ${nowLabel !== sample.label ? "is-warn" : ""}`} aria-live="polite">{nowLabel !== sample.label ? s.flipped(s.shape[SHAPES[sample.label]], s.shape[SHAPES[nowLabel]]) : s.held}</p>
            <Slider label={s.pixels} value={pixels} min={1} max={20} onChange={setPixels} format={(v) => num(v)} />
            <Slider label={s.strength} value={eps} min={0.3} max={1} step={0.1} onChange={setEps} format={(v) => num(v, { maximumFractionDigits: 1 })} />
            <Stats items={[{ label: s.testAcc, value: num(accuracy(net.current, test), { style: "percent" }) }, { label: s.fooled, value: num(rate, { style: "percent" }) }]} />
            {tough && <p className="lb-answer is-ok">{s.toughNote}</p>}
          </>
        )}
      </div>
    </LabShell>
  );
}
