/**
 * What one learner sees: courses for their audience (teachers or students) in the tracks they chose, one track on
 * Home at a time. Shared by Home, the track switcher, My tracks, Kit, Downloads, Me and the nav.
 */
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Role } from "../auth/types";
import { useStore } from "../state/store";
import { useTracks } from "./settings";
import { STAGES, audienceOf, stageLevel, type Audience, type CatalogEntry, type Stage, type Track, type TrackDef } from "./types";

/** School accounts are what their school made them; everyone else said so in onboarding (or Me). */
export const audienceFor = (role: Role | null | undefined, chosen?: Audience): Audience =>
  role === "student" ? "students" : role === "teacher" ? "teachers" : chosen ?? "teachers";
export const audienceFixed = (role: Role | null | undefined) => role === "student" || role === "teacher";

/** The chosen tracks still on offer, in the platform's order; every track on offer when none of them is. */
export function myTracks(chosen: Track[], visible: TrackDef[]): TrackDef[] {
  const mine = visible.filter((t) => chosen.includes(t.id));
  return mine.length ? mine : visible;
}
/**
 * Where a learner starts in a track before (or without) the placement check: students at their stage's level (on a
 * track with fewer levels, its top one), teachers at Beginner.
 */
export const startLevel = (audience: Audience, stage: Stage | undefined, levels: number) => (audience === "students" && stage ? Math.min(stageLevel(stage), levels) : 1);

/** The track Home shows: the one picked last, while it is still one of the learner's; else their first. */
export const activeTrack = (current: Track | undefined, mine: TrackDef[]): Track | undefined => (mine.find((t) => t.id === current) ?? mine[0])?.id;

export function useMine() {
  const { state, dispatch } = useStore();
  const { role } = useAuth();
  const { t } = useI18n();
  const { visible, of, levelName } = useTracks();
  const audience = audienceFor(role, state.audience);
  const stage = audience === "students" ? state.stage : undefined;
  const start = (track: Track) => startLevel(audience, stage, of(track).levels);
  const tracks = myTracks(state.tracks, visible);
  const ids = new Set(tracks.map((t) => t.id));
  return {
    audience,
    fixed: audienceFixed(role),
    /** Where a student studies; undefined for teachers. */
    stage,
    startLevel: start,
    /** The learner's level in a track: from the placement check or their courses, else where they start. */
    levelOf: (track: Track) => Math.min(state.levels[track] ?? start(track), of(track).levels),
    /** A level's name; for students on a built-in track, with the school stage it is written for ("Elementary · Lower secondary"). */
    levelName: (track: Track, level: number) => {
      const name = levelName(track, level), st = STAGES[level - 1];
      return audience === "students" && of(track).builtIn && st ? `${name}${t("common.sep")}${t(`stage.${st}`)}` : name;
    },
    tracks,
    active: activeTrack(state.track, tracks),
    /** A course for this learner: their audience, in one of their tracks. */
    isMine: (u: Pick<CatalogEntry, "track" | "audience">) => audienceOf(u) === audience && ids.has(u.track),
    setActive: (track: Track) => dispatch({ type: "set", patch: { track } }),
  };
}
