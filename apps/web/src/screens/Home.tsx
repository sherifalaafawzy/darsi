import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, LessonCard, ProgressBar, StreakCounter, TrackChip, UnitPath } from "@darsi/design-system";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { audienceOf, type CatalogEntry } from "../content/types";
import { capstoneMilestones, earnedCert, milestonesSent } from "../content/cert";
import { useMine } from "../content/mine";
import { TrackMenu, TrackSwitchButton } from "../components/TrackSwitch";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { useTracks } from "../content/settings";
import { isoWeek, streakWeeks, useStore } from "../state/store";
import { useMyWork } from "../state/myWork";

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
  // Closing the track menu (Escape or a pick) gives focus back to the button that opened it.
  const switchRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => { setMenu(false); switchRef.current?.focus(); };
  // One of the learner's tracks at a time, and only courses for their audience, starting at the learner's level.
  // University courses only for university teachers, and pinned above the rest, in the order they are taken.
  // Platform admins: every course in the track, for teachers and for students, from Beginner up; or every track at once.
  const units = (catalog?.units ?? []).filter((u) => u.track === mine.active && (mine.all || (audienceOf(u) === mine.audience && (!u.teach || mine.uni))));
  const pinned = units.filter((u) => u.teach).sort(byOrder);
  const name = mine.active ? tracks.name(mine.active) : "";
  const level = mine.all ? 0 : mine.active ? mine.levelOf(mine.active) : 1;
  const school = startAt(units.filter((u) => !u.teach), level);
  // A university teacher at the top level: their university courses are their level. The school courses at that level
  // (school leadership) fold away under their own name, and the lower ones under "Earlier levels".
  const uniTop = mine.uni && pinned.length > 0 && !!mine.active && level >= tracks.of(mine.active).levels;
  const { current, later, earlier } = uniTop ? { current: [], later: [], earlier: school.earlier } : school;
  const sameLevel = uniTop ? [...school.current, ...school.later] : [];
  // Nothing at their level but courses above it (only some levels have courses for them, and the check can place them
  // lower): the lowest of those is where they start, and finishing it moves them up, as the course at their level would.
  const above = !mine.all && !uniTop && !current.some((u) => u.available) ? [...pinned, ...later].filter((u) => u.available) : [];
  const at = above.length ? Math.min(...above.map((u) => u.level)) : level;
  // The first course on the page loads at once; the others when the learner scrolls near them (Near).
  const block = (u: CatalogEntry, first: boolean) => (u.available
    ? <Near key={u.id} entry={u} eager={first}><UnitBlock entry={u} current={uniTop ? !!u.teach : u.level === at} startHere={at !== level} /></Near>
    : <LockedUnit key={u.id} entry={u} />);
  const shown = [...pinned, ...current, ...later];
  // Nothing at or above the learner's level: the earlier courses show open.
  const earlierFirst = !shown.length;
  // A platform admin on "All tracks": every course, track by track.
  const everything = mine.all && !mine.active;
  return (
    <>
      <AppBar title={<TrackSwitchButton ref={switchRef} open={menu} onToggle={() => setMenu(!menu)} />} actions={<StreakCounter compact count={num(weeks)} label={t("home.streak")} />} />
      <main className="screen">
        {menu && <TrackMenu onClose={closeMenu} />}
        <section className="week-card">
          {/* Past the weekly goal, "5 of 4" would read oddly: it says the goal is met, with the count. */}
          <ProgressBar value={Math.min(100, (doneThisWeek / state.weeklyLessons) * 100)} valueText={`${num(doneThisWeek)} / ${num(state.weeklyLessons)}`}
            label={state.weeklyLessons > 0 && doneThisWeek >= state.weeklyLessons ? t("home.thisWeekMet", { n: doneThisWeek }) : t("home.thisWeek", { done: doneThisWeek, goal: state.weeklyLessons })} />
        </section>
        {error && <EmptyState tone="offline" title={t("pwa.offline")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />}
        {!catalog && !error && <div className="loading" aria-busy="true" />}
        {everything && catalog && <AllCourses units={catalog.units} />}
        {!everything && catalog && !units.length && <EmptyState icon="learn"
          title={mine.audience === "students" ? t("home.emptyStudents", { track: name }) : t("home.emptyTrack", { track: name })} body={t("home.emptyTrackBody")}
          action={<Button size="sm" variant="secondary" icon="settings" onClick={() => nav("/tracks")}>{t("tracks.manage")}</Button>} />}
        {at !== level && <p className="notice">{t("home.startAbove", { level: tracks.levelName(mine.active!, level), track: name })}</p>}
        {shown.map((u, i) => block(u, i === 0))}
        {/* Nothing at or above the learner's level yet: say so, and show the earlier courses open. */}
        {earlierFirst && earlier.length > 0 && <p className="notice">{t("home.noneAtLevel", { level: mine.levelName(mine.active!, level), track: name })}</p>}
        {sameLevel.length > 0 && <Fold key={`same:${mine.active}`} label={t("home.sameLevel", { n: sameLevel.length })}>{() => sameLevel.map((u) => block(u, false))}</Fold>}
        {earlier.length > 0 && <Fold key={`earlier:${mine.active}`} label={t("home.earlier", { n: earlier.length })} open={earlierFirst}>{() => earlier.map((u, i) => block(u, earlierFirst && i === 0))}</Fold>}
      </main>
    </>
  );
}

/**
 * Courses folded away under a name ("Earlier levels"). They aren't loaded until the fold is opened (`children` is called
 * only then). Keyed by track, so switching track starts it closed again.
 */
function Fold({ label, open: start = false, children }: { label: string; open?: boolean; children: () => ReactNode }) {
  const [open, setOpen] = useState(start);
  return (
    <details className="earlier" open={start || undefined} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="earlier-summary">{label}</summary>
      {(open || start) && <div className="stack-lg">{children()}</div>}
    </details>
  );
}

type Orderable = Pick<CatalogEntry, "id" | "level" | "available" | "kind">;
/**
 * The order courses are taken in: by level, ready before "coming soon", a track's capstone after the other courses of its
 * level, then by id, numbers counted as numbers (ai-u1 … ai-u4, ai-d1 … ai-d3), whatever order the catalog lists them in.
 */
export const byOrder = (a: Orderable, b: Orderable) => a.level - b.level || Number(b.available) - Number(a.available)
  || Number(a.kind === "capstone") - Number(b.kind === "capstone") || a.id.localeCompare(b.id, "en", { numeric: true });

/**
 * Where Home starts: the course at the learner's level, then the levels above in order; the earlier ones are folded
 * away. Each in the order courses are taken (byOrder).
 */
export function startAt<T extends Orderable>(units: T[], level: number) {
  return {
    current: units.filter((u) => u.level === level).sort(byOrder),
    later: units.filter((u) => u.level > level).sort(byOrder),
    earlier: units.filter((u) => u.level < level).sort(byOrder),
  };
}

/**
 * Mounts a course, which downloads its file, only once it comes near the screen: Home shows the first course at once and
 * the others as the learner scrolls to them, so a first visit doesn't download every course of the track. Until then, its
 * title and summary from the catalog. Without IntersectionObserver, at once.
 */
function Near({ entry, eager, children }: { entry: CatalogEntry; eager: boolean; children: ReactNode }) {
  const { L } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  // `eager` can turn on later (the course above it moved away after a level-up), and a course once shown stays shown.
  const was = useRef(false);
  if (eager) was.current = true;
  const near = was.current || seen || typeof IntersectionObserver === "undefined";
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  if (near) return <>{children}</>;
  return (
    <section ref={ref} className="unit" aria-labelledby={`u-${entry.id}`}>
      <h2 className="unit-title" id={`u-${entry.id}`}>{L(entry.title)}</h2>
      <p className="muted">{L(entry.summary)}</p>
      <div className="loading" aria-busy="true" />
    </section>
  );
}

/**
 * A platform admin's Home on "All tracks": every course in every track, grouped by track, from Beginner up. Each course
 * is one line from the catalog; opening it loads the course (one read), so nothing is fetched until it is wanted.
 */
function AllCourses({ units }: { units: CatalogEntry[] }) {
  const { t, num } = useI18n();
  const tracks = useTracks();
  const mine = useMine();
  const order = (a: CatalogEntry, b: CatalogEntry) => a.level - b.level || audienceRank(a) - audienceRank(b) || Number(a.kind === "capstone") - Number(b.kind === "capstone") || a.id.localeCompare(b.id);
  const groups = mine.tracks.map((tr) => ({ tr, list: units.filter((u) => u.track === tr.id).sort(order) })).filter((g) => g.list.length);
  if (!groups.length) return <EmptyState icon="learn" title={t("home.empty")} body={t("home.emptyBody")} />;
  return (
    <>
      {groups.map(({ tr, list }) => (
        <section key={tr.id} className="stack" aria-labelledby={`tr-${tr.id}`}>
          <div className="unit-head">
            <h2 className="section-title" id={`tr-${tr.id}`}>{tracks.name(tr.id)}</h2>
            <span className="pill">{t("tracks.courses", { n: num(list.length) })}</span>
          </div>
          {list.map((u) => <CourseRow key={u.id} entry={u} />)}
        </section>
      ))}
    </>
  );
}
const audienceRank = (u: CatalogEntry) => (u.teach ? 2 : audienceOf(u) === "students" ? 1 : 0);

/** One course on "All tracks": its title, level and who it is for; opened, the course itself. */
function CourseRow({ entry }: { entry: CatalogEntry }) {
  const { t, L } = useI18n();
  const mine = useMine();
  const [open, setOpen] = useState(false);
  return (
    <details className="course-row" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="course-row-summary">
        <span className="course-row-title">{L(entry.title)}</span>
        <span className="pill">{mine.courseLevelName(entry.track, entry.level)}</span>
        <span className="pill">{t(entry.teach ? "home.forUni" : audienceOf(entry) === "students" ? "home.forStudents" : "home.forTeachers")}</span>
        {!entry.available && <span className="soon"><Icon name="lock" size={16} />{t("common.comingSoon")}</span>}
      </summary>
      {open && (entry.available ? <UnitBlock entry={entry} current={false} bare /> : <p className="muted">{L(entry.summary)}</p>)}
    </details>
  );
}

/**
 * One course on Home. `current`: the course at the learner's level, whose end moves them up a level; `startHere`: it is
 * only where they start, because nothing is at their level (its pill says so rather than "Your level").
 */
function UnitBlock({ entry, current, startHere, bare }: { entry: CatalogEntry; current: boolean; startHere?: boolean; bare?: boolean }) {
  const tracks = useTracks();
  const mine = useMine();
  const nav = useNavigate();
  const { t, L } = useI18n();
  const { state, dispatch } = useStore();
  // offlineUid: signed in, but the phone was offline at start, so nothing can be read yet; not a guest.
  const { user, offlineUid } = useAuth();
  const { data: unit, error, retry } = useAsync(() => loadUnit(entry.id), [entry.id]);
  // A course that couldn't load (offline and never opened here, or a dropped connection) tries again by itself once the
  // connection is back, and has a Retry button meanwhile.
  useEffect(() => {
    if (!error) return;
    const again = () => retry();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  const lessonsDone = !!unit && unit.lessons.every((l) => state.progress[l.id]);
  const cap = unit?.kind === "capstone";
  const cert = state.certs?.[entry.id];
  // A capstone is finished when every milestone has been sent, not when its lessons are: each of those can be passed with
  // "I'll do it in class and submit later". Its milestones are read once a session, signed in (guests can't send).
  const { data: work } = useMyWork(cap && lessonsDone && !cert ? user?.uid : undefined, { unitId: entry.id }, { cached: true });
  // The certificate is recorded the first time it is earned, so a replay or a republished course never changes it.
  useEffect(() => {
    if (!unit || cert || !lessonsDone) return;
    const earned = earnedCert(unit, state.progress, cap ? work?.list : []);
    if (earned) dispatch({ type: "earnCert", id: unit.id, cert: earned });
  }, [unit, cert, lessonsDone, work]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = cap ? !!cert : lessonsDone;
  // Finishing the course at your level moves you up one, up to the track's top level. So does finishing the one you
  // started at because nothing was at your level: from the top level, to the top level.
  useEffect(() => {
    if (!current || !done) return;
    const up = Math.min(entry.level + 1, tracks.of(entry.track).levels);
    if (up > mine.levelOf(entry.track)) dispatch({ type: "set", patch: { levels: { ...state.levels, [entry.track]: up } } });
  }, [current, done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!unit) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <section className="unit" aria-labelledby={bare ? undefined : `u-${entry.id}`} aria-label={bare ? L(entry.title) : undefined}>
        {!bare && <h2 className="unit-title" id={`u-${entry.id}`}>{L(entry.title)}</h2>}
        {error
          ? <EmptyState tone={offline ? "offline" : "error"} title={t(offline ? "pwa.offline" : "err.title")} body={t(offline ? "home.courseOffline" : "err.body")}
              action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />
          : <div className="loading" aria-busy="true" />}
      </section>
    );
  }
  const nextIdx = unit.lessons.findIndex((l) => !state.progress[l.id]);
  const next = unit.lessons[nextIdx];
  const go = (id: string) => nav(`/lesson/${unit.id}/${id}`);
  // A capstone with its lessons done but milestones still to send: where to send the first one missing (once the read
  // says which: offline, the first milestone may already have been sent).
  const sentKeys = new Set((work?.list ?? []).map((s) => `${s.lessonId}/${s.stepId}`));
  const toSend = cap && lessonsDone && !cert && work ? capstoneMilestones(unit).find((m) => !sentKeys.has(`${m.lessonId}/${m.stepId}`)) : undefined;
  const sentCount = cap && work ? milestonesSent(unit, work.list) : null;
  // Students have no Kit tab: their kit is their notes and slides. Either way it opens at this course.
  const student = audienceOf(entry) === "students" || mine.audience === "students";
  // "Your level" names the learner's level (their own stage beside it, never another); other courses their own level.
  const pill = current ? t(startHere ? "home.startHere" : "home.yourLevel", { level: mine.levelName(entry.track, entry.level) }) : mine.courseLevelName(entry.track, entry.level);
  const pathLabel = (st: "done" | "current" | "locked") => t(st === "done" ? "path.done" : st === "current" ? "path.next" : mine.all ? "path.todo" : "path.locked");
  return (
    <section className="unit" aria-labelledby={bare ? undefined : `u-${unit.id}`} aria-label={bare ? L(unit.title) : undefined}>
      {!bare && <><div className="unit-head"><TrackChip track={unit.track} solid>{tracks.name(unit.track)}</TrackChip>
        <span className="pill">{pill}</span>
        {mine.all && <span className="pill">{t(entry.teach ? "home.forUni" : audienceOf(entry) === "students" ? "home.forStudents" : "home.forTeachers")}</span>}{state.downloads[unit.id] && <span className="offline-badge"><Icon name="offline" size={16} />{t("home.offline")}</span>}</div>
      <h2 className="unit-title" id={`u-${unit.id}`}>{L(unit.title)}</h2></>}
      <p className="muted">{L(unit.summary)}</p>
      {next ? (
        <LessonCard track={unit.track} title={L(next.title)} meta={`${t("common.lessonN", { n: nextIdx + 1 })}${t("common.sep")}${t("common.minutes", { n: next.minutes })}`} offline={!!state.downloads[unit.id]} offlineLabel={t("home.offline")} trackLabel={tracks.name(unit.track)}
          action={<Button size="sm" iconEnd="next" onClick={() => go(next.id)}>{nextIdx === 0 ? t("common.start") : t("home.continue")}</Button>} />
      ) : cap && !cert ? (
        <div className="notice stack-sm">
          <div>{t("cert.capPending")}</div>
          {!user && !offlineUid ? <div className="muted small">{t("project.guest")}</div> : sentCount && <div className="muted small">{t("cert.capSent", { n: sentCount.sent, m: sentCount.of })}</div>}
          {user && toSend && <div><Button size="sm" iconEnd="next" onClick={() => nav(`/lesson/${unit.id}/${toSend.lessonId}?step=${encodeURIComponent(toSend.stepId)}`)}>{t("cert.capSend")}</Button></div>}
        </div>
      ) : (
        <Button block variant="secondary" icon="award" onClick={() => nav(`/kit#${unit.lessons[0]?.id ?? ""}`)}>{t(student ? "home.allDoneStudent" : "home.allDone")}</Button>
      )}
      {/* Each step's state is in its name too (the check and the colour don't reach a screen reader). */}
      <UnitPath track={unit.track} label={L(unit.title)} nodes={[
        ...unit.lessons.map((l, i) => {
          const st: "done" | "current" | "locked" = state.progress[l.id] ? "done" : i === nextIdx ? "current" : "locked";
          return { label: L(l.title), state: st, stateLabel: pathLabel(st), callout: t("common.start"), onClick: () => go(l.id), open: mine.all };
        }),
        { label: t("me.certs"), state: (cert || (!cap && nextIdx === -1) ? "done" : "locked") as "done" | "locked", stateLabel: t(cert || (!cap && nextIdx === -1) ? "path.certDone" : "path.certLocked"), checkpoint: true, onClick: () => nav("/me#certificates") },
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
