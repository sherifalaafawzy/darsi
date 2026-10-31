import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { RunBar, Segmented } from "../../kit/controls";
import { useS } from "../../kit/strings";
import type { LabProps } from "../../types";
import { ALGOS, makeBars, ops, pace, replay, type Algo, type Order } from "./model";

const S = {
  en: {
    intro: "Four ways to put the same bars in order, smallest to tallest. Each takes one step at the same pace: comparing two bars, or moving one. The fewer steps, the sooner it finishes.",
    bars: "Bars", order: "Starting order", random: "Mixed up", nearly: "Nearly sorted", reversed: "Back to front", run: "Start the race",
    name: { bubble: "Bubble sort", insertion: "Insertion sort", selection: "Selection sort", merge: "Merge sort" } as Record<Algo, string>,
    how: {
      bubble: "Swaps neighbours that are out of order, pass after pass.", insertion: "Slides each new bar back into its place.",
      selection: "Finds the smallest bar left and swaps it into place.", merge: "Sorts each half, then merges the two halves.",
    } as Record<Algo, string>,
    cmps: "Comparisons", swaps: "Swaps", copies: "Copies", places: ["1st", "2nd", "3rd", "4th"], finished: (p: string) => `Finished ${p}`,
    lane: (name: string, c: string, m: string) => `${name}: ${c} comparisons, ${m} moves`,
    try1: "Race with 8 bars, then with 32. Four times the bars: bubble sort needs about 16 times the comparisons, merge sort only about 6 times.",
    try2: "Choose “Nearly sorted”: insertion sort wins, because almost every bar is already in place.",
    try3: "Watch selection sort: always the most comparisons, but the fewest swaps. Useful when moving things is slow.",
    takeaway: "Every sorting method gets the same answer, but the work differs hugely. Merge sort's work grows like n log n, the simple ones' like n², and the best choice can depend on the data: nearly sorted lists suit insertion sort.",
  },
  ar: {
    intro: "أربع طرق لترتيب الأعمدة نفسها من الأقصر إلى الأطول. تأخذ كلٌّ منها خطوة واحدة بالسرعة نفسها: مقارنة عمودين أو نقل عمود. وكلما قلّت الخطوات انتهت أسرع.",
    bars: "الأعمدة", order: "الترتيب في البداية", random: "مختلطة", nearly: "شبه مرتّبة", reversed: "معكوسة", run: "ابدأ السباق",
    name: { bubble: "الترتيب الفقاعي", insertion: "الترتيب بالإدراج", selection: "الترتيب بالاختيار", merge: "الترتيب بالدمج" } as Record<Algo, string>,
    how: {
      bubble: "يبدّل كل عمودين متجاورين في غير ترتيبهما، جولة بعد جولة.", insertion: "يُرجع كل عمود جديد إلى مكانه بين ما سبقه.",
      selection: "يجد أقصر عمود متبقٍّ ويبدّله إلى مكانه.", merge: "يرتّب كل نصف، ثم يدمج النصفين.",
    } as Record<Algo, string>,
    cmps: "المقارنات", swaps: "التبديلات", copies: "النقلات", places: ["الأول", "الثاني", "الثالث", "الرابع"], finished: (p: string) => `انتهى في المركز ${p}`,
    lane: (name: string, c: string, m: string) => `${name}: المقارنات ${c}، والنقلات ${m}`,
    try1: "سابق بـ٨ أعمدة ثم بـ٣٢. أربعة أضعاف الأعمدة: يحتاج الترتيب الفقاعي إلى نحو ١٦ ضعف المقارنات، والترتيب بالدمج إلى نحو ٦ أضعاف فقط.",
    try2: "اختر «شبه مرتّبة»: يفوز الترتيب بالإدراج، لأن كل عمود تقريبًا في مكانه أصلًا.",
    try3: "راقب الترتيب بالاختيار: له دائمًا أكثر المقارنات، لكن أقل التبديلات. وهذا مفيد حين يكون نقل الأشياء بطيئًا.",
    takeaway: "كل طرق الترتيب تصل إلى النتيجة نفسها، لكن الجهد يختلف كثيرًا. فجهد الترتيب بالدمج ينمو مثل n log n، وجهد الطرق البسيطة مثل n²، وقد يعتمد أفضل اختيار على البيانات: فالقوائم شبه المرتّبة تناسب الترتيب بالإدراج.",
  },
};
const H = 60;

function Lane({ algo, bars, k }: { algo: Algo; bars: number[]; k: number }) {
  const s = useS(S);
  const { num } = useI18n();
  const steps = useMemo(() => ops(algo, bars), [algo, bars]);
  const r = replay(bars, steps, k), n = bars.length, w = 10;
  const hot = new Set(r.done || !r.last ? [] : r.last.t === "set" ? [r.last.i] : [r.last.i, r.last.j]);
  const cls = (i: number) => (r.done ? "lb-sort-bar is-done" : hot.has(i) ? (r.last!.t === "cmp" ? "lb-sort-bar is-cmp" : "lb-sort-bar is-move") : "lb-sort-bar");
  return (
    <figure className="lb-sort-lane">
      <figcaption><strong>{s.name[algo]}</strong> <span className="lb-note">{s.how[algo]}</span></figcaption>
      <svg className="lb-sort-svg" viewBox={`0 0 ${n * w} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={s.lane(s.name[algo], num(r.cmps), num(r.moves))}>
        {r.bars.map((v, i) => <rect key={i} x={i * w + 1} y={H - (v / n) * H} width={w - 2} height={(v / n) * H} className={cls(i)} />)}
      </svg>
      <dl className="lb-sort-stats">
        <div><dt>{s.cmps}</dt><dd>{num(r.cmps)}</dd></div>
        <div><dt>{algo === "merge" ? s.copies : s.swaps}</dt><dd>{num(r.moves)}</dd></div>
      </dl>
    </figure>
  );
}

export default function Sorting({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [n, setN] = useState(16);
  const [order, setOrder] = useState<Order>("random");
  const [k, setK] = useState(0);
  const [clock, setClock] = useState<{ t0: number; k0: number } | null>(null); // set while running
  const [races, setRaces] = useState(new Set<string>());
  const bars = useMemo(() => makeBars(n, order), [n, order]);
  const lengths = useMemo(() => ALGOS.map((a) => ops(a, bars).length), [bars]);
  const most = Math.max(...lengths);
  const finished = k >= most;
  const rank = (i: number) => lengths.filter((l) => l < lengths[i]).length;

  // Playback paced by time: the same number of steps a second on any phone, ten redraws a second; stops at the end.
  useEffect(() => {
    if (!clock) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setK(most); setClock(null); return; }
    const rate = pace(most);
    const id = setInterval(() => {
      const v = Math.min(most, clock.k0 + Math.floor(((performance.now() - clock.t0) / 1000) * rate));
      setK(v);
      if (v >= most || document.hidden) { clearInterval(id); setClock(null); }
    }, 100);
    return () => clearInterval(id);
  }, [clock, most]);
  useEffect(() => { if (finished) setRaces((x) => new Set(x).add(`${n}${order}`)); }, [finished, n, order]);
  useEffect(() => { if (races.size >= 2) onDone?.(); }, [races.size >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setClock(null); setK(0); };
  const toggle = () => { if (clock) setClock(null); else setClock({ t0: performance.now(), k0: finished ? 0 : k }); if (finished) setK(0); };

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <Segmented label={s.bars} value={n} onChange={(v) => { setN(v); reset(); }} options={[8, 16, 32].map((v) => [v, num(v)] as const)} />
        <Segmented label={s.order} value={order} onChange={(v) => { setOrder(v); reset(); }} options={[["random", s.random], ["nearly", s.nearly], ["reversed", s.reversed]]} />
      </div>
      <RunBar running={!!clock} onToggle={toggle} onReset={reset} runLabel={s.run} />
      <div className="lb-sort-grid">
        {ALGOS.map((a, i) => (
          <div key={a} className="lb-sort-cell">
            <Lane algo={a} bars={bars} k={k} />
            {k >= lengths[i] && k > 0 && <p className="lb-sort-place">{s.finished(s.places[rank(i)])}</p>}
          </div>
        ))}
      </div>
    </LabShell>
  );
}
