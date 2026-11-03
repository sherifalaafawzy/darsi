import { useEffect, useState } from "react";
import { AppBar, Button, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import { useSuperOn } from "../content/settings";
import { useI18n } from "../i18n";
import { usePlansConfig, type Economics, type PlanDef } from "./data";
import { message, Note, type Msg } from "./Super";
import "../styles/admin.css";
import "./strings";

/**
 * /super/plans, a lazy route of its own: the plans and prices, and a check of the purchase event Google Analytics will
 * get. Kept apart from ./Super, which other staff chunks import: a module that is both a lazy route and a static import
 * split the startup bundle.
 */
const blank = (): PlanDef => ({ id: "", name: { en: "", ar: "" }, kind: "individual", period: "month", prices: {}, credits: 300, active: true });
/** The user's rule (functions/src/billingCore.ts MIN_MARGIN): every price keeps at least 60% after its credits' cost. */
const MIN_MARGIN = 0.6;
const marginOf = (p: PlanDef, cur: "EGP" | "USD", eco: Economics | null) => {
  const price = p.prices[cur];
  if (!price || !eco?.usdPerCredit || !eco.egpPerUsd) return null;
  return 1 - (p.credits * eco.usdPerCredit) / (cur === "USD" ? price : price / eco.egpPerUsd);
};

/** /super/plans: the plans people and organizations can buy. */
export function PlansPage() {
  const { t } = useI18n();
  const saved = usePlansConfig();
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [eco, setEco] = useState<Economics>({ usdPerCredit: 0, egpPerUsd: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const { num } = useI18n();
  useEffect(() => { if (saved.data) { setPlans(saved.data.plans); if (saved.data.economics) setEco(saved.data.economics); } }, [saved.data]);
  const set = (i: number, patch: Partial<PlanDef>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api.savePlans({ plans, economics: eco }); setMsg({ ok: true, text: t("sp.saved") }); saved.reload(); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  const price = (v: string) => (v.trim() === "" ? undefined : Number(v));
  return (
    <>
      <AppBar title={t("sp.title")} />
      <main className="screen wide stack-lg">
        <SuperSwitch />
        <p className="muted">{t("sp.intro")}</p>
        {saved.error && <p className="notice err">{saved.error.message}</p>}
        <section className="panel stack" aria-labelledby="eco-h"><h3 id="eco-h">{t("sp.ecoTitle")}</h3>
          <p className="muted small">{t("sp.ecoHint")}</p>
          <div className="form-grid">
            <TextField label={t("sp.usdPerCredit")} type="number" min={0} step="0.0001" value={eco.usdPerCredit || ""} onChange={(e) => setEco({ ...eco, usdPerCredit: Number(e.target.value) })} dir="ltr" />
            <TextField label={t("sp.egpPerUsd")} type="number" min={1} step="0.01" value={eco.egpPerUsd || ""} onChange={(e) => setEco({ ...eco, egpPerUsd: Number(e.target.value) })} dir="ltr" />
          </div>
        </section>
        {plans.map((p, i) => (
          <section key={i} className="panel stack" aria-label={p.id || t("sp.newPlan")}>
            <div className="form-grid">
              <TextField label={t("sp.id")} hint={t("sp.idHint")} value={p.id} onChange={(e) => set(i, { id: e.target.value.toLowerCase() })} dir="ltr" autoComplete="off" />
              <TextField label={t("sp.nameEn")} value={p.name.en} onChange={(e) => set(i, { name: { ...p.name, en: e.target.value } })} />
              <TextField label={t("sp.nameAr")} value={p.name.ar} onChange={(e) => set(i, { name: { ...p.name, ar: e.target.value } })} dir="rtl" lang="ar" />
              <label className="or-pick"><span>{t("sp.kind")}</span>
                <select value={p.kind} onChange={(e) => set(i, { kind: e.target.value as PlanDef["kind"] })}><option value="individual">{t("sp.individual")}</option><option value="seat">{t("sp.seat")}</option><option value="credits">{t("sp.pack")}</option></select>
              </label>
              <label className="or-pick"><span>{t("sp.period")}</span>
                <select value={p.period} onChange={(e) => set(i, { period: e.target.value as PlanDef["period"] })}><option value="month">{t("sp.month")}</option><option value="year">{t("sp.year")}</option></select>
              </label>
              <TextField label={t("sp.priceEgp")} type="number" min={0} step="0.01" value={p.prices.EGP ?? ""} onChange={(e) => set(i, { prices: { ...p.prices, EGP: price(e.target.value) } })} dir="ltr" />
              <TextField label={t("sp.priceUsd")} type="number" min={0} step="0.01" value={p.prices.USD ?? ""} onChange={(e) => set(i, { prices: { ...p.prices, USD: price(e.target.value) } })} dir="ltr" />
              <TextField label={t(p.kind === "credits" ? "sp.packCredits" : "sp.credits")} type="number" min={0} max={100000} value={p.credits} onChange={(e) => set(i, { credits: Number(e.target.value) })} dir="ltr" />
            </div>
            {/* The margin each price keeps after its credits' cost; under 60% can't be saved. */}
            <p className="row-gap">{(["EGP", "USD"] as const).map((cur) => { const m = marginOf(p, cur, eco); return m === null ? null : (
              <span key={cur} className={m < MIN_MARGIN ? "notice err" : "notice ok"}>{t("sp.margin", { cur, pct: num(m, { style: "percent" }) })}</span>
            ); })}</p>
            <div className="row-gap">
              <label className="row-gap"><input type="checkbox" checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} /> {t("sp.active")}</label>
              <Button size="sm" variant="ghost" icon="close" onClick={() => setPlans((ps) => ps.filter((_, j) => j !== i))}>{t("sp.remove")}</Button>
            </div>
          </section>
        ))}
        <div className="row-gap">
          <Button variant="secondary" icon="edit" onClick={() => setPlans((ps) => [...ps, blank()])}>{t("sp.add")}</Button>
          <Button onClick={() => { void save(); }} loading={busy} disabled={!saved.data}>{t("sp.save")}</Button>
        </div>
        <Note msg={msg} />
        <RevenueCheck plans={saved.data?.plans ?? []} />
      </main>
    </>
  );
}

/** The switch that turns Darsi Super on or off for the whole platform (setSuperOn). */
function SuperSwitch() {
  const { t } = useI18n();
  const { on, apply } = useSuperOn();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const flip = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.setSuperOn({ on: !on }); apply(r.on); setMsg({ ok: true, text: t(r.on ? "sp.turnedOn" : "sp.turnedOff") }); } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sw-h"><h3 id="sw-h">{t("sp.switchTitle")}</h3>
      <p className={on ? "notice ok" : "notice"} role="status">{t(on ? "sp.switchOn" : "sp.switchOff")}</p>
      <div><Button variant={on ? "secondary" : "primary"} icon={on ? "close" : "check"} loading={busy} aria-pressed={on} onClick={() => { void flip(); }}>{t(on ? "sp.turnOff" : "sp.turnOn")}</Button></div>
      <Note msg={msg} />
    </section>
  );
}

/** Builds a sample purchase and asks Google Analytics' validation server about it (nothing is recorded there). */
function RevenueCheck({ plans }: { plans: PlanDef[] }) {
  const { t } = useI18n();
  const [plan, setPlan] = useState(""); const [cur, setCur] = useState<"EGP" | "USD">("EGP");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const check = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.checkRevenueEvent({ plan: plan || plans[0]?.id, currency: cur });
      const problems = r.validation?.validationMessages ?? [];
      setMsg(!r.sent && r.reason ? { ok: false, text: t("sp.gaOff") } : problems.length ? { ok: false, text: problems.map((p) => `${p.fieldPath ?? ""} ${p.description}`).join(t("common.sep")) } : { ok: true, text: t("sp.gaOk") });
    } catch (e) { setMsg({ ok: false, text: message(e) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="rc-h"><h3 id="rc-h">{t("sp.checkTitle")}</h3>
      <p className="muted small">{t("sp.checkHint")}</p>
      <div className="row-gap">
        <label className="or-pick"><span>{t("sp.plan")}</span><select value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}</select></label>
        <label className="or-pick"><span>{t("sp.currency")}</span><select value={cur} onChange={(e) => setCur(e.target.value as "EGP" | "USD")}><option>EGP</option><option>USD</option></select></label>
        <Button size="sm" variant="secondary" icon="check" loading={busy} disabled={!plans.length} onClick={() => { void check(); }}>{t("sp.check")}</Button>
      </div>
      <Note msg={msg} />
    </section>
  );
}
