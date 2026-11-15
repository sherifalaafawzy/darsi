import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { loadUnit, useAsync } from "../content/load";
import type { CatalogEntry } from "../content/types";
import { latestPerStep, useMyWork } from "../state/myWork";
import { CT } from "../lesson/capstoneText";

/** Me lists at most this many projects: the newest version of each. */
const SHOW = 20;

/**
 * Me's "My projects", for signed-in learners: each project they sent (its newest version), newest first, with where its
 * review stands, the reviewer's feedback and a way back to it ("Send a new version" when a revision was asked for). One
 * read when Me opens, no listener. Lesson titles come from the courses, which are the learner's own and usually already
 * on the phone (cache-first); a course no longer published shows its lesson's id.
 */
export function MyProjects({ uid, units }: { uid: string; units?: CatalogEntry[] }) {
  const { t, L, locale } = useI18n();
  const nav = useNavigate();
  const { data, error } = useMyWork(uid);
  const rows = useMemo(() => (data ? latestPerStep(data.list).slice(0, SHOW) : []), [data]);
  const live = (id: string) => units?.find((u) => u.id === id && u.available);
  const ids = [...new Set(rows.map((s) => s.unitId).filter((id) => !!live(id)))].sort();
  const { data: courses } = useAsync(() => Promise.all(ids.map((id) => loadUnit(id).catch(() => null))), [ids.join(",")]);
  // Opened from a review notification (/me#projects): go to the list once it is there.
  useEffect(() => { if (data && location.hash === "#projects") document.getElementById("projects")?.scrollIntoView(); }, [data]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <section id="projects" className="stack" aria-labelledby="projects-h">
      <h2 id="projects-h" className="section-title">{t("me.projects")}</h2>
      {!data && error && <p className="muted">{t("me.projectsOffline")}</p>}
      {data && !rows.length && <p className="muted">{t("me.projectsNone")}</p>}
      {rows.length > 0 && <ul className="icon-list">
        {rows.map((s) => {
          const course = live(s.unitId);
          const lesson = courses?.find((u) => u?.id === s.unitId)?.lessons.find((l) => l.id === s.lessonId);
          const tone = s.status === "approved" ? " ok" : s.status === "revise" ? " err" : "";
          const revise = s.status === "revise";
          return (
            <li key={s.id} className={`notice stack-sm${tone}`}>
              <div className="row-gap">
                {lesson ? <strong>{L(lesson.title)}</strong> : course ? <strong>{L(course.title)}</strong> : <strong dir="ltr">{s.lessonId}</strong>}
                <span className="pill">{t(`p.status.${s.status}`)}</span>
              </div>
              {(lesson && course) || s.createdAt ? <div className="muted small">
                {lesson && course && L(course.title)}{lesson && course && s.createdAt && t("common.sep")}{s.createdAt && t("project.sentOn", { date: date.format(new Date(s.createdAt)) })}
              </div> : null}
              {s.feedback && <div><strong>{t("p.feedback")}:</strong> <span dir="auto">{s.feedback}</span></div>}
              {course && <div>
                <Button size="sm" variant={revise ? "primary" : "secondary"} icon={revise ? "edit" : undefined} iconEnd={revise ? undefined : "next"}
                  onClick={() => nav(`/lesson/${s.unitId}/${s.lessonId}?step=${encodeURIComponent(s.stepId || "project")}`)}>
                  {revise ? (s.capstone ? L(CT.sendAgain) : t("project.sendAgain")) : t("me.projectOpen")}
                </Button>
              </div>}
            </li>
          );
        })}
      </ul>}
    </section>
  );
}
