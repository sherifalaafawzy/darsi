import { useEffect, useMemo, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { usePlural, type Forms } from "../../kit/plural";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { links, NODES, path, routes, type Node } from "./model";

const S = {
  en: {
    intro: "Sensors spread over a farm can't all reach the office gateway (the square) directly. Each one passes messages to a neighbour in radio range, hop by hop. Tap a sensor to break it, or switch to adding relays.",
    map: "The farm: square is the gateway, circles are sensors, lines are radio links; numbers are hops to the gateway", range: "Radio range", m: (n: string) => `${n} m`,
    tap: "Tap the map to", breakIt: "Break or fix a sensor", relay: "Add a relay", reset: "Fix everything",
    reach: "Reach the gateway", avg: "Average hops", most: "Most hops", allOk: "Every sensor's message gets through.",
    cut: { one: "1 sensor is cut off: its messages are lost.", other: "{n} sensors are cut off: their messages are lost." } as Forms,
    note: "Every hop costs battery on the sensor that relays it and adds a little delay. More range or a few well-placed relays make the network stronger.",
    takeaway: "Mesh networks keep working when parts fail, because messages can take another route. Finding routes is graph search: breadth-first search finds the fewest hops. The same idea routes messages across the internet.",
  },
  ar: {
    intro: "لا تستطيع كل المستشعرات المنتشرة في المزرعة الوصول مباشرةً إلى بوابة المكتب (المربع). فيمرّر كل منها الرسائل إلى جار في مدى الإرسال، قفزة بعد قفزة. المس مستشعرًا لتعطّله، أو انتقل إلى إضافة المكرّرات.",
    map: "المزرعة: المربع هو البوابة، والدوائر مستشعرات، والخطوط وصلات لاسلكية، والأرقام عدد القفزات إلى البوابة", range: "مدى الإرسال", m: (n: string) => `${n} متر`,
    tap: "المس الخريطة لـ", breakIt: "تعطيل مستشعر أو إصلاحه", relay: "إضافة مكرّر", reset: "أصلح كل شيء",
    reach: "تصل إلى البوابة", avg: "متوسط القفزات", most: "أكثر القفزات", allOk: "تصل رسائل كل المستشعرات.",
    cut: { one: "مستشعر واحد معزول: رسائله تضيع.", two: "مستشعران معزولان: رسائلهما تضيع.", few: "{n} مستشعرات معزولة: رسائلها تضيع.", many: "{n} مستشعرًا معزولًا: رسائلها تضيع.", other: "{n} مستشعر معزول: رسائلها تضيع." } as Forms,
    note: "كل قفزة تكلّف بطارية المستشعر الذي يمرّرها وتضيف تأخيرًا صغيرًا. ومدى أكبر أو بضعة مكرّرات في أماكن مدروسة تجعل الشبكة أقوى.",
    takeaway: "تبقى الشبكات المتشابكة عاملة حين تتعطّل أجزاء منها، لأن الرسائل تستطيع أن تسلك طريقًا آخر. وإيجاد المسارات بحث في المخطّط: البحث بالعرض أولًا يجد أقل عدد من القفزات. والفكرة نفسها توجّه الرسائل عبر الإنترنت.",
  },
};

export default function Mesh({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const count = usePlural();
  const [nodes, setNodes] = useState<Node[]>(NODES);
  const [range, setRange] = useState(2.8);
  const [down, setDown] = useState<Set<number>>(() => new Set());
  const [mode, setMode] = useState<"break" | "relay">("break");
  const [acts, setActs] = useState(0);
  const r = useMemo(() => routes(nodes, range, down), [nodes, range, down]);
  const ls = useMemo(() => links(nodes, range, down), [nodes, range, down]);
  const sensors = nodes.filter((n) => !n.gateway && !down.has(n.id)), cut = sensors.filter((n) => !r.has(n.id));
  const hops = sensors.filter((n) => r.has(n.id)).map((n) => r.get(n.id)!.hops);
  const onRoute = new Set(sensors.flatMap((n) => { const p = path(r, n.id); return p ? p.slice(0, -1).map((id, k) => `${id}-${p[k + 1]}`) : []; }));
  useEffect(() => { if (acts >= 3) onDone?.(); }, [acts >= 3]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (x: number, y: number) => {
    const near = nodes.find((n) => Math.hypot(n.x - x, n.y - y) < 0.5);
    if (mode === "break") {
      if (!near || near.gateway) return;
      setDown((d) => { const next = new Set(d); if (next.has(near.id)) next.delete(near.id); else next.add(near.id); return next; });
    } else if (!near) setNodes((ns) => [...ns, { id: Math.max(...ns.map((n) => n.id)) + 1, x, y }]);
    setActs((a) => a + 1);
  };

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 10]} y={[0, 10]} ticks={0} height={300} label={s.map} onPick={pick}
            dots={nodes.map((n) => ({ x: n.x, y: n.y, r: n.gateway ? 9 : 7, shape: n.gateway ? "square" as const : "circle" as const, tone: n.gateway ? "ink" as const : down.has(n.id) ? "muted" as const : r.has(n.id) ? "a" as const : "c" as const, ring: down.has(n.id) || (!n.gateway && !r.has(n.id)) }))}>
            {({ px, py }) => <>
              {ls.map(([a, b]) => <line key={`${a.id}-${b.id}`} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} className={onRoute.has(`${a.id}-${b.id}`) || onRoute.has(`${b.id}-${a.id}`) ? "lb-plot-leader is-strong" : "lb-plot-leader"} />)}
              {nodes.filter((n) => !n.gateway && r.has(n.id)).map((n) => <text key={n.id} x={px(n.x) + 9} y={py(n.y) - 7} className="lb-plot-label is-on">{num(r.get(n.id)!.hops)}</text>)}
              {nodes.filter((n) => down.has(n.id)).map((n) => <path key={n.id} d={`M${px(n.x) - 6} ${py(n.y) - 6} L${px(n.x) + 6} ${py(n.y) + 6} M${px(n.x) + 6} ${py(n.y) - 6} L${px(n.x) - 6} ${py(n.y) + 6}`} stroke="var(--ink)" strokeWidth={2} />)}
            </>}
          </Plot>
          <p className="lb-note">{s.map}</p>
        </div>
        <div className="stack">
          <Slider label={s.range} value={range} min={1.5} max={5} step={0.1} onChange={setRange} format={(v) => s.m(num(Math.round(v * 100)))} />
          <Segmented label={s.tap} value={mode} options={[["break", s.breakIt], ["relay", s.relay]]} onChange={setMode} />
          <div className="lb-row"><Button size="sm" variant="ghost" icon="sync" onClick={() => { setDown(new Set()); setNodes(NODES); }}>{s.reset}</Button></div>
          <p className={cut.length ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{cut.length ? count(cut.length, s.cut) : s.allOk}</p>
          <Stats items={[
            { label: s.reach, value: `${num(sensors.length - cut.length)} / ${num(sensors.length)}` },
            { label: s.avg, value: hops.length ? num(Math.round((hops.reduce((a, b) => a + b, 0) / hops.length) * 10) / 10) : "—" },
            { label: s.most, value: hops.length ? num(Math.max(...hops)) : "—" },
          ]} />
          <p className="lb-note">{s.note}</p>
        </div>
      </div>
    </LabShell>
  );
}
