import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppBar, Button, CertificateCard, EmptyState, TrackChip } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { displayLogin } from "../auth/api";
import { certCode, milestonesSent } from "../content/cert";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { useTracks } from "../content/settings";
import type { CatalogEntry, Lesson, Unit } from "../content/types";
import { finishedAt, sentFor, useAllSubmissions, useLearners, useNames } from "./data";
import { knownCourse } from "./courseTitles";
import { refusalText } from "./refusals";
import { projectStep, SubmissionCard } from "./SubmissionCard";
import "../styles/admin.css";
import "../styles/person.css";
import "./strings";
import type { CapFields } from "../content/capstone";
import { CT } from "../lesson/capstoneText";

/**
 * Platform admins see everyone's work: /super/projects (every project submitted, to review as a teacher would) and
 * /super/certificates (everyone who finished a course). Both read once when opened, a page at a time; no listeners.
 */
const PAGE = 50;

/**
 * /super/projects: every project anyone submitted, newest first; the ones waiting for a review by default. "Darsi staff
 * only" is the capstone queue: milestones from learners without a school, who have no teacher to review them.
 */
export function ProjectsPage() {
  const { t, L, locale } = useI18n();
  const [show, setShow] = useState<"waiting" | "staff" | "all">("waiting");
  const waiting = show !== "all";
  const [max, setMax] = useState(PAGE);
  const subs = useAllSubmissions(waiting, max);
  const read = subs.data ?? [];
  const list = useMemo(() => (show === "staff" ? read.filter((s) => (s as typeof s & CapFields).queue === "staff") : read), [read, show]);
  const names = useNames(useMemo(() => [...new Set(list.map((s) => s.uid))].sort(), [list]));
  const unitIds = useMemo(() => [...new Set(list.map((s) => s.unitId).filter(Boolean))].sort(), [list]);
  const { data: units } = useAsync(() => Promise.all(unitIds.map((id) => loadUnit(id).catch(() => null))), [unitIds.join(",")]);
  const lessons = useMemo(() => {
    const m = new Map<string, { unit: Unit; lesson: Lesson; title: string }>();
    for (const u of units ?? []) if (u) for (const l of u.lessons) m.set(l.id, { unit: u, lesson: l, title: L(l.title) });
    return m;
  }, [units, L]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <>
      <AppBar title={t("aw.projectsTitle")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("aw.projectsIntro")}</p>
        <div className="row-gap" role="group" aria-label={t("aw.projectsTitle")}>
          <Button size="sm" variant={show === "waiting" ? "primary" : "ghost"} aria-pressed={show === "waiting"} onClick={() => { setShow("waiting"); setMax(PAGE); }}>{t("aw.waiting")}</Button>
          <Button size="sm" variant={show === "staff" ? "primary" : "ghost"} aria-pressed={show === "staff"} onClick={() => { setShow("staff"); setMax(PAGE); }}>{L(CT.staffOnly)}</Button>
          <Button size="sm" variant={show === "all" ? "primary" : "ghost"} aria-pressed={show === "all"} onClick={() => { setShow("all"); setMax(PAGE); }}>{t("aw.all")}</Button>
        </div>
        {subs.error && <p className="notice err">{refusalText(subs.error, t)}</p>}
        {!subs.data && !subs.error && <div className="loading" aria-busy="true" />}
        {subs.data && !list.length && <EmptyState icon="file" title={t("aw.noProjects")} />}
        {list.map((s) => {
          const at = lessons.get(s.lessonId);
          // A course unpublished since can't be loaded: its title from the course sources, not the lesson's id.
          const known = at ? undefined : knownCourse(s.unitId);
          return <SubmissionCard key={`${s.uid}/${s.id}`} uid={s.uid} sub={s} lessonTitle={at?.title ?? (known ? L(known.title) : s.lessonId)} step={projectStep(at?.lesson, s.stepId)} onReviewed={subs.reload}
            who={<p className="muted small">
              <Link className="person-link" to={`/super/people/${s.uid}`}>{names.data?.[s.uid] || (names.loading && !names.data ? "…" : t("aw.someone"))}</Link>
              {at && <>{t("common.sep")}{L(at.unit.title)}</>}
              {s.createdAt && <>{t("common.sep")}{date.format(new Date(s.createdAt.seconds * 1000))}</>}
            </p>} />;
        })}
        {read.length === max && <div><Button variant="secondary" onClick={() => setMax(max + PAGE)}>{t("aw.more")}</Button></div>}
      </main>
    </>
  );
}

/**
 * One finished course: who, which course, and the certificate itself once opened (its date needs one read). `name` is
 * the account's name as the learner's own certificate shows it (Me: "—" when there is none), so the codes match;
 * `label` names the person in the list. A capstone's row carries when its last milestone was sent (`sentAt`).
 */
interface Earned { uid: string; name: string; label: string; unit: CatalogEntry; sentAt?: string | null }
const key = (r: { uid: string; unit: { id: string } }) => `${r.uid}/${r.unit.id}`;

/**
 * /super/certificates: everyone who finished a course, from their summaries (users/*.summary.units). A capstone's
 * certificate also needs every milestone sent (content/cert.ts, as Me decides): for those rows only, one read of the
 * person's projects for that course.
 */
export function CertificatesPage() {
  const { t, L, num } = useI18n();
  const tracks = useTracks();
  const [max, setMax] = useState(300);
  const [q, setQ] = useState("");
  const learners = useLearners(max);
  const { data: catalog, error } = useAsync(loadCatalog, []);
  const finished = useMemo<Earned[]>(() => {
    const units = (catalog?.units ?? []).filter((u) => u.lessons > 0);
    return (learners.data ?? []).flatMap((p) => units
      .filter((u) => (p.summary?.units?.[u.id] ?? 0) >= u.lessons)
      .map((u) => ({ uid: p.uid, name: p.name ?? "", label: p.name || displayLogin(p.email ?? ""), unit: u })));
  }, [catalog, learners.data]);
  const caps = useMemo(() => finished.filter((r) => r.unit.kind === "capstone"), [finished]);
  const sent = useAsync(async () => {
    const out = new Map<string, string | null>();
    if (!caps.length) return out;
    const units = new Map((await Promise.all([...new Set(caps.map((r) => r.unit.id))].map((id) => loadUnit(id).catch(() => null))))
      .filter((u): u is Unit => !!u).map((u) => [u.id, u]));
    await Promise.all(caps.map(async (r) => {
      const u = units.get(r.unit.id);
      if (!u) return;
      const m = milestonesSent(u, await sentFor(r.uid, u.id));
      if (m.of > 0 && m.sent >= m.of) out.set(key(r), m.at);
    }));
    return out;
  }, [caps.map(key).join(",")]);
  const all = useMemo<Earned[]>(() => finished.flatMap((r) => (r.unit.kind !== "capstone" ? [r] : sent.data?.has(key(r)) ? [{ ...r, sentAt: sent.data.get(key(r)) }] : [])), [finished, sent.data]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((r) => r.label.toLowerCase().includes(s) || L(r.unit.title).toLowerCase().includes(s)) : all;
  }, [all, q, L]);
  const fail = learners.error ?? error ?? sent.error;
  const ready = learners.data && catalog && sent.data;
  return (
    <>
      <AppBar title={t("aw.certsTitle")} />
      <main className="screen wide stack-lg">
        <p className="muted">{t("aw.certsIntro")}</p>
        <section className="tiles">
          <div className="tile"><span>{t("aw.certCount")}</span><strong>{ready ? num(all.length) : "…"}</strong></div>
          <div className="tile"><span>{t("aw.people")}</span><strong>{ready ? num(new Set(all.map((r) => r.uid)).size) : "…"}</strong></div>
        </section>
        {fail && <p className="notice err">{fail.message}</p>}
        {!ready && !fail && <div className="loading" aria-busy="true" />}
        {ready && (
          <section className="panel stack">
            <input className="search-input" type="search" placeholder={t("aw.search")} aria-label={t("aw.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            {!rows.length && <p className="muted">{t("aw.noCerts")}</p>}
            {rows.map((r) => <CertRow key={key(r)} row={r} trackLabel={tracks.name(r.unit.track)} />)}
            {learners.data?.length === max && <div><Button variant="secondary" onClick={() => setMax(max + 300)}>{t("aw.more")}</Button></div>}
          </section>
        )}
      </main>
    </>
  );
}

function CertRow({ row, trackLabel }: { row: Earned; trackLabel: string }) {
  const { t, L, locale } = useI18n();
  const [open, setOpen] = useState(false);
  // When the last lesson was finished, or for a capstone when its last milestone was sent, if that was later (cert.ts).
  const { data: lastLesson, error } = useAsync(() => (open ? finishedAt(row.uid, row.unit.id) : Promise.resolve(null)), [open, row.uid, row.unit.id]);
  const last = lastLesson && row.sentAt && row.sentAt > lastLesson ? row.sentAt : lastLesson;
  return (
    <article className="stack-sm">
      <div className="row-gap">
        <TrackChip track={row.unit.track}>{trackLabel}</TrackChip>
        <strong>{L(row.unit.title)}</strong>
        <Link className="person-link" to={`/super/people/${row.uid}`} dir="auto">{row.label || t("aw.someone")}</Link>
        <Button size="sm" variant="ghost" icon="award" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? "aw.hide" : "aw.show")}</Button>
      </div>
      {open && error && <p className="notice err">{error.message}</p>}
      {open && last && <CertificateCard track={row.unit.track} kicker={t("cert.kicker")} trackLabel={trackLabel} name={row.name || "—"} title={L(row.unit.title)}
        date={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(last))} code={certCode(row.unit.id, last, row.uid)} />}
    </article>
  );
}
