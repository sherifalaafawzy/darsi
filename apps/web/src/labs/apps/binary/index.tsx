import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Slider, Stats } from "../../kit/controls";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { ascii, byteCount, fromBits, hex, PLACES, toBits, utf8, values } from "./model";

const S = {
  en: {
    intro: "Inside every device, information is switches that are on (1) or off (0): bits. Each switch is worth double the one to its right. Eight bits make a byte.",
    byte: "One byte: tap the switches", value: "Number", hexL: "Hexadecimal", char: "As a letter", none: "—",
    target: (n: string) => `Challenge: make ${n}.`, got: "You made it!",
    bits: "How many bits", count: (b: string, v: string, nb: number) => `${nb === 1 ? "1 bit" : `${b} bits`} can count ${v} different values.`,
    text: "Your text", bytesOf: (chars: string, bytes: string) => `${chars} ${bytes}.`,
    charsTake: { one: "1 character takes", other: "{n} characters take" } as Forms, bytesN: { one: "1 byte", other: "{n} bytes" } as Forms,
    try1: "Make 65 (switch on 64 and 1): “As a letter” shows A, because text is stored as numbers too.",
    try2: "Type your name in “Your text” in English, then in Arabic: each English letter takes 1 byte, each Arabic letter 2.",
    try3: "Move “How many bits” from 8 to 9: one more bit doubles the count, from 256 to 512 values.",
    arabicNote: "In UTF-8, the world's usual code for text, an English letter takes 1 byte and an Arabic letter 2. A text message in Arabic uses about twice the data.",
    sizes: "How big things are", sizeRows: [["A text message", "about 100 bytes"], ["A page of a book", "about 2 KB (2,000 bytes)"], ["A phone photo", "about 3 MB (3 million bytes)"], ["A 10-minute lesson video", "about 50 MB"]],
    takeaway: "Bits are how every sensor reading, photo, message and lesson is stored and sent. Knowing how many bits something needs tells you how much memory, data and battery it will cost, which matters a lot on cheap phones and IoT devices.",
  },
  ar: {
    intro: "داخل كل جهاز، المعلومات مفاتيح إما مشغّلة (١) أو مطفأة (٠): وهي البتات. وكل مفتاح يساوي ضعف المفتاح الذي على يمينه. وثمانية بتات تكوّن بايتًا.",
    byte: "بايت واحد: المس المفاتيح", value: "الرقم", hexL: "النظام الست عشري", char: "في صورة حرف", none: "—",
    target: (n: string) => `التحدي: كوّن ${n}.`, got: "نجحت!",
    bits: "عدد البتات", count: (b: string, v: string, nb: number) => (nb === 1 ? "ببت واحد يمكن تمثيل قيمتين مختلفتين." : `باستعمال ${b} من البتات يمكن تمثيل ${v} من القيم المختلفة.`),
    text: "نصّك", bytesOf: (chars: string, bytes: string) => `${chars} ${bytes}.`,
    charsTake: { zero: "النص الفارغ يشغل", one: "حرف واحد يشغل", two: "حرفان يشغلان", few: "{n} أحرف تشغل", many: "{n} حرفًا تشغل", other: "{n} حرف تشغل" } as Forms,
    bytesN: { zero: "{n} بايت", one: "بايتًا واحدًا", two: "بايتين", few: "{n} بايتات", many: "{n} بايتًا", other: "{n} بايت" } as Forms,
    try1: "كوّن ٦٥ (شغّل ٦٤ و١): يظهر في «في صورة حرف» الحرف A، لأن النص يُخزَّن أرقامًا أيضًا.",
    try2: "اكتب اسمك في «نصّك» بالإنجليزية ثم بالعربية: يشغل كل حرف إنجليزي بايتًا واحدًا، وكل حرف عربي بايتين.",
    try3: "حرّك «عدد البتات» من ٨ إلى ٩: بت واحد إضافي يضاعف عدد القيم، من ٢٥٦ إلى ٥١٢.",
    arabicNote: "في ترميز UTF-8، وهو الترميز المعتاد للنصوص في العالم، يشغل الحرف الإنجليزي بايتًا واحدًا والحرف العربي بايتين. فالرسالة النصية بالعربية تستهلك نحو ضعف البيانات.",
    sizes: "أحجام الأشياء", sizeRows: [["رسالة نصية", "نحو ١٠٠ بايت"], ["صفحة من كتاب", "نحو ٢ كيلوبايت (٢٠٠٠ بايت)"], ["صورة هاتف", "نحو ٣ ميغابايت (٣ ملايين بايت)"], ["فيديو درس مدته ١٠ دقائق", "نحو ٥٠ ميغابايت"]],
    takeaway: "بالبتات تُخزَّن وتُرسَل كل قراءة مستشعر وصورة ورسالة ودرس. ومعرفة عدد البتات التي يحتاج إليها شيء ما تخبرك بكلفته من الذاكرة والبيانات والبطارية، وهذا مهم جدًا في الهواتف الرخيصة وأجهزة إنترنت الأشياء.",
  },
};
const TARGETS = [5, 12, 65, 100, 200, 255];

export default function Binary({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { lang, num } = useI18n();
  const count = usePlural();
  const [bits, setBits] = useState<number[]>(() => toBits(0));
  const [goal, setGoal] = useState(0);
  const [nb, setNb] = useState(8);
  const [text, setText] = useState(lang === "ar" ? "درسي Darsi" : "Darsi درسي");
  const n = fromBits(bits), won = n === TARGETS[goal];
  useEffect(() => { if (won) { const t = setTimeout(() => setGoal((g) => Math.min(TARGETS.length - 1, g + 1)), 900); return () => clearTimeout(t); } }, [won]);
  useEffect(() => { if (goal >= 3) onDone?.(); }, [goal >= 3]); // eslint-disable-line react-hooks/exhaustive-deps
  const chars = utf8(text);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <span className="dr-field-label">{s.byte}</span>
      <div className="lb-bits" dir="ltr">
        {bits.map((b, i) => (
          <button key={i} type="button" className={b ? "lb-bit is-on" : "lb-bit"} aria-pressed={!!b} aria-label={`${num(PLACES[i])}: ${num(b)}`} onClick={() => setBits((x) => x.map((y, j) => (j === i ? 1 - y : y)))}>
            <strong>{num(b)}</strong><small>{num(PLACES[i])}</small>
          </button>
        ))}
      </div>
      <p className="lb-verdict" aria-live="polite">{won ? s.got : s.target(num(TARGETS[goal]))}</p>
      <Stats items={[{ label: s.value, value: num(n) }, { label: s.hexL, value: hex(n) }, { label: s.char, value: ascii(n) ?? s.none }]} />
      <Slider label={s.bits} value={nb} min={1} max={32} onChange={setNb} format={(v) => num(v)} />
      <p className="lb-note">{s.count(num(nb), num(values(nb)), nb)}</p>
      <div className="lb-two">
        <div className="stack">
          <label className="dr-field-label" htmlFor="lb-bin-text">{s.text}</label>
          <input id="lb-bin-text" className="dr-field-input" dir="auto" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
          <div className="lb-chips is-compact">
            {chars.map((c, i) => (
              <span key={i} className="lb-tok"><span dir="auto">{c.ch === " " ? "␣" : c.ch}</span><small dir="ltr">{c.bytes.map(hex).join(" ")}</small></span>
            ))}
          </div>
          <p className="lb-note">{s.bytesOf(count(chars.length, s.charsTake), count(byteCount(text), s.bytesN))}</p>
          <p className="lb-note">{s.arabicNote}</p>
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.sizes}</span>
          <table className="lb-table"><tbody>{s.sizeRows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        </div>
      </div>
    </LabShell>
  );
}
