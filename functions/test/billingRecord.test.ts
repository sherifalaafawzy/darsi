// recordPayment and recordRefund against an in-memory Firestore (fakeFirestore.ts): one transaction per payment
// (sfm-06), licences sold as seat-time with refunds that put them back (sfm-01), Paymob renewals that keep their
// credits (sfm-05), Stripe periods that follow its invoices (sfm-07), the licence trigger freeing extra seats and
// refreshing claims in batches (sfm-08), and the platform admin's Super and licence buttons (empty fields).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import type { PaymentRecord, Plan } from "../src/billingCore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth(), audits: Record<string, unknown>[] = [];
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const caller = (req: Req) => { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return { uid: req.auth.uid, role: (req.auth.token.role as string) ?? "learner", orgId: req.auth.token.orgId as string | undefined }; };
  const freshCaller = async (req: Req) => { const c = caller(req); const claims = (await auth.getUser(c.uid).catch(() => null))?.customClaims ?? {}; return { uid: c.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined }; };
  return {
    db, auth, audits, caller, freshCaller,
    audit: async (action: string, by: string, data: Record<string, unknown>) => { audits.push({ action, by, ...data }); },
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/analytics.js", () => ({ gaConfig: async () => ({ mid: "", secret: "" }) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {}, superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({}) }));

const admin = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth; audits: Record<string, unknown>[] };
const { db, auth } = admin;
const billing = await import("../src/billing");
const { recordPayment, recordRefund } = billing;
type Run = { run: (x: unknown) => Promise<unknown>; __endpoint: Record<string, unknown> & { eventTrigger?: { retry?: boolean } } };
const fn = (f: unknown) => f as Run;

const DAY = 864e5, YEAR = 365 * DAY;
const monthly: Plan = { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual", period: "month", prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true };
const seat: Plan = { ...monthly, id: "super_seat", kind: "seat", period: "year", prices: { EGP: 600 } };
let n = 0;
const pay = (o: Partial<PaymentRecord> = {}): PaymentRecord => ({ provider: "paymob", ref: `t${++n}`, kind: "subscription", uid: "u1", plan: monthly, amount: 149, currency: "EGP", checkout: "chk1", ...o });
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;

beforeEach(() => {
  db.docs.clear(); db.writes = []; db.failOn = null; auth.users.clear(); auth.claimWrites = []; admin.audits.length = 0;
  db.docs.set("checkouts/chk1", { uid: "u1", status: "open" });
  db.docs.set("users/u1", { role: "learner" });
});

describe("a payment is one transaction (sfm-06)", () => {
  it("is recorded once, with what it bought and its checkout", async () => {
    const p = pay();
    expect(await recordPayment(p)).toMatchObject({ duplicate: false, unapplied: false });
    expect(doc(`payments/paymob_${p.ref}`)).toMatchObject({ status: "paid", kind: "subscription", added: { ms: 30 * DAY, credits: 300 } });
    expect(doc("subscriptions/u1")).toMatchObject({ status: "active", source: "paymob" });
    expect(doc("credits/u1")).toMatchObject({ plan: 300, packs: 0 });
    expect(doc("checkouts/chk1")).toMatchObject({ status: "paid", payments: { [p.ref]: true } });
    // The provider's repeat changes nothing.
    db.docs.set("credits/u1", { ...doc("credits/u1"), plan: 120 });
    expect(await recordPayment(p)).toEqual({ duplicate: true });
    expect(doc("credits/u1")!.plan).toBe(120);
  });

  it("leaves nothing behind when a write fails, so the provider's retry is applied in full", async () => {
    const p = pay();
    db.failOn = (w) => w.path === "credits/u1";
    await expect(recordPayment(p)).rejects.toThrow(/commit failed/);
    expect(doc(`payments/paymob_${p.ref}`)).toBeUndefined();
    expect(doc("subscriptions/u1")).toBeUndefined();
    expect(doc("checkouts/chk1")!.status).toBe("open");
    // Before, the payment's marker was already written, and this retry was answered "duplicate": paid, nothing given.
    expect(await recordPayment(p)).toMatchObject({ duplicate: false });
    expect(doc("subscriptions/u1")).toMatchObject({ status: "active" });
    expect(doc("credits/u1")!.plan).toBe(300);
  });

  it("keeps a licence for an organization that is gone as unapplied, audited, and stops the retries", async () => {
    const p = pay({ kind: "licence", uid: undefined, orgId: "gone", plan: seat, amount: 1200, seats: 2 });
    expect(await recordPayment(p)).toMatchObject({ duplicate: false, unapplied: true });
    expect(doc(`payments/paymob_${p.ref}`)).toMatchObject({ status: "unapplied", reason: "org-gone", seats: 2 });
    expect(doc("checkouts/chk1")!.status).toBe("unapplied");
    expect(admin.audits).toContainEqual(expect.objectContaining({ action: "paymentUnapplied", reason: "org-gone", orgId: "gone" }));
    expect(await recordPayment(p)).toEqual({ duplicate: true });
    // A refund of it takes nothing back (it gave nothing) and still marks it refunded.
    expect(await recordRefund(p)).toEqual({ changed: true });
    expect(doc(`payments/paymob_${p.ref}`)!.status).toBe("refunded");
    expect(doc("orgs/gone")).toBeUndefined();
  });
});

describe("licences bought online (sfm-01)", () => {
  const lic = (p: Partial<PaymentRecord>) => pay({ kind: "licence", uid: undefined, orgId: "o1", plan: seat, amount: 600, seats: 1, ...p });
  it("one seat bought for a live 1000-seat licence adds hours, not a year", async () => {
    const until = Date.now() + 10 * DAY;
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 1000, until } });
    await recordPayment(lic({}));
    const l = doc("orgs/o1")!.licence;
    expect(l.seats).toBe(1000);
    expect(l.until - until).toBeGreaterThan(8 * 3600e3);
    expect(l.until - until).toBeLessThan(9 * 3600e3);
  });
  it("an expired licence comes back with only the seats paid for", async () => {
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 1000, until: Date.now() - DAY } });
    await recordPayment(lic({}));
    expect(doc("orgs/o1")!.licence.seats).toBe(1);
  });
  it("a refund puts the licence back as it was before the payment", async () => {
    const before = { plan: "super_seat", seats: 100, until: Date.now() + 10 * DAY };
    db.docs.set("orgs/o1", { name: "School", licence: before });
    const p = lic({ seats: 300, amount: 180000 });
    await recordPayment(p);
    expect(doc("orgs/o1")!.licence.seats).toBe(300);
    expect(doc(`payments/paymob_${p.ref}`)!.licence).toEqual({ before, after: doc("orgs/o1")!.licence });
    await recordRefund(p);
    expect(doc("orgs/o1")!.licence).toEqual(before);
  });
});

describe("subscriptions (sfm-05, sfm-07)", () => {
  it("paying Paymob early keeps this period's unused credits, and a refund of it takes back exactly that period", async () => {
    await recordPayment(pay());
    const end1 = doc("subscriptions/u1")!.currentPeriodEnd;
    db.docs.set("credits/u1", { ...doc("credits/u1"), plan: 200 }); // 100 used
    const early = pay();
    await recordPayment(early);
    expect(doc("subscriptions/u1")!.currentPeriodEnd).toBe(end1 + 30 * DAY);
    expect(doc("credits/u1")).toMatchObject({ plan: 500, planUntil: end1 + 30 * DAY });
    await recordRefund(early);
    expect(doc("subscriptions/u1")).toMatchObject({ status: "active", currentPeriodEnd: end1 });
    expect(doc("credits/u1")).toMatchObject({ plan: 200, planUntil: end1 });
  });
  it("a Stripe subscription runs to the end of the period each invoice paid for, plus grace", async () => {
    const until = Date.now() + 31 * DAY;
    await recordPayment(pay({ provider: "stripe", currency: "USD", amount: 4.99, until, stripeSub: "sub_1" }));
    expect(doc("subscriptions/u1")).toMatchObject({ source: "stripe", stripeSub: "sub_1", currentPeriodEnd: until + 2 * DAY });
    db.docs.set("credits/u1", { ...doc("credits/u1"), plan: 10 });
    const next = until + 28 * DAY; // February
    await recordPayment(pay({ provider: "stripe", currency: "USD", amount: 4.99, until: next, periodMs: 28 * DAY, stripeSub: "sub_1" }));
    expect(doc("subscriptions/u1")!.currentPeriodEnd).toBe(next + 2 * DAY);
    expect(doc("credits/u1")!.plan).toBe(300); // a new period of the same subscription: the allowance starts again
  });
  it("mirrors a renewing card subscription on the profile for the Super screen", async () => {
    auth.users.set("u1", { uid: "u1", customClaims: { role: "learner" } });
    db.docs.set("subscriptions/u1", { plan: "super_monthly", status: "active", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: Date.now() + DAY });
    await billing.refreshClaims("u1");
    expect(doc("users/u1")).toMatchObject({ planSource: "subscription", planRenewal: "on" });
    db.docs.set("subscriptions/u1", { ...doc("subscriptions/u1"), status: "canceled" });
    await billing.refreshClaims("u1");
    expect(doc("users/u1")!.planRenewal).toBe("off");
  });
});

describe("a licence that changed (sfm-01, sfm-08)", () => {
  const event = (before: unknown, after: unknown, time = new Date().toISOString()) => ({
    params: { orgId: "o1" }, time,
    data: { before: { get: (f: string) => (f === "licence" ? before : undefined) }, after: { get: (f: string) => (f === "licence" ? after : undefined) } },
  });
  const member = (uid: string, role: string, name: string) => {
    db.docs.set(`users/${uid}`, { role, name, orgId: "o1", superSeat: true });
    auth.users.set(uid, { uid, customClaims: { role, orgId: "o1" } });
  };
  it("frees the seats beyond a smaller licence, staff first kept, and refreshes everyone's claims", async () => {
    const licence = { plan: "super_seat", seats: 2, until: Date.now() + YEAR };
    db.docs.set("orgs/o1", { name: "School", licence });
    member("a1", "orgAdmin", "Hoda"); member("t1", "teacher", "Omar"); member("s1", "student", "Amal"); member("s2", "student", "Zeinab");
    await fn(billing.onOrgLicence).run(event({ ...licence, seats: 4 }, licence));
    expect(["a1", "t1", "s1", "s2"].map((u) => doc(`users/${u}`)!.superSeat)).toEqual([true, true, false, false]);
    expect((await auth.getUser("t1")).customClaims).toMatchObject({ plan: "super_seat", planUntil: licence.until });
    expect((await auth.getUser("s1")).customClaims).toEqual({ role: "student", orgId: "o1" });
    // Run again (a retried trigger): nothing changes, and no claims are written again.
    const writes = auth.claimWrites.length;
    await fn(billing.onOrgLicence).run(event({ ...licence, seats: 4 }, licence));
    expect(auth.claimWrites.length).toBe(writes);
  });
  it("has time and retries for large organizations, and gives up on an event hours old", async () => {
    expect(fn(billing.onOrgLicence).__endpoint).toMatchObject({ timeoutSeconds: 540, eventTrigger: { retry: true } });
    expect(fn(billing.fillSeats).__endpoint).toMatchObject({ timeoutSeconds: 300 });
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 0, until: Date.now() + DAY } });
    member("s1", "student", "Amal");
    await fn(billing.onOrgLicence).run(event(null, { seats: 0 }, new Date(Date.now() - 7 * 3600e3).toISOString()));
    expect(doc("users/s1")!.superSeat).toBe(true);
  });
});

describe("platform admins' Super and licence buttons (empty fields)", () => {
  const as = (data: Record<string, unknown>) => ({ auth: { uid: "admin", token: { role: "superadmin" } }, data });
  beforeEach(() => {
    auth.users.set("admin", { uid: "admin", customClaims: { role: "superadmin" } });
    db.docs.set("config/plans", { plans: [monthly, seat] });
    db.docs.set("subscriptions/u1", { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: Date.now() + 9 * DAY });
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 5, until: Date.now() + DAY } });
  });
  it("audits a seat taken back or filled (who, which org, whom), for /super's activity log", async () => {
    db.docs.set("users/s1", { role: "student", orgId: "o1", name: "Amal", superSeat: true });
    auth.users.set("s1", { uid: "s1", customClaims: { role: "student", orgId: "o1" } });
    await fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: false }));
    expect(admin.audits).toContainEqual(expect.objectContaining({ action: "setSeat", by: "admin", orgId: "o1", uid: "s1", on: false }));
    await fn(billing.fillSeats).run(as({ orgId: "o1" }));
    expect(admin.audits).toContainEqual(expect.objectContaining({ action: "fillSeats", by: "admin", orgId: "o1", given: 1 }));
  });
  it("Give Super with no days, or 0, is refused instead of taking Super back", async () => {
    await expect(fn(billing.grantSuper).run(as({ uid: "u1", days: 0 }))).rejects.toThrow(/days must be 1/);
    await expect(fn(billing.grantSuper).run(as({ uid: "u1", days: "" }))).rejects.toThrow(/days must be 1/);
    expect(doc("subscriptions/u1")!.status).toBe("active");
    await fn(billing.grantSuper).run(as({ uid: "u1", revoke: true }));
    expect(doc("subscriptions/u1")!.status).toBe("expired");
  });
  it("a plan refused for its margin says why in the error's details, for the Plans page to word in Arabic", async () => {
    const err = await fn(billing.savePlans).run(as({ plans: [{ ...monthly, prices: { EGP: 5 } }], economics: { usdPerCredit: 0.002, egpPerUsd: 50 } })).catch((e: unknown) => e) as { code?: string; message?: string; details?: unknown };
    expect(err.code).toBe("invalid-argument");
    expect(err.message).toMatch(/EGP price leaves a -500% margin/);
    expect(err.details).toEqual({ reason: "plan-margin", id: "super_monthly", cur: "EGP", margin: -5, min: 0.6 });
  });
  it("Take back ends the period's credits with Super, keeps the packs, and a second Take back changes nothing", async () => {
    // The walkthrough: after Take back the person page still said "Tutor credits: 300 left this period".
    await fn(billing.grantSuper).run(as({ uid: "u1", days: 30 }));
    await fn(billing.grantCredits).run(as({ uid: "u1", credits: 50 }));
    expect(doc("credits/u1")).toMatchObject({ plan: 300, packs: 50 });
    const before = Date.now();
    await fn(billing.grantSuper).run(as({ uid: "u1", revoke: true }));
    const c = doc("credits/u1")!, s = doc("subscriptions/u1")!;
    expect(c).toEqual({ plan: 0, planUntil: expect.any(Number), packs: 50 });
    expect(c.planUntil).toBeGreaterThanOrEqual(before);
    expect(c.planUntil).toBeLessThanOrEqual(Date.now());
    expect(s).toMatchObject({ status: "expired", currentPeriodEnd: c.planUntil });
    expect(admin.audits.at(-1)).toMatchObject({ action: "grantSuper", uid: "u1", revoke: true, ended: true, creditsEnded: true });
    db.writes = [];
    await fn(billing.grantSuper).run(as({ uid: "u1", revoke: true }));
    expect(db.writes).toEqual([]);
    expect(doc("credits/u1")).toEqual(c);
    expect(doc("subscriptions/u1")!.currentPeriodEnd).toBe(s.currentPeriodEnd);
    // Giving Super again starts a new allowance; the packs are still there.
    await fn(billing.grantSuper).run(as({ uid: "u1", days: 30 }));
    expect(doc("credits/u1")).toMatchObject({ plan: 300, packs: 50 });
  });
  it("Set licence with no seats or days is refused instead of removing it; Remove licence is its own flag", async () => {
    await expect(fn(billing.setOrgLicence).run(as({ orgId: "o1", seats: 0 }))).rejects.toThrow(/seats must be 1/);
    await expect(fn(billing.setOrgLicence).run(as({ orgId: "o1", seats: 5, days: 0 }))).rejects.toThrow(/days must be at least 1/);
    expect(doc("orgs/o1")!.licence.seats).toBe(5);
    await fn(billing.setOrgLicence).run(as({ orgId: "o1", seats: 0, remove: true }));
    expect(doc("orgs/o1")!.licence).toBeUndefined();
  });
});

describe("a card subscription next to Paymob periods and complimentary days (review of sfm-05, sfm-07)", () => {
  const card = (o: object = {}) => ({ plan: "super_monthly", status: "canceled", source: "stripe", stripeSub: "sub_1", currentPeriodEnd: Date.now() + 10 * DAY, ...o });
  it("a Paymob period on a card subscription that still runs keeps its renewal and id; after it ended, the id goes", async () => {
    db.docs.set("subscriptions/u1", card());
    await recordPayment(pay());
    expect(doc("subscriptions/u1")).toMatchObject({ source: "stripe", status: "canceled", stripeSub: "sub_1" });
    db.docs.set("subscriptions/u1", card({ currentPeriodEnd: Date.now() - DAY }));
    await recordPayment(pay());
    expect(doc("subscriptions/u1")).toMatchObject({ source: "paymob", status: "active" });
    expect(doc("subscriptions/u1")).not.toHaveProperty("stripeSub");
  });
  it("complimentary days keep a cancelled card renewal cancelled, and drop the id of one that ended", async () => {
    const as = { auth: { uid: "admin", token: { role: "superadmin" } } };
    auth.users.set("admin", { uid: "admin", customClaims: { role: "superadmin" } });
    db.docs.set("config/plans", { plans: [monthly] });
    db.docs.set("subscriptions/u1", card());
    await fn(billing.grantSuper).run({ ...as, data: { uid: "u1", days: 30 } });
    expect(doc("subscriptions/u1")).toMatchObject({ source: "stripe", status: "canceled", stripeSub: "sub_1" });
    // Before, the days set "active", so the Super screen said the card renews (and refused a new plan as already subscribed).
    db.docs.set("subscriptions/u1", card({ status: "past_due", currentPeriodEnd: Date.now() - DAY }));
    await fn(billing.grantSuper).run({ ...as, data: { uid: "u1", days: 30 } });
    expect(doc("subscriptions/u1")).toMatchObject({ source: "grant", status: "active" });
    expect(doc("subscriptions/u1")).not.toHaveProperty("stripeSub");
  });
});
