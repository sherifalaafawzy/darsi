import { useMemo, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { detect, edit, generate, isGreen, SLOTS, words } from "./model";

const S = {
  en: {
    intro: "Here is one way to tell machine writing apart: give the model a secret key that paints half of every word choice “green”, and have it quietly prefer green words. A detector with the key counts the green words. Lots of green means it was probably the machine.",
    wm: "Write with the watermark", plain: "Write naturally", newKey: "New secret key",
    sentence: "The text", greenK: "green word", edits: "Words you change",
    score: "Green words", signal: "Signal (z-score)", flagged: "Looks machine-written", notFlagged: "Not flagged",
    flagY: "The detector flags this as machine-written.", flagN: "The detector does not flag this.",
    editNote: "Editing swaps words for ones the key may call red, so the signal drops.",
    honest: "Half of all words are green by chance, so a human can trip the detector and a paraphrase can hide the machine. A watermark is a hint, never proof of cheating.",
    try1: "Press “Write with the watermark”: almost every word is green and the signal is high — the detector flags it.",
    try2: "Press “Write naturally” a few times: usually about half the words are green, but now and then a human sentence gets flagged by chance.",
    try3: "Take a watermarked text and raise “Words you change”: after two or three edits the green words thin out and the flag goes away. Paraphrasing beats the watermark.",
    takeaway: "A watermark lets whoever holds the key guess that text was machine-made, which can discourage cheating. But it is only a probability: innocent writing can look guilty, and a little editing erases it. Never punish a pupil on a detector's word alone.",
  },
  ar: {
    intro: "هذه طريقة لتمييز كتابة الآلة: أعطِ النموذج مفتاحًا سرّيًّا يلوّن نصف خيارات كل كلمة بـ«الأخضر»، واجعله يفضّل الكلمات الخضراء سرًّا. كاشفٌ يملك المفتاح يعدّ الكلمات الخضراء. كثرة الأخضر تعني أنها الآلة غالبًا.",
    wm: "اكتب بالعلامة المائية", plain: "اكتب طبيعيًّا", newKey: "مفتاح سرّي جديد",
    sentence: "النص", greenK: "كلمة خضراء", edits: "الكلمات التي تغيّرها",
    score: "الكلمات الخضراء", signal: "الإشارة (z)", flagged: "تبدو من كتابة الآلة", notFlagged: "غير معلَّمة",
    flagY: "يعلّم الكاشف هذا كأنه من كتابة الآلة.", flagN: "لا يعلّم الكاشف هذا.",
    editNote: "التعديل يبدّل الكلمات بأخرى قد يعدّها المفتاح حمراء، فتهبط الإشارة.",
    honest: "نصف الكلمات خضراء بالصدفة، فقد يُوقِع إنسانٌ الكاشفَ في الخطأ، وقد تُخفي إعادةُ الصياغة الآلةَ. العلامة المائية قرينة لا دليل على الغش.",
    try1: "اضغط «اكتب بالعلامة المائية»: كل الكلمات تقريبًا خضراء والإشارة عالية — يعلّمها الكاشف.",
    try2: "اضغط «اكتب طبيعيًّا» عدّة مرات: عادةً نحو نصف الكلمات أخضر، لكن أحيانًا تُعلَّم جملةُ إنسانٍ بالصدفة.",
    try3: "خذ نصًّا موسومًا وارفع «الكلمات التي تغيّرها»: بعد تعديلين أو ثلاثة تقلّ الكلمات الخضراء وتزول العلامة. إعادة الصياغة تهزم العلامة المائية.",
    takeaway: "تتيح العلامة المائية لمن يملك المفتاح أن يخمّن أن نصًّا من صنع الآلة، وهذا قد يردع الغش. لكنها احتمال فقط: قد تبدو كتابةٌ بريئة مذنبة، وتمحوها تعديلة صغيرة. لا تعاقب تلميذًا بناءً على قول كاشفٍ وحده.",
  },
};

export default function Watermark({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const tlang = lang === "ar" ? "ar" : "en";
  const [key, setKey] = useState(12345);
  const [base, setBase] = useState<number[] | null>(null);
  const [edits, setEdits] = useState(0);
  const [seed, setSeed] = useState(1);

  const sel = useMemo(() => (base ? (edits ? edit(base, edits, seed * 101 + edits) : base) : null), [base, edits, seed]);
  const score = sel ? detect(key, sel) : null;

  const write = (watermark: boolean) => { const sd = Math.floor(Math.random() * 1e6); setSeed(sd); setBase(generate(key, watermark, sd)); setEdits(0); onDone?.(); };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setBase(null); setEdits(0); setKey(12345); }}>
      <div className="stack">
        <div className="lb-runbar">
          <Button size="sm" icon="edit" onClick={() => write(true)}>{s.wm}</Button>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => write(false)}>{s.plain}</Button>
          <Button size="sm" variant="ghost" icon="sync" onClick={() => { setKey((k) => k + 97); setBase(null); setEdits(0); }}>{s.newKey}</Button>
        </div>
        {sel && score && (
          <>
            <span className="dr-field-label">{s.sentence}</span>
            <p className="lb-wm-text" dir="auto">
              {words(sel, tlang).map((w, i) => <span key={i} className={isGreen(key, i, sel[i]) ? "lb-wm-word is-green" : "lb-wm-word"}>{w}</span>)}
            </p>
            <Slider label={s.edits} value={edits} min={0} max={SLOTS.length} onChange={setEdits} format={(v) => num(v)} />
            <Stats items={[{ label: s.score, value: `${num(score.green)} / ${num(score.slots)}` }, { label: s.signal, value: num(score.z, { maximumFractionDigits: 1 }) }]} />
            <p className={`lb-verdict ${score.flagged ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${score.flagged ? "bad" : "good"}`}><Icon name={score.flagged ? "warning" : "check"} size={16} /> {score.flagged ? s.flagged : s.notFlagged}</span> {score.flagged ? s.flagY : s.flagN}</p>
            {edits > 0 && <p className="lb-note">{s.editNote}</p>}
          </>
        )}
        <p className="lb-note"><Icon name="info" size={16} /> {s.honest}</p>
      </div>
    </LabShell>
  );
}
