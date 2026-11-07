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

/**
 * Why plans or their economics were refused (savePlans): the English message for logs and tests, plus a reason code and
 * its values, sent as the error's details so the Plans page says it in the admin's language with its own numerals.
 * `margin` is a fraction (0.5 for 50%), so the page formats the percentage itself.
 */
export type PlanRefusal = "eco-cost" | "eco-rate" | "plans-count" | "plan-id" | "plan-twice" | "plan-name" | "plan-price" | "plan-no-price" | "plan-credits" | "pack-credits" | "plan-margin";
export class PlanError extends Error {
  constructor(message: string, readonly reason: PlanRefusal, readonly vars: Record<string, string | number> = {}) { super(message); this.name = "PlanError"; }
}

/** The cost and exchange rate a platform admin set, checked. */
export function validateEconomics(raw: unknown): Economics {
  const r = raw as Record<string, unknown> | undefined;
  const usdPerCredit = Number(r?.usdPerCredit), egpPerUsd = Number(r?.egpPerUsd);
  if (!Number.isFinite(usdPerCredit) || usdPerCredit <= 0 || usdPerCredit > 10) throw new PlanError("The cost of one credit (USD) must be above 0 and at most 10.", "eco-cost", { max: 10 });
  if (!Number.isFinite(egpPerUsd) || egpPerUsd < 1 || egpPerUsd > 1000) throw new PlanError("The EGP rate must be between 1 and 1000 EGP for 1 USD.", "eco-rate", { min: 1, max: 1000 });
  return { usdPerCredit, egpPerUsd };
}

/** Plans as a platform admin saved them, checked, every price keeping at least MIN_MARGIN. Throws a PlanError. */
export function validatePlans(raw: unknown, eco: Economics): Plan[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new PlanError("Between 0 and 20 plans.", "plans-count", { max: 20 });
  const seen = new Set<string>();
  return raw.map((r: Record<string, unknown>, i) => {
    const id = text(r?.id, 32);
    if (!ID.test(id)) throw new PlanError(`Plan ${i + 1}: the id needs 3–32 of a–z, 0–9 and _.`, "plan-id", { n: i + 1 });
    if (seen.has(id)) throw new PlanError(`Plan ${i + 1}: "${id}" is used twice.`, "plan-twice", { n: i + 1, id });
    seen.add(id);
    const name = r.name as Record<string, unknown> | undefined;
    const en = text(name?.en, 60), ar = text(name?.ar, 60);
    if (!en || !ar) throw new PlanError(`Plan "${id}": a name in English and in Arabic.`, "plan-name", { id });
    const kind = r.kind === "seat" ? "seat" : r.kind === "credits" ? "credits" : "individual";
    const period = r.period === "year" ? "year" : "month";
    const prices: Partial<Record<Currency, number>> = {};
    for (const c of CURRENCIES) {
      const v = (r.prices as Record<string, unknown> | undefined)?.[c];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 1e6) throw new PlanError(`Plan "${id}": the ${c} price must be a positive number.`, "plan-price", { id, cur: c });
      prices[c] = Math.round(n * 100) / 100;
    }
    if (!Object.keys(prices).length) throw new PlanError(`Plan "${id}": a price in EGP or USD.`, "plan-no-price", { id });
    const credits = Math.round(Number(r.credits));
    if (!Number.isFinite(credits) || credits < 0 || credits > 100000) throw new PlanError(`Plan "${id}": credits must be 0–100000.`, "plan-credits", { id, max: 100000 });
    if (kind === "credits" && credits < 1) throw new PlanError(`Plan "${id}": a credit pack needs credits.`, "pack-credits", { id });
    const plan: Plan = { id, name: { en, ar }, kind, period, prices, credits, active: r.active !== false };
    for (const c of CURRENCIES) {
      const m = margin(plan, c, eco);
      if (m !== null && m < MIN_MARGIN) throw new PlanError(`Plan "${id}": the ${c} price leaves a ${Math.round(m * 100)}% margin after its credits' cost; it must be at least ${MIN_MARGIN * 100}%.`, "plan-margin", { id, cur: c, margin: Math.round(m * 100) / 100, min: MIN_MARGIN });
    }
    return plan;
  });
}

/**
 * A person's tutor credits: the plan's allowance for the current period (it resets, and lapses unused at the period's
 * end) and packs bought on top (they never expire). Spending takes the plan's first.
 */
export interface Credits { plan: number; planUntil: number; packs: number }
/**
 * A stored number, or 0 when it isn't one. A credits document that an earlier bad price turned into NaN would
 * otherwise pass every "enough credits?" check for ever (NaN <= 0 is false); read through this it heals on its next
 * write (sfm-04).
 */
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
export const creditsLeft = (c: Credits | undefined, now = Date.now()) => (c ? (num(c.planUntil) > now ? num(c.plan) : 0) + num(c.packs) : 0);
/** The period's allowance, replacing what is left of the last one. */
export const grantPlanCredits = (c: Credits | undefined, amount: number, until: number): Credits => ({ plan: amount, planUntil: until, packs: num(c?.packs) });
/**
 * A period paid for while the last one is still running (an early Paymob renewal, or a new plan on top of a live
 * one): its allowance is added to what is left, and all of it lasts to the new end (sfm-05). Nothing paid for lapses early.
 */
export const extendPlanCredits = (c: Credits | undefined, amount: number, until: number, now = Date.now()): Credits =>
  ({ plan: (c && num(c.planUntil) > now ? num(c.plan) : 0) + amount, planUntil: until, packs: num(c?.packs) });
export const addPackCredits = (c: Credits | undefined, amount: number, now = Date.now()): Credits =>
  ({ plan: c && num(c.planUntil) > now ? num(c.plan) : 0, planUntil: num(c?.planUntil), packs: num(c?.packs) + amount });
/** Spends n credits, the plan's first; null if there aren't enough (the tutor then says so and offers a pack), or if n isn't a number. */
export function spendCredits(c: Credits | undefined, n: number, now = Date.now()): Credits | null {
  if (!c || !Number.isFinite(n) || n < 0 || creditsLeft(c, now) < n) return null;
  const plan = num(c.planUntil) > now ? num(c.plan) : 0;
  const fromPlan = Math.min(plan, n);
  return { plan: plan - fromPlan, planUntil: num(c.planUntil), packs: num(c.packs) - (n - fromPlan) };
}
/**
 * Credits held for a tutor call before it runs (M5 in the security review): at most `n`, or everything left when that is
 * less, so parallel calls can't each pass a "some credits left" check and overspend. Settle returns what wasn't used.
 * null: nothing left to hold.
 */
export interface Hold { fromPlan: number; fromPacks: number }
export function holdCredits(c: Credits | undefined, n: number, now = Date.now()): { next: Credits; hold: Hold } | null {
  const have = creditsLeft(c, now);
  if (!c || have <= 0 || !(n > 0)) return null;
  const take = Math.min(have, n);
  const plan = num(c.planUntil) > now ? num(c.plan) : 0;
  const fromPlan = Math.min(plan, take);
  return { next: { plan: plan - fromPlan, planUntil: num(c.planUntil), packs: num(c.packs) - (take - fromPlan) }, hold: { fromPlan, fromPacks: take - fromPlan } };
}
/**
 * After the call: it cost `cost` credits. What was held beyond that goes back (to the packs first, then the plan, as
 * it came); more than was held is taken from what's left, at most all of it. `short` says the call cost more than the
 * balance allowed. A cost that isn't a number (a price typed wrong in config/tutor) charges everything held: never
 * free, and never more than was held (sfm-04).
 */
export function settleCredits(c: Credits | undefined, hold: Hold, cost: number, now = Date.now()): { next: Credits; charged: number; short: boolean } {
  const base: Credits = { plan: num(c?.plan), planUntil: num(c?.planUntil), packs: num(c?.packs) };
  const held = num(hold.fromPlan) + num(hold.fromPacks);
  if (!Number.isFinite(cost)) cost = held;
  cost = Math.max(0, cost);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  if (cost <= held) {
    let back = held - cost;
    const toPacks = Math.min(back, num(hold.fromPacks)); back -= toPacks;
    const toPlan = base.planUntil > now ? back : 0;
    return { next: { plan: r2(base.plan + toPlan), planUntil: base.planUntil, packs: r2(base.packs + toPacks) }, charged: r2(cost), short: false };
  }
  const extra = cost - held, have = creditsLeft(base, now), take = Math.min(extra, have);
  const next = spendCredits(base, take, now) ?? base;
  return { next: { plan: r2(next.plan), planUntil: next.planUntil, packs: r2(next.packs) }, charged: r2(held + take), short: take < extra };
}

/**
 * A platform admin taking Super back (grantSuper {revoke: true}): a subscription that still runs ends now, and so does
 * its period's allowance of credits (before, the person page went on saying "300 left this period"); packs, bought or
 * given separately, stay. A subscription that already ended is left as it was. Idempotent: taking back twice changes
 * nothing the second time ({}: nothing to write).
 */
export function revokeEffects(o: { sub?: Subscription | null; credits?: Credits | null }, now = Date.now()): { sub?: Pick<Subscription, "status" | "currentPeriodEnd">; credits?: Credits } {
  const live = !!o.sub && o.sub.status !== "expired" && num(o.sub.currentPeriodEnd) > now;
  const c = o.credits;
  // What is left of a lapsed allowance is zeroed too, and a number an earlier bad write left as NaN heals (num).
  const credits = c && (num(c.planUntil) > now || c.plan !== 0 || c.packs !== num(c.packs)) ? { plan: 0, planUntil: Math.min(num(c.planUntil), now), packs: num(c.packs) } : null;
  return { ...(live ? { sub: { status: "expired" as const, currentPeriodEnd: now } } : {}), ...(credits ? { credits } : {}) };
}

/**
 * What a payment did, as recordPayment keeps it on payments/{id}, so a refund takes back exactly that: the time and
 * credits a subscription payment added, and an organization's licence before and after it.
 */
export interface PaidFor { added?: { ms: number; credits: number } | null; seats?: number | null; licence?: { before: Licence | null; after: Licence } | null }

const sameLicence = (a: Licence | null | undefined, b: Licence | null | undefined) => !!a && !!b && a.plan === b.plan && a.seats === b.seats && a.until === b.until;

/**
 * What a full refund takes back (L7): a subscription loses the time the payment added (ending now when nothing paid is
 * left), with the credits it added; a pack its credits still unspent; a licence goes back to what it was before the
 * payment, or, when something changed it since, loses the seat-time the payment bought (removed when nothing is left).
 * Payments recorded before `paid` was kept fall back to one plan period.
 */
export function afterRefund(kind: "subscription" | "licence" | "credits", plan: Pick<Plan, "period" | "credits">,
  o: { sub?: Subscription | null; credits?: Credits | null; licence?: Licence | null; paid?: PaidFor | null }, now = Date.now()): { sub?: Subscription; credits?: Credits; licence?: Licence | null } {
  const period = periodDays(plan) * 864e5;
  if (kind === "subscription") {
    if (!o.sub) return {};
    const back = o.paid?.added ? Math.max(0, num(o.paid.added.ms)) : period;
    const end = Math.max(now, o.sub.currentPeriodEnd - back);
    const over = end <= now;
    const sub: Subscription = { ...o.sub, currentPeriodEnd: end, status: over ? "expired" : o.sub.status };
    // The credits the refunded period brought go with it (what's left of an earlier period stays, to the new end).
    const took = num(o.paid?.added?.credits);
    const credits = o.credits ? { ...o.credits, plan: over ? 0 : Math.max(0, num(o.credits.plan) - took), planUntil: Math.min(num(o.credits.planUntil), end), packs: num(o.credits.packs) } : undefined;
    return { sub, ...(credits ? { credits } : {}) };
  }
  if (kind === "credits") return o.credits ? { credits: { ...o.credits, plan: num(o.credits.plan), planUntil: num(o.credits.planUntil), packs: Math.max(0, num(o.credits.packs) - plan.credits) } } : {};
  if (!o.licence) return {};
  const lic = o.paid?.licence;
  if (lic && sameLicence(o.licence, lic.after)) return { licence: lic.before ?? null };
  // Changed since (a later purchase, a platform admin): take off the seat-time this payment bought, at today's seats.
  const seats = Math.max(1, num(o.licence.seats));
  const until = Math.round(o.licence.until - ((num(o.paid?.seats) || seats) * period) / seats);
  return { licence: until <= now ? null : { ...o.licence, until } };
}

/**
 * An organization's licence after a payment for `seats` seats for one period (sfm-01). What a licence sells is
 * seat-time: an expired (or no) licence becomes `seats` seats for the period; a live one gets the larger of the two
 * seat counts, and its end moves so that every seat-day it had plus every seat-day paid for are kept, no more. Renewing
 * the same seats adds a period; one seat on a 1000-seat licence adds a thousandth of one; more seats start at once.
 */
export function licenceAfterPayment(have: Licence | null | undefined, plan: string, seats: number, periodMs: number, now = Date.now()): Licence {
  const n = Math.max(1, Math.round(num(seats) || 1));
  if (!have || !(num(have.until) > now) || !(num(have.seats) > 0)) return { plan, seats: n, until: now + periodMs };
  const most = Math.max(have.seats, n);
  return { plan, seats: most, until: Math.round(now + (have.seats * (have.until - now) + n * periodMs) / most) };
}

/**
 * Seat holders beyond a licence's seats, who lose their seat when it shrinks (a refund, a renewal with fewer seats, a
 * platform admin's change): staff keep theirs first (org admins, then teachers), then students, then anyone else, by
 * name. Before, a smaller licence still gave Super to every seat already given.
 */
export function seatsToRelease(holders: { id: string; role?: unknown; name?: unknown }[], seats: number): string[] {
  const rank = (r: unknown) => (r === "orgAdmin" ? 0 : r === "teacher" ? 1 : r === "student" ? 2 : 3);
  return [...holders].sort((a, b) => rank(a.role) - rank(b.role) || String(a.name ?? "").localeCompare(String(b.name ?? "")) || a.id.localeCompare(b.id))
    .slice(Math.max(0, Math.floor(num(seats)))).map((h) => h.id);
}
/** Credits for a call that cost Darsi `usd` at the provider, rounded up so a call never costs less than it should. */
// The tiny bit taken off first is floating-point error (0.0051 / 0.002 = 2.5500000000000003), not a discount.
export const creditsForCost = (usd: number, eco: Economics) => Math.max(0, Math.ceil((usd / eco.usdPerCredit) * 100 - 1e-9) / 100);

/** Days a plan period lasts. */
export const periodDays = (p: Pick<Plan, "period">) => (p.period === "year" ? 365 : 30);

/**
 * stripeSub: the Stripe subscription that renews it (source "stripe"), so its owner can cancel the renewal. A
 * cancelled one ("canceled") keeps Super to currentPeriodEnd.
 */
export interface Subscription { plan: string; status: "active" | "canceled" | "expired" | "past_due"; currentPeriodEnd: number; source: "paymob" | "stripe" | "grant"; stripeSub?: string }
export interface Licence { plan: string; seats: number; until: number }
export interface Entitlement { plan: string; until: number; source: "subscription" | "org" }

/** A Stripe subscription that will charge again by itself: a second one would charge twice (sfm-05). */
export const renewsByItself = (s: Subscription | null | undefined, now = Date.now()) =>
  !!s && s.source === "stripe" && (s.status === "active" || s.status === "past_due") && s.currentPeriodEnd > now;
/**
 * The profile's planRenewal, for the Super screen: "on" while a Stripe subscription renews by itself (it offers Cancel
 * renewal), "off" when its renewal was cancelled but it still runs (it offers to turn it back on), null otherwise.
 */
export function renewalOf(s: Subscription | null | undefined, now = Date.now()): "on" | "off" | null {
  if (renewsByItself(s, now)) return "on";
  return s && s.source === "stripe" && s.status === "canceled" && s.stripeSub && s.currentPeriodEnd > now ? "off" : null;
}

/** Whether a token's custom claims already say this, so writing them again can be skipped. */
export function sameClaims(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

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
  /**
   * Stripe: the end of the period the invoice paid for (ms), how long that period is (ms: its lines' start to end, 28
   * to 31 days for a month), and the subscription that renews it.
   */
  until?: number;
  periodMs?: number;
  stripeSub?: string;
}

/** Stripe charges a renewal about an hour after its period starts, and retries a declined card: Super runs on this long. */
export const STRIPE_GRACE_MS = 2 * 864e5;

/** What a verified payment changes (recordPayment writes it in one transaction with the payment itself). */
export type PaymentEffects =
  | { kind: "subscription"; sub: Pick<Subscription, "plan" | "status" | "source" | "currentPeriodEnd" | "stripeSub">; credits: Credits; added: { ms: number; credits: number } }
  | { kind: "credits"; credits: Credits }
  | { kind: "licence"; licence: Licence; before: Licence | null }
  | { kind: "unapplied"; reason: string };

/**
 * A payment's effects on what the buyer has now: `org` null means the organization no longer exists (the payment is
 * then kept as "unapplied" for a platform admin, so the provider's retries stop and nothing is lost silently).
 * - Subscription, Paymob: one period from the end of a live one (or from now). Stripe: to the end of the period its
 *   invoice paid for, plus STRIPE_GRACE_MS, so calendar months and Stripe's own renewal time line up (sfm-07); but
 *   never less than the period it paid for after the end of time already paid, so a card subscription started while
 *   a Paymob or complimentary period runs adds its period after it, and its renewals keep that lead.
 *   A new period of the same Stripe subscription replaces the allowance (unused credits lapse, as documented); any
 *   payment made while a period still runs adds its credits to what is left (sfm-05).
 *   A Paymob period paid while a card subscription still runs is added to it, and the card subscription keeps its
 *   source, status and id: its renewal can still be cancelled, and its own webhooks still find it.
 * - Credits: a pack, added to the packs.
 * - Licence: seat-time (licenceAfterPayment), with the licence as it was, for a refund.
 */
export function paymentEffects(p: PaymentRecord, have: { sub?: Subscription | null; credits?: Credits | null; org?: { licence?: Licence | null } | null }, now = Date.now()): PaymentEffects {
  const period = periodDays(p.plan) * 864e5;
  if (p.kind === "licence") {
    if (!p.orgId || have.org === null || have.org === undefined) return { kind: "unapplied", reason: "org-gone" };
    const before = have.org.licence ?? null;
    return { kind: "licence", licence: licenceAfterPayment(before, p.plan.id, p.seats ?? 1, period, now), before };
  }
  if (!p.uid) return { kind: "unapplied", reason: "no-account" };
  if (p.kind === "credits") return { kind: "credits", credits: addPackCredits(have.credits ?? undefined, p.plan.credits, now) };
  const s = have.sub ?? null;
  const live = !!s && s.status !== "expired" && num(s.currentPeriodEnd) > now;
  const from = live ? num(s!.currentPeriodEnd) : now;
  const paidFor = p.periodMs && p.periodMs > 0 ? p.periodMs : period;
  const end = p.until && p.until > now ? (live ? Math.max(p.until + STRIPE_GRACE_MS, from + paidFor) : p.until + STRIPE_GRACE_MS) : from + period;
  const sameStripe = p.provider === "stripe" && !!p.stripeSub && s?.source === "stripe" && s.stripeSub === p.stripeSub;
  const credits = live && !sameStripe ? extendPlanCredits(have.credits ?? undefined, p.plan.credits, end, now) : grantPlanCredits(have.credits ?? undefined, p.plan.credits, end);
  // A Paymob period on a card subscription that still runs: Stripe's renewal, status and id stay as they are.
  const card = p.provider !== "stripe" && live && s!.source === "stripe" && !!s!.stripeSub;
  return {
    kind: "subscription",
    sub: card
      ? { plan: p.plan.id, status: s!.status, source: "stripe", currentPeriodEnd: end, stripeSub: s!.stripeSub }
      : { plan: p.plan.id, status: "active", source: p.provider, currentPeriodEnd: end, ...(p.stripeSub ? { stripeSub: p.stripeSub } : {}) },
    credits, added: { ms: end - from, credits: p.plan.credits },
  };
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
