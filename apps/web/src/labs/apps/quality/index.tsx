import { useEffect, useMemo, useState } from "react";
import { Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { batches, CHECKS, report, run, STATIONS, type Action, type Check } from "./model";

const S = {
  en: {
    intro: "Four school weather clubs send their rain-gauge readings, in mm, every evening. Before a batch reaches the district's rainfall report, the pipeline checks it. Choose the checks, and what happens when one fails.",
    checks: "Checks", check: { range: "In range (0 to 300 mm)", unique: "No repeats (one reading per station a day)", notEmpty: "Nothing empty", allowed: "Known station name" } as Record<Check, string>,
    short: { range: "Range", unique: "Repeats", notEmpty: "Empty", allowed: "Name" } as Record<Check, string>,
    action: "When a check fails", actions: { stop: "Stop the batch", aside: "Set bad rows aside", warn: "Let it through, warn" } as Record<Action, string>,
    board: "This week's batches, and what happened to each", batch: "Batch", off: "off",
    loaded: "Loaded", stopped: "Stopped", asideN: (n: string) => `Loaded (${n} set aside)`, warnedN: (n: string) => `Loaded (${n} warnings)`,
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    received: "Readings sent", inReport: "Readings in the report", stations: "Stations in the report (there are 4)",
    problems: "What the checks found, and what to do", none: "The checks found nothing. That doesn't mean nothing is wrong.",
    station: "Station", mm: "mm", problem: "Problem", noName: "(no name)", empty: "empty", kept: "In the report anyway.",
    advice: { range: "Impossible amount: ask the club to read the gauge again.", unique: "Sent twice: keep one copy.", notEmpty: "Something is missing: ask the sender, don't guess zero.", allowed: "Unknown station: probably a spelling mistake; fix the name with the club." } as Record<Check, string>,
    report: "Rainfall report: each station's average this week (mm)", cols: ["Station", "Readings", "Average", "Really"],
    try1: "Turn every check off: the report shows six stations, and Riverside's average jumps above 200 mm because of one 999.",
    try2: "Turn them all on. With “Stop the batch”, only Monday reaches the report: four days of good readings are lost too. Try “Set bad rows aside”.",
    try3: "With “Set bad rows aside”, turn off only “No repeats”: Hilltop's Wednesday reading counts twice, and its average creeps from 14.6 to 15.8 mm.",
    takeaway: "Checks catch the faults you thought of, each one a different kind. Then you must decide: stopping a whole batch loses good data, setting bad rows aside keeps the rest moving, and letting everything through spoils the report. Send problems back to whoever can fix them.",
  },
  ar: {
    intro: "ترسل أربعة نوادٍ مدرسية للطقس قراءات مقاييس المطر، بالمليمتر، كل مساء. وقبل أن تصل الدفعة إلى تقرير الأمطار في الإدارة، يفحصها خط البيانات. اختر الفحوص، وماذا يحدث حين يفشل أحدها.",
    checks: "الفحوص", check: { range: "ضمن المدى (من ٠ إلى ٣٠٠ مم)", unique: "بلا تكرار (قراءة واحدة لكل محطة في اليوم)", notEmpty: "لا شيء فارغ", allowed: "اسم محطة معروف" },
    short: { range: "المدى", unique: "التكرار", notEmpty: "الفراغ", allowed: "الاسم" },
    action: "حين يفشل فحص", actions: { stop: "أوقف الدفعة", aside: "ضع الصفوف المعيبة جانبًا", warn: "مرّرها مع تحذير" },
    board: "دفعات هذا الأسبوع، وما حدث لكلٍّ منها", batch: "الدفعة", off: "متوقف",
    loaded: "حُمّلت", stopped: "أُوقفت", asideN: (n: string) => `حُمّلت (جانبًا: ${n})`, warnedN: (n: string) => `حُمّلت (تحذيرات: ${n})`,
    days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    received: "القراءات المرسلة", inReport: "القراءات في التقرير", stations: "المحطات في التقرير (هي ٤)",
    problems: "ما وجدته الفحوص، وماذا تفعل", none: "لم تجد الفحوص شيئًا، وهذا لا يعني أن كل شيء سليم.",
    station: "المحطة", mm: "مم", problem: "المشكلة", noName: "(بلا اسم)", empty: "فارغة", kept: "دخلت التقرير رغم ذلك.",
    advice: { range: "كمية مستحيلة: اطلب من النادي قراءة المقياس مرة أخرى.", unique: "أُرسلت مرتين: احتفظ بنسخة واحدة.", notEmpty: "شيء ناقص: اسأل المرسل، ولا تخمّن صفرًا.", allowed: "محطة غير معروفة: غالبًا خطأ إملائي، فصحّح الاسم مع النادي." },
    report: "تقرير الأمطار: متوسط كل محطة هذا الأسبوع (مم)", cols: ["المحطة", "القراءات", "المتوسط", "في الحقيقة"],
    try1: "أوقف كل الفحوص: يعرض التقرير ست محطات، ويقفز متوسط «ضفة النهر» فوق ٢٠٠ مم بسبب قراءة ٩٩٩ واحدة.",
    try2: "شغّلها كلها مرة أخرى. مع «أوقف الدفعة» لا يصل إلى التقرير إلا يوم الأحد: تضيع معه أربعة أيام من القراءات السليمة. جرّب «ضع الصفوف المعيبة جانبًا».",
    try3: "مع «ضع الصفوف المعيبة جانبًا»، أوقف «بلا تكرار» وحده: تُعدّ قراءة «التل» يوم الثلاثاء مرتين، ويزحف متوسطها من ١٤٫٦ إلى ١٥٫٨ مم.",
    takeaway: "تكشف الفحوص الأعطال التي فكّرت فيها، وكل فحص يكشف نوعًا مختلفًا. ثم عليك أن تقرر: إيقاف الدفعة كلها يضيّع بيانات سليمة، ووضع الصفوف المعيبة جانبًا يُبقي الباقي يتحرك، وتمرير كل شيء يفسد التقرير. أعِد المشكلات إلى من يستطيع إصلاحها.",
  },
};

export default function Quality({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const l = lang === "ar" ? "ar" : "en";
  const stations = STATIONS[l];
  const all = useMemo(() => batches(l), [l]);
  const [on, setOn] = useState<ReadonlySet<Check>>(new Set(CHECKS));
  const [action, setAction] = useState<Action>("stop");
  const [tried, setTried] = useState(() => new Set<Action>(["stop"]));
  useEffect(() => { if (tried.size === 3) onDone?.(); }, [tried.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = run(all, stations, on, action);
  const rep = report(r.loaded, stations);
  const toggle = (c: Check) => setOn((x) => { const n = new Set(x); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const one = (v: number | null) => (v === null ? "–" : num(v, { maximumFractionDigits: 1 }));
  const name = (n: string) => (n.trim() ? n : s.noName);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway} onReset={() => { setOn(new Set(CHECKS)); setAction("stop"); }}>
      <div className="lb-two">
        <div className="stack">
          <span className="dr-field-label">{s.checks}</span>
          <div className="lb-fixes" role="group" aria-label={s.checks}>
            {CHECKS.map((c) => <button key={c} type="button" className={on.has(c) ? "lb-fix is-on" : "lb-fix"} aria-pressed={on.has(c)} onClick={() => toggle(c)}><Icon name={on.has(c) ? "check" : "close"} size={18} /><span>{s.check[c]}</span></button>)}
          </div>
        </div>
        <div className="stack">
          <Segmented label={s.action} value={action} options={(["stop", "aside", "warn"] as Action[]).map((a) => [a, s.actions[a]] as const)} onChange={(a) => { setAction(a); setTried((x) => new Set(x).add(a)); }} />
          <Stats items={[{ label: s.received, value: num(r.received) }, { label: s.inReport, value: num(r.loaded.length) }, { label: s.stations, value: num(rep.filter((x) => x.n > 0).length) }]} />
        </div>
      </div>
      <div className="stack">
        <span className="dr-field-label">{s.board}</span>
        <div className="lb-scroll" role="region" aria-label={s.board} tabIndex={0}>
          <table className="lb-dt is-tight">
            <thead><tr><th scope="col">{s.batch}</th>{CHECKS.map((c) => <th key={c} scope="col" className={on.has(c) ? undefined : "is-off"}>{s.short[c]}</th>)}</tr></thead>
            <tbody>{r.board.map((b, d) => (
              <tr key={d}>
                <th scope="row" className={b.outcome === "stopped" ? "is-bad" : undefined}>{s.days[d]}<span className="lb-dt-sub">{b.outcome === "loaded" ? s.loaded : b.outcome === "stopped" ? s.stopped : b.outcome === "aside" ? s.asideN(num(b.bad)) : s.warnedN(num(b.bad))}</span></th>
                {CHECKS.map((c) => <td key={c} className={!on.has(c) ? "is-empty" : b.counts[c] ? "lb-no" : "lb-ok"}>{!on.has(c) ? <span className="lb-dt-null" title={s.off} aria-label={s.off}>–</span> : b.counts[c] ? <><Icon name="cross" size={14} /> {num(b.counts[c])}</> : <Icon name="check" size={14} />}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="stack">
        <span className="dr-field-label">{s.problems}</span>
        {r.problems.length === 0 ? <p className="lb-note">{s.none}</p> : (
          <div className="lb-scroll" role="region" aria-label={s.problems} tabIndex={0}>
            <table className="lb-dt">
              <thead><tr><th scope="col">{s.batch}</th><th scope="col">{s.station}</th><th scope="col">{s.mm}</th><th scope="col">{s.problem}</th></tr></thead>
              <tbody>{r.problems.map((p, i) => (
                <tr key={i}>
                  <td>{s.days[p.r.day]}</td><td>{name(p.r.station)}</td><td>{p.r.mm === null ? <span className="lb-dt-null">{s.empty}</span> : num(p.r.mm)}</td>
                  <td><strong>{p.checks.map((c) => s.short[c]).join(l === "ar" ? "، " : ", ")}:</strong> {s.advice[p.checks[0]]}{p.kept ? ` ${s.kept}` : ""}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="stack">
        <span className="dr-field-label">{s.report}</span>
        <div className="lb-scroll" role="region" aria-label={s.report} tabIndex={0}>
          <table className="lb-dt" aria-live="polite">
            <thead><tr>{s.cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>{rep.map((x) => (
              <tr key={x.name} className={x.truth === null || x.avg === null || Math.abs(x.avg - x.truth) > 1 ? "is-bad" : undefined}>
                <td>{name(x.name)}</td><td>{num(x.n)}</td><td>{one(x.avg)}</td><td>{one(x.truth)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </LabShell>
  );
}
