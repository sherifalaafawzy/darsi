import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { MESSAGES, score, type Channel, type Clue } from "./model";

const S = {
  en: {
    intro: "Scammers send messages that look like your bank, a delivery company, your school or a friend. Read each one as if it arrived on your phone today. Is it genuine or a scam?",
    of: (i: string, n: string) => `Message ${i} of ${n}`, channel: { sms: "Text message", chat: "Chat", email: "Email" } as Record<Channel, string>,
    from: "From", link: "Link", file: "Attachment", safe: "Looks genuine", scam: "It's a scam",
    right: "Right!", wrong: "Not quite.", wasScam: "This one is a scam. The warning signs:", wasSafe: "This one is genuine.",
    safeWhy: { meeting: "From the school's usual address, gives information, asks for nothing.", code: "A genuine sign-in code, and it tells you never to share it. If you didn't just try to sign in, someone has your password: change it.", darsi: "From the app's real address, and it asks you for nothing: no link, no password, no payment." } as Record<string, string>,
    clue: { urgent: "Pressure to act fast: “within 24 hours”, “today”, “now”.", money: "It asks you to pay or buy something.", code: "It asks for codes. Real services and real head teachers never do.", link: "The link's address doesn't belong to the real organisation.", sender: "Unknown or odd sender, or a “new number”.", prize: "A prize from a draw you never entered.", file: "The “photo” ends in .apk: it's an app that can take over your phone. Friends' accounts get hacked too.", password: "It asks you to confirm your password." } as Record<Clue, string>,
    next: "Next message", done: (n: string, t: string) => `You judged ${n} of ${t} correctly.`, again: "Try again",
    rule: "When in doubt: don't click, don't reply. Contact the person or company another way you already trust: their official app, number or office.",
    try1: "Before you answer, check three things: who sent it, what it asks you to do, and whether it rushes you.",
    try2: "Read each link's address closely: a scam's link uses a look-alike name, not the real organisation's. The genuine messages here ask you for nothing.",
    takeaway: "Scams work by rushing you and borrowing trust. Slow down, check the sender and the link's real address, and never share passwords or codes. A genuine message can always wait while you check another way.",
  },
  ar: {
    intro: "يرسل المحتالون رسائل تبدو كأنها من بنكك أو شركة توصيل أو مدرستك أو صديق. اقرأ كل رسالة كأنها وصلت إلى هاتفك اليوم. هل هي حقيقية أم احتيال؟",
    of: (i: string, n: string) => `الرسالة ${i} من ${n}`, channel: { sms: "رسالة نصية", chat: "محادثة", email: "بريد إلكتروني" } as Record<Channel, string>,
    from: "من", link: "الرابط", file: "المرفق", safe: "تبدو حقيقية", scam: "إنها احتيال",
    right: "صحيح!", wrong: "ليس تمامًا.", wasScam: "هذه رسالة احتيال. علامات التحذير:", wasSafe: "هذه رسالة حقيقية.",
    safeWhy: { meeting: "من العنوان المعتاد للمدرسة، تعطي معلومة ولا تطلب شيئًا.", code: "رمز دخول حقيقي، ويطلب منك ألّا تشاركه أبدًا. وإن لم تكن تحاول الدخول للتو، فأحدٌ يعرف كلمة مرورك: غيّرها.", darsi: "من العنوان الحقيقي للتطبيق، ولا تطلب منك شيئًا: لا رابط ولا كلمة مرور ولا دفع." } as Record<string, string>,
    clue: { urgent: "ضغط للتصرّف بسرعة: «خلال ٢٤ ساعة»، «اليوم»، «الآن».", money: "تطلب منك أن تدفع أو تشتري شيئًا.", code: "تطلب رموزًا. الخدمات الحقيقية والمديرون الحقيقيون لا يفعلون ذلك أبدًا.", link: "عنوان الرابط لا يخصّ الجهة الحقيقية.", sender: "مرسل مجهول أو غريب، أو «رقم جديد».", prize: "جائزة من سحب لم تشارك فيه.", file: "«الصورة» تنتهي بـ ‎.apk: إنها تطبيق قد يستولي على هاتفك. وحسابات الأصدقاء تُخترق أيضًا.", password: "تطلب منك تأكيد كلمة مرورك." } as Record<Clue, string>,
    next: "الرسالة التالية", done: (n: string, t: string) => `حكمت على ${n} من ${t} حكمًا صحيحًا.`, again: "حاول من جديد",
    rule: "عند الشك: لا تضغط ولا ترد. تواصل مع الشخص أو الشركة بطريقة أخرى تثق بها أصلًا: تطبيقها الرسمي أو رقمها أو مكتبها.",
    try1: "قبل أن تجيب، تحقّق من ثلاثة أشياء: من أرسلها، وماذا تطلب منك، وهل تستعجلك.",
    try2: "اقرأ عنوان كل رابط بعناية: رابط الاحتيال يستعمل اسمًا يشبه اسم الجهة الحقيقية وليس اسمها. أما الرسائل الحقيقية هنا فلا تطلب منك شيئًا.",
    takeaway: "ينجح الاحتيال بالاستعجال واستعارة الثقة. تمهّل، وتحقّق من المرسل ومن العنوان الحقيقي للرابط، ولا تشارك كلمات المرور أو الرموز أبدًا. فالرسالة الحقيقية تستطيع دائمًا أن تنتظر ريثما تتحقّق بطريقة أخرى.",
  },
};

export default function Phishing({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const L = lang === "ar" ? "ar" : "en";
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const finished = i >= MESSAGES.length;
  useEffect(() => { if (finished) onDone?.(); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = MESSAGES[Math.min(i, MESSAGES.length - 1)], t = m[L], said = answers[m.id];

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
      {finished ? (
        <>
          <p className="lb-verdict" aria-live="polite">{s.done(num(score(answers)), num(MESSAGES.length))}</p>
          <ul className="lb-flags is-review">{MESSAGES.map((x) => <li key={x.id} className={answers[x.id] === x.scam ? "is-ok" : undefined}><Icon name={answers[x.id] === x.scam ? "check" : "close"} size={16} /> {x[L].from}: {x.scam ? s.scam : s.safe}</li>)}</ul>
          <p className="lb-flags-one">{s.rule}</p>
          <div className="lb-row"><Button size="sm" variant="secondary" icon="sync" onClick={() => { setI(0); setAnswers({}); }}>{s.again}</Button></div>
        </>
      ) : (
        <>
          <span className="lb-note">{s.of(num(i + 1), num(MESSAGES.length))}</span>
          <article className={`lb-msg is-${m.channel}`} aria-label={s.channel[m.channel]}>
            <header><span className="lb-kicker">{s.channel[m.channel]}</span><span>{s.from}: <bdi dir={/^[ -~]*$/.test(t.from) ? "ltr" : "auto"}>{t.from}</bdi></span></header>
            <p>{t.text}</p>
            {t.link && <p className="lb-msg-link"><Icon name="link" size={16} /> <bdi dir="ltr">{t.link}</bdi></p>}
            {t.file && <p className="lb-msg-link"><Icon name="file" size={16} /> <bdi dir="ltr">{t.file}</bdi></p>}
          </article>
          {said === undefined ? (
            <div className="lb-row">
              <Button size="sm" variant="secondary" icon="check" onClick={() => setAnswers((a) => ({ ...a, [m.id]: false }))}>{s.safe}</Button>
              <Button size="sm" icon="warning" onClick={() => setAnswers((a) => ({ ...a, [m.id]: true }))}>{s.scam}</Button>
            </div>
          ) : (
            <div className="stack-sm" aria-live="polite">
              <p className={said === m.scam ? "lb-answer is-ok" : "lb-verdict is-warn"}>{said === m.scam ? s.right : s.wrong} {m.scam ? s.wasScam : s.wasSafe}</p>
              {m.scam ? <ul className="lb-flags">{m.clues.map((c) => <li key={c}>{s.clue[c]}</li>)}</ul> : <p className="lb-note">{s.safeWhy[m.id]}</p>}
              <div className="lb-row"><Button size="sm" icon="next" onClick={() => setI(i + 1)}>{s.next}</Button></div>
            </div>
          )}
        </>
      )}
    </LabShell>
  );
}
