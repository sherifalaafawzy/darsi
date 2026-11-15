import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, TextField, TrackChip, type Track } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin, USERNAME_DOMAIN, type SsoPerson } from "../auth/api";
import { scoredOf, type Profile, type Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { COMPETENCIES, competency, strength } from "../content/competencies";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { GRADED, type CatalogEntry, type Unit } from "../content/types";
import { useTracks } from "../content/settings";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote, useRead, type Read } from "../staff/LoadState";
import { cleanGroup, dropMembers, forgetMembers, managedByOrg, patchMembers, useCerts, useOrgStaff, usePerson, useProgress, useSubmissions, type ProgressDoc } from "./data";
import { projectStep, SubmissionCard } from "./SubmissionCard";
import { bestFramework, FrameworkPicker, PersonStandards } from "./Standards";
import { UserRolePanel } from "./OrgsAdmin";
import { Note, SuperGrantPanel, type Msg } from "./Super";
import { AccountActions } from "./AccountActions";
import { waitingOf } from "./review";
import { TabPanel, Tabs, type TabDef } from "./Tabs";
import { courseTitle, knownCourse } from "./courseTitles";
import { reasonOf } from "./refusals";
import { useDuration } from "./charts";
import { lastActiveText } from "./PeopleTable";
import { k, type PeopleKey } from "./peopleStrings";
import { framework, FRAMEWORKS } from "../content/standards";
import "../styles/person.css";
import "./strings";

// "today", "yesterday", "5 days ago": it lives with the people table now; the screens that took it from here still do.
export { lastActiveText } from "./PeopleTable";

/** A course id as the editor makes them; a lesson's id starts with its course's id and a dash. */
const COURSE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
type Ref = { lessonId: string; unitId?: string | null };
const unitOf = (r: Ref, catalog: CatalogEntry[]) => r.unitId || catalog.find((u) => r.lessonId.startsWith(`${u.id}-`))?.id;
/**
 * The published courses a person has results or projects in: only these are downloaded for their page, not every
 * course (about 6 MB). Older results without a unitId are matched by their lesson id. Each tab asks with its own rows
 * (Courses: the lesson results; Projects: the submissions), so neither waits for, or downloads for, the other.
 */
export function unitsUsed(catalog: CatalogEntry[], rows: Ref[]): CatalogEntry[] {
  const ids = new Set(rows.map((r) => unitOf(r, catalog)).filter(Boolean));
  return catalog.filter((u) => u.available && ids.has(u.id));
}
/**
 * A person's results by course, in catalog order: a published course with its rows, then a course no longer offered
 * (unpublished since) with only the rows whose lesson id belongs to it.
 */
export function courseGroups(catalog: CatalogEntry[], progress: ProgressDoc[]) {
  const by = new Map<string, ProgressDoc[]>();
  for (const p of progress) { const id = unitOf(p, catalog); if (id) by.set(id, [...(by.get(id) ?? []), p]); }
  const known = catalog.filter((u) => by.has(u.id)).map((entry) => ({ id: entry.id, entry: entry as CatalogEntry | null, rows: by.get(entry.id)! }));
  const gone = [...by.keys()].filter((id) => !catalog.some((u) => u.id === id) && COURSE_ID.test(id))
    .map((id) => ({ id, entry: null, rows: by.get(id)!.filter((p) => p.lessonId.startsWith(`${id}-`)) })).filter((g) => g.rows.length);
  return [...known, ...gone];
}

/** Capability profile: every competency the person has evidence for, grouped by framework. */
export function CapabilityProfile({ counts }: { counts: Record<string, number> }) {
  const { t, L } = useI18n();
  const codes = Object.keys(counts).filter((c) => competency(c)).sort();
  if (!codes.length) return <p className="muted">{t("p.noCourses")}</p>;
  const groups = ["UNESCO-T", "UNESCO-S", "DigComp", "Darsi"] as const;
  return (
    <div className="cap-groups">
      {groups.map((g) => {
        const list = codes.filter((c) => competency(c)!.framework === g);
        if (!list.length) return null;
        return (
          <div key={g} className="cap-group">
            <h4>{t(g === "UNESCO-T" ? "p.fw.unescoT" : g === "UNESCO-S" ? "p.fw.unescoS" : g === "DigComp" ? "p.fw.digcomp" : "p.fw.darsi")}</h4>
            {list.map((c) => {
              const comp = competency(c)!; const s = strength(counts[c]);
              return (
                <div key={c} className="cap-row">
                  <span className="cap-code" dir="ltr">{c}</span>
                  <span className="cap-label">{L(comp.label)}{comp.level ? ` — ${L(comp.level)}` : ""}</span>
                  <span className="cap-meter" role="img" aria-label={t(`p.level${s}` as "p.level1")}>{[1, 2, 3].map((i) => <i key={i} className={i <= s ? "on" : ""} />)}</span>
                  <span className="cap-word">{t(`p.level${s}` as "p.level1")}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Those courses' files, each on its own: one that fails doesn't blank the rest. */
function useUnits(used: CatalogEntry[]) {
  return useAsync(async () => {
    const got = await Promise.allSettled(used.map((u) => loadUnit(u.id)));
    return { units: got.flatMap((g) => (g.status === "fulfilled" ? [g.value] : [])) as Unit[], failed: got.filter((g) => g.status === "rejected").length };
  }, [used.map((u) => u.id).join(",")]);
}

/**
 * One person, for their admins and their teacher, in tabs (admin/Tabs.tsx; `?tab=` in the address): Progress (the
 * default), Courses, Projects and, for admins, Account. Opening the page reads one document, the profile: Progress
 * shows only its summary, the Projects tab's count is the profile's own, and each other tab reads what it lists
 * (lesson results, certificates and course files; submissions; the organization's staff) when it is first opened.
 */
export function PersonDetail({ back = "/admin?tab=people" }: { back?: string }) {
  const { uid = "" } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const { role: myRole } = useAuth();
  const personQ = usePerson(uid);
  const { data: person, error } = personQ;
  const isAdmin = myRole === "orgAdmin" || myRole === "superadmin";
  // Once the Projects tab has read this person's projects, the count on the tab is theirs: the profile's number is set
  // by a trigger a moment after a review (functions/src/waiting.ts), so the profile read again right then can be old.
  const [counted, setCounted] = useState<{ uid: string; n: number } | null>(null);
  // A read that failed for a reason of its own (offline, the service down), in the reader's language: worked out once
  // per error, not per render (errorText logs the raw error for "Report a problem").
  const why = useMemo(() => (error && !person ? errorText(error, t) : ""), [error, person, t]);

  if ((error && !person) || person === null) {
    // The rules refuse a teacher someone else's student (an old link, a student moved to another teacher) and an admin
    // someone outside their organization; a deleted account reads as nothing. Say which, not the rules' own words.
    const gone = person === null, denied = !gone && (error as { code?: string }).code === "permission-denied" && myRole !== "superadmin";
    return (
      <main className="screen">
        <EmptyState tone={gone || denied ? "neutral" : "error"} icon={gone || denied ? "profile" : undefined}
          title={gone ? t("p.notFound") : denied ? t(myRole === "teacher" ? "p.notYours" : "p.notMember") : t("err.title")}
          body={gone || denied ? undefined : why} action={<Button size="sm" variant="secondary" onClick={() => nav(back)}>{t("common.back")}</Button>} />
      </main>
    );
  }
  if (!person) return <div className="loading" aria-busy="true" />;
  const name = person.name || displayLogin(person.email ?? "") || "—";
  const TABS: TabDef[] = [
    { id: "progress", label: t("tabs.progress") },
    { id: "courses", label: t("tabs.courses") },
    // Projects waiting for a review: the count the server keeps on the profile (review.ts), so it costs no read.
    { id: "projects", label: t("tabs.projects"), badge: counted?.uid === uid ? counted.n : waitingOf(person) },
    // A teacher has nothing there: roles, classes, passwords and accounts are their admins'.
    { id: "account", label: t("tabs.account"), hidden: !isAdmin },
  ];

  return (
    <>
      <AppBar title={name} onBack={() => nav(back)} backLabel={t("common.back")} />
      <main className="screen wide person">
        <section className="person-head">
          <div className="avatar" aria-hidden>{(person.name || "?").slice(0, 1)}</div>
          <div>
            <h2 className="section-title">{name}</h2>
            {/* An account the school's sign-in made has no email of its own: the address the school vouched for. */}
            <p className="muted" dir="ltr">{displayLogin(person.email ?? "") || person.ssoEmail || ""}</p>
            <p className="muted">{[person.role && t(`rn.${person.role}` as "rn.student"), person.group, `${t("col.last")}: ${lastActiveText(person.summary?.lastActive ?? (person as Profile & { lastActive?: string }).lastActive, t)}`].filter(Boolean).join(t("common.sep"))}</p>
          </div>
        </section>

        {/* Keyed by the person: another person's page (Back and Forward) starts with nothing kept from this one's panels. */}
        <Tabs key={uid} label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="progress"><ProgressPanel person={person} /></TabPanel>
          <TabPanel id="courses"><CoursesPanel uid={uid} /></TabPanel>
          {/* The count read here also goes into the member lists already read (data.ts), so the dashboard's "to review" follows without a read. */}
          <TabPanel id="projects"><ProjectsPanel uid={uid} onReviewed={personQ.reload} onCount={(n) => { setCounted((c) => (c?.uid === uid && c.n === n ? c : { uid, n })); if (person.orgId) patchMembers(person.orgId, uid, { projectsWaiting: n }); }} /></TabPanel>
          {isAdmin && <TabPanel id="account"><AccountPanel uid={uid} person={person} name={name} back={back} reload={personQ.reload} /></TabPanel>}
        </Tabs>
      </main>
    </>
  );
}

/**
 * Progress: the numbers, capabilities and standards, all from the summary the server keeps on the profile
 * (functions/src/summary.ts). It counts only published lessons, with their competencies from the course itself; lesson
 * results are the phone's word, so nothing here is worked out from them, and nothing more is read.
 */
function ProgressPanel({ person }: { person: Profile }) {
  const { t, num } = useI18n();
  const dur = useDuration();
  const [fwId, setFwId] = useState<string | null>(null);
  const sum = person.summary;
  const seconds = sum?.seconds ?? (sum?.tracks ? Object.values(sum.tracks).reduce((a, x) => a + (x.sec || 0), 0) : null);
  const shownFw = fwId ?? bestFramework(person, person.role === "student" ? "unesco-s" : "unesco-t");
  return (
    <>
      {/* How many projects is the Projects tab's own (its count of those waiting sits on the tab): counting them here would read them all. */}
      <dl className="person-stats">
        <div><dt>{t("col.lessons")}</dt><dd>{num(sum?.lessonsDone ?? 0)}</dd></div>
        <div><dt>{t("col.xp")}</dt><dd>{num(sum?.xp ?? 0)}</dd></div>
        {/* Accuracy over graded lessons only: a project lesson is done, not scored (scoredOf). */}
        <div><dt>{t("col.accuracy")}</dt><dd>{scoredOf(sum) ? num(sum!.avgAccuracy, { style: "percent" }) : "—"}</dd></div>
        <div><dt>{t("or.time")}</dt><dd>{seconds == null ? "—" : dur(seconds)}</dd></div>
      </dl>
      <div className="person-cols">
        <section className="panel"><h3>{t("p.capabilities")}</h3><CapabilityProfile counts={sum?.competencies ?? {}} /></section>
        <section className="panel stack"><h3>{t("or.personStandards")}</h3>
          <FrameworkPicker value={shownFw} onChange={setFwId} />
          <PersonStandards person={person} fw={framework(shownFw) ?? FRAMEWORKS[0]} />
        </section>
      </div>
    </>
  );
}

/**
 * Courses: which lessons were done, by course. Lesson results only list which lessons, and only lessons the course
 * really has. Read when the tab is first opened: the results, the certificates, the catalog, and the file of each
 * course with results (never every course, about 6 MB each; never the courses that only have a project).
 */
function CoursesPanel({ uid }: { uid: string }) {
  const { t, L, num, locale } = useI18n();
  const tracks = useTracks();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const progressQ = useProgress(uid);
  const progress = progressQ.data;
  // Certificates as first earned (one read): a course unpublished since keeps its title and "done". Not readable, nothing.
  const certsQ = useCerts(uid);
  const certs = useMemo(() => new Map((certsQ.data ?? []).map((c) => [c.id, c])), [certsQ.data]);
  const { data: catalog } = useAsync(loadCatalog, []);
  const used = useMemo(() => (catalog && progress ? unitsUsed(catalog.units, progress) : []), [catalog, progress]);
  const unitsQ = useUnits(used);
  const units = unitsQ.data?.units ?? [];
  const groups = useMemo(() => (catalog && progress ? courseGroups(catalog.units, progress) : null), [catalog, progress]);
  return (
    <section className="panel"><h3>{t("p.courses")}</h3>
      {!groups ? (progressQ.error ? <ErrorNote error={progressQ.error} reload={progressQ.reload} /> : <p className="muted" aria-busy="true">{t("p.loadingCourses")}</p>) : groups.length === 0 ? <p className="muted">{t("p.noCourses")}</p> : <>
        {unitsQ.loading && <p className="muted small" aria-busy="true">{t("p.loadingCourses")}</p>}
        {!unitsQ.loading && (unitsQ.data?.failed ?? 0) > 0 && <div className="notice err row-gap" role="status"><span>{t("p.coursesFailed")}</span><Button size="sm" variant="ghost" icon="sync" onClick={unitsQ.retry}>{t("common.retry")}</Button></div>}
        {groups.map((g) => {
          const u = units.find((x) => x.id === g.id), cert = certs.get(g.id);
          const known = g.entry ? undefined : knownCourse(g.id);
          const track = (g.entry?.track ?? cert?.track ?? known?.track ?? g.rows[0]?.track) as Track | undefined;
          const done = u ? u.lessons.filter((l) => g.rows.some((p) => p.lessonId === l.id)) : [];
          return (
            <div key={g.id} className="course">
              <div className="course-head">
                {track && <TrackChip track={track}>{tracks.name(track)}</TrackChip>}
                {g.entry ? <strong>{L(g.entry.title)}</strong> : <><strong>{cert ? L(cert.title) : known ? L(known.title) : <bdi dir="ltr">{g.id}</bdi>}</strong><span className="muted small">{t("p.retired")}</span></>}
                {(cert || (u && done.length === u.lessons.length)) && <span className="badge-ok"><Icon name="award" size={16} />{t("p.unitDone")}</span>}
              </div>
              {u ? <ul>{u.lessons.map((l) => { const p = g.rows.find((x) => x.lessonId === l.id); return (
                <li key={l.id} className={p ? "done" : ""}><Icon name={p ? "check" : "lock"} size={16} /><span>{L(l.title)}</span>
                  {/* A lesson with nothing graded (a project, a capstone stage) is done, not scored: its date only. */}
                  {p && <span className="muted small">{[...(l.steps.some((s) => GRADED.has(s.type)) ? [num(p.accuracy, { style: "percent" })] : []), dateFmt.format(new Date(p.completedAt))].join(t("common.sep"))}</span>}</li>); })}</ul>
                : <p className="muted small">{t("p.lessonsLine", { n: g.rows.filter((p) => p.lessonId.startsWith(`${g.id}-`)).length })}</p>}
            </div>
          );
        })}
      </>}
    </section>
  );
}

/**
 * Projects: what the person handed in, to review. Read when the tab is first opened: the submissions, the catalog, and
 * the file of each course with a submission (for the project's lesson title and its step).
 */
function ProjectsPanel({ uid, onReviewed, onCount }: { uid: string; /** Reads the person again: the lists they are on show the profile's count of projects waiting. */ onReviewed: () => void;
  /** How many of the projects read here wait for a review, for the tab's count (told again after each review's re-read). */ onCount: (n: number) => void }) {
  const { t, L } = useI18n();
  const subsQ = useSubmissions(uid);
  const subs = subsQ.data;
  const waiting = subs?.filter((s) => s.status === "submitted").length;
  useEffect(() => { if (waiting !== undefined) onCount(waiting); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  // Projects still loading are "Loading…", never "No projects submitted yet".
  const subsLoading = subsQ.loading && !subs;
  const { data: catalog } = useAsync(loadCatalog, []);
  const used = useMemo(() => (catalog && subs ? unitsUsed(catalog.units, subs) : []), [catalog, subs]);
  const unitsQ = useUnits(used);
  const lessonIndex = useMemo(() => Object.fromEntries((unitsQ.data?.units ?? []).flatMap((u) => u.lessons.map((l) => [l.id, { unit: u, lesson: l }]))), [unitsQ.data]);
  const projectTitle = (lessonId: string, unitId?: string) => {
    const at = lessonIndex[lessonId];
    if (at) return L(at.lesson.title);
    // Its course's title, also for a course no longer published (courseTitles.json), else the lesson id.
    const id = unitId || (catalog ? unitOf({ lessonId }, catalog.units) : undefined);
    const c = id ? courseTitle(id, catalog?.units, L) : null;
    return c?.known ? c.text : lessonId;
  };
  return (
    <section className="panel"><h3>{t("p.projects")}</h3>
      {subsLoading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : subsQ.error && !subs ? <ErrorNote error={subsQ.error} reload={subsQ.reload} />
        : !subs?.length ? <p className="muted">{t("p.noProjects")}</p> : subs.map((s) => <SubmissionCard key={s.id} uid={uid} sub={s} lessonTitle={projectTitle(s.lessonId, s.unitId)} step={projectStep(lessonIndex[s.lessonId]?.lesson, s.stepId)}
          onReviewed={() => { subsQ.reload(); onReviewed(); }} />)}
    </section>
  );
}

/**
 * Account (admins only): a platform admin's role, organization and Super panels, the organization's own actions (role,
 * class, teacher, password, removal), then the person's data and deleting the account. The organization's staff, for the
 * teacher picker, is read when the tab is first opened.
 */
function AccountPanel({ uid, person, name, back, reload }: { uid: string; person: Profile; name: string; /** Where removing or deleting leads, with what was done. */ back: string; /** Reads the person again. */ reload: () => void }) {
  const nav = useNavigate();
  const { t } = useI18n();
  const { role: myRole, user } = useAuth();
  // Who can be this student's teacher: the teachers and admins of their organization (for org and platform admins).
  const staff = useOrgStaff(person.role === "student" ? person.orgId : null);
  const [msg, setMsg] = useState<Msg>(null);
  const [newPw, setNewPw] = useState<{ login: string; pw: string } | null>(null);
  const [role, setRole] = useState<Role | "">("");
  // The question on the page: a new role, a new password, a suspension (or its end). Removal keeps its own (`asking`).
  const [ask, setAsk] = useState<"role" | "reset" | "suspend" | null>(null);
  const [busy, setBusy] = useState<"" | "role" | "reset" | "suspend" | "edit">("");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  // A second tap while a call is out sends nothing: the button's own "busy" is a render late for a double click.
  const sending = useRef(false);
  // Your own page: no role change, password reset, suspension, removal or deletion (the server refuses them all;
  // nothing here offers them).
  const self = !!user && person.uid === user.uid;
  const orgId = person.orgId ?? "";
  // A login the organization made (a username): the only kind it can lock, and whose password it can set.
  const username = !!person.email?.endsWith(`@${USERNAME_DOMAIN}`);
  // Managed as the server decides (data.ts managedByOrg): `managedBy`, else a username login; never who made the profile.
  const managed = managedByOrg(person, orgId);
  // How the school's own sign-in stands for this person: one read (manageSso person) when this panel first shows
  // someone the school's sign-in knows, and again after an action in the School sign-in panel below.
  const school = useSchoolState(person);
  // Only the school's sign-in opens the account: there is no Darsi password to speak of, and "their own email or
  // Google" would be wrong. Auth's own word when the read has it (an account the school's sign-in made keeps `sso` on
  // its profile after the person adds a login of their own); until then, and for anyone the read isn't about, the profile's.
  const own = school.data?.ownLogin;
  const schoolOnly = typeof own === "boolean" ? !own : school.loading ? person.sso === true : ssoOnly(person);
  const suspended = Boolean(person.suspended);
  // The member lists already read (admin/data.ts) follow what is changed here without a read.
  const seen = (fields: Partial<Profile>) => { if (orgId) patchMembers(orgId, uid, fields); };
  /**
   * One action at a time. A refusal is said in the admin's language (staff/errors.ts: the server's reason code, then
   * the SDK's; never its raw English); `said` words the refusals that mean something else on this button.
   */
  const run = async (what: Exclude<typeof busy, "">, fn: () => Promise<unknown>, done?: string, said?: (e: unknown) => string | undefined) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(what); setMsg(null);
    try { await fn(); if (done) setMsg({ ok: true, text: done }); reload(); }
    catch (e) { setMsg({ ok: false, text: said?.(e) ?? errorText(e, t) }); }
    // A class or teacher saved (on leaving its field) answers no question: one that is open stays open.
    finally { sending.current = false; setBusy(""); if (what !== "edit") setAsk(null); }
  };
  // Class and teacher go through updateMembers: checked (the teacher must teach here) and written to the audit log.
  const update = (patch: { group?: string | null; teacherId?: string | null }) =>
    run("edit", async () => { await api.updateMembers({ orgId, uids: [uid], patch }); seen(patch); }, t("common.saved"));
  // A refused role goes back to the saved one in the picker.
  const saveRole = () => run("role", async () => {
    try { await api.setMemberRole({ orgId, uid, role: role as Role }); } catch (e) { setRole(""); throw e; }
    seen({ role: role as Role });
  }, t("common.saved"));
  const resetPw = () => run("reset", async () => {
    setNewPw(null);
    const r = await api.resetMemberPassword({ orgId, uid });
    setNewPw({ login: displayLogin(r.login), pw: r.password });
    seen({ mustChangePassword: true });
  });
  const suspend = () => run("suspend", async () => {
    await api.setMemberSuspended({ orgId, uid, suspended: !suspended, ...(!suspended && reason.trim() ? { reason: reason.trim() } : {}) });
    seen({ suspended: !suspended });
    setReason("");
  }, t(suspended ? "acc.restored" : "acc.suspended"),
  // Elsewhere "own-login" is about a password: here it is why the account can't be locked, and what to do instead.
  (e) => (reasonOf(e) === "own-login" ? t(k("pp.suspendOwnLogin")) : undefined));
  const remove = async () => {
    if (sending.current) return;
    sending.current = true;
    setMsg(null); setRemoving(true);
    try { await api.removeMember({ orgId, uid }); dropMembers(orgId, uid); nav(back, { state: { done: t("p.removed", { name: isolate(name) }) } }); }
    catch (e) { setAsking(false); setMsg({ ok: false, text: errorText(e, t) }); } finally { sending.current = false; setRemoving(false); }
  };
  /** Opens one question, closing any other. */
  const open = (q: typeof ask) => { setMsg(null); setAsking(false); setAsk(q); };
  const teacherKnown = (staff.data ?? []).some((s) => s.uid === person.teacherId);
  // The staff list failed and there is nothing to choose from: why, worked out once per error.
  const staffFailed = staff.error !== undefined && !staff.data;
  const staffWhy = useMemo(() => (staff.error !== undefined && !staff.data ? errorText(staff.error, t) : ""), [staff.error, staff.data, t]);
  const roleName = (r: Role) => t(`rn.${r}` as "rn.student");
  // A platform admin's "Role and organization" answers nothing about what it saved: the profile read again after it
  // does. The member lists already read then follow without reading every member again: a new role is patched into
  // the row; a move takes the row out of the old organization's list, and the new one's (which has no row to patch)
  // is read again when next opened.
  const moved = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const before = moved.current;
    if (before === undefined) return;
    moved.current = undefined;
    const now = person.orgId ?? null;
    if (before && before !== now) dropMembers(before, uid);
    if (now && before !== now) forgetMembers(now);
    else if (now && person.role) patchMembers(now, uid, { role: person.role });
  }, [person, uid]);
  return (
    <>
      {/* Platform admins: any role, any organization (OrgsAdmin.tsx). */}
      {myRole === "superadmin" && <UserRolePanel person={person} onSaved={() => { moved.current = person.orgId ?? null; reload(); }} />}
      {myRole === "superadmin" && <SuperGrantPanel person={person} onChanged={reload} />}

      {person.orgId && (
        <section className="panel"><h3>{t("p.actions")}</h3>
          <div className="form-grid">
            {/* Platform admins change roles in "Role and organization" above (setUserRole), not with a second picker. */}
            {myRole === "orgAdmin" && !self && <>
              <label>{t("col.role")}
                <select value={role || person.role} disabled={!!busy} onChange={(e) => setRole(e.target.value as Role)}>
                  {(["student", "teacher", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
                </select></label>
              {/* A new role signs the person out and can take their teacher or their students away: asked first. */}
              <Button size="sm" variant="secondary" disabled={!role || role === person.role || !!busy} loading={busy === "role"} aria-expanded={ask === "role"} onClick={() => open("role")}>{t("p.saveRole")}</Button>
            </>}
            <label>{t("col.group")}<input key={uid} defaultValue={person.group ?? ""} maxLength={60} disabled={!!busy}
              onBlur={(e) => { const g = cleanGroup(e.target.value); e.target.value = g ?? ""; if (g !== (person.group ?? null)) void update({ group: g }); }} /></label>
            {person.role === "student" && <label>{t("col.teacher")}
              <select value={person.teacherId ?? ""} disabled={!staff.data || !!busy} onChange={(e) => { void update({ teacherId: e.target.value || null }); }}>
                <option value="">{t("adm.noTeacher")}</option>
                {/* Their teacher while the list loads, or someone who no longer teaches here. */}
                {person.teacherId && !teacherKnown && <option value={person.teacherId}>{staff.data ? t("p.formerTeacher") : "…"}</option>}
                {(staff.data ?? []).map((tc) => <option key={tc.uid} value={tc.uid}>{tc.name || displayLogin(tc.email ?? "")}</option>)}
              </select></label>}
          </div>
          {/* Without the staff list the picker stays shut: say so, and offer the read again (it used to stay grey for ever). */}
          {staffFailed && (
            <div className="notice err row-gap" role="alert">
              <span>{t(k("pp.staffFailed"))} {staffWhy}</span>
              <Button size="sm" variant="ghost" icon="sync" onClick={staff.reload}>{t("common.retry")}</Button>
            </div>
          )}
          {ask === "role" && role && !self && (
            <InlineConfirm title={t(k("pp.roleAsk"), { name: isolate(name), role: roleName(role) })} body={t(k("pp.roleBody"))} confirmLabel={t(k("pp.roleYes"))} busy={busy === "role"}
              onConfirm={() => { void saveRole(); }} onCancel={() => setAsk(null)} />
          )}
          {self ? <p className="muted small">{t("p.self")}</p> : <div className="row-gap">
            {/* Only logins the organization made (usernames); people with their own email or Google reset it themselves (M4). */}
            {username ? <Button size="sm" variant="secondary" icon="sync" disabled={!!busy} loading={busy === "reset"} aria-expanded={ask === "reset"} onClick={() => open("reset")}>{t("p.resetPw")}</Button>
              : schoolOnly ? null : <p className="muted small">{t("acct.ownLogin")}</p>}
            {/* Locking a login is the organization's for the logins it made; a platform admin's own switch is in the panel below. */}
            {myRole === "orgAdmin" && managed && <Button size="sm" variant="secondary" icon="lock" disabled={!!busy} loading={busy === "suspend"} aria-expanded={ask === "suspend"} onClick={() => open("suspend")}>{t(suspended ? "acc.restore" : "acc.suspend")}</Button>}
            {/* It stays while the question is open: Cancel gives it the focus back. */}
            <Button size="sm" variant="ghost" icon="close" disabled={!!busy || removing} aria-expanded={asking} onClick={() => { setMsg(null); setAsk(null); setAsking(true); }}>{t("p.remove")}</Button>
          </div>}
          {/* The old password stops working the moment this is confirmed: never on one stray tap. */}
          {ask === "reset" && !self && (
            <InlineConfirm danger title={t(k("pp.resetOneAsk"), { name: isolate(name) })} body={t(k("pp.resetOneBody"))} confirmLabel={t(k("pp.resetYes"))} busy={busy === "reset"}
              onConfirm={() => { void resetPw(); }} onCancel={() => setAsk(null)} />
          )}
          {ask === "suspend" && !self && (
            <InlineConfirm danger={!suspended} title={t(k(suspended ? "pp.restoreOneAsk" : "pp.suspendOneAsk"), { name: isolate(name) })} body={t(k(suspended ? "pp.restoreBody" : "pp.suspendOneBody"))}
              confirmLabel={t(k(suspended ? "pp.restore" : "pp.suspend"))} busy={busy === "suspend"} onConfirm={() => { void suspend(); }} onCancel={() => setAsk(null)}>
              {/* Why, kept in the record: asked where the suspension is confirmed. */}
              {!suspended && <TextField id="p-suspend-reason" label={t("acc.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />}
            </InlineConfirm>
          )}
          {/* Removing signs them out everywhere and clears their class and teacher: asked here, as the app asks elsewhere (no browser dialog). */}
          {asking && !self && (
            <InlineConfirm danger title={t("p.removeAsk", { name: isolate(name) })} confirmLabel={t("p.removeYes")} busy={removing}
              onConfirm={() => { void remove(); }} onCancel={() => setAsking(false)} />
          )}
          {newPw && <NewPassword login={newPw.login} pw={newPw.pw} />}
          <Note msg={msg} />
        </section>
      )}
      {/* How the school's own sign-in stands for this person, and what an admin can do about it (nothing for most people). */}
      <SchoolSignIn person={person} name={name} self={self} reload={reload} school={school} />
      {/* Data requests and abuse: their data, deleting the account, suspending it (AccountActions.tsx decides who sees it). */}
      <AccountActions person={person} onDeleted={() => { if (orgId) dropMembers(orgId, uid); nav(back, { state: { done: t("acc.deleted", { name: isolate(name) }) } }); }} onChanged={reload} />
    </>
  );
}

/** Someone the school's sign-in knows: an account it made (`sso`), or one connected to it since (`ssoLinkedAt`). */
const hasSchool = (p: Profile) => p.sso === true || !!p.ssoLinkedAt;
/** Made by the school's sign-in, with no email login added since, as far as the profile says (Auth's word is the read below). */
const ssoOnly = (p: Profile) => p.sso === true && !p.email;
/** The organization whose school sign-in this is about: the person's own, or for someone it removed, the one that manages the account. */
const schoolOrg = (p: Profile) => p.orgId || p.managedBy || "";

const SSO_STATES = ["active", "blocked", "removed", "none"] as const, SSO_LINKED = ["jit", "org-made", "self", "admin-map"] as const;
/** manageSso person's answer, read strictly: a shape this page doesn't know is no answer (nothing is offered on a guess). */
function readSsoPerson(r: Record<string, unknown>): SsoPerson {
  const state = SSO_STATES.find((x) => x === r.state);
  if (!state) throw new Error("manageSso person: unknown answer");
  return {
    state, linked: SSO_LINKED.find((x) => x === r.linked) ?? null,
    blockedBy: state !== "blocked" ? null : r.blockedBy === "admin" ? "admin" : "suspension",
    ownLogin: typeof r.ownLogin === "boolean" ? r.ownLogin : null,
  };
}
/**
 * One person's school sign-in as the server holds it (functions/src/sso.ts manageSso `person`: no client reads the
 * identities). Called in the Account tab's panel, which isn't rendered until that tab is opened, so the other tabs
 * read nothing; one call, only for someone the school's sign-in knows in an organization, and again on reload().
 */
function useSchoolState(person: Profile): Read<SsoPerson> {
  const orgId = schoolOrg(person), uid = person.uid;
  const ask = hasSchool(person) && !!orgId;
  return useRead(ask ? () => api.manageSso({ action: "person", orgId, uid }).then(readSsoPerson) : null, [uid, orgId, ask]);
}

type SsoAct = "block" | "unblock" | "unlink" | "allowBack";
const SSO_ACTS: Record<SsoAct, { label: PeopleKey; ask: PeopleKey; body: PeopleKey; yes: PeopleKey; danger: boolean }> = {
  block: { label: "pp.sso.block", ask: "pp.sso.blockAsk", body: "pp.sso.blockBody", yes: "pp.sso.blockYes", danger: true },
  unblock: { label: "pp.sso.unblock", ask: "pp.sso.unblockAsk", body: "pp.sso.unblockBody", yes: "pp.sso.unblockYes", danger: false },
  unlink: { label: "pp.sso.unlink", ask: "pp.sso.unlinkAsk", body: "pp.sso.unlinkBody", yes: "pp.sso.unlinkYes", danger: true },
  allowBack: { label: "pp.sso.allowBack", ask: "pp.sso.allowBackAsk", body: "pp.sso.allowBackBody", yes: "pp.sso.allowBackYes", danger: false },
};
/**
 * What manageSso's refusals mean on each button, where the shared words (staff/errors.ts) would say something else or
 * nothing: `sso-login` elsewhere is "no password to reset", on Disconnect it is "no other way in"; `no-account` on
 * "Let back in" is "wasn't removed" (functions/src/sso.ts allowBack, unlink). The page offers only what the state it
 * read allows, so these are for a state that changed since (another admin, another tab).
 */
const SSO_SAID: Record<SsoAct, Record<string, PeopleKey>> = {
  block: { "no-account": "pp.sso.rf.none" },
  unblock: { "no-account": "pp.sso.rf.none" },
  unlink: { "no-account": "pp.sso.rf.none", "sso-login": "pp.sso.rf.only", "sso-disabled": "pp.sso.rf.blocked" },
  allowBack: { "no-account": "pp.sso.rf.notRemoved", "sso-other-org": "pp.sso.rf.otherOrg", "sso-staff": "pp.sso.rf.staff", "sso-org-inactive": "pp.sso.rf.orgInactive" },
};
/** The state in words, and how the account came to the school's sign-in. */
const SSO_STATE: Record<Exclude<SsoPerson["state"], "blocked">, PeopleKey> = { active: "pp.sso.st.active", removed: "pp.sso.st.removed", none: "pp.sso.st.none" };
const SSO_HOW: Record<NonNullable<SsoPerson["linked"]>, PeopleKey> = { jit: "pp.sso.how.jit", "org-made": "pp.sso.how.org-made", self: "pp.sso.how.self", "admin-map": "pp.sso.how.admin-map" };

/**
 * What applies to the state that was read, and nothing else:
 * - active: Block, and Disconnect unless the school's sign-in is the account's only way in (the server would refuse);
 * - blocked by an admin: Unblock (a block that came with a suspension is lifted by restoring the account, not here);
 * - removed by the organization: "Let back in";
 * - none, or not known (still reading, or the read failed): nothing.
 * Someone who isn't a member has nothing to block or disconnect: only the way back.
 */
export function ssoOffered(st: SsoPerson | undefined, member: boolean, made: boolean): SsoAct[] {
  if (!st) return [];
  if (st.state === "removed") return ["allowBack"];
  if (!member) return [];
  if (st.state === "active") return made && st.ownLogin === false ? ["block"] : ["block", "unlink"];
  return st.state === "blocked" && st.blockedBy === "admin" ? ["unblock"] : [];
}

/**
 * School sign-in on a person's Account tab (design §7; the server is functions/src/sso.ts manageSso): how the school's
 * own sign-in stands for them, in words, and what an admin can do about it. The identities themselves are the
 * server's, so the panel asks for the person's state once (`school`, read by the Account panel) and offers only what
 * applies to it (ssoOffered): Block or Unblock (the school's sign-in stops or starts opening the account), Disconnect
 * (a connected account goes back to its own login only) and "Let back in" (someone the organization removed: an
 * account the school's sign-in made or matched returns as a student; a person's own account is only allowed back,
 * never moved). Each is asked about first, its answer says what was found, and the state is read again after it.
 * "Signs in through the school … no Darsi password to reset" is said only when Auth says the account has no login of
 * its own: the profile's `sso` flag stays for good, also after the person adds an email login. Nothing is shown for
 * a person the school's sign-in doesn't know.
 *
 * The organization is the person's own, or for someone it removed, the one that manages the account (`managedBy`),
 * which is how a platform admin lets a removed school account back in from /super/people/:uid.
 */
function SchoolSignIn({ person, name, self, reload, school }: { person: Profile; name: string; /** The admin's own page: nothing to do here. */ self: boolean; /** Reads the person again. */ reload: () => void;
  /** The person's school sign-in as the server holds it (useSchoolState). */ school: Read<SsoPerson> }) {
  const { t, locale } = useI18n();
  const id = useId();
  const [ask, setAsk] = useState<SsoAct | null>(null);
  const [busy, setBusy] = useState<SsoAct | "">("");
  const [msg, setMsg] = useState<Msg>(null);
  // A second tap while a call is out sends nothing (state alone is a render late).
  const sending = useRef(false);
  const known = hasSchool(person);
  const member = !!person.orgId;
  const orgId = schoolOrg(person);
  const who = isolate(name);
  // The answer an action was sent on. Until the read after it is in (a new answer, or its failure), that one is out of
  // date: nothing is said or offered on it (on a slow connection "opens this account" would sit under "is blocked",
  // with Block still on offer).
  const [acted, setActed] = useState<SsoPerson | null>(null);
  const settling = acted !== null && school.data === acted && school.error === undefined;
  const st = settling ? undefined : school.data;
  /** Reads the state again, holding back the one shown now until it answers. */
  const again = () => { setActed(school.data ?? null); school.reload(); };

  const run = async (what: SsoAct) => {
    if (sending.current || !orgId) return;
    sending.current = true;
    setBusy(what); setMsg(null);
    try {
      const r = await api.manageSso({ action: what, orgId, uid: person.uid });
      // "Let back in" for someone with nothing removed changes nothing and is answered, not refused (allowed: false).
      if (what === "allowBack" && r.allowed === false) setMsg({ ok: false, text: t(k("pp.sso.rf.notRemoved")) });
      else {
        const n = Number(what === "unlink" ? r.unlinked : r.changed) || 0;
        const done: PeopleKey = what === "block" ? (n ? "pp.sso.blocked" : "pp.sso.blockedAlready")
          : what === "unblock" ? (n ? "pp.sso.unblocked" : "pp.sso.unblockedNone")
          : what === "unlink" ? (n ? "pp.sso.unlinked" : "pp.sso.unlinkedNone")
          // Put back into the organization; or already in it (only the sign-in was let back); or not moved at all
          // (`rejoined: false` outside it: a person's own account, or one that was deleted).
          : r.rejoined === true ? "pp.sso.back" : member ? "pp.sso.backIn" : "pp.sso.backOwn";
        setMsg({ ok: true, text: t(k(done), { name: who }) });
        // The profile changed only for these: the connection's date went, or the person is a member again (the member
        // list already read has no row for them, so it is read again when next opened).
        if (what === "allowBack" && r.rejoined === true) forgetMembers(orgId);
        if ((what === "unlink" && n > 0) || what === "allowBack") reload();
      }
      // What is offered follows the state as it is now.
      again();
    } catch (e) {
      // errorText first either way: it logs the server's real answer for "Report a problem".
      const shared = errorText(e, t), reason = reasonOf(e);
      const mine = Object.prototype.hasOwnProperty.call(SSO_SAID[what], reason) ? SSO_SAID[what][reason] : undefined;
      setMsg({ ok: false, text: mine ? t(k(mine)) : shared });
      // A refusal that names a state other than the one shown (blocked or gone meanwhile): read it again.
      if (mine) again();
    } finally { sending.current = false; setBusy(""); setAsk(null); }
  };

  // After a Disconnect the profile no longer says "connected": what was done stays on the page all the same.
  if (!known && !msg) return null;
  const made = person.sso === true;
  // Truly no login of its own (Auth's word, from the read): never from the profile's flag alone.
  const only = made && st?.ownLogin === false;
  const reading = (school.loading && !st) || settling;
  const since = person.ssoLinkedAt && st?.state !== "none" ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(person.ssoLinkedAt)) : "";
  const offered = known && !self && orgId ? ssoOffered(st, member, made) : [];
  const asked = ask && offered.includes(ask) ? SSO_ACTS[ask] : null;
  return (
    <section className="panel stack" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>{t(k("pp.sso.title"))}</h3>
      {reading && <p className="muted small" role="status" aria-busy="true">{t(k("pp.sso.checking"))}</p>}
      {known && school.error !== undefined && <ErrorNote error={school.error} reload={school.reload} stale={!!st} />}
      {/* Said once the read is in (or failed): while it is out, nothing is claimed about how the account is opened. */}
      {made && !reading && <p><strong>{t(k(only ? "pp.sso.only" : "pp.sso.made"))}</strong>{person.ssoEmail ? <>{": "}<bdi dir="ltr">{person.ssoEmail}</bdi></> : null}</p>}
      {only && <p className="muted small">{t(k("pp.sso.onlyHint"))}</p>}
      {made && st?.ownLogin === true && <p className="muted small">{t(k("pp.sso.madeHint"))}</p>}
      {known && st && <p>{t(k(st.state === "blocked" ? (st.blockedBy === "admin" ? "pp.sso.st.blockedAdmin" : "pp.sso.st.blockedSuspension") : SSO_STATE[st.state]))}</p>}
      {/* How it came to be, unless the line above already says the school's sign-in made the account. */}
      {known && st?.linked && !(st.linked === "jit" && made) && <p className="muted small">{t(k(SSO_HOW[st.linked]))}</p>}
      {since && <p className="muted small">{t(k("pp.sso.linked"), { date: since })}</p>}
      {known && !member && <p className="muted small">{t(k("pp.sso.gone"))}</p>}
      {offered.length > 0 && (
        <div className="row-gap" role="group" aria-label={t(k("pp.sso.actions"))}>
          {offered.map((a) => (
            <Button key={a} size="sm" variant="secondary" icon={a === "block" ? "lock" : undefined} disabled={!!busy} loading={busy === a} aria-expanded={ask === a}
              onClick={() => { setMsg(null); setAsk(a); }}>{t(k(SSO_ACTS[a].label))}</Button>
          ))}
        </div>
      )}
      {/* Keyed by the action: asking about another one is another question (its focus starts again). */}
      {ask && asked && <InlineConfirm key={ask} danger={asked.danger} title={t(k(asked.ask), { name: who })} body={t(k(asked.body))} confirmLabel={t(k(asked.yes))} busy={busy === ask}
        onConfirm={() => { void run(ask); }} onCancel={() => setAsk(null)} />}
      <Note msg={msg} />
    </section>
  );
}

/**
 * A new password, shown once. The login and the password are elements of their own, not text in the sentence: in a
 * right-to-left paragraph, a password ending in "!" or "?" would be drawn with that character in front of the login.
 * An element with `dir` is isolated, and nothing invisible is added, so copying gives exactly the password.
 */
export function NewPassword({ login, pw }: { login: string; pw: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = t("p.newPw", { login: "\u0001", pw: "\u0002" });
  // A translation (a published language pack) that lost a placeholder must still show the password: it is shown only now.
  const parts = (text.includes("\u0001") && text.includes("\u0002") ? text : `${text} \u0001: \u0002`).split(/([\u0001\u0002])/);
  const copy = () => navigator.clipboard?.writeText(pw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  return (
    <div className="notice stack-sm" role="status">
      <p>{parts.map((s, i) => (s === "\u0001" ? <code key={i} dir="ltr">{login}</code> : s === "\u0002" ? <code key={i} dir="ltr">{pw}</code> : s))}</p>
      <div><Button size="sm" variant="secondary" onClick={() => { void copy(); }}>{copied ? t("adm.copied") : t("p.copyPw")}</Button></div>
    </div>
  );
}

export { COMPETENCIES };
