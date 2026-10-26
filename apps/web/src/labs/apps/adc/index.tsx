import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { apparent, bitsPerSecond, enough, levels, roundingError, sample, wave } from "./model";

const S = {
  en: {
    intro: "Sensors measure smooth, continuous things: sound, light, temperature. A microcontroller can only store numbers, so it measures a number of times per second and rounds each measurement to a fixed set of levels.",
    chart: "One second of the signal: the real wave (thin), the samples (dots), the rounded values (steps) and the wave you could rebuild from them (dashed)", time: "seconds",
    f: "The signal wiggles", hz: (n: string, c: number) => (c === 1 ? "once a second" : `${n} times a second`), rate: "Samples per second", bits: "Bits per sample",
    levels: (n: string) => `${n} levels`, data: "Data per second", bitsN: (n: string) => `${n} bits`, perMin: "One minute takes", kb: (n: string) => `${n} KB`,
    error: "Typical rounding error", ok: (hz: string) => `Enough samples: the rebuilt wave wiggles ${hz}, like the real one.`,
    alias: (real: string, seen: string) => `Too few samples! The real wave wiggles ${real}, but the samples look like ${seen}. This is aliasing: sample more than twice as fast as the fastest wiggle.`,
    takeaway: "Turning signals into numbers is always a trade: more samples and more bits capture more detail, but cost memory, data and battery. Phone audio uses about 44,000 samples a second at 16 bits; a classroom thermometer needs one reading a minute.",
  },
  ar: {
    intro: "تقيس المستشعرات أشياء ناعمة متصلة: الصوت والضوء والحرارة. أما المتحكّم الدقيق فلا يخزّن إلا الأرقام، لذلك يقيس عددًا من المرات في الثانية ويقرّب كل قياس إلى مجموعة ثابتة من المستويات.",
    chart: "ثانية واحدة من الإشارة: الموجة الحقيقية (رفيعة)، والعيّنات (نقاط)، والقيم المقرّبة (درجات)، والموجة التي يمكن إعادة بنائها منها (متقطعة)", time: "ثوانٍ",
    f: "تتذبذب الإشارة", hz: (n: string, c: number) => (c === 1 ? "مرة واحدة في الثانية" : c === 2 ? "مرتين في الثانية" : Number.isInteger(c) && c <= 10 ? `${n} مرات في الثانية` : `${n} مرة في الثانية`), rate: "العيّنات في الثانية", bits: "البتات لكل عيّنة",
    levels: (n: string) => `${n} مستوى`, data: "البيانات في الثانية", bitsN: (n: string) => `${n} بت`, perMin: "دقيقة واحدة تشغل", kb: (n: string) => `${n} كيلوبايت`,
    error: "خطأ التقريب المعتاد", ok: (hz: string) => `العيّنات كافية: تتذبذب الموجة المعاد بناؤها ${hz} مثل الحقيقية.`,
    alias: (real: string, seen: string) => `العيّنات قليلة جدًا! الموجة الحقيقية تتذبذب ${real}، لكن العيّنات تبدو كأنها تتذبذب ${seen}. هذا هو التشويه الترددي (aliasing): خذ العيّنات بأسرع من ضعف أسرع تذبذب.`,
    takeaway: "تحويل الإشارات إلى أرقام مقايضة دائمًا: عيّنات وبتات أكثر تلتقط تفاصيل أكثر، لكنها تكلّف ذاكرة وبيانات وبطارية. صوت الهاتف يستعمل نحو ٤٤٠٠٠ عيّنة في الثانية بدقة ١٦ بتًا، أما ميزان حرارة الصف فتكفيه قراءة في الدقيقة.",
  },
};

export default function Adc({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [f, setF] = useState(3);
  const [rate, setRate] = useState(20);
  const [bits, setBits] = useState(3);
  const [moves, setMoves] = useState(0);
  const [aliased, setAliased] = useState(false);
  const ss = useMemo(() => sample(f, rate, bits), [f, rate, bits]);
  const fine = useMemo(() => Array.from({ length: 301 }, (_, i) => [i / 300, wave(i / 300, f)] as const), [f]);
  const steps = ss.flatMap((x, i) => [[x.t, x.q], [ss[i + 1]?.t ?? 1, x.q]] as const);
  const ok = enough(f, rate);
  const touch = () => setMoves((m) => m + 1);
  useEffect(() => { if (!ok) setAliased(true); }, [ok]);
  useEffect(() => { if (moves >= 4 && aliased) onDone?.(); }, [moves >= 4 && aliased]); // eslint-disable-line react-hooks/exhaustive-deps
  const bps = bitsPerSecond(rate, bits);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <Plot x={[0, 1]} y={[-1, 1]} height={240} label={s.chart} xLabel={s.time}
        lines={[
          ...(bits <= 4 ? levels(bits).map((l) => ({ points: [[0, l], [1, l]] as const, tone: "muted" as const, width: 0.5 })) : []),
          { points: fine, tone: "muted", width: 1.5 },
          { points: steps, tone: "b", width: 2 },
          { points: ss.map((x) => [x.t, x.q] as const), tone: "c", dashed: true, width: 1.5 },
        ]}
        dots={ss.map((x) => ({ x: x.t, y: x.q, r: 3.5, tone: "a" as const }))} />
      <p className="lb-note">{s.chart}</p>
      <div className="lb-two">
        <div className="stack">
          <Segmented label={s.f} value={f} options={[1, 3, 8].map((n) => [n, s.hz(num(n), n)] as const)} onChange={(v) => { setF(v); touch(); }} />
          <Slider label={s.rate} value={rate} min={2} max={60} onChange={(v) => { setRate(v); touch(); }} format={(v) => num(v)} />
          <Slider label={s.bits} value={bits} min={1} max={8} onChange={(v) => { setBits(v); touch(); }} format={(v) => `${num(v)} (${s.levels(num(2 ** v))})`} />
        </div>
        <div className="stack">
          <p className={ok ? "lb-verdict" : "lb-verdict is-warn"} aria-live="polite">{ok ? s.ok(s.hz(num(f), f)) : s.alias(s.hz(num(f), f), s.hz(num(Math.round(apparent(f, rate) * 10) / 10), Math.round(apparent(f, rate) * 10) / 10))}</p>
          <Stats items={[
            { label: s.error, value: num(Math.round(roundingError(ss) * 1000) / 1000) },
            { label: s.data, value: s.bitsN(num(bps)) },
            { label: s.perMin, value: s.kb(num(Math.round((bps * 60) / 8 / 1024 * 10) / 10)) },
          ]} />
        </div>
      </div>
    </LabShell>
  );
}
