import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkoutAmount, formEncode, fullyRefunded, kindOf, paymobHmac, paymobOutcome, providerFor, stripeSession, verifyPaymob, verifyStripe } from "../src/paymentsCore";

const monthly = { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual" as const, period: "month" as const, prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true };
const seat = { ...monthly, id: "super_seat", kind: "seat" as const, period: "year" as const, prices: { USD: 20, EGP: 600 } };
const pack = { ...monthly, id: "pack_500", kind: "credits" as const, prices: { EGP: 129 }, credits: 500 };

// A "processed" callback's transaction, shaped like Paymob's sample.
const txn = {
  id: 192036465, pending: false, amount_cents: 14900, success: true, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false,
  is_refunded: false, is_3d_secure: true, integration_id: 4097558, has_parent_transaction: false, owner: 302852, error_occured: false,
  created_at: "2026-11-02T11:33:44.592345", currency: "EGP", order: { id: 217503754, merchant_order_id: "chk_abc123" },
  source_data: { pan: "2346", type: "card", sub_type: "MasterCard" },
};

describe("what a checkout charges", () => {
  it("knows the kind and the provider", () => {
    expect([kindOf(monthly), kindOf(seat), kindOf(pack)]).toEqual(["subscription", "licence", "credits"]);
    expect([providerFor("EGP"), providerFor("USD")]).toEqual(["paymob", "stripe"]);
  });
  it("charges the plan's price, a licence per seat, in cents without rounding drift", () => {
    expect(checkoutAmount(monthly, "USD")).toEqual({ amount: 4.99, cents: 499, seats: undefined, unit: 4.99 });
    expect(checkoutAmount(seat, "USD", 30)).toMatchObject({ amount: 600, cents: 60000, seats: 30 });
    expect(checkoutAmount(seat, "EGP", 0).seats).toBe(1);
    expect(checkoutAmount(monthly, "EGP", 50).cents).toBe(14900); // seats only count for licences
    expect(() => checkoutAmount(pack, "USD")).toThrow(/no USD price/);
  });
});

describe("Paymob", () => {
  it("signs the documented fields, in order, joined with nothing", () => {
    const text = "14900" + "2026-11-02T11:33:44.592345" + "EGP" + "false" + "false" + "192036465" + "4097558" + "true" + "false" + "false" + "false" + "true" + "false" + "217503754" + "302852" + "false" + "2346" + "MasterCard" + "card" + "true";
    expect(paymobHmac(txn, "s3cret")).toBe(createHmac("sha512", "s3cret").update(text).digest("hex"));
  });
  it("accepts the right HMAC and refuses a changed amount, a wrong secret or none", () => {
    const h = paymobHmac(txn, "s3cret");
    expect(verifyPaymob(txn, h, "s3cret")).toBe(true);
    expect(verifyPaymob(txn, h.toUpperCase(), "s3cret")).toBe(true);
    expect(verifyPaymob({ ...txn, amount_cents: 100 }, h, "s3cret")).toBe(false);
    expect(verifyPaymob(txn, h, "other")).toBe(false);
    expect(verifyPaymob(txn, undefined, "s3cret")).toBe(false);
    expect(verifyPaymob(txn, h, "")).toBe(false);
  });
  it("reads a payment, a refund, a void and what to ignore", () => {
    expect(paymobOutcome(txn)).toEqual({ type: "paid", ref: "192036465", order: "217503754", reference: "chk_abc123", cents: 14900, currency: "EGP" });
    expect(paymobOutcome({ ...txn, pending: true })).toEqual({ type: "ignore", why: "pending" });
    expect(paymobOutcome({ ...txn, success: false })).toEqual({ type: "ignore", why: "not successful" });
    expect(paymobOutcome({ ...txn, is_refunded: true, refunded_amount_cents: 14900 })).toEqual({ type: "refund", ref: "192036465" });
    expect(paymobOutcome({ ...txn, is_refunded: true, refunded_amount_cents: 5000 })).toEqual({ type: "ignore", why: "partial refund" });
    expect(paymobOutcome({ ...txn, is_voided: true })).toEqual({ type: "refund", ref: "192036465" });
    expect(paymobOutcome({ ...txn, order: {} }).type).toBe("ignore");
  });
  it("matches a payment by the signed order id, never by the unsigned reference alone (M3)", () => {
    // merchant_order_id isn't signed: changing it keeps the HMAC valid, so it can't be what picks the checkout.
    const h = paymobHmac(txn, "s3cret");
    const moved = { ...txn, order: { ...txn.order, merchant_order_id: "someone-elses-checkout" } };
    expect(verifyPaymob(moved, h, "s3cret")).toBe(true);
    expect(paymobOutcome(moved)).toMatchObject({ type: "paid", order: "217503754" });
    // The order id is signed: changing it breaks the HMAC.
    expect(verifyPaymob({ ...txn, order: { ...txn.order, id: 1 } }, h, "s3cret")).toBe(false);
  });
  it("believes a refund that names its original only after asking Paymob (M3)", () => {
    // is_refund and parent_transaction aren't signed: a signed transaction with them added stays "valid".
    const forged = { ...txn, is_refund: true, parent_transaction: 192036400 };
    expect(verifyPaymob(forged, paymobHmac(txn, "s3cret"), "s3cret")).toBe(true);
    expect(paymobOutcome(forged)).toEqual({ type: "checkParent", parent: "192036400" });
    expect(paymobOutcome({ ...txn, is_refund: true })).toEqual({ type: "ignore", why: "refund without its original" });
    expect(fullyRefunded({ id: 1, amount_cents: 14900, is_refunded: true, refunded_amount_cents: 14900 })).toBe(true);
    expect(fullyRefunded({ id: 1, amount_cents: 14900, is_refunded: true, refunded_amount_cents: 100 })).toBe(false);
    expect(fullyRefunded({ id: 1, amount_cents: 14900, is_voided: true })).toBe(true);
    expect(fullyRefunded({ id: 1, amount_cents: 14900, is_refunded: false })).toBe(false);
    expect(fullyRefunded(null)).toBe(false);
  });
});

describe("Stripe", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const sign = (t: number, secret = "whsec_test", raw = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
  it("checks the signature on the raw body, within five minutes", () => {
    const now = 1_800_000_000;
    expect(verifyStripe(body, sign(now), "whsec_test", now)).toBe(true);
    expect(verifyStripe(Buffer.from(body), `${sign(now)},v0=old`, "whsec_test", now + 100)).toBe(true);
    expect(verifyStripe(body, sign(now), "whsec_test", now + 301)).toBe(false);
    expect(verifyStripe(body + " ", sign(now), "whsec_test", now)).toBe(false);
    expect(verifyStripe(body, sign(now, "whsec_other"), "whsec_test", now)).toBe(false);
    expect(verifyStripe(body, undefined, "whsec_test", now)).toBe(false);
    expect(verifyStripe(body, "t=abc,v1=00", "whsec_test", now)).toBe(false);
  });
  it("form-encodes nested fields the way Stripe reads them", () => {
    expect(formEncode({ mode: "payment", metadata: { checkout: "c 1" }, line_items: { 0: { quantity: 2 } }, skip: undefined }))
      .toBe("mode=payment&metadata%5Bcheckout%5D=c%201&line_items%5B0%5D%5Bquantity%5D=2");
  });
  it("makes a renewing session for a person's plan and a one-off for a licence, both carrying the checkout id", () => {
    const sub = stripeSession({ checkout: "chk1", plan: monthly, cents: 499, site: "https://darsiai.org", email: "a@b.c" });
    expect(sub).toMatchObject({ mode: "subscription", client_reference_id: "chk1", subscription_data: { metadata: { checkout: "chk1" } }, customer_email: "a@b.c", success_url: "https://darsiai.org/upgrade?done=chk1" });
    expect(sub.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 499, recurring: { interval: "month" } });
    const lic = stripeSession({ checkout: "chk2", plan: seat, cents: 60000, seats: 30, site: "https://darsiai.org" });
    expect(lic).toMatchObject({ mode: "payment", payment_intent_data: { metadata: { checkout: "chk2" } } });
    expect(lic.line_items[0]).toMatchObject({ quantity: 30, price_data: { unit_amount: 2000 } });
    expect(lic.line_items[0].price_data).not.toHaveProperty("recurring");
  });
});
