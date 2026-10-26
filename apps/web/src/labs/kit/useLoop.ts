import { useEffect, useRef, useState } from "react";

/**
 * Runs `step` repeatedly while the learner has pressed Run, a few milliseconds per animation frame, then redraws once
 * per frame. Battery-safe: it stops by itself when `step` returns false (converged, step cap), when the page is
 * hidden, and when the lab closes. Nothing runs until the learner asks.
 */
export function useLoop(step: () => boolean | void, { budgetMs = 8, maxPerFrame = Infinity }: { budgetMs?: number; maxPerFrame?: number } = {}) {
  const [running, setRunning] = useState(false);
  const [, setFrame] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!running) return;
    let raf = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      const t0 = performance.now();
      let more = true, n = 0;
      do { more = stepRef.current() !== false; n++; } while (more && n < maxPerFrame && performance.now() - t0 < budgetMs);
      setFrame((f) => f + 1);
      if (!more) { setRunning(false); return; }
      raf = requestAnimationFrame(tick);
    };
    const onHide = () => { if (document.hidden) setRunning(false); };
    document.addEventListener("visibilitychange", onHide);
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onHide); };
  }, [running, budgetMs, maxPerFrame]);
  return { running, start: () => setRunning(true), stop: () => setRunning(false), toggle: () => setRunning((r) => !r), redraw: () => setFrame((f) => f + 1) };
}
