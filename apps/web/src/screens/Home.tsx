import { useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, LessonCard, ProgressBar, StreakCounter, TrackChip, UnitPath } from "@darsi/design-system";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import type { CatalogEntry } from "../content/types";
import { useI18n } from "../i18n";
import { isoWeek, streakWeeks, useStore } from "../state/store";

export function Home() {
  const { t, num } = useI18n();
  const { state } = useStore();
  const { data: catalog, error, retry } = useAsync(loadCatalog, []);
  const weeks = streakWeeks(state);
  const doneThisWeek = state.weeks[isoWeek()] ?? 0;
  const units = (catalog?.units ?? []).slice().sort((a, b) => Number(b.available) - Number(a.available) || Number(state.tracks.includes(b.track)) - Number(state.tracks.includes(a.track)));
  return (
    <>
      <AppBar title={t("home.title")} actions={<StreakCounter compact count={num(weeks)} label={t("home.streak")} />} />
      <main className="screen">
        <section className="week-card">
          <ProgressBar value={Math.min(100, (doneThisWeek / state.weeklyLessons) * 100)} label={t("home.thisWeek", { done: doneThisWeek, goal: state.weeklyLessons })} valueText={`${num(doneThisWeek)} / ${num(state.weeklyLessons)}`} />
        </section>
        {error && <EmptyState tone="offline" title={t("pwa.offline")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />}
        {units.map((u) => u.available ? <UnitBlock key={u.id} entry={u} /> : <LockedUnit key={u.id} entry={u} />)}
      </main>
    </>
  );
}

function UnitBlock({ entry }: { entry: CatalogEntry }) {
  const nav = useNavigate();
  const { t, L } = useI18n();
  const { state } = useStore();
  const { data: unit } = useAsync(() => loadUnit(entry.id), [entry.id]);
  if (!unit) return <section className="unit"><h2 className="unit-title">{L(entry.title)}</h2><div className="loading" aria-busy="true" /></section>;
  const nextIdx = unit.lessons.findIndex((l) => !state.progress[l.id]);
  const next = unit.lessons[nextIdx];
  const go = (id: string) => nav(`/lesson/${unit.id}/${id}`);
  return (
    <section className="unit" aria-labelledby={`u-${unit.id}`}>
      <div className="unit-head"><TrackChip track={unit.track} solid>{t(`track.${unit.track}`)}</TrackChip>{state.downloads[unit.id] && <span className="offline-badge"><Icon name="offline" size={16} />{t("home.offline")}</span>}</div>
      <h2 className="unit-title" id={`u-${unit.id}`}>{L(unit.title)}</h2>
      <p className="muted">{L(unit.summary)}</p>
      {next ? (
        <LessonCard track={unit.track} title={L(next.title)} meta={`${t("common.lessonN", { n: nextIdx + 1 })}${t("common.sep")}${t("common.minutes", { n: next.minutes })}`} offline={!!state.downloads[unit.id]} offlineLabel={t("home.offline")} trackLabel={t(`track.${unit.track}`)}
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
  const { t, L } = useI18n();
  return (
    <section className="unit locked" aria-label={L(entry.title)}>
      <div className="unit-head"><TrackChip track={entry.track}>{t(`track.${entry.track}`)}</TrackChip><span className="soon"><Icon name="lock" size={16} />{t("common.comingSoon")}</span></div>
      <h2 className="unit-title">{L(entry.title)}</h2>
      <p className="muted">{L(entry.summary)}</p>
    </section>
  );
}
