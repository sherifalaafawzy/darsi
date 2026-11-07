import { useEffect, useState } from "react";
import { AppBar, Button, ClassroomKit, EmptyState, Icon } from "@darsi/design-system";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { useMine } from "../content/mine";
import { useTracks } from "../content/settings";
import { audienceOf, kitUrl, type CatalogEntry, type KitFile, type Lesson, type VideoStep } from "../content/types";
import { isolate, useI18n } from "../i18n";
import { useStore, type LessonResult } from "../state/store";
import { saveFile } from "../platform";

type KitFmt = "pdf" | "pptx" | "mp4";
/** Stable id for a kit file across formats, whether it uses `base` (kits), `path` (media) or uploaded `urls` (course editor). */
const fileId = (f: KitFile, lessonId: string) => f.base ?? f.path ?? `${lessonId}/${f.kind}`;
const fileKey = (f: KitFile, fmt: KitFmt, lessonId: string) => `${fileId(f, lessonId)}.${fmt}`;

/** The learner finished a lesson of this course: the progress entry's unitId, or for older entries the lesson id's prefix. */
export const startedCourse = (u: Pick<CatalogEntry, "id">, progress: Record<string, LessonResult>) =>
  Object.entries(progress).some(([id, r]) => (r.unitId ? r.unitId === u.id : id.startsWith(`${u.id}-`)));

export function Kit() {
  const { t, L } = useI18n();
  const { state } = useStore();
  const { data: catalog, error, retry } = useAsync(loadCatalog, []);
  const { isMine, audience, all } = useMine();
  const available = (catalog?.units ?? []).filter((u) => u.available && isMine(u));
  // Courses with a finished lesson show their kits (their files load); the others are one line each, so the kits a
  // teacher can use aren't buried under dozens of locked cards, and no course file is fetched just to say it's locked.
  // Platform admins explore every course, so every kit is open to them: one line per course, by track, loaded when opened.
  const started = all ? [] : available.filter((u) => startedCourse(u, state.progress));
  const locked = all ? [] : available.filter((u) => !started.includes(u));
  useEffect(() => { const id = location.hash.slice(1); if (id) setTimeout(() => document.getElementById(`kit-${id}`)?.scrollIntoView({ block: "start" }), 300); }, [catalog]);
  return (
    <>
      {/* Students reach this page from a lesson's end ("Open your notes and slides"): their kits are notes, not a classroom kit. */}
      <AppBar title={t(audience === "students" && !all ? "kit.titleStudent" : "kit.title")} />
      <main className="screen">
        {!catalog && !error && <div className="loading" aria-busy="true" />}
        {!catalog && error && <EmptyState tone="offline" title={t("pwa.offline")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />}
        {all && catalog && <AllKits units={available} />}
        {started.map((u) => <UnitKit key={u.id} entry={u} />)}
        {locked.length > 0 && (
          <section className="panel" aria-labelledby="kit-locked">
            <h2 id="kit-locked" className="section-title">{t("kit.later")}</h2>
            <ul className="icon-list">
              {locked.map((u) => (
                <li key={u.id} className="icon-item"><Icon name="lock" size={20} />
                  <span>{t(audienceOf(u) === "students" ? "kit.lockedCourseStudent" : "kit.lockedCourse", { course: isolate(L(u.title)) })}</span></li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

/** Every course's kit for a platform admin, grouped by track; the course a lesson's "Open classroom kit" named is open. */
function AllKits({ units }: { units: CatalogEntry[] }) {
  const { t, num } = useI18n();
  const tracks = useTracks();
  const mine = useMine();
  const [target] = useState(() => location.hash.slice(1));
  // Lesson ids start with their course's id ("ai-1-1-2" is in "ai-1-1"): the longest such id is the lesson's course.
  const opened = units.filter((u) => target.startsWith(`${u.id}-`)).sort((a, b) => b.id.length - a.id.length)[0]?.id;
  const order = (a: CatalogEntry, b: CatalogEntry) => a.level - b.level || a.id.localeCompare(b.id);
  const groups = mine.tracks.map((tr) => ({ tr, list: units.filter((u) => u.track === tr.id).sort(order) })).filter((g) => g.list.length);
  if (!groups.length) return <EmptyState icon="learn" title={t("home.empty")} body={t("home.emptyBody")} />;
  return <>{groups.map(({ tr, list }) => (
    <section key={tr.id} className="stack" aria-labelledby={`kit-tr-${tr.id}`}>
      <div className="unit-head">
        <h2 className="section-title" id={`kit-tr-${tr.id}`}>{tracks.name(tr.id)}</h2>
        <span className="pill">{t("tracks.courses", { n: num(list.length) })}</span>
      </div>
      {list.map((u) => <KitRow key={u.id} entry={u} first={u.id === opened} />)}
    </section>
  ))}</>;
}

function KitRow({ entry, first }: { entry: CatalogEntry; first: boolean }) {
  const { t, L } = useI18n();
  const mine = useMine();
  const [open, setOpen] = useState(first);
  return (
    <details className="course-row" open={first || undefined} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="course-row-summary">
        <span className="course-row-title">{L(entry.title)}</span>
        <span className="pill">{mine.levelName(entry.track, entry.level)}</span>
        <span className="pill">{t(entry.teach ? "home.forUni" : audienceOf(entry) === "students" ? "home.forStudents" : "home.forTeachers")}</span>
      </summary>
      {open && <div className="unit"><UnitKit entry={entry} open /></div>}
    </details>
  );
}

/** One course's kits. `open`: every lesson's files, finished or not (platform admins). */
function UnitKit({ entry, open }: { entry: CatalogEntry; open?: boolean }) {
  const { t, L, lang, num } = useI18n();
  const { state } = useStore();
  const { data: unit, error, retry } = useAsync(() => loadUnit(entry.id), [entry.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // A course that couldn't load tries again by itself once the connection is back (as on Home), and has Retry meanwhile.
  useEffect(() => {
    if (!error) return;
    const again = () => retry();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!unit) {
    if (!error) return <div className="loading" aria-busy="true" />;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <section className="stack-lg" aria-label={L(entry.title)}>
        <EmptyState tone={offline ? "offline" : "error"} title={L(entry.title)} body={t(offline ? "home.courseOffline" : "err.body")}
          action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />
      </section>
    );
  }
  // A students' course: its kit is the learner's own notes, slides and worksheet (the kits' STUDENT_UI wording).
  const student = audienceOf(entry) === "students";
  const any = open || unit.lessons.some((l) => state.progress[l.id]);
  const get = async (f: KitFile, fmt: KitFmt, lessonId: string) => {
    const key = fileKey(f, fmt, lessonId); setBusy(key); setFailed(null);
    try { await saveFile(kitUrl(f, lang, fmt), `darsi-${fileId(f, lessonId).replace(/[/{}]+/g, "-")}-${lang}.${fmt}`); }
    catch { setFailed(key); } finally { setBusy(null); }
  };
  // A printout's pages; the lesson video's size (its own, else the lesson's video, which is the same file). Never "0 pages".
  const kitMeta = (f: KitFile, l: Lesson) => {
    if (f.kind !== "video") return f.pages > 0 ? t("kit.pages", { n: f.pages }) : undefined;
    const kb = f.sizeKB?.[lang]?.mp4 ?? f.sizeKB?.en?.mp4;
    const mb = kb ? kb / 1024 : l.steps.find((s): s is VideoStep => s.type === "video")?.sizeMB ?? 0;
    return mb > 0 ? t("video.size", { mb: num(Math.max(0.1, mb), { maximumFractionDigits: 1 }) }) : undefined;
  };
  return (
    <section className="stack-lg">
      {!any && <EmptyState icon="award" title={L(unit.title)} body={t(student ? "kit.lockedStudent" : "kit.locked")} />}
      {unit.lessons.map((l, i) => {
        const unlocked = open || !!state.progress[l.id];
        return (
          <div key={l.id} id={`kit-${l.id}`} className="kit-lesson">
            <ClassroomKit track={unit.track} kicker={`${t(student ? "kit.kickerStudent" : "kit.kicker")}${t("common.sep")}${t("common.lessonN", { n: i + 1 })}`} title={L(l.title)}
              subtitle={unlocked ? t(student ? "kit.subtitleStudent" : "kit.subtitle") : t(student ? "kit.lockedStudent" : "kit.locked")}
              items={l.kit.map((f) => ({
                kind: f.kind === "slides" ? "slides" : f.kind === "video" ? "video" : f.kind === "worksheet" ? "worksheet" : "lesson-plan",
                kindLabel: f.kind === "slides" ? t("kit.slides") : f.kind === "video" ? t("kit.mp4") : f.kind === "worksheet" ? t("kit.worksheet") : t(student ? "kit.planStudent" : "kit.plan"),
                title: L(f.title), meta: kitMeta(f, l), locked: !unlocked,
                actions: <KitActions file={f} lessonId={l.id} busy={busy} failed={failed} onGet={get} />,
              }))} />
          </div>
        );
      })}
    </section>
  );
}

const FMT_ICON = { pdf: "file", pptx: "file", mp4: "video" } as const;
const FMT_LABEL = { pdf: "kit.pdf", pptx: "kit.pptx", mp4: "kit.mp4" } as const;

function KitActions({ file, lessonId, busy, failed, onGet }: { file: KitFile; lessonId: string; busy: string | null; failed: string | null; onGet: (f: KitFile, fmt: KitFmt, lessonId: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      {file.formats.map((fmt) => {
        const key = fileKey(file, fmt, lessonId);
        return <Button key={fmt} size="sm" variant={fmt === "pdf" ? "secondary" : "ghost"} icon={failed === key ? "sync" : FMT_ICON[fmt]} loading={busy === key} onClick={() => onGet(file, fmt, lessonId)}>
          {busy === key ? t("kit.downloading") : failed === key ? t("common.retry") : t(FMT_LABEL[fmt])}
        </Button>;
      })}
    </>
  );
}
