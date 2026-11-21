import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, BrandMark, Button, CertificateCard, ChoiceCard, Icon, LanguagePicker, PlacementResult, Switch, TextField, TrackChip } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { displayLogin, USERNAME_DOMAINS } from "../auth/api";
import { accountLinks } from "../components/Layout";
import { NotificationsPanel } from "../notify/NotificationsPanel";
import { isolate, useI18n, useLanguages } from "../i18n";
import { useStore } from "../state/store";
import { readMyWork, type MySubmission } from "../state/myWork";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { teachStage, type CatalogEntry, type Unit } from "../content/types";
import { useSsoOn, useSuperOn, useTracks } from "../content/settings";
import { capstoneMilestones, certCandidates, codeOf, earnedCert, milestonesSent, type EarnedCert } from "../content/cert";
import { useMine, useStagesOffered } from "../content/mine";
import { share } from "../platform";
import { useInstall } from "../pwa";
import { openTour } from "../tour/Start";
import { clearRuns } from "../lesson/engine";
import { MyProjects } from "./MyProjects";
import { MyData } from "../account/MyData";
import { isManaged } from "../account/files";
import { flushSync } from "../state/sync";
import { call } from "../fb";
import { LeftOrgNote, leftOrg } from "../auth/LeftOrg";
import { loadSchoolLink, returnedTo } from "../auth/sso";
import { useLegal } from "../legal/published";
import { k, type LegalKey } from "../legal/strings";

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
        <LegalLinks />
        <Button block variant="ghost" onClick={() => nav("/licences")}>{t("me.licences")}</Button>
        <p className="muted small center">Darsi{t("common.sep")}<span className="dr-other-script" lang="ar">درسي</span>{t("common.sep")}v0.1.0</p>
      </main>
    </>
  );
}

/**
 * The privacy notice and the terms of use, each once a platform admin has published it (legal/published.ts: one small
 * public file, read when Me first opens). Its own component, so only these buttons draw again when the file answers.
 */
function LegalLinks() {
  const { t } = useI18n();
  const nav = useNavigate();
  const legal = useLegal();
  return (
    <>
      {legal.privacy !== null && <Button block variant="ghost" onClick={() => nav("/privacy")}>{t(k("legal.privacy"))}</Button>}
      {legal.terms !== null && <Button block variant="ghost" onClick={() => nav("/terms")}>{t(k("legal.terms"))}</Button>}
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
  const { user, profile, role, orgId, configured, signOut, offlineUid } = useAuth();
  const org = useStore().state.org;
  const ssoOn = useSsoOn().on;
  // A return from connecting the school's sign-in waits for the row (auth/sso.ts). Noted once: the row takes it as it
  // mounts, and must stay to say how it went.
  const [returning] = useState(() => returnedTo("/me"));
  // Said here when the session outlives leaving; when it doesn't, the app restarts and LeftOrgNote says it.
  const [left, setLeft] = useState<{ org: string; out: boolean } | null>(null);
  // Signed in (again): the note for someone signed out by leaving has done its job.
  const uid = user?.uid;
  useEffect(() => { if (uid) leftOrg.clear(); }, [uid]);
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
      <LeftOrgNote />
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
          {/* An account the school's sign-in made has no email: the address its school vouched for. */}
          <small dir="ltr">{user.email ? displayLogin(user.email) : profile?.ssoEmail ?? ""}</small></span>
        <span className="pill">{t(`role.${role}` as "role.student")}</span>
      </div>
      {org && <div className="person-link"><BrandMark size={36} /><span><strong><bdi>{org.name}</bdi></strong><small>{t("org.yourOrg")}</small></span></div>}
      {/* Members of an organization: its school sign-in. The row is a lazy chunk that reads the organization again, so
          it is mounted only when there is something for it to show: the organization has school sign-in (state.org.sso,
          from the one read at app start), the school's sign-in made this account (it needs an email login whatever the
          switches say), the account is connected (Disconnect), or a return from connecting waits for it. */}
      {orgId && role !== "superadmin" && ((ssoOn && org?.id === orgId && org.sso === true) || profile?.sso === true || typeof profile?.ssoLinkedAt === "number" || returning)
        && <SchoolRow key={user.uid} />}
      <div className="row-gap">
        {accountLinks(role, true).map((l) => <Button key={l.path} variant="secondary" icon={l.icon} onClick={() => nav(l.path)}>{t(l.key)}</Button>)}
        {/* University teachers: the courses a platform admin let them follow (read only). */}
        {profile?.teach === "university" && <Button variant="secondary" icon="chart" onClick={() => nav("/results")}>{t("results.title")}</Button>}
        {role === "superadmin" && <Button variant="secondary" icon="chart" onClick={() => nav("/super/access")}>{t("access.title")}</Button>}
        {/* signOut first stops this phone getting the account's notifications (AuthProvider), as every Sign out button does. */}
        <Button variant="ghost" icon="close" onClick={() => { void signOut(); }}>{t("me.signOut")}</Button>
      </div>
      {left && <p className="notice ok" role="status">{t(k(left.out ? "leave.signIn" : "leave.done"), { org: left.org })}</p>}
      {/* A platform admin belongs to no organization as a member. A login the organization manages (it made it) is its
          admin's to remove, as the server says (leaveOrg "managed"): said here instead of a button that can only fail. */}
      {orgId && role !== "superadmin" && !left && (isManaged(profile, user.email, orgId, USERNAME_DOMAINS)
        ? <p className="muted small">{t(k("leave.managedNote"))}</p>
        : <LeaveOrg uid={user.uid} name={org?.id === orgId ? org.name : ""} onLeft={(said, out) => setLeft({ org: said, out })} />)}
    </section>
  );
}

/**
 * "School sign-in" (auth/SchoolLink.tsx): connect it, see it, disconnect it, or add an email login to an account the
 * school made. A lazy chunk, so learners outside an organization never download it; one that can't load (offline)
 * leaves the row out, never the page.
 */
export function SchoolRow() {
  const { t } = useI18n();
  const [Row, setRow] = useState<typeof import("../auth/SchoolLink").SchoolLink | null>(null);
  // The chunk couldn't load (offline) while a return from linking waits for it (auth/sso.ts holds it until the row
  // takes it): said, with Retry, so the link isn't dropped without a word. Without a return the row is just absent.
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    // Registered by App (auth/sso.ts setSchoolChunks): an import() made in Me's lazy chunk splits the startup file.
    loadSchoolLink().then((m) => { if (live) setRow(() => m.SchoolLink); }, () => { if (live && returnedTo("/me")) setFailed(true); });
    return () => { live = false; };
  }, [tries]);
  return Row ? <Row /> : failed ? (
    <div className="stack-sm">
      <p className="notice err" role="alert">{t("auth.errNetwork")}</p>
      <div><Button size="sm" variant="secondary" icon="sync" onClick={() => { setFailed(false); setTries((n) => n + 1); }}>{t("common.retry")}</Button></div>
    </div>
  ) : null;
}

/** Why leaveOrg refused (functions/src/orgMembers.ts, the error's details.reason), in the person's language. */
const LEAVE_REFUSED: Record<string, LegalKey> = { managed: "leave.managed", "last-admin": "leave.lastAdmin", "not-in-org": "leave.notInOrg", disabled: "leave.disabled" };

/**
 * "Leave <organization>": a member who signed up themself becomes an independent learner again (the leaveOrg callable).
 * The button opens what leaving means, in place, with Leave and Cancel: no browser dialog. An account the organization
 * manages never gets the button (Account says why); its only admin and a suspended account are refused by the server,
 * each with its own explanation.
 * `name`: the organization's, "" while this phone doesn't know it. `onLeft(said, out)`: it worked; `out` when the
 * session ended with the membership (the server ends it: the app restarts signed out a moment later).
 * Leaving ends the session, so the work on this phone goes to the cloud first (flushSync, a few seconds at most). If
 * some still hasn't (offline), the person is told it stays on this phone and is sent at their next sign-in here (the
 * ended session keeps it: AuthProvider sessionEnded), and Leave becomes "Leave anyway": "Your learning stays with you"
 * stays true either way.
 */
function LeaveOrg({ uid, name, onLeft }: { uid: string; name: string; onLeft: (said: string, out: boolean) => void }) {
  const { t } = useI18n();
  const { refreshClaims } = useAuth();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  // The flush found work it couldn't send: said, and the next tap ("Leave anyway") leaves even if it still can't.
  const [unsentHere, setUnsentHere] = useState(false);
  const said = name ? isolate(name) : t(k("leave.yourOrg"));
  const ask = useRef<HTMLDivElement>(null), cta = useRef<HTMLDivElement>(null), wasOpen = useRef(false);
  // The question takes the focus when it opens, so a screen reader reads it and the keyboard is at its buttons;
  // Cancel hands it back to the button that opened it (the one it was on is gone, and the page's top is far away).
  useEffect(() => {
    if (open) ask.current?.focus(); else if (wasOpen.current) cta.current?.querySelector("button")?.focus();
    wasOpen.current = open;
  }, [open]);
  const leave = async () => {
    setBusy(true); setErr("");
    // Each tap tries to send first (a connection that came back sends it now); only the first unsent answer stops here.
    if (!(await flushSync(uid)) && !unsentHere) { setUnsentHere(true); setBusy(false); return; }
    // The note for after the restart, before the call: the server ends the session as it answers, and the profile's
    // listener (AuthProvider) can start the restart before the answer is read here. A refusal takes it back.
    leftOrg.set(name);
    try { await call<Record<string, never>, { ok: boolean }>("leaveOrg")({}); }
    catch (e) {
      leftOrg.clear();
      const reason = String((e as { details?: { reason?: unknown } } | null)?.details?.reason ?? "");
      setErr(t(k(LEAVE_REFUSED[reason] ?? "leave.failed")));
      setBusy(false);
      if (reason === "not-in-org") void refreshClaims().catch(() => {}); // this phone's claims are behind: catch up
      return;
    }
    // The new claims. Leaving ends the account's sessions (functions/src/billing.ts writeClaims), so this read is
    // usually refused and the app restarts signed out, where LeftOrgNote says what happened. If the session lives, it
    // is said here and the note isn't needed; a read that merely failed (the connection) keeps the note, just in case.
    const failed = await refreshClaims().then(() => null, (e: unknown) => String((e as { code?: string } | null)?.code ?? e));
    if (failed === null) leftOrg.clear();
    onLeft(said, failed !== null && /token-expired|invalid-user-token|user-disabled|user-not-found/.test(failed));
  };
  if (!open) return <div ref={cta}><Button variant="ghost" onClick={() => setOpen(true)}>{t(k("leave.cta"), { org: said })}</Button></div>;
  return (
    <div ref={ask} tabIndex={-1} role="group" aria-labelledby="leave-h" className="notice stack">
      <strong id="leave-h">{t(k("leave.ask"), { org: said })}</strong>
      <div className="stack-sm">
        <span>{t(k("leave.keep"))}</span>
        <span>{t(k("leave.unseen"))}</span>
        <span>{t(k("leave.courses"))}</span>
        <span>{t(k("leave.again"))}</span>
      </div>
      {unsentHere && <p className="notice" role="alert">{t(k("leave.unsent"))}</p>}
      {err && <p className="notice err" role="alert">{err}</p>}
      <div className="row-gap">
        <Button loading={busy} onClick={() => { void leave(); }}>{t(k(unsentHere ? "leave.anyway" : "leave.confirm"))}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setOpen(false); setErr(""); setUnsentHere(false); }}>{t("common.cancel")}</Button>
      </div>
    </div>
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
