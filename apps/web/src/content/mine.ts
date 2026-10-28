/**
 * What one learner sees: courses for their audience (teachers or students) in the tracks they chose, one track on
 * Home at a time. Shared by Home, the track switcher, My tracks, Kit, Downloads, Me and the nav.
 */
import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../auth/types";
import { useStore } from "../state/store";
import { useTracks } from "./settings";
import { audienceOf, type Audience, type CatalogEntry, type Track, type TrackDef } from "./types";

/** School accounts are what their school made them; everyone else said so in onboarding (or Me). */
export const audienceFor = (role: Role | null | undefined, chosen?: Audience): Audience =>
  role === "student" ? "students" : role === "teacher" ? "teachers" : chosen ?? "teachers";
export const audienceFixed = (role: Role | null | undefined) => role === "student" || role === "teacher";

/** The chosen tracks still on offer, in the platform's order; every track on offer when none of them is. */
export function myTracks(chosen: Track[], visible: TrackDef[]): TrackDef[] {
  const mine = visible.filter((t) => chosen.includes(t.id));
  return mine.length ? mine : visible;
}
/** The track Home shows: the one picked last, while it is still one of the learner's; else their first. */
export const activeTrack = (current: Track | undefined, mine: TrackDef[]): Track | undefined => (mine.find((t) => t.id === current) ?? mine[0])?.id;

export function useMine() {
  const { state, dispatch } = useStore();
  const { role } = useAuth();
  const { visible } = useTracks();
  const audience = audienceFor(role, state.audience);
  const tracks = myTracks(state.tracks, visible);
  const ids = new Set(tracks.map((t) => t.id));
  return {
    audience,
    fixed: audienceFixed(role),
    tracks,
    active: activeTrack(state.track, tracks),
    /** A course for this learner: their audience, in one of their tracks. */
    isMine: (u: Pick<CatalogEntry, "track" | "audience">) => audienceOf(u) === audience && ids.has(u.track),
    setActive: (track: Track) => dispatch({ type: "set", patch: { track } }),
  };
}
