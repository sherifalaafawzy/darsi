/**
 * One Lesson Studio pack scene, drawn live. A lesson scene plays its own timeline, so every pack animation runs as
 * it was authored. An algorithm the phone just computed steps from frame to frame, and the pack glides the items.
 * The video controls stay hidden.
 */
import { useEffect, useRef, useState } from "react";
import type { LightPlayer } from "../../../vendor/lessonstudio-player";
type Draw = LightPlayer & { seek(t: number): void };

/** How long the pack's own glide takes, then how long that step stays. */
const GLIDE_MS = 520;
const HOLD_MS = 380;

function frameAts(scene: StageScene): number[] {
  const els = scene.content.elements as { anim?: { prop: string; keys?: { at: unknown }[] }[] }[];
  for (const el of els) {
    const keys = el.anim?.find((a) => a.prop === "frame")?.keys;
    if (!keys?.length) continue;
    const ats = keys.map((k) => (typeof k.at === "number" ? k.at + 0.05 : 0.4));
    if (ats.length) return ats;
  }
  return [0.4];
}

export interface StageScene {
  id: string;
  narration: { en: string; ar: string };
  template: "canvas";
  content: { elements: unknown[] };
}

export function PackStage({ scene, lang, run, dur, orient = "landscape", pace = "steps" }: {
  scene: StageScene; lang: "en" | "ar"; run: number; dur: number; orient?: "landscape" | "portrait"; pace?: "steps" | "lesson";
}) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setErr("");
    const text = scene.narration[lang];
    const ats = frameAts(scene);
    let player: Draw | null = null;
    let gone = false;
    let timer = 0;
    let raf = 0;
    let step = 0;
    const manifest = {
      spec: "lesson-package", version: "0.2", id: `tutor-${scene.id}-${run}`, rev: 1,
      title: scene.narration, defaultLang: lang, brand: "darsi-light", stage: orient,
      ai: { script: "ai", translation: "ai", narration: "none", visuals: "ai", avatar: "none" },
      languages: [{ code: lang, dir: lang === "ar" ? "rtl" : "ltr", name: lang === "ar" ? "العربية" : "English", duration: dur, timing: `timing/${lang}.json` }],
    };
    const timing = {
      version: "0.1", lang, source: "estimated", duration: dur,
      scenes: [{ id: scene.id, start: 0, end: dur, sentences: [{ text, start: 0.2, end: dur - 0.2 }], words: [] as { w: string; s: number; e: number }[] }],
    };
    (async () => {
      const { createPlayer } = await import("../../../vendor/lessonstudio-player.js");
      if (gone || !host.current) return;
      player = createPlayer(host.current, {
        manifest, scenes: { version: "0.2", scenes: [scene] }, timing: { [lang]: timing },
      }, { lang, captions: false, library: new URL("/lib/", location.origin).href, orient }) as Draw;
      await player.ready;
      if (gone || !host.current) return;
      const root = host.current.shadowRoot;
      const css = document.createElement("style");
      css.textContent = ".ls-bar,.ls-bigplay,.ls-captions,.ls-end{display:none!important}.ls-viewport{cursor:default;pointer-events:none}.pc-atop{min-width:0}.pc-note{min-width:0;overflow:hidden;text-overflow:ellipsis}.pc-cnts{flex:none}";
      root?.append(css);
      if (pace === "lesson") {
        const t0 = performance.now();
        const tick = (now: number) => {
          if (gone || !player) return;
          const t = Math.min(dur, (now - t0) / 1000);
          player.seek(t);
          if (t < dur - 0.02) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return;
      }
      const glide = (from: number, to: number, then: () => void) => {
        const t0 = performance.now();
        const tick = (now: number) => {
          if (gone || !player) return;
          const k = Math.min(1, (now - t0) / GLIDE_MS);
          player.seek(from + (to - from) * k);
          if (k < 1) raf = requestAnimationFrame(tick);
          else then();
        };
        raf = requestAnimationFrame(tick);
      };
      const drawStep = () => {
        if (gone || !player) return;
        const from = step === 0 ? Math.max(0, ats[0] - 0.35) : ats[step - 1];
        const to = ats[step] ?? ats[ats.length - 1];
        glide(from, to, () => {
          step += 1;
          if (step < ats.length) timer = window.setTimeout(drawStep, HOLD_MS);
        });
      };
      drawStep();
    })().catch(() => { if (!gone) setErr(lang === "ar" ? "تعذّر رسم المشهد." : "The scene could not be drawn."); });
    return () => { gone = true; window.clearTimeout(timer); cancelAnimationFrame(raf); player?.destroy(); };
  }, [scene, lang, run, dur, orient, pace]);
  return (
    <div className="lb-tutor-stage">
      {err ? <p className="lb-note">{err}</p> : null}
      <div ref={host} className="light-lesson" />
    </div>
  );
}
