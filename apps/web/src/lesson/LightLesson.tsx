/**
 * A video step played as a Lesson Studio light lesson: the vendored player (src/vendor, from Lesson Studio) draws the
 * scenes on the phone from a few KB of JSON while the narration plays, so it costs about a third of the MP4's data and
 * looks sharp on any screen. The quick checks are asked inside the player.
 *
 * The player (~22 KB gzipped) is a lazy chunk that App registers with setLightPlayer. It imports nothing, so loading it
 * leaves the startup bundle in one piece; a lazy chunk that shared React or the content loader with startup code split
 * it into six files (TECHNICAL.md "The bundle rule"). Until it's registered (unit tests), video steps play the MP4.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadStoredJSON } from "../content/load";
import type { LightLesson as Light } from "../content/types";
import type { LightEvent, LightLabels, LightPlayer, Orient } from "../vendor/lessonstudio-player";

type Vendor = typeof import("../vendor/lessonstudio-player");
let loadPlayer: (() => Promise<Vendor>) | null = null;
export const setLightPlayer = (load: () => Promise<Vendor>) => { loadPlayer = load; };
export const canPlayLight = () => loadPlayer !== null;

/**
 * A course saved for offline use: load now the technology packs its light lessons draw with (equations and networks,
 * code running, circuits, networks, optimisation: each a few KB, not precached), so they play without a connection.
 */
export async function prefetchLightPacks(unit: { lessons: { steps: { type: string; light?: Light }[] }[] }): Promise<void> {
  const ids = await lightPacksOf(unit);
  if (ids.length && loadPlayer) await (await loadPlayer()).prefetchPacks(ids);
}
/** The packs a course's light lessons draw with ("science", "code"…): Downloads pins their files (platform/offline.ts). */
export async function lightPacksOf(unit: { lessons: { steps: { type: string; light?: Light }[] }[] }): Promise<string[]> {
  if (!loadPlayer) return [];
  const files = unit.lessons.flatMap((l) => l.steps).map((s) => (s.type === "video" ? s.light?.files["scenes.json"] : undefined)).filter((f): f is string => !!f);
  if (!files.length) return [];
  const vendor = await loadPlayer();
  const ids = new Set<string>();
  for (const f of files) for (const id of vendor.packsUsed(await loadStoredJSON(f).catch(() => null))) ids.add(id);
  return [...ids];
}

/** The video's shape the learner chose: landscape (16:9) unless they turned it to portrait. Kept on this phone. */
export type VideoShape = "landscape" | "portrait";
const SHAPE_KEY = "darsi.videoShape";
export function videoShape(): VideoShape {
  try { return localStorage.getItem(SHAPE_KEY) === "portrait" ? "portrait" : "landscape"; } catch { return "landscape"; }
}
export function saveVideoShape(shape: VideoShape): void {
  try { localStorage.setItem(SHAPE_KEY, shape); } catch { /* private mode: this visit only */ }
}

/**
 * Landscape (the default) is the 16:9 stage at full width. Portrait, whenever the learner picks it, on every screen:
 * the 9:16 stage (easier to read than 16:9 on a phone), centred, as wide as fits between the player's top and the
 * Continue bar, keeping the row under it (Transcript, the video's shape, the video file: up to three rows on phones,
 * 9.5rem) and the bar (6rem) in view; the player's controls sit on the picture. The title above takes one line or
 * three, so this is measured, not guessed. Never under 16rem wide, where the player's tiny layout still fits its
 * controls on one row: on a short screen (most phones once the browser's bars are counted, or a phone turned sideways)
 * the page scrolls a little instead. It once fell back to landscape there, and on wide screens left the choice to the
 * player, which picked landscape, so the button changed nothing.
 */
export function fitStage(el: HTMLElement, shape: VideoShape = "landscape"): Orient {
  el.style.maxInlineSize = "";
  if (shape === "landscape") return "landscape";
  const rem = (typeof getComputedStyle === "function" && parseFloat(getComputedStyle(document.documentElement).fontSize)) || 16;
  const top = (el.parentElement?.querySelector(".light-lesson") ?? el).getBoundingClientRect().top; // the poster's, while it shows
  const width = Math.max(16 * rem, Math.floor(((innerHeight - top - 15.5 * rem) * 9) / 16));
  el.style.maxInlineSize = `${width}px`;
  return "portrait";
}

/** A package already in memory: the tutor agent's explainers (tutor/Explainer.tsx), one language, no audio. */
export interface LightPkg { manifest: { defaultLang: string; languages: { code: string }[] }; scenes: unknown; timing: Record<string, unknown> }

export function LightLesson({ light, pkg, lang, poster, onEvent, onError, shape = "landscape", start = false, labels, hidden = false }: {
  light?: Light; pkg?: LightPkg; lang: string; poster: ReactNode; onEvent: (e: LightEvent) => void; onError: () => void; shape?: VideoShape;
  /** Start playing as soon as the picture is ready. Explainers do; a course video waits for the learner. */
  start?: boolean;
  /**
   * The player's words for a video that is one step of a lesson: the quick check's button keeps watching (the lesson's
   * own Continue moves on), and the end card is the video's, not the lesson's. Read when the player starts.
   */
  labels?: LightLabels;
  /**
   * Out of sight while the learner reads the transcript: paused, but kept, so closing the transcript goes on from the
   * same moment with the quick checks already answered (it used to start again at 0:00).
   */
  hidden?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const events = useRef(onEvent);
  events.current = onEvent;
  const words = useRef(labels);
  words.current = labels;
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const live = useRef<LightPlayer | null>(null);
  // Turning the video (landscape / portrait) keeps the player and its place.
  useEffect(() => { if (live.current && host.current) live.current.setOrient(fitStage(host.current, shape)); }, [shape]);
  // It starts the first time it is in sight: a step that opens on its transcript loads nothing until then.
  const [seen, setSeen] = useState(!hidden);
  // Hidden: paused. In sight again: measured again, since a hidden stage has no place on the page.
  useEffect(() => {
    if (hidden) live.current?.pause();
    else {
      setSeen(true);
      if (live.current && host.current) live.current.setOrient(fitStage(host.current, shapeRef.current));
    }
  }, [hidden]);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!seen) return;
    let player: LightPlayer | null = null;
    let gone = false;
    // Turning the phone: measured again once the new size has settled.
    const refit = () => setTimeout(() => { if (!gone && player && host.current) player.setOrient(fitStage(host.current, shapeRef.current)); }, 300);
    (async () => {
      const f = light?.files ?? {};
      const [{ createPlayer }, manifest, scenes, timing] = await Promise.all([
        loadPlayer!(),
        pkg ? pkg.manifest : loadStoredJSON<LightPkg["manifest"]>(f["manifest.json"]!),
        pkg ? pkg.scenes : loadStoredJSON(f["scenes.json"]!),
        pkg ? pkg.timing[lang] : loadStoredJSON(f[`timing/${lang}.json`]!),
      ]);
      if (gone || !host.current) return;
      // Only this language: the teacher picks languages in Darsi, not inside the player.
      const one = { ...manifest, defaultLang: lang, languages: manifest.languages.filter((l) => l.code === lang) };
      player = createPlayer(host.current, { manifest: one, scenes, timing: { [lang]: timing }, resolve: (p) => f[p] ?? "" }, {
        lang, captions: true, library: new URL("/lib/", location.origin).href, orient: fitStage(host.current, shapeRef.current), onEvent: (e) => events.current(e),
        ...(words.current ? { labels: words.current } : {}),
      });
      live.current = player;
      setShown(true);
      if (start) void player.play();
      addEventListener("orientationchange", refit);
    })().catch(() => { if (!gone) onError(); });
    return () => { gone = true; live.current = null; removeEventListener("orientationchange", refit); player?.destroy(); };
  }, [light, pkg, lang, start, seen]);
  return <>{!shown && !hidden && <div className="light-lesson light-wait">{poster}</div>}<div ref={host} className="light-lesson" hidden={hidden} /></>;
}
