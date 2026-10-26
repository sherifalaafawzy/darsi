import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { AppBar, Button, EmptyState, Icon, TrackChip } from "@darsi/design-system";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { api, displayLogin } from "../auth/api";
import type { Profile, Role } from "../auth/types";
import { LANGUAGES, useI18n } from "../i18n";
import { COMPETENCIES, competency, strength } from "../content/competencies";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import type { Unit } from "../content/types";
import { useTracks } from "../content/settings";
import { daysSince, useMembers, usePerson, useProgress, useSubmissions, type Submission } from "./data";
import "../styles/person.css";

export function lastActiveText(iso: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) {
  const d = daysSince(iso);
  return d === Infinity ? t("adm.never") : d < 1 ? t("adm.today") : t("adm.daysAgo", { n: Math.floor(d) });
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
  const { t, L, num, lang } = useI18n();
  const tracks = useTracks();
  const dateFmt = new Intl.DateTimeFormat(LANGUAGES.find((l) => l.code === lang)?.numerals ?? lang, { dateStyle: "medium" });
  const { role: myRole, orgId } = useAuth();
  const { data: person, error } = usePerson(uid);
  const { data: progress = [] } = useProgress(uid);
  const { data: subs = [] } = useSubmissions(uid);
  const { data: members = [] } = useMembers(myRole === "orgAdmin" ? orgId : null);
  const { data: catalog } = useAsync(loadCatalog, []);
  const { data: units = [] } = useAsync(() => (catalog ? Promise.all(catalog.units.filter((u) => u.available).map((u) => loadUnit(u.id))) : Promise.resolve([] as Unit[])), [catalog]);
  const [msg, setMsg] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const isAdmin = myRole === "orgAdmin" || myRole === "superadmin";
  const lessonIndex = useMemo(() => Object.fromEntries(units.flatMap((u) => u.lessons.map((l) => [l.id, { unit: u, lesson: l }]))), [units]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; progress.forEach((p) => (p.competencies ?? lessonIndex[p.lessonId]?.lesson.competencies ?? []).forEach((x) => { c[x] = (c[x] ?? 0) + 1; })); return c; }, [progress, lessonIndex]);

  if (error) return <main className="screen"><EmptyState tone="error" title={t("err.title")} body={error.message} /></main>;
  if (!person) return <div className="loading" aria-busy="true" />;
  const teachers = members.filter((m) => m.role === "teacher");
  const act = async (fn: () => Promise<unknown>, done?: string) => { setMsg(""); try { await fn(); if (done) setMsg(done); } catch (e) { setMsg((e as Error).message); } };
  const update = (patch: Partial<Profile>) => act(() => updateDoc(doc(db, "users", uid), patch as Record<string, unknown>));

  return (
    <>
      <AppBar title={person.name} onBack={() => nav(back)} backLabel={t("common.back")} />
      <main className="screen wide person">
        <section className="person-head">
          <div className="avatar" aria-hidden>{person.name.slice(0, 1)}</div>
          <div>
            <h2 className="section-title">{person.name}</h2>
            <p className="muted" dir="ltr">{displayLogin(person.email)}</p>
            <p className="muted">{[t(`role.${person.role}` as "role.student"), person.group, `${t("col.last")}: ${lastActiveText(person.summary?.lastActive ?? (person as Profile & { lastActive?: string }).lastActive, t)}`].filter(Boolean).join(t("common.sep"))}</p>
          </div>
          <dl className="person-stats">
            <div><dt>{t("col.lessons")}</dt><dd>{num(progress.length)}</dd></div>
            <div><dt>{t("col.xp")}</dt><dd>{num(progress.reduce((a, p) => a + (p.xp || 0), 0))}</dd></div>
            <div><dt>{t("col.accuracy")}</dt><dd>{progress.length ? num(progress.reduce((a, p) => a + p.accuracy, 0) / progress.length, { style: "percent" }) : "—"}</dd></div>
            <div><dt>{t("p.projects")}</dt><dd>{num(subs.length)}</dd></div>
          </dl>
        </section>

        <div className="person-cols">
          <section className="panel"><h3>{t("p.capabilities")}</h3><CapabilityProfile counts={counts} /></section>

          <section className="panel"><h3>{t("p.courses")}</h3>
            {progress.length === 0 ? <p className="muted">{t("p.noCourses")}</p> : units.map((u) => {
              const done = u.lessons.filter((l) => progress.some((p) => p.lessonId === l.id));
              if (!done.length) return null;
              return (
                <div key={u.id} className="course">
                  <div className="course-head"><TrackChip track={u.track}>{tracks.name(u.track)}</TrackChip><strong>{L(u.title)}</strong>{done.length === u.lessons.length && <span className="badge-ok"><Icon name="award" size={16} />{t("p.unitDone")}</span>}</div>
                  <ul>{u.lessons.map((l) => { const p = progress.find((x) => x.lessonId === l.id); return (
                    <li key={l.id} className={p ? "done" : ""}><Icon name={p ? "check" : "lock"} size={16} /><span>{L(l.title)}</span>
                      {p && <span className="muted small">{[num(p.accuracy, { style: "percent" }), dateFmt.format(new Date(p.completedAt))].join(t("common.sep"))}</span>}</li>); })}</ul>
                </div>
              );
            })}
          </section>
        </div>

        <section className="panel"><h3>{t("p.projects")}</h3>
          {subs.length === 0 ? <p className="muted">{t("p.noProjects")}</p> : subs.map((s) => <SubmissionCard key={s.id} uid={uid} sub={s} lessonTitle={L(lessonIndex[s.lessonId]?.lesson.title)} />)}
        </section>

        {isAdmin && person.orgId && (
          <section className="panel"><h3>{t("p.actions")}</h3>
            <div className="form-grid">
              <label>{t("col.role")}
                <select value={role || person.role} onChange={(e) => setRole(e.target.value as Role)}>
                  {(["student", "teacher", "orgAdmin"] as Role[]).map((r) => <option key={r} value={r}>{t(`role.${r}` as "role.student")}</option>)}
                </select></label>
              <Button size="sm" variant="secondary" disabled={!role || role === person.role} onClick={() => act(() => api.setMemberRole({ orgId: person.orgId!, uid, role: role as Role }), t("common.saved"))}>{t("p.saveRole")}</Button>
              <label>{t("col.group")}<input defaultValue={person.group ?? ""} onBlur={(e) => e.target.value !== (person.group ?? "") && update({ group: e.target.value || null })} /></label>
              {person.role === "student" && <label>{t("col.teacher")}
                <select value={person.teacherId ?? ""} onChange={(e) => update({ teacherId: e.target.value || null })}>
                  <option value="">—</option>{teachers.map((tc) => <option key={tc.uid} value={tc.uid}>{tc.name}</option>)}
                </select></label>}
            </div>
            <div className="row-gap">
              <Button size="sm" variant="secondary" icon="sync" onClick={() => act(async () => { const r = await api.resetMemberPassword({ orgId: person.orgId!, uid }); setMsg(t("p.newPw", { login: displayLogin(r.login), pw: r.password })); })}>{t("p.resetPw")}</Button>
              <Button size="sm" variant="ghost" icon="close" onClick={() => confirm(t("p.removeConfirm")) && act(async () => { await api.removeMember({ orgId: person.orgId!, uid }); nav(back); })}>{t("p.remove")}</Button>
            </div>
            {msg && <p className="notice" role="status" dir="auto">{msg}</p>}
          </section>
        )}
      </main>
    </>
  );
}

function SubmissionCard({ uid, sub, lessonTitle }: { uid: string; sub: Submission; lessonTitle: string }) {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const [fb, setFb] = useState(sub.feedback ?? "");
  const canReview = role === "teacher" || role === "orgAdmin" || role === "superadmin";
  const review = (status: "approved" | "revise") => updateDoc(doc(db, "users", uid, "submissions", sub.id), { status, feedback: fb, reviewedBy: user?.uid, reviewedAt: serverTimestamp() });
  return (
    <article className={`submission is-${sub.status}`}>
      <header><strong>{lessonTitle}</strong><span className={`status status-${sub.status}`}>{t(`p.status.${sub.status}` as "p.status.submitted")}</span></header>
      <p dir="auto" className="sub-text">{sub.text}</p>
      {sub.fileUrl && <a href={sub.fileUrl} target="_blank" rel="noreferrer noopener"><Icon name="file" size={16} /> {sub.fileName ?? t("p.attachment")}</a>}
      {canReview ? (
        <div className="stack-sm">
          <label className="dr-field-label" htmlFor={`fb-${sub.id}`}>{t("p.feedback")}</label>
          <textarea id={`fb-${sub.id}`} className="dr-reflect-input" rows={2} dir="auto" value={fb} onChange={(e) => setFb(e.target.value)} />
          <div className="row-gap"><Button size="sm" icon="check" onClick={() => review("approved")}>{t("p.approve")}</Button><Button size="sm" variant="secondary" onClick={() => review("revise")}>{t("p.revise")}</Button></div>
        </div>
      ) : sub.feedback ? <p className="notice" dir="auto">{sub.feedback}</p> : null}
    </article>
  );
}

export { COMPETENCIES };
