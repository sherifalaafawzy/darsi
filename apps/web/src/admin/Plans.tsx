import { Suspense, useEffect, useRef, useState } from "react";
import { AppBar, Button, TextField } from "@darsi/design-system";
import { api } from "../auth/api";
import { useSsoOn, useSuperOn } from "../content/settings";
import { lazyRetry } from "../app/AppBoundary";
import { isolate, useI18n, type MessageKey } from "../i18n";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { ErrorNote } from "../staff/LoadState";
import { usePlansConfig, type Economics, type PlanDef } from "./data";
import { Note, type Msg } from "./Super";
import { CapstoneSettings } from "./CapstoneSettings";
import { Tabs, TabPanel, useTab, type TabDef } from "./Tabs";
import { LeaveQuestion, useFormGuard } from "./formGuard";
import { k } from "./formsStrings";
import { typedNumber } from "./typedNumber";
import "../styles/admin.css";
import "./strings";

/**
 * /super/plans, a lazy route of its own, in three tabs: Plans (the plans and prices), Switches (`?tab=switches`: Darsi
 * Super and capstone AI reviews on or off) and Revenue check (`?tab=check`: the purchase event Google Analytics will
 * get). Kept apart from ./Super, which other staff chunks import: a module that is both a lazy route and a static
 * import split the startup bundle.
 */
const blank = (): PlanDef => ({ id: "", name: { en: "", ar: "" }, kind: "individual", period: "month", prices: {}, credits: 300, active: true });
/**
 * A plan and the costs as they are edited: every number as the text typed (admin/typedNumber.ts), turned into numbers
 * and checked when the page saves. Bound to numbers, "0.0035" could not be typed (its "0", "0." and "0.00" on the way
 * all read as 0, which the field showed as empty), and an emptied field was saved as 0.
 */
type PlanDraft = Omit<PlanDef, "prices" | "credits"> & { egp: string; usd: string; credits: string };
type EcoDraft = { usdPerCredit: string; egpPerUsd: string };
const typed = (n: number | undefined | null) => (typeof n === "number" && Number.isFinite(n) ? String(n) : "");
const toDraft = ({ prices, credits, ...rest }: PlanDef): PlanDraft => ({ ...rest, egp: typed(prices?.EGP), usd: typed(prices?.USD), credits: typed(credits) });
const ecoDraft = (e: Economics | null | undefined): EcoDraft => ({ usdPerCredit: typed(e?.usdPerCredit || undefined), egpPerUsd: typed(e?.egpPerUsd || undefined) });
/** The server's own limits (functions/src/billingCore.ts), checked here first so a field can say so before Save. */
const MAX_COST = 10, MIN_RATE = 1, MAX_RATE = 1000, MAX_PRICE = 1e6, MAX_CREDITS = 100000;
type FieldError = "cost" | "rate" | "price" | "credits";
/** The costs as numbers, and which of the two fields can't be saved as typed. */
function readEco(d: EcoDraft): { eco: Economics; bad: { usdPerCredit?: FieldError; egpPerUsd?: FieldError } } {
  const cost = typedNumber(d.usdPerCredit), rate = typedNumber(d.egpPerUsd);
  const costOk = typeof cost === "number" && cost > 0 && cost <= MAX_COST, rateOk = typeof rate === "number" && rate >= MIN_RATE && rate <= MAX_RATE;
  return { eco: { usdPerCredit: costOk ? cost : 0, egpPerUsd: rateOk ? rate : 0 }, bad: { ...(costOk ? {} : { usdPerCredit: "cost" as const }), ...(rateOk ? {} : { egpPerUsd: "rate" as const }) } };
}
/** A plan as savePlans takes it, and which of its number fields can't be saved as typed. An empty price is no price. */
function readPlan({ egp, usd, credits, ...rest }: PlanDraft): { plan: PlanDef; bad: { egp?: FieldError; usd?: FieldError; credits?: FieldError } } {
  const price = (v: string): { ok: boolean; n?: number } => { const n = typedNumber(v); return n === undefined ? { ok: true } : typeof n === "number" && n > 0 && n <= MAX_PRICE ? { ok: true, n } : { ok: false }; };
  const e = price(egp), u = price(usd), c = typedNumber(credits);
  const cOk = typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= MAX_CREDITS;
  return {
    plan: { ...rest, prices: { ...(e.n !== undefined ? { EGP: e.n } : {}), ...(u.n !== undefined ? { USD: u.n } : {}) }, credits: cOk ? c : 0 },
    bad: { ...(e.ok ? {} : { egp: "price" as const }), ...(u.ok ? {} : { usd: "price" as const }), ...(cOk ? {} : { credits: "credits" as const }) },
  };
}
/** What is being edited, as text: the Plans tab is marked, and leaving asks, while it differs from what was last read or saved. */
const snap = (plans: PlanDraft[], eco: EcoDraft) => JSON.stringify([plans, eco]);
/** The user's rule (functions/src/billingCore.ts MIN_MARGIN): every price keeps at least 60% after its credits' cost. */
const MIN_MARGIN = 0.6;
const marginOf = (p: PlanDef, cur: "EGP" | "USD", eco: Economics | null) => {
  const price = p.prices[cur];
  if (!price || !eco?.usdPerCredit || !eco.egpPerUsd) return null;
  return 1 - (p.credits * eco.usdPerCredit) / (cur === "USD" ? price : price / eco.egpPerUsd);
};
/** savePlans' refusals (functions/src/billingCore.ts PlanError: the error's details.reason, with its numbers). */
const REFUSAL: Record<string, MessageKey> = {
  "eco-cost": "sp.err.ecoCost", "eco-rate": "sp.err.ecoRate", "plans-count": "sp.err.plansCount", "plan-id": "sp.err.planId", "plan-twice": "sp.err.planTwice",
  "plan-name": "sp.err.planName", "plan-price": "sp.err.planPrice", "plan-no-price": "sp.err.planNoPrice", "plan-credits": "sp.err.planCredits",
  "pack-credits": "sp.err.packCredits", "plan-margin": "sp.err.planMargin",
};

/**
 * /super/plans: the plans people and organizations can buy. The edits (plans, costs, the save's answer) live here, not
 * in the Plans panel, so they survive a visit to another tab; config/plans is read here too, once, for Plans and
 * Revenue check. Switches' own reads (config/capstone, today's analytics) wait until that tab is opened.
 */
export function PlansPage() {
  const { t, num } = useI18n();
  const saved = usePlansConfig();
  const { on } = useSuperOn();
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [eco, setEco] = useState<EcoDraft>(ecoDraft(null));
  /** The saved copy as `snap` text; null until config/plans is read (nothing is "unsaved" before that). */
  const [clean, setClean] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  /**
   * The two costs are empty on a platform that never saved them, and an empty field nobody has typed in is not a
   * mistake yet: each says what it takes once it was edited (`touched`), or once a save was asked for (`tried`).
   */
  const [touched, setTouched] = useState<{ usdPerCredit?: boolean; egpPerUsd?: boolean }>({});
  const [tried, setTried] = useState(false);
  /** Something is typed and not saved (set below, each render). */
  const unsaved = useRef(false);
  useEffect(() => {
    // Typed since the last read or save: a re-read never takes it away. (A save reads the stored copy back; a price
    // typed while that is on its way was overwritten, and the form then read as saved.)
    if (!saved.data || unsaved.current) return;
    const p = saved.data.plans.map(toDraft), e = ecoDraft(saved.data.economics);
    setPlans(p); setEco(e); setClean(snap(p, e)); setTouched({}); setTried(false);
  }, [saved.data]);
  const set = (i: number, patch: Partial<PlanDraft>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const costs = readEco(eco), read = plans.map(readPlan);
  /** A number field that can't be saved as typed: nothing is sent, and the field says what it takes. */
  const invalid = Object.keys(costs.bad).length > 0 || read.some((r) => Object.keys(r.bad).length > 0);
  /** A cost's mistake, once its field shows it. (A plan's fields are read as saved, so theirs are always typed ones.) */
  const costError = (f: keyof EcoDraft) => (tried || touched[f] ? costs.bad[f] : undefined);
  /** Save waits while a field says it can't be saved; a mistake no field shows yet is said when Save is pressed. */
  const marked = Boolean(costError("usdPerCredit") || costError("egpPerUsd")) || read.some((r) => Object.keys(r.bad).length > 0);
  const setCost = (f: keyof EcoDraft, v: string) => { setEco((e) => ({ ...e, [f]: v })); setTouched((x) => (x[f] ? x : { ...x, [f]: true })); };
  // Nothing is marked before config/plans is read: the empty fields of a page still loading are not mistakes.
  const fieldError = (e?: FieldError) => (clean === null ? undefined : e === "cost" ? t("sp.err.ecoCost", { max: MAX_COST }) : e === "rate" ? t("sp.err.ecoRate", { min: MIN_RATE, max: MAX_RATE })
    : e === "price" ? t(k("fm.num.price"), { max: MAX_PRICE }) : e === "credits" ? t(k("fm.num.credits"), { max: MAX_CREDITS }) : undefined);
  const dirty = clean !== null && clean !== snap(plans, eco);
  unsaved.current = dirty;
  const TABS: TabDef[] = [
    { id: "plans", label: t("tabs.plans"), dirty },
    { id: "switches", label: t("tabs.switches") },
    { id: "check", label: t("tabs.revenueCheck") },
  ];
  const st = useTab(TABS);
  // Unsaved prices: a nav link, a reload or closing the tab asks first. The page's own tabs don't (the edits stay).
  const guard = useFormGuard(dirty);
  /** A refusal in the admin's language, with its own numerals; one the page doesn't know, as the staff kit words it. */
  const refusal = (e: unknown) => {
    const d = (e as { details?: Record<string, unknown> }).details ?? {};
    const key = typeof d.reason === "string" ? REFUSAL[d.reason] : undefined;
    if (!key) return errorText(e, t);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return t(key, { id: isolate(String(d.id ?? "")), cur: String(d.cur ?? ""), n: n(d.n), min: n(d.min), max: n(d.max), pct: num(n(d.margin), { style: "percent" }), least: num(n(d.min), { style: "percent" }) });
  };
  /** Saves and publishes; answers whether it went through ("Save and leave" goes on only then). */
  const save = async (): Promise<boolean> => {
    if (invalid) { setTried(true); setMsg({ ok: false, text: t(k("fm.leave.fix")) }); st.show("plans"); return false; }
    setBusy(true); setMsg(null);
    const sent = snap(plans, eco); // what was saved is what was sent, whatever is typed while it is on its way
    try { await api.savePlans({ plans: read.map((r) => r.plan), economics: costs.eco }); setClean(sent); setMsg({ ok: true, text: t("sp.saved") }); saved.reload(); return true; }
    catch (e) { setMsg({ ok: false, text: refusal(e) }); return false; } finally { setBusy(false); }
  };
  return (
    <>
      <AppBar title={t("sp.title")} />
      <main className="screen wide stack-lg">
        {/* Off for the whole platform: said above the tabs, whichever is open (the switch itself is under Switches, which
            says it again as its own status, so this one is not a live region). */}
        {!on && <p className="notice">{t("sp.switchOff")}</p>}
        {saved.error && <ErrorNote error={saved.error} reload={saved.reload} />}
        {/* Above the tabs, so it is seen whichever tab was open when the link was tapped; with it, why a "Save and
            leave" didn't go through (the Plans tab, where that is said too, may not be the open one). */}
        <LeaveQuestion guard={guard} action={{ label: t(k("fm.leave.save")), run: save, thenLeave: true }} />
        {guard.asking && msg && !msg.ok && <p className="notice err" role="alert">{msg.text}</p>}
        <Tabs label={t("tabs.sections")} tabs={TABS}>
          <TabPanel id="plans">
            <p className="muted">{t("sp.intro")}</p>
            <section className="panel stack" aria-labelledby="eco-h"><h3 id="eco-h">{t("sp.ecoTitle")}</h3>
              <p className="muted small">{t("sp.ecoHint")}</p>
              <div className="form-grid">
                <TextField label={t("sp.usdPerCredit")} inputMode="decimal" autoComplete="off" value={eco.usdPerCredit} error={fieldError(costError("usdPerCredit"))} onChange={(e) => setCost("usdPerCredit", e.target.value)} dir="ltr" />
                <TextField label={t("sp.egpPerUsd")} inputMode="decimal" autoComplete="off" value={eco.egpPerUsd} error={fieldError(costError("egpPerUsd"))} onChange={(e) => setCost("egpPerUsd", e.target.value)} dir="ltr" />
              </div>
            </section>
            {plans.map((p, i) => { const { plan, bad } = read[i]; return (
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
                  <TextField label={t("sp.priceEgp")} inputMode="decimal" autoComplete="off" value={p.egp} error={fieldError(bad.egp)} onChange={(e) => set(i, { egp: e.target.value })} dir="ltr" />
                  <TextField label={t("sp.priceUsd")} inputMode="decimal" autoComplete="off" value={p.usd} error={fieldError(bad.usd)} onChange={(e) => set(i, { usd: e.target.value })} dir="ltr" />
                  <TextField label={t(p.kind === "credits" ? "sp.packCredits" : "sp.credits")} inputMode="numeric" autoComplete="off" value={p.credits} error={fieldError(bad.credits)} onChange={(e) => set(i, { credits: e.target.value })} dir="ltr" />
                </div>
                {/* The margin each price keeps after its credits' cost; under 60% can't be saved, and the line says so
                    in words (the colour alone told nobody who can't see it). */}
                <p className="row-gap">{(["EGP", "USD"] as const).map((cur) => { const m = marginOf(plan, cur, costs.eco); return m === null ? null : (
                  <span key={cur} className={m < MIN_MARGIN ? "notice err" : "notice ok"}>{m < MIN_MARGIN ? t(k("fm.marginLow"), { cur, pct: num(m, { style: "percent" }), least: num(MIN_MARGIN, { style: "percent" }) }) : t("sp.margin", { cur, pct: num(m, { style: "percent" }) })}</span>
                ); })}</p>
                <div className="row-gap">
                  {/* A 24px box in a 44px+ target (admin.css .pick-cell), not the browser's 13px one. */}
                  <label className="pick-cell"><input type="checkbox" checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} />{t("sp.active")}</label>
                  <Button size="sm" variant="ghost" icon="close" onClick={() => setPlans((ps) => ps.filter((_, j) => j !== i))}>{t("sp.remove")}</Button>
                </div>
              </section>
            ); })}
            <div className="row-gap">
              <Button variant="secondary" icon="edit" onClick={() => setPlans((ps) => [...ps, toDraft(blank())])}>{t("sp.add")}</Button>
              <Button onClick={() => { void save(); }} loading={busy} disabled={!saved.data || marked}>{t("sp.save")}</Button>
            </div>
            <Note msg={msg} />
          </TabPanel>
          <TabPanel id="switches">
            <SuperSwitch />
            {/* School sign-in for everyone: in its own chunk with the rest of school sign-in's staff screens. */}
            <Suspense fallback={null}><SsoSwitchHere /></Suspense>
            {/* Capstone AI reviews have their own switch and limits: they aren't part of Super (lesson/ProjectView). It
                reads config/capstone and today's analytics itself, so only once this tab is opened. */}
            <CapstoneSettings />
          </TabPanel>
          <TabPanel id="check"><RevenueCheck plans={saved.data?.plans ?? []} /></TabPanel>
        </Tabs>
      </main>
    </>
  );
}

/** School sign-in's platform switch (admin/SsoSetup.tsx SsoSwitch), told the app's setting and how to change it. */
const SsoSwitch = lazyRetry(() => import("./SsoSetup").then((m) => ({ default: m.SsoSwitch })));
function SsoSwitchHere() {
  const { on, apply } = useSsoOn();
  return <SsoSwitch on={on} apply={apply} />;
}

/** The switch that turns Darsi Super on or off for the whole platform (setSuperOn). */
function SuperSwitch() {
  const { t } = useI18n();
  const { on, apply } = useSuperOn();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const flip = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.setSuperOn({ on: !on }); apply(r.on); setMsg({ ok: true, text: t(r.on ? "sp.turnedOn" : "sp.turnedOff") }); } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); setAsking(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="sw-h"><h3 id="sw-h">{t("sp.switchTitle")}</h3>
      <p className={on ? "notice ok" : "notice"} role="status">{t(on ? "sp.switchOn" : "sp.switchOff")}</p>
      {/* Turning it off stops the tutor and every sale for everyone at once, so it asks first; turning it on gives
          back what people had, and doesn't. The button stays (and stays enabled: pressing it again only asks again)
          while the question is up, so Cancel can give the keyboard focus back to it. */}
      {asking && <InlineConfirm danger title={t(k("fm.sw.offTitle"))} body={t(k("fm.sw.offBody"))} confirmLabel={t(k("fm.sw.offYes"))} busy={busy} onConfirm={() => { void flip(); }} onCancel={() => setAsking(false)} />}
      <div><Button variant={on ? "secondary" : "primary"} icon={on ? "close" : "check"} loading={busy && !asking} aria-pressed={on} onClick={() => { setMsg(null); if (on) setAsking(true); else void flip(); }}>{t(on ? "sp.turnOff" : "sp.turnOn")}</Button></div>
      <Note msg={msg} />
    </section>
  );
}

/** Builds a sample purchase and asks Google Analytics' validation server about it (nothing is recorded there). */
function RevenueCheck({ plans }: { plans: PlanDef[] }) {
  const { t, L } = useI18n();
  const [plan, setPlan] = useState(""); const [cur, setCur] = useState<"EGP" | "USD">("EGP");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const check = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.checkRevenueEvent({ plan: plan || plans[0]?.id, currency: cur });
      const problems = r.validation?.validationMessages ?? [];
      setMsg(!r.sent && r.reason ? { ok: false, text: t("sp.gaOff") } : problems.length ? { ok: false, text: problems.map((p) => `${p.fieldPath ?? ""} ${p.description}`).join(t("common.sep")) } : { ok: true, text: t("sp.gaOk") });
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack" aria-labelledby="rc-h"><h3 id="rc-h">{t("sp.checkTitle")}</h3>
      <p className="muted small">{t("sp.checkHint")}</p>
      <div className="form-grid">
        <label className="or-pick"><span>{t("sp.plan")}</span><select value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}</select></label>
        <label className="or-pick"><span>{t("sp.currency")}</span><select value={cur} onChange={(e) => setCur(e.target.value as "EGP" | "USD")}><option>EGP</option><option>USD</option></select></label>
        <Button size="sm" variant="secondary" icon="check" loading={busy} disabled={!plans.length} onClick={() => { void check(); }}>{t("sp.check")}</Button>
      </div>
      <Note msg={msg} />
    </section>
  );
}
