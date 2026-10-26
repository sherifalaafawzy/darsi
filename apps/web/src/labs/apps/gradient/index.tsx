import { useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useKit, useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { best, data, grad, loss, step, type Line } from "./model";

const S = {
  en: {
    intro: "Each dot is a pupil: hours studied and test score. We want the straight line that fits them best. Gradient descent starts with a flat line, measures the error, and moves the line a small step downhill, again and again.",
    rate: "Step size (learning rate)", small: "Tiny", good: "Good", big: "Too big",
    hours: "Hours studied", score: "Score", fit: "The points and the current line",
    valley: "The error valley: the ball is the current slope", slope: "Line slope", error: "Error",
    history: "Error after each step", steps: "Steps", gradient: "Downhill direction",
    converged: "Found the bottom of the valley: this is the best straight line.", diverged: "The steps are too big: the ball jumps across the valley and climbs higher each time. Try a smaller step.",
    slow: "Still crawling. A bigger step would get there faster.", line: "Score ≈",
    takeaway: "Training a neural network is this same walk downhill, done on millions of weights at once. The step size matters: too small is slow, too big never settles.",
  },
  ar: {
    intro: "كل نقطة طالب: عدد ساعات الدراسة ودرجة الاختبار. نريد الخط المستقيم الذي يطابقها أفضل مطابقة. يبدأ الانحدار التدريجي بخط مستوٍ، ويقيس الخطأ، ثم يحرّك الخط خطوة صغيرة نحو الأسفل، مرة بعد مرة.",
    rate: "حجم الخطوة (معدّل التعلّم)", small: "صغيرة جدًا", good: "مناسبة", big: "كبيرة جدًا",
    hours: "ساعات الدراسة", score: "الدرجة", fit: "النقاط والخط الحالي",
    valley: "وادي الخطأ: الكرة هي الميل الحالي", slope: "ميل الخط", error: "الخطأ",
    history: "الخطأ بعد كل خطوة", steps: "الخطوات", gradient: "اتجاه النزول",
    converged: "وصلنا إلى قاع الوادي: هذا أفضل خط مستقيم.", diverged: "الخطوات كبيرة جدًا: تقفز الكرة فوق الوادي وتصعد أعلى كل مرة. جرّب خطوة أصغر.",
    slow: "ما زالت تزحف. الخطوة الأكبر ستصل أسرع.", line: "الدرجة ≈",
    takeaway: "تدريب الشبكة العصبية هو هذا النزول نفسه، لكن على ملايين الأوزان معًا. وحجم الخطوة مهم: الصغيرة جدًا بطيئة، والكبيرة جدًا لا تستقر أبدًا.",
  },
};
const RATES = { small: 0.05, good: 0.6, big: 1.9 } as const;
const START: Line = { m: 0, c: 0 };
const MAX = 400;

export default function Gradient({ meta, onDone }: LabProps) {
  const s = useS(S), k = useKit();
  const { num } = useI18n();
  const pts = useMemo(() => data(), []);
  const target = useMemo(() => best(pts), [pts]);
  const [rate, setRate] = useState<keyof typeof RATES>("good");
  const [l, setL] = useState<Line>(START);
  const hist = useRef<number[]>([loss(START, pts)]);
  const [status, setStatus] = useState<"" | "converged" | "diverged" | "slow">("");
  const reset = () => { setL(START); hist.current = [loss(START, pts)]; setStatus(""); };
  const one = () => {
    const next = step(l, pts, RATES[rate]), e = loss(next, pts);
    setL(next); hist.current.push(e);
    if (!Number.isFinite(e) || e > 5) { setStatus("diverged"); return false; }
    const g = grad(next, pts);
    if (Math.abs(g.dm) + Math.abs(g.dc) < 2e-4) { setStatus("converged"); onDone?.(); return false; }
    if (hist.current.length > MAX) { setStatus("slow"); return false; }
  };
  const loop = useLoop(one, { maxPerFrame: rate === "small" ? 4 : 1 });
  const e = hist.current.at(-1) ?? 0;
  const g = grad(l, pts);
  const n2 = (v: number) => num(Math.round(v * 100) / 100);
  // The valley: error as the slope m varies, with c held where it is now.
  const valley = Array.from({ length: 61 }, (_, i) => { const m = -0.5 + i * 0.025; return [m, loss({ m, c: l.c }, pts)] as const; });
  const vMax = Math.max(...valley.map(([, v]) => v));
  const h = hist.current, stride = Math.max(1, Math.ceil(h.length / 120));

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Segmented label={s.rate} value={rate} options={[["small", s.small], ["good", s.good], ["big", s.big]]} onChange={(v) => { setRate(v); loop.stop(); reset(); }} />
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 1]} y={[0, 1]} height={240} label={s.fit} fmt={(v) => num(Math.round(v * 10))} xLabel={s.hours} yLabel={`${s.score} (×10)`}
            dots={pts.map((p) => ({ x: p.x, y: p.y, tone: "a", r: 5 }))}
            lines={[{ points: [[0, l.c], [1, l.m + l.c]], tone: "b", width: 3 }, { points: [[0, target.c], [1, target.m + target.c]], tone: "muted", dashed: true, width: 1.5 }]} />
          <p className="lb-mono" dir="ltr">{[s.line, " ", n2(l.m * 10), " × h + ", n2(l.c * 100)].map((p, i) => <bdi key={i}>{p}</bdi>)}</p>
          <RunBar running={loop.running} onToggle={() => { if (status) reset(); loop.toggle(); }} onStep={() => { if (status) reset(); one(); }} onReset={() => { loop.stop(); reset(); }} />
          <Stats items={[{ label: s.steps, value: num(h.length - 1) }, { label: s.error, value: Number.isFinite(e) ? n2(e * 100) : "∞" }, { label: s.gradient, value: g.dm > 0 ? "←" : "→" }]} />
          {status && <p className={status === "converged" ? "notice ok" : "notice"} role="status">{s[status]}</p>}
        </div>
        <div className="stack">
          <Plot x={[-0.5, 1]} y={[0, vMax]} height={180} label={s.valley} xLabel={s.slope} yLabel={s.error} fmt={n2}
            lines={[{ points: valley, tone: "a" }]} dots={[{ x: Math.max(-0.5, Math.min(1, l.m)), y: Math.min(vMax, loss(l, pts)), tone: "b", r: 8 }]} />
          {h.length > 1 && <Plot x={[0, Math.max(10, h.length - 1)]} y={[0, Math.min(1, Math.max(...h.slice(0, 3)))]} height={150} label={s.history} xLabel={k.epoch} yLabel={s.error} fmt={n2}
            lines={[{ points: h.filter((_, i) => i % stride === 0).map((v, i) => [i * stride, Math.min(1, v)] as const), tone: "b" }]} />}
        </div>
      </div>
    </LabShell>
  );
}
