// The Paymob and Stripe webhooks themselves (src/payments.ts), end to end against the in-memory Firestore: the
// signature gate, one payment per event however often it is sent, money that can't be matched kept for a platform admin
// (audit "paymentUnmatched"), refunds believed only when the provider confirms them, late events of a replaced
// subscription, and a failed write answered 500 so the provider sends it again (TECHNICAL.md).
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import { paymobHmac } from "../src/paymentsCore";

/** The secrets and params the functions read (firebase-functions/params), settable per test. */
const params = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => params.values[name] ?? "" }),
  defineString: (name: string, o?: { default?: string }) => ({ name, value: () => params.values[name] ?? o?.default ?? "" }),
}));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const db = new FakeDb(), audits: Record<string, unknown>[] = [];
  const users = new Map<string, { uid: string; customClaims?: Record<string, unknown> }>();
  // Auth as the Admin SDK answers: a missing account is an error with the code "auth/user-not-found".
  const auth = {
    users,
    getUser: async (uid: string) => { const u = users.get(uid); if (!u) throw Object.assign(new Error("no user record"), { code: "auth/user-not-found" }); return structuredClone(u); },
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => { users.get(uid)!.customClaims = structuredClone(claims); },
    revokeRefreshTokens: async () => {},
  };
  const refuse = async () => { throw new Error("not a callable test"); };
  return {
    db, auth, audits, caller: refuse, freshCaller: refuse, requireSuper: refuse,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { audits.push({ action, by, ...data }); },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/analytics.js", () => ({ gaConfig: async () => ({ mid: "", secret: "" }) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {}, superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({}) }));

const admin = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: { users: Map<string, { uid: string; customClaims?: Record<string, unknown> }> }; audits: Record<string, unknown>[] };
const { db, auth, audits } = admin;
const { paymobWebhook, stripeWebhook } = await import("../src/payments");

/* ---------- A fake request and response, and the providers' own APIs ---------- */

type Res = { code: number; body: unknown; headersSent: boolean; status(c: number): Res; send(b?: unknown): Res; end(): Res };
type Handler = (req: unknown, res: unknown) => unknown;
async function send(handler: unknown, req: { method?: string; body?: unknown; rawBody?: Buffer; query?: Record<string, string>; headers?: Record<string, string> }) {
  const res: Res = { code: 200, body: undefined, headersSent: false, status(c) { res.code = c; return res; }, send(b) { res.body = b; res.headersSent = true; return res; }, end() { res.headersSent = true; return res; } };
  const headers = req.headers ?? {};
  await (handler as Handler)({ method: "POST", query: {}, ...req, headers, get: (h: string) => headers[h.toLowerCase()] }, res);
  return res;
}

/** What Stripe and Paymob answer when the webhooks read an object back, by URL path; every call is kept. */
const provider = { answers: new Map<string, unknown>(), calls: [] as string[] };
const fetchStub = async (url: string | URL) => {
  const path = new URL(String(url)).pathname;
  provider.calls.push(path);
  const body = provider.answers.get(path);
  return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body ?? { error: { message: "No such object" } } };
};

const HMAC = "paymob-hmac-secret", WHSEC = "whsec_test";
const DAY = 864e5;
const monthly = { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual", period: "month", prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true };
const checkout = (o: Record<string, unknown> = {}) => ({ uid: "u1", orgId: null, kind: "subscription", plan: monthly, currency: "EGP", amount: 149, cents: 14900, seats: null, provider: "paymob", clientId: null, status: "open", ...o });
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;
const payments = () => [...db.docs.keys()].filter((k) => k.startsWith("payments/"));

// A "processed" callback's transaction, shaped like Paymob's sample (payments.test.ts).
const txn = (o: Record<string, unknown> = {}) => ({
  id: 192036465, pending: false, amount_cents: 14900, success: true, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false,
  is_refunded: false, is_3d_secure: true, integration_id: 4097558, has_parent_transaction: false, owner: 302852, error_occured: false,
  created_at: "2026-11-02T11:33:44.592345", currency: "EGP", order: { id: 217503754, merchant_order_id: "chk1" },
  source_data: { pan: "2346", type: "card", sub_type: "MasterCard" }, ...o,
});
/** A Paymob callback, signed with `secret` over `signed` (the signed fields), carrying `obj` (unsigned fields may differ). */
const paymob = (obj: Record<string, unknown>, o: { secret?: string; signed?: Record<string, unknown>; hmac?: string | null } = {}) => {
  const hmac = o.hmac === undefined ? paymobHmac(o.signed ?? obj, o.secret ?? HMAC) : o.hmac;
  return send(paymobWebhook, { body: { type: "TRANSACTION", obj }, query: hmac === null ? {} : { hmac } });
};
/** A Stripe event, signed with `secret` on its raw body, now. */
const stripe = (type: string, object: Record<string, unknown>, o: { secret?: string; signature?: string | null; id?: string } = {}) => {
  const raw = Buffer.from(JSON.stringify({ id: o.id ?? "evt_1", type, data: { object } }));
  const t = Math.floor(Date.now() / 1000);
  const signature = o.signature === undefined ? `t=${t},v1=${createHmac("sha256", o.secret ?? WHSEC).update(`${t}.${raw.toString("utf8")}`).digest("hex")}` : o.signature;
  return send(stripeWebhook, { rawBody: raw, headers: signature === null ? {} : { "stripe-signature": signature } });
};
/** A paid subscription session at Stripe, with its first invoice (30 days from now). */
function stripeSession(o: Record<string, unknown> = {}) {
  const start = Math.floor(Date.now() / 1000), end = start + 30 * 86400;
  provider.answers.set("/v1/checkout/sessions/cs_1", { id: "cs_1", client_reference_id: "chk1", mode: "subscription", payment_status: "paid", payment_intent: null, invoice: "in_1", subscription: "sub_1", amount_total: 499, currency: "usd", ...o });
  provider.answers.set("/v1/invoices/in_1", { id: "in_1", subscription: "sub_1", payment_intent: "pi_1", billing_reason: "subscription_create", amount_paid: 499, currency: "usd", lines: { data: [{ period: { start, end } }] } });
  return end * 1000;
}

beforeEach(() => {
  db.docs.clear(); db.writes = []; db.failOn = null; auth.users.clear(); audits.length = 0;
  provider.answers.clear(); provider.calls.length = 0;
  params.values = { PAYMOB_HMAC_SECRET: HMAC, PAYMOB_SECRET_KEY: "paymob-secret", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: WHSEC };
  vi.stubGlobal("fetch", fetchStub);
  db.docs.set("users/u1", { role: "learner" });
  auth.users.set("u1", { uid: "u1", customClaims: { role: "learner" } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the signature gate", () => {
  it("Paymob: a wrong or missing HMAC, or the placeholder secret, answers 401 and writes nothing", async () => {
    db.docs.set("checkouts/chk1", checkout());
    db.docs.set("paymobOrders/217503754", { checkout: "chk1" });
    db.writes = [];
    expect((await paymob(txn(), { secret: "someone-elses" })).code).toBe(401);
    expect((await paymob(txn(), { hmac: null })).code).toBe(401);
    expect((await paymob(txn(), { hmac: "" })).code).toBe(401);
    // Signed for another amount: the HMAC no longer fits what was sent.
    expect((await paymob(txn({ amount_cents: 100 }), { signed: txn() })).code).toBe(401);
    // Payments closed: every payment secret is the public word "unset", which must never pass as a signing key.
    params.values.PAYMOB_HMAC_SECRET = "unset";
    expect((await paymob(txn(), { secret: "unset" })).code).toBe(401);
    params.values.PAYMOB_HMAC_SECRET = "";
    expect((await paymob(txn(), { secret: "" })).code).toBe(401);
    expect((await send(paymobWebhook, { body: {}, query: { hmac: "00" } })).code).toBe(401);
    expect((await send(paymobWebhook, { method: "GET" })).code).toBe(405);
    expect(db.writes).toEqual([]);
    expect(audits).toEqual([]);
    expect(provider.calls).toEqual([]);
    expect(doc("checkouts/chk1")!.status).toBe("open");
  });
  it("Stripe: a wrong or missing signature, or the placeholder secret, answers 400 and writes nothing", async () => {
    db.docs.set("checkouts/chk1", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499 }));
    stripeSession();
    db.writes = [];
    expect((await stripe("checkout.session.completed", { id: "cs_1" }, { secret: "whsec_other" })).code).toBe(400);
    expect((await stripe("checkout.session.completed", { id: "cs_1" }, { signature: null })).code).toBe(400);
    expect((await stripe("checkout.session.completed", { id: "cs_1" }, { signature: "t=1,v1=00" })).code).toBe(400);
    params.values.STRIPE_WEBHOOK_SECRET = "unset";
    expect((await stripe("checkout.session.completed", { id: "cs_1" }, { secret: "unset" })).code).toBe(400);
    expect((await send(stripeWebhook, { method: "GET" })).code).toBe(405);
    expect(db.writes).toEqual([]);
    expect(audits).toEqual([]);
    expect(provider.calls).toEqual([]); // nothing was even read back from Stripe
  });
});

describe("a verified payment", () => {
  it("Stripe: checkout.session.completed records one payment, and the same event twice still one", async () => {
    db.docs.set("checkouts/chk1", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499 }));
    const until = stripeSession();
    const first = await stripe("checkout.session.completed", { id: "cs_1" });
    expect([first.code, first.body]).toEqual([200, "recorded"]);
    expect(payments()).toEqual(["payments/stripe_pi_1"]);
    expect(doc("payments/stripe_pi_1")).toMatchObject({ status: "paid", kind: "subscription", uid: "u1", amount: 4.99, currency: "USD", checkout: "chk1" });
    expect(doc("subscriptions/u1")).toMatchObject({ status: "active", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: until + 2 * DAY });
    expect(doc("credits/u1")).toMatchObject({ plan: 300, packs: 0 });
    expect(doc("checkouts/chk1")).toMatchObject({ status: "paid", payments: { pi_1: true } });
    expect(doc("stripeSubs/sub_1")).toMatchObject({ checkout: "chk1" });
    // The buyer's claims came with the payment itself, without waiting for the subscription trigger.
    expect(auth.users.get("u1")!.customClaims).toMatchObject({ role: "learner", plan: "super_monthly", planUntil: until + 2 * DAY });
    // Stripe sends an event again whenever it isn't sure we got it.
    db.docs.set("credits/u1", { ...doc("credits/u1"), plan: 120 });
    const again = await stripe("checkout.session.completed", { id: "cs_1" });
    expect([again.code, again.body]).toEqual([200, "duplicate"]);
    expect(payments()).toEqual(["payments/stripe_pi_1"]);
    expect(doc("credits/u1")!.plan).toBe(120);
    expect(doc("subscriptions/u1")!.currentPeriodEnd).toBe(until + 2 * DAY);
    expect(audits).toEqual([]);
  });
  it("Stripe: a session that isn't paid yet gives nothing", async () => {
    db.docs.set("checkouts/chk1", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499 }));
    stripeSession({ payment_status: "unpaid" });
    expect((await stripe("checkout.session.completed", { id: "cs_1" })).body).toBe("not paid (unpaid)");
    expect(payments()).toEqual([]);
    expect(doc("subscriptions/u1")).toBeUndefined();
  });
  it("Paymob: a signed payment is matched through its order and recorded once", async () => {
    db.docs.set("checkouts/chk1", checkout());
    db.docs.set("paymobOrders/217503754", { checkout: "chk1" });
    expect((await paymob(txn())).body).toBe("recorded");
    expect((await paymob(txn())).body).toBe("duplicate");
    expect(payments()).toEqual(["payments/paymob_192036465"]);
    expect(doc("subscriptions/u1")).toMatchObject({ status: "active", source: "paymob" });
    expect(doc("credits/u1")!.plan).toBe(300);
  });
});

describe("paid at the provider, not applied here: kept for a platform admin", () => {
  it("a Paymob payment naming another checkout is refused, answered 200 and audited as unmatched", async () => {
    db.docs.set("checkouts/chk1", checkout());
    db.docs.set("checkouts/chk2", checkout({ uid: "u2" }));
    db.docs.set("paymobOrders/217503754", { checkout: "chk1" });
    // merchant_order_id isn't signed: the callback keeps a valid HMAC with it changed (M3).
    const moved = txn({ order: { id: 217503754, merchant_order_id: "chk2" } });
    const r = await paymob(moved);
    expect([r.code, r.body]).toEqual([200, "unknown order"]);
    expect(payments()).toEqual([]);
    expect(doc("subscriptions/u1")).toBeUndefined();
    expect(doc("subscriptions/u2")).toBeUndefined();
    expect([doc("checkouts/chk1")!.status, doc("checkouts/chk2")!.status]).toEqual(["open", "open"]);
    expect(audits).toEqual([{ action: "paymentUnmatched", by: "webhook", provider: "paymob", ref: "192036465", checkout: "chk2", why: "unknown order", cents: 14900, currency: "EGP" }]);
    // The same callback sent again and again leaves one entry, not a full audit log.
    await paymob(moved); await paymob(moved);
    expect(audits.length).toBe(1);
  });
  it("a Paymob order Darsi never started is audited too", async () => {
    const r = await paymob(txn({ id: 501, order: { id: 999, merchant_order_id: "chk1" } }));
    expect([r.code, r.body]).toEqual([200, "unknown order"]);
    expect(audits).toEqual([expect.objectContaining({ action: "paymentUnmatched", provider: "paymob", ref: "501", why: "unknown order" })]);
    expect(payments()).toEqual([]);
  });
  it("an amount that differs from the checkout gives nothing and is audited with what was paid", async () => {
    db.docs.set("checkouts/chk1", checkout());
    db.docs.set("paymobOrders/217503754", { checkout: "chk1" });
    const r = await paymob(txn({ id: 502, amount_cents: 100 }));
    expect([r.code, r.body]).toEqual([200, "amount differs"]);
    expect(payments()).toEqual([]);
    expect(doc("subscriptions/u1")).toBeUndefined();
    expect(doc("checkouts/chk1")!.status).toBe("open");
    expect(audits).toEqual([{ action: "paymentUnmatched", by: "webhook", provider: "paymob", ref: "502", checkout: "chk1", why: "amount differs", cents: 100, currency: "EGP" }]);
    // Another currency for the same number is not the same amount either.
    expect((await paymob(txn({ id: 503, currency: "USD" }))).body).toBe("amount differs");
    expect(audits.at(-1)).toMatchObject({ ref: "503", why: "amount differs", currency: "USD" });
  });
  it("a Stripe session for a checkout Darsi doesn't have, or another provider's, is audited as an unknown checkout", async () => {
    stripeSession({ client_reference_id: "nope" });
    const r = await stripe("checkout.session.completed", { id: "cs_1" });
    expect([r.code, r.body]).toEqual([200, "unknown checkout"]);
    expect(audits).toEqual([{ action: "paymentUnmatched", by: "webhook", provider: "stripe", ref: "pi_1", checkout: "nope", why: "unknown checkout", cents: 499, currency: "USD" }]);
    // A Paymob checkout can't be paid through Stripe.
    db.docs.set("checkouts/chk1", checkout());
    stripeSession({ invoice: null, mode: "payment", subscription: null, payment_intent: "pi_2" });
    expect((await stripe("checkout.session.completed", { id: "cs_1" }, { id: "evt_2" })).body).toBe("unknown checkout");
    expect(audits.at(-1)).toMatchObject({ ref: "pi_2", checkout: "chk1", why: "unknown checkout" });
    expect(payments()).toEqual([]);
    expect(doc("checkouts/chk1")!.status).toBe("open");
  });
  it("a renewal of a Stripe subscription Darsi doesn't know is audited as an unknown subscription", async () => {
    provider.answers.set("/v1/invoices/in_9", { id: "in_9", subscription: "sub_unknown", payment_intent: "pi_9", billing_reason: "subscription_cycle", amount_paid: 499, currency: "usd" });
    const r = await stripe("invoice.paid", { id: "in_9" });
    expect([r.code, r.body]).toEqual([200, "unknown subscription"]);
    expect(audits).toEqual([{ action: "paymentUnmatched", by: "webhook", provider: "stripe", ref: "pi_9", checkout: null, why: "unknown subscription", cents: 499, currency: "USD" }]);
    expect(payments()).toEqual([]);
  });
});

describe("refunds", () => {
  const paid = async () => {
    db.docs.set("checkouts/chk1", checkout());
    db.docs.set("paymobOrders/217503754", { checkout: "chk1" });
    expect((await paymob(txn())).body).toBe("recorded");
  };
  it("a refund that only names its original is not applied until Paymob itself confirms it", async () => {
    await paid();
    // is_refund and parent_transaction aren't signed: anyone holding one signed callback could add them (M3).
    const forged = txn({ id: 192036465, is_refund: true, parent_transaction: 192036465 });
    // Paymob says the original was not refunded.
    provider.answers.set("/api/acceptance/transactions/192036465", { id: 192036465, amount_cents: 14900, is_refunded: false });
    let r = await paymob(forged, { signed: txn() });
    expect([r.code, r.body]).toEqual([200, "refund not confirmed by Paymob"]);
    expect(provider.calls).toEqual(["/api/acceptance/transactions/192036465"]);
    // Paymob doesn't answer, or answers about another transaction: still not believed.
    provider.answers.clear();
    expect((await paymob(forged, { signed: txn() })).body).toBe("refund not confirmed by Paymob");
    provider.answers.set("/api/acceptance/transactions/192036465", { id: 7, amount_cents: 14900, is_refunded: true, refunded_amount_cents: 14900 });
    expect((await paymob(forged, { signed: txn() })).body).toBe("refund not confirmed by Paymob");
    // A partial refund is left to a platform admin.
    provider.answers.set("/api/acceptance/transactions/192036465", { id: 192036465, amount_cents: 14900, is_refunded: true, refunded_amount_cents: 5000 });
    expect((await paymob(forged, { signed: txn() })).body).toBe("refund not confirmed by Paymob");
    expect(doc("payments/paymob_192036465")!.status).toBe("paid");
    expect(doc("subscriptions/u1")!.status).toBe("active");
    expect(auth.users.get("u1")!.customClaims).toMatchObject({ plan: "super_monthly" });
    // Confirmed in full: taken back once, the buyer's claims with it.
    provider.answers.set("/api/acceptance/transactions/192036465", { id: 192036465, amount_cents: 14900, is_refunded: true, refunded_amount_cents: 14900 });
    r = await paymob(forged, { signed: txn() });
    expect(r.body).toBe("refunded");
    expect(doc("payments/paymob_192036465")!.status).toBe("refunded");
    expect(doc("subscriptions/u1")!.status).toBe("expired");
    expect(auth.users.get("u1")!.customClaims).toEqual({ role: "learner" });
    expect((await paymob(forged, { signed: txn() })).body).toBe("already");
  });
  it("a refund of a payment Darsi never recorded changes nothing", async () => {
    const r = await paymob(txn({ is_refunded: true, refunded_amount_cents: 14900 }));
    expect([r.code, r.body]).toEqual([200, "unknown payment"]);
    expect(db.writes).toEqual([]);
  });
});

describe("late events of a Stripe subscription that was replaced", () => {
  it("change nothing on the subscription the person has now", async () => {
    db.docs.set("checkouts/chkOld", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499, status: "paid" }));
    db.docs.set("stripeSubs/sub_old", { checkout: "chkOld" });
    const now = { plan: "super_monthly", status: "active", source: "stripe", stripeSub: "sub_new", currentPeriodEnd: Date.now() + 20 * DAY };
    db.docs.set("subscriptions/u1", now);
    provider.answers.set("/v1/subscriptions/sub_old", { id: "sub_old", status: "canceled", cancel_at_period_end: false });
    db.writes = [];
    for (const type of ["customer.subscription.updated", "customer.subscription.deleted"]) {
      const r = await stripe(type, { id: "sub_old" }, { id: `evt_${type}` });
      expect([r.code, r.body]).toEqual([200, "ignored"]);
    }
    expect(doc("subscriptions/u1")).toEqual(now);
    expect(db.writes).toEqual([]);
    expect(provider.calls).toEqual([]); // not even read back: it isn't theirs any more
    // The same for a Paymob period or complimentary days that replaced the card subscription.
    db.docs.set("subscriptions/u1", { ...now, source: "paymob", stripeSub: undefined });
    expect((await stripe("customer.subscription.deleted", { id: "sub_old" })).body).toBe("ignored");
    expect(doc("subscriptions/u1")!.status).toBe("active");
    // And an event for a subscription Darsi has no record of.
    expect((await stripe("customer.subscription.updated", { id: "sub_nobody" })).body).toBe("ignored");
    // While the subscription that IS theirs follows Stripe: a cancelled renewal shows as cancelled.
    db.docs.set("stripeSubs/sub_new", { checkout: "chkOld" });
    db.docs.set("subscriptions/u1", now);
    provider.answers.set("/v1/subscriptions/sub_new", { id: "sub_new", status: "active", cancel_at_period_end: true });
    expect((await stripe("customer.subscription.updated", { id: "sub_new" })).body).toBe("canceled");
    expect(doc("subscriptions/u1")).toMatchObject({ status: "canceled", stripeSub: "sub_new", currentPeriodEnd: now.currentPeriodEnd });
  });
});

describe("a write that fails", () => {
  it("answers 500 so the provider sends the event again, and the repeat is applied in full", async () => {
    db.docs.set("checkouts/chk1", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499 }));
    stripeSession();
    db.failOn = (w) => w.path === "credits/u1";
    const failed = await stripe("checkout.session.completed", { id: "cs_1" });
    expect([failed.code, failed.body]).toEqual([500, "retry"]);
    expect(payments()).toEqual([]);
    expect(doc("subscriptions/u1")).toBeUndefined();
    expect(doc("checkouts/chk1")!.status).toBe("open");
    const again = await stripe("checkout.session.completed", { id: "cs_1" });
    expect([again.code, again.body]).toEqual([200, "recorded"]);
    expect(doc("credits/u1")!.plan).toBe(300);
    // Paymob the same.
    db.docs.set("checkouts/chk2", checkout({ uid: "u2" }));
    db.docs.set("paymobOrders/217503754", { checkout: "chk2" });
    db.failOn = (w) => w.path.startsWith("payments/");
    const p = await paymob(txn({ order: { id: 217503754, merchant_order_id: "chk2" } }));
    expect([p.code, p.body]).toEqual([500, "retry"]);
    expect(doc("subscriptions/u2")).toBeUndefined();
    expect((await paymob(txn({ order: { id: 217503754, merchant_order_id: "chk2" } }))).body).toBe("recorded");
    expect(doc("subscriptions/u2")).toMatchObject({ status: "active", source: "paymob" });
  });
  it("Stripe not answering when an object is read back is a 500 too, with nothing written", async () => {
    db.docs.set("checkouts/chk1", checkout({ provider: "stripe", currency: "USD", amount: 4.99, cents: 499 }));
    db.writes = [];
    const r = await stripe("checkout.session.completed", { id: "cs_1" }); // no answer set: Stripe says 404
    expect([r.code, r.body]).toEqual([500, "retry"]);
    expect(db.writes).toEqual([]);
  });
});
