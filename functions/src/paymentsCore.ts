/**
 * Paymob and Stripe without Firebase (docs/SUPER.md §2, TECHNICAL.md "Darsi Super"), so the tests can run it: what a
 * checkout charges, the providers' webhook signatures, and what a webhook means for Darsi.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Currency, Plan } from "./billingCore.js";

/** What a checkout buys: the period of a plan, a pack of credits, or an organization's seats for a year. */
export type CheckoutKind = "subscription" | "credits" | "licence";
export const kindOf = (p: Pick<Plan, "kind">): CheckoutKind => (p.kind === "seat" ? "licence" : p.kind === "credits" ? "credits" : "subscription");
/** EGP goes through Paymob (cards, Meeza, wallets), USD through Stripe. */
export const providerFor = (c: Currency) => (c === "EGP" ? "paymob" : "stripe");

/** The amount a checkout charges, in the currency's main unit and in cents; a licence is priced per seat. */
export function checkoutAmount(plan: Plan, currency: Currency, seats = 1) {
  const unit = plan.prices[currency];
  if (!unit) throw new Error(`This plan has no ${currency} price.`);
  const n = plan.kind === "seat" ? Math.max(1, Math.min(10000, Math.round(seats))) : 1;
  const cents = Math.round(unit * 100) * n;
  return { amount: cents / 100, cents, seats: plan.kind === "seat" ? n : undefined, unit };
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};
/**
 * A secret that was really set: the deploy creates every payment secret as the placeholder "unset" (payments closed),
 * and a webhook signed with that public word must not pass as signed (sec-live-3).
 */
export const realSecret = (s: string | undefined) => !!s && s.trim() !== "" && s.trim() !== "unset";

/* ---------- Paymob ---------- */

/** The fields of a "processed" transaction callback that Paymob signs, in its order (developers.paymob.com, HMAC). */
const PAYMOB_FIELDS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
/** HMAC-SHA512 of the signed fields' values joined with nothing; booleans as true/false. */
export function paymobHmac(obj: unknown, secret: string) {
  const text = PAYMOB_FIELDS.map((f) => { const v = at(obj, f); return v === undefined || v === null ? "" : String(v); }).join("");
  return createHmac("sha512", secret).update(text).digest("hex");
}
export const verifyPaymob = (obj: unknown, hmac: string | undefined, secret: string) => !!hmac && realSecret(secret) && same(paymobHmac(obj, secret), hmac.toLowerCase());

/**
 * What a Paymob transaction callback means, from its signed fields only (PAYMOB_FIELDS; M3 in the security review).
 * `order` is Paymob's order id (signed): startCheckout stored which checkout that order belongs to, so the payment is
 * matched through it. `reference` (our checkout id, sent as special_reference and returned as the order's
 * merchant_order_id) is not signed: it is only checked against that match, never trusted on its own.
 * A refund or void is acted on when the transaction itself says so (is_refunded, is_voided: signed). A separate refund
 * transaction names its original in `parent_transaction`, which is not signed: it is only a lead, and the webhook asks
 * Paymob for that transaction before it believes it was refunded.
 */
export function paymobOutcome(obj: Record<string, unknown>):
  | { type: "paid"; ref: string; order: string; reference: string; cents: number; currency: string }
  | { type: "refund"; ref: string }
  | { type: "checkParent"; parent: string }
  | { type: "ignore"; why: string } {
  const id = String(obj.id ?? "");
  const order = String(at(obj, "order.id") ?? "");
  const reference = String(at(obj, "order.merchant_order_id") ?? "");
  // Only a full refund or a void ends a payment; a partial refund is left to a platform admin.
  if (obj.is_voided === true) return id ? { type: "refund", ref: id } : { type: "ignore", why: "no transaction" };
  if (obj.is_refunded === true) return !id ? { type: "ignore", why: "no transaction" } : Number(obj.refunded_amount_cents ?? obj.amount_cents) >= Number(obj.amount_cents) ? { type: "refund", ref: id } : { type: "ignore", why: "partial refund" };
  if ((obj.is_refund === true || obj.is_void === true) && /^\d{1,20}$/.test(String(obj.parent_transaction ?? ""))) return { type: "checkParent", parent: String(obj.parent_transaction) };
  if (obj.is_refund === true || obj.is_void === true) return { type: "ignore", why: "refund without its original" };
  if (obj.success !== true || obj.pending === true) return { type: "ignore", why: obj.pending === true ? "pending" : "not successful" };
  if (!id || !order) return { type: "ignore", why: "no transaction or order" };
  return { type: "paid", ref: id, order, reference, cents: Number(obj.amount_cents), currency: String(obj.currency ?? "") };
}

/** A transaction as Paymob returns it when asked (GET /api/acceptance/transactions/{id}): refunded or voided in full? */
export function fullyRefunded(t: Record<string, unknown> | null | undefined) {
  if (!t) return false;
  if (t.is_voided === true) return true;
  return t.is_refunded === true && Number(t.refunded_amount_cents ?? t.amount_cents) >= Number(t.amount_cents);
}

/* ---------- Stripe ---------- */

/** Checks a Stripe-Signature header (t=…,v1=…) against the raw body, within `tolerance` seconds. */
export function verifyStripe(raw: Buffer | string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !realSecret(secret)) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${typeof raw === "string" ? raw : raw.toString("utf8")}`).digest("hex");
  return sigs.some((s) => same(expected, s));
}

/** An invoice as Darsi reads it back (API version 2024-06-20): its lines carry the period each one pays for. */
export interface StripeInvoice {
  id: string; subscription: string | null; payment_intent: string | null; billing_reason: string; amount_paid: number; currency: string;
  lines?: { data?: { period?: { start?: number; end?: number } }[] };
}
/**
 * The end (ms) of the service period a subscription invoice paid for: its lines' period, not the invoice's own
 * period_end (for a renewal, that is when the period before it ended). Undefined when the invoice doesn't say.
 */
export function invoicePeriodEnd(inv: Pick<StripeInvoice, "lines">): number | undefined {
  return invoicePeriod(inv).until;
}
/**
 * The service period a subscription invoice paid for, from the line that ends last: its end (ms) and its length (ms;
 * 28 to 31 days for a calendar month), so a period paid ahead of time is added in full (billingCore.paymentEffects).
 */
export function invoicePeriod(inv: Pick<StripeInvoice, "lines">): { until?: number; periodMs?: number } {
  const lines = (inv.lines?.data ?? []).map((l) => ({ start: Number(l.period?.start) || 0, end: Number(l.period?.end) || 0 })).filter((l) => l.end > 0);
  if (!lines.length) return {};
  const last = lines.reduce((a, b) => (b.end > a.end ? b : a));
  const ms = last.start > 0 && last.end > last.start ? (last.end - last.start) * 1000 : undefined;
  return { until: last.end * 1000, ...(ms ? { periodMs: ms } : {}) };
}
/** A Stripe subscription's state in Darsi's terms: a renewal cancelled (or the subscription ended) is "canceled". */
export function stripeSubStatus(s: { status?: string; cancel_at_period_end?: boolean }): "active" | "canceled" | "past_due" {
  if (s.cancel_at_period_end === true || s.status === "canceled" || s.status === "incomplete_expired") return "canceled";
  return s.status === "past_due" || s.status === "unpaid" ? "past_due" : "active";
}

/** Stripe's form encoding, with nested keys (metadata[checkout]=…, line_items[0][price_data][currency]=…). */
export function formEncode(o: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") { const s = formEncode(v as Record<string, unknown>, key); if (s) out.push(s); }
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

/**
 * The Checkout Session for a plan: a plan for one person renews itself (a subscription), a pack or a licence is paid
 * once. The session carries our checkout id both ways, so every webhook finds the checkout without trusting its amounts.
 */
export function stripeSession(o: { checkout: string; plan: Plan; cents: number; seats?: number; site: string; email?: string }) {
  const kind = kindOf(o.plan);
  const qty = kind === "licence" ? o.seats ?? 1 : 1;
  const price: Record<string, unknown> = { currency: "usd", unit_amount: Math.round(o.cents / qty), product_data: { name: o.plan.name.en } };
  if (kind === "subscription") price.recurring = { interval: o.plan.period };
  return {
    mode: kind === "subscription" ? "subscription" : "payment",
    client_reference_id: o.checkout,
    metadata: { checkout: o.checkout },
    ...(kind === "subscription" ? { subscription_data: { metadata: { checkout: o.checkout } } } : { payment_intent_data: { metadata: { checkout: o.checkout } } }),
    line_items: { 0: { quantity: qty, price_data: price } },
    ...(o.email ? { customer_email: o.email } : {}),
    success_url: `${o.site}/upgrade?done=${o.checkout}`,
    cancel_url: `${o.site}/upgrade?from=cancel`,
  };
}
