import { useEffect, useMemo, useState } from "react";
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
    left: "Difference from the clean plus", arrow: " → ",
    better: "One step moved it closer to the plus. It is not the plus yet.",
    same: "There is almost no noise, so the step barely changes anything.",
    worse: "This much noise, and only one step, does not restore the plus. A real model learns many small steps. This one only pulls each pixel toward black or white.",
    try1: "Set noise near the middle and compare the two pictures.",
    try2: "Raise the noise to 1, at the far right: one step cannot recover the plus.",
    try3: "Lower the noise to near 0, at the far left: the step has little to do.",
    takeaway: "A diffusion model repeats a small denoise. One step shows the idea. It does not show a trained generator, and it does not prove a picture is real.",
  },
  ar: {
    intro: "يضيف الانتشار الضوضاء حتى تختفي الصورة، ثم يتعلّم أن يزيل قليلًا من الضوضاء في كل مرة. هنا تضيف ضوضاء إلى علامة زائد وتأخذ خطوة واحدة. والخطوة تسحب كل بكسل نحو الأسود أو الأبيض، أيهما أقرب. وهذا ليس نموذجًا بألف خطوة.",
    noise: "مقدار الضوضاء", before: "مع الضوضاء", after: "بعد خطوة واحدة",
    left: "الفرق عن علامة الزائد النظيفة", arrow: " ← ",
    better: "قرّبتها الخطوة من علامة الزائد. لكنها ليست العلامة بعد.",
    same: "لا ضوضاء تقريبًا، فالخطوة لا تغيّر شيئًا يُذكر.",
    worse: "هذا القدر من الضوضاء، مع خطوة واحدة، لا يعيد علامة الزائد. النموذج الحقيقي يتعلّم خطوات صغيرة كثيرة. وهذه الخطوة تسحب كل بكسل نحو الأسود أو الأبيض فقط.",
    try1: "اجعل الضوضاء قرب الوسط وقارن الصورتين.",
    try2: "ارفع الضوضاء إلى ١، في أقصى اليمين: خطوة واحدة لا تستعيد علامة الزائد.",
    try3: "اخفض الضوضاء إلى قرب ٠، في أقصى اليسار: ليس لدى الخطوة ما تفعله.",
    takeaway: "يكرّر نموذج الانتشار إزالة ضوضاء صغيرة. والخطوة الواحدة تُظهر الفكرة. وهي لا تُظهر مولّدًا مدرَّبًا، ولا تثبت أن صورة ما حقيقية.",
  },
};

export default function Denoise({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const noise = useMemo(() => noisePattern(), []);
  const [t, setT] = useState(0.55);
  const noisy = addNoise(CLEAN, t, noise);
  const once = denoiseStep(noisy);
  const before = mse(CLEAN, noisy), after = mse(CLEAN, once);
  const n = (v: number) => num(Math.round(v * 100) / 100);
  const kind = t < 0.15 ? "same" : after < before - 0.002 ? "better" : "worse";
  const word = s[kind];
  // It starts where one step helps; finding where one step no longer can is the lab.
  useEffect(() => { if (kind === "worse") onDone?.(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      {/* Left to right in both languages: "more noise to the right" (the lesson ai-d2-4 and its voiced video) holds in Arabic too. */}
      <Slider dir="ltr" label={s.noise} value={t} min={0} max={1} step={0.05} onChange={setT} format={n} />
      <div className="lb-two">
        <div className="stack"><p>{s.before}</p><PixelGrid n={8} value={noisy} readOnly label={s.before} /></div>
        <div className="stack"><p>{s.after}</p><PixelGrid n={8} value={once} readOnly label={s.after} /></div>
      </div>
      <p>{s.left} <bdi dir="ltr">{n(before)}</bdi>{s.arrow}<bdi dir="ltr">{n(after)}</bdi>. {word}</p>
    </LabShell>
  );
}
