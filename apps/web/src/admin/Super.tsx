import { useState } from "react";
import { Button, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import type { Org, Profile } from "../auth/types";
import { useI18n } from "../i18n";
import { useCredits, usePlansConfig, useSubscription } from "./data";
import "../styles/admin.css";
import "./strings";

/**
 * Darsi Super for platform admins and org admins (docs/SUPER.md, TECHNICAL.md "Darsi Super"): complimentary Super and
 * credits, organizations' licences and seats. The plans page is ./Plans.
 * Payments themselves only ever come from the payment providers' verified webhooks.
 */
// The server's own words, without a "FirebaseError: " prefix or the SDK's " [400]" (they may contain ": ").
export const message = (e: unknown) => String((e as { message?: string }).message ?? e).replace(/^Firebase(?:Error)?:\s*/, "").replace(/\s*\[\d{3}\]$/, "");
export type Msg = { ok: boolean; text: string } | null;
export const Note = ({ msg }: { msg: Msg }) => (msg ? <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p> : null);

/** On a person's page (platform admins): their Darsi Super, and complimentary days. */
export function SuperGrantPanel({ person }: { person: Profile }) {
  const { t, locale, num } = useI18n();
  const sub = useSubscription(person.uid);
  const credits = useCredits(person.uid);
  const [days, setDays] = useState(30);
  const [extra, setExtra] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const until = person.planUntil && person.planUntil > Date.now() ? person.planUntil : null;
  const grant = async (d: number) => {
    setBusy(true); setMsg(null);
    try { await api.grantSuper({ uid: person.uid, days: d }); setMsg({ ok: true, text: d ? t("sp.granted", { days: d }) : t("sp.revoked") }); sub.reload(); credits.reload(); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sg-h"><h3 id="sg-h">{t("sp.superTitle")}</h3>
      <p className="muted">{until ? t("sp.hasSuper", { date: date.format(until), source: t(person.planSource === "org" ? "sp.fromOrg" : "sp.fromOwn") }) : t("sp.noSuper")}</p>
      {sub.data && <p className="muted small">{t("sp.subLine", { plan: sub.data.plan, status: sub.data.status, source: sub.data.source, date: date.format(sub.data.currentPeriodEnd) })}</p>}
      <div className="row-gap">
        <TextField label={t("sp.days")} type="number" min={1} max={3660} value={days} onChange={(e) => setDays(Number(e.target.value))} dir="ltr" />
        <Button size="sm" loading={busy} onClick={() => { void grant(days); }}>{t("sp.grant")}</Button>
        {sub.data && sub.data.status !== "expired" && <Button size="sm" variant="ghost" icon="close" loading={busy} onClick={() => { void grant(0); }}>{t("sp.revoke")}</Button>}
      </div>
      <p className="muted small">{t("sp.grantHint")}</p>
      <p className="muted">{t("sp.balance", { plan: num(credits.data && credits.data.planUntil > Date.now() ? credits.data.plan : 0), packs: num(credits.data?.packs ?? 0) })}</p>
      <div className="row-gap">
        <TextField label={t("sp.creditsField")} type="number" min={1} max={100000} value={extra} onChange={(e) => setExtra(Number(e.target.value))} dir="ltr" />
        <Button size="sm" variant="secondary" loading={busy} onClick={() => { setBusy(true); setMsg(null); api.grantCredits({ uid: person.uid, credits: extra }).then(() => { setMsg({ ok: true, text: t("sp.creditsGiven", { n: extra }) }); credits.reload(); }, (e) => setMsg({ ok: false, text: message(e) })).finally(() => setBusy(false)); }}>{t("sp.giveCredits")}</Button>
      </div>
      <Note msg={msg} />
    </section>
  );
}

/** On a platform admin's org page: the organization's licence (plan, seats, how long). */
export function LicencePanel({ org }: { org: Org }) {
  const { t, locale } = useI18n();
  const plans = usePlansConfig();
  const lic = org.licence && org.licence.until > Date.now() ? org.licence : null;
  const [seats, setSeats] = useState(lic?.seats ?? 30); const [days, setDays] = useState(365); const [plan, setPlan] = useState(lic?.plan ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const seatPlans = (plans.data?.plans ?? []).filter((p) => p.kind === "seat");
  const save = async (n: number) => {
    setBusy(true); setMsg(null);
    try { await api.setOrgLicence({ orgId: org.id, seats: n, days, plan: plan || seatPlans[0]?.id }); setMsg({ ok: true, text: n ? t("sp.licenceSaved") : t("sp.licenceRemoved") }); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="lc-h"><h3 id="lc-h">{t("sp.licenceTitle")}</h3>
      <p className="muted">{lic ? t("sp.licenceLine", { seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) }) : t("sp.noLicence")}</p>
      <div className="row-gap">
        {seatPlans.length > 0 && <label className="or-pick"><span>{t("sp.plan")}</span><select value={plan} onChange={(e) => setPlan(e.target.value)}>{seatPlans.map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}</select></label>}
        <TextField label={t("sp.seats")} type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} dir="ltr" />
        <TextField label={t("sp.days")} type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} dir="ltr" />
        <Button size="sm" loading={busy} onClick={() => { void save(seats); }}>{t("sp.setLicence")}</Button>
        {lic && <Button size="sm" variant="ghost" icon="close" loading={busy} onClick={() => { void save(0); }}>{t("sp.removeLicence")}</Button>}
      </div>
      <p className="muted small">{t("sp.licenceHint")}</p>
      <Note msg={msg} />
    </section>
  );
}

/** On the org dashboard (and a platform admin's org page): who has the licence's seats. */
export function SeatsPanel({ org, members }: { org: Org; members: Profile[] }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const lic = org.licence && org.licence.until > Date.now() ? org.licence : null;
  if (!lic) return null;
  const used = members.filter((m) => m.superSeat).length;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(""); }
  };
  return (
    <section className="panel stack" aria-labelledby="st-seats"><h3 id="st-seats">{t("sp.seatsTitle")}</h3>
      <p className="muted">{t("sp.seatsLine", { used, seats: lic.seats, date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(lic.until) })}</p>
      <div className="row-gap">
        <Button size="sm" loading={busy === "fill"} disabled={used >= lic.seats} onClick={() => { void act("fill", async () => { const r = await api.fillSeats({ orgId: org.id }); return r; }, t("sp.filled")); }}>{t("sp.fill")}</Button>
      </div>
      <ul className="po-found">{members.filter((m) => m.role !== "orgAdmin" || m.superSeat).slice(0, 200).map((m) => (
        <li key={m.uid}>
          <span><strong><bdi>{m.name}</bdi></strong> <small className="muted">{t(`role.${m.role ?? "learner"}` as "role.student")}</small></span>
          <Button size="sm" variant={m.superSeat ? "ghost" : "secondary"} loading={busy === m.uid} disabled={!m.superSeat && used >= lic.seats}
            onClick={() => { void act(m.uid, () => api.setSeat({ orgId: org.id, uid: m.uid, on: !m.superSeat }), m.superSeat ? t("sp.seatOff", { name: m.name }) : t("sp.seatOn", { name: m.name })); }}>
            {m.superSeat ? t("sp.takeSeat") : t("sp.giveSeat")}
          </Button>
        </li>
      ))}</ul>
      <Note msg={msg} />
    </section>
  );
}
