import { useEffect, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { APPS, isRight, mark, RISKY, type AppId, type Choices, type Perm } from "./model";

const S = {
  en: {
    intro: "You've installed four apps. Each asks for permissions. For every request, decide: allow or deny? Then check your choices.",
    app: { torch: "Torch", timetable: "School timetable", photo: "Photo editor", quiz: "Quiz game" } as Record<AppId, string>,
    does: { torch: "Turns on the light on the back of your phone.", timetable: "Shows your lessons and reminds you before each one.", photo: "Edits and decorates your photos.", quiz: "Fun quizzes on general knowledge." } as Record<AppId, string>,
    perm: { camera: "Camera", mic: "Microphone", location: "Location", contacts: "Contacts", sms: "Send and read text messages", photos: "Photos and files", notifications: "Notifications", calendar: "Calendar" } as Record<Perm, string>,
    allow: "Allow", deny: "Deny", check: "Check my choices", score: (r: string, t: string) => `${r} of ${t} choices match what the apps need.`,
    why: {
      "torch.camera": "Needed: the light is the camera's flash.", "torch.location": "Not needed: a torch has no reason to know where you are.", "torch.contacts": "Not needed, and a warning sign: why would a torch want your friends' numbers?",
      "timetable.notifications": "Needed for lesson reminders.", "timetable.calendar": "Your choice: it only adds your lessons to your calendar. The app works without it.", "timetable.mic": "Not needed: a timetable doesn't listen.", "timetable.contacts": "Not needed.",
      "photo.photos": "Needed to edit your photos.", "photo.camera": "Your choice: handy for taking a photo to edit, but it can edit the photos you already have without it.", "photo.location": "Not needed: photos can carry where you were.", "photo.sms": "Never: a photo app that sends text messages can cost you money and spread scams.",
      "quiz.notifications": "Your choice: only to tell you about new quizzes. The game works without it.", "quiz.mic": "Not needed.", "quiz.contacts": "Not needed: often used to send invitations or ads to all your friends.", "quiz.location": "Not needed for a quiz.",
    } as Record<string, string>,
    risky: "risky",
    try1: "For each request, ask: does this app need it to do its job? A torch needs the camera, for its flash, and nothing else.",
    try2: "Press Check my choices, then fix the crosses. Be strict with requests marked risky: contacts or text messages for an app with no use for them are a warning sign.",
    takeaway: "Ask “does this app need this to do its job?” before you tap Allow. You can change permissions any time in your phone's settings, and remove apps that ask for far more than they need.",
  },
  ar: {
    intro: "ثبّتّ أربعة تطبيقات، وكل منها يطلب أذونات. قرّر لكل طلب: تسمح أم ترفض؟ ثم افحص اختياراتك.",
    app: { torch: "المصباح", timetable: "جدول الحصص", photo: "محرّر الصور", quiz: "لعبة المسابقات" } as Record<AppId, string>,
    does: { torch: "يشغّل الضوء في ظهر هاتفك.", timetable: "يعرض حصصك ويذكّرك قبل كل حصة.", photo: "يحرّر صورك ويزيّنها.", quiz: "مسابقات ممتعة في الثقافة العامة." } as Record<AppId, string>,
    perm: { camera: "الكاميرا", mic: "الميكروفون", location: "الموقع", contacts: "جهات الاتصال", sms: "إرسال الرسائل النصية وقراءتها", photos: "الصور والملفات", notifications: "الإشعارات", calendar: "التقويم" } as Record<Perm, string>,
    allow: "اسمح", deny: "ارفض", check: "افحص اختياراتي", score: (r: string, t: string) => `${r} من ${t} اختيارًا تطابق ما تحتاج إليه التطبيقات.`,
    why: {
      "torch.camera": "مطلوب: الضوء هو فلاش الكاميرا.", "torch.location": "غير مطلوب: لا سبب يجعل المصباح يعرف مكانك.", "torch.contacts": "غير مطلوب، وعلامة تحذير: لماذا يريد مصباح أرقام أصدقائك؟",
      "timetable.notifications": "مطلوب لتذكيرك بالحصص.", "timetable.calendar": "الخيار لك: يضيف حصصك إلى تقويمك فقط، ويعمل التطبيق دونه.", "timetable.mic": "غير مطلوب: الجدول لا يستمع.", "timetable.contacts": "غير مطلوب.",
      "photo.photos": "مطلوب لتحرير صورك.", "photo.camera": "الخيار لك: مفيد لالتقاط صورة لتحريرها، لكنه يستطيع تحرير صورك الموجودة دونه.", "photo.location": "غير مطلوب: قد تحمل الصور المكان الذي كنت فيه.", "photo.sms": "أبدًا: تطبيق صور يرسل رسائل نصية قد يكلّفك مالًا وينشر الاحتيال.",
      "quiz.notifications": "الخيار لك: لإعلامك بالمسابقات الجديدة فقط، وتعمل اللعبة دونه.", "quiz.mic": "غير مطلوب.", "quiz.contacts": "غير مطلوب: كثيرًا ما يُستعمل لإرسال دعوات أو إعلانات إلى كل أصدقائك.", "quiz.location": "غير مطلوب لمسابقة.",
    } as Record<string, string>,
    risky: "خطِر",
    try1: "اسأل عن كل طلب: هل يحتاج التطبيق إليه ليؤدي عمله؟ المصباح يحتاج إلى الكاميرا من أجل الفلاش، ولا شيء غيرها.",
    try2: "اضغط «افحص اختياراتي» ثم صحّح الإجابات الخاطئة. وكن صارمًا مع الطلبات الموسومة «خطِر»: جهات الاتصال أو الرسائل النصية لتطبيق لا حاجة له بها علامة تحذير.",
    takeaway: "اسأل «هل يحتاج التطبيق إلى هذا ليؤدي عمله؟» قبل أن تضغط «اسمح». ويمكنك تغيير الأذونات في أي وقت من إعدادات هاتفك، وحذف التطبيقات التي تطلب أكثر بكثير مما تحتاج إليه.",
  },
};

export default function Permissions({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [choices, setChoices] = useState<Choices>({});
  const [checked, setChecked] = useState(false);
  const m = mark(choices);
  useEffect(() => { if (checked) onDone?.(); }, [checked]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (app: AppId, p: Perm, v: boolean) => setChoices((c) => ({ ...c, [app]: { ...c[app], [p]: v } }));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
      <div className="lb-apps">
        {(Object.keys(APPS) as AppId[]).map((app) => (
          <section key={app} className="lb-app">
            <h3 className="lb-h">{s.app[app]}</h3>
            <p className="lb-note">{s.does[app]}</p>
            <ul className="lb-perms">
              {APPS[app].asks.map((p) => {
                const v = choices[app]?.[p] ?? false, right = isRight(app, p, v);
                return (
                  <li key={p}>
                    <div className="lb-perm-row">
                      <span>{s.perm[p]}{RISKY.includes(p) && <span className="lb-risky"> {s.risky}</span>}</span>
                      <div className="lb-seg" role="radiogroup" aria-label={`${s.app[app]}: ${s.perm[p]}`}>
                        <button type="button" role="radio" aria-checked={v} className={v ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => set(app, p, true)}>{s.allow}</button>
                        <button type="button" role="radio" aria-checked={!v} className={!v ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => set(app, p, false)}>{s.deny}</button>
                      </div>
                    </div>
                    {checked && <p className={right ? "lb-perm-why is-ok" : "lb-perm-why is-no"}><Icon name={right ? "check" : "close"} size={14} /> {s.why[`${app}.${p}`]}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="lb-row"><Button size="sm" icon="check" onClick={() => setChecked(true)}>{s.check}</Button></div>
      {checked && <p className="lb-verdict" aria-live="polite">{s.score(num(m.right), num(m.total))}</p>}
    </LabShell>
  );
}
