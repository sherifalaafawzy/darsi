import { useEffect, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { known, POSTS, type Audience, type Fact } from "./model";

const S = {
  en: {
    intro: "Lina is 14. Her profile is public, so anyone can read these posts. Each one seems harmless. Read them as a stranger would, then choose who should see each post.",
    who: "Who can see it", public: "Everyone", friends: "Friends only", deleted: "Delete",
    knows: "What a stranger now knows about Lina", nothing: "Nothing useful. Her profile is safe.",
    fact: { school: "Her school and class: where to find her every weekday.", birthday: "Her birthday and age: used to guess passwords and answer security questions.", route: "Her route home and the time: where she'll be, alone.", pet: "Her pet's name: a very common password and security answer.", phone: "Her phone number: for scam calls and messages.", away: "That the house is empty this week." } as Record<Fact, string>,
    risk: (n: string) => `${n} of 6 risky facts are public.`,
    try1: "Read the posts as a stranger would: together they say where Lina is every weekday, when she walks home alone, and when her house is empty.",
    try2: "Set the walk home and the family trip to Friends only: those facts leave the stranger's list. Can you get the list down to nothing?",
    takeaway: "Your footprint is everything you and others post about you, and it lasts. Before posting, ask: who can see this, and what could a stranger do with it combined with everything else? Share wins with friends; keep routines, places and dates private.",
  },
  ar: {
    intro: "لينا عمرها ١٤ سنة. حسابها عام، فيستطيع أي أحد قراءة هذه المنشورات. كل منشور يبدو بريئًا. اقرأها كما يقرؤها غريب، ثم اختر من يرى كل منشور.",
    who: "من يستطيع رؤيته", public: "الجميع", friends: "الأصدقاء فقط", deleted: "احذف",
    knows: "ما يعرفه الغريب الآن عن لينا", nothing: "لا شيء مفيد. حسابها آمن.",
    fact: { school: "مدرستها وصفّها: أين يجدها في كل يوم دراسي.", birthday: "تاريخ ميلادها وعمرها: يُستعملان لتخمين كلمات المرور والإجابة عن أسئلة الأمان.", route: "طريقها إلى البيت ووقته: أين ستكون وحدها.", pet: "اسم قطتها: كلمة مرور وإجابة أمان شائعة جدًا.", phone: "رقم هاتفها: للمكالمات والرسائل الاحتيالية.", away: "أن البيت فارغ هذا الأسبوع." } as Record<Fact, string>,
    risk: (n: string) => `${n} من ٦ معلومات خطِرة متاحة للجميع.`,
    try1: "اقرأ المنشورات كما يقرؤها غريب: معًا تخبره أين تكون لينا كل يوم دراسي، ومتى تمشي إلى البيت وحدها، ومتى يكون بيتها فارغًا.",
    try2: "اجعل منشورَي الطريق إلى البيت والرحلة العائلية «للأصدقاء فقط»: تختفي هاتان المعلومتان من قائمة الغريب. هل تستطيع أن تفرغ القائمة كلها؟",
    takeaway: "بصمتك هي كل ما تنشره أنت وينشره الآخرون عنك، وهي تبقى. قبل النشر اسأل: من يرى هذا، وماذا يستطيع غريب أن يفعل به إذا جمعه مع كل ما سواه؟ شارك إنجازاتك مع أصدقائك، واحتفظ بالمواعيد والأماكن والتواريخ لنفسك.",
  },
};

export default function Footprint({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const L = lang === "ar" ? "ar" : "en";
  const [aud, setAud] = useState<Record<string, Audience>>({});
  const facts = known(aud);
  useEffect(() => { if (facts.length <= 1 && Object.keys(aud).length >= 3) onDone?.(); }, [facts.length <= 1 && Object.keys(aud).length >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2]} takeaway={s.takeaway}>
      <div className="lb-two">
        <ul className="lb-posts">
          {POSTS.map((p) => {
            const a = aud[p.id] ?? "public";
            return (
              <li key={p.id} className={`lb-post is-${a}`}>
                <p>{p[L]}</p>
                <div className="lb-seg" role="radiogroup" aria-label={s.who}>
                  <span className="lb-seg-label">{s.who}</span>
                  {(["public", "friends", "deleted"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={a === v} className={a === v ? "lb-seg-btn is-on" : "lb-seg-btn"} onClick={() => setAud((x) => ({ ...x, [p.id]: v }))}>{s[v]}</button>)}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="lb-snoop" aria-live="polite">
          <span className="lb-kicker">{s.knows}</span>
          {facts.length ? <ul className="lb-flags">{facts.map((f) => <li key={f}><Icon name="warning" size={14} /> {s.fact[f]}</li>)}</ul> : <p className="lb-answer is-ok">{s.nothing}</p>}
          <p className="lb-note">{s.risk(num(facts.length))}</p>
        </div>
      </div>
    </LabShell>
  );
}
