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

/* ---------- Paymob ---------- */

/** The fields of a "processed" transaction callback that Paymob signs, in its order (developers.paymob.com, HMAC). */
const PAYMOB_FIELDS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
/** HMAC-SHA512 of the signed fields' values joined with nothing; booleans as true/false. */
export function paymobHmac(obj: unknown, secret: string) {
  const text = PAYMOB_FIELDS.map((f) => { const v = at(obj, f); return v === undefined || v === null ? "" : String(v); }).join("");
  return createHmac("sha512", secret).update(text).digest("hex");
}
export const verifyPaymob = (obj: unknown, hmac: string | undefined, secret: string) => !!hmac && !!secret && same(paymobHmac(obj, secret), hmac.toLowerCase());

/**
 * What a Paymob transaction callback means. `reference` is our checkout id (sent as special_reference, returned as the
 * order's merchant_order_id). A refund or void names the original transaction, whose id is the payment's ref.
 */
export function paymobOutcome(obj: Record<string, unknown>):
  | { type: "paid"; ref: string; reference: string; cents: number; currency: string }
  | { type: "refund"; ref: string }
  | { type: "ignore"; why: string } {
  const id = String(obj.id ?? "");
  const reference = String(at(obj, "order.merchant_order_id") ?? "");
  // Only a full refund or a void ends a payment; a partial refund is left to a platform admin.
  if (obj.is_voided === true) return { type: "refund", ref: id };
  if (obj.is_refunded === true) return Number(obj.refunded_amount_cents ?? obj.amount_cents) >= Number(obj.amount_cents) ? { type: "refund", ref: id } : { type: "ignore", why: "partial refund" };
  if ((obj.is_refund === true || obj.is_void === true) && obj.parent_transaction) return { type: "refund", ref: String(obj.parent_transaction) };
  if (obj.success !== true || obj.pending === true) return { type: "ignore", why: obj.pending === true ? "pending" : "not successful" };
  if (!id || !reference) return { type: "ignore", why: "no transaction or reference" };
  return { type: "paid", ref: id, reference, cents: Number(obj.amount_cents), currency: String(obj.currency ?? "") };
}

/* ---------- Stripe ---------- */

/** Checks a Stripe-Signature header (t=…,v1=…) against the raw body, within `tolerance` seconds. */
export function verifyStripe(raw: Buffer | string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${typeof raw === "string" ? raw : raw.toString("utf8")}`).digest("hex");
  return sigs.some((s) => same(expected, s));
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
