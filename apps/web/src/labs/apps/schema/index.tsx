import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { cells, hurriedUpdate, leave, phoneCells, phonesFor, repeats, tables, type Col, type Facts, type Step, type Table, type TableId } from "./model";

const S = {
  en: {
    intro: "The school office keeps pupils, their classes, each class teacher's phone number and the term's marks. Stored as one wide table, the same facts are typed again and again. Split it into tables that each hold one kind of fact, linked by keys.",
    facts: { names: ["Amina", "Tunde", "Chidi", "Fatima", "Kofi", "Grace"], classes: ["6A", "6B"], teachers: ["Mrs Okafor", "Mr Bello"], subjects: ["maths", "science"] } as Facts,
    design: "Design", steps: ["One table", "Two tables", "Three tables"],
    table: { sheet: "Everything", pupils: "Pupils", classes: "Classes", marks: "Marks" } as Record<TableId, string>,
    col: { pupil_id: "Pupil no.", name: "Name", class: "Class", teacher: "Teacher", phone: "Teacher's phone", subject: "Subject", mark: "Mark" } as Record<Col, string>,
    key: "key", link: "link", linkTo: (t: string) => `Points to a row in ${t}`, rows: (n: string) => `${n} rows`,
    nTables: "Tables", nCells: "Cells stored", nRepeats: "Repeated facts", nPhone: (t: string) => `Cells holding ${t}'s phone`,
    tryOut: "Try a change", update: (t: string) => `Change ${t}'s phone, first row only`, leave: (c: string) => `${c}'s pupils leave`,
    two: (t: string) => `The data now gives two different numbers for ${t}. Which one is right?`,
    one: (t: string) => `${t} still has one number: it's stored once, so the change reached everywhere.`,
    lost: (t: string) => `${t}'s phone number left with the pupils: no row holds it any more.`,
    kept: (t: string) => `${t} and the phone number stay in the classes table, ready for next year's pupils.`,
    insertBad: "A new class with no pupils yet can't be stored without a pupil row full of empty cells.",
    insertGood: "A new class with no pupils yet is one new row in the classes table.",
    try1: "With one table, tap “Change Mrs Okafor's phone, first row only”: the other 5 rows keep the old number, so the data now gives two numbers for her.",
    try2: "Choose two tables, then three: repeated facts fall from 32 to 8 to 0, and the same hurried change can't go wrong, because her number is stored once.",
    try3: "Tap “6B's pupils leave”: with one or two tables, Mr Bello's phone number disappears with them; with a classes table it stays.",
    takeaway: "Normalising stores each fact once, in a table with a key, and links tables by those keys. Repeats waste space, but worse, copies can disagree, and deleting one thing can delete another. Joins put the pieces back together when you ask a question.",
  },
  ar: {
    intro: "يحفظ مكتب المدرسة التلاميذ وفصولهم ورقم هاتف معلّم كل فصل ودرجات الفصل الدراسي. وحين تُخزَّن في جدول واحد عريض تُكتب المعلومات نفسها مرة بعد مرة. قسّمه إلى جداول يحمل كلٌّ منها نوعًا واحدًا من المعلومات، وتربطها المفاتيح.",
    facts: { names: ["أمينة", "عمر", "ليلى", "فاطمة", "يوسف", "مريم"], classes: ["٦أ", "٦ب"], teachers: ["الأستاذة هدى", "الأستاذ سامي"], subjects: ["رياضيات", "علوم"] } as Facts,
    design: "التصميم", steps: ["جدول واحد", "جدولان", "ثلاثة جداول"],
    table: { sheet: "كل شيء", pupils: "التلاميذ", classes: "الفصول", marks: "الدرجات" },
    col: { pupil_id: "رقم التلميذ", name: "الاسم", class: "الفصل", teacher: "المعلّم", phone: "هاتف المعلّم", subject: "المادة", mark: "الدرجة" },
    key: "مفتاح", link: "رابط", linkTo: (t: string) => `يشير إلى صف في ${t}`, rows: (n: string) => `الصفوف: ${n}`,
    nTables: "الجداول", nCells: "الخانات المخزَّنة", nRepeats: "المعلومات المكررة", nPhone: (t: string) => `خانات هاتف ${t}`,
    tryOut: "جرّب تغييرًا", update: (t: string) => `غيّر هاتف ${t} في الصف الأول فقط`, leave: (c: string) => `غادر تلاميذ ${c}`,
    two: (t: string) => `صار في البيانات رقمان مختلفان لهاتف ${t}. فأيهما الصحيح؟`,
    one: (t: string) => `ما زال لهاتف ${t} رقم واحد: فهو مخزَّن مرة واحدة، فوصل التغيير إلى كل مكان.`,
    lost: (t: string) => `غادر رقم هاتف ${t} مع التلاميذ: لم يعد أي صف يحمله.`,
    kept: (t: string) => `يبقى ${t} ورقم هاتفه في جدول الفصول، جاهزين لتلاميذ العام القادم.`,
    insertBad: "لا يمكن تخزين فصل جديد ليس فيه تلاميذ بعد إلا بصف تلميذ مليء بالخانات الفارغة.",
    insertGood: "الفصل الجديد الذي ليس فيه تلاميذ بعد هو صف واحد جديد في جدول الفصول.",
    try1: "مع جدول واحد، المس «غيّر هاتف الأستاذة هدى في الصف الأول فقط»: تبقى الصفوف الخمسة الأخرى بالرقم القديم، فتعطي البيانات الآن رقمين لها.",
    try2: "اختر جدولين ثم ثلاثة: تنخفض المعلومات المكررة من ٣٢ إلى ٨ ثم إلى ٠، ولا يعود التغيير المتعجّل نفسه يُخطئ، لأن رقمها مخزَّن مرة واحدة.",
    try3: "المس «غادر تلاميذ ٦ب»: مع جدول أو جدولين يختفي رقم هاتف الأستاذ سامي معهم، ومع جدول للفصول يبقى.",
    takeaway: "التطبيع يخزّن كل معلومة مرة واحدة، في جدول له مفتاح، ويربط الجداول بتلك المفاتيح. التكرار يهدر المساحة، والأسوأ أن النسخ قد تختلف، وأن حذف شيء قد يحذف شيئًا آخر. والربط (JOIN) يعيد جمع القطع حين تطرح سؤالًا.",
  },
};

export default function Schema({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const f = s.facts;
  const [step, setStep] = useState<Step>(1);
  const [upd, setUpd] = useState(false);
  const [gone, setGone] = useState(false);
  const [seen, setSeen] = useState({ three: false, upd: false, gone: false });
  useEffect(() => { if (seen.three && seen.upd && seen.gone) onDone?.(); }, [seen.three && seen.upd && seen.gone]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = tables(step, f);
  let ts = base;
  if (upd) ts = hurriedUpdate(ts, f);
  if (gone) ts = leave(ts, f);
  const phones = phonesFor(ts, f, 0), left = phonesFor(ts, f, 1);
  const show = (c: Col, v: unknown) => (c === "phone" ? <span dir="ltr">{String(v)}</span> : typeof v === "number" ? num(v) : String(v));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setStep(1); setUpd(false); setGone(false); }}>
      <Segmented label={s.design} value={step} options={([1, 2, 3] as Step[]).map((v) => [v, s.steps[v - 1]] as const)} onChange={(v) => { setStep(v); if (v === 3) setSeen((x) => ({ ...x, three: true })); }} />
      <Stats items={[{ label: s.nTables, value: num(base.length) }, { label: s.nCells, value: num(cells(base)) }, { label: s.nRepeats, value: num(repeats(base)) }, { label: s.nPhone(f.teachers[0]), value: num(phoneCells(base, f)) }]} />
      <div className="lb-panel">
        <strong>{s.tryOut}</strong>
        <div className="lb-fixes">
          <button type="button" className={upd ? "lb-fix is-on" : "lb-fix"} aria-pressed={upd} onClick={() => { setUpd(!upd); setSeen((x) => ({ ...x, upd: true })); }}><Icon name="edit" size={18} /><span>{s.update(f.teachers[0])}</span></button>
          <button type="button" className={gone ? "lb-fix is-on" : "lb-fix"} aria-pressed={gone} onClick={() => { setGone(!gone); setSeen((x) => ({ ...x, gone: true })); }}><Icon name="close" size={18} /><span>{s.leave(f.classes[1])}</span></button>
        </div>
        <ul className="lb-qs" aria-live="polite">
          {upd && <li className="lb-q lb-q-row"><span className={phones.length > 1 ? "lb-no" : "lb-ok"}><Icon name={phones.length > 1 ? "cross" : "check"} size={16} /></span><span>{phones.length > 1 ? s.two(f.teachers[0]) : s.one(f.teachers[0])}</span></li>}
          {gone && <li className="lb-q lb-q-row"><span className={left.length ? "lb-ok" : "lb-no"}><Icon name={left.length ? "check" : "cross"} size={16} /></span><span>{left.length ? s.kept(f.teachers[1]) : s.lost(f.teachers[1])}</span></li>}
          <li className="lb-q lb-q-row"><span className={step === 3 ? "lb-ok" : "lb-no"}><Icon name={step === 3 ? "check" : "cross"} size={16} /></span><span>{step === 3 ? s.insertGood : s.insertBad}</span></li>
        </ul>
      </div>
      <div className="lb-schema">
        {ts.map((t) => <TableView key={t.id} t={t} s={s} show={show} rows={s.rows(num(t.rows.filter((r) => !r.gone).length))} />)}
      </div>
    </LabShell>
  );
}

function TableView({ t, s, show, rows }: { t: Table; s: (typeof S)["en"]; show: (c: Col, v: unknown) => ReactNode; rows: string }) {
  return (
    <div className="stack">
      <span className="dr-field-label">{s.table[t.id]} <span className="lb-note">({rows})</span></span>
      <div className="lb-scroll" role="region" aria-label={s.table[t.id]} tabIndex={0}>
        <table className="lb-dt is-wide">
          <thead><tr>{t.cols.map((c) => (
            <th key={c} scope="col">{s.col[c]}
              {t.key.includes(c) && <span className="lb-type is-key">{s.key}</span>}
              {t.links[c] && <span className="lb-type is-link" title={s.linkTo(s.table[t.links[c]!])}>{s.link}</span>}
            </th>
          ))}</tr></thead>
          <tbody>{t.rows.map((r, i) => (
            <tr key={i} className={r.gone ? "is-gone" : undefined}>
              {t.cols.map((c) => <td key={c} className={r.changed === c ? "is-new" : undefined}>{show(c, r.cells[c])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
