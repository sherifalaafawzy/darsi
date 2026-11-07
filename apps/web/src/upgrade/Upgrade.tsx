import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Button, Icon, TextField } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { deviceId, track } from "../analytics/track";
import "./strings";

/**
 * /upgrade: what Darsi Super adds and what it costs (docs/SUPER.md). A lazy chunk with no Firebase: the plans are the
 * public content/plans.json that savePlans publishes, read with a plain fetch, so guests can see them too. Buying
 * opens the provider's page (Paymob for EGP, Stripe for USD) from the startCheckout callable; Super arrives with the
 * verified webhook, and ?done= brings the buyer back here to refresh their token.
 * App passes the plans address and the callables in: importing content/load from here split the startup bundle into
 * seven files.
 * A card (Stripe) subscription renews by itself: while it does, the screen offers Cancel renewal instead of buying a
 * second one, and after cancelling, Turn renewal back on (setRenewal). A Paymob period is renewed by paying again,
 * early if wanted: the new period starts when the current one ends.
 */
interface Plan { id: string; name: { en: string; ar: string }; kind: "individual" | "seat" | "credits"; period: "month" | "year"; prices: { EGP?: number; USD?: number }; credits: number }
type Cur = "EGP" | "USD";
/**
 * The seat count to start from: ?seats=N from the org dashboard's licence (its current seats; at most 10,000, the most
 * one checkout sells), or 20.
 */
const seatsFrom = (v: string | null) => { const n = Math.round(Number(v)); return v && n >= 1 ? Math.min(n, 10000) : 20; };

async function loadPlans(url: string): Promise<Plan[]> {
  const r = await fetch(url, { cache: "no-cache" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { plans?: Plan[] }).plans ?? [];
}
/** The plans, once per visit; retry() after a failed read (offline). No url (Super is off): nothing is read. */
function usePlans(url: string | null) {
  const [s, setS] = useState<{ data?: Plan[]; error?: Error }>({});
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    setS({});
    loadPlans(url).then((data) => live && setS({ data }), (error: Error) => live && setS({ error }));
    return () => { live = false; };
  }, [url, n]);
  return { ...s, retry: () => setN((x) => x + 1) };
}
/** EGP for Arabic or for phones set to Egypt's time; USD otherwise. The person can switch. */
const defaultCurrency = (lang: string): Cur => {
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* old browsers */ }
  return lang === "ar" || tz === "Africa/Cairo" ? "EGP" : "USD";
};

type Checkout = (d: { plan: string; currency: Cur; seats?: number; clientId?: string | null }) => Promise<{ url: string }>;
type Renewal = (d: { renew: boolean }) => Promise<{ renewal: "on" | "off"; until: number }>;

/** `superOn` false: a platform admin turned Darsi Super off for everyone, so nothing is offered for sale. */
export function Upgrade({ plansUrl, startCheckout, setRenewal, superOn = true }: { plansUrl: string; startCheckout: Checkout; setRenewal?: Renewal; superOn?: boolean }) {
  const { t, lang, locale } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, plan, profile, role, refreshClaims } = useAuth();
  const { data: plans, error, retry } = usePlans(superOn ? plansUrl : null);
  const [cur, setCur] = useState<Cur>(() => defaultCurrency(lang));
  const [msg, setMsg] = useState<"soon" | "error" | "subscribed" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(() => seatsFrom(params.get("seats")));
  // The card subscription's renewal as the profile mirrors it (billing.writeClaims), or as this screen just set it.
  const [renewalSet, setRenewalSet] = useState<"on" | "off" | null>(null);
  const [renewMsg, setRenewMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = params.get("done");
  // Back from the payment page: the webhook usually lands within seconds, so read the token again once, a little later.
  useEffect(() => {
    if (!done || !user) return;
    const id = setTimeout(() => { refreshClaims().catch(() => {}); }, 4000);
    return () => clearTimeout(id);
  }, [done, user, refreshClaims]);
  useEffect(() => { track("view_paywall", { from: (params.get("from") ?? "direct").replace(/[^a-z_]/g, "").slice(0, 24) || "direct" }); }, [params]);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const name = (p: Plan) => (lang === "ar" ? p.name.ar : p.name.en);
  const own = useMemo(() => (plans ?? []).filter((p) => p.kind === "individual" && p.prices[cur]), [plans, cur]);
  const seats = useMemo(() => (plans ?? []).filter((p) => p.kind === "seat" && p.prices[cur]), [plans, cur]);
  // Extra credits are for paid accounts only: people with Super who used their allowance.
  const packs = useMemo(() => (plans ?? []).filter((p) => p.kind === "credits" && p.prices[cur]), [plans, cur]);
  const active = plan && plan.until > Date.now() ? plan : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const renewal = active ? renewalSet ?? profile?.planRenewal ?? null : null;
  // Own Super that a Paymob payment would extend: the button says Renew, and when the new period starts.
  const renewing = !!active && profile?.planSource === "subscription";

  const buy = async (p: Plan, seats?: number) => {
    track("begin_checkout", { plan: p.id, cur, prov: cur === "EGP" ? "paymob" : "stripe" });
    setBusy(p.id); setMsg(null);
    try {
      const { url } = await startCheckout({ plan: p.id, currency: cur, seats, clientId: await deviceId() });
      location.assign(url);
    } catch (e) {
      const m = String((e as Error).message);
      setMsg(/already-subscribed/.test(m) ? "subscribed" : /payments-closed|super-off/.test(m) ? "soon" : "error");
      setBusy(null);
    }
  };
  /** Cancels (false) or restores (true) the card subscription's renewal; Super runs to the end of what was paid either way. */
  const renew = async (on: boolean) => {
    if (!setRenewal) return;
    setBusy("renewal"); setRenewMsg(null);
    try {
      const r = await setRenewal({ renew: on });
      setRenewalSet(r.renewal);
      setRenewMsg({ ok: true, text: r.renewal === "off" ? t("up.renewalOff", { date: date.format(r.until) }) : t("up.renewalOn") });
    } catch (e) {
      const m = String((e as Error).message);
      if (/no-renewal/.test(m)) setRenewalSet(null);
      setRenewMsg({ ok: false, text: t(/no-renewal/.test(m) ? "up.noRenewal" : /payments-closed/.test(m) ? "up.soon" : "up.renewError") });
    } finally { setBusy(null); }
  };
  /** A plan for one person: what its button offers, given the card subscription and own Super. */
  const payButton = (p: Plan) => {
    if (cur === "USD" && renewal) return null; // the renewal above is how a card subscription goes on
    if (cur === "EGP" && renewal === "on") return null; // already paid by card, renewing by itself
    return <div className="stack-sm">
      <div><Button loading={busy === p.id} disabled={!!busy} onClick={() => buy(p)}>{t(cur === "EGP" ? (renewing ? "up.renewPaymob" : "up.payPaymob") : "up.payStripe")}</Button></div>
      {/* Own Super still running: either way, the new period starts when it ends (billingCore.paymentEffects). */}
      {renewing && active && <p className="muted small">{t(cur === "EGP" ? "up.renewHint" : "up.cardHint", { date: date.format(active.until) })}</p>}
    </div>;
  };

  // A card subscription's renewal: kept reachable while Super is off, so nobody is charged again without a way to stop it
  // (setRenewal works either way; payments.ts).
  const renewalPanel = active && renewal ? <section className="panel stack-sm" aria-labelledby="renew-h">
    <p id="renew-h">{renewal === "on" ? t("up.renews") : t("up.ends", { date: date.format(active.until) })}</p>
    {setRenewal && <div><Button size="sm" variant="secondary" loading={busy === "renewal"} disabled={!!busy} onClick={() => { void renew(renewal === "off"); }}>{t(renewal === "on" ? "up.cancelRenewal" : "up.resume")}</Button></div>}
  </section> : null;
  const renewNote = renewMsg && <p className={renewMsg.ok ? "notice ok" : "notice err"} role="status">{renewMsg.text}</p>;

  // Super switched off for everyone (setSuperOn): only the notice, with no pitch, prices or plans (they aren't even read).
  if (!superOn) return (
    <>
      <AppBar title={t("up.title")} onBack={() => nav(-1)} backLabel={t("common.back")} />
      <main className="screen narrow stack-lg">
        <p className="notice" role="status">{t("up.off")}</p>
        {renewalPanel}
        {renewNote}
      </main>
    </>
  );

  return (
    <>
      <AppBar title={t("up.title")} onBack={() => nav(-1)} backLabel={t("common.back")} />
      <main className="screen narrow stack-lg">
        <section className="panel stack">
          <p><strong>{t("up.lead")}</strong></p>
          <ul className="icon-list">
            {(["up.f1", "up.f2", "up.f3", "up.f4"] as const).map((k, i) => <li key={k} className="icon-item"><Icon name={(["chat", "video", "check", "award"] as const)[i]} size={20} /><span>{t(k)}</span></li>)}
          </ul>
        </section>

        {done && !active && <div className="notice" role="status"><p>{t("up.done")}</p><Button size="sm" variant="secondary" icon="sync" onClick={() => refreshClaims().catch(() => {})}>{t("up.check")}</Button></div>}
        {active && <p className="notice ok">{t(profile?.planSource === "org" ? "up.haveOrg" : "up.have", { date: date.format(active.until) })}</p>}
        {renewalPanel}
        {renewNote}

        <div className="row-gap" role="group" aria-label={t("up.currency")}>
          {(["EGP", "USD"] as const).map((c) => <Button key={c} size="sm" variant={cur === c ? "primary" : "ghost"} aria-pressed={cur === c} onClick={() => setCur(c)}>{c}</Button>)}
        </div>

        {error ? <div className="stack"><p className="notice err">{t(navigator.onLine === false ? "up.offline" : "up.loadError")}</p><div><Button size="sm" variant="secondary" icon="sync" onClick={retry}>{t("common.retry")}</Button></div></div>
          : !plans ? <div className="loading" aria-busy="true" />
          : !own.length ? <p className="muted">{t("up.none")}</p>
          : own.map((p) => (
            <section key={p.id} className="panel stack" aria-label={name(p)}>
              <h3>{name(p)}</h3>
              <p><strong>{t(p.period === "year" ? "up.perYear" : "up.perMonth", { price: money(p.prices[cur]!) })}</strong></p>
              <p className="muted small">{t(p.period === "year" ? "up.creditsYear" : "up.creditsMonth", { n: p.credits })}</p>
              {user
                ? payButton(p)
                : <div><Button variant="secondary" icon="profile" onClick={() => nav("/signup")}>{t("up.account")}</Button></div>}
            </section>
          ))}
        {active && packs.length > 0 && <section className="panel stack" aria-labelledby="packs-h"><h3 id="packs-h">{t("up.more")}</h3>
          <p className="muted">{t("up.moreBody")}</p>
          {packs.map((p) => (
            <div key={p.id} className="row-gap"><span>{t("up.pack", { n: p.credits, price: money(p.prices[cur]!) })}</span><Button size="sm" variant="secondary" loading={busy === p.id} disabled={!!busy} onClick={() => buy(p)}>{t("up.buy")}</Button></div>
          ))}
        </section>}
        {msg && <p className={msg === "error" ? "notice err" : "notice"} role="status">{t(msg === "error" ? "up.payError" : msg === "subscribed" ? "up.subscribed" : "up.soon")}</p>}

        {seats.length > 0 && <section className="panel stack"><h3>{t("up.orgs")}</h3>
          <p className="muted">{t("up.orgsBody")}</p>
          {seats.map((p) => <div key={p.id} className="stack-sm">
            <p>{name(p)}: <strong>{t("up.perSeat", { price: money(p.prices[cur]!) })}</strong></p>
            {/* An organization's admin buys seats for a year; everyone else is pointed to them. */}
            {role === "orgAdmin" && <div className="stack-sm">
              <div className="row-gap">
                <TextField label={t("up.seatsField")} type="number" min={1} max={10000} value={seatCount} onChange={(e) => setSeatCount(Math.max(1, Math.min(10000, Math.round(Number(e.target.value)) || 1)))} dir="ltr" />
                <Button loading={busy === p.id} disabled={!!busy} onClick={() => buy(p, seatCount)}>{t("up.buySeats", { price: money(p.prices[cur]! * seatCount) })}</Button>
              </div>
              <p className="muted small">{t("up.seatsHint")}</p>
              {/* Here from anywhere but the dashboard, the seat count isn't the licence's own: the dashboard fills it in. */}
              {!params.get("seats") && <p className="muted small">{t("up.seatsFromDash")} <Link to="/admin">{t("up.openDash")}</Link></p>}
            </div>}
          </div>)}
        </section>}
      </main>
    </>
  );
}
