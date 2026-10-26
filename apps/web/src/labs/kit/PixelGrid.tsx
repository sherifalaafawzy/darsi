import { useEffect, useRef, useState } from "react";
import { useKit } from "./strings";

/**
 * A small drawing grid (an image as numbers): draw with a finger or mouse, or with the keyboard (arrows move, Space
 * paints, Backspace erases). `value[row * n + col]` is in [0, 1].
 */
export function PixelGrid({ n = 16, value, onChange, label, readOnly }: { n?: number; value: ArrayLike<number>; onChange?: (v: Float32Array) => void; label: string; readOnly?: boolean }) {
  const k = useKit();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const drawing = useRef<"paint" | "erase" | null>(null);
  const CELL = 12;

  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d"); if (!c || !ctx) return;
    const css = getComputedStyle(c);
    const ink = css.getPropertyValue("--ink").trim() || "#1c1c1c", surface = css.getPropertyValue("--surface").trim() || "#fff", line = css.getPropertyValue("--line").trim() || "#ddd";
    ctx.fillStyle = surface; ctx.fillRect(0, 0, n * CELL, n * CELL);
    for (let i = 0; i < n * n; i++) {
      if (value[i] > 0) { ctx.globalAlpha = Math.min(1, value[i]); ctx.fillStyle = ink; ctx.fillRect((i % n) * CELL, Math.floor(i / n) * CELL, CELL, CELL); ctx.globalAlpha = 1; }
    }
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, n * CELL); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(n * CELL, i * CELL + 0.5); ctx.stroke(); }
    if (cursor !== null) { ctx.strokeStyle = css.getPropertyValue("--focus").trim() || "#06c"; ctx.lineWidth = 2; ctx.strokeRect((cursor % n) * CELL + 1, Math.floor(cursor / n) * CELL + 1, CELL - 2, CELL - 2); }
  }, [value, n, cursor]);

  // The latest picture, so several pointer moves between two renders all build on each other.
  const latest = useRef(value);
  latest.current = value;
  const last = useRef<number | null>(null);
  /** Paints (or erases) every cell on the way from the last cell to `i`, so a quick stroke leaves no gaps. */
  const set = (i: number, mode: "paint" | "erase") => {
    if (readOnly || !onChange) return;
    const next = Float32Array.from(latest.current);
    const from = last.current ?? i, r0 = Math.floor(from / n), c0 = from % n, r1 = Math.floor(i / n), c1 = i % n;
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0), 1);
    for (let t = 0; t <= steps; t++) {
      const r = Math.round(r0 + ((r1 - r0) * t) / steps), c = Math.round(c0 + ((c1 - c0) * t) / steps);
      if (mode === "erase") { next[r * n + c] = 0; continue; }
      next[r * n + c] = 1;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) next[rr * n + cc] = Math.max(next[rr * n + cc], 0.5); }
    }
    last.current = i;
    latest.current = next;
    onChange(next);
  };
  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * n), row = Math.floor(((e.clientY - r.top) / r.height) * n);
    return row >= 0 && row < n && col >= 0 && col < n ? row * n + col : null;
  };
  return (
    <div className="lb-pixels">
      <canvas ref={canvas} width={n * CELL} height={n * CELL} className="lb-pixels-canvas" dir="ltr" role="img" aria-label={label} tabIndex={readOnly ? -1 : 0}
        onPointerDown={(e) => { const i = cellAt(e); if (i === null) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = value[i] > 0.75 && e.pointerType !== "touch" && e.button === 2 ? "erase" : "paint"; last.current = null; set(i, drawing.current); }}
        onPointerMove={(e) => { if (!drawing.current) return; const i = cellAt(e); if (i !== null && i !== last.current) set(i, drawing.current); }}
        onPointerUp={() => { drawing.current = null; }} onContextMenu={(e) => e.preventDefault()}
        onFocus={() => setCursor((c) => c ?? Math.floor(n / 2) * n + Math.floor(n / 2))} onBlur={() => setCursor(null)}
        onKeyDown={(e) => {
          if (cursor === null) return;
          const r = Math.floor(cursor / n), c = cursor % n;
          const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
          if (move[e.key]) { e.preventDefault(); const [dr, dc] = move[e.key]; setCursor(Math.min(n - 1, Math.max(0, r + dr)) * n + Math.min(n - 1, Math.max(0, c + dc))); }
          else if (e.key === " " || e.key === "Enter") { e.preventDefault(); last.current = null; set(cursor, "paint"); }
          else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); last.current = null; set(cursor, "erase"); }
        }} />
      {!readOnly && <p className="lb-note">{k.drawHint}</p>}
    </div>
  );
}
