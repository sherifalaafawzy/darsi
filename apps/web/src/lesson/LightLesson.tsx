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
import type { LightEvent, LightPlayer } from "../vendor/lessonstudio-player";

type Vendor = typeof import("../vendor/lessonstudio-player");
let loadPlayer: (() => Promise<Vendor>) | null = null;
export const setLightPlayer = (load: () => Promise<Vendor>) => { loadPlayer = load; };
export const canPlayLight = () => loadPlayer !== null;

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
        lang, captions: true, library: new URL("/lib/", location.origin).href, onEvent: (e) => events.current(e),
      });
      setShown(true);
    })().catch(() => { if (!gone) onError(); });
    return () => { gone = true; player?.destroy(); };
  }, [light, lang]);
  return <>{!shown && <div className="light-lesson light-wait">{poster}</div>}<div ref={host} className="light-lesson" /></>;
}
