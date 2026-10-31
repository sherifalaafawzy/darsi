import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { bytes, FORMATS, gzipBytes, NETS, records, seconds, SIZES, write, type Format, type Net, type Size } from "./model";

const S = {
  en: {
    intro: "A school sends its attendance to the district office: for every pupil and every school day, the date, the class, the pupil's number and whether they came. The facts never change; only the way they're written does.",
    data: "How much data", size: { class: "One class, a month", school: "A school, a month", term: "A school, a term" } as Record<Size, string>,
    format: "Format", fmt: { csv: "CSV", json: "JSON", cols: "Columns" } as Record<Format, string>,
    zip: "Compress it (gzip)", no: "No", yes: "Yes", net: "Network",
    records: (n: string) => `${n} records`, sizeIs: "File size", timeIs: (net: string) => `Download on ${net}`,
    kb: (n: string) => `${n} KB`, mb: (n: string) => `${n} MB`, under: "under a second",
    measuring: "Measuring…", noZip: "This browser can't compress here; most phones can.",
    all: "All six ways, side by side", zipped: (f: string) => `${f}, compressed`,
    preview: "The start of the file", speeds: (a: string, b: string, c: string) => `Typical speeds on a busy network: 2G about ${a} kbit/s, 3G about ${b} Mbit/s, 4G about ${c} Mbit/s.`,
    how: { csv: "CSV: the column names once, then one line per record.", json: "JSON: every record repeats every column's name.", cols: "Columns: each column stored together; a value repeated in a row is written once with its count." } as Record<Format, string>,
    try1: "Choose “A school, a term” and 2G: as JSON it takes nearly 5 minutes to download. Turn on compression: about 13 seconds.",
    try2: "Compare CSV and JSON in the preview: JSON repeats the column names in every record, so it's more than twice the size for the same facts.",
    try3: "Choose Columns: a date repeated for 420 pupils is written once with its count. Compressed, a whole term fits in about 6 KB.",
    takeaway: "The same facts can cost very different amounts of data. Repeated labels (JSON) cost the most; compression and storing by column squeeze out the repeats. Where data is paid for by the megabyte, choosing the format is choosing the price.",
  },
  ar: {
    intro: "ترسل مدرسة حضورها إلى إدارة التعليم: لكل تلميذ في كل يوم دراسي التاريخ والفصل ورقم التلميذ وهل حضر. الحقائق لا تتغير، وإنما تتغير طريقة كتابتها فقط.",
    data: "كم من البيانات", size: { class: "فصل واحد، شهر", school: "مدرسة، شهر", term: "مدرسة، فصل دراسي" },
    format: "الصيغة", fmt: { csv: "CSV", json: "JSON", cols: "أعمدة" },
    zip: "اضغطه (gzip)", no: "لا", yes: "نعم", net: "الشبكة",
    records: (n: string) => `${n} سجلّ`, sizeIs: "حجم الملف", timeIs: (net: string) => `التنزيل على ${net}`,
    kb: (n: string) => `${n} كيلوبايت`, mb: (n: string) => `${n} ميغابايت`, under: "أقل من ثانية",
    measuring: "جارٍ القياس…", noZip: "لا يستطيع هذا المتصفح الضغط هنا، ومعظم الهواتف تستطيع.",
    all: "الطرق الست جنبًا إلى جنب", zipped: (f: string) => `${f} (مضغوطة)`,
    preview: "بداية الملف", speeds: (a: string, b: string, c: string) => `سرعات معتادة على شبكة مزدحمة: الجيل الثاني (2G) نحو ${a} كيلوبت في الثانية، والثالث (3G) نحو ${b} ميغابت، والرابع (4G) نحو ${c} ميغابت.`,
    how: { csv: "CSV: أسماء الأعمدة مرة واحدة، ثم سطر لكل سجلّ.", json: "JSON: كل سجلّ يكرر اسم كل عمود.", cols: "الأعمدة: يُخزَّن كل عمود معًا، والقيمة المكررة متتالية تُكتب مرة واحدة مع عددها." },
    try1: "اختر «مدرسة، فصل دراسي» وشبكة الجيل الثاني: بصيغة JSON يستغرق التنزيل قرابة ٥ دقائق. شغّل الضغط: نحو ١٣ ثانية.",
    try2: "قارن CSV وJSON في المعاينة: يكرر JSON أسماء الأعمدة في كل سجلّ، فيصير أكبر من الضعف للحقائق نفسها.",
    try3: "اختر «أعمدة»: التاريخ المكرر لـ٤٢٠ تلميذًا يُكتب مرة واحدة مع عدده. ومضغوطًا يتسع فصل دراسي كامل في نحو ٦ كيلوبايت.",
    takeaway: "قد تكلّف الحقائق نفسها كميات مختلفة جدًّا من البيانات. الأسماء المكررة (JSON) هي الأغلى، والضغط والتخزين بالأعمدة يعصران التكرار. وحيث تُدفع البيانات بالميغابايت، فاختيار الصيغة هو اختيار السعر.",
  },
};

interface Measured { size: Size; n: number; raw: Record<Format, number>; gz: Record<Format, number | null>; head: Record<Format, string> }

/** The first few lines of a file, each cut short, for the preview. */
const head = (f: Format, text: string) => (f === "json" ? `${text.slice(0, 280)}…` : text.split("\n").slice(0, f === "csv" ? 5 : 4).map((l) => (l.length > 72 ? `${l.slice(0, 72)}…` : l)).join("\n") + (f === "csv" ? "\n…" : ""));

export default function Formats({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [size, setSize] = useState<Size>("school");
  const [fmt, setFmt] = useState<Format>("csv");
  const [zip, setZip] = useState(false);
  const [net, setNet] = useState<Net>("2g");
  const [m, setM] = useState<Measured | null>(null);
  const [seen, setSeen] = useState(() => new Set<Format>(["csv"]));
  const [zipped, setZipped] = useState(false);
  useEffect(() => { if (seen.size === FORMATS.length && zipped) onDone?.(); }, [seen.size === FORMATS.length && zipped]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const rs = records(size);
    const texts = Object.fromEntries(FORMATS.map((f) => [f, write(f, rs)])) as Record<Format, string>;
    const raw = Object.fromEntries(FORMATS.map((f) => [f, bytes(texts[f])])) as Record<Format, number>;
    const hd = Object.fromEntries(FORMATS.map((f) => [f, head(f, texts[f])])) as Record<Format, string>;
    Promise.all(FORMATS.map((f) => gzipBytes(texts[f]))).then((g) => {
      if (alive) setM({ size, n: rs.length, raw, gz: Object.fromEntries(FORMATS.map((f, i) => [f, g[i]])) as Record<Format, number | null>, head: hd });
    });
    return () => { alive = false; };
  }, [size]);

  const sz = (b: number) => (b < 1000 * 1024 ? s.kb(num(b / 1024, { maximumFractionDigits: b < 10 * 1024 ? 1 : 0 })) : s.mb(num(b / 1048576, { maximumFractionDigits: 1 })));
  const time = (sec: number) => (sec < 1 ? s.under : sec < 90 ? num(Math.round(sec), { style: "unit", unit: "second", unitDisplay: "long" }) : num(sec / 60, { style: "unit", unit: "minute", unitDisplay: "long", maximumFractionDigits: 1 }));
  const ready = m && m.size === size ? m : null;
  const chosen = ready ? (zip ? ready.gz[fmt] : ready.raw[fmt]) : null;
  const ways = ready ? FORMATS.flatMap((f) => [{ f, z: false, b: ready.raw[f] }, { f, z: true, b: ready.gz[f] }]) : [];
  const max = Math.max(1, ...ways.map((w) => w.b ?? 0));

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.data} value={size} options={(Object.keys(SIZES) as Size[]).map((k) => [k, s.size[k]] as const)} onChange={setSize} />
          <Segmented label={s.format} value={fmt} options={FORMATS.map((f) => [f, s.fmt[f]] as const)} onChange={(f) => { setFmt(f); setSeen((x) => new Set(x).add(f)); }} />
          <Segmented label={s.zip} value={zip ? 1 : 0} options={[[0, s.no], [1, s.yes]]} onChange={(v) => { setZip(v === 1); if (v === 1) setZipped(true); }} />
          <Segmented label={s.net} value={net} options={(Object.keys(NETS) as Net[]).map((k) => [k, k.toUpperCase()] as const)} onChange={setNet} />
          <p className="lb-note">{s.speeds(num(NETS["2g"] / 1000), num(NETS["3g"] / 1e6), num(NETS["4g"] / 1e6))}</p>
        </div>
        <div className="stack">
          <div className="lb-panel" aria-live="polite">
            {!ready ? <p className="lb-note">{s.measuring}</p> : chosen === null ? <p className="lb-note">{s.noZip}</p> : (
              <dl className="lb-fmt-result">
                <div><dt>{s.sizeIs}</dt><dd className="lb-big">{sz(chosen)}</dd></div>
                <div><dt>{s.timeIs(net.toUpperCase())}</dt><dd className="lb-big">{time(seconds(chosen, net))}</dd></div>
              </dl>
            )}
            {ready && <p className="lb-note">{s.records(num(ready.n))}. {s.how[fmt]}</p>}
          </div>
          {ready && (
            <div className="stack">
              <span className="dr-field-label">{s.all}</span>
              <ul className="lb-sizes">
                {ways.map((w) => (
                  <li key={`${w.f}${w.z}`} className={w.f === fmt && w.z === zip ? "lb-size is-on" : "lb-size"}>
                    <span>{w.z ? s.zipped(s.fmt[w.f]) : s.fmt[w.f]}</span>
                    <span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${w.b === null ? 0 : Math.max(1, (w.b / max) * 100)}%` }} /></span>
                    <span>{w.b === null ? "–" : sz(w.b)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {ready && (
        <div className="stack">
          <span className="dr-field-label">{s.preview}: {s.fmt[fmt]}</span>
          <pre className="lb-pre" dir="ltr" tabIndex={0}>{ready.head[fmt]}</pre>
        </div>
      )}
    </LabShell>
  );
}
