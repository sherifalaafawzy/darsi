import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { BATTERIES, budget, INTERVALS, lifeDays, perDay, RADIOS, tooWeak, type Battery, type Radio } from "./model";

const S = {
  en: {
    intro: "A soil sensor in a far field runs on batteries. It sleeps, wakes to measure, and switches its radio on to report. Sending costs far more than anything else, so how often it reports decides how long it lives.",
    radio: "Radio", wifi: "Wi-Fi", lora: "LoRa (long range)", ble: "Bluetooth LE", battery: "Battery", coin: "Coin cell", aa: "2 AA batteries", bank: "Power bank",
    every: "Report every", when: ["10 seconds", "30 seconds", "1 minute", "5 minutes", "15 minutes", "1 hour", "6 hours"], short: ["10 s", "30 s", "1 min", "5 min", "15 min", "1 h", "6 h"],
    life: "Battery lasts", days: { one: "{n} day", other: "{n} days" } as Forms, years: { one: "{n} year", other: "{n} years" } as Forms, avg: "Average current", ma: (n: string) => `${n} mA`, reports: "Reports a day",
    split: "Where the energy goes", sleep: "Sleeping", sense: "Measuring", send: "Sending", leak: "Leaking on its own",
    weak: (mA: string) => `A coin cell can only give about 20 mA at a time, and this radio needs ${mA} mA to send: a real sensor would keep restarting. Coin cells suit Bluetooth LE.`,
    try1: "Move “Report every” from 1 minute to 1 hour: the same battery lasts about 50 times longer, from under a month to over 3 years.",
    try2: "Back at 1 minute, switch Wi-Fi to Bluetooth LE: the same reports cost so little that the battery lasts years instead of weeks.",
    try3: "Pick the power bank and report every 6 hours: four times the charge of two AAs, yet it runs out sooner. “Where the energy goes” shows why: it leaks on its own.",
    chart: "Battery life (days) for each report interval, with this radio and battery; the ring is your choice", axisX: "report interval", axisY: "days (each line ×10)",
    radioNote: { wifi: "Wi-Fi is fast but power-hungry: connecting takes seconds at high current.", lora: "LoRa sends small messages kilometres away at low power: made for farms and towns.", ble: "Bluetooth LE sips power, but only reaches a phone or gateway nearby." } as Record<Radio, string>,
    takeaway: "In IoT, the radio is the battery's biggest enemy. Send less often, send less data, and choose a low-power radio, and a sensor can run for years on two AA batteries. Ask: how fresh does this data really need to be?",
  },
  ar: {
    intro: "مستشعر للتربة في حقل بعيد يعمل بالبطاريات. ينام، ويستيقظ ليقيس، ويشغّل جهاز الإرسال ليرسل تقريره. والإرسال أغلى بكثير من أي شيء آخر، لذلك يحدّد تكرار التقارير عمره.",
    radio: "جهاز الإرسال", wifi: "واي فاي", lora: "LoRa (بعيد المدى)", ble: "بلوتوث منخفض الطاقة", battery: "البطارية", coin: "بطارية زر", aa: "بطاريتا AA", bank: "بطارية متنقلة",
    every: "أرسل تقريرًا كل", when: ["١٠ ثوانٍ", "٣٠ ثانية", "دقيقة", "٥ دقائق", "١٥ دقيقة", "ساعة", "٦ ساعات"], short: ["١٠ ث", "٣٠ ث", "١ د", "٥ د", "١٥ د", "١ س", "٦ س"],
    life: "تدوم البطارية", days: { one: "يومًا واحدًا", two: "يومين", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" } as Forms, years: { one: "سنة واحدة", two: "سنتين", few: "{n} سنوات", many: "{n} سنة", other: "{n} سنة" } as Forms, avg: "متوسط التيار", ma: (n: string) => `${n} ملي أمبير`, reports: "التقارير في اليوم",
    split: "أين تذهب الطاقة", sleep: "النوم", sense: "القياس", send: "الإرسال", leak: "التفريغ الذاتي",
    weak: (mA: string) => `لا تعطي بطارية الزر إلا نحو ٢٠ ملي أمبير في المرة الواحدة، وهذا الجهاز يحتاج إلى ${mA} ملي أمبير ليرسل، فسيظل المستشعر الحقيقي يعيد التشغيل. بطاريات الزر تناسب البلوتوث منخفض الطاقة.`,
    try1: "حرّك «أرسل تقريرًا كل» من دقيقة إلى ساعة: تدوم البطارية نفسها نحو ٥٠ ضعفًا، من أقل من شهر إلى أكثر من ٣ سنوات.",
    try2: "عُد إلى دقيقة، وبدّل الواي فاي بالبلوتوث منخفض الطاقة: التقارير نفسها تكلّف قليلًا جدًا، فتدوم البطارية سنوات بدل أسابيع.",
    try3: "اختر البطارية المتنقلة وأرسل كل ٦ ساعات: شحنتها أربعة أضعاف بطاريتي AA، لكنها تنفد أسرع. ويبيّن «أين تذهب الطاقة» السبب: إنها تفقد شحنتها من تلقاء نفسها.",
    chart: "عمر البطارية (بالأيام) لكل فترة إرسال، بهذا الجهاز وهذه البطارية؛ والحلقة اختيارك", axisX: "فترة الإرسال", axisY: "الأيام (كل خط ×١٠)",
    radioNote: { wifi: "الواي فاي سريع لكنه شره للطاقة: الاتصال يستغرق ثواني بتيار عالٍ.", lora: "يرسل LoRa رسائل صغيرة إلى مسافة كيلومترات بطاقة منخفضة: صُمّم للمزارع والبلدات.", ble: "البلوتوث منخفض الطاقة يرتشف الطاقة، لكنه لا يصل إلا إلى هاتف أو بوابة قريبة." } as Record<Radio, string>,
    takeaway: "في إنترنت الأشياء، جهاز الإرسال أكبر أعداء البطارية. أرسل أقل، وبيانات أقل، واختر جهازًا منخفض الطاقة، فيعمل المستشعر سنوات على بطاريتي AA. واسأل: ما مدى حداثة البيانات التي نحتاج إليها فعلًا؟",
  },
};

export default function BatteryLab({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [radio, setRadio] = useState<Radio>("wifi");
  const [bat, setBat] = useState<Battery>("aa");
  const [i, setI] = useState(2);
  const [moves, setMoves] = useState(0);
  const b = budget(INTERVALS[i], radio, bat), days = lifeDays(BATTERIES[bat], b.total);
  const touch = () => setMoves((m) => m + 1);
  useEffect(() => { if (moves >= 4) onDone?.(); }, [moves >= 4]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v: number) => num(v / b.total, { style: "percent" });
  const life = days >= 365 ? count(Math.round((days / 365) * 10) / 10, s.years) : count(days >= 10 ? Math.round(days) : Math.round(days * 10) / 10, s.days);
  const curve = INTERVALS.map((sec, k) => [k, Math.log10(lifeDays(BATTERIES[bat], budget(sec, radio, bat).total))] as const);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.radio} value={radio} options={(Object.keys(RADIOS) as Radio[]).map((r) => [r, s[r]] as const)} onChange={(v) => { setRadio(v); touch(); }} />
          <p className="lb-note">{s.radioNote[radio]}</p>
          <Segmented label={s.battery} value={bat} options={(Object.keys(BATTERIES) as Battery[]).map((k) => [k, s[k]] as const)} onChange={(v) => { setBat(v); touch(); }} />
          <Slider label={s.every} value={i} min={0} max={INTERVALS.length - 1} onChange={(v) => { setI(v); touch(); }} format={(v) => s.when[v]} />
          <p className="lb-verdict" aria-live="polite">{s.life}: {life}</p>
          {tooWeak(bat, radio) && <p className="lb-verdict is-warn">{s.weak(num(RADIOS[radio].mA))}</p>}
          <Stats items={[{ label: s.avg, value: s.ma(num(Math.round(b.total * 1000) / 1000)) }, { label: s.reports, value: num(perDay(INTERVALS[i])) }]} />
        </div>
        <div className="stack">
          <span className="dr-field-label">{s.split}</span>
          <ul className="lb-bars">
            {(["sleep", "sense", "send", "leak"] as const).map((k) => <li key={k} className="lb-bar"><span>{s[k]}</span><span className="lb-bar-track"><span className="lb-bar-fill" style={{ inlineSize: `${Math.round((b[k] / b.total) * 100)}%` }} /></span><span>{pct(b[k])}</span></li>)}
          </ul>
          <Plot x={[0, INTERVALS.length - 1]} y={[-1, 4]} ticks={INTERVALS.length - 1} yTicks={5} height={200} label={s.chart} xLabel={s.axisX} yLabel={s.axisY}
            xFmt={(v) => s.short[Math.round(v)] ?? ""} yFmt={(v) => num(10 ** v)}
            lines={[{ points: curve, tone: "a" }]} dots={[{ x: i, y: Math.log10(days), r: 7, ring: true, tone: "ink" }]} />
          <p className="lb-note">{s.chart}</p>
        </div>
      </div>
    </LabShell>
  );
}
