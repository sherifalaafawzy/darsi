import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, BrandMark, Button, CertificateCard, ChoiceCard, Icon, LanguagePicker, PlacementResult, Switch, TextField, TrackChip } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { displayLogin } from "../auth/api";
import { accountLinks } from "../components/Layout";
import { NotificationsPanel } from "../notify/NotificationsPanel";
import { isolate, useI18n, useLanguages } from "../i18n";
import { useStore } from "../state/store";
import { readMyWork, type MySubmission } from "../state/myWork";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { teachStage, type CatalogEntry, type Unit } from "../content/types";
import { useSuperOn, useTracks } from "../content/settings";
import { capstoneMilestones, certCandidates, codeOf, earnedCert, milestonesSent, type EarnedCert } from "../content/cert";
import { useMine, useStagesOffered } from "../content/mine";
import { share } from "../platform";
import { useInstall } from "../pwa";
import { openTour } from "../tour/Start";
import { clearRuns } from "../lesson/engine";
import { MyProjects } from "./MyProjects";
import { MyData } from "../account/MyData";

export function Me() {
  const { t, L, locale } = useI18n();
  const languages = useLanguages();
  const { state, dispatch } = useStore();
  // offlineUid: signed in, but the phone was offline at start, so nothing can be read yet; not a guest.
  const { user, offlineUid } = useAuth();
  const set =(patch: Parameters<typeof dispatch>[0] & { type: "set" } extends { patch: infer P } ? P : never) => dispatch({ type: "set", patch });
  const { data: catalog } = useAsync(loadCatalog, []);
  const install = useInstall();
  const editName = useAccountName();
  // Certificates come from the record kept when each was earned; working out new ones opens only the courses whose
  // lessons are all finished, so opening Me downloads next to nothing.
  const waiting = useNewCertificates(catalog?.units, user?.uid);
  const certs = Object.entries(state.certs ?? {}).sort(([, a], [, b]) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  useEffect(() => { if (location.hash === "#certificates") document.getElementById("certificates")?.scrollIntoView(); }, [certs.length, waiting.length]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const tracks = useTracks();
  const nav = useNavigate();
  // The learner's own tracks, or every track on offer if they haven't chosen.
  const me = useMine();
  // Only stages that have courses (a stage whose courses are all unpublished disappears).
  const teachStages = useStagesOffered("teachers"), studyStages = useStagesOffered("students");
  const mine = me.tracks;
  return (
    <>
      <AppBar title={t("me.title")} />
      <main className="screen narrow stack-lg">
        <Account />
        <SuperCard />
        <section className="stack"><h2 className="section-title">{t("me.language")}</h2>
          <LanguagePicker label={t("me.language")} value={state.lang} onChange={(l) => set({ lang: l })} languages={languages} /></section>
        <section>
          <Switch label={t("me.sunlight")} description={t("me.sunlightD")} checked={state.theme === "sunlight"} onChange={(on) => set({ theme: on ? "sunlight" : "light" })} />
          <Switch label={t("me.dataSaver")} description={t("me.dataSaverD")} checked={state.dataSaver} onChange={(on) => set({ dataSaver: on })} />
          <Switch label={t("me.analytics")} description={t("me.analyticsD")} checked={state.analytics !== false} onChange={(on) => set({ analytics: on })} />
        </section>
        <NotificationsPanel />
        <TextField label={t("me.name")} hint={t(user ? "me.nameHintAccount" : "me.nameHint")} value={state.name} onChange={(e) => editName(e.target.value)} autoComplete="name" maxLength={120} />
        <section className="stack" aria-labelledby="tracks-h"><h2 id="tracks-h" className="section-title">{t("tracks.title")}</h2>
          <div className="row-gap">{mine.map((x) => <TrackChip key={x.id} track={x.id}>{tracks.name(x.id)}</TrackChip>)}</div>
          <div><Button size="sm" variant="secondary" icon="settings" onClick={() => nav("/tracks")}>{t("tracks.manage")}</Button></div>
        </section>
        {/* School accounts are a teacher or a student already; everyone else can change what they said in onboarding. */}
        {!me.fixed && <section className="stack" aria-labelledby="iam-h"><h2 id="iam-h" className="section-title">{t("me.iAm")}</h2>
          <ChoiceCard icon="profile" title={t("me.teacher")} selected={me.audience === "teachers"} onClick={() => set({ audience: "teachers" })} />
          <ChoiceCard icon="book" title={t("me.student")} selected={me.audience === "students"} onClick={() => set({ audience: "students" })} />
        </section>}
        {me.audience === "teachers" && <section className="stack" aria-labelledby="teach-h"><h2 id="teach-h" className="section-title">{t("me.teach")}</h2>
          <div role="radiogroup" aria-labelledby="teach-h">
            {teachStages.map((st) => <ChoiceCard key={st} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={teachStage(state.teach) === st} onClick={() => set({ teach: st })} />)}
          </div>
        </section>}
        {me.audience === "students" && <section className="stack" aria-labelledby="stage-h"><h2 id="stage-h" className="section-title">{t("me.stage")}</h2>
          <div role="radiogroup" aria-labelledby="stage-h">
            {studyStages.map((st) => <ChoiceCard key={st} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={state.stage === st} onClick={() => set({ stage: st })} />)}
          </div>
        </section>}
        <PlacementResult title={t("me.levels")} levels={mine.map(({ id: tr, levels: of }) => ({ track: tr, trackLabel: tracks.name(tr), level: me.levelOf(tr), of, label: me.levelName(tr, me.levelOf(tr)) }))} />
        {/* What became of the projects they sent: status and the reviewer's feedback (signed in; guests can't send). */}
        {user && <MyProjects uid={user.uid} units={catalog?.units} />}
        <section id="certificates" className="stack"><h2 className="section-title">{t("me.certs")}</h2>
          {certs.length === 0 && <p className="muted">{t("me.noCerts")}</p>}
          {certs.map(([id, c]) => {
            const code = codeOf(id, c, user?.uid); // set when earned: renaming never changes it (content/cert.ts)
            return <CertificateCard key={id} track={c.track} kicker={t("cert.kicker")} trackLabel={tracks.name(c.track)} name={state.name || "—"} title={L(c.title)} date={dateFmt.format(new Date(c.at))} code={code}
              action={<Button size="sm" variant="secondary" icon="share" onClick={() => share({ title: `${t("cert.kicker")}: ${L(c.title)}`, text: `${state.name} — ${code}` })}>{t("kit.share")}</Button>} />;
          })}
          {/* A capstone is finished when its milestones are sent, not when its lessons are ("submit later" sends nothing). */}
          {waiting.map((w) => (
            <div key={w.unit.id} className="notice stack-sm">
              <strong>{L(w.unit.title)}</strong>
              <div>{t("cert.capPending")}</div>
              {!user && !offlineUid ? <div className="muted small">{t("project.guest")}</div> : w.sent !== null && <div className="muted small">{t("cert.capSent", { n: w.sent, m: w.of })}</div>}
              {user && w.next && <div><Button size="sm" variant="secondary" iconEnd="next" onClick={() => nav(`/lesson/${w.unit.id}/${w.next!.lessonId}?step=${encodeURIComponent(w.next!.stepId)}`)}>{t("cert.capSend")}</Button></div>}
            </div>
          ))}
        </section>
        <Button block variant="secondary" icon="info" onClick={openTour}>{t("tour.replay")}</Button>
        {install.canInstall && <Button block variant="secondary" icon="install" onClick={install.install}>{t("me.install")}</Button>}
        <Button block variant="ghost" onClick={() => { if (confirm(t("me.resetAsk"))) { clearRuns(); dispatch({ type: "reset" }); } }}>{t("me.reset")}</Button>
        {/* Signed in: your data as a file, and deleting your account (account/MyData.tsx). */}
        <MyData />
        <Button block variant="ghost" onClick={() => nav("/licences")}>{t("me.licences")}</Button>
        <p className="muted small center">Darsi{t("common.sep")}<span className="dr-other-script" lang="ar">درسي</span>{t("common.sep")}v0.1.0</p>
      </main>
    </>
  );
}

/**
 * Per account, this session: the profile's name as last seen (AuthProvider reads the profile once per sign-in and doesn't
 * see this screen's saves), and the account's name as this phone last knew it (that, or the name saved here since).
 * Without it, opening Me again put the profile's older name back over the one just typed and saved.
 */
const accountName = new Map<string, { seen?: string; name: string }>();

/**
 * The name on certificates. Signed in, it is the account's name (users/{uid}.name), which every device and the platform's
 * certificate page use too: typing here saves it there once typing stops (or Me closes), and a name changed elsewhere
 * (another phone, an org admin) replaces this phone's copy when Me first opens after the app starts. Guests keep it on
 * the phone only.
 */
function useAccountName() {
  const { user, profile, updateProfile } = useAuth();
  const { state, dispatch } = useStore();
  const pending = useRef<string | null>(null);
  const flush = useCallback(() => {
    const name = pending.current;
    pending.current = null;
    if (name === null || !user) return;
    // Saved before the profile arrived (seen unset): the profile read may be older than this save.
    accountName.set(user.uid, { seen: accountName.get(user.uid)?.seen ?? profile?.name, name });
    updateProfile({ name }).catch(() => {});
  }, [updateProfile, user, profile?.name]);
  useEffect(() => {
    if (!user || !profile?.name || pending.current !== null) return;
    const known = accountName.get(user.uid);
    const take = (name: string) => { if (name !== state.name) dispatch({ type: "set", patch: { name } }); };
    if (!known || (known.seen !== undefined && known.seen !== profile.name)) {
      // A profile name not seen before this session (the first look, or changed elsewhere) is the account's: take it.
      accountName.set(user.uid, { seen: profile.name, name: profile.name });
      take(profile.name);
    } else {
      // Otherwise keep what is on the phone (typed and saved here since), unless it was emptied: then the account's.
      if (known.seen === undefined) accountName.set(user.uid, { seen: profile.name, name: known.name });
      if (!state.name.trim()) take(known.name);
    }
  }, [user, profile?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pending.current === null) return;
    const id = setTimeout(flush, 800);
    return () => clearTimeout(id);
  }, [state.name, flush]);
  useEffect(() => () => flush(), [flush]);
  return (name: string) => {
    dispatch({ type: "set", patch: { name } });
    // An empty name isn't saved: the account keeps the one it has.
    pending.current = user && name.trim() ? name.slice(0, 120) : null;
  };
}

/** A capstone whose lessons are all finished but whose milestones aren't all sent: no certificate yet. */
interface Waiting { unit: Unit; sent: number | null; of: number; next: { lessonId: string; stepId: string } | null }

/**
 * Records the certificates earned since Me last looked (AppState.certs), and returns the capstones still waiting for
 * milestones. It downloads next to nothing: only courses whose lessons the results say are all finished are opened
 * (cache-first, and usually already on the phone), one failing doesn't stop the others, and a capstone's milestones are
 * one small read of the learner's own projects, signed in. Guests can't send, so they earn no capstone certificate.
 */
function useNewCertificates(units: CatalogEntry[] | undefined, uid: string | undefined): Waiting[] {
  const { state, dispatch } = useStore();
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const todo = useMemo(() => (units ? certCandidates(units, state.progress).filter((u) => !state.certs?.[u.id]) : []), [units, state.progress, state.certs]);
  const key = todo.map((u) => u.id).join(",");
  useEffect(() => {
    if (!todo.length) { setWaiting((w) => (w.length ? [] : w)); return; }
    let live = true;
    const progress = state.progress;
    (async () => {
      const earned: [string, EarnedCert][] = [];
      const left: Waiting[] = [];
      await Promise.all(todo.map(async (entry) => {
        const unit = await loadUnit(entry.id).catch(() => null);
        if (!unit) return;
        const cap = unit.kind === "capstone";
        let sent: MySubmission[] | null | undefined = cap ? undefined : [];
        if (cap && uid) sent = (await readMyWork(uid, { unitId: unit.id }, true).catch(() => null))?.list ?? null;
        const cert = earnedCert(unit, progress, sent ?? undefined);
        if (cert) earned.push([unit.id, cert]);
        else if (cap && unit.lessons.every((l) => progress[l.id])) {
          // Which milestone to send next, once the read says which were sent (offline, the first may have been already).
          const have = new Set((sent ?? []).map((s) => `${s.lessonId}/${s.stepId}`));
          const next = sent ? capstoneMilestones(unit).find((m) => !have.has(`${m.lessonId}/${m.stepId}`)) ?? null : null;
          const m = milestonesSent(unit, sent ?? []);
          left.push({ unit, sent: sent ? m.sent : null, of: m.of, next });
        }
      }));
      if (!live) return;
      for (const [id, cert] of earned) dispatch({ type: "earnCert", id, cert });
      setWaiting(left);
    })();
    return () => { live = false; };
    // `todo` is described by `key`; the results are read when the work starts.
  }, [key, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return waiting;
}

/**
 * Who is signed in, their organization and staff areas (on phones these links live here, not in the bottom nav),
 * and sign out. Guests get sign in / create account; signing out returns to the device's guest copy.
 */
function Account() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user, profile, role, configured, signOut, offlineUid } = useAuth();
  const org = useStore().state.org;
  if (!configured) return null;
  if (!user && offlineUid) return (
    <section className="panel stack" aria-labelledby="acct-h">
      <h2 id="acct-h" className="section-title">{t("me.account")}</h2>
      <p className="muted">{t("me.offlineAccount")}</p>
    </section>
  );
  if (!user) return (
    <section className="panel stack" aria-labelledby="acct-h">
      <h2 id="acct-h" className="section-title">{t("me.account")}</h2>
      <p className="muted">{t("guest.note")}</p>
      <div className="row-gap">
        <Button icon="profile" onClick={() => nav("/signup")}>{t("auth.noAccount")}</Button>
        <Button variant="secondary" onClick={() => nav("/signin")}>{t("auth.signIn")}</Button>
      </div>
    </section>
  );
  const name = profile?.name || user.displayName || "";
  return (
    <section className="panel stack" aria-labelledby="acct-h">
      <h2 id="acct-h" className="section-title">{t("me.account")}</h2>
      <div className="person-link">
        <span className="avatar" aria-hidden>{name.slice(0, 1) || <Icon name="profile" size={20} />}</span>
        <span><strong>{t("me.signedInAs", { name: isolate(name || displayLogin(user.email ?? "")) })}</strong>
          <small dir="ltr">{displayLogin(user.email ?? "")}</small></span>
        <span className="pill">{t(`role.${role}` as "role.student")}</span>
      </div>
      {org && <div className="person-link"><BrandMark size={36} /><span><strong><bdi>{org.name}</bdi></strong><small>{t("org.yourOrg")}</small></span></div>}
      <div className="row-gap">
        {accountLinks(role, true).map((l) => <Button key={l.path} variant="secondary" icon={l.icon} onClick={() => nav(l.path)}>{t(l.key)}</Button>)}
        {/* University teachers: the courses a platform admin let them follow (read only). */}
        {profile?.teach === "university" && <Button variant="secondary" icon="chart" onClick={() => nav("/results")}>{t("results.title")}</Button>}
        {role === "superadmin" && <Button variant="secondary" icon="chart" onClick={() => nav("/super/access")}>{t("access.title")}</Button>}
        {/* signOut first stops this phone getting the account's notifications (AuthProvider), as every Sign out button does. */}
        <Button variant="ghost" icon="close" onClick={() => { void signOut(); }}>{t("me.signOut")}</Button>
      </div>
    </section>
  );
}

/** Darsi Super: what you have, or a way to see it (/upgrade, a lazy chunk). */
function SuperCard() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { plan } = useAuth();
  const superOn = useSuperOn().on;
  const active = plan && plan.until > Date.now() ? plan : null;
  if (!superOn) return null; // a platform admin turned Super off for everyone
  return (
    <section className="panel stack" aria-labelledby="super-h">
      <h2 id="super-h" className="section-title">{t("me.super")}</h2>
      {active && <p>{t("me.superTutor")}</p>}
      <p className="muted">{active ? t("me.superUntil", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(active.until) }) : t("me.superPitch")}</p>
      <div><Button variant="secondary" icon="award" onClick={() => nav("/upgrade?from=me")}>{active ? t("me.superSee") : t("me.superCta")}</Button></div>
    </section>
  );
}
