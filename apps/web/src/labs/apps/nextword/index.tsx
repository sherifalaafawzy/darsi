import { NextWordLab } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { TryThis } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";

const S = {
  en: {
    kicker: "Gen AI lab", title: "Guess the next word", temp: "Temperature", low: "Predictable", high: "Creative", pick: "Pick the next word",
    context: "In the morning the pupils open their",
    candidates: [{ word: "books", p: 0.55 }, { word: "notebooks", p: 0.25 }, { word: "windows", p: 0.12 }, { word: "phones", p: 0.08 }],
    try1: "Drag the temperature all the way down and press “Pick the next word” five times: it picks “books” almost every time.",
    try2: "Now drag it all the way up and pick a few more times: the bars even out, so “windows” and “phones” start to turn up.",
    takeaway: "A chatbot writes by choosing likely next words. Temperature changes how adventurous it is.",
  },
  ar: {
    kicker: "مختبر الذكاء التوليدي", title: "خمّن الكلمة التالية", temp: "درجة الحرارة", low: "متوقَّع", high: "مبدع", pick: "اختر الكلمة التالية",
    context: "في الصباح يفتح الطلاب",
    candidates: [{ word: "كتبهم", p: 0.5 }, { word: "دفاترهم", p: 0.3 }, { word: "النوافذ", p: 0.12 }, { word: "هواتفهم", p: 0.08 }],
    try1: "اسحب درجة الحرارة إلى أدناها واضغط «اختر الكلمة التالية» خمس مرات: تختار «كتبهم» في كل مرة تقريبًا.",
    try2: "ثم اسحبها إلى أعلاها واختر بضع مرات أخرى: تتقارب الأشرطة، فتبدأ «النوافذ» و«هواتفهم» بالظهور.",
    takeaway: "يكتب روبوت الدردشة باختيار الكلمات التالية المحتملة، ودرجة الحرارة تغيّر مدى جرأته.",
  },
};

/** Next-word probabilities and temperature. */
export default function NextWord(_: LabProps) {
  const { lang, num } = useI18n();
  const s = useS(S);
  return (
    <>
      <TryThis items={[s.try1, s.try2]} />
      <NextWordLab key={lang} num={num} kicker={s.kicker} title={s.title} tempLabel={s.temp} lowLabel={s.low} highLabel={s.high} generateLabel={s.pick}
        context={s.context} candidates={s.candidates} takeaway={s.takeaway} />
    </>
  );
}
