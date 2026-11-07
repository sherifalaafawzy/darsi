/**
 * Darsi Super payments (docs/SUPER.md §2, TECHNICAL.md "Darsi Super"): checkouts with Paymob (EGP) and Stripe (USD),
 * and their webhooks. A phone only ever starts a checkout; Super, credits and revenue come from the verified webhooks,
 * through billing.recordPayment / recordRefund.
 *
 * Keys are Secret Manager secrets (firebase functions:secrets:set …); the rest are params (functions/.env):
 * PAYMOB_PUBLIC_KEY, PAYMOB_INTEGRATIONS (comma-separated integration ids), and optionally PAYMOB_BASE, STRIPE_BASE and
 * SITE_URL (the emulator checks point the bases at a local stand-in).
 * A provider whose keys are missing answers "failed-precondition: payments-closed", and the Super screen says
 * payments open soon.
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { caller, db, freshCaller, str } from "./admin.js";
import { recordPayment, recordRefund } from "./billing.js";
import { renewsByItself, type Currency, type PaymentRecord, type Plan, type Subscription } from "./billingCore.js";
import { superOn } from "./settings.js";
import { checkoutAmount, formEncode, fullyRefunded, invoicePeriod, kindOf, paymobOutcome, providerFor, realSecret, stripeSession, stripeSubStatus, verifyPaymob, verifyStripe, type CheckoutKind, type StripeInvoice } from "./paymentsCore.js";

const PAYMOB_SECRET = defineSecret("PAYMOB_SECRET_KEY");
const PAYMOB_HMAC = defineSecret("PAYMOB_HMAC_SECRET");
const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK = defineSecret("STRIPE_WEBHOOK_SECRET");
const PAYMOB_PUBLIC = defineString("PAYMOB_PUBLIC_KEY", { default: "" });
const PAYMOB_INTEGRATIONS = defineString("PAYMOB_INTEGRATIONS", { default: "" });
const PAYMOB_BASE = defineString("PAYMOB_BASE", { default: "https://accept.paymob.com" });
const STRIPE_BASE = defineString("STRIPE_BASE", { default: "https://api.stripe.com" });
const SITE = defineString("SITE_URL", { default: "https://darsiai.org" });
/** Stripe objects are read back in this API version, so the webhooks see one shape whatever the endpoint's version. */
const STRIPE_VERSION = "2024-06-20";
const REGION = "europe-west1";

/** A checkout as Darsi stored it when it started; webhooks trust this, not the amounts they are sent. */
interface Checkout {
  uid: string; orgId: string | null; kind: CheckoutKind; plan: Plan; currency: Currency; amount: number; cents: number;
  seats: number | null; provider: "paymob" | "stripe"; clientId: string | null; status: "open" | "paid" | "refunded";
}
const closed = () => new HttpsError("failed-precondition", "payments-closed");
const real = realSecret;

/* ---------- Starting a checkout ---------- */

/**
 * Starts a checkout for a plan in a currency and returns the provider's page to open. A plan for one person needs an
 * account; a pack needs Super already; seats are bought by an organization's admin for their organization.
 */
export const startCheckout = onCall({ secrets: [PAYMOB_SECRET, STRIPE_SECRET] }, async (req) => {
  const c = await freshCaller(req);
  if (!(await superOn())) throw new HttpsError("failed-precondition", "super-off");
  const plans = ((await db.doc("config/plans").get()).get("plans") as Plan[] | undefined) ?? [];
  const plan = plans.find((p) => p.id === str(req.data?.plan, 32) && p.active);
  if (!plan) throw new HttpsError("not-found", "No such plan.");
  const currency: Currency = req.data?.currency === "USD" ? "USD" : "EGP";
  const kind = kindOf(plan);
  if (kind === "licence" && (c.role !== "orgAdmin" || !c.orgId)) throw new HttpsError("permission-denied", "Only an organization's admins can buy seats.");
  if (kind === "credits" && !(Number(req.auth?.token.planUntil) > Date.now())) throw new HttpsError("failed-precondition", "Credit packs are for people who have Darsi Super.");
  // A Stripe subscription that renews by itself would charge alongside a second one (sfm-05): its owner cancels the
  // renewal first (setRenewal). A Paymob period bought early is added after the current one, credits and all.
  if (kind === "subscription" && renewsByItself((await db.doc(`subscriptions/${c.uid}`).get()).data() as Subscription | undefined)) throw new HttpsError("failed-precondition", "already-subscribed");
  let price;
  try { price = checkoutAmount(plan, currency, Number(req.data?.seats ?? 1)); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  const provider = providerFor(currency);
  const integrations = PAYMOB_INTEGRATIONS.value().split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
  if (provider === "paymob" ? !real(PAYMOB_SECRET.value()) || !real(PAYMOB_PUBLIC.value()) || !integrations.length : !real(STRIPE_SECRET.value())) throw closed();

  const clientId = typeof req.data?.clientId === "string" && /^[a-z0-9.]{8,64}$/.test(req.data.clientId) ? req.data.clientId : null;
  const ref = db.collection("checkouts").doc();
  const checkout: Checkout = { uid: c.uid, orgId: kind === "licence" ? c.orgId! : null, kind, plan, currency, amount: price.amount, cents: price.cents, seats: price.seats ?? null, provider, clientId, status: "open" };
  await ref.set({ ...checkout, createdAt: FieldValue.serverTimestamp() });
  const email = req.auth?.token.email as string | undefined;
  const site = SITE.value().replace(/\/$/, "");
  try {
    if (provider === "paymob") {
      const r = await fetch(`${PAYMOB_BASE.value()}/v1/intention/`, {
        method: "POST", headers: { Authorization: `Token ${PAYMOB_SECRET.value()}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          amount: price.cents, currency: "EGP", payment_methods: integrations,
          items: [{ name: plan.name.en.slice(0, 50), amount: price.cents, quantity: 1 }],
          // Paymob asks for billing details; Darsi sends the account's email and nothing else about the person.
          billing_data: { first_name: "Darsi", last_name: "Learner", email: email ?? "NA", phone_number: "NA" },
          special_reference: ref.id,
          notification_url: `https://${REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/paymobWebhook`,
          redirection_url: `${site}/upgrade?done=${ref.id}`,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { client_secret?: string; id?: string; intention_order_id?: number | string };
      // The order id is what Paymob signs in its callback, so the payment is matched to this checkout through it
      // (paymobOrders/{order}); a checkout without one could never be matched safely.
      const order = String(body.intention_order_id ?? "");
      if (!r.ok || !body.client_secret || !/^\d{1,20}$/.test(order)) throw new Error(`Paymob ${r.status}${order ? "" : " (no order id)"}`);
      await Promise.all([ref.update({ providerId: body.id ?? null, providerOrder: order }), db.doc(`paymobOrders/${order}`).set({ checkout: ref.id })]);
      return { url: `${PAYMOB_BASE.value()}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC.value())}&clientSecret=${encodeURIComponent(body.client_secret)}` };
    }
    const s = await stripe<{ id: string; url: string }>("POST", "checkout/sessions", stripeSession({ checkout: ref.id, plan, cents: price.cents, seats: price.seats, site, email }));
    await ref.update({ providerId: s.id });
    return { url: s.url };
  } catch (e) {
    logger.error("startCheckout failed", { checkout: ref.id, provider, error: String(e) });
    await ref.update({ status: "failed" });
    throw new HttpsError("unavailable", "The payment page could not be opened. Try again in a minute.");
  }
});

/* ---------- Turning a verified payment into Super ---------- */

/**
 * `stripe`: a Stripe invoice's period (its end and length, ms) and its subscription, so Super follows Stripe's own
 * dates (sfm-07) without losing time paid ahead.
 */
async function pay(checkoutId: string, provider: "paymob" | "stripe", ref: string, cents: number, currency: string, stripe: { until?: number; periodMs?: number; stripeSub?: string } = {}) {
  const snap = await db.doc(`checkouts/${checkoutId}`).get();
  const c = snap.data() as Checkout | undefined;
  if (!c || c.provider !== provider) { logger.warn("payment for an unknown checkout", { checkoutId, provider, ref }); return "unknown checkout"; }
  // The amount must be what Darsi asked for (renewals: the plan's price for one period).
  if (cents !== c.cents || currency.toUpperCase() !== c.currency) { logger.error("payment amount differs from the checkout", { checkoutId, ref, cents, currency, want: c.cents }); return "amount differs"; }
  const p: PaymentRecord = { provider, ref, kind: c.kind, uid: c.kind === "licence" ? undefined : c.uid, orgId: c.orgId ?? undefined, plan: c.plan, amount: c.amount, currency: c.currency, seats: c.seats ?? undefined, clientId: c.clientId ?? undefined, checkout: checkoutId,
    ...(c.kind === "subscription" && stripe.until ? { until: stripe.until, ...(stripe.periodMs ? { periodMs: stripe.periodMs } : {}) } : {}), ...(c.kind === "subscription" && stripe.stripeSub ? { stripeSub: stripe.stripeSub } : {}) };
  // recordPayment marks the checkout paid in the same transaction as the payment.
  const r = await recordPayment(p);
  return r.duplicate ? "duplicate" : r.unapplied ? "unapplied" : "recorded";
}

async function refund(provider: "paymob" | "stripe", ref: string) {
  const pay = await db.doc(`payments/${provider}_${ref}`).get();
  if (!pay.exists) return "unknown payment";
  const checkoutId = pay.get("checkout") as string | undefined;
  const c = checkoutId ? ((await db.doc(`checkouts/${checkoutId}`).get()).data() as Checkout | undefined) : undefined;
  if (!c) return "no checkout";
  const r = await recordRefund({ provider, ref, kind: c.kind, uid: c.uid, orgId: c.orgId ?? undefined, plan: c.plan, amount: pay.get("amount"), currency: c.currency, seats: c.seats ?? undefined, clientId: c.clientId ?? undefined });
  return r.changed ? "refunded" : "already";
}

/* ---------- Paymob ---------- */

/** The checkout a Paymob order belongs to (startCheckout wrote paymobOrders/{order}); the unsigned reference must agree. */
async function paymobCheckout(order: string, reference: string): Promise<string | null> {
  const map = await db.doc(`paymobOrders/${order}`).get();
  const id = map.get("checkout") as string | undefined;
  if (!id) return null;
  if (reference && reference !== id) { logger.error("paymob: the order's reference names another checkout", { order, reference, checkout: id }); return null; }
  return id;
}
/** Asks Paymob for a transaction (refunds name their original, unsigned): its own word on whether it was refunded. */
async function paymobTransaction(id: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${PAYMOB_BASE.value()}/api/acceptance/transactions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Token ${PAYMOB_SECRET.value()}` }, signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
}

/** Paymob's "transaction processed" callback, signed with HMAC-SHA512 in ?hmac=. */
export const paymobWebhook = onRequest({ secrets: [PAYMOB_HMAC, PAYMOB_SECRET], maxInstances: 5, memory: "256MiB" }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }
  const obj = (req.body?.obj ?? null) as Record<string, unknown> | null;
  if (!obj || !verifyPaymob(obj, String(req.query.hmac ?? ""), PAYMOB_HMAC.value())) { res.status(401).end(); return; }
  if (req.body?.type && req.body.type !== "TRANSACTION") { res.status(200).send("ignored"); return; }
  const o = paymobOutcome(obj);
  let result: string;
  try {
    if (o.type === "paid") {
      const checkout = await paymobCheckout(o.order, o.reference);
      result = checkout ? await pay(checkout, "paymob", o.ref, o.cents, o.currency) : "unknown order";
    } else if (o.type === "refund") result = await refund("paymob", o.ref);
    else if (o.type === "checkParent") {
      const parent = await paymobTransaction(o.parent);
      result = parent && String(parent.id ?? "") === o.parent && fullyRefunded(parent) ? await refund("paymob", o.parent) : "refund not confirmed by Paymob";
    } else result = o.why;
  } catch (e) {
    // Paymob retries a failed callback; recordPayment and recordRefund make the retry safe.
    logger.error("paymob webhook failed", { type: o.type, error: String(e) });
    res.status(500).send("retry");
    return;
  }
  logger.info("paymob webhook", { type: o.type, result });
  res.status(200).send(result);
});

/* ---------- Stripe ---------- */

async function stripe<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${STRIPE_BASE.value()}/v1/${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${STRIPE_SECRET.value()}`, "Stripe-Version": STRIPE_VERSION, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(body ? { body: formEncode(body) } : {}),
  });
  const json = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw Object.assign(new Error(`Stripe ${r.status}: ${json.error?.message ?? ""}`), { status: r.status });
  return json;
}
interface StripeSub { id: string; status: string; cancel_at_period_end: boolean }

/** The person a Stripe subscription belongs to, and their subscription record if it is still this Stripe subscription. */
async function ownerOf(stripeSubId: string): Promise<{ uid: string; mine: boolean } | null> {
  const map = await db.doc(`stripeSubs/${stripeSubId}`).get();
  const uid = map.exists ? ((await db.doc(`checkouts/${map.get("checkout")}`).get()).get("uid") as string | undefined) : undefined;
  if (!uid) return null;
  // An older subscription's events (cancelled long ago, replaced since by another card subscription, a Paymob period
  // or complimentary days) must not touch the one the person has now. Card subscriptions recorded before the id was
  // kept have none.
  const sub = await db.doc(`subscriptions/${uid}`).get();
  const now = sub.get("stripeSub") as string | undefined;
  return { uid, mine: sub.get("source") === "stripe" && (!now || now === stripeSubId) };
}

/**
 * Cancels (renew false) or restores (renew true) the renewal of the caller's own Stripe subscription (sfm-05): Super
 * runs to the end of what was paid either way, and the Super screen offers both. Works with Darsi Super switched off
 * too, so nobody is ever kept paying. Answers {renewal: "on" | "off", until}.
 */
export const setRenewal = onCall({ secrets: [STRIPE_SECRET] }, async (req) => {
  const c = caller(req);
  const renew = req.data?.renew === true;
  if (!real(STRIPE_SECRET.value())) throw closed();
  const ref = db.doc(`subscriptions/${c.uid}`);
  const sub = (await ref.get()).data() as Subscription | undefined;
  if (!sub || sub.source !== "stripe" || !sub.stripeSub || sub.status === "expired" || !(sub.currentPeriodEnd > Date.now())) throw new HttpsError("failed-precondition", "no-renewal");
  let s: StripeSub;
  try { s = await stripe<StripeSub>("POST", `subscriptions/${encodeURIComponent(sub.stripeSub)}`, { cancel_at_period_end: !renew }); }
  catch (e) {
    logger.error("setRenewal failed", { uid: c.uid, error: String(e) });
    // 4xx: Stripe has already ended it (failed payments, a refund), so there's nothing to renew.
    if (Number((e as { status?: number }).status) >= 400 && Number((e as { status?: number }).status) < 500) throw new HttpsError("failed-precondition", "no-renewal");
    throw new HttpsError("unavailable", "Stripe didn't answer. Try again in a minute.");
  }
  const status = stripeSubStatus(s);
  await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { renewal: status === "canceled" ? "off" : "on", until: sub.currentPeriodEnd };
});

/**
 * Stripe's webhook, signature-checked on the raw body. Invoices and sessions are read back from Stripe in one API
 * version, so their shape never depends on the endpoint's settings.
 */
export const stripeWebhook = onRequest({ secrets: [STRIPE_SECRET, STRIPE_WEBHOOK], maxInstances: 5, memory: "256MiB" }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!verifyStripe(req.rawBody, req.get("stripe-signature"), STRIPE_WEBHOOK.value())) { res.status(400).send("bad signature"); return; }
  const event = JSON.parse(req.rawBody.toString("utf8")) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const o = event.data.object;
  let result = "ignored";
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = await stripe<{ id: string; client_reference_id: string | null; mode: string; payment_status: string; payment_intent: string | null; invoice: string | null; subscription: string | null; amount_total: number; currency: string }>("GET", `checkout/sessions/${o.id}`);
      if (s.payment_status !== "paid" || !s.client_reference_id) result = `not paid (${s.payment_status})`;
      else {
        let ref = s.payment_intent ?? s.id, period: { until?: number; periodMs?: number } = {};
        if (s.mode === "subscription" && s.invoice) {
          const inv = await stripe<StripeInvoice>("GET", `invoices/${s.invoice}`);
          ref = inv.payment_intent ?? inv.id;
          period = invoicePeriod(inv);
          if (s.subscription) await db.doc(`stripeSubs/${s.subscription}`).set({ checkout: s.client_reference_id, at: FieldValue.serverTimestamp() });
        }
        result = await pay(s.client_reference_id, "stripe", ref, s.amount_total, s.currency, { ...period, stripeSub: s.subscription ?? undefined });
      }
    } else if (event.type === "invoice.paid") {
      const inv = await stripe<StripeInvoice>("GET", `invoices/${o.id}`);
      // The first invoice comes with checkout.session.completed; this handles the renewals, to the end of the period
      // the invoice paid for (Stripe bills calendar months: 28 to 31 days).
      if (inv.billing_reason !== "subscription_create" && inv.subscription) {
        const map = await db.doc(`stripeSubs/${inv.subscription}`).get();
        result = map.exists ? await pay(map.get("checkout"), "stripe", inv.payment_intent ?? inv.id, inv.amount_paid, inv.currency, { ...invoicePeriod(inv), stripeSub: inv.subscription }) : "unknown subscription";
      }
    } else if (event.type === "charge.refunded") {
      if (o.refunded === true && typeof o.payment_intent === "string") result = await refund("stripe", o.payment_intent);
      else result = "partial refund";
    } else if (event.type === "customer.subscription.updated") {
      // Renewal cancelled or restored (here or in Stripe), or a card failing: read back from Stripe, so an event that
      // arrives late never undoes a newer change. The period itself only moves with a paid invoice.
      const owner = await ownerOf(String(o.id));
      if (owner?.mine) {
        const s = await stripe<StripeSub>("GET", `subscriptions/${encodeURIComponent(String(o.id))}`);
        await db.doc(`subscriptions/${owner.uid}`).set({ status: stripeSubStatus(s), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        result = stripeSubStatus(s);
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Ended: Super lasts to the end of what was paid (entitlement keeps a cancelled subscription until then), and
      // there is no renewal left to cancel or restore.
      const owner = await ownerOf(String(o.id));
      if (owner?.mine) { await db.doc(`subscriptions/${owner.uid}`).set({ status: "canceled", stripeSub: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); result = "canceled"; }
    }
  } catch (e) {
    // Stripe retries a failed webhook for days; recordPayment makes the retry safe.
    logger.error("stripe webhook failed", { event: event.id, type: event.type, error: String(e) });
    res.status(500).send("retry");
    return;
  }
  logger.info("stripe webhook", { event: event.id, type: event.type, result });
  res.status(200).send(result);
});
