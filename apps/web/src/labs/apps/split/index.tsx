import { useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { BATCH, fits, memory, WIDE, type Job, type Split } from "./model";

const S = {
  en: {
    intro: "One training step stores the weights and the activations, so memory grows with the width of the layer and with the batch. Two machines can split the examples (data parallel) or split the layer (model parallel).",
    job: "The job", wide: "A wide layer", batch: "A long batch",
    how: "How to split", data: "Split the examples", model: "Split the layer",
    used: "Memory on one machine", cap: "It can hold",
    yes: "It fits.", no: "It does not fit.",
    try1: "On a wide layer, split the examples: each machine still holds the whole layer, and it does not fit.",
    try2: "On the same layer, split the layer: each machine holds half, and it fits.",
    try3: "Switch to a long batch and a narrow layer: splitting the examples fits, because the weights were small.",
    takeaway: "Data parallel copies the whole model onto every machine. Model parallel is for a layer that does not fit in one machine. A phone is one machine: this is a diagram, not a cluster.",
  },
  ar: {
    intro: "تخزّن خطوة التدريب الأوزان والتنشيطات، فتكبر الذاكرة مع عرض الطبقة ومع حجم الدفعة. ويستطيع جهازان أن يقسّما الأمثلة (توازي البيانات) أو أن يقسّما الطبقة (توازي النموذج).",
    job: "المهمة", wide: "طبقة عريضة", batch: "دفعة طويلة",
    how: "كيف نقسم", data: "قسّم الأمثلة", model: "قسّم الطبقة",
    used: "الذاكرة على جهاز واحد", cap: "يسع",
    yes: "يتسع.", no: "لا يتسع.",
    try1: "على طبقة عريضة، قسّم الأمثلة: كل جهاز يحتفظ بالطبقة كلها، وهي لا تتسع.",
    try2: "على الطبقة نفسها، قسّم الطبقة: كل جهاز يحتفظ بنصفها، فتتسع.",
    try3: "انتقل إلى دفعة طويلة وطبقة ضيقة: تقسيم الأمثلة يتسع، لأن الأوزان كانت صغيرة.",
    takeaway: "توازي البيانات ينسخ النموذج كله إلى كل جهاز. وتوازي النموذج لطبقة لا تتسع في جهاز واحد. والهاتف جهاز واحد: هذا رسم، وليس عنقود حواسيب.",
  },
};

export default function SplitLab({ meta }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [job, setJob] = useState<Job>(WIDE);
  const [how, setHow] = useState<Split>("data");
  const used = memory(job, how);
  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <Segmented label={s.job} value={job.id} options={[["wide", s.wide], ["batch", s.batch]]} onChange={(id) => setJob(id === "wide" ? WIDE : BATCH)} />
      <Segmented label={s.how} value={how} options={[["data", s.data], ["model", s.model]]} onChange={setHow} />
      <p>{s.used} <bdi dir="ltr">{num(used)}</bdi>. {s.cap} <bdi dir="ltr">{num(job.capacity)}</bdi>. {fits(job, how) ? s.yes : s.no}</p>
    </LabShell>
  );
}
