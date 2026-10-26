import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Slider, Stats } from "../../kit/controls";
import { Plot, type Tone } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { assign, houses, move, same, startStops, walk, type P } from "./model";

const TONES: Tone[] = ["a", "b", "c", "ink", "muted"];
const SHAPES = ["circle", "square", "triangle", "circle", "square"] as const;
const S = {
  en: {
    intro: "The dots are pupils' houses. Where should the bus stop? Nobody tells the computer the neighbourhoods; it finds them by repeating two simple steps. Tap the map to add a house.",
    map: "Houses (small marks) and bus stops (big rings); lines show who walks to which stop", k: "Number of bus stops (k)",
    next: { assign: "Next: every house picks its nearest stop", move: "Next: every stop moves to the middle of its houses" },
    newStart: "New random start", walk: "Average walk", round: "Round", history: "Average walk, round by round",
    done: (n: string, c: number) => `Finished: the stops stopped moving after ${c === 1 ? "1 round" : `${n} rounds`}.`, local: "Try a few new starts: some end with a longer average walk. k-means finds a good answer, not always the best one.",
    takeaway: "k-means groups things by similarity without any labelled examples: this is unsupervised learning. The same two steps group customers, photos or survey answers. You still choose k, and the result depends on where it starts.",
  },
  ar: {
    intro: "النقاط بيوت التلاميذ. أين يجب أن يقف الباص؟ لا أحد يخبر الحاسوب بالأحياء، بل يكتشفها بتكرار خطوتين بسيطتين. المس الخريطة لتضيف بيتًا.",
    map: "البيوت (العلامات الصغيرة) ومواقف الحافلة (الحلقات الكبيرة)، والخطوط تبيّن من يمشي إلى أي موقف", k: "عدد المواقف (k)",
    next: { assign: "التالي: يختار كل بيت أقرب موقف إليه", move: "التالي: ينتقل كل موقف إلى وسط بيوته" },
    newStart: "بداية عشوائية جديدة", walk: "متوسط المشي", round: "الجولة", history: "متوسط المشي جولةً بعد جولة",
    done: (n: string, c: number) => `انتهى: توقّفت المواقف عن الحركة بعد ${c === 1 ? "جولة واحدة" : c === 2 ? "جولتين" : c <= 10 ? `${n} جولات` : `${n} جولة`}.`, local: "جرّب بدايات جديدة: بعضها ينتهي بمتوسط مشي أطول. تجد k-means إجابة جيدة، لا الأفضل دائمًا.",
    takeaway: "تجمع k-means الأشياء بحسب التشابه دون أي أمثلة معنونة، وهذا هو التعلّم غير الموجّه. والخطوتان نفسهما تجمعان العملاء أو الصور أو إجابات الاستبيانات. لكنك ما زلت تختار k، والنتيجة تعتمد على نقطة البداية.",
  },
};

export default function Kmeans({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [pts, setPts] = useState<P[]>(() => houses());
  const [k, setK] = useState(4);
  const [seed, setSeed] = useState(3);
  const [stops, setStops] = useState<P[]>(() => startStops(pts, 4, 3));
  const [a, setA] = useState<number[] | null>(null);
  const [phase, setPhase] = useState<"assign" | "move">("assign");
  const [hist, setHist] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [finished, setFinished] = useState(0);
  const restart = (kk = k, sd = seed, ps = pts) => { loop.stop(); setStops(startStops(ps, kk, sd)); setA(null); setPhase("assign"); setHist([]); setDone(false); };
  useEffect(() => { if (finished >= 2) onDone?.(); }, [finished >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = () => {
    if (done) return false;
    if (phase === "assign") { const na = assign(pts, stops); setA(na); setPhase("move"); setHist((h) => [...h, walk(pts, stops, na)]); return true; }
    const next = move(pts, stops, a!);
    if (same(next, stops)) { setDone(true); setFinished((f) => f + 1); return false; }
    setStops(next); setPhase("assign");
    return true;
  };
  const lastAt = useRef(0);
  const loop = useLoop(() => { const now = performance.now(); if (now - lastAt.current < 450) return true; lastAt.current = now; return step(); }, { maxPerFrame: 1 });
  const cur = useMemo(() => a ?? assign(pts, stops), [a, pts, stops]);

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 10]} y={[0, 10]} label={s.map} height={300} ticks={0}
            onPick={(x, y) => { const ps = [...pts, { x, y }]; setPts(ps); setA(null); setPhase("assign"); setDone(false); }}
            dots={[
              ...pts.map((p, i) => ({ x: p.x, y: p.y, r: 4, tone: a ? TONES[cur[i] % 5] : "muted" as Tone, shape: a ? SHAPES[cur[i] % 5] : "circle" as const })),
              ...stops.map((st, i) => ({ x: st.x, y: st.y, r: 10, ring: true, tone: TONES[i % 5], shape: SHAPES[i % 5] })),
            ]}>
            {({ px, py }) => a ? pts.map((p, i) => <line key={i} x1={px(p.x)} y1={py(p.y)} x2={px(stops[cur[i]].x)} y2={py(stops[cur[i]].y)} className="lb-plot-leader" />) : null}
          </Plot>
          <p className="lb-note">{s.map}</p>
        </div>
        <div className="stack">
          <Slider label={s.k} value={k} min={1} max={5} onChange={(v) => { setK(v); restart(v); }} format={(v) => num(v)} />
          <p className="lb-verdict" aria-live="polite">{done ? s.done(num(hist.length), hist.length) : s.next[phase]}</p>
          <RunBar running={loop.running} onToggle={() => { lastAt.current = 0; loop.toggle(); }} onStep={() => step()}>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => { const sd = seed + 1; setSeed(sd); restart(k, sd); }}>{s.newStart}</Button>
          </RunBar>
          <Stats items={[{ label: s.round, value: num(hist.length) }, { label: s.walk, value: a ? num(Math.round(walk(pts, stops, cur) * 100) / 100) : "—" }]} />
          {hist.length > 1 && <Plot x={[1, Math.max(2, hist.length)]} y={[0, Math.max(...hist) * 1.1]} height={140} ticks={Math.min(4, Math.max(1, hist.length - 1))} label={s.history} lines={[{ points: hist.map((v, i) => [i + 1, v] as const), tone: "b" }]} />}
          {done && <p className="lb-note">{s.local}</p>}
        </div>
      </div>
    </LabShell>
  );
}
