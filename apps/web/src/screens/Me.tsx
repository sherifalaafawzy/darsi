import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, BrandMark, Button, CertificateCard, ChoiceCard, Icon, LanguagePicker, PlacementResult, Switch, TextField, TrackChip } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { displayLogin } from "../auth/api";
import { accountLinks } from "../components/Layout";
import { NotificationsPanel } from "../notify/NotificationsPanel";
import { isolate, useI18n, useLanguages } from "../i18n";
import { useStore } from "../state/store";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { STAGES, teachStage, type Unit } from "../content/types";
import { useSuperOn, useTracks } from "../content/settings";
import { certCode } from "../content/cert";
import { useMine } from "../content/mine";
import { share } from "../platform";
import { useInstall } from "../pwa";
import { openTour } from "../tour/Start";

export function Me() {
  const { t, L, locale } = useI18n();
  const languages = useLanguages();
  const { state, dispatch } = useStore();
  const set = (patch: Parameters<typeof dispatch>[0] & { type: "set" } extends { patch: infer P } ? P : never) => dispatch({ type: "set", patch });
  const { data: catalog } = useAsync(loadCatalog, []);
  const [units, setUnits] = useState<Unit[]>([]);
  const install = useInstall();
  useEffect(() => { if (catalog) Promise.all(catalog.units.filter((u) => u.available).map((u) => loadUnit(u.id))).then(setUnits).catch(() => {}); }, [catalog]);
  useEffect(() => { if (location.hash === "#certificates") document.getElementById("certificates")?.scrollIntoView(); }, [units]);
  const done = units.filter((u) => u.lessons.every((l) => state.progress[l.id]));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const tracks = useTracks();
  const nav = useNavigate();
  // The learner's own tracks, or every track on offer if they haven't chosen.
  const me = useMine();
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
        <TextField label={t("me.name")} hint={t("me.nameHint")} value={state.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
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
            {STAGES.map((st) => <ChoiceCard key={st} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={teachStage(state.teach) === st} onClick={() => set({ teach: st })} />)}
          </div>
        </section>}
        {me.audience === "students" && <section className="stack" aria-labelledby="stage-h"><h2 id="stage-h" className="section-title">{t("me.stage")}</h2>
          <div role="radiogroup" aria-labelledby="stage-h">
            {STAGES.map((st) => <ChoiceCard key={st} title={t(`stage.${st}`)} description={t(`stage.${st}D`)} selected={state.stage === st} onClick={() => set({ stage: st })} />)}
          </div>
        </section>}
        <PlacementResult title={t("me.levels")} levels={mine.map(({ id: tr, levels: of }) => ({ track: tr, trackLabel: tracks.name(tr), level: me.levelOf(tr), of, label: me.levelName(tr, me.levelOf(tr)) }))} />
        <section id="certificates" className="stack"><h2 className="section-title">{t("me.certs")}</h2>
          {done.length === 0 && <p className="muted">{t("me.noCerts")}</p>}
          {done.map((u) => {
            const last = u.lessons.map((l) => state.progress[l.id]?.completedAt).sort().pop()!;
            const code = certCode(u.id, state.name, last);
            return <CertificateCard key={u.id} track={u.track} kicker={t("cert.kicker")} trackLabel={tracks.name(u.track)} name={state.name || "—"} title={L(u.title)} date={dateFmt.format(new Date(last))} code={code}
              action={<Button size="sm" variant="secondary" icon="share" onClick={() => share({ title: `${t("cert.kicker")}: ${L(u.title)}`, text: `${state.name} — ${code}` })}>{t("kit.share")}</Button>} />;
          })}
        </section>
        <Button block variant="secondary" icon="info" onClick={openTour}>{t("tour.replay")}</Button>
        {install.canInstall && <Button block variant="secondary" icon="install" onClick={install.install}>{t("me.install")}</Button>}
        <Button block variant="ghost" onClick={() => { if (confirm(t("me.reset") + "?")) dispatch({ type: "reset" }); }}>{t("me.reset")}</Button>
        <p className="muted small center">Darsi{t("common.sep")}<span className="dr-other-script" lang="ar">درسي</span>{t("common.sep")}v0.1.0</p>
      </main>
    </>
  );
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
