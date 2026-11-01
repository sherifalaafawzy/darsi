import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { Formula } from "../../kit/Formula";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented, Slider, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { begin, BEST, CHATTY, COLS, cost, ITERS, PAIRS, PUPILS, seatsOf, shuffled, sideBySide, step, stuck, type Search } from "./model";

/** Swaps per second while running: a whole annealing run (40,000 swaps) takes about 8 seconds. */
const RATE = 5000;
const SAMPLE = 400;
const S = {
  en: {
    intro: "Twelve pupils, twelve desks. Lines join pupils who work together (thicker: more lessons a week); each pair costs the steps between their desks, times its lessons. Chatty pairs side by side cost 4 more. A move swaps two pupils. Lower cost is better.",
    pupil: { ali: "Ali", sara: "Sara", omar: "Omar", lina: "Lina", musa: "Musa", nour: "Nour", adam: "Adam", hiba: "Hiba", yara: "Yara", zaid: "Zaid", rami: "Rami", dana: "Dana" } as Record<string, string>,
    room: "The classroom from above, the board at the top: lines join pupils who work together, red zigzags mark chatty pairs sitting side by side", board: "Board",
    method: "Method", hill: "Hill climbing", anneal: "Annealing", temp: "Starting temperature",
    hillNote: "Hill climbing keeps a swap only if the cost doesn't go up.",
    annealNote: "Annealing also keeps some swaps that make things worse: often while it is hot, rarely as it cools, and more rarely the worse they are.",
    chance: "chance of keeping", legend: "d: how much the cost goes up; T: the temperature",
    cost: "Cost now", best: "Best so far", tried: "Swaps tried", worse: "Worse kept", t: "Temperature",
    history: "Cost while searching", swaps: "thousands of swaps tried",
    cap: {
      ready: "Press Run to start swapping from this seating. Start again gives a new random seating.",
      running: "Swapping…",
      stuck: (c: string) => `Stuck at ${c}: no single swap of two pupils makes it better. This is a local minimum.`,
      cooled: (c: string) => `Cooled down at ${c}.`,
      best: " That is the best plan known.", notBest: (b: string) => ` The best plan known costs ${b}.`,
    },
    runs: "Runs so far", runList: (m: string, list: string) => `${m}: ${list}`, list: ", ",
    try1: "With Hill climbing, press Run, then Start again and Run, four or five times. It stops at a different cost each time, often well above 37: stuck.",
    try2: "Switch to Annealing and do the same. The cost jumps up and down while it is hot, then settles, and it ends at 37 far more often.",
    try3: "Set the starting temperature to 0.5, then to 6. Too cold behaves like hill climbing; very hot wanders for a long time before it settles.",
    takeaway: "Local search improves a plan step by step, and can get stuck where every small change looks worse. Simulated annealing, named after cooling metal slowly, accepts some bad moves early so it can escape. Solvers use it for layouts, schedules and routes too big to search fully.",
  },
  ar: {
    intro: "اثنا عشر تلميذًا واثنا عشر مقعدًا. تصل الخطوط بين التلاميذ الذين يعملون معًا (الأعرض: دروس أكثر في الأسبوع)، وكل زوج يكلّف عدد الخطوات بين مقعديه مضروبًا في دروسه. والزوجان الثرثاران جنبًا إلى جنب يكلّفان ٤ إضافية. والحركة تبديل مكانَي تلميذين. والكلفة الأقل أفضل.",
    pupil: { ali: "علي", sara: "سارة", omar: "عمر", lina: "لينا", musa: "موسى", nour: "نور", adam: "آدم", hiba: "هبة", yara: "يارا", zaid: "زيد", rami: "رامي", dana: "دانة" } as Record<string, string>,
    room: "الفصل من الأعلى، والسبورة في الأعلى: تصل الخطوط بين التلاميذ الذين يعملون معًا، والخطوط المتعرّجة الحمراء تعني زوجين ثرثارين جنبًا إلى جنب", board: "السبورة",
    method: "الطريقة", hill: "تسلّق التل", anneal: "التلدين", temp: "درجة الحرارة في البداية",
    hillNote: "يُبقي تسلّق التل التبديل فقط إن لم ترتفع الكلفة.",
    annealNote: "ويُبقي التلدين أيضًا بعض التبديلات التي تجعل الأمور أسوأ: كثيرًا ما دام ساخنًا، ونادرًا كلما برد، وأندر كلما كانت أسوأ.",
    chance: "احتمال الإبقاء", legend: "d: مقدار ارتفاع الكلفة، وT: درجة الحرارة",
    cost: "الكلفة الآن", best: "الأفضل حتى الآن", tried: "التبديلات المجرّبة", worse: "الأسوأ المقبول", t: "الحرارة",
    history: "الكلفة أثناء البحث", swaps: "آلاف التبديلات المجرّبة",
    cap: {
      ready: "اضغط «شغّل» لتبدأ التبديل من هذا الجلوس. و«ابدأ من جديد» يعطي جلوسًا عشوائيًا جديدًا.",
      running: "يبدّل…",
      stuck: (c: string) => `علق عند ${c}: لا يحسّنها أي تبديل واحد بين تلميذين. هذه قيمة صغرى محلية.`,
      cooled: (c: string) => `برد عند ${c}.`,
      best: " وهذه أفضل خطة معروفة.", notBest: (b: string) => ` وأفضل خطة معروفة كلفتها ${b}.`,
    },
    runs: "الجولات حتى الآن", runList: (m: string, list: string) => `${m}: ${list}`, list: "، ",
    try1: "مع «تسلّق التل» اضغط «شغّل»، ثم «ابدأ من جديد» و«شغّل»، أربع أو خمس مرات. يتوقّف عند كلفة مختلفة كل مرة، وكثيرًا ما تكون أعلى بكثير من ٣٧: إنه عالق.",
    try2: "انتقل إلى «التلدين» وافعل الشيء نفسه. تقفز الكلفة صعودًا وهبوطًا ما دام ساخنًا، ثم تستقر، وينتهي عند ٣٧ أكثر بكثير.",
    try3: "اجعل درجة الحرارة في البداية ٠٫٥، ثم ٦. البارد جدًا يتصرّف مثل تسلّق التل، والساخن جدًا يتجوّل طويلًا قبل أن يستقر.",
    takeaway: "يحسّن البحث المحلي الخطة خطوة بخطوة، وقد يعلق حيث يبدو كل تغيير صغير أسوأ. أما التلدين المحاكى، المسمّى على تبريد المعادن ببطء، فيقبل بعض الحركات السيئة في البداية كي يستطيع الخروج. وتستخدمه برامج الحل لترتيبات وجداول وطرق أكبر من أن يُبحث فيها كلها.",
  },
};

export default function Anneal({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [method, setMethod] = useState<"hill" | "anneal">("hill");
  const [t0, setT0] = useState(3);
  const [seed, setSeed] = useState(1);
  const [start, setStart] = useState(() => shuffled(1));
  const search = useRef<Search>(begin(start, 101, { t0: 0, iters: ITERS }));
  const [hist, setHist] = useState<[number, number][]>(() => [[0, cost(start)]]);
  const [end, setEnd] = useState<"stuck" | "cooled" | null>(null);
  const [runs, setRuns] = useState<{ hill: number[]; anneal: number[] }>({ hill: [], anneal: [] });
  useEffect(() => { if (runs.hill.length >= 2 && runs.anneal.length >= 2) onDone?.(); }, [runs.hill.length >= 2 && runs.anneal.length >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const sch = { t0: method === "hill" ? 0 : t0, iters: ITERS };
  const lastAt = useRef(0), due = useRef(0);

  const finish = (kind: "stuck" | "cooled") => { setEnd(kind); setRuns((r) => ({ ...r, [method]: [...r[method], search.current.cost].slice(-8) })); };
  const loop = useLoop(() => {
    const now = performance.now(), x = search.current;
    due.current += lastAt.current ? ((now - lastAt.current) * RATE) / 1000 : 0;
    lastAt.current = now;
    const out: [number, number][] = [];
    while (due.current >= 1 && x.iter < ITERS) {
      step(x, sch); due.current--;
      if (x.iter % SAMPLE === 0) out.push([x.iter, x.cost]);
      // Hill climbing: stop as soon as no swap can help (checked now and then; it is 66 swaps to try).
      if (sch.t0 === 0 && x.iter % 500 === 0 && stuck(x.plan)) { if (out.length) setHist((h) => [...h, ...out]); finish("stuck"); return false; }
    }
    if (out.length) setHist((h) => [...h, ...out]);
    if (x.iter >= ITERS) { finish(sch.t0 === 0 ? (stuck(x.plan) ? "stuck" : "cooled") : "cooled"); return false; }
    return true;
  }, { maxPerFrame: 1, budgetMs: 6 });
  const fresh = (plan = start, temp = sch.t0) => { loop.stop(); search.current = begin(plan, seed * 7 + 101, { t0: temp, iters: ITERS }); setHist([[0, cost(plan)]]); setEnd(null); lastAt.current = 0; due.current = 0; };
  const x = search.current, at = seatsOf(x.plan);
  const center = (seat: number) => ({ cx: 40 + (seat % COLS) * 80, cy: 62 + Math.floor(seat / COLS) * 64 });
  const n1 = (v: number) => num(Math.round(v * 100) / 100);
  const caption = end === "stuck" ? s.cap.stuck(num(x.cost)) : end === "cooled" ? s.cap.cooled(num(x.cost)) : loop.running ? s.cap.running : s.cap.ready;

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <div dir="ltr"><svg className="lb-seats" viewBox="0 0 320 230" role="img" aria-label={s.room}>
            <rect x={90} y={4} width={140} height={18} rx={4} className="lb-seat-board" />
            <text x={160} y={17} textAnchor="middle" className="lb-plot-label">{s.board}</text>
            {Array.from({ length: 12 }, (_, seat) => { const { cx, cy } = center(seat); return <rect key={seat} x={cx - 34} y={cy - 22} width={68} height={44} rx={6} className="lb-seat" />; })}
            {PAIRS.map(([a, b, w]) => { const p = center(at[a]), q = center(at[b]); return <line key={`${a}-${b}`} x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy} className="lb-seat-pair" strokeWidth={w * 1.5} />; })}
            {CHATTY.filter(([a, b]) => sideBySide(at[a], at[b])).map(([a, b]) => { const p = center(at[a]), q = center(at[b]), mx = (p.cx + q.cx) / 2; return <path key={`${a}-${b}`} d={`M${mx - 10} ${p.cy - 12} l5 6 l-5 6 l5 6 l-5 6`} className="lb-seat-chat" />; })}
            {x.plan.map((pupil, seat) => { const { cx, cy } = center(seat); return <text key={pupil} x={cx} y={cy + 5} textAnchor="middle" className="lb-seat-name">{s.pupil[PUPILS[pupil]]}</text>; })}
          </svg></div>
          <p className="lb-note">{s.room}</p>
        </div>
        <div className="stack">
          <Segmented label={s.method} value={method} options={[["hill", s.hill], ["anneal", s.anneal]]} onChange={(m) => { setMethod(m); fresh(start, m === "hill" ? 0 : t0); }} />
          {method === "anneal" && <Slider label={s.temp} value={t0} min={0.5} max={6} step={0.5} onChange={(v) => { setT0(v); fresh(start, v); }} format={n1} />}
          <p className="lb-note">{method === "hill" ? s.hillNote : s.annealNote}</p>
          {method === "anneal" && <><Formula parts={[s.chance, "=", "e^(−d / T)"]} /><p className="lb-note">{s.legend}</p></>}
          <RunBar running={loop.running} onToggle={() => { if (end) fresh(); lastAt.current = 0; loop.toggle(); }} onReset={() => { const sd = seed + 1, p = shuffled(sd); setSeed(sd); setStart(p); fresh(p); }} />
          <p className={end === "stuck" && x.cost > BEST ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{caption}{end && (x.cost <= BEST ? s.cap.best : s.cap.notBest(num(BEST)))}</p>
          <Stats items={[
            { label: s.cost, value: num(x.cost) }, { label: s.best, value: num(x.bestCost) }, { label: s.tried, value: num(x.iter) },
            ...(method === "anneal" ? [{ label: s.worse, value: num(x.worse) }, { label: s.t, value: n1(x.t) }] : []),
          ]} />
          {hist.length > 1 && (() => {
            // Thousands of swaps across, round tens up the side.
            const xs = hist.map(([i, c]) => [i / 1000, c] as const), xEnd = Math.max(1, Math.ceil(xs[xs.length - 1][0] / 10) * 10);
            const lo = Math.floor(Math.min(BEST, ...xs.map((h) => h[1])) / 10) * 10, hi = Math.max(lo + 10, Math.ceil(Math.max(...xs.map((h) => h[1])) / 10) * 10);
            return <Plot x={[0, xEnd]} y={[lo, hi]} height={150} ticks={xEnd >= 10 ? 4 : 1} yTicks={(hi - lo) / 10} label={s.history} xLabel={s.swaps} fmt={(v) => num(Math.round(v))}
              lines={[{ points: xs, tone: "b", width: 2 }, { points: [[0, BEST], [xEnd, BEST]], tone: "muted", dashed: true, width: 1.5 }]} />;
          })()}
          {(runs.hill.length > 0 || runs.anneal.length > 0) && <div className="stack-sm">
            <span className="dr-field-label">{s.runs}</span>
            {runs.hill.length > 0 && <p className="lb-note">{s.runList(s.hill, runs.hill.map((c) => num(c)).join(s.list))}</p>}
            {runs.anneal.length > 0 && <p className="lb-note">{s.runList(s.anneal, runs.anneal.map((c) => num(c)).join(s.list))}</p>}
          </div>}
        </div>
      </div>
    </LabShell>
  );
}
