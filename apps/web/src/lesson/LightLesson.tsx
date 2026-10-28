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
import type { LightEvent, LightPlayer, Orient } from "../vendor/lessonstudio-player";

type Vendor = typeof import("../vendor/lessonstudio-player");
let loadPlayer: (() => Promise<Vendor>) | null = null;
export const setLightPlayer = (load: () => Promise<Vendor>) => { loadPlayer = load; };
export const canPlayLight = () => loadPlayer !== null;

/**
 * Upright phones get the portrait stage (9:16, easier to read than 16:9 at this width), as wide as fits between the
 * player's top and the Continue bar, with the player's controls (up to three rows at these widths, 9.5rem) and the
 * bar (6rem) below it. The title above takes one line or three, so this is measured, not guessed. Where that would be
 * under 12rem wide (short phones), the 16:9 stage at full width fits instead. Wider screens leave it to the player.
 */
function fitStage(el: HTMLElement): Orient | "auto" {
  el.style.maxInlineSize = "";
  if (typeof matchMedia !== "function" || !matchMedia("(orientation: portrait) and (max-width: 599px)").matches) return "auto";
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const top = (el.parentElement?.querySelector(".light-lesson") ?? el).getBoundingClientRect().top; // the poster's, while it shows
  const width = Math.floor(((innerHeight - top - 15.5 * rem) * 9) / 16);
  if (width < 12 * rem) return "landscape";
  el.style.maxInlineSize = `${width}px`;
  return "portrait";
}

export function LightLesson({ light, lang, poster, onEvent, onError }: {
  light: Light; lang: string; poster: ReactNode; onEvent: (e: LightEvent) => void; onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const events = useRef(onEvent);
  events.current = onEvent;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let player: LightPlayer | null = null;
    let gone = false;
    // Turning the phone: measured again once the new size has settled.
    const refit = () => setTimeout(() => { if (!gone && player && host.current) player.setOrient(fitStage(host.current)); }, 300);
    (async () => {
      const f = light.files;
      const [{ createPlayer }, manifest, scenes, timing] = await Promise.all([
        loadPlayer!(),
        loadStoredJSON<{ defaultLang: string; languages: { code: string }[] }>(f["manifest.json"]!),
        loadStoredJSON(f["scenes.json"]!),
        loadStoredJSON(f[`timing/${lang}.json`]!),
      ]);
      if (gone || !host.current) return;
      // Only this language: the teacher picks languages in Darsi, not inside the player.
      const one = { ...manifest, defaultLang: lang, languages: manifest.languages.filter((l) => l.code === lang) };
      player = createPlayer(host.current, { manifest: one, scenes, timing: { [lang]: timing }, resolve: (p) => f[p] ?? "" }, {
        lang, captions: true, library: new URL("/lib/", location.origin).href, orient: fitStage(host.current), onEvent: (e) => events.current(e),
      });
      setShown(true);
      addEventListener("orientationchange", refit);
    })().catch(() => { if (!gone) onError(); });
    return () => { gone = true; removeEventListener("orientationchange", refit); player?.destroy(); };
  }, [light, lang]);
  return <>{!shown && <div className="light-lesson light-wait">{poster}</div>}<div ref={host} className="light-lesson" /></>;
}
