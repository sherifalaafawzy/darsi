import { describe, expect, it } from "vitest";
import { addPackCredits, afterRefund, claimsFor, creditsForCost, creditsLeft, entitlement, extendPlanCredits, gaUserId, grantPlanCredits, holdCredits, licenceAfterPayment, margin, paymentEffects, periodDays, PlanError, renewalOf, renewsByItself, revenueEvent, revokeEffects, sameClaims, seatsToRelease, settleCredits, spendCredits, STRIPE_GRACE_MS, superStats, validateEconomics, validatePlans, type Credits, type PaymentRecord } from "../src/billingCore";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 864e5;
const monthly = { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual" as const, period: "month" as const, prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true };
// One credit costs Darsi $0.002 at the provider; 50 EGP to the dollar.
const ECO = { usdPerCredit: 0.002, egpPerUsd: 50 };

describe("validatePlans", () => {
  it("keeps a good plan, rounding prices", () => {
    expect(validatePlans([{ ...monthly, prices: { EGP: "149.004", USD: 4.99 } }], ECO)).toEqual([{ ...monthly, prices: { EGP: 149, USD: 4.99 } }]);
  });
  it("refuses bad ids, missing names, no price, repeats and bad numbers", () => {
    expect(() => validatePlans([{ ...monthly, id: "Super!" }], ECO)).toThrow(/id/);
    expect(() => validatePlans([{ ...monthly, name: { en: "x", ar: "" } }], ECO)).toThrow(/Arabic/);
    expect(() => validatePlans([{ ...monthly, prices: {} }], ECO)).toThrow(/price/);
    expect(() => validatePlans([{ ...monthly, prices: { EGP: -5 } }], ECO)).toThrow(/positive/);
    expect(() => validatePlans([monthly, monthly], ECO)).toThrow(/twice/);
    expect(() => validatePlans([{ ...monthly, credits: 500000 }], ECO)).toThrow(/0–100000/);
    expect(() => validatePlans("nope", ECO)).toThrow();
  });
  it("refuses a price that leaves under 60% margin after its credits' cost", () => {
    // 300 credits cost $0.60; at 149 EGP ($2.98) that is an 80% margin, at $1.20 only 50%.
    expect(margin(monthly, "EGP", ECO)).toBeCloseTo(0.799, 3);
    expect(() => validatePlans([{ ...monthly, prices: { EGP: 149, USD: 1.2 } }], ECO)).toThrow(/USD price leaves a 50% margin/);
    expect(() => validatePlans([{ ...monthly, credits: 1200 }], ECO)).toThrow(/at least 60%/);
    expect(validatePlans([{ ...monthly, id: "pack_500", kind: "credits", credits: 500, prices: { EGP: 129 } }], ECO)[0].kind).toBe("credits");
    expect(() => validatePlans([{ ...monthly, kind: "credits", credits: 0 }], ECO)).toThrow(/needs credits/);
  });
  it("says why with a reason code and its numbers, so the Plans page can word it in the admin's language", () => {
    const why = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof PlanError ? { reason: e.reason, ...e.vars } : String(e); } return null; };
    // The walkthrough's refusal: a -2900% margin, shown in English on the Arabic page.
    expect(why(() => validatePlans([{ ...monthly, id: "super_monthly", prices: { EGP: 5 } }], ECO))).toEqual({ reason: "plan-margin", id: "super_monthly", cur: "EGP", margin: -5, min: 0.6 });
    expect(why(() => validatePlans([{ ...monthly, prices: { EGP: 149, USD: 1.2 } }], ECO))).toEqual({ reason: "plan-margin", id: "super_monthly", cur: "USD", margin: 0.5, min: 0.6 });
    expect(why(() => validatePlans([{ ...monthly, id: "Super!" }], ECO))).toEqual({ reason: "plan-id", n: 1 });
    expect(why(() => validatePlans([monthly, monthly], ECO))).toEqual({ reason: "plan-twice", n: 2, id: "super_monthly" });
    expect(why(() => validatePlans([{ ...monthly, name: { en: "x", ar: "" } }], ECO))).toEqual({ reason: "plan-name", id: "super_monthly" });
    expect(why(() => validatePlans([{ ...monthly, prices: { USD: -5 } }], ECO))).toEqual({ reason: "plan-price", id: "super_monthly", cur: "USD" });
    expect(why(() => validatePlans([{ ...monthly, prices: {} }], ECO))).toEqual({ reason: "plan-no-price", id: "super_monthly" });
    expect(why(() => validatePlans([{ ...monthly, credits: 500000 }], ECO))).toEqual({ reason: "plan-credits", id: "super_monthly", max: 100000 });
    expect(why(() => validatePlans([{ ...monthly, kind: "credits", credits: 0 }], ECO))).toEqual({ reason: "pack-credits", id: "super_monthly" });
    expect(why(() => validatePlans("nope", ECO))).toEqual({ reason: "plans-count", max: 20 });
    expect(why(() => validateEconomics({ usdPerCredit: 0, egpPerUsd: 50 }))).toEqual({ reason: "eco-cost", max: 10 });
    expect(why(() => validateEconomics({ usdPerCredit: 0.002, egpPerUsd: 0.5 }))).toEqual({ reason: "eco-rate", min: 1, max: 1000 });
  });
  it("checks the cost and the exchange rate", () => {
    expect(validateEconomics({ usdPerCredit: "0.002", egpPerUsd: 50 })).toEqual(ECO);
    expect(() => validateEconomics({ usdPerCredit: 0, egpPerUsd: 50 })).toThrow(/credit/);
    expect(() => validateEconomics({ usdPerCredit: 0.002, egpPerUsd: 0.5 })).toThrow(/EGP/);
  });
  it("knows how long a period lasts", () => { expect([periodDays({ period: "month" }), periodDays({ period: "year" })]).toEqual([30, 365]); });
});

describe("entitlement", () => {
  const sub = (until: number, status: "active" | "canceled" | "expired" = "active") => ({ plan: "super_monthly", status, currentPeriodEnd: until, source: "stripe" as const });
  const licence = (until: number) => ({ plan: "super_seat", seats: 10, until });
  it("comes from a paid (or cancelled but unexpired) subscription", () => {
    expect(entitlement({ sub: sub(NOW + DAY), now: NOW })).toEqual({ plan: "super_monthly", until: NOW + DAY, source: "subscription" });
    expect(entitlement({ sub: sub(NOW + DAY, "canceled"), now: NOW })?.source).toBe("subscription");
    expect(entitlement({ sub: sub(NOW - 1), now: NOW })).toBeNull();
    expect(entitlement({ sub: sub(NOW + DAY, "expired"), now: NOW })).toBeNull();
  });
  it("comes from an organization's licence only with a seat", () => {
    expect(entitlement({ licence: licence(NOW + 5 * DAY), seat: false, now: NOW })).toBeNull();
    expect(entitlement({ licence: licence(NOW + 5 * DAY), seat: true, now: NOW })).toEqual({ plan: "super_seat", until: NOW + 5 * DAY, source: "org" });
    expect(entitlement({ licence: licence(NOW - 1), seat: true, now: NOW })).toBeNull();
  });
  it("takes whichever lasts longer", () => {
    expect(entitlement({ sub: sub(NOW + DAY), licence: licence(NOW + 9 * DAY), seat: true, now: NOW })?.source).toBe("org");
    expect(entitlement({ sub: sub(NOW + 20 * DAY), licence: licence(NOW + 9 * DAY), seat: true, now: NOW })?.source).toBe("subscription");
  });
  it("puts Super in the claims beside role and organization", () => {
    expect(claimsFor("student", "o1", { plan: "super_seat", until: 5, source: "org" })).toEqual({ role: "student", orgId: "o1", plan: "super_seat", planUntil: 5 });
    expect(claimsFor("learner", null, null)).toEqual({ role: "learner" });
  });
});

describe("revenueEvent", () => {
  it("is a GA4 purchase with the transaction, value, currency and item, and a hashed user id", () => {
    const e = revenueEvent({ provider: "paymob", ref: "991", kind: "subscription", uid: "u1", plan: monthly, amount: 149, currency: "EGP", clientId: "a1b2c3d4e5f6a7b8c9d0" }, "purchase", NOW);
    expect(e.client_id).toBe("a1b2c3d4e5f6a7b8c9d0");
    expect(e.user_id).toBe(gaUserId("u1"));
    expect(e.user_id).not.toContain("u1");
    expect(e.events[0]).toEqual({ name: "purchase", params: expect.objectContaining({ transaction_id: "paymob_991", value: 149, currency: "EGP", affiliation: "individual", items: [expect.objectContaining({ item_id: "super_monthly", price: 149, quantity: 1 })] }) });
  });
  it("prices a licence per seat, and makes a client id when the phone's isn't known", () => {
    const seat = { ...monthly, id: "super_seat", kind: "seat" as const, period: "year" as const };
    const e = revenueEvent({ provider: "stripe", ref: "cs_1", kind: "licence", orgId: "o1", plan: seat, amount: 500, currency: "USD", seats: 50 }, "refund", NOW);
    expect(e.events[0].name).toBe("refund");
    expect(e.events[0].params.items[0]).toMatchObject({ price: 10, quantity: 50 });
    expect(e.client_id).toMatch(/^server\.[0-9a-f]{16}$/);
  });
});

describe("superStats", () => {
  it("counts live subscriptions by plan and source, and organizations' seats", () => {
    const s = superStats(
      [{ plan: "super_monthly", status: "active", currentPeriodEnd: NOW + DAY, source: "stripe" }, { plan: "super_monthly", status: "active", currentPeriodEnd: NOW - DAY, source: "paymob" }, { plan: "super_yearly", status: "canceled", currentPeriodEnd: NOW + 9 * DAY, source: "grant" }],
      [{ id: "o1", licence: { plan: "super_seat", seats: 30, until: NOW + DAY } }, { id: "o2", licence: { plan: "super_seat", seats: 10, until: NOW - DAY } }, { id: "o3" }],
      { o1: 12, o2: 4 }, NOW);
    expect(s).toEqual({ individuals: 2, byPlan: { super_monthly: 1, super_yearly: 1 }, bySource: { stripe: 1, grant: 1 }, orgs: 1, seats: 30, seatsUsed: 12 });
  });
});

describe("credits", () => {
  it("spends the period's allowance first, then packs, and never more than there is", () => {
    let c = grantPlanCredits(undefined, 300, NOW + 30 * DAY);
    c = addPackCredits(c, 500, NOW);
    expect(creditsLeft(c, NOW)).toBe(800);
    const a = spendCredits(c, 250, NOW)!;
    expect(a).toEqual({ plan: 50, planUntil: NOW + 30 * DAY, packs: 500 });
    const b = spendCredits(a, 100, NOW)!;
    expect(b).toEqual({ plan: 0, planUntil: NOW + 30 * DAY, packs: 450 });
    expect(spendCredits(b, 451, NOW)).toBeNull();
  });
  it("lets the allowance lapse at the period's end while packs stay, and a new period replaces it", () => {
    const c = { plan: 120, planUntil: NOW - 1, packs: 40 };
    expect(creditsLeft(c, NOW)).toBe(40);
    expect(spendCredits(c, 41, NOW)).toBeNull();
    expect(addPackCredits(c, 10, NOW)).toEqual({ plan: 0, planUntil: NOW - 1, packs: 50 });
    expect(grantPlanCredits(c, 300, NOW + DAY)).toEqual({ plan: 300, planUntil: NOW + DAY, packs: 40 });
  });
  it("charges a call at its measured cost, rounded up", () => {
    expect(creditsForCost(0.003, ECO)).toBe(1.5);
    expect(creditsForCost(0.0021, ECO)).toBe(1.05);
    expect(creditsForCost(0.00201, ECO)).toBe(1.01); // never rounded down below the cost
  });
  it("adds an early renewal's allowance to what is left, to the new end (sfm-05)", () => {
    expect(extendPlanCredits({ plan: 200, planUntil: NOW + DAY, packs: 40 }, 300, NOW + 31 * DAY, NOW)).toEqual({ plan: 500, planUntil: NOW + 31 * DAY, packs: 40 });
    expect(extendPlanCredits({ plan: 200, planUntil: NOW - 1, packs: 40 }, 300, NOW + 30 * DAY, NOW)).toEqual({ plan: 300, planUntil: NOW + 30 * DAY, packs: 40 });
  });
});

describe("taking Super back (revokeEffects)", () => {
  const sub = (o: object = {}) => ({ plan: "super_monthly", status: "active" as const, source: "grant" as const, currentPeriodEnd: NOW + 20 * DAY, ...o });
  it("ends a running subscription now with its period's allowance, and keeps the packs", () => {
    const fx = revokeEffects({ sub: sub(), credits: { plan: 300, planUntil: NOW + 20 * DAY, packs: 40 } }, NOW);
    expect(fx).toEqual({ sub: { status: "expired", currentPeriodEnd: NOW }, credits: { plan: 0, planUntil: NOW, packs: 40 } });
    expect(creditsLeft(fx.credits, NOW)).toBe(40);
    // A paid one too (its provider isn't refunded or stopped: the person page says so before asking).
    expect(revokeEffects({ sub: sub({ source: "stripe", status: "canceled" }), credits: { plan: 120, planUntil: NOW + DAY, packs: 0 } }, NOW).credits).toEqual({ plan: 0, planUntil: NOW, packs: 0 });
  });
  it("is idempotent: a second take-back writes nothing, and one that already ended stays as it was", () => {
    const first = revokeEffects({ sub: sub(), credits: { plan: 300, planUntil: NOW + 20 * DAY, packs: 40 } }, NOW);
    expect(revokeEffects({ sub: { ...sub(), ...first.sub! }, credits: first.credits }, NOW + 5000)).toEqual({});
    expect(revokeEffects({ sub: sub({ status: "expired", currentPeriodEnd: NOW - DAY }), credits: { plan: 0, planUntil: NOW - DAY, packs: 7 } }, NOW)).toEqual({});
    expect(revokeEffects({ sub: null, credits: null }, NOW)).toEqual({});
    // What is left of a lapsed allowance, or a NaN an earlier bad write left, is cleaned up once.
    expect(revokeEffects({ credits: { plan: 120, planUntil: NOW - DAY, packs: 3 } }, NOW)).toEqual({ credits: { plan: 0, planUntil: NOW - DAY, packs: 3 } });
    expect(revokeEffects({ credits: { plan: 0, planUntil: NOW - DAY, packs: NaN } as Credits }, NOW)).toEqual({ credits: { plan: 0, planUntil: NOW - DAY, packs: 0 } });
  });
  it("a tutor call under way when Super was taken back gives nothing back to the ended allowance", () => {
    const h = holdCredits({ plan: 300, planUntil: NOW + DAY, packs: 10 }, 5, NOW)!;
    const after = revokeEffects({ credits: h.next }, NOW).credits!;
    expect(settleCredits(after, h.hold, 1, NOW + 1000).next).toEqual({ plan: 0, planUntil: NOW, packs: 10 });
  });
});

describe("credits that aren't numbers (sfm-04)", () => {
  const poisoned = { plan: NaN, planUntil: NOW + DAY, packs: NaN } as Credits;
  it("count as none, so no check passes on NaN, and the next write heals them", () => {
    expect(creditsLeft(poisoned, NOW)).toBe(0);
    expect(holdCredits(poisoned, 1, NOW)).toBeNull();
    expect(spendCredits(poisoned, 1, NOW)).toBeNull();
    expect(grantPlanCredits(poisoned, 300, NOW + 30 * DAY)).toEqual({ plan: 300, planUntil: NOW + 30 * DAY, packs: 0 });
    expect(addPackCredits(poisoned, 100, NOW)).toEqual({ plan: 0, planUntil: NOW + DAY, packs: 100 });
  });
  it("a cost that isn't a number charges everything held, never nothing and never more", () => {
    const c: Credits = { plan: 5, planUntil: NOW + DAY, packs: 5 };
    const h = holdCredits(c, 3, NOW)!;
    expect(settleCredits(h.next, h.hold, NaN, NOW)).toEqual({ next: { plan: 2, planUntil: NOW + DAY, packs: 5 }, charged: 3, short: false });
    expect(spendCredits(c, NaN, NOW)).toBeNull();
    expect(holdCredits(c, NaN, NOW)).toBeNull();
  });
});

describe("licences bought online (sfm-01)", () => {
  const YEAR = 365 * DAY;
  it("renew the seats paid for: one seat on a 1000-seat licence adds a thousandth of a year, not a year", () => {
    const l = licenceAfterPayment({ plan: "super_seat", seats: 1000, until: NOW + 10 * DAY }, "super_seat", 1, YEAR, NOW);
    expect(l.seats).toBe(1000);
    expect(l.until - (NOW + 10 * DAY)).toBeCloseTo(YEAR / 1000, -2); // about 8.8 hours
  });
  it("an expired licence comes back with the seats paid for, whatever it had", () => {
    expect(licenceAfterPayment({ plan: "super_seat", seats: 1000, until: NOW - DAY }, "super_seat", 1, YEAR, NOW)).toEqual({ plan: "super_seat", seats: 1, until: NOW + YEAR });
    expect(licenceAfterPayment(null, "super_seat", 30, YEAR, NOW)).toEqual({ plan: "super_seat", seats: 30, until: NOW + YEAR });
  });
  it("the same seats add a year; more seats start at once, keeping every seat-day it had and was paid", () => {
    expect(licenceAfterPayment({ plan: "s", seats: 200, until: NOW + 5 * DAY }, "s", 200, YEAR, NOW)).toEqual({ plan: "s", seats: 200, until: NOW + 5 * DAY + YEAR });
    const up = licenceAfterPayment({ plan: "s", seats: 100, until: NOW + 10 * DAY }, "s", 300, YEAR, NOW);
    expect(up.seats).toBe(300);
    expect(up.seats * (up.until - NOW)).toBeCloseTo(100 * 10 * DAY + 300 * YEAR, -6);
    // Two years left on 10 seats, then 100 bought: 100 seats, for what the seat-days pay (sooner than two years).
    const long = licenceAfterPayment({ plan: "s", seats: 10, until: NOW + 2 * YEAR }, "s", 100, YEAR, NOW);
    expect(long.seats).toBe(100);
    expect(long.until).toBe(Math.round(NOW + (10 * 2 * YEAR + 100 * YEAR) / 100));
  });
  it("a refund puts the licence back as it was, or takes off the seat-time it bought if it changed since", () => {
    const before = { plan: "s", seats: 100, until: NOW + 10 * DAY };
    const after = licenceAfterPayment(before, "s", 300, YEAR, NOW);
    expect(afterRefund("licence", { period: "year", credits: 0 }, { licence: after, paid: { seats: 300, licence: { before, after } } }, NOW).licence).toEqual(before);
    expect(afterRefund("licence", { period: "year", credits: 0 }, { licence: after, paid: { seats: 300, licence: { before: null, after } } }, NOW).licence).toBeNull();
    const later = { ...after, until: after.until + 30 * DAY }; // renewed again since
    expect(afterRefund("licence", { period: "year", credits: 0 }, { licence: later, paid: { seats: 300, licence: { before, after } } }, NOW).licence).toEqual({ ...later, until: Math.round(later.until - YEAR) });
    // The refunded seats were most of what is left: the licence goes.
    expect(afterRefund("licence", { period: "year", credits: 0 }, { licence: { plan: "s", seats: 10, until: NOW + 20 * DAY }, paid: { seats: 300 } }, NOW).licence).toBeNull();
  });
  it("seats beyond a smaller licence are freed: staff keep theirs first, then students, by name", () => {
    const holders = [{ id: "s2", role: "student", name: "Zeinab" }, { id: "t1", role: "teacher", name: "Omar" }, { id: "s1", role: "student", name: "Amal" }, { id: "a1", role: "orgAdmin", name: "Hoda" }];
    expect(seatsToRelease(holders, 2)).toEqual(["s1", "s2"]);
    expect(seatsToRelease(holders, 3)).toEqual(["s2"]);
    expect(seatsToRelease(holders, 10)).toEqual([]);
    expect(seatsToRelease(holders, 0)).toHaveLength(4);
  });
});

describe("what a payment changes (paymentEffects)", () => {
  const seat = { ...monthly, id: "super_seat", kind: "seat" as const, period: "year" as const };
  const pack = { ...monthly, id: "pack_500", kind: "credits" as const, credits: 500 };
  const pay = (o: Partial<PaymentRecord>): PaymentRecord => ({ provider: "paymob", ref: "1", kind: "subscription", uid: "u1", plan: monthly, amount: 149, currency: "EGP", ...o });
  it("a first Paymob period starts now with the plan's credits", () => {
    const e = paymentEffects(pay({}), {}, NOW);
    expect(e).toMatchObject({ kind: "subscription", sub: { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: NOW + 30 * DAY }, credits: { plan: 300, planUntil: NOW + 30 * DAY, packs: 0 }, added: { ms: 30 * DAY, credits: 300 } });
  });
  it("paying Paymob early adds a period after the current one, keeping what is left of its credits (sfm-05)", () => {
    const e = paymentEffects(pay({}), { sub: { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: NOW + 5 * DAY }, credits: { plan: 200, planUntil: NOW + 5 * DAY, packs: 0 } }, NOW);
    expect(e).toMatchObject({ sub: { currentPeriodEnd: NOW + 35 * DAY }, credits: { plan: 500, planUntil: NOW + 35 * DAY }, added: { ms: 30 * DAY, credits: 300 } });
  });
  it("Stripe follows its invoice's period, plus grace; its own renewal replaces the allowance (sfm-07)", () => {
    const until = NOW + 31 * DAY;
    const first = paymentEffects(pay({ provider: "stripe", currency: "USD", until, stripeSub: "sub_1" }), {}, NOW);
    expect(first).toMatchObject({ sub: { source: "stripe", stripeSub: "sub_1", currentPeriodEnd: until + STRIPE_GRACE_MS }, credits: { plan: 300 } });
    const later = NOW + 31 * DAY + 3600e3, next = until + 28 * DAY;
    const renewal = paymentEffects(pay({ provider: "stripe", currency: "USD", until: next, periodMs: 28 * DAY, stripeSub: "sub_1" }), { sub: { plan: "super_monthly", status: "active", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: until + STRIPE_GRACE_MS }, credits: { plan: 40, planUntil: until + STRIPE_GRACE_MS, packs: 7 } }, later);
    expect(renewal).toMatchObject({ sub: { currentPeriodEnd: next + STRIPE_GRACE_MS }, credits: { plan: 300, planUntil: next + STRIPE_GRACE_MS, packs: 7 } });
  });
  it("a card subscription over a running Paymob period adds its own period after it, and its renewals keep that lead", () => {
    // Paymob paid to day 40; the card's first month is days 0-30 at Stripe. Before, Super ended at day 40 + 0: the month
    // paid by card was lost under the Paymob one.
    const month = 30 * DAY;
    const e = paymentEffects(pay({ provider: "stripe", currency: "USD", until: NOW + month, periodMs: month, stripeSub: "sub_2" }), { sub: { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: NOW + 40 * DAY }, credits: { plan: 120, planUntil: NOW + 40 * DAY, packs: 0 } }, NOW);
    expect(e).toMatchObject({ sub: { source: "stripe", stripeSub: "sub_2", currentPeriodEnd: NOW + 70 * DAY }, credits: { plan: 420, planUntil: NOW + 70 * DAY }, added: { ms: month } });
    // Stripe renews on day 30 for days 30-61: Super runs 31 days more, to day 101, not to Stripe's day 61 + grace.
    const renewal = paymentEffects(pay({ provider: "stripe", currency: "USD", until: NOW + 61 * DAY, periodMs: 31 * DAY, stripeSub: "sub_2" }), { sub: { plan: "super_monthly", status: "active", source: "stripe", stripeSub: "sub_2", currentPeriodEnd: NOW + 70 * DAY }, credits: { plan: 9, planUntil: NOW + 70 * DAY, packs: 0 } }, NOW + month);
    expect(renewal).toMatchObject({ sub: { currentPeriodEnd: NOW + 101 * DAY }, added: { ms: 31 * DAY }, credits: { plan: 300, planUntil: NOW + 101 * DAY } });
    // Without the period's length (an older invoice), a plan period is assumed.
    expect(paymentEffects(pay({ provider: "stripe", currency: "USD", until: NOW + month, stripeSub: "sub_2" }), { sub: { plan: "super_monthly", status: "active", source: "grant", currentPeriodEnd: NOW + 40 * DAY } }, NOW)).toMatchObject({ added: { ms: month } });
  });
  it("a card renewal paid late follows Stripe's period again, with no drift", () => {
    const until = NOW + 31 * DAY;
    // Darsi's period (with its grace) ended a day ago; the card retry went through now, for the period ending `until`.
    const e = paymentEffects(pay({ provider: "stripe", currency: "USD", until, periodMs: 31 * DAY, stripeSub: "sub_1" }), { sub: { plan: "super_monthly", status: "past_due", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: NOW - DAY } }, NOW);
    expect(e).toMatchObject({ sub: { status: "active", currentPeriodEnd: until + STRIPE_GRACE_MS } });
  });
  it("a Paymob period paid while a card subscription still runs keeps the card subscription's renewal, status and id", () => {
    const card = { plan: "super_monthly", status: "canceled" as const, source: "stripe" as const, stripeSub: "sub_1", currentPeriodEnd: NOW + 10 * DAY };
    const e = paymentEffects(pay({}), { sub: card, credits: { plan: 50, planUntil: NOW + 10 * DAY, packs: 0 } }, NOW);
    expect(e).toMatchObject({ sub: { status: "canceled", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: NOW + 40 * DAY }, credits: { plan: 350 }, added: { ms: 30 * DAY } });
    expect(renewalOf((e as { sub: typeof card }).sub, NOW)).toBe("off");
    // After the card subscription ended, a Paymob period is a Paymob one, with no card id left.
    const after = paymentEffects(pay({}), { sub: { ...card, currentPeriodEnd: NOW - DAY } }, NOW);
    expect(after).toMatchObject({ sub: { status: "active", source: "paymob", currentPeriodEnd: NOW + 30 * DAY } });
    expect((after as { sub: { stripeSub?: string } }).sub.stripeSub).toBeUndefined();
  });
  it("a pack adds to the packs; a licence for an organization that is gone is kept unapplied", () => {
    expect(paymentEffects(pay({ kind: "credits", plan: pack }), { credits: { plan: 3, planUntil: NOW + DAY, packs: 10 } }, NOW)).toEqual({ kind: "credits", credits: { plan: 3, planUntil: NOW + DAY, packs: 510 } });
    expect(paymentEffects(pay({ kind: "licence", uid: undefined, orgId: "o1", plan: seat, seats: 5 }), { org: null }, NOW)).toEqual({ kind: "unapplied", reason: "org-gone" });
    expect(paymentEffects(pay({ kind: "licence", uid: undefined, orgId: "o1", plan: seat, seats: 5 }), { org: { licence: null } }, NOW)).toEqual({ kind: "licence", licence: { plan: "super_seat", seats: 5, until: NOW + 365 * DAY }, before: null });
    expect(paymentEffects(pay({ uid: undefined }), {}, NOW)).toEqual({ kind: "unapplied", reason: "no-account" });
  });
  it("a refund takes back exactly the time and credits the payment added", () => {
    const sub = { plan: "super_monthly", status: "active" as const, source: "paymob" as const, currentPeriodEnd: NOW + 35 * DAY };
    const r = afterRefund("subscription", monthly, { sub, credits: { plan: 450, planUntil: NOW + 35 * DAY, packs: 2 }, paid: { added: { ms: 30 * DAY, credits: 300 } } }, NOW);
    expect(r.sub).toMatchObject({ status: "active", currentPeriodEnd: NOW + 5 * DAY });
    expect(r.credits).toEqual({ plan: 150, planUntil: NOW + 5 * DAY, packs: 2 });
    // A Stripe payment that added no time takes none back.
    expect(afterRefund("subscription", monthly, { sub, paid: { added: { ms: 0, credits: 300 } } }, NOW).sub?.currentPeriodEnd).toBe(NOW + 35 * DAY);
  });
});

describe("renewals and claims", () => {
  const sub = (o: object) => ({ plan: "super_monthly", status: "active" as const, source: "stripe" as const, currentPeriodEnd: NOW + DAY, stripeSub: "sub_1", ...o });
  it("a Stripe subscription that renews by itself blocks a second one; a cancelled one offers to restore it (sfm-05)", () => {
    expect(renewsByItself(sub({}), NOW)).toBe(true);
    expect(renewsByItself(sub({ status: "past_due" }), NOW)).toBe(true);
    expect(renewsByItself(sub({ status: "canceled" }), NOW)).toBe(false);
    expect(renewsByItself(sub({ source: "paymob" }), NOW)).toBe(false);
    expect(renewsByItself(sub({ currentPeriodEnd: NOW - 1 }), NOW)).toBe(false);
    expect([renewalOf(sub({}), NOW), renewalOf(sub({ status: "canceled" }), NOW), renewalOf(sub({ status: "canceled", stripeSub: undefined }), NOW), renewalOf(sub({ source: "grant" }), NOW), renewalOf(null, NOW)]).toEqual(["on", "off", null, null, null]);
  });
  it("knows when a token already has these claims, whatever their order", () => {
    expect(sameClaims({ role: "student", orgId: "o1", plan: "p", planUntil: 5 }, { planUntil: 5, plan: "p", orgId: "o1", role: "student" })).toBe(true);
    expect(sameClaims({ role: "student", orgId: "o1" }, { role: "student", orgId: "o1", plan: "p", planUntil: 5 })).toBe(false);
    expect(sameClaims({ role: "student", planUntil: 5 }, { role: "student", planUntil: 6 })).toBe(false);
  });
});
