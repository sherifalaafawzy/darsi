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
import { caller, db, str } from "./admin.js";
import { recordPayment, recordRefund } from "./billing.js";
import type { Currency, PaymentRecord, Plan } from "./billingCore.js";
import { superOn } from "./settings.js";
import { checkoutAmount, formEncode, kindOf, paymobOutcome, providerFor, stripeSession, verifyPaymob, verifyStripe, type CheckoutKind } from "./paymentsCore.js";

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
const real = (s: string) => s.trim() !== "" && s.trim() !== "unset";

/* ---------- Starting a checkout ---------- */

/**
 * Starts a checkout for a plan in a currency and returns the provider's page to open. A plan for one person needs an
 * account; a pack needs Super already; seats are bought by an organization's admin for their organization.
 */
export const startCheckout = onCall({ secrets: [PAYMOB_SECRET, STRIPE_SECRET] }, async (req) => {
  const c = caller(req);
  if (!(await superOn())) throw new HttpsError("failed-precondition", "super-off");
  const plans = ((await db.doc("config/plans").get()).get("plans") as Plan[] | undefined) ?? [];
  const plan = plans.find((p) => p.id === str(req.data?.plan, 32) && p.active);
  if (!plan) throw new HttpsError("not-found", "No such plan.");
  const currency: Currency = req.data?.currency === "USD" ? "USD" : "EGP";
  const kind = kindOf(plan);
  if (kind === "licence" && (c.role !== "orgAdmin" || !c.orgId)) throw new HttpsError("permission-denied", "Only an organization's admins can buy seats.");
  if (kind === "credits" && !(Number(req.auth?.token.planUntil) > Date.now())) throw new HttpsError("failed-precondition", "Credit packs are for people who have Darsi Super.");
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
      const body = (await r.json().catch(() => ({}))) as { client_secret?: string; id?: string };
      if (!r.ok || !body.client_secret) throw new Error(`Paymob ${r.status}`);
      await ref.update({ providerId: body.id ?? null });
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

async function pay(checkoutId: string, provider: "paymob" | "stripe", ref: string, cents: number, currency: string) {
  const snap = await db.doc(`checkouts/${checkoutId}`).get();
  const c = snap.data() as Checkout | undefined;
  if (!c || c.provider !== provider) { logger.warn("payment for an unknown checkout", { checkoutId, provider, ref }); return "unknown checkout"; }
  // The amount must be what Darsi asked for (renewals: the plan's price for one period).
  if (cents !== c.cents || currency.toUpperCase() !== c.currency) { logger.error("payment amount differs from the checkout", { checkoutId, ref, cents, currency, want: c.cents }); return "amount differs"; }
  const p: PaymentRecord = { provider, ref, kind: c.kind, uid: c.kind === "licence" ? undefined : c.uid, orgId: c.orgId ?? undefined, plan: c.plan, amount: c.amount, currency: c.currency, seats: c.seats ?? undefined, clientId: c.clientId ?? undefined, checkout: checkoutId };
  const r = await recordPayment(p);
  if (!r.duplicate) await snap.ref.update({ status: "paid", paidAt: FieldValue.serverTimestamp(), [`payments.${ref}`]: true });
  return r.duplicate ? "duplicate" : "recorded";
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

/** Paymob's "transaction processed" callback, signed with HMAC-SHA512 in ?hmac=. */
export const paymobWebhook = onRequest({ secrets: [PAYMOB_HMAC], maxInstances: 5, memory: "256MiB" }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).end(); return; }
  const obj = (req.body?.obj ?? null) as Record<string, unknown> | null;
  if (!obj || !verifyPaymob(obj, String(req.query.hmac ?? ""), PAYMOB_HMAC.value())) { res.status(401).end(); return; }
  if (req.body?.type && req.body.type !== "TRANSACTION") { res.status(200).send("ignored"); return; }
  const o = paymobOutcome(obj);
  const result = o.type === "paid" ? await pay(o.reference, "paymob", o.ref, o.cents, o.currency)
    : o.type === "refund" ? await refund("paymob", o.ref) : o.why;
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
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${json.error?.message ?? ""}`);
  return json;
}
interface StripeInvoice { id: string; subscription: string | null; payment_intent: string | null; billing_reason: string; amount_paid: number; currency: string }

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
        let ref = s.payment_intent ?? s.id;
        if (s.mode === "subscription" && s.invoice) {
          const inv = await stripe<StripeInvoice>("GET", `invoices/${s.invoice}`);
          ref = inv.payment_intent ?? inv.id;
          if (s.subscription) await db.doc(`stripeSubs/${s.subscription}`).set({ checkout: s.client_reference_id, at: FieldValue.serverTimestamp() });
        }
        result = await pay(s.client_reference_id, "stripe", ref, s.amount_total, s.currency);
      }
    } else if (event.type === "invoice.paid") {
      const inv = await stripe<StripeInvoice>("GET", `invoices/${o.id}`);
      // The first invoice comes with checkout.session.completed; this handles the renewals.
      if (inv.billing_reason !== "subscription_create" && inv.subscription) {
        const map = await db.doc(`stripeSubs/${inv.subscription}`).get();
        result = map.exists ? await pay(map.get("checkout"), "stripe", inv.payment_intent ?? inv.id, inv.amount_paid, inv.currency) : "unknown subscription";
      }
    } else if (event.type === "charge.refunded") {
      if (o.refunded === true && typeof o.payment_intent === "string") result = await refund("stripe", o.payment_intent);
      else result = "partial refund";
    } else if (event.type === "customer.subscription.deleted") {
      // Cancelled: Super lasts to the end of what was paid (entitlement keeps a cancelled subscription until then).
      const map = await db.doc(`stripeSubs/${o.id}`).get();
      const uid = map.exists ? ((await db.doc(`checkouts/${map.get("checkout")}`).get()).get("uid") as string | undefined) : undefined;
      if (uid) { await db.doc(`subscriptions/${uid}`).set({ status: "canceled", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); result = "canceled"; }
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
