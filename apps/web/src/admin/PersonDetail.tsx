import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { AppBar, Button, EmptyState, Icon, TrackChip, type Track } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin } from "../auth/api";
import { scoredOf, type Profile, type Role } from "../auth/types";
import { isolate, useI18n } from "../i18n";
import { COMPETENCIES, competency, strength } from "../content/competencies";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { GRADED, type CatalogEntry, type Unit } from "../content/types";
import { useTracks } from "../content/settings";
import { cleanGroup, daysSince, useCerts, useOrgStaff, usePerson, useProgress, useSubmissions, type ProgressDoc } from "./data";
import { projectStep, SubmissionCard } from "./SubmissionCard";
import { bestFramework, FrameworkPicker, PersonStandards } from "./Standards";
import { UserRolePanel } from "./OrgsAdmin";
import { message, Note, SuperGrantPanel, type Msg } from "./Super";
import { AccountActions } from "./AccountActions";
import { courseTitle, knownCourse } from "./courseTitles";
import { refusalText } from "./refusals";
import { useDuration } from "./charts";
import { framework, FRAMEWORKS } from "../content/standards";
import "../styles/person.css";
import "./strings";

/**
 * "today", "yesterday", "5 days ago". The days go to t() as a number, so it picks the plural form where the language
 * has one: «منذ يومين», «منذ ٥ أيام», «منذ ١١ يومًا» (adm.daysAgo.* in admin/strings, loaded with every admin screen).
 */
export function lastActiveText(iso: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) {
  const d = daysSince(iso);
  return d === Infinity ? t("adm.never") : d < 1 ? t("adm.today") : d < 2 ? t("adm.yesterday") : t("adm.daysAgo", { n: Math.floor(d) });
}

/** A course id as the editor makes them; a lesson's id starts with its course's id and a dash. */
const COURSE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
type Ref = { lessonId: string; unitId?: string | null };
const unitOf = (r: Ref, catalog: CatalogEntry[]) => r.unitId || catalog.find((u) => r.lessonId.startsWith(`${u.id}-`))?.id;
/**
 * The published courses a person has results or projects in: only these are downloaded for their page, not every
 * course (about 6 MB). Older results without a unitId are matched by their lesson id.
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

export function PersonDetail({ back = "/admin" }: { back?: string }) {
  const { uid = "" } = useParams();
  const nav = useNavigate();
  const { t, L, num, locale } = useI18n();
  const tracks = useTracks();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const { role: myRole, user } = useAuth();
  const personQ = usePerson(uid);
  const { data: person, error } = personQ;
  const progressQ = useProgress(uid);
  const subsQ = useSubmissions(uid);
  const progress = progressQ.data, subs = subsQ.data ?? [];
  // Projects still loading are "…", never "0" and "No projects submitted yet".
  const subsLoading = subsQ.loading && !subsQ.data;
  // Certificates as first earned (one read): a course unpublished since keeps its title and "done". Not readable, nothing.
  const certsQ = useCerts(uid);
  const certs = useMemo(() => new Map((certsQ.data ?? []).map((c) => [c.id, c])), [certsQ.data]);
  const isAdmin = myRole === "orgAdmin" || myRole === "superadmin";
  // Who can be this student's teacher: the teachers and admins of their organization (for org and platform admins).
  const staff = useOrgStaff(isAdmin && person?.role === "student" ? person.orgId : null);
  const { data: catalog } = useAsync(loadCatalog, []);
  // Only the courses this person has results or projects in, each on its own: one that fails doesn't blank the rest.
  const used = useMemo(() => (catalog && progress ? unitsUsed(catalog.units, [...progress, ...subs]) : []), [catalog, progress, subs]);
  const unitsQ = useAsync(async () => {
    const got = await Promise.allSettled(used.map((u) => loadUnit(u.id)));
    return { units: got.flatMap((g) => (g.status === "fulfilled" ? [g.value] : [])), failed: got.filter((g) => g.status === "rejected").length };
  }, [used.map((u) => u.id).join(",")]);
  const units: Unit[] = unitsQ.data?.units ?? [];
  const [msg, setMsg] = useState<Msg>(null);
  const [newPw, setNewPw] = useState<{ login: string; pw: string } | null>(null);
  const [role, setRole] = useState<Role | "">("");
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [fwId, setFwId] = useState<string | null>(null);
  const dur = useDuration();
  const lessonIndex = useMemo(() => Object.fromEntries(units.flatMap((u) => u.lessons.map((l) => [l.id, { unit: u, lesson: l }]))), [units]);
  const groups = useMemo(() => (catalog && progress ? courseGroups(catalog.units, progress) : null), [catalog, progress]);
  // The numbers, capabilities and standards come from the summary the server keeps (functions/src/summary.ts): it
  // counts only published lessons, with their competencies from the course itself. Lesson results are the phone's
  // word, so they only list which lessons were done, and only lessons the course really has.
  const shownFw = fwId ?? (person ? bestFramework(person, person.role === "student" ? "unesco-s" : "unesco-t") : "unesco-s");

  if ((error && !person) || person === null) {
    // The rules refuse a teacher someone else's student (an old link, a student moved to another teacher) and an admin
    // someone outside their organization; a deleted account reads as nothing. Say which, not the rules' own words.
    const gone = person === null, denied = !gone && (error as { code?: string }).code === "permission-denied" && myRole !== "superadmin";
    return (
      <main className="screen">
        <EmptyState tone={gone || denied ? "neutral" : "error"} icon={gone || denied ? "profile" : undefined}
          title={gone ? t("p.notFound") : denied ? t(myRole === "teacher" ? "p.notYours" : "p.notMember") : t("err.title")}
          body={gone || denied ? undefined : message(error)} action={<Button size="sm" variant="secondary" onClick={() => nav(back)}>{t("common.back")}</Button>} />
      </main>
    );
  }
  if (!person) return <div className="loading" aria-busy="true" />;
  const name = person.name || displayLogin(person.email ?? "") || "—";
  const sum = person.summary;
  const lessons = sum?.lessonsDone ?? 0;
  const seconds = sum?.seconds ?? (sum?.tracks ? Object.values(sum.tracks).reduce((a, x) => a + (x.sec || 0), 0) : null);
  // Your own page: no role change, password reset, removal or deletion (the server refuses them all; nothing here
  // offers them).
  const self = !!user && person.uid === user.uid;
  // A refusal in the admin's language (functions send a reason code; their English words are the fallback).
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setMsg(null);
    try { await fn(); if (done) setMsg({ ok: true, text: done }); personQ.reload(); } catch (e) { setMsg({ ok: false, text: refusalText(e, t) }); }
  };
  const update = (patch: Partial<Profile>) => act(() => updateDoc(doc(db, "users", uid), patch as Record<string, unknown>), t("common.saved"));
  // A refused role goes back to the saved one in the picker.
  const saveRole = () => act(() => api.setMemberRole({ orgId: person.orgId!, uid, role: role as Role }).catch((e) => { setRole(""); throw e; }), t("common.saved"));
  const remove = async () => {
    setMsg(null); setRemoving(true);
    try { await api.removeMember({ orgId: person.orgId!, uid }); nav(back, { state: { done: t("p.removed", { name: isolate(name) }) } }); }
    catch (e) { setAsking(false); setMsg({ ok: false, text: refusalText(e, t) }); } finally { setRemoving(false); }
  };
  const projectTitle = (lessonId: string, unitId?: string) => {
    const at = lessonIndex[lessonId];
    if (at) return L(at.lesson.title);
    // Its course's title, also for a course no longer published (courseTitles.json), else the lesson id.
    const id = unitId || (catalog ? unitOf({ lessonId }, catalog.units) : undefined);
    const c = id ? courseTitle(id, catalog?.units, L) : null;
    return c?.known ? c.text : lessonId;
  };
  const teacherKnown = (staff.data ?? []).some((s) => s.uid === person.teacherId);

  return (
    <>
      <AppBar title={name} onBack={() => nav(back)} backLabel={t("common.back")} />
      <main className="screen wide person">
        <section className="person-head">
          <div className="avatar" aria-hidden>{(person.name || "?").slice(0, 1)}</div>
          <div>
            <h2 className="section-title">{name}</h2>
            <p className="muted" dir="ltr">{displayLogin(person.email ?? "")}</p>
            <p className="muted">{[person.role && t(`rn.${person.role}` as "rn.student"), person.group, `${t("col.last")}: ${lastActiveText(person.summary?.lastActive ?? (person as Profile & { lastActive?: string }).lastActive, t)}`].filter(Boolean).join(t("common.sep"))}</p>
          </div>
          <dl className="person-stats">
            <div><dt>{t("col.lessons")}</dt><dd>{num(lessons)}</dd></div>
            <div><dt>{t("col.xp")}</dt><dd>{num(sum?.xp ?? 0)}</dd></div>
            {/* Accuracy over graded lessons only: a project lesson is done, not scored (scoredOf). */}
            <div><dt>{t("col.accuracy")}</dt><dd>{scoredOf(sum) ? num(sum!.avgAccuracy, { style: "percent" }) : "—"}</dd></div>
            <div><dt>{t("p.projects")}</dt><dd>{subsLoading ? "…" : num(subs.length)}</dd></div>
            <div><dt>{t("or.time")}</dt><dd>{seconds == null ? "—" : dur(seconds)}</dd></div>
          </dl>
        </section>

        <div className="person-cols">
          <section className="panel"><h3>{t("p.capabilities")}</h3><CapabilityProfile counts={sum?.competencies ?? {}} /></section>
          <section className="panel stack"><h3>{t("or.personStandards")}</h3>
            <FrameworkPicker value={shownFw} onChange={setFwId} />
            <PersonStandards person={person} fw={framework(shownFw) ?? FRAMEWORKS[0]} />
          </section>

          <section className="panel"><h3>{t("p.courses")}</h3>
            {!groups ? (progressQ.error ? <p className="notice err">{message(progressQ.error)}</p> : <p className="muted" aria-busy="true">{t("p.loadingCourses")}</p>) : groups.length === 0 ? <p className="muted">{t("p.noCourses")}</p> : <>
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
        </div>

        <section className="panel"><h3>{t("p.projects")}</h3>
          {subsLoading ? <p className="muted" aria-busy="true">{t("adm.loading")}</p> : subsQ.error && !subsQ.data ? <p className="notice err">{message(subsQ.error)}</p>
            : subs.length === 0 ? <p className="muted">{t("p.noProjects")}</p> : subs.map((s) => <SubmissionCard key={s.id} uid={uid} sub={s} lessonTitle={projectTitle(s.lessonId, s.unitId)} step={projectStep(lessonIndex[s.lessonId]?.lesson, s.stepId)} onReviewed={subsQ.reload} />)}
        </section>

        {/* Platform admins: any role, any organization (OrgsAdmin.tsx). */}
        {myRole === "superadmin" && <UserRolePanel person={person} onSaved={personQ.reload} />}
        {myRole === "superadmin" && <SuperGrantPanel person={person} onChanged={personQ.reload} />}

        {isAdmin && person.orgId && (
          <section className="panel"><h3>{t("p.actions")}</h3>
            <div className="form-grid">
              {/* Platform admins change roles in "Role and organization" above (setUserRole), not with a second picker. */}
              {myRole === "orgAdmin" && !self && <>
                <label>{t("col.role")}
                  <select value={role || person.role} onChange={(e) => setRole(e.target.value as Role)}>
                    {(["student", "teacher", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{t(`rn.${r}` as "rn.student")}</option>)}
                  </select></label>
                <Button size="sm" variant="secondary" disabled={!role || role === person.role} onClick={() => { void saveRole(); }}>{t("p.saveRole")}</Button>
              </>}
              <label>{t("col.group")}<input key={uid} defaultValue={person.group ?? ""} maxLength={60}
                onBlur={(e) => { const g = cleanGroup(e.target.value); e.target.value = g ?? ""; if (g !== (person.group ?? null)) void update({ group: g }); }} /></label>
              {person.role === "student" && <label>{t("col.teacher")}
                <select value={person.teacherId ?? ""} disabled={!staff.data} onChange={(e) => { void update({ teacherId: e.target.value || null }); }}>
                  <option value="">—</option>
                  {/* Their teacher while the list loads, or someone who no longer teaches here. */}
                  {person.teacherId && !teacherKnown && <option value={person.teacherId}>{staff.data ? t("p.formerTeacher") : "…"}</option>}
                  {(staff.data ?? []).map((tc) => <option key={tc.uid} value={tc.uid}>{tc.name || displayLogin(tc.email ?? "")}</option>)}
                </select></label>}
            </div>
            {self ? <p className="muted small">{t("p.self")}</p> : <div className="row-gap">
              {/* Only logins the organization made (usernames); people with their own email or Google reset it themselves (M4). */}
              {person.email?.endsWith("@users.darsi.app") ? <Button size="sm" variant="secondary" icon="sync" onClick={() => act(async () => { setNewPw(null); const r = await api.resetMemberPassword({ orgId: person.orgId!, uid }); setNewPw({ login: displayLogin(r.login), pw: r.password }); })}>{t("p.resetPw")}</Button>
                : <p className="muted small">{t("acct.ownLogin")}</p>}
              {!asking && <Button size="sm" variant="ghost" icon="close" onClick={() => { setMsg(null); setAsking(true); }}>{t("p.remove")}</Button>}
            </div>}
            {/* Removing signs them out everywhere and clears their class and teacher: asked here, as the app asks elsewhere (no browser dialog). */}
            {asking && !self && (
              <div className="notice err stack-sm" role="alert">
                <span>{t("p.removeAsk", { name: isolate(name) })}</span>
                <div className="row-gap">
                  <Button size="sm" icon="close" autoFocus loading={removing} onClick={() => { void remove(); }}>{t("p.removeYes")}</Button>
                  <Button size="sm" variant="ghost" disabled={removing} onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
                </div>
              </div>
            )}
            {newPw && <NewPassword login={newPw.login} pw={newPw.pw} />}
            <Note msg={msg} />
          </section>
        )}
        {/* Data requests and abuse: their data, deleting the account, suspending it (AccountActions.tsx decides who sees it). */}
        <AccountActions person={person} onDeleted={() => nav(back, { state: { done: t("acc.deleted", { name: isolate(name) }) } })} onChanged={personQ.reload} />
      </main>
    </>
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
