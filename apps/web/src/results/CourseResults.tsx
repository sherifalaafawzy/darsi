import { useMemo, useState } from "react";
import { AppBar, EmptyState, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import type { Unit } from "../content/types";
import { useLoad, type ContentLoader } from "./async";
import { courseResults, myGrant, type StudentWork } from "./data";
import "../styles/admin.css";

/**
 * /results: a university teacher's read-only view of the courses a platform admin gave them access to: each student's
 * check scores per lesson, and their project submissions (final projects first). Nothing here can change a record.
 */
export function CourseResults({ content }: { content: ContentLoader }) {
  const { t, L } = useI18n();
  const { user } = useAuth();
  const grant = useLoad(() => (user ? myGrant(user.uid) : Promise.resolve(null)), [user?.uid]);
  const catalog = useLoad(() => content.loadCatalog(), []);
  const units = grant.data?.units ?? [];
  const [pick, setPick] = useState<string>("");
  const unitId = pick || units[0] || "";
  const titleOf = (id: string) => { const e = catalog.data?.units.find((u) => u.id === id); return e ? L(e.title) : id; };

  return (
    <>
      <AppBar title={t("results.title")} />
      <main className="screen wide stack-lg">
        {!user ? <EmptyState icon="profile" title={t("results.signIn")} />
          : grant.loading ? <div className="loading" aria-busy="true" />
          : grant.error ? <p className="notice err">{grant.error.message}</p>
          : !units.length ? <EmptyState icon="chart" title={t("results.none")} body={t("results.noneBody")} />
          : <>
            <p className="muted">{t("results.intro")}</p>
            <div className="table-tools">
              <select aria-label={t("results.course")} value={unitId} onChange={(e) => setPick(e.target.value)}>
                {units.map((id) => <option key={id} value={id}>{titleOf(id)}</option>)}
              </select>
            </div>
            <Course key={unitId} unitId={unitId} content={content} />
          </>}
      </main>
    </>
  );
}

function Course({ unitId, content }: { unitId: string; content: ContentLoader }) {
  const { t, L, num } = useI18n();
  const unit = useLoad<Unit | null>(() => content.loadUnit(unitId).catch(() => null), [unitId]);
  const data = useLoad(() => courseResults(unitId), [unitId]);
  // Students appear by the name on a final project, else by number.
  const students = useMemo(() => {
    const d = data.data; if (!d) return [];
    const uids = [...new Set([...d.results.map((r) => r.uid), ...d.work.map((w) => w.uid)])];
    const names = new Map(d.work.filter((w) => w.name).map((w) => [w.uid, w.name!]));
    return uids.map((uid, i) => ({ uid, label: names.get(uid) ?? t("results.student", { n: num(i + 1) }) }));
  }, [data.data, t, num]);
  const label = (uid: string) => students.find((s) => s.uid === uid)?.label ?? "";
  const lessons = unit.data?.lessons ?? [];
  if (data.loading || unit.loading) return <div className="loading" aria-busy="true" />;
  if (data.error) return <p className="notice err">{data.error.message}</p>;
  const { results, work } = data.data!;
  const score = (uid: string, lessonId: string) => { const r = results.find((x) => x.uid === uid && x.lessonId === lessonId); return r ? `${num(Math.round(r.accuracy * 100))}%` : "—"; };
  const lessonTitle = (id: string) => { const l = lessons.find((x) => x.id === id); return l ? L(l.title) : id; };
  return (
    <div className="stack-lg">
      <section className="tiles">
        <div className="tile"><span>{t("results.students")}</span><strong>{num(students.length)}</strong></div>
        <div className="tile"><span>{t("results.finals")}</span><strong>{num(work.filter((w) => w.final).length)}</strong></div>
        <div className="tile"><span>{t("results.projects")}</span><strong>{num(work.length)}</strong></div>
      </section>
      <section className="stack" aria-labelledby="res-h">
        <h2 id="res-h" className="section-title">{t("results.scores")}</h2>
        {!students.length ? <EmptyState icon="chart" title={t("results.empty")} /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t("results.studentCol")}</th>{lessons.map((l) => <th key={l.id} className="num">{L(l.title)}</th>)}</tr></thead>
              <tbody>{students.map((s) => (
                <tr key={s.uid}>
                  <td data-label={t("results.studentCol")}><strong><bdi>{s.label}</bdi></strong></td>
                  {lessons.map((l) => <td key={l.id} data-label={L(l.title)} className="num">{score(s.uid, l.id)}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="stack" aria-labelledby="work-h">
        <h2 id="work-h" className="section-title">{t("results.work")}</h2>
        {!work.length ? <p className="muted">{t("results.noWork")}</p> : work.map((w) => <Work key={w.id} w={w} who={label(w.uid)} lesson={lessonTitle(w.lessonId)} />)}
      </section>
    </div>
  );
}

function Work({ w, who, lesson }: { w: StudentWork; who: string; lesson: string }) {
  const { t, locale } = useI18n();
  const files = w.files?.length ? w.files : w.fileUrl ? [{ url: w.fileUrl, name: w.fileName ?? t("p.attachment") }] : [];
  const when = w.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(w.createdAt.seconds * 1000)) : "";
  return (
    <article className="submission">
      <header><strong><bdi>{who}</bdi></strong><span className="muted small">{w.final ? t("results.final") : lesson}{when && `${t("common.sep")}${when}`}</span></header>
      <p dir="auto" className="sub-text">{w.text}</p>
      {w.final && <>
        <h3 className="small">{t("results.explain")}</h3><p dir="auto" className="sub-text">{w.explain || "—"}</p>
        <h3 className="small">{t("results.aiUse")}</h3><p dir="auto">{!w.aiUse || w.aiUse === "none" ? t("results.aiNone") : w.aiUse}</p>
      </>}
      {files.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer noopener"><Icon name="file" size={16} /> <bdi>{f.name}</bdi></a>)}
    </article>
  );
}
