/**
 * What platform admins set up for everyone: the tracks (/super/tracks) and the languages (/super/languages). Starts
 * from the built-in tracks and languages so nothing waits or flashes, then switches to content/settings.json when it
 * arrives (one network-first read per app start; the last copy offline). Also tells the design system each track's
 * colour and icon (TrackStylesProvider), and fetches the strings of a published language when someone picks it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TrackStylesProvider, type TrackStyle } from "@darsi/design-system";
import { addMessages, hasMessages, setLanguages, useI18n, useLanguages } from "../i18n";
import { BUILTIN_CODES } from "./languages";
import { forgetSettings, loadLanguagePack, loadSettings } from "./load";
import { BUILTIN_TRACKS, MAX_LEVELS, mergeTracks } from "./tracks";
import type { TrackDef } from "./types";

const Ctx = createContext<{ tracks: TrackDef[]; apply: (t: TrackDef[]) => void; langReady: boolean }>({ tracks: BUILTIN_TRACKS, apply: () => {}, langReady: true });

/**
 * The pack version each language was last loaded at, so the next start fetches it from the cache at once instead of
 * waiting for the settings to come over the network.
 */
const REMEMBER = "darsi:langPacks";
const remembered = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(REMEMBER) ?? "{}") as Record<string, number>; } catch { return {}; } };
const remember = (code: string, version: number) => { try { localStorage.setItem(REMEMBER, JSON.stringify({ ...remembered(), [code]: version })); } catch { /* private mode */ } };
const loaded = new Map<string, number>();
const loading = new Map<string, Promise<void>>();
function loadPack(code: string, version: number): Promise<void> {
  const key = `${code}@${version}`;
  if (!loading.has(key)) loading.set(key, loadLanguagePack(code, version)
    .then((messages) => { addMessages({ [code]: messages }); loaded.set(code, version); remember(code, version); })
    .catch((e: unknown) => { loading.delete(key); throw e; }));
  return loading.get(key)!;
}
/** How long the app waits for a language's strings before showing English (the strings still arrive later). */
const PACK_WAIT_MS = 6000;

export function SettingsProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const [tracks, setTracks] = useState<TrackDef[]>(BUILTIN_TRACKS);
  const [settingsRead, setSettingsRead] = useState(false);
  useEffect(() => {
    loadSettings().then((s) => { if (s?.tracks) setTracks(mergeTracks(s.tracks)); setLanguages(s?.languages); }).catch(() => {}).finally(() => setSettingsRead(true));
  }, []);
  const apply = useCallback((t: TrackDef[]) => { forgetSettings(); setTracks(mergeTracks(t)); }, []);

  // The picked language's strings: built-in ones are always there; a published one is fetched (cache-first by version).
  const languages = useLanguages();
  const published = languages.find((l) => l.code === lang)?.version;
  const builtIn = BUILTIN_CODES.includes(lang);
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  useEffect(() => {
    if (builtIn) return;
    if (hasMessages(lang) && loaded.get(lang) === published) return;
    const version = published ?? remembered()[lang];
    if (version && loaded.get(lang) !== version) loadPack(lang, version).catch(() => {});
    if (!version && settingsRead) { setGaveUp(lang); return; } // not published (any more): English
    const timer = setTimeout(() => setGaveUp(lang), PACK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [lang, published, builtIn, settingsRead]);
  useI18n(); // re-render when strings arrive
  const langReady = builtIn || hasMessages(lang) || gaveUp === lang;

  const styles = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, { tone: t.tone, icon: t.icon } as TrackStyle])), [tracks]);
  const value = useMemo(() => ({ tracks, apply, langReady }), [tracks, apply, langReady]);
  return <Ctx.Provider value={value}><TrackStylesProvider styles={styles}>{children}</TrackStylesProvider></Ctx.Provider>;
}

/** False while a published language's strings are on their way (App shows its loading screen, not English, meanwhile). */
export const useLanguageReady = () => useContext(Ctx).langReady;

/** A track nobody set up any more (deleted, or content from elsewhere): shown neutrally under its id. */
const unknown = (id: string): TrackDef => ({ id, name: { en: id }, icon: "learn", tone: "slate", levels: MAX_LEVELS, order: 999 });

export function useTracks() {
  const { tracks, apply } = useContext(Ctx);
  const { L, t } = useI18n();
  return useMemo(() => {
    const byId = new Map(tracks.map((x) => [x.id, x]));
    const of = (id: string) => byId.get(id) ?? unknown(id);
    return {
      /** Every track in order, hidden ones included (for staff screens and old progress). */
      all: tracks,
      /** The tracks to offer learners and editors. */
      visible: tracks.filter((x) => !x.hidden),
      of,
      name: (id: string) => L(of(id).name),
      /** "Level 3", or the name the admin gave level 3. */
      levelName: (id: string, n: number) => L(of(id).levelNames?.[n - 1]) || t("place.level", { n }),
      /** Track order for sorting units: unknown tracks last. */
      order: (id: string) => of(id).order,
      /** The Tracks page saved: use these at once. */
      apply,
    };
  }, [tracks, apply, L, t]);
}

/** A language's strings for screens that show another language than the app's (the lesson preview). Doesn't block. */
export function usePack(code: string) {
  const languages = useLanguages();
  const version = languages.find((l) => l.code === code)?.version;
  useEffect(() => { if (version && loaded.get(code) !== version) loadPack(code, version).catch(() => {}); }, [code, version]);
}
