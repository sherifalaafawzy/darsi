import { useMemo, useRef, type ReactNode } from "react";
import { useI18n } from "../../i18n";

/**
 * A small SVG chart for the labs: axes, lines, points and an optional heatmap behind them (a model's answer for every
 * spot on the plane). Kept left-to-right in both languages, like maths in a textbook; a text label describes it for
 * screen readers. Points differ by shape as well as colour.
 */
export type Tone = "a" | "b" | "c" | "ink" | "muted";
export interface Line { points: readonly (readonly [number, number])[]; tone?: Tone; dashed?: boolean; width?: number }
export interface Dot { x: number; y: number; tone?: Tone; shape?: "circle" | "square" | "triangle"; ring?: boolean; r?: number }
export interface Heat { n: number; values: ArrayLike<number> }
export interface Scale { px: (x: number) => number; py: (y: number) => number }

const W = 320, PAD = 28;

export function Plot({ x, y, lines = [], dots = [], heat, label, height = 240, xLabel, yLabel, ticks = 4, yTicks = ticks, onPick, children, fmt, xFmt, yFmt }: {
  x: [number, number]; y: [number, number]; lines?: Line[]; dots?: Dot[]; heat?: Heat; label: string; height?: number;
  xLabel?: string; yLabel?: string; ticks?: number; yTicks?: number; onPick?: (x: number, y: number) => void; children?: (s: Scale) => ReactNode;
  /** Tick labels for both axes, or each axis on its own. */
  fmt?: (v: number) => string; xFmt?: (v: number) => string; yFmt?: (v: number) => string;
}) {
  const { num } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const f = fmt ?? ((v: number) => num(Math.round(v * 100) / 100)), fx = xFmt ?? f, fy = yFmt ?? f;
  const tx = ticks > 0 ? Array.from({ length: ticks + 1 }, (_, i) => x[0] + ((x[1] - x[0]) * i) / ticks) : [];
  const ty = yTicks > 0 ? Array.from({ length: yTicks + 1 }, (_, i) => y[0] + ((y[1] - y[0]) * i) / yTicks) : [];
  // The left margin fits the longest y label ("10,000" needs more than the usual 28 units), so none is cut off.
  const L = Math.max(PAD, Math.ceil(10 + 6.4 * Math.max(0, ...ty.map((v) => fy(v).length))));
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
  return (
    <figure className="lb-plot" dir="ltr">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerDown={pick} className={onPick ? "lb-plot-svg is-pick" : "lb-plot-svg"}>
        <rect x={L} y={8} width={iw} height={ih} className="lb-plot-bg" />
        {heatUrl && <image href={heatUrl} x={L} y={8} width={iw} height={ih} preserveAspectRatio="none" />}
        {tx.map((v, i) => <line key={`x${i}`} x1={px(v)} x2={px(v)} y1={8} y2={8 + ih} className="lb-plot-grid" />)}
        {ty.map((v, i) => <line key={`y${i}`} y1={py(v)} y2={py(v)} x1={L} x2={L + iw} className="lb-plot-grid" />)}
        {tx.map((v, i) => <text key={`tx${i}`} x={px(v)} y={H - 10} textAnchor="middle" className="lb-plot-tick">{fx(v)}</text>)}
        {ty.map((v, i) => <text key={`ty${i}`} x={L - 4} y={py(v) + 4} textAnchor="end" className="lb-plot-tick">{fy(v)}</text>)}
        {lines.map((l, i) => <polyline key={i} points={l.points.map(([a, b]) => `${px(a)},${py(b)}`).join(" ")} className={`lb-plot-line lb-tone-${l.tone ?? "ink"}`} strokeWidth={l.width ?? 2.5} strokeDasharray={l.dashed ? "6 5" : undefined} />)}
        {children?.({ px, py })}
        {dots.map((d, i) => <Marker key={i} d={d} cx={px(d.x)} cy={py(d.y)} />)}
      </svg>
      {(xLabel || yLabel) && <figcaption className="lb-plot-cap">{[yLabel && `↑ ${yLabel}`, xLabel && `→ ${xLabel}`].filter(Boolean).join("   ")}</figcaption>}
    </figure>
  );
}

function Marker({ d, cx, cy }: { d: Dot; cx: number; cy: number }) {
  const r = d.r ?? 6, cls = `lb-plot-dot lb-tone-${d.tone ?? "ink"}${d.ring ? " is-ring" : ""}`;
  if (d.shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} className={cls} />;
  if (d.shape === "triangle") return <polygon points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r * 0.8} ${cx - r * 1.1},${cy + r * 0.8}`} className={cls} />;
  return <circle cx={cx} cy={cy} r={r} className={cls} />;
}

/* ---------- Labels ---------- */

/**
 * Moves text labels apart so they don't cover each other, each pulled back towards its point. Works in SVG units;
 * `w` is the label's width. Returns the start (x) and baseline (y) of each label.
 */
export function spreadLabels(anchors: { x: number; y: number; w: number }[], box: { x0: number; y0: number; x1: number; y1: number }, iters = 250) {
  const H = 14, pos = anchors.map((a) => ({ x: a.x + 6, y: a.y - 4 }));
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j];
      const ox = Math.min(a.x + anchors[i].w, b.x + anchors[j].w) - Math.max(a.x, b.x), oy = Math.min(a.y, b.y) - Math.max(a.y - H, b.y - H);
      if (ox <= 0 || oy <= 0) continue;
      // Push apart along the shorter overlap (usually up and down), half each.
      if (oy < ox) { const d = (oy / 2 + 0.5) * (a.y < b.y || (a.y === b.y && i < j) ? -1 : 1); a.y += d; b.y -= d; }
      else { const d = (ox / 2 + 0.5) * (a.x < b.x ? -1 : 1); a.x += d; b.x -= d; }
    }
    pos.forEach((p, i) => {
      p.x += (anchors[i].x + 6 - p.x) * 0.03; p.y += (anchors[i].y - 4 - p.y) * 0.03;
      p.x = Math.min(box.x1 - anchors[i].w, Math.max(box.x0, p.x)); p.y = Math.min(box.y1, Math.max(box.y0 + H, p.y));
    });
  }
  return pos;
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
