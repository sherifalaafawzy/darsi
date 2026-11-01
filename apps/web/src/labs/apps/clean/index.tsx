import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { classList, clean, register, TRUE_RATE, type Blank, type NameFix, type Row } from "./model";

const S = {
  en: {
    intro: "Two teachers typed a week of attendance for one class into one sheet. The class has 8 pupils, and the paper register says 34 of 40 were present (85%). The sheet doesn't agree yet.",
    names: "Names", nameOpts: ["As typed", "Tidy spaces and capitals", "Match the class list"],
    nameNote: "Matching treats close spellings as the same name; a name not on the class list is set aside.",
    repeats: "Repeats (same pupil, same day)", keep: "Keep", remove: "Remove",
    blank: "No answer", blankOpts: { leave: "Leave out", absent: "Count as absent", present: "Count as present" } as Record<Blank, string>,
    rows: "Rows", pupils: "Pupils (the class has 8)", removed: "Repeats removed", aside: "Set aside", noAnswer: "No answer", rate: "Attendance",
    paper: (p: string) => `The paper register says ${p}.`,
    list: "Names in the sheet, with their rows", log: "What changed", name: "Typed", day: "Day", what: "What happened",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], renamed: (n: string) => `→ ${n}`, repeat: "removed: typed twice", setAside: "set aside: not on the class list",
    blankDid: { leave: "no answer: left out", absent: "no answer: counted absent", present: "no answer: counted present" } as Record<Blank, string>,
    nothing: "Nothing changed yet: every row counts as typed.",
    try1: "Choose “Tidy spaces and capitals”: “amina␣” and “TUNDE” join their classmates, and the names counted fall from 20 to 13. “Match the class list” brings it to 8.",
    try2: "With the names matched, remove repeats: 3 rows go, including Fatima's Monday, typed again as “Fatimah”. With names as typed, only 1 is found.",
    try3: "Switch “No answer” between its choices: attendance moves from 80% to 90%, around the true 85%. There is no right guess, so say which choice you made.",
    takeaway: "Cleaning is a chain of choices: how to match names, which repeats to drop, what to do with blanks, and each one changes the counts. Fix names before looking for repeats, never fill blanks silently, and write down what you changed.",
  },
  ar: {
    intro: "كتب معلّمان حضور فصل واحد لأسبوع في ورقة واحدة. في الفصل ٨ تلاميذ، ويقول السجلّ الورقي إن ٣٤ من ٤٠ حضروا (٨٥٪). لكن الورقة لا تتفق معه بعد.",
    names: "الأسماء", nameOpts: ["كما كُتبت", "نظّف المسافات", "طابِق قائمة الفصل"],
    nameNote: "تعامل المطابقة صور الحروف المختلفة (أ وا، ة وه، ى وي) والأخطاء الإملائية القريبة كأنها الاسم نفسه، وتضع جانبًا الاسم غير الموجود في قائمة الفصل.",
    repeats: "المكرر (التلميذ نفسه في اليوم نفسه)", keep: "أبقِه", remove: "احذفه",
    blank: "بلا إجابة", blankOpts: { leave: "استبعدها", absent: "عُدّها غيابًا", present: "عُدّها حضورًا" },
    rows: "الصفوف", pupils: "التلاميذ (في الفصل ٨)", removed: "المكرر المحذوف", aside: "جانبًا", noAnswer: "بلا إجابة", rate: "نسبة الحضور",
    paper: (p: string) => `يقول السجلّ الورقي ${p}.`,
    list: "الأسماء في الورقة، مع عدد صفوفها", log: "ما الذي تغيّر", name: "كما كُتب", day: "اليوم", what: "ماذا حدث",
    days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"], renamed: (n: string) => `← ${n}`, repeat: "حُذف: كُتب مرتين", setAside: "وُضع جانبًا: ليس في قائمة الفصل",
    blankDid: { leave: "بلا إجابة: استُبعد", absent: "بلا إجابة: عُدّ غيابًا", present: "بلا إجابة: عُدّ حضورًا" },
    nothing: "لم يتغير شيء بعد: كل صف يُعدّ كما كُتب.",
    try1: "اختر «نظّف المسافات»: تنضم «أمينة␣» و«␣عمر» إلى زملائهما، وتنخفض الأسماء المعدودة من ٢٠ إلى ١٥. ثم «طابِق قائمة الفصل» تجعلها ٨.",
    try2: "بعد مطابقة الأسماء، احذف المكرر: تختفي ٣ صفوف، منها يوم الأحد لفاطمة الذي كُتب مرة ثانية «فاطمه». أما مع الأسماء كما كُتبت فلا يُكتشف إلا صف واحد.",
    try3: "بدّل بين اختيارات «بلا إجابة»: تتحرك نسبة الحضور بين ٨٠٪ و٩٠٪، حول النسبة الحقيقية ٨٥٪. لا يوجد تخمين صحيح، فاذكر الاختيار الذي اتخذته.",
    takeaway: "التنظيف سلسلة من الاختيارات: كيف تطابق الأسماء، وأي المكرر تحذف، وماذا تفعل بالخانات الفارغة، وكل اختيار يغيّر الأعداد. أصلح الأسماء قبل البحث عن المكرر، ولا تملأ الفراغات بصمت، ودوّن ما غيّرته.",
  },
};

/** Spaces at the ends of a name, or two in a row, made visible. */
const visible = (n: string) => n.replace(/^ +| +$| {2,}/g, (m) => "␣".repeat(m.length));

export default function Clean({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const l = lang === "ar" ? "ar" : "en";
  const [names, setNames] = useState<NameFix>(0);
  const [repeats, setRepeats] = useState(false);
  const [blank, setBlank] = useState<Blank>("leave");
  const [blanks, setBlanks] = useState(() => new Set<Blank>(["leave"]));
  const raw = useMemo(() => register(l), [l]);
  const list = useMemo(() => classList(l), [l]);
  const r = clean(raw, list, { names, repeats, blank });
  const done = names === 2 && repeats && blanks.size >= 2;
  useEffect(() => { if (done) onDone?.(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v: number) => num(v, { style: "percent", maximumFractionDigits: 1 });
  const changed = r.rows.filter((x) => x.status !== "kept" || x.raw.present === null);
  const what = (x: Row) => x.status === "repeat" ? s.repeat : x.status === "aside" ? s.setAside
    : [x.status === "renamed" ? s.renamed(x.name) : "", x.raw.present === null ? s.blankDid[blank] : ""].filter(Boolean).join(l === "ar" ? "، " : "; ");

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setNames(0); setRepeats(false); setBlank("leave"); }}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.names} value={names} options={([0, 1, 2] as NameFix[]).map((v) => [v, s.nameOpts[v]] as const)} onChange={setNames} />
          <p className="lb-note">{s.nameNote}</p>
          <Segmented label={s.repeats} value={repeats ? 1 : 0} options={[[0, s.keep], [1, s.remove]]} onChange={(v) => setRepeats(v === 1)} />
          <Segmented label={s.blank} value={blank} options={(["leave", "absent", "present"] as Blank[]).map((v) => [v, s.blankOpts[v]] as const)} onChange={(v) => { setBlank(v); setBlanks((x) => new Set(x).add(v)); }} />
        </div>
        <div className="stack">
          <Stats items={[
            { label: s.rows, value: num(r.kept) }, { label: s.pupils, value: num(r.pupils.length) }, { label: s.removed, value: num(r.repeats) },
            { label: s.aside, value: num(r.aside) }, { label: s.noAnswer, value: num(r.blank) }, { label: s.rate, value: pct(r.rate) },
          ]} />
          <p className="lb-note">{s.paper(pct(TRUE_RATE))}</p>
          <span className="dr-field-label">{s.list}</span>
          <ul className="lb-names" aria-live="polite">
            {r.pupils.map((p) => <li key={p.name} className={list.includes(p.name) ? "lb-name" : "lb-name is-odd"}><bdi>{visible(p.name)}</bdi> <span className="lb-name-n">{num(p.rows)}</span></li>)}
          </ul>
        </div>
      </div>
      <div className="stack">
        <span className="dr-field-label">{s.log}</span>
        {changed.length === 0 ? <p className="lb-note">{s.nothing}</p> : (
          <div className="lb-scroll lb-tall" role="region" aria-label={s.log} tabIndex={0}>
            <table className="lb-dt">
              <thead><tr><th scope="col">{s.name}</th><th scope="col">{s.day}</th><th scope="col">{s.what}</th></tr></thead>
              <tbody>{changed.map((x, i) => (
                <tr key={i} className={x.status === "repeat" || x.status === "aside" ? "is-gone" : undefined}>
                  <td><bdi>{visible(x.raw.name)}</bdi></td><td>{s.days[x.raw.day - 1]}</td><td>{what(x)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </LabShell>
  );
}
