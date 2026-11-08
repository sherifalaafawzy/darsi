/**
 * What one learner sees: courses for their audience (teachers or students) in the tracks they chose, one track on
 * Home at a time. Platform admins see every course: all tracks (hidden ones too), for teachers and for students, and
 * Home shows them all at once until they pick one track (`adminTrack`). An organization can narrow what its teachers,
 * students and classes see (`state.org.courses`, content/orgCourses.ts); its admins still see everything. Shared by
 * Home, the track switcher, My tracks, Kit, Downloads, Me, onboarding and the nav.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Role } from "../auth/types";
import { useStore } from "../state/store";
import { useTracks } from "./settings";
import { loadCatalog, useAsync } from "./load";
import { STAGES, audienceOf, stageLevel, teachStage, type Audience, type CatalogEntry, type Stage, type Track, type TrackDef } from "./types";

/** School accounts are what their school made them; everyone else said so in onboarding (or Me). */
export const audienceFor = (role: Role | null | undefined, chosen?: Audience): Audience =>
  role === "student" ? "students" : role === "teacher" ? "teachers" : chosen ?? "teachers";
export const audienceFixed = (role: Role | null | undefined) => role === "student" || role === "teacher";

/**
 * The course ids this member's organization lets them see, or null for every course: org admins and platform admins see
 * everything, and so does anyone whose organization hasn't chosen (no `state.org.courses`; state/orgBrand.ts).
 */
export const orgSees = (role: Role | null | undefined, list: readonly string[] | undefined): Set<string> | null =>
  role === "orgAdmin" || role === "superadmin" || !list ? null : new Set(list);
/** orgSees for the person using the app, from what their phone keeps (it holds offline). */
export function useOrgSees(): Set<string> | null {
  const { role } = useAuth();
  const list = useStore().state.org?.courses;
  return useMemo(() => orgSees(role, list), [role, list]);
}
/** Only the courses the organization lets this member see (all of them when it hasn't chosen). */
export const seenOnly = <T extends { id: string }>(units: T[] | undefined, sees: Set<string> | null): T[] | undefined =>
  units && sees ? units.filter((u) => sees.has(u.id)) : units;
/**
 * The tracks a member whose organization chose their courses can pick: the visible tracks with a ready course for them
 * (`ok`: one they may see, for their audience). Without the catalog (still loading, or offline and never read), every
 * visible track, so nothing stalls; with it and nothing chosen for them, none.
 */
export function tracksOffered(visible: TrackDef[], units: CatalogEntry[] | undefined, ok: (u: CatalogEntry) => boolean): TrackDef[] {
  if (!units) return visible;
  return visible.filter((t) => units.some((u) => u.track === t.id && u.available && ok(u)));
}
/** The catalog's units as this module last read them, so a screen that mounts later starts with them (no extra render). */
let lastUnits: CatalogEntry[] | undefined;
/** The catalog's units, read only when `on`: most people have no organization choice, and pay nothing for this. */
function useUnitsWhen(on: boolean): CatalogEntry[] | undefined {
  const [units, setUnits] = useState(() => (on ? lastUnits : undefined));
  useEffect(() => {
    if (!on) return;
    let live = true;
    loadCatalog().then((c) => { lastUnits = c.units; if (live) setUnits(c.units); }, () => {});
    return () => { live = false; };
  }, [on]);
  return on ? units : undefined;
}

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

/**
 * The school stages to offer in "Where do you study?" / "Where do you teach?": those with a published course for this
 * audience in a visible track. A stage's courses are the ones at its level (primary school is Beginner … university is
 * Advanced); for teachers, the university courses count for university too. Without a catalog (still loading,
 * offline) or with no courses at all, every stage, so onboarding never stalls.
 */
export function stagesWithCourses(units: CatalogEntry[] | undefined, audience: Audience, tracks?: Set<string>): Stage[] {
  if (!units) return STAGES;
  const live = units.filter((u) => u.available && (!tracks || tracks.has(u.track)) && audienceOf(u) === audience);
  const offered = STAGES.filter((st) => live.some((u) => (u.teach ? st === "university" : u.level === stageLevel(st))));
  return offered.length ? offered : STAGES;
}
/** Who the placement check is for: their audience, whether university courses are theirs, and their school stage. */
export interface Placed { audience: Audience; uni: boolean; stage?: Stage }
/**
 * The levels the placement check may place a learner at in a track, lowest first: the levels with a published course for
 * them there (their audience; university courses for university teachers), so the check never names a level that
 * Home then has nothing for. A student goes no higher than their own stage (courses are written for a stage), or to
 * the lowest level with a course if nothing is at or below it. Without a catalog (loading, offline) or with no course for
 * them in the track, every level up to that cap.
 */
export function placeLevels(units: CatalogEntry[] | undefined, track: Track, top: number, who: Placed): number[] {
  const cap = who.audience === "students" && who.stage ? Math.min(top, stageLevel(who.stage)) : top;
  const offered = [...new Set((units ?? [])
    .filter((u) => u.available && u.track === track && audienceOf(u) === who.audience && (!u.teach || who.uni))
    .map((u) => u.level))].filter((l) => l >= 1 && l <= top).sort((a, b) => a - b);
  if (!offered.length) return Array.from({ length: cap }, (_, i) => i + 1);
  const within = offered.filter((l) => l <= cap);
  return within.length ? within : [offered[0]];
}
/** Where the check starts among `levels` (placeLevels): the learner's start level, else the nearest above it, else the top. */
export const placeStart = (levels: number[], start: number) => (levels.includes(start) ? start : levels.find((l) => l > start) ?? levels[levels.length - 1] ?? start);

/** The stages to offer this audience now (one catalog read, shared with Home): only courses the organization lets them see count. */
export function useStagesOffered(audience: Audience): Stage[] {
  const { data } = useAsync(loadCatalog, []);
  const { visible } = useTracks();
  const sees = useOrgSees();
  return useMemo(() => stagesWithCourses(seenOnly(data?.units, sees), audience, new Set(visible.map((tr) => tr.id))), [data, audience, visible, sees]);
}

/**
 * placeLevels and placeStart for this learner, from the catalog (one read, shared with Home). `ready` once the catalog
 * has answered or failed (offline: every level), so a check never changes its levels while it asks.
 */
export function usePlacement() {
  const { data, error } = useAsync(loadCatalog, []);
  const mine = useMine();
  const { of } = useTracks();
  const sees = useOrgSees();
  const { audience, uni, stage } = mine.placed;
  return useMemo(() => {
    // Only the levels with a course the organization lets them see: the check never places them where Home has nothing.
    const units = seenOnly(data?.units, sees);
    const levels = (track: Track) => placeLevels(units, track, of(track).levels, { audience, uni, stage });
    return { ready: Boolean(data || error), levels, start: (track: Track) => placeStart(levels(track), mine.startLevel(track)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error, of, audience, uni, stage, sees]);
}

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
  // The organization chose this member's courses (never for its admins or platform admins: orgSees).
  const sees = useOrgSees();
  const chosen = !!sees && !all;
  const units = useUnitsWhen(chosen);
  const forMe = (u: Pick<CatalogEntry, "audience" | "teach">) => audienceOf(u) === audience && (!u.teach || uni);
  const seen = (u: { id: string }) => !sees || sees.has(u.id);
  // Tracks they can pick: with an organization's choice, only those with a course it lets them see.
  const offered = chosen ? tracksOffered(visible, units, (u) => seen(u) && forMe(u)) : visible;
  const tracks = all ? every : myTracks(state.tracks, offered);
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
    /**
     * The name of the learner's level ("Your level", the check's result, My levels). A student's own school stage goes
     * beside it ("Intermediate · Upper secondary"); never another stage, which isn't theirs.
     */
    levelName: (track: Track, level: number) => {
      const name = levelName(track, level), st = STAGES[level - 1];
      return audience === "students" && of(track).builtIn && st && st === stage ? `${name}${t("common.sep")}${t(`stage.${st}`)}` : name;
    },
    /** A course's level; for students on a built-in track, with the school stage it is written for ("Elementary · Lower secondary"). */
    courseLevelName: (track: Track, level: number) => {
      const name = levelName(track, level), st = STAGES[level - 1];
      return audience === "students" && of(track).builtIn && st ? `${name}${t("common.sep")}${t(`stage.${st}`)}` : name;
    },
    /** Who the placement check is for (placeLevels). */
    placed: { audience, uni, stage } as Placed,
    tracks,
    /** The track Home shows; none for a platform admin looking at every track (or a member with nothing chosen for them). */
    active,
    /** The tracks they can pick (onboarding, My tracks): the visible ones, or with an organization's choice those with a course for them. */
    offered,
    /** Their organization chose which courses they see (state.org.courses). */
    chosenByOrg: chosen,
    /** Their organization lets them see this course (always, without a choice). */
    seen,
    /** A course for this learner: their audience, in one of their tracks, and one their organization lets them see. */
    isMine: (u: Pick<CatalogEntry, "id" | "track" | "audience" | "teach">) => ids.has(u.track) && (all || (forMe(u) && seen(u))),
    /** Show one track on Home; a platform admin can go back to every track with none. */
    setActive: (track?: Track) => dispatch({ type: "set", patch: all ? { adminTrack: track } : { track } }),
  };
}
