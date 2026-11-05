import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider } from "../../kit/controls";
import { PixelGrid } from "../../kit/PixelGrid";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { addNoise, CLEAN, denoiseStep, mse, noisePattern } from "./model";

const S = {
  en: {
    intro: "Diffusion adds noise until a picture is gone, then learns to remove a little noise at a time. Here you add noise to a plus sign and take one step. The step pulls each pixel toward black or white, whichever it is closer to. It is not a thousand-step model.",
    noise: "How much noise", before: "With noise", after: "After one step",
    left: "Difference from the clean plus",
    better: "One step moved it closer to the plus. It is not the plus yet.",
    same: "There is almost no noise, so the step barely changes anything.",
    worse: "This much noise, and only one step, does not restore the plus. A real model learns many small steps. This one only pulls each pixel toward black or white.",
    try1: "Set noise near the middle and compare the two pictures.",
    try2: "Set noise to the right: one step cannot recover the plus.",
    try3: "Set noise to the left: the step has little to do.",
    takeaway: "A diffusion model repeats a small denoise. One step shows the idea. It does not show a trained generator, and it does not prove a picture is real.",
  },
  ar: {
    intro: "يضيف الانتشار الضجيج حتى تختفي الصورة، ثم يتعلّم أن يزيل قليلًا من الضجيج في كل مرة. هنا تضيف ضجيجًا إلى علامة زائد وتأخذ خطوة واحدة. والخطوة تسحب كل بكسل نحو الأسود أو الأبيض، أيهما أقرب. وهذا ليس نموذجًا بألف خطوة.",
    noise: "مقدار الضجيج", before: "مع الضجيج", after: "بعد خطوة واحدة",
    left: "الفرق عن علامة الزائد النظيفة",
    better: "قرّبتها الخطوة من علامة الزائد. لكنها ليست العلامة بعد.",
    same: "لا ضجيج تقريبًا، فالخطوة لا تغيّر شيئًا يُذكر.",
    worse: "هذا القدر من الضجيج، مع خطوة واحدة، لا يعيد علامة الزائد. النموذج الحقيقي يتعلّم خطوات صغيرة كثيرة. وهذه الخطوة تسحب كل بكسل نحو الأسود أو الأبيض فقط.",
    try1: "اجعل الضجيج قرب الوسط وقارن الصورتين.",
    try2: "اجعل الضجيج إلى اليمين: خطوة واحدة لا تستعيد علامة الزائد.",
    try3: "اجعل الضجيج إلى اليسار: ليس لدى الخطوة ما تفعله.",
    takeaway: "يكرّر نموذج الانتشار إزالة ضجيج صغيرة. والخطوة الواحدة تُظهر الفكرة. وهي لا تُظهر مولّدًا مدرَّبًا، ولا تثبت أن صورة ما حقيقية.",
  },
};

export default function Denoise({ meta }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const noise = useMemo(() => noisePattern(), []);
  const [t, setT] = useState(0.55);
  const noisy = addNoise(CLEAN, t, noise);
  const once = denoiseStep(noisy);
  const before = mse(CLEAN, noisy), after = mse(CLEAN, once);
  const n = (v: number) => num(Math.round(v * 100) / 100);
  const word = t < 0.15 ? s.same : after < before - 0.002 ? s.better : s.worse;
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Slider label={s.noise} value={t} min={0} max={1} step={0.05} onChange={setT} format={n} />
      <div className="lb-two">
        <div className="stack"><p>{s.before}</p><PixelGrid n={8} value={noisy} readOnly label={s.before} /></div>
        <div className="stack"><p>{s.after}</p><PixelGrid n={8} value={once} readOnly label={s.after} /></div>
      </div>
      <p>{s.left} <bdi dir="ltr">{n(before)}</bdi> → <bdi dir="ltr">{n(after)}</bdi>. {word}</p>
    </LabShell>
  );
}
