/**
 * Darsi Super without Firebase (docs/SUPER.md, TECHNICAL.md "Darsi Super"), so the tests can run it: the plans
 * platform admins set, who has Super and until when, and the Google Analytics `purchase` / `refund` payloads.
 */
import { createHash } from "node:crypto";

export const CURRENCIES = ["EGP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
/**
 * A plan: for one person (monthly or yearly), a seat in an organization's licence (priced per seat), or a pack of
 * extra tutor credits for someone who already has Super (one-off, never expires).
 */
export interface Plan {
  id: string;
  name: { en: string; ar: string };
  kind: "individual" | "seat" | "credits";
  period: "month" | "year";
  prices: Partial<Record<Currency, number>>;
  /** Tutor credits: per period for a plan or a seat, or the pack's size (docs/SUPER.md §5). */
  credits: number;
  active: boolean;
}

/**
 * What a tutor credit costs Darsi at the AI provider (USD), and the exchange rate for EGP prices. The tutor debits
 * credits at the measured cost of each call (phase 2), so every plan's margin holds however people use it.
 */
export interface Economics { usdPerCredit: number; egpPerUsd: number }
/** The user's rule: at least 60% of every price is margin after the provider's cost of its credits. */
export const MIN_MARGIN = 0.6;

/** The share of a price left after the credits' cost; 1 for a plan without credits. */
export function margin(p: Pick<Plan, "credits" | "prices">, currency: Currency, eco: Economics): number | null {
  const price = p.prices[currency];
  if (!price) return null;
  const usd = currency === "USD" ? price : price / eco.egpPerUsd;
  return 1 - (p.credits * eco.usdPerCredit) / usd;
}

const ID = /^[a-z0-9_]{3,32}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The cost and exchange rate a platform admin set, checked. */
export function validateEconomics(raw: unknown): Economics {
  const r = raw as Record<string, unknown> | undefined;
  const usdPerCredit = Number(r?.usdPerCredit), egpPerUsd = Number(r?.egpPerUsd);
  if (!Number.isFinite(usdPerCredit) || usdPerCredit <= 0 || usdPerCredit > 10) throw new Error("The cost of one credit (USD) must be above 0 and at most 10.");
  if (!Number.isFinite(egpPerUsd) || egpPerUsd < 1 || egpPerUsd > 1000) throw new Error("The EGP rate must be between 1 and 1000 EGP for 1 USD.");
  return { usdPerCredit, egpPerUsd };
}

/** Plans as a platform admin saved them, checked, every price keeping at least MIN_MARGIN. Throws a message the screen can show. */
export function validatePlans(raw: unknown, eco: Economics): Plan[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new Error("Between 0 and 20 plans.");
  const seen = new Set<string>();
  return raw.map((r: Record<string, unknown>, i) => {
    const id = text(r?.id, 32);
    if (!ID.test(id)) throw new Error(`Plan ${i + 1}: the id needs 3–32 of a–z, 0–9 and _.`);
    if (seen.has(id)) throw new Error(`Plan ${i + 1}: "${id}" is used twice.`);
    seen.add(id);
    const name = r.name as Record<string, unknown> | undefined;
    const en = text(name?.en, 60), ar = text(name?.ar, 60);
    if (!en || !ar) throw new Error(`Plan "${id}": a name in English and in Arabic.`);
    const kind = r.kind === "seat" ? "seat" : r.kind === "credits" ? "credits" : "individual";
    const period = r.period === "year" ? "year" : "month";
    const prices: Partial<Record<Currency, number>> = {};
    for (const c of CURRENCIES) {
      const v = (r.prices as Record<string, unknown> | undefined)?.[c];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 1e6) throw new Error(`Plan "${id}": the ${c} price must be a positive number.`);
      prices[c] = Math.round(n * 100) / 100;
    }
    if (!Object.keys(prices).length) throw new Error(`Plan "${id}": a price in EGP or USD.`);
    const credits = Math.round(Number(r.credits));
    if (!Number.isFinite(credits) || credits < 0 || credits > 100000) throw new Error(`Plan "${id}": credits must be 0–100000.`);
    if (kind === "credits" && credits < 1) throw new Error(`Plan "${id}": a credit pack needs credits.`);
    const plan: Plan = { id, name: { en, ar }, kind, period, prices, credits, active: r.active !== false };
    for (const c of CURRENCIES) {
      const m = margin(plan, c, eco);
      if (m !== null && m < MIN_MARGIN) throw new Error(`Plan "${id}": the ${c} price leaves a ${Math.round(m * 100)}% margin after its credits' cost; it must be at least ${MIN_MARGIN * 100}%.`);
    }
    return plan;
  });
}

/**
 * A person's tutor credits: the plan's allowance for the current period (it resets, and lapses unused at the period's
 * end) and packs bought on top (they never expire). Spending takes the plan's first.
 */
export interface Credits { plan: number; planUntil: number; packs: number }
export const creditsLeft = (c: Credits | undefined, now = Date.now()) => (c ? (c.planUntil > now ? c.plan : 0) + c.packs : 0);
/** The period's allowance, replacing what is left of the last one. */
export const grantPlanCredits = (c: Credits | undefined, amount: number, until: number): Credits => ({ plan: amount, planUntil: until, packs: c?.packs ?? 0 });
export const addPackCredits = (c: Credits | undefined, amount: number, now = Date.now()): Credits =>
  ({ plan: c && c.planUntil > now ? c.plan : 0, planUntil: c?.planUntil ?? 0, packs: (c?.packs ?? 0) + amount });
/** Spends n credits, the plan's first; null if there aren't enough (the tutor then says so and offers a pack). */
export function spendCredits(c: Credits | undefined, n: number, now = Date.now()): Credits | null {
  if (!c || n < 0 || creditsLeft(c, now) < n) return null;
  const fromPlan = c.planUntil > now ? Math.min(c.plan, n) : 0;
  return { plan: (c.planUntil > now ? c.plan : 0) - fromPlan, planUntil: c.planUntil, packs: c.packs - (n - fromPlan) };
}
/** Credits for a call that cost Darsi `usd` at the provider, rounded up so a call never costs less than it should. */
// The tiny bit taken off first is floating-point error (0.0051 / 0.002 = 2.5500000000000003), not a discount.
export const creditsForCost = (usd: number, eco: Economics) => Math.max(0, Math.ceil((usd / eco.usdPerCredit) * 100 - 1e-9) / 100);

/** Days a plan period lasts. */
export const periodDays = (p: Pick<Plan, "period">) => (p.period === "year" ? 365 : 30);

export interface Subscription { plan: string; status: "active" | "canceled" | "expired" | "past_due"; currentPeriodEnd: number; source: "paymob" | "stripe" | "grant" }
export interface Licence { plan: string; seats: number; until: number }
export interface Entitlement { plan: string; until: number; source: "subscription" | "org" }

/**
 * Who has Super: their own subscription (paid until currentPeriodEnd, cancelled ones too until then), or a seat in
 * their organization's licence while it lasts. The later of the two wins.
 */
export function entitlement(o: { sub?: Subscription | null; licence?: Licence | null; seat?: boolean; now?: number }): Entitlement | null {
  const now = o.now ?? Date.now();
  const mine = o.sub && o.sub.status !== "expired" && o.sub.currentPeriodEnd > now ? { plan: o.sub.plan, until: o.sub.currentPeriodEnd, source: "subscription" as const } : null;
  const org = o.licence && o.seat && o.licence.until > now ? { plan: o.licence.plan, until: o.licence.until, source: "org" as const } : null;
  if (mine && org) return mine.until >= org.until ? mine : org;
  return mine ?? org;
}

/** The custom claims: role and organization as before, plus Super while it lasts. */
export function claimsFor(role: string, orgId: string | null, e: Entitlement | null): Record<string, unknown> {
  return { role, ...(orgId ? { orgId } : {}), ...(e ? { plan: e.plan, planUntil: e.until } : {}) };
}

/** Google Analytics' user_id: a hash of the account id, never the id or an email. */
export const gaUserId = (uid: string) => createHash("sha256").update(`darsi:${uid}`).digest("hex").slice(0, 32);

export interface PaymentRecord {
  provider: "paymob" | "stripe"; ref: string; kind: "subscription" | "licence" | "credits";
  uid?: string; orgId?: string; plan: Plan; amount: number; currency: Currency; seats?: number;
  /** The phone's random analytics id, passed through the checkout, so the purchase joins the sessions before it. */
  clientId?: string;
  /** The checkout it pays for (checkouts/{id}), so a refund can find the plan and the buyer. */
  checkout?: string;
}

/** The Measurement Protocol body for a purchase or a refund (GA4 ecommerce). */
export function revenueEvent(p: PaymentRecord, type: "purchase" | "refund", nowMs = Date.now()) {
  const who = p.uid ?? `org:${p.orgId}`;
  const quantity = p.kind === "licence" ? Math.max(1, p.seats ?? 1) : 1;
  return {
    client_id: p.clientId && /^[a-z0-9.]{8,64}$/.test(p.clientId) ? p.clientId : `server.${gaUserId(who).slice(0, 16)}`,
    user_id: gaUserId(who),
    timestamp_micros: nowMs * 1000,
    events: [{
      name: type,
      params: {
        transaction_id: `${p.provider}_${p.ref}`, value: p.amount, currency: p.currency,
        affiliation: p.kind === "licence" ? "organization" : p.kind === "credits" ? "credits" : "individual", payment_type: p.provider,
        items: [{ item_id: p.plan.id, item_name: p.plan.name.en, item_category: p.plan.kind, price: Math.round((p.amount / quantity) * 100) / 100, quantity }],
        engagement_time_msec: 1,
      },
    }],
  };
}

/** Darsi Super in the platform overview: active subscriptions by plan and source, and organizations' seats. */
export function superStats(subs: Array<Partial<Subscription>>, licences: Array<{ id: string; licence?: Licence | null }>, seatHolders: Record<string, number>, now = Date.now()) {
  const live = subs.filter((s) => s.status !== "expired" && (s.currentPeriodEnd ?? 0) > now);
  const byPlan: Record<string, number> = {}, bySource: Record<string, number> = {};
  for (const s of live) { byPlan[s.plan ?? "?"] = (byPlan[s.plan ?? "?"] ?? 0) + 1; bySource[s.source ?? "?"] = (bySource[s.source ?? "?"] ?? 0) + 1; }
  const orgs = licences.filter((o) => o.licence && o.licence.until > now);
  return {
    individuals: live.length, byPlan, bySource,
    orgs: orgs.length, seats: orgs.reduce((a, o) => a + (o.licence?.seats ?? 0), 0), seatsUsed: orgs.reduce((a, o) => a + (seatHolders[o.id] ?? 0), 0),
  };
}
