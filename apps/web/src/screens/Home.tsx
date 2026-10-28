import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, LessonCard, ProgressBar, StreakCounter, TrackChip, UnitPath } from "@darsi/design-system";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { audienceOf, type CatalogEntry } from "../content/types";
import { useMine } from "../content/mine";
import { TrackMenu, TrackSwitchButton } from "../components/TrackSwitch";
import { useI18n } from "../i18n";
import { useTracks } from "../content/settings";
import { isoWeek, streakWeeks, useStore } from "../state/store";

export function Home() {
  const { t, num } = useI18n();
  const { state } = useStore();
  const { data: catalog, error, retry } = useAsync(loadCatalog, []);
  const weeks = streakWeeks(state);
  const doneThisWeek = state.weeks[isoWeek()] ?? 0;
  const tracks = useTracks();
  const mine = useMine();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  // One of the learner's tracks at a time, and only courses for their audience, starting at the learner's level.
  const units = (catalog?.units ?? []).filter((u) => u.track === mine.active && audienceOf(u) === mine.audience);
  const name = mine.active ? tracks.name(mine.active) : "";
  const level = mine.active ? Math.min(state.levels[mine.active] ?? 1, tracks.of(mine.active).levels) : 1;
  const { current, later, earlier } = startAt(units, level);
  const block = (u: CatalogEntry) => (u.available ? <UnitBlock key={u.id} entry={u} current={u.level === level} /> : <LockedUnit key={u.id} entry={u} />);
  return (
    <>
      <AppBar title={<TrackSwitchButton open={menu} onToggle={() => setMenu(!menu)} />} actions={<StreakCounter compact count={num(weeks)} label={t("home.streak")} />} />
      <main className="screen">
        {menu && <TrackMenu onClose={() => setMenu(false)} />}
        <section className="week-card">
          <ProgressBar value={Math.min(100, (doneThisWeek / state.weeklyLessons) * 100)} label={t("home.thisWeek", { done: doneThisWeek, goal: state.weeklyLessons })} valueText={`${num(doneThisWeek)} / ${num(state.weeklyLessons)}`} />
        </section>
        {error && <EmptyState tone="offline" title={t("pwa.offline")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />}
        {catalog && !units.length && <EmptyState icon="learn"
          title={mine.audience === "students" ? t("home.emptyStudents", { track: name }) : t("home.emptyTrack", { track: name })} body={t("home.emptyTrackBody")}
          action={<Button size="sm" variant="secondary" icon="settings" onClick={() => nav("/tracks")}>{t("tracks.manage")}</Button>} />}
        {[...current, ...later].map(block)}
        {/* Nothing at or above the learner's level yet: say so, and show the earlier courses open. */}
        {!current.length && !later.length && earlier.length > 0 && <p className="notice">{t("home.noneAtLevel", { level: tracks.levelName(mine.active!, level), track: name })}</p>}
        {earlier.length > 0 && (
          <details className="earlier" open={!current.length && !later.length}>
            <summary className="earlier-summary">{t("home.earlier", { n: earlier.length })}</summary>
            <div className="stack-lg">{earlier.map(block)}</div>
          </details>
        )}
      </main>
    </>
  );
}

/**
 * Where Home starts: the course at the learner's level, then the levels above in order; the earlier ones are folded
 * away. Ready courses come before "coming soon" ones at the same level.
 */
export function startAt<T extends Pick<CatalogEntry, "level" | "available">>(units: T[], level: number) {
  const order = (a: T, b: T) => a.level - b.level || Number(b.available) - Number(a.available);
  return {
    current: units.filter((u) => u.level === level).sort(order),
    later: units.filter((u) => u.level > level).sort(order),
    earlier: units.filter((u) => u.level < level).sort(order),
  };
}

function UnitBlock({ entry, current }: { entry: CatalogEntry; current: boolean }) {
  const tracks = useTracks();
  const nav = useNavigate();
  const { t, L } = useI18n();
  const { state, dispatch } = useStore();
  const { data: unit } = useAsync(() => loadUnit(entry.id), [entry.id]);
  const done = !!unit && unit.lessons.every((l) => state.progress[l.id]);
  // Finishing the course at your level moves you up one.
  useEffect(() => {
    if (current && done && entry.level < tracks.of(entry.track).levels) dispatch({ type: "set", patch: { levels: { ...state.levels, [entry.track]: entry.level + 1 } } });
  }, [current, done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!unit) return <section className="unit"><h2 className="unit-title">{L(entry.title)}</h2><div className="loading" aria-busy="true" /></section>;
  const nextIdx = unit.lessons.findIndex((l) => !state.progress[l.id]);
  const next = unit.lessons[nextIdx];
  const go = (id: string) => nav(`/lesson/${unit.id}/${id}`);
  return (
    <section className="unit" aria-labelledby={`u-${unit.id}`}>
      <div className="unit-head"><TrackChip track={unit.track} solid>{tracks.name(unit.track)}</TrackChip>
        <span className="pill">{current ? t("home.yourLevel", { level: tracks.levelName(entry.track, entry.level) }) : tracks.levelName(entry.track, entry.level)}</span>{state.downloads[unit.id] && <span className="offline-badge"><Icon name="offline" size={16} />{t("home.offline")}</span>}</div>
      <h2 className="unit-title" id={`u-${unit.id}`}>{L(unit.title)}</h2>
      <p className="muted">{L(unit.summary)}</p>
      {next ? (
        <LessonCard track={unit.track} title={L(next.title)} meta={`${t("common.lessonN", { n: nextIdx + 1 })}${t("common.sep")}${t("common.minutes", { n: next.minutes })}`} offline={!!state.downloads[unit.id]} offlineLabel={t("home.offline")} trackLabel={tracks.name(unit.track)}
          action={<Button size="sm" iconEnd="next" onClick={() => go(next.id)}>{nextIdx === 0 ? t("common.start") : t("home.continue")}</Button>} />
      ) : (
        <Button block variant="secondary" icon="award" onClick={() => nav("/kit")}>{t("home.allDone")}</Button>
      )}
      <UnitPath track={unit.track} label={L(unit.title)} nodes={[
        ...unit.lessons.map((l, i) => ({ label: L(l.title), state: (state.progress[l.id] ? "done" : i === nextIdx ? "current" : "locked") as "done" | "current" | "locked", callout: t("common.start"), onClick: () => go(l.id) })),
        { label: t("me.certs"), state: (nextIdx === -1 ? "done" : "locked") as "done" | "locked", checkpoint: true, onClick: () => nav("/me#certificates") },
      ]} />
    </section>
  );
}

function LockedUnit({ entry }: { entry: CatalogEntry }) {
  const tracks = useTracks();
  const { t, L } = useI18n();
  return (
    <section className="unit locked" aria-label={L(entry.title)}>
      <div className="unit-head"><TrackChip track={entry.track}>{tracks.name(entry.track)}</TrackChip><span className="soon"><Icon name="lock" size={16} />{t("common.comingSoon")}</span></div>
      <h2 className="unit-title">{L(entry.title)}</h2>
      <p className="muted">{L(entry.summary)}</p>
    </section>
  );
}
