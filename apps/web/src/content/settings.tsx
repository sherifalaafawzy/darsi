/**
 * The tracks platform admins set up (/super/tracks), for every screen. Starts from the built-in tracks so nothing waits
 * or flashes, then switches to content/settings.json when it arrives (one network-first read per app start; the last
 * copy offline). Also tells the design system each track's colour and icon (TrackStylesProvider).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TrackStylesProvider, type TrackStyle } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { forgetSettings, loadSettings } from "./load";
import { BUILTIN_TRACKS, MAX_LEVELS, mergeTracks } from "./tracks";
import type { TrackDef } from "./types";

const Ctx = createContext<{ tracks: TrackDef[]; apply: (t: TrackDef[]) => void }>({ tracks: BUILTIN_TRACKS, apply: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<TrackDef[]>(BUILTIN_TRACKS);
  useEffect(() => { loadSettings().then((s) => { if (s?.tracks) setTracks(mergeTracks(s.tracks)); }).catch(() => {}); }, []);
  const apply = useCallback((t: TrackDef[]) => { forgetSettings(); setTracks(mergeTracks(t)); }, []);
  const styles = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, { tone: t.tone, icon: t.icon } as TrackStyle])), [tracks]);
  const value = useMemo(() => ({ tracks, apply }), [tracks, apply]);
  return <Ctx.Provider value={value}><TrackStylesProvider styles={styles}>{children}</TrackStylesProvider></Ctx.Provider>;
}

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
