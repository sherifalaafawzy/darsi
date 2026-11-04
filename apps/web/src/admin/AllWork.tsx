import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppBar, Button, CertificateCard, EmptyState, TrackChip } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { certCode } from "../content/cert";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { useTracks } from "../content/settings";
import type { CatalogEntry, Unit } from "../content/types";
import { finishedAt, useAllSubmissions, useLearners, useNames } from "./data";
import { SubmissionCard } from "./SubmissionCard";
import "../styles/admin.css";
import "../styles/person.css";
import "./strings";

/**
 * Platform admins see everyone's work: /super/projects (every project submitted, to review as a teacher would) and
 * /super/certificates (everyone who finished a course). Both read once when opened, a page at a time; no listeners.
 */
const PAGE = 50;

/** /super/projects: every project anyone submitted, newest first; the ones waiting for a review by default. */
export function ProjectsPage() {
  const { t, L, locale } = useI18n();
  const [waiting, setWaiting] = useState(true);
  const [max, setMax] = useState(PAGE);
  const subs = useAllSubmissions(waiting, max);
  const list = subs.data ?? [];
  const names = useNames(useMemo(() => [...new Set(list.map((s) => s.uid))].sort(), [list]));
  const unitIds = useMemo(() => [...new Set(list.map((s) => s.unitId).filter(Boolean))].sort(), [list]);
  const { data: units } = useAsync(() => Promise.all(unitIds.map((id) => loadUnit(id).catch(() => null))), [unitIds.join(",")]);
  const lessons = useMemo(() => {
    const m = new Map<string, { unit: Unit; title: string }>();
    for (const u of units ?? []) if (u) for (const l of u.lessons) m.set(l.id, { unit: u, title: L(l.title) });
    return m;
  }, [units, L]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <>
      <AppBar title={t("aw.projectsTitle")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("aw.projectsIntro")}</p>
        <div className="row-gap" role="group" aria-label={t("aw.projectsTitle")}>
          <Button size="sm" variant={waiting ? "primary" : "ghost"} aria-pressed={waiting} onClick={() => { setWaiting(true); setMax(PAGE); }}>{t("aw.waiting")}</Button>
          <Button size="sm" variant={waiting ? "ghost" : "primary"} aria-pressed={!waiting} onClick={() => { setWaiting(false); setMax(PAGE); }}>{t("aw.all")}</Button>
        </div>
        {subs.error && <p className="notice err">{subs.error.message}</p>}
        {!subs.data && !subs.error && <div className="loading" aria-busy="true" />}
        {subs.data && !list.length && <EmptyState icon="file" title={t("aw.noProjects")} />}
        {list.map((s) => {
          const at = lessons.get(s.lessonId);
          return <SubmissionCard key={`${s.uid}/${s.id}`} uid={s.uid} sub={s} lessonTitle={at?.title ?? s.lessonId} onReviewed={subs.reload}
            who={<p className="muted small">
              <Link to={`/super/people/${s.uid}`}>{names.data?.[s.uid] || t("aw.someone")}</Link>
              {at && <>{t("common.sep")}{L(at.unit.title)}</>}
              {s.createdAt && <>{t("common.sep")}{date.format(new Date(s.createdAt.seconds * 1000))}</>}
            </p>} />;
        })}
        {list.length === max && <div><Button variant="secondary" onClick={() => setMax(max + PAGE)}>{t("aw.more")}</Button></div>}
      </main>
    </>
  );
}

/** One finished course: who, which course, and the certificate itself once opened (its date needs one read). */
interface Earned { uid: string; name: string; unit: CatalogEntry }

/** /super/certificates: everyone who finished a course, from their summaries (users/*.summary.units). */
export function CertificatesPage() {
  const { t, L, num } = useI18n();
  const tracks = useTracks();
  const [max, setMax] = useState(300);
  const [q, setQ] = useState("");
  const learners = useLearners(max);
  const { data: catalog, error } = useAsync(loadCatalog, []);
  const all = useMemo<Earned[]>(() => {
    const units = (catalog?.units ?? []).filter((u) => u.lessons > 0);
    return (learners.data ?? []).flatMap((p) => units
      .filter((u) => (p.summary?.units?.[u.id] ?? 0) >= u.lessons)
      .map((u) => ({ uid: p.uid, name: p.name || p.email || "", unit: u })));
  }, [catalog, learners.data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((r) => r.name.toLowerCase().includes(s) || L(r.unit.title).toLowerCase().includes(s)) : all;
  }, [all, q, L]);
  const fail = learners.error ?? error;
  return (
    <>
      <AppBar title={t("aw.certsTitle")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("aw.certsIntro")}</p>
        <section className="tiles">
          <div className="tile"><span>{t("aw.certCount")}</span><strong>{num(all.length)}</strong></div>
          <div className="tile"><span>{t("aw.people")}</span><strong>{num(new Set(all.map((r) => r.uid)).size)}</strong></div>
        </section>
        {fail && <p className="notice err">{fail.message}</p>}
        {(!learners.data || !catalog) && !fail && <div className="loading" aria-busy="true" />}
        {learners.data && catalog && (
          <section className="panel stack">
            <input type="search" placeholder={t("aw.search")} aria-label={t("aw.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            {!rows.length && <p className="muted">{t("aw.noCerts")}</p>}
            {rows.map((r) => <CertRow key={`${r.uid}/${r.unit.id}`} row={r} trackLabel={tracks.name(r.unit.track)} />)}
            {learners.data.length === max && <div><Button variant="secondary" onClick={() => setMax(max + 300)}>{t("aw.more")}</Button></div>}
          </section>
        )}
      </main>
    </>
  );
}

function CertRow({ row, trackLabel }: { row: Earned; trackLabel: string }) {
  const { t, L, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const { data: last, error } = useAsync(() => (open ? finishedAt(row.uid, row.unit.id) : Promise.resolve(null)), [open, row.uid, row.unit.id]);
  return (
    <article className="stack-sm">
      <div className="row-gap">
        <TrackChip track={row.unit.track}>{trackLabel}</TrackChip>
        <strong>{L(row.unit.title)}</strong>
        <Link to={`/super/people/${row.uid}`} dir="auto">{row.name || t("aw.someone")}</Link>
        <Button size="sm" variant="ghost" icon="award" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? "aw.hide" : "aw.show")}</Button>
      </div>
      {open && error && <p className="notice err">{error.message}</p>}
      {open && last && <CertificateCard track={row.unit.track} kicker={t("cert.kicker")} trackLabel={trackLabel} name={row.name || "—"} title={L(row.unit.title)}
        date={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(last))} code={certCode(row.unit.id, row.name, last)} />}
    </article>
  );
}
