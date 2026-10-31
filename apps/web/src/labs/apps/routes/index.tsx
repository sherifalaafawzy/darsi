import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Stats } from "../../kit/controls";
import { Plot, type Line } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { bestRoute, dist, length, MAP, MAX_VILLAGES, nearest, randomVillages, twoOpt, VILLAGES, type V } from "./model";

const S = {
  en: {
    intro: "Every morning the school bus leaves the school (the square), picks up children in every village once, and comes back. The shorter the route, the less fuel and the less time on the road. Tap the map to add a village, or tap a village to remove it.",
    map: "The map: the square is the school, numbered dots are villages, lines are the bus route", km: (n: string) => `${n} km`,
    school: "the school", village: (n: string) => `village ${n}`,
    cap: {
      idle: "Press Run: first the bus always drives to the nearest village it hasn't visited, then 2-opt improves the route.",
      nn: (a: string, b: string, d: string) => `Nearest neighbour: from ${a}, the closest village not visited yet is ${b}, ${d} away.`,
      nnDone: (d: string) => `Every village visited, then back to school: ${d}. Some legs are long: nearest neighbour never looks ahead.`,
      swap: (d: string) => `2-opt: take out two roads (dashed) and join the stretch between them the other way round (bold): ${d} shorter.`,
      done: (d: string) => `No swap of two roads helps any more: ${d}.`,
      none: "With so few villages there is nothing to improve.",
    },
    newMap: "New map", findBest: "Find the best route", nnLen: "Nearest neighbour", now: "Now", bestLen: "Best possible", swaps: "Swaps",
    history: "Route length, step by step", step: "step",
    same: "2-opt found the best route of all.", longer: (d: string) => `2-opt stopped ${d} longer than the best route (dotted): two-road swaps can't reach it from here.`,
    bestNote: "The best route is found by checking every order of the villages, cleverly (dynamic programming): fine for 11 villages, impossible for 100.",
    try1: "Press Run and watch the first part: the bus always takes the nearest village, and the last legs back are long (34.6 km).",
    try2: "Keep watching: each 2-opt swap removes a crossing or a long detour. After three swaps the route is 28.6 km. Press “Find the best route”: it's the best of all.",
    try3: "Press “New map” a few times and run again: on some maps 2-opt stops before the best route. Add villages by tapping the map: the best route takes longer to find.",
    takeaway: "The bus route is the travelling salesperson problem. Trying every order is hopeless for many stops (25 villages have more possible routes than there are grains of sand on Earth), so real route planners build a quick route and then improve it with small changes like 2-opt.",
  },
  ar: {
    intro: "كل صباح تنطلق حافلة المدرسة من المدرسة (المربع)، وتمرّ على الأطفال في كل قرية مرة واحدة، ثم تعود. وكلما قصر الطريق قلّ الوقود والوقت على الطريق. المس الخريطة لتضيف قرية، أو المس قرية لتحذفها.",
    map: "الخريطة: المربع هو المدرسة، والنقاط المرقّمة قرى، والخطوط طريق الحافلة", km: (n: string) => `${n} كم`,
    school: "المدرسة", village: (n: string) => `القرية ${n}`,
    cap: {
      idle: "اضغط «شغّل»: تذهب الحافلة أولًا دائمًا إلى أقرب قرية لم تزرها، ثم تحسّن 2-opt الطريق.",
      nn: (a: string, b: string, d: string) => `أقرب جار: من ${a}، أقرب قرية لم تُزَر بعد هي ${b}، على بعد ${d}.`,
      nnDone: (d: string) => `زارت الحافلة كل القرى ثم عادت إلى المدرسة: ${d}. بعض المراحل طويلة، لأن «أقرب جار» لا ينظر إلى ما بعد.`,
      swap: (d: string) => `2-opt: أزِل طريقين (المتقطّعين) وصِل المقطع الذي بينهما بالاتجاه المعاكس (العريضين): أقصر بـ ${d}.`,
      done: (d: string) => `لم يعد تبديل أي طريقين يفيد: ${d}.`,
      none: "مع هذا العدد القليل من القرى لا يوجد ما يُحسَّن.",
    },
    newMap: "خريطة جديدة", findBest: "جِد أفضل طريق", nnLen: "أقرب جار", now: "الآن", bestLen: "أفضل الممكن", swaps: "التبديلات",
    history: "طول الطريق خطوةً بعد خطوة", step: "الخطوة",
    same: "وجدت 2-opt أفضل طريق على الإطلاق.", longer: (d: string) => `توقّفت 2-opt وطريقها أطول بـ ${d} من أفضل طريق (المنقّط): تبديل طريقين لا يصل إليه من هنا.`,
    bestNote: "يُعثر على أفضل طريق بفحص كل ترتيب للقرى بذكاء (البرمجة الديناميكية): ممكن مع ١١ قرية، ومستحيل مع ١٠٠.",
    try1: "اضغط «شغّل» وراقب الجزء الأول: تأخذ الحافلة دائمًا أقرب قرية، والمراحل الأخيرة في العودة طويلة (٣٤٫٦ كم).",
    try2: "واصل المراقبة: كل تبديل 2-opt يزيل تقاطعًا أو التفافًا طويلًا. بعد ثلاثة تبديلات يصبح الطريق ٢٨٫٦ كم. اضغط «جِد أفضل طريق»: إنه الأفضل على الإطلاق.",
    try3: "اضغط «خريطة جديدة» بضع مرات وشغّل من جديد: في بعض الخرائط تتوقّف 2-opt قبل أفضل طريق. أضف قرى بلمس الخريطة: يستغرق إيجاد أفضل طريق وقتًا أطول.",
    takeaway: "طريق الحافلة هو مسألة البائع المتجوّل. وتجربة كل ترتيب ميؤوس منها مع محطات كثيرة (لخمس وعشرين قرية طرق ممكنة أكثر من حبات الرمل على الأرض)، لذا يبني مخطّطو الطرق الحقيقيون طريقًا سريعًا ثم يحسّنونه بتغييرات صغيرة مثل 2-opt.",
  },
};

export default function Routes({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [vs, setVs] = useState<V[]>(VILLAGES);
  const [seed, setSeed] = useState(4);
  const [at, setAt] = useState(-1);
  const [showBest, setShowBest] = useState(false);
  const nn = useMemo(() => nearest(vs), [vs]);
  const swaps = useMemo(() => twoOpt(vs, nn[nn.length - 1]), [vs, nn]);
  const best = useMemo(() => (showBest ? bestRoute(vs) : null), [vs, showBest]);
  // Frames: nn[1..], then each swap, then (if there were swaps) the finished route on its own. at = −1 before the run.
  const nnSteps = nn.length - 1, total = nnSteps + swaps.length + (swaps.length ? 1 : 0);
  const atRef = useRef(at); atRef.current = at;
  const lastAt = useRef(0);
  const loop = useLoop(() => {
    const now = performance.now(), wait = atRef.current + 1 < nnSteps ? 650 : 1500;
    if (lastAt.current && now - lastAt.current < wait) return true;
    lastAt.current = now;
    const next = Math.min(atRef.current + 1, total - 1);
    atRef.current = next; setAt(next);
    return next < total - 1;
  }, { maxPerFrame: 1 });
  const restart = () => { loop.stop(); setAt(-1); };
  const newVillages = (next: V[]) => { restart(); setVs(next); setShowBest(false); };
  const [runs, setRuns] = useState(0);
  useEffect(() => { if (at === total - 1 && total > 0) setRuns((r) => r + 1); }, [at, total]);
  useEffect(() => { if (runs >= 1 && showBest) onDone?.(); }, [runs >= 1 && showBest]); // eslint-disable-line react-hooks/exhaustive-deps

  const n1 = (v: number) => s.km(num(Math.round(v * 10) / 10));
  const inNN = at >= 0 && at < nnSteps, swap = at >= nnSteps ? swaps[at - nnSteps] ?? null : null;
  const route = at < 0 ? [0] : inNN ? nn[at + 1] : (swap ?? swaps[swaps.length - 1])?.route ?? nn[nn.length - 1];
  const closed = at >= nnSteps - 1 && at >= 0;
  const nnLen = length(vs, nn[nn.length - 1]);
  const nowLen = closed ? length(vs, route) : null;
  const pts = (r: number[], loopBack: boolean) => [...r, ...(loopBack ? [r[0]] : [])].map((i) => [vs[i].x, vs[i].y] as const);
  const lines: Line[] = [];
  if (best) lines.push({ points: pts(best.route, true), tone: "muted", dashed: true, width: 1.5 });
  if (route.length > 1) lines.push({ points: pts(route, closed), tone: "ink", width: 2.5 });
  if (swap) for (const [a, b] of swap.out) lines.push({ points: [[vs[a].x, vs[a].y], [vs[b].x, vs[b].y]], tone: "c", dashed: true, width: 3 });
  if (swap) for (const [a, b] of swap.in) lines.push({ points: [[vs[a].x, vs[a].y], [vs[b].x, vs[b].y]], tone: "b", width: 5 });
  if (inNN) { const r = nn[at + 1], a = r[r.length - 2], b = r[r.length - 1]; lines.push({ points: [[vs[a].x, vs[a].y], [vs[b].x, vs[b].y]], tone: "b", width: 5 }); }
  const place = (i: number) => (i === 0 ? s.school : s.village(num(i)));
  const caption = vs.length < 4 && at >= nnSteps - 1 ? s.cap.none
    : at < 0 ? s.cap.idle
    : inNN && at < nnSteps - 1 ? (() => { const r = nn[at + 1], a = r[r.length - 2], b = r[r.length - 1]; return s.cap.nn(place(a), place(b), n1(dist(vs[a], vs[b]))); })()
    : at === nnSteps - 1 ? `${s.cap.nnDone(n1(nnLen))}${swaps.length ? "" : ` ${s.cap.done(n1(nnLen))}`}`
    : at === total - 1 ? s.cap.done(n1(nowLen ?? nnLen))
    : s.cap.swap(n1(swap!.gain));
  const history = [nnLen, ...swaps.map((x) => x.length)].slice(0, Math.max(0, at - nnSteps + 2));

  const pick = (x: number, y: number) => {
    const near = vs.findIndex((v) => Math.hypot(v.x - x, v.y - y) < 0.6);
    if (near > 0) { if (vs.length > 3) newVillages(vs.filter((_, i) => i !== near)); }
    else if (near < 0 && vs.length < MAX_VILLAGES + 1) newVillages([...vs, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }]);
  };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, MAP]} y={[0, MAP]} ticks={0} height={300} label={s.map} onPick={pick} lines={lines}
            dots={vs.map((v, i) => ({ x: v.x, y: v.y, r: i === 0 ? 9 : 7, shape: i === 0 ? "square" as const : "circle" as const, tone: i === 0 ? "ink" as const : route.includes(i) ? "a" as const : "muted" as const }))}>
            {({ px, py }) => vs.map((v, i) => i > 0 && <text key={i} x={px(v.x) + 9} y={py(v.y) - 7} className="lb-plot-label is-on">{num(i)}</text>)}
          </Plot>
          <p className="lb-note">{s.map}</p>
        </div>
        <div className="stack">
          <RunBar running={loop.running} onToggle={() => { if (at >= total - 1) setAt(-1); lastAt.current = 0; loop.toggle(); }} onStep={() => setAt((a) => Math.min(a + 1, total - 1))} onReset={restart}>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => { const sd = seed + 1; setSeed(sd); newVillages(randomVillages(sd)); }}>{s.newMap}</Button>
          </RunBar>
          <p className="lb-verdict" aria-live="polite">{caption}</p>
          <Stats items={[
            { label: s.nnLen, value: at >= nnSteps - 1 ? n1(nnLen) : "—" },
            { label: s.now, value: nowLen !== null ? n1(nowLen) : "—" },
            { label: s.swaps, value: num(Math.min(swaps.length, Math.max(0, at - nnSteps + 1))) },
            ...(best ? [{ label: s.bestLen, value: n1(best.length) }] : []),
          ]} />
          {history.length > 1 && <Plot x={[0, Math.max(1, history.length - 1)]} y={[Math.floor(Math.min(...history, best?.length ?? Infinity) * 0.9), Math.ceil(Math.max(...history) * 1.05)]} height={140} ticks={Math.min(4, Math.max(1, history.length - 1))} label={s.history} xLabel={s.step}
            lines={[{ points: history.map((v, i) => [i, v] as const), tone: "b" }, ...(best ? [{ points: [[0, best.length], [Math.max(1, history.length - 1), best.length]] as const, tone: "muted" as const, dashed: true }] : [])]} />}
          <div className="lb-row"><Button size="sm" variant="secondary" icon="target" onClick={() => setShowBest(true)}>{s.findBest}</Button></div>
          {best && <>
            {at === total - 1 && <p className="lb-note">{Math.abs((nowLen ?? nnLen) - best.length) < 1e-9 ? s.same : s.longer(n1((nowLen ?? nnLen) - best.length))}</p>}
            <p className="lb-note">{s.bestNote}</p>
          </>}
        </div>
      </div>
    </LabShell>
  );
}
