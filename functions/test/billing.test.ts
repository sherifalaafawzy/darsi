import { describe, expect, it } from "vitest";
import { addPackCredits, claimsFor, creditsForCost, creditsLeft, entitlement, gaUserId, grantPlanCredits, margin, periodDays, revenueEvent, spendCredits, superStats, validateEconomics, validatePlans } from "../src/billingCore";

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
});
