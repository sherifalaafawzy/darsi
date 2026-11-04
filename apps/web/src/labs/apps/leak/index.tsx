import { useEffect, useMemo, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { CORPUS, complete, HELDOUT, leaks, logProb, membershipAccuracy, SECRET, train, usefulness } from "./model";

const NORMAL: Record<"en" | "ar", string> = { en: "the library opens", ar: "تفتح المكتبة" };

const S = {
  en: {
    intro: "A tiny text model learns to finish sentences from a few school lines — and one of those lines is a private record. With no privacy, the model has memorised it word for word. Ask it the right way and it hands the secret back.",
    privacy: "Privacy added", level: { 0: "none", 1: "some", 2: "more", 3: "most" } as Record<number, string>,
    secretPrompt: "Finish: the private line", normalPrompt: "Finish: an ordinary line", answers: "it says",
    nothing: "(it isn't sure any more)",
    leakY: "Leaking: the model repeats the private record.", leakN: "Safe: the private record no longer comes out.",
    useful: "Useful on ordinary lines", member: "Attacker's guess (was it trained on?)",
    memberNote: "A membership-inference attacker checks how familiar a sentence feels to the model. 50% means they're only guessing.",
    try1: "At privacy “none”, read the private line's completion: the model gives back the exact card number it was trained on. It memorised it.",
    try2: "Raise “Privacy added”: the secret stops coming out, and the attacker's guess falls towards 50%. But watch “Useful on ordinary lines” drop too.",
    try3: "This is the trade-off: more privacy, less leaking, but a less useful model. There is no free setting — you choose where to sit.",
    takeaway: "Models can memorise rare, private details and leak them when prompted — and an attacker can often tell whose data was used to train one. Adding noise or dropping rare records protects people, but it costs accuracy. Keep private data out of training you don't need it in.",
  },
  ar: {
    intro: "نموذج نصّي صغير يتعلّم إكمال الجمل من بضعة أسطر مدرسية — وأحدها سجلّ خاص. بلا خصوصية، يكون النموذج قد حفظه كلمةً كلمة. اسأله بالطريقة الصحيحة فيعيد السرّ إليك.",
    privacy: "الخصوصية المضافة", level: { 0: "لا شيء", 1: "قليلة", 2: "أكثر", 3: "الأكثر" } as Record<number, string>,
    secretPrompt: "أكمل: السطر الخاص", normalPrompt: "أكمل: سطر عادي", answers: "يقول",
    nothing: "(لم يعد متأكدًا)",
    leakY: "تسريب: يكرّر النموذج السجلّ الخاص.", leakN: "آمن: لم يعد السجلّ الخاص يخرج.",
    useful: "الفائدة على الأسطر العادية", member: "تخمين المهاجم (هل دُرّب عليها؟)",
    memberNote: "مهاجم استدلال العضوية يفحص كم يبدو السطر مألوفًا للنموذج. و٥٠٪ تعني أنه يخمّن فحسب.",
    try1: "عند خصوصية «لا شيء»، اقرأ إكمال السطر الخاص: يعيد النموذج رقم البطاقة نفسه الذي دُرّب عليه. لقد حفظه.",
    try2: "ارفع «الخصوصية المضافة»: يتوقّف السرّ عن الخروج، ويهبط تخمين المهاجم نحو ٥٠٪. لكن راقب «الفائدة على الأسطر العادية» تهبط أيضًا.",
    try3: "هذه هي الموازنة: خصوصية أكثر، وتسريب أقلّ، لكن نموذج أقلّ فائدة. لا إعداد مجاني — أنت تختار أين تقف.",
    takeaway: "قد تحفظ النماذج تفاصيل نادرة وخاصة وتسرّبها عند السؤال — وكثيرًا ما يستطيع المهاجم معرفة بيانات مَن استُخدمت لتدريبها. إضافة الضوضاء أو إسقاط السجلات النادرة يحمي الناس، لكنه يكلّف دقّة. أبقِ البيانات الخاصة خارج تدريب لا تحتاجها فيه.",
  },
};

export default function Leak({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const tlang = lang === "ar" ? "ar" : "en";
  const model = useMemo(() => train(CORPUS[tlang]), [tlang]);
  const [privacy, setPrivacy] = useState(0);
  const secret = SECRET[tlang];
  const secretOut = complete(model, secret.prompt, privacy, 3);
  const normalOut = complete(model, NORMAL[tlang], privacy, 4);
  const isLeak = leaks(model, secret, privacy);
  const member = membershipAccuracy(model, CORPUS[tlang], HELDOUT[tlang], privacy);
  const member0 = CORPUS[tlang][0], nonMember = HELDOUT[tlang][0];

  // Mark done once the learner has pushed privacy up enough to close the leak after seeing it.
  useEffect(() => { if (privacy > 0 && !isLeak) onDone?.(); }, [privacy > 0 && !isLeak]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => setPrivacy(0)}>
      <div className="stack">
        <Slider label={s.privacy} value={privacy} min={0} max={3} onChange={setPrivacy} format={(v) => s.level[v]} />
        <div className="lb-two">
          <div className="lb-leak-card">
            <span className="dr-field-label">{s.secretPrompt}</span>
            <p dir="auto" className="lb-leak-prompt">“{secret.prompt}…”</p>
            <p className="lb-leak-out">{s.answers}: <strong dir="ltr">{secretOut || s.nothing}</strong></p>
          </div>
          <div className="lb-leak-card">
            <span className="dr-field-label">{s.normalPrompt}</span>
            <p dir="auto" className="lb-leak-prompt">“{NORMAL[tlang]}…”</p>
            <p className="lb-leak-out">{s.answers}: <strong dir="auto">{normalOut || s.nothing}</strong></p>
          </div>
        </div>
        <p className={`lb-verdict ${isLeak ? "is-warn" : ""}`} aria-live="polite"><span className={`lb-out-tag is-${isLeak ? "leaked" : "blocked"}`}><Icon name={isLeak ? "warning" : "lock"} size={16} /></span> {isLeak ? s.leakY : s.leakN}</p>
        <Stats items={[{ label: s.useful, value: num(usefulness(model, HELDOUT[tlang], privacy), { style: "percent" }) }, { label: s.member, value: num(member, { style: "percent" }) }]} />
        <p className="lb-note">{s.memberNote}</p>
        <ul className="lb-mi">
          <li><span dir="auto">“{member0}”</span><span className="lb-note" dir="ltr">{num(logProb(model, member0, privacy), { maximumFractionDigits: 1 })}</span></li>
          <li><span dir="auto">“{nonMember}”</span><span className="lb-note" dir="ltr">{num(logProb(model, nonMember, privacy), { maximumFractionDigits: 1 })}</span></li>
        </ul>
      </div>
    </LabShell>
  );
}
