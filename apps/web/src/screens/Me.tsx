import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, CertificateCard, Icon, LanguagePicker, PlacementResult, Switch, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { displayLogin } from "../auth/api";
import { accountLinks } from "../components/Layout";
import { NotificationsPanel } from "../notify/NotificationsPanel";
import { isolate, LANGUAGES, useI18n } from "../i18n";
import { useStore } from "../state/store";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import type { Track, Unit } from "../content/types";
import { share } from "../platform";
import { useInstall } from "../pwa";

export function Me() {
  const { t, L, lang } = useI18n();
  const { state, dispatch } = useStore();
  const set = (patch: Parameters<typeof dispatch>[0] & { type: "set" } extends { patch: infer P } ? P : never) => dispatch({ type: "set", patch });
  const { data: catalog } = useAsync(loadCatalog, []);
  const [units, setUnits] = useState<Unit[]>([]);
  const install = useInstall();
  useEffect(() => { if (catalog) Promise.all(catalog.units.filter((u) => u.available).map((u) => loadUnit(u.id))).then(setUnits).catch(() => {}); }, [catalog]);
  useEffect(() => { if (location.hash === "#certificates") document.getElementById("certificates")?.scrollIntoView(); }, [units]);
  const done = units.filter((u) => u.lessons.every((l) => state.progress[l.id]));
  const dateFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium" });
  const tracks: Track[] = ["ai", "iot", "cyber"];
  return (
    <>
      <AppBar title={t("me.title")} />
      <main className="screen narrow stack-lg">
        <Account />
        <section className="stack"><h2 className="section-title">{t("me.language")}</h2>
          <LanguagePicker label={t("me.language")} value={state.lang} onChange={(l) => set({ lang: l })} languages={LANGUAGES} /></section>
        <section>
          <Switch label={t("me.sunlight")} description={t("me.sunlightD")} checked={state.theme === "sunlight"} onChange={(on) => set({ theme: on ? "sunlight" : "light" })} />
          <Switch label={t("me.dataSaver")} description={t("me.dataSaverD")} checked={state.dataSaver} onChange={(on) => set({ dataSaver: on })} />
        </section>
        <NotificationsPanel />
        <TextField label={t("me.name")} hint={t("me.nameHint")} value={state.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
        <PlacementResult title={t("me.levels")} levels={tracks.map((tr) => ({ track: tr, trackLabel: t(`track.${tr}`), level: state.levels[tr] ?? 1, of: 4, label: t("place.level", { n: state.levels[tr] ?? 1 }) }))} />
        <section id="certificates" className="stack"><h2 className="section-title">{t("me.certs")}</h2>
          {done.length === 0 && <p className="muted">{t("me.noCerts")}</p>}
          {done.map((u) => {
            const last = u.lessons.map((l) => state.progress[l.id]?.completedAt).sort().pop()!;
            const code = `DRS-${u.id.toUpperCase()}-${(state.name || "T").length.toString(36).toUpperCase()}${new Date(last).getTime().toString(36).slice(-4).toUpperCase()}`;
            return <CertificateCard key={u.id} track={u.track} kicker={t("cert.kicker")} trackLabel={t(`track.${u.track}`)} name={state.name || "—"} title={L(u.title)} date={dateFmt.format(new Date(last))} code={code}
              action={<Button size="sm" variant="secondary" icon="share" onClick={() => share({ title: `${t("cert.kicker")}: ${L(u.title)}`, text: `${state.name} — ${code}` })}>{t("kit.share")}</Button>} />;
          })}
        </section>
        {install.canInstall && <Button block variant="secondary" icon="install" onClick={install.install}>{t("me.install")}</Button>}
        <Button block variant="ghost" onClick={() => { if (confirm(t("me.reset") + "?")) dispatch({ type: "reset" }); }}>{t("me.reset")}</Button>
        <p className="muted small center">{["Darsi", "درسي", "v0.1.0"].join(t("common.sep"))}</p>
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
      <div className="row-gap">
        {accountLinks(role, true).map((l) => <Button key={l.path} variant="secondary" icon={l.icon} onClick={() => nav(l.path)}>{t(l.key)}</Button>)}
        {/* signOut first stops this phone getting the account's notifications (AuthProvider), as every Sign out button does. */}
        <Button variant="ghost" icon="close" onClick={() => { void signOut(); }}>{t("me.signOut")}</Button>
      </div>
    </section>
  );
}
