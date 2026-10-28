import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { STEPS, type Flag, type StepId } from "./model";

const S = {
  en: {
    intro: "Your phone rings during break. The number isn't one you know. Choose what you say, as you really would.",
    caller: "Caller", you: "You", tricks: "Tricks in what they just said:",
    flag: { unknown: "A number you don't know, claiming to be someone important.", authority: "Claims authority (the Ministry, IT support, the bank) so you'll obey.", urgency: "Rushes you so you don't stop to think.", secret: "Asks for a password or a code: real support staff never need these.", fear: "Threats: “your account will be deleted”, “it will be your fault”." } as Record<Flag, string>,
    safe: "Safe", lost: "Account taken over", again: "Take the call again",
    rule: "Real IT staff, banks and ministries never ask for your password or a code. Hang up, and call back on a number you already know.",
    try1: "Answer the way many people would, and read the code out: see how fast a six-digit code becomes a stolen account.",
    try2: "Press Take the call again and refuse this time. After each caller line, read the tricks he used: authority, hurry and fear.",
    takeaway: "Social engineering hacks people, not computers: it borrows authority, creates panic and asks for secrets. The defence is simple and always works: slow down, never share passwords or codes, and check by calling back on a number you trust.",
  },
  ar: {
    intro: "يرنّ هاتفك أثناء الاستراحة، والرقم لا تعرفه. اختر ما تقوله، كما كنت ستفعل فعلًا.",
    caller: "المتصل", you: "أنت", tricks: "الحيل فيما قاله للتو:",
    flag: { unknown: "رقم لا تعرفه يدّعي صاحبه أنه شخص مهم.", authority: "يدّعي سلطة (الوزارة، الدعم الفني، البنك) لكي تطيعه.", urgency: "يستعجلك حتى لا تتوقف لتفكّر.", secret: "يطلب كلمة مرور أو رمزًا: موظفو الدعم الحقيقيون لا يحتاجون إليهما أبدًا.", fear: "تهديدات: «سيُحذف حسابك»، «سيكون ذلك خطأك»." } as Record<Flag, string>,
    safe: "في أمان", lost: "استُولي على الحساب", again: "استقبل المكالمة من جديد",
    rule: "موظفو الحاسوب والبنوك والوزارات الحقيقيون لا يطلبون كلمة مرورك أو رمزًا أبدًا. أغلق الخط، واتصل على رقم تعرفه أصلًا.",
    try1: "أجب كما يجيب كثير من الناس، واقرأ الرمز للمتصل: انظر كيف يتحوّل رمز من ستة أرقام بسرعة إلى حساب مسروق.",
    try2: "اضغط «استقبل المكالمة من جديد» وارفض هذه المرة. وبعد كل جملة من المتصل اقرأ الحيل التي استعملها: السلطة والاستعجال والتخويف.",
    takeaway: "الهندسة الاجتماعية تخترق الناس لا الحواسيب: تستعير السلطة، وتصنع الذعر، وتطلب الأسرار. والدفاع بسيط وينجح دائمًا: تمهّل، ولا تشارك كلمات المرور أو الرموز أبدًا، وتحقّق بالاتصال على رقم تثق به.",
  },
};

export default function Social({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang } = useI18n();
  const L = lang === "ar" ? "ar" : "en";
  const [trail, setTrail] = useState<{ id: StepId; said?: number }[]>([{ id: "start" }]);
  const cur = trail[trail.length - 1], step = STEPS[cur.id];
  useEffect(() => { if (step.end === "safe") onDone?.(); }, [step.end]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
      <ol className="lb-call" aria-live="polite">
        {trail.map((t, k) => {
          const st = STEPS[t.id], answered = k < trail.length - 1;
          return (
            <li key={k} className="stack-sm">
              {st.caller && <p className="lb-bubble is-them"><span className="lb-kicker">{s.caller}</span>{st.caller[L]}</p>}
              {answered && st.flags.length > 0 && (
                <div className="lb-tricks"><span className="lb-note">{s.tricks}</span><ul className="lb-flags">{st.flags.map((f) => <li key={f}>{s.flag[f]}</li>)}</ul></div>
              )}
              {t.said !== undefined && <p className="lb-bubble is-me"><span className="lb-kicker">{s.you}</span>{STEPS[t.id].choices[t.said].say[L]}</p>}
            </li>
          );
        })}
      </ol>
      {step.end ? (
        <div className="stack-sm">
          <p className={step.end === "safe" ? "lb-answer is-ok" : "lb-verdict is-warn"}><strong><Icon name={step.end === "safe" ? "check" : "warning"} size={16} /> {s[step.end]}</strong><br />{step.outcome![L]}</p>
          <p className="lb-flags-one">{s.rule}</p>
          <div className="lb-row"><Button size="sm" variant="secondary" icon="sync" onClick={() => setTrail([{ id: "start" }])}>{s.again}</Button></div>
        </div>
      ) : (
        <div className="lb-replies">
          {step.choices.map((c, i) => <button key={i} type="button" className="lb-reply" onClick={() => setTrail((tr) => [...tr.slice(0, -1), { ...cur, said: i }, { id: c.to }])}>{c.say[L]}</button>)}
        </div>
      )}
    </LabShell>
  );
}
