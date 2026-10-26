import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { rng } from "../../kit/rng";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { bestA, episode, greedyPath, N, newQ, START, value, yard, type Cell } from "./model";

const ARROWS = ["↑", "→", "↓", "←"];
const PER_PRESS = 200;
const S = {
  en: {
    intro: "The robot starts in the bottom corner and must find its charger. It gets +10 at the charger, −5 in a puddle and pays a little battery for every step. At first it wanders; with practice, it learns how good each move is in each square.",
    grid: "The school yard. Arrows: the robot's best move in each square. Darker: closer to a reward.",
    practise: "Practise", watch: "Watch the robot", forget: "Forget everything", explore: "Trying random moves", rate: "Learning rate",
    edit: "Tap a square to", look: "Look", wall: "Add a wall", puddle: "Add a puddle", clear: "Clear it",
    trips: "Practice trips", last: "Steps on the last trip", chart: "Steps per trip: fewer means it has learned a shorter way",
    reached: (n: string, c: number) => `It reached the charger in ${n} ${c === 1 ? "step" : "steps"}.`, lost: "It's still lost: give it more practice.", idle: "Press Practise, then Watch the robot.",
    cell: { free: "path", wall: "wall", puddle: "puddle", goal: "charger" } as Record<Cell, string>,
    takeaway: "Reinforcement learning learns from rewards, not from examples of right answers. Game-playing AIs and some robots learn this way, and it is also used to shape how chatbots answer. The tricky part is choosing rewards that really mean what you want.",
  },
  ar: {
    intro: "يبدأ الروبوت من الزاوية السفلية وعليه أن يجد شاحنه. يحصل على +١٠ عند الشاحن، و−٥ في البركة، ويدفع قليلًا من البطارية مع كل خطوة. في البداية يتجوّل، ومع التدريب يتعلّم قيمة كل حركة في كل مربع.",
    grid: "ساحة المدرسة. الأسهم: أفضل حركة للروبوت في كل مربع. الأغمق: أقرب إلى مكافأة.",
    practise: "درّب", watch: "شاهد الروبوت", forget: "انسَ كل شيء", explore: "تجربة حركات عشوائية", rate: "معدّل التعلّم",
    edit: "المس مربعًا لـ", look: "النظر", wall: "إضافة جدار", puddle: "إضافة بركة", clear: "إخلائه",
    trips: "رحلات التدريب", last: "خطوات آخر رحلة", chart: "الخطوات في كل رحلة: الأقل يعني أنه تعلّم طريقًا أقصر",
    reached: (n: string, c: number) => `وصل إلى الشاحن في ${c <= 10 && c > 2 ? `${n} خطوات` : `${n} خطوة`}.`, lost: "ما زال تائهًا: درّبه أكثر.", idle: "اضغط «درّب»، ثم «شاهد الروبوت».",
    cell: { free: "ممر", wall: "جدار", puddle: "بركة", goal: "شاحن" } as Record<Cell, string>,
    takeaway: "يتعلّم التعلّم المعزّز من المكافآت، لا من أمثلة الإجابات الصحيحة. هكذا تتعلّم برامج الذكاء الاصطناعي التي تلعب الألعاب وبعض الروبوتات، ويُستعمل أيضًا لتوجيه إجابات روبوتات المحادثة. والجزء الصعب هو اختيار مكافآت تعني فعلًا ما تريده.",
  },
};

type Tool = "look" | "wall" | "puddle" | "clear";

export default function Rl({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [g, setG] = useState<Cell[]>(yard);
  const q = useRef(newQ());
  const r = useRef(rng(5));
  const [hist, setHist] = useState<number[]>([]); // steps of the last 300 trips
  const trips = useRef(0);
  const [explore, setExplore] = useState(0.2);
  const [rate, setRate] = useState(0.5);
  const [tool, setTool] = useState<Tool>("look");
  const [walk, setWalk] = useState<{ path: number[]; at: number; reached: boolean } | null>(null);
  const [, redraw] = useState(0);
  const pressStart = useRef(0);

  const trip = () => { const e = episode(g, q.current, r.current, { rate, explore }); trips.current++; setHist((h) => [...h.slice(-299), e.steps]); };
  // Practise runs a batch of trips per press, then stops by itself.
  const practise = useLoop(() => { trip(); return trips.current - pressStart.current < PER_PRESS; }, { maxPerFrame: 4 });
  // Watching moves the robot four squares a second along the path it has learned.
  const lastAt = useRef(0);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const watch = useLoop(() => {
    const w = walkRef.current, now = performance.now();
    if (!w) return false;
    if (now - lastAt.current < 250) return true;
    lastAt.current = now;
    const next = { ...w, at: Math.min(w.at + 1, w.path.length - 1) };
    walkRef.current = next;
    setWalk(next);
    return next.at < next.path.length - 1;
  }, { maxPerFrame: 1 });
  useEffect(() => { if (walk?.reached && walk.at === walk.path.length - 1) onDone?.(); }, [walk?.reached && walk?.at === (walk?.path.length ?? 0) - 1]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (i: number) => {
    if (tool === "look" || g[i] === "goal" || i === START) return;
    setG((cur) => cur.map((c, j) => (j === i ? (tool === "clear" ? "free" : tool) : c)));
    setWalk(null);
  };
  const forget = () => { practise.stop(); watch.stop(); q.current = newQ(); trips.current = 0; setHist([]); setWalk(null); redraw((x) => x + 1); };
  const vmax = Math.max(1, ...Array.from({ length: N * N }, (_, i) => value(q.current, i)));
  const onPath = new Set(walk ? walk.path.slice(0, walk.at + 1) : []);
  const robot = walk ? walk.path[walk.at] : START;

  return (
    <LabShell meta={meta} intro={s.intro} takeaway={s.takeaway} onReset={() => { forget(); setG(yard()); }}>
      <div className="lb-two">
        <div className="stack">
          <div className="lb-yard" dir="ltr" role="group" aria-label={s.grid}>
            {g.map((c, i) => {
              const v = value(q.current, i), learned = c === "free" && q.current.slice(i * 4, i * 4 + 4).some((x) => x !== 0);
              return (
                <button key={i} type="button" className={`lb-yard-cell is-${c}${onPath.has(i) ? " is-path" : ""}`} aria-label={`${s.cell[c]}${learned ? ` ${ARROWS[bestA(q.current, i)]}` : ""}`} onClick={() => edit(i)}>
                  {c === "free" && learned && <span className="lb-yard-heat" style={{ opacity: Math.max(0, v) / vmax }} aria-hidden />}
                  {c === "goal" && <Icon name="target" size={20} />}
                  {c === "free" && learned && i !== robot && <span className="lb-yard-arrow" aria-hidden>{ARROWS[bestA(q.current, i)]}</span>}
                  {i === robot && <span className="lb-yard-robot" aria-hidden />}
                </button>
              );
            })}
          </div>
          <p className="lb-note">{s.grid}</p>
          <Segmented label={s.edit} value={tool} options={[["look", s.look], ["wall", s.wall], ["puddle", s.puddle], ["clear", s.clear]]} onChange={setTool} />
        </div>
        <div className="stack">
          <RunBar running={practise.running} runLabel={s.practise} onToggle={() => { watch.stop(); setWalk(null); pressStart.current = trips.current; practise.toggle(); }}
            onStep={trip}>
            <Button size="sm" variant="secondary" icon="play" disabled={practise.running} onClick={() => { const p = greedyPath(g, q.current); setWalk({ ...p, at: 0 }); lastAt.current = 0; watch.start(); }}>{s.watch}</Button>
            <Button size="sm" variant="ghost" icon="sync" onClick={forget}>{s.forget}</Button>
          </RunBar>
          <p className="lb-verdict" aria-live="polite">{!walk ? s.idle : walk.at < walk.path.length - 1 ? "…" : walk.reached ? s.reached(num(walk.path.length - 1), walk.path.length - 1) : s.lost}</p>
          <Slider label={s.explore} value={explore} min={0} max={0.5} step={0.05} onChange={setExplore} format={(v) => num(v, { style: "percent" })} />
          <Slider label={s.rate} value={rate} min={0.1} max={1} step={0.1} onChange={setRate} format={(v) => num(v)} />
          <Stats items={[{ label: s.trips, value: num(trips.current) }, { label: s.last, value: hist.length ? num(hist[hist.length - 1]) : "—" }]} />
          {hist.length > 1 && <Plot x={[1, hist.length]} y={[0, Math.max(...hist)]} height={150} fmt={(v) => num(Math.round(v))} label={s.chart} lines={[{ points: hist.map((v, i) => [i + 1, v] as const), tone: "b", width: 1.5 }]} />}
        </div>
      </div>
    </LabShell>
  );
}
