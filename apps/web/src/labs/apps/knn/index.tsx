import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { field, knn, looAccuracy, mangoes } from "./model";

const S = {
  en: {
    intro: "Each mark is a mango we already checked: a filled circle is ready to eat, an open square is not yet. Tap the chart to place a new mango. It is judged by its k nearest neighbours.",
    chart: "Mangoes by softness and colour; tap to place a new one", soft: "softness", colour: "colour (green to yellow)",
    k: "Neighbours to ask (k)", data: "Examples", clean: "Tidy", messy: "With mistakes", map: "Show its answer everywhere", off: "Off", on: "On",
    verdict: (n: string, k: string, kn: number, yes: boolean) => `${n} of its ${kn === 1 ? "nearest neighbour is" : `${k} nearest neighbours are`} ripe, so: ${yes ? "ready to eat" : "not ready yet"}.`,
    tap: "Tap the chart to place a mango.", loo: "Right when each example is judged by the others",
    hint: "With k = 1 a single odd example can sway the answer; a bigger k smooths it out, but too big and it ignores the details.",
    takeaway: "Nearest neighbours learns nothing in advance: it compares each new case with stored examples. Simple and often good, but it needs good examples, a sensible measure of “near”, and a sensible k.",
  },
  ar: {
    intro: "كل علامة مانجو فحصناها من قبل: الدائرة الممتلئة جاهزة للأكل، والمربع المفرغ ليس بعد. المس الرسم لتضع مانجو جديدة، وسيُحكم عليها بأقرب k من جيرانها.",
    chart: "المانجو بحسب الليونة واللون، والمس لتضع واحدة جديدة", soft: "الليونة", colour: "اللون (من الأخضر إلى الأصفر)",
    k: "عدد الجيران الذين نسألهم (k)", data: "الأمثلة", clean: "مرتّبة", messy: "فيها أخطاء", map: "أظهر إجابته في كل مكان", off: "متوقف", on: "يعمل",
    verdict: (n: string, k: string, kn: number, yes: boolean) => `${n} من ${kn === 1 ? "أقرب جار" : kn === 2 ? "أقرب جارين" : kn <= 10 ? `أقرب ${k} جيران` : `أقرب ${k} جارًا`} ناضجة، إذن: ${yes ? "جاهزة للأكل" : "ليست جاهزة بعد"}.`,
    tap: "المس الرسم لتضع مانجو.", loo: "صحيحة حين يُحكم على كل مثال بالأمثلة الأخرى",
    hint: "مع k = ١ قد يغيّر مثال شاذ واحد الإجابة، والقيمة الأكبر تنعّمها، لكن إن كبرت كثيرًا تجاهلت التفاصيل.",
    takeaway: "لا تتعلّم طريقة أقرب الجيران شيئًا مسبقًا: إنها تقارن كل حالة جديدة بالأمثلة المحفوظة. بسيطة وجيدة غالبًا، لكنها تحتاج إلى أمثلة جيدة، ومقياس معقول لـ«القرب»، وقيمة k معقولة.",
  },
};

export default function Knn({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [messy, setMessy] = useState(false);
  const [k, setK] = useState(3);
  const [map, setMap] = useState(true);
  const [q, setQ] = useState<{ x: number; y: number } | null>(null);
  const [placed, setPlaced] = useState(0);
  const [ks, setKs] = useState(() => new Set([3]));
  const pts = useMemo(() => mangoes(messy), [messy]);
  const heat = useMemo(() => (map ? { n: 32, values: field(pts, k) } : undefined), [pts, k, map]);
  const res = q ? knn(pts, q, k) : null;
  useEffect(() => { if (placed >= 3 && ks.size >= 2) onDone?.(); }, [placed >= 3 && ks.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 10]} y={[0, 10]} label={s.chart} xLabel={s.soft} yLabel={s.colour} heat={heat} height={300}
            onPick={(x, y) => { setQ({ x, y }); setPlaced((n) => n + 1); }}
            dots={[
              ...pts.map((p) => ({ x: p.x, y: p.y, tone: p.ripe ? "b" as const : "a" as const, shape: p.ripe ? "circle" as const : "square" as const, ring: !p.ripe, r: 5 })),
              ...(q && res ? [{ x: q.x, y: q.y, tone: "ink" as const, shape: "triangle" as const, r: 8 }] : []),
            ]}>
            {({ px, py }) => q && res ? res.near.map((n) => <line key={n.i} x1={px(q.x)} y1={py(q.y)} x2={px(n.p.x)} y2={py(n.p.y)} className="lb-plot-leader is-strong" />) : null}
          </Plot>
          <p className="lb-verdict" aria-live="polite">{res ? s.verdict(num(res.near.filter((n) => n.p.ripe).length), num(res.near.length), res.near.length, res.ripe) : s.tap}</p>
        </div>
        <div className="stack">
          <Slider label={s.k} value={k} min={1} max={15} onChange={(v) => { setK(v); setKs((x) => new Set(x).add(v)); }} format={(v) => num(v)} />
          <Segmented label={s.data} value={messy ? 1 : 0} options={[[0, s.clean], [1, s.messy]]} onChange={(v) => setMessy(v === 1)} />
          <Segmented label={s.map} value={map ? 1 : 0} options={[[0, s.off], [1, s.on]]} onChange={(v) => setMap(v === 1)} />
          <Stats items={[{ label: s.loo, value: num(looAccuracy(pts, k), { style: "percent" }) }]} />
          <p className="lb-note">{s.hint}</p>
        </div>
      </div>
    </LabShell>
  );
}
