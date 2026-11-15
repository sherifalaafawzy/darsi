import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Icon } from "@darsi/design-system";
import { useI18n } from "../../i18n";
import { Slider } from "./controls";
import { ltrNum } from "./Formula";
import { clamp } from "./math";
import { useKit } from "./strings";

/**
 * A small SVG chart for the labs: axes, lines, points and an optional heatmap behind them (a model's answer for every
 * spot on the plane). Kept left-to-right in both languages, like maths in a textbook; a text label describes it for
 * screen readers. Points differ by shape as well as colour.
 *
 * A chart people tap (`onPick`) also gets "Choose a spot with sliders" under it, for the keyboard and screen readers:
 * two sliders move a cross on the chart, "Next point" jumps it to each dot (or to the lab's own `targets`, with their
 * names said aloud), and "Choose this spot" picks it as a tap would. Leave it out (`picker={false}`) only when the lab
 * already has a control for the same thing.
 */
export type Tone = "a" | "b" | "c" | "ink" | "muted";
export interface Line { points: readonly (readonly [number, number])[]; tone?: Tone; dashed?: boolean; width?: number }
export interface Dot { x: number; y: number; tone?: Tone; shape?: "circle" | "square" | "triangle"; ring?: boolean; r?: number }
/** A spot "Next point" can jump to, e.g. a road's middle, with the words that name it ("Tala – Bora, 4 km"). */
export interface PickTarget { x: number; y: number; label?: string }
export interface Heat { n: number; values: ArrayLike<number> }
export interface Scale { px: (x: number) => number; py: (y: number) => number }

const W = 320, PAD = 28;

export function Plot({ x, y, lines = [], dots = [], heat, label, height = 240, xLabel, yLabel, ticks = 4, yTicks = ticks, onPick, picker = true, pickLabel, targets, children, fmt, xFmt, yFmt }: {
  x: [number, number]; y: [number, number]; lines?: Line[]; dots?: Dot[]; heat?: Heat; label: string; height?: number;
  xLabel?: string; yLabel?: string; ticks?: number; yTicks?: number; onPick?: (x: number, y: number) => void; children?: (s: Scale) => ReactNode;
  /** The sliders that pick a spot without tapping (on whenever there is `onPick`), and their button's words. */
  picker?: boolean; pickLabel?: string;
  /** Where "Next point" jumps: the dots when left out. Give them when the things people tap aren't dots (roads). */
  targets?: readonly PickTarget[];
  /** Tick labels for both axes, or each axis on its own. */
  fmt?: (v: number) => string; xFmt?: (v: number) => string; yFmt?: (v: number) => string;
}) {
  const { num } = useI18n();
  const k = useKit();
  const svg = useRef<SVGSVGElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<readonly [number, number] | null>(null);
  const [nextDot, setNextDot] = useState(0);
  const [said, setSaid] = useState("");
  const f = fmt ?? ((v: number) => num(Math.round(v * 100) / 100)), fx = xFmt ?? f, fy = yFmt ?? f;
  const tx = ticks > 0 ? Array.from({ length: ticks + 1 }, (_, i) => x[0] + ((x[1] - x[0]) * i) / ticks) : [];
  const ty = yTicks > 0 ? Array.from({ length: yTicks + 1 }, (_, i) => y[0] + ((y[1] - y[0]) * i) / yTicks) : [];
  // Tick labels are numbers in a left-to-right figure: without direction marks an Arabic negative reads "-٣", not "٣-".
  const xt = tx.map((v) => ltrNum(fx(v))), yt = ty.map((v) => ltrNum(fy(v)));
  // The left margin fits the longest y label ("10,000" needs more than the usual 28 units), so none is cut off.
  const L = Math.max(PAD, Math.ceil(10 + 6.4 * Math.max(0, ...yt.map((t) => t.length))));
  const H = height, iw = W - L - 8, ih = H - PAD - 8;
  const px = (v: number) => L + ((v - x[0]) / (x[1] - x[0])) * iw;
  const py = (v: number) => 8 + (1 - (v - y[0]) / (y[1] - y[0])) * ih;
  const heatUrl = useMemo(() => (heat ? heatToDataUrl(heat) : null), [heat]);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick || !svg.current) return;
    const ctm = svg.current.getScreenCTM(); if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const dx = x[0] + ((p.x - L) / iw) * (x[1] - x[0]), dy = y[0] + (1 - (p.y - 8) / ih) * (y[1] - y[0]);
    if (dx >= x[0] && dx <= x[1] && dy >= y[0] && dy <= y[1]) onPick(dx, dy);
  };
  // The keyboard cross: the middle of the chart until a slider or "Next point" moves it.
  const pickable = !!onPick && picker;
  const cx = clamp(at?.[0] ?? (x[0] + x[1]) / 2, x[0], x[1]), cy = clamp(at?.[1] ?? (y[0] + y[1]) / 2, y[0], y[1]);
  const spots: readonly PickTarget[] = targets ?? dots;
  const jump = () => {
    if (!spots.length) return;
    const d = spots[nextDot % spots.length];
    setAt([d.x, d.y]); setNextDot((nextDot % spots.length) + 1); setSaid(d.label ?? "");
  };
  // Moving a slider leaves the named spot, so its name goes.
  const move = (p: readonly [number, number]) => { setAt(p); setSaid(""); };
  const figure = (
    <figure className="lb-plot" dir="ltr">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerDown={pick} className={onPick ? "lb-plot-svg is-pick" : "lb-plot-svg"}>
        <rect x={L} y={8} width={iw} height={ih} className="lb-plot-bg" />
        {heatUrl && <image href={heatUrl} x={L} y={8} width={iw} height={ih} preserveAspectRatio="none" />}
        {tx.map((v, i) => <line key={`x${i}`} x1={px(v)} x2={px(v)} y1={8} y2={8 + ih} className="lb-plot-grid" />)}
        {ty.map((v, i) => <line key={`y${i}`} y1={py(v)} y2={py(v)} x1={L} x2={L + iw} className="lb-plot-grid" />)}
        {tx.map((v, i) => <text key={`tx${i}`} x={px(v)} y={H - 10} textAnchor="middle" className="lb-plot-tick">{xt[i]}</text>)}
        {ty.map((v, i) => <text key={`ty${i}`} x={L - 4} y={py(v) + 4} textAnchor="end" className="lb-plot-tick">{yt[i]}</text>)}
        {lines.map((l, i) => <polyline key={i} points={l.points.map(([a, b]) => `${px(a)},${py(b)}`).join(" ")} className={`lb-plot-line lb-tone-${l.tone ?? "ink"}`} strokeWidth={l.width ?? 2.5} strokeDasharray={l.dashed ? "6 5" : undefined} />)}
        {children?.({ px, py })}
        {dots.map((d, i) => <Marker key={i} d={d} cx={px(d.x)} cy={py(d.y)} />)}
        {pickable && open && <g className="lb-plot-cross"><line x1={px(cx)} x2={px(cx)} y1={8} y2={8 + ih} /><line x1={L} x2={L + iw} y1={py(cy)} y2={py(cy)} /><circle cx={px(cx)} cy={py(cy)} r={9} /></g>}
      </svg>
      {/* One isolate per axis, so in Arabic each arrow stays beside its own label instead of swapping places. */}
      {(xLabel || yLabel) && <figcaption className="lb-plot-cap">{yLabel && <span>↑ <bdi>{yLabel}</bdi></span>}{xLabel && <span>→ <bdi>{xLabel}</bdi></span>}</figcaption>}
    </figure>
  );
  if (!pickable) return figure;
  return (
    <div className="lb-plot-box">
      {figure}
      <details className="lb-pick" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary><span>{k.pickOpen}</span><Icon name={open ? "up" : "down"} size={20} /></summary>
        <div className="lb-pick-body">
          {/* Left to right like the chart's axes, whatever the page's direction. */}
          <Slider dir="ltr" label={xLabel ?? k.pickX} value={cx} min={x[0]} max={x[1]} step={(x[1] - x[0]) / 100} format={fx} onChange={(v) => move([v, cy])} />
          <Slider dir="ltr" label={yLabel ?? k.pickY} value={cy} min={y[0]} max={y[1]} step={(y[1] - y[0]) / 100} format={fy} onChange={(v) => move([cx, v])} />
          {/* The named spot "Next point" reached, read out as it changes. Full-size buttons: 48 px, past the labs' 44. */}
          <p className="lb-note" aria-live="polite">{said}</p>
          <div className="lb-row">
            {spots.length > 0 && <Button variant="secondary" icon="next" onClick={jump}>{k.pickNext}</Button>}
            <Button icon="target" onClick={() => onPick?.(cx, cy)}>{pickLabel ?? k.pickHere}</Button>
          </div>
        </div>
      </details>
    </div>
  );
}

function Marker({ d, cx, cy }: { d: Dot; cx: number; cy: number }) {
  const r = d.r ?? 6, cls = `lb-plot-dot lb-tone-${d.tone ?? "ink"}${d.ring ? " is-ring" : ""}`;
  if (d.shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} className={cls} />;
  if (d.shape === "triangle") return <polygon points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r * 0.8} ${cx - r * 1.1},${cy + r * 0.8}`} className={cls} />;
  return <circle cx={cx} cy={cy} r={r} className={cls} />;
}

/* ---------- Labels ---------- */

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlap = (p: Box, q: Box) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));

/**
 * Places text labels beside their points so that none covers another label or any point. Works in SVG units: `w` is a
 * label's width and `h` its height above the baseline (14 when left out; `labelSize` gives both). Labels with a lower
 * `rank` are placed first, so they get the spots nearest their points. Each label takes the free spot nearest its
 * point, looking further out ring by ring, or the least covered spot when the chart is too full.
 * Returns each label's start (x) and baseline (y), and `lead`, the point of the label nearest its point, when the
 * label sits too far away to read as its point's without a line (draw one from the point to `lead`).
 */
export function spreadLabels(anchors: { x: number; y: number; w: number; h?: number; rank?: number }[], box: Box) {
  const dots: Box[] = anchors.map((a) => ({ x0: a.x - 5, y0: a.y - 5, x1: a.x + 5, y1: a.y + 5 }));
  const placed: Box[] = [], out: { x: number; y: number; lead: readonly [number, number] | null }[] = new Array(anchors.length);
  const order = anchors.map((_, i) => i).sort((p, q) => (anchors[p].rank ?? 0) - (anchors[q].rank ?? 0) || p - q);
  for (const i of order) {
    const a = anchors[i], w = a.w, h = a.h ?? 14, spots: { r: Box; d: number }[] = [];
    const spot = (x: number, base: number, bias = 0) => {
      const x0 = Math.min(box.x1 - w, Math.max(box.x0, x)), y1 = Math.min(box.y1, Math.max(box.y0 + h, base));
      const r = { x0, y0: y1 - h, x1: x0 + w, y1 };
      spots.push({ r, d: Math.hypot(Math.min(r.x1, Math.max(r.x0, a.x)) - a.x, Math.min(r.y1, Math.max(r.y0, a.y)) - a.y) + bias });
    };
    spot(a.x + 6, a.y - 4, -100); // up and to the right of the point, as before, whenever it is free
    for (let rad = 0; rad <= 100; rad += 4) for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2, cx = a.x + Math.cos(t) * (rad + w / 2 + 6), cy = a.y + Math.sin(t) * (rad + h / 2 + 4);
      spot(cx - w / 2, cy + h / 2);
    }
    spots.sort((p, q) => p.d - q.d);
    let best = spots[0], least = Infinity;
    for (const s of spots) {
      let cost = 0;
      for (const p of placed) cost += overlap(p, s.r);
      for (const d of dots) cost += overlap(d, s.r) / 2;
      if (cost < least) { least = cost; best = s; if (!cost) break; }
    }
    placed.push(best.r);
    const r = best.r, lx = Math.min(r.x1, Math.max(r.x0, a.x)), ly = Math.min(r.y1, Math.max(r.y0, a.y));
    out[i] = { x: r.x0, y: r.y1, lead: Math.hypot(lx - a.x, ly - a.y) > 10 ? [lx, ly] : null };
  }
  return out;
}

// Scripts whose letters reach well above and below the line (Arabic, with its dots and marks): their labels need more
// room between lines than Latin ones.
const TALL = /\p{Script=Arabic}/u;
let measurer: CanvasRenderingContext2D | null | undefined;

/**
 * A chart label's width and the height spreadLabels should keep free above its baseline, in SVG units, for text drawn
 * at `size` px (the labels' 12, or 13 bold when picked out). The width is measured in the page's own font when the
 * browser can (Arabic fonts run wider than a Latin guess), else estimated.
 */
export function labelSize(text: string, size = 12, bold = false): { w: number; h: number } {
  if (measurer === undefined) {
    try { measurer = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d"); } catch { measurer = null; }
  }
  let w = 0;
  if (measurer) {
    measurer.font = `${bold ? 700 : 400} ${size}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    w = Math.ceil(measurer.measureText(text).width);
  }
  return { w: w || Math.ceil(text.length * size * 0.6), h: Math.round(size * (TALL.test(text) ? 1.7 : 1.17)) };
}

/* ---------- Heatmaps ---------- */

const cssColor = (name: string, fallback: [number, number, number]): [number, number, number] => {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v)?.[1];
  return hex ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] : fallback;
};
let palette: { lo: [number, number, number]; hi: [number, number, number] } | null = null;
let scratch: HTMLCanvasElement | null = null;

/** values[row * n + col], row 0 at the top, each in [0, 1]: 0 shades towards tone "a", 1 towards tone "b". */
export function heatToDataUrl({ n, values }: Heat): string | null {
  if (typeof document === "undefined") return null;
  palette ??= { lo: cssColor("--lagoon-soft", [200, 236, 232]), hi: cssColor("--kola-soft", [255, 224, 204]) };
  scratch ??= document.createElement("canvas");
  scratch.width = n; scratch.height = n;
  const ctx = scratch.getContext("2d"); if (!ctx) return null;
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const t = Math.min(1, Math.max(0, values[i]));
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = Math.round(palette.lo[c] + (palette.hi[c] - palette.lo[c]) * t);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return scratch.toDataURL();
}
