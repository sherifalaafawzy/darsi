import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Button, Icon } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { track } from "../analytics/track";
import "./strings";

/**
 * /upgrade: what Darsi Super adds and what it costs (docs/SUPER.md). A lazy chunk with no Firebase: the plans are the
 * public content/plans.json that savePlans publishes, read with a plain fetch, so guests can see them too. Buying
 * opens in phase 1 (Paymob for EGP, Stripe for cards); until then the buttons record the intent and say so.
 * App passes the plans address in: importing content/load from here split the startup bundle into seven files.
 */
interface Plan { id: string; name: { en: string; ar: string }; kind: "individual" | "seat" | "credits"; period: "month" | "year"; prices: { EGP?: number; USD?: number }; credits: number }
type Cur = "EGP" | "USD";

async function loadPlans(url: string): Promise<Plan[]> {
  const r = await fetch(url, { cache: "no-cache" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { plans?: Plan[] }).plans ?? [];
}
/** The plans, once per visit; retry() after a failed read (offline). */
function usePlans(url: string) {
  const [s, setS] = useState<{ data?: Plan[]; error?: Error }>({});
  const [n, setN] = useState(0);
  useEffect(() => {
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

export function Upgrade({ plansUrl }: { plansUrl: string }) {
  const { t, lang, locale } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, plan, profile } = useAuth();
  const { data: plans, error, retry } = usePlans(plansUrl);
  const [cur, setCur] = useState<Cur>(() => defaultCurrency(lang));
  const [soon, setSoon] = useState(false);
  useEffect(() => { track("view_paywall", { from: (params.get("from") ?? "direct").replace(/[^a-z_]/g, "").slice(0, 24) || "direct" }); }, [params]);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const name = (p: Plan) => (lang === "ar" ? p.name.ar : p.name.en);
  const own = useMemo(() => (plans ?? []).filter((p) => p.kind === "individual" && p.prices[cur]), [plans, cur]);
  const seats = useMemo(() => (plans ?? []).filter((p) => p.kind === "seat" && p.prices[cur]), [plans, cur]);
  // Extra credits are for paid accounts only: people with Super who used their allowance.
  const packs = useMemo(() => (plans ?? []).filter((p) => p.kind === "credits" && p.prices[cur]), [plans, cur]);
  const active = plan && plan.until > Date.now() ? plan : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const buy = (p: Plan) => {
    track("begin_checkout", { plan: p.id, cur, prov: cur === "EGP" ? "paymob" : "stripe" });
    setSoon(true);
  };

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

        {active && <p className="notice ok">{t(profile?.planSource === "org" ? "up.haveOrg" : "up.have", { date: date.format(active.until) })}</p>}

        <div className="row-gap" role="group" aria-label={t("up.currency")}>
          {(["EGP", "USD"] as const).map((c) => <Button key={c} size="sm" variant={cur === c ? "primary" : "ghost"} aria-pressed={cur === c} onClick={() => setCur(c)}>{c}</Button>)}
        </div>

        {error ? <div className="stack"><p className="notice err">{t("up.offline")}</p><div><Button size="sm" variant="secondary" icon="sync" onClick={retry}>{t("common.retry")}</Button></div></div>
          : !plans ? <div className="loading" aria-busy="true" />
          : !own.length ? <p className="muted">{t("up.none")}</p>
          : own.map((p) => (
            <section key={p.id} className="panel stack" aria-label={name(p)}>
              <h3>{name(p)}</h3>
              <p><strong>{t(p.period === "year" ? "up.perYear" : "up.perMonth", { price: money(p.prices[cur]!) })}</strong></p>
              <p className="muted small">{t(p.period === "year" ? "up.creditsYear" : "up.creditsMonth", { n: p.credits })}</p>
              {user
                ? <div><Button onClick={() => buy(p)}>{t(cur === "EGP" ? "up.payPaymob" : "up.payStripe")}</Button></div>
                : <div><Button variant="secondary" icon="profile" onClick={() => nav("/signup")}>{t("up.account")}</Button></div>}
            </section>
          ))}
        {active && packs.length > 0 && <section className="panel stack" aria-labelledby="packs-h"><h3 id="packs-h">{t("up.more")}</h3>
          <p className="muted">{t("up.moreBody")}</p>
          {packs.map((p) => (
            <div key={p.id} className="row-gap"><span>{t("up.pack", { n: p.credits, price: money(p.prices[cur]!) })}</span><Button size="sm" variant="secondary" onClick={() => buy(p)}>{t("up.buy")}</Button></div>
          ))}
        </section>}
        {soon && <p className="notice" role="status">{t("up.soon")}</p>}

        {seats.length > 0 && <section className="panel stack"><h3>{t("up.orgs")}</h3>
          <p className="muted">{t("up.orgsBody")}</p>
          {seats.map((p) => <p key={p.id}>{name(p)}: <strong>{t("up.perSeat", { price: money(p.prices[cur]!) })}</strong></p>)}
        </section>}
      </main>
    </>
  );
}
