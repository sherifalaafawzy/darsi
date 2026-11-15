import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../../../i18n";
import { LabShell } from "../../kit/LabShell";
import { Segmented, Stats } from "../../kit/controls";
import { Plot } from "../../kit/Plot";
import { useS } from "../../kit/strings";
import { useLoop } from "../../kit/useLoop";
import type { LabProps } from "../../types";
import { BRIDGE, HOME, ROADS, routeTo, SCHOOL, settle, smallest, start, VILLAGES, waiting, type State } from "./model";

const S = {
  en: {
    intro: "Find the shortest way from home to school. Each road shows how long it is. Each village's number is the shortest way found so far. Tap the waiting village with the smallest number: that number can't get any smaller, so it is settled.",
    name: { home: "Home", tala: "Tala", bora: "Bora", kesi: "Kesi", mina: "Mina", rubi: "Rubi", sana: "Sana", school: "School" } as Record<string, string>,
    map: "The villages and roads; numbers on roads are kilometres, numbers in circles are the shortest way found so far", km: (n: string) => `${n} km`,
    tapTo: "Tap the map to", settleIt: "Settle the next village", road: "Close or open a road",
    waitH: "Waiting villages (tap one)", none: "None",
    cap: {
      start: "Home is 0 km from home. Tap Home to start.",
      settled: (v: string, d: string, list: string) => `${v} is settled: ${d}. Its roads gave new numbers to ${list}.`,
      settledNone: (v: string, d: string) => `${v} is settled: ${d}. None of its roads made a number smaller.`,
      notYet: (v: string, d: string, w: string, e: string) => `Not yet: ${v} has ${d}, but ${w} has ${e}, a smaller number. Settle the smallest first.`,
      already: (v: string) => `${v} is already settled: its number is final.`,
      noNumber: (v: string) => `${v} has no number yet: no road from a settled village reaches it.`,
      done: (d: string, route: string) => `The school is settled: the shortest way is ${d}: ${route}.`,
      cut: "The school can't be reached: every road there is closed.",
      closed: (a: string, b: string) => `The road between ${a} and ${b} is closed. Start again from Home.`,
      opened: (a: string, b: string) => `The road between ${a} and ${b} is open again. Start again from Home.`,
    },
    arrow: " → ", and: ", ", showStep: "Show me one step", showAll: "Show me all", pause: "Pause", again: "Start again", flood: "Flood the bridge",
    settledN: "Settled", schoolN: "School", of: (a: string, b: string) => `${a} of ${b}`,
    try1: "Tap Home, then always tap the waiting village with the smallest number. When the school is settled, the shortest way lights up: 13 km.",
    try2: "Press “Flood the bridge” (the road between Kesi and Mina closes) and find the way again: now it's 14 km, by Rubi and Sana.",
    try3: "Before you start, guess the shortest way by looking. The road that looks straightest, through Bora, is 15 km: not the shortest!",
    takeaway: "This is Dijkstra's method (1956). It always settles the closest village first, so it never has to go back. Map apps, delivery vans and internet routers use it, or faster versions of it, every second.",
  },
  ar: {
    intro: "جِد أقصر طريق من البيت إلى المدرسة. على كل طريق طوله. ورقم كل قرية هو أقصر طريق وُجد إليها حتى الآن. المس القرية المنتظرة ذات الرقم الأصغر: لا يمكن أن يصغر رقمها بعد ذلك، فيصير نهائيًا.",
    name: { home: "البيت", tala: "تالا", bora: "بورا", kesi: "كيسي", mina: "مينا", rubi: "روبي", sana: "سانا", school: "المدرسة" } as Record<string, string>,
    map: "القرى والطرق: الأرقام على الطرق بالكيلومتر، والأرقام في الدوائر أقصر طريق وُجد حتى الآن", km: (n: string) => `${n} كم`,
    tapTo: "المس الخريطة لـ", settleIt: "جعل رقم القرية التالية نهائيًا", road: "إغلاق طريق أو فتحه",
    waitH: "القرى المنتظرة (المس واحدة)", none: "لا شيء",
    cap: {
      start: "البيت على بعد ٠ كم من البيت. المس البيت لتبدأ.",
      settled: (v: string, d: string, list: string) => `صار رقم ${v} نهائيًا: ${d}. والطرق من هناك أعطت أرقامًا جديدة لـ ${list}.`,
      settledNone: (v: string, d: string) => `صار رقم ${v} نهائيًا: ${d}. ولم تجعل الطرق من هناك أي رقم أصغر.`,
      notYet: (v: string, d: string, w: string, e: string) => `ليس بعد: رقم ${v} هو ${d}، لكن رقم ${w} هو ${e}، وهو أصغر. ثبّت الأصغر أولًا.`,
      already: (v: string) => `رقم ${v} نهائي من قبل.`,
      noNumber: (v: string) => `ليس لـ ${v} رقم بعد: لا يصل إلى هناك أي طريق من مكان رقمه نهائي.`,
      done: (d: string, route: string) => `صار رقم المدرسة نهائيًا: أقصر طريق هو ${d}: ${route}.`,
      cut: "لا يمكن الوصول إلى المدرسة: كل الطرق إليها مغلقة.",
      closed: (a: string, b: string) => `أُغلق الطريق بين ${a} و${b}. ابدأ من جديد من البيت.`,
      opened: (a: string, b: string) => `فُتح الطريق بين ${a} و${b} من جديد. ابدأ من جديد من البيت.`,
    },
    arrow: " ← ", and: "، ", showStep: "أرِني خطوة", showAll: "أرِني الكل", pause: "أوقف مؤقتًا", again: "ابدأ من جديد", flood: "أغرِق الجسر",
    settledN: "أرقام نهائية", schoolN: "المدرسة", of: (a: string, b: string) => `${a} من ${b}`,
    try1: "المس البيت، ثم المس دائمًا القرية المنتظرة ذات الرقم الأصغر. حين يصير رقم المدرسة نهائيًا يضيء أقصر طريق: ١٣ كم.",
    try2: "اضغط «أغرِق الجسر» (يُغلق الطريق بين كيسي ومينا) وجِد الطريق من جديد: صار ١٤ كم، عبر روبي وسانا.",
    try3: "قبل أن تبدأ، خمّن أقصر طريق بالنظر. الطريق الذي يبدو أكثر استقامة، عبر بورا، طوله ١٥ كم: ليس الأقصر!",
    takeaway: "هذه طريقة ديكسترا (١٩٥٦). تحسم دائمًا أقرب قرية أولًا، فلا تحتاج أبدًا إلى الرجوع. وتستخدمها تطبيقات الخرائط وسيارات التوصيل وموجّهات الإنترنت، أو نسخًا أسرع منها، في كل ثانية.",
  },
};

export default function Shortest({ meta, onDone }: LabProps) {
  const s = useS(S);
  const { num } = useI18n();
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const [st, setSt] = useState<State>(() => start(VILLAGES.length));
  const [mode, setMode] = useState<"settle" | "road">("settle");
  const [msg, setMsg] = useState<string>(s.cap.start);
  const [finishes, setFinishes] = useState(0);
  useEffect(() => { if (finishes >= 2) onDone?.(); }, [finishes >= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (i: number) => s.name[VILLAGES[i].id];
  const km = (d: number) => s.km(num(d));
  const stRef = useRef(st); stRef.current = st;
  const reset = (c: ReadonlySet<number> = closed) => { setSt(start(VILLAGES.length, c)); setMsg(s.cap.start); };

  const doSettle = (v: number, cur: State = stRef.current): State | null => {
    if (cur.done[v]) { setMsg(s.cap.already(name(v))); return null; }
    if (cur.dist[v] === Infinity) { setMsg(s.cap.noNumber(name(v))); return null; }
    const lo = smallest(cur);
    if (!lo.includes(v)) { setMsg(s.cap.notYet(name(v), km(cur.dist[v]), name(lo[0]), km(cur.dist[lo[0]]))); return null; }
    const { state, better } = settle(cur, v);
    const got = better.map((k) => (ROADS[k].a === v ? ROADS[k].b : ROADS[k].a));
    setSt(state); stRef.current = state;
    if (v === SCHOOL) { setMsg(s.cap.done(km(state.dist[SCHOOL]), routeTo(state, SCHOOL).map(name).join(s.arrow))); setFinishes((f) => f + 1); }
    else if (!waiting(state).length) setMsg(s.cap.cut);
    else setMsg(got.length ? s.cap.settled(name(v), km(state.dist[v]), got.map((u) => `${name(u)} (${km(state.dist[u])})`).join(s.and)) : s.cap.settledNone(name(v), km(state.dist[v])));
    return state;
  };
  const toggleRoad = (k: number) => {
    const next = new Set(closed); const was = next.has(k);
    if (was) next.delete(k); else next.add(k);
    setClosed(next); setSt(start(VILLAGES.length, next));
    setMsg((was ? s.cap.opened : s.cap.closed)(name(ROADS[k].a), name(ROADS[k].b)));
  };
  const finished = st.done[SCHOOL] || (!waiting(st).length && st.last >= 0);
  const lastAt = useRef(0);
  const loop = useLoop(() => {
    const now = performance.now();
    if (lastAt.current && now - lastAt.current < 900) return true;
    lastAt.current = now;
    const cur = stRef.current;
    if (cur.done[SCHOOL] || !waiting(cur).length) return false;
    const next = doSettle(smallest(cur)[0], cur);
    return !!next && !next.done[SCHOOL] && waiting(next).length > 0;
  }, { maxPerFrame: 1 });

  const pick = (x: number, y: number) => {
    const v = VILLAGES.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 0.8);
    if (mode === "settle") { if (v >= 0 && !loop.running) doSettle(v); return; }
    let best = -1, bd = 0.9;
    ROADS.forEach((r, k) => { const a = VILLAGES[r.a], b = VILLAGES[r.b], d = Math.hypot((a.x + b.x) / 2 - x, (a.y + b.y) / 2 - y); if (d < bd) { bd = d; best = k; } });
    if (best >= 0) { loop.stop(); toggleRoad(best); }
  };
  const path = useMemo(() => (st.done[SCHOOL] ? routeTo(st, SCHOOL) : []), [st]);
  const onPath = new Set(path.slice(1).map((v, i) => `${Math.min(v, path[i])}-${Math.max(v, path[i])}`));
  const next = new Set(finished ? [] : smallest(st));
  const wait = waiting(st).sort((a, b) => st.dist[a] - st.dist[b]);

  return (
    <LabShell meta={meta} intro={s.intro} tries={[s.try1, s.try2, s.try3]} takeaway={s.takeaway}>
      <div className="lb-two">
        <div className="stack">
          <Plot x={[0, 10]} y={[0, 10]} ticks={0} height={300} label={s.map} onPick={pick}
            // Without a tap, "Next point" goes from village to village, or from road to road (their middles) to close one.
            targets={mode === "road"
              ? ROADS.map((r) => ({ x: (VILLAGES[r.a].x + VILLAGES[r.b].x) / 2, y: (VILLAGES[r.a].y + VILLAGES[r.b].y) / 2, label: `${name(r.a)} – ${name(r.b)}${s.and}${km(r.km)}` }))
              : VILLAGES.map((v, i) => ({ x: v.x, y: v.y, label: name(i) }))}>
            {({ px, py }) => <>
              {ROADS.map((r, k) => {
                const a = VILLAGES[r.a], b = VILLAGES[r.b], mx = (px(a.x) + px(b.x)) / 2, my = (py(a.y) + py(b.y)) / 2;
                const cls = closed.has(k) ? "lb-road is-closed" : onPath.has(`${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`) ? "lb-road is-best" : "lb-road";
                return <g key={k}>
                  <line x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} className={cls} />
                  <text x={mx} y={my + 4} textAnchor="middle" className="lb-road-km">{closed.has(k) ? "✕" : num(r.km)}</text>
                </g>;
              })}
              {VILLAGES.map((v, i) => {
                const cls = ["lb-vil", st.done[i] ? "is-done" : st.dist[i] < Infinity ? "is-wait" : "", next.has(i) && mode === "settle" ? "is-next" : "", i === SCHOOL || i === HOME ? "is-end" : ""].filter(Boolean).join(" ");
                return <g key={v.id}>
                  <circle cx={px(v.x)} cy={py(v.y)} r={14} className={cls} />
                  <text x={px(v.x)} y={py(v.y) + 5} textAnchor="middle" className="lb-vil-num">{st.dist[i] === Infinity ? "∞" : num(st.dist[i])}</text>
                  <text x={px(v.x)} y={py(v.y) + (v.y > 8 ? -19 : 29)} textAnchor="middle" className="lb-plot-label is-on">{name(i)}</text>
                </g>;
              })}
            </>}
          </Plot>
          <p className="lb-note">{s.map}</p>
          <Segmented label={s.tapTo} value={mode} options={[["settle", s.settleIt], ["road", s.road]]} onChange={setMode} />
        </div>
        <div className="stack">
          <p className={finished && !st.done[SCHOOL] ? "lb-verdict is-warn" : "lb-verdict"} aria-live="polite">{msg}</p>
          <span className="dr-field-label">{s.waitH}</span>
          <div className="lb-row">
            {wait.length ? wait.map((i) => <Button key={i} size="sm" variant={next.has(i) ? "primary" : "secondary"} disabled={loop.running} onClick={() => doSettle(i)}>{`${name(i)}: ${km(st.dist[i])}`}</Button>) : <span className="lb-note">{s.none}</span>}
          </div>
          <div className="lb-row">
            <Button size="sm" variant="secondary" icon="next" disabled={finished || loop.running} onClick={() => doSettle(smallest(st)[0])}>{s.showStep}</Button>
            <Button size="sm" variant="secondary" icon={loop.running ? "pause" : "play"} disabled={finished && !loop.running} onClick={() => { lastAt.current = 0; loop.toggle(); }}>{loop.running ? s.pause : s.showAll}</Button>
            <Button size="sm" variant="ghost" icon="sync" onClick={() => { loop.stop(); reset(); }}>{s.again}</Button>
          </div>
          <div className="lb-row"><Button size="sm" variant="secondary" icon="warning" aria-pressed={closed.has(BRIDGE)} onClick={() => { loop.stop(); toggleRoad(BRIDGE); }}>{s.flood}</Button></div>
          <Stats items={[{ label: s.settledN, value: s.of(num(st.done.filter(Boolean).length), num(VILLAGES.length)) }, { label: s.schoolN, value: st.dist[SCHOOL] === Infinity ? "∞" : km(st.dist[SCHOOL]) }]} />
        </div>
      </div>
    </LabShell>
  );
}
