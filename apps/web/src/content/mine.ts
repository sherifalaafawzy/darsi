/**
 * What one learner sees: courses for their audience (teachers or students) in the tracks they chose, one track on
 * Home at a time. Platform admins see every course: all tracks (hidden ones too), for teachers and for students, and
 * Home shows them all at once until they pick one track (`adminTrack`). Shared by Home, the track switcher, My tracks,
 * Kit, Downloads, Me and the nav.
 */
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Role } from "../auth/types";
import { useStore } from "../state/store";
import { useTracks } from "./settings";
import { STAGES, audienceOf, stageLevel, teachStage, type Audience, type CatalogEntry, type Stage, type Track, type TrackDef } from "./types";

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
 * Where a learner starts in a track before (or without) the placement check: the level of their school stage
 * (where a student studies, or where a teacher teaches), capped at the track's top level. With no stage yet, Beginner.
 */
export const startLevel = (stage: Stage | undefined, levels: number) => (stage ? Math.min(stageLevel(stage), levels) : 1);

/** The track Home shows: the one picked last, while it is still one of the learner's; else their first. */
export const activeTrack = (current: Track | undefined, mine: TrackDef[]): Track | undefined => (mine.find((t) => t.id === current) ?? mine[0])?.id;

export function useMine() {
  const { state, dispatch } = useStore();
  const { role } = useAuth();
  const { t } = useI18n();
  const { all: every, visible, of, levelName } = useTracks();
  const audience = audienceFor(role, state.audience);
  // Where they study (students) or teach (teachers). University teachers also see the university courses, pinned first.
  const stage = audience === "students" ? state.stage : teachStage(state.teach);
  const uni = audience === "teachers" && stage === "university";
  const start = (track: Track) => startLevel(stage, of(track).levels);
  const all = role === "superadmin";
  const tracks = all ? every : myTracks(state.tracks, visible);
  // A platform admin's pick is kept apart from the learner's, so "All tracks" stays their default.
  const active = all ? (state.adminTrack && tracks.some((x) => x.id === state.adminTrack) ? state.adminTrack : undefined) : activeTrack(state.track, tracks);
  const ids = new Set(tracks.map((t) => t.id));
  return {
    audience,
    /** A platform admin: every course, whoever it is for. */
    all,
    /** A university teacher: university courses are theirs too. */
    uni,
    fixed: audienceFixed(role),
    /** Where a student studies, or where a teacher teaches. */
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
    /** The track Home shows; none for a platform admin looking at every track. */
    active,
    /** A course for this learner: their audience, in one of their tracks. */
    isMine: (u: Pick<CatalogEntry, "track" | "audience" | "teach">) => ids.has(u.track) && (all || (audienceOf(u) === audience && (!u.teach || uni))),
    /** Show one track on Home; a platform admin can go back to every track with none. */
    setActive: (track?: Track) => dispatch({ type: "set", patch: all ? { adminTrack: track } : { track } }),
  };
}
