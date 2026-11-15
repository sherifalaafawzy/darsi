// recordPayment and recordRefund against an in-memory Firestore (fakeFirestore.ts): one transaction per payment
// (sfm-06), licences sold as seat-time with refunds that put them back (sfm-01), Paymob renewals that keep their
// credits (sfm-05), Stripe periods that follow its invoices (sfm-07), the licence trigger freeing extra seats and
// refreshing claims in batches (sfm-08), and the platform admin's Super and licence buttons (empty fields).
// Enterprise pass (TECHNICAL.md): claims that follow a payment by themselves and through a retried
// trigger, Give Super in one transaction, Fill seats past 450, and a reason code on every refusal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";
import { holdCredits, type Credits, type PaymentRecord, type Plan } from "../src/billingCore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb: Base, FakeAuth: BaseAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  /**
   * Transactions as Firestore runs them: when a document a transaction read has changed by the time it commits, its
   * callback runs again on the new data. `between` (once) runs after a callback and before its commit, to land
   * another write in the middle. Kept whole in this file (only the documents and `commit` come from the shared fake),
   * so one transaction started from inside another never waits on it.
   */
  type Ref = { path?: string; get: () => Promise<unknown> };
  type W = Parameters<InstanceType<typeof Base>["commit"]>[0][number];
  class FakeDb extends Base {
    between: (() => Promise<void>) | null = null;
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const now = (path: string) => JSON.stringify(this.docs.get(path) ?? null);
      for (let attempt = 0; attempt < 5; attempt++) {
        const ws: W[] = [], read = new Map<string, string>();
        const get = async (ref: Ref) => {
          if (ws.length) throw new Error("Firestore transactions require all reads to be executed before all writes.");
          if (ref.path) read.set(ref.path, now(ref.path));
          return ref.get();
        };
        const tx = {
          get, getAll: (...refs: Ref[]) => Promise.all(refs.map(get)),
          set: (ref: { path: string }, data: W["data"], opts?: W["opts"]) => { ws.push({ path: ref.path, op: "set", data, opts }); return tx; },
          update: (ref: { path: string }, data: W["data"]) => { ws.push({ path: ref.path, op: "update", data }); return tx; },
          create: (ref: { path: string }, data: W["data"]) => { ws.push({ path: ref.path, op: "create", data }); return tx; },
          delete: (ref: { path: string }) => { ws.push({ path: ref.path, op: "delete" }); return tx; },
        };
        const out = await fn(tx);
        const between = this.between; this.between = null;
        if (between) await between();
        if ([...read].some(([path, was]) => now(path) !== was)) continue;
        this.commit(ws);
        return out;
      }
      throw new Error("ABORTED: too much contention");
    }
  }
  /** Auth as the Admin SDK answers: a missing account is an error with a code; `failGet` makes Auth itself fail. */
  class FakeAuth extends BaseAuth {
    failGet: ((uid: string) => boolean) | null = null;
    revoked: string[] = [];
    async getUser(uid: string) {
      if (this.failGet?.(uid)) throw Object.assign(new Error("Auth is not answering"), { code: "auth/internal-error" });
      if (!this.users.has(uid)) throw Object.assign(new Error("There is no user record for this id."), { code: "auth/user-not-found" });
      return super.getUser(uid);
    }
    async revokeRefreshTokens(uid?: string) { this.revoked.push(String(uid)); }
  }
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

const admin = (await import("../src/admin.js")) as unknown as {
  db: FakeDb & { between: (() => Promise<void>) | null }; auth: FakeAuth & { failGet: ((uid: string) => boolean) | null; revoked: string[] }; audits: Record<string, unknown>[];
};
const { db, auth } = admin;
const billing = await import("../src/billing");
const { recordPayment, recordRefund } = billing;
type Run = { run: (x: unknown) => Promise<unknown>; __endpoint: Record<string, unknown> & { eventTrigger?: { retry?: boolean } } };
const fn = (f: unknown) => f as Run;
type Tx = { get: (ref: unknown) => Promise<{ data: () => unknown }>; set: (ref: unknown, data: unknown) => void };
/** The refusal's code, as the screens read it (apps/web admin/refusals.ts: details.reason). */
const reason = async (call: Promise<unknown>) => ((await call.then(() => ({}), (e: unknown) => e)) as { details?: { reason?: string } }).details?.reason;

const DAY = 864e5, YEAR = 365 * DAY;
const monthly: Plan = { id: "super_monthly", name: { en: "Super monthly", ar: "سوبر شهري" }, kind: "individual", period: "month", prices: { EGP: 149, USD: 4.99 }, credits: 300, active: true };
const seat: Plan = { ...monthly, id: "super_seat", kind: "seat", period: "year", prices: { EGP: 600 } };
let n = 0;
const pay = (o: Partial<PaymentRecord> = {}): PaymentRecord => ({ provider: "paymob", ref: `t${++n}`, kind: "subscription", uid: "u1", plan: monthly, amount: 149, currency: "EGP", checkout: "chk1", ...o });
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;

beforeEach(() => {
  db.docs.clear(); db.writes = []; db.failOn = null; db.between = null; auth.users.clear(); auth.claimWrites = []; auth.failGet = null; auth.revoked = []; admin.audits.length = 0;
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
  it("a retry still takes Super from a freed member whose claims failed the first time", async () => {
    // The seats are freed in a transaction of their own; the freed members were then only known to that run. When
    // Auth failed for one of them the trigger was retried, found nobody extra any more, and refreshed only the
    // remaining holders: the freed member kept Super in their token until the old licence's end.
    const big = { plan: "super_seat", seats: 4, until: Date.now() + YEAR }, small = { ...big, seats: 2 };
    db.docs.set("orgs/o1", { name: "School", licence: big });
    member("a1", "orgAdmin", "Hoda"); member("t1", "teacher", "Omar"); member("s1", "student", "Amal"); member("s2", "student", "Zeinab");
    await fn(billing.onOrgLicence).run(event(null, big));
    for (const u of ["s1", "s2"]) expect((await auth.getUser(u)).customClaims).toMatchObject({ plan: "super_seat" });
    db.docs.set("orgs/o1", { name: "School", licence: small });
    auth.failClaims = 1; // Auth fails once, for one of the two students who lose their seat
    await expect(fn(billing.onOrgLicence).run(event(big, small))).rejects.toThrow(/1 of \d+ claims not refreshed/);
    expect(["s1", "s2"].map((u) => doc(`users/${u}`)!.superSeat)).toEqual([false, false]);
    expect(["s1", "s2"].filter((u) => auth.users.get(u)!.customClaims!.plan)).toHaveLength(1);
    await fn(billing.onOrgLicence).run(event(big, small));
    for (const u of ["s1", "s2"]) {
      expect((await auth.getUser(u)).customClaims).toEqual({ role: "student", orgId: "o1" });
      expect(doc(`users/${u}`)).toMatchObject({ plan: null, planSource: null });
    }
    // The two who keep their seat are untouched, and a third run writes nothing.
    expect((await auth.getUser("t1")).customClaims).toMatchObject({ plan: "super_seat", planUntil: small.until });
    const writes = auth.claimWrites.length;
    await fn(billing.onOrgLicence).run(event(big, small));
    expect(auth.claimWrites.length).toBe(writes);
  });
  it("a seat taken back by hand tries the claims twice, and an older profile gets its planSource mirrored", async () => {
    auth.users.set("admin", { uid: "admin", customClaims: { role: "superadmin" } });
    const licence = { plan: "super_seat", seats: 4, until: Date.now() + YEAR };
    db.docs.set("orgs/o1", { name: "School", licence });
    member("s1", "student", "Amal");
    // A profile mirrored before planSource existed: the plan and its end are right, the source is missing.
    auth.users.get("s1")!.customClaims = { role: "student", orgId: "o1", plan: "super_seat", planUntil: licence.until };
    db.docs.set("users/s1", { ...doc("users/s1"), plan: "super_seat", planUntil: licence.until });
    await billing.refreshClaims("s1");
    expect(doc("users/s1")!.planSource).toBe("org");
    auth.failClaims = 1;
    expect(await fn(billing.setSeat).run({ auth: { uid: "admin", token: { role: "superadmin" } }, data: { orgId: "o1", uid: "s1", on: false } })).toEqual({ ok: true });
    expect((await auth.getUser("s1")).customClaims).toEqual({ role: "student", orgId: "o1" });
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

describe("claims follow a payment without hanging on one trigger attempt", () => {
  const event = (time = new Date().toISOString()) => ({ params: { uid: "u1" }, time, data: {} });
  it("the subscription trigger is retried, gives up on an event hours old, and ends quietly for a deleted account", async () => {
    expect(fn(billing.onSubscriptionWrite).__endpoint).toMatchObject({ eventTrigger: { retry: true } });
    // No Auth account (deleted since): nothing to do, and no error, so the retries stop.
    await expect(fn(billing.onSubscriptionWrite).run(event())).resolves.toBeUndefined();
    // Auth not answering: the trigger fails, so it is run again. Before, this read as "no such account" and the
    // person who paid never got Super.
    auth.users.set("u1", { uid: "u1", customClaims: { role: "learner" } });
    db.docs.set("subscriptions/u1", { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: Date.now() + DAY });
    auth.failGet = () => true;
    await expect(fn(billing.onSubscriptionWrite).run(event())).rejects.toThrow(/not answering/);
    // Hours later it stops trying, even if Auth still fails.
    await expect(fn(billing.onSubscriptionWrite).run(event(new Date(Date.now() - 7 * 3600e3).toISOString()))).resolves.toBeUndefined();
    expect(auth.claimWrites).toEqual([]);
    auth.failGet = null;
    await fn(billing.onSubscriptionWrite).run(event());
    expect((await auth.getUser("u1")).customClaims).toMatchObject({ role: "learner", plan: "super_monthly" });
  });
  it("a recorded payment gives the buyer their claims at once, and a refund takes them back", async () => {
    auth.users.set("u1", { uid: "u1", customClaims: { role: "learner" } });
    const p = pay();
    await recordPayment(p);
    expect((await auth.getUser("u1")).customClaims).toEqual({ role: "learner", plan: "super_monthly", planUntil: doc("subscriptions/u1")!.currentPeriodEnd });
    expect(doc("users/u1")).toMatchObject({ plan: "super_monthly", planSource: "subscription" });
    await recordRefund(p);
    expect((await auth.getUser("u1")).customClaims).toEqual({ role: "learner" });
    expect(doc("users/u1")!.plan).toBeNull();
  });
  it("claims that can't be refreshed never fail the webhook: the payment stays recorded, and its repeat finishes the job", async () => {
    auth.users.set("u1", { uid: "u1", customClaims: { role: "learner" } });
    auth.failGet = () => true;
    const p = pay();
    expect(await recordPayment(p)).toMatchObject({ duplicate: false, unapplied: false });
    expect(doc(`payments/paymob_${p.ref}`)!.status).toBe("paid");
    expect(auth.claimWrites).toEqual([]);
    // The provider's repeat (or the retried trigger) finds the payment recorded and still brings the claims.
    auth.failGet = null;
    expect(await recordPayment(p)).toEqual({ duplicate: true });
    expect((await auth.getUser("u1")).customClaims).toMatchObject({ plan: "super_monthly" });
    // A refund's claims failing doesn't fail the refund either.
    auth.failGet = () => true;
    expect(await recordRefund(p)).toEqual({ changed: true });
    expect(doc(`payments/paymob_${p.ref}`)!.status).toBe("refunded");
  });
  it("a licence payment has no buyer to refresh; its seat holders follow through the licence trigger", async () => {
    db.docs.set("orgs/o1", { name: "School" });
    await recordPayment(pay({ kind: "licence", uid: undefined, orgId: "o1", plan: seat, amount: 600, seats: 1 }));
    expect(auth.claimWrites).toEqual([]);
  });
});

describe("a suspended organization (the licence trigger also follows the status)", () => {
  const event = (before: string, after: string) => ({
    params: { orgId: "o1" }, time: new Date().toISOString(),
    data: { before: { get: (f: string) => (f === "status" ? before : undefined) }, after: { get: (f: string) => (f === "status" ? after : undefined) } },
  });
  it("freezes its teachers and admins, not its students, and unfreezes them when it is active again", async () => {
    const until = Date.now() + YEAR;
    db.docs.set("orgs/o1", { name: "School", status: "suspended", licence: { plan: "super_seat", seats: 5, until } });
    for (const [uid, role] of [["a1", "orgAdmin"], ["t1", "teacher"], ["s1", "student"]] as const) {
      db.docs.set(`users/${uid}`, { role, orgId: "o1", name: uid, superSeat: uid !== "a1" });
      auth.users.set(uid, { uid, customClaims: { role, orgId: "o1" } });
    }
    await fn(billing.onOrgLicence).run(event("active", "suspended"));
    expect((await auth.getUser("a1")).customClaims).toEqual({ role: "orgAdmin", orgId: "o1", frozen: true });
    // Nothing else changes: the teacher's seat still gives Super.
    expect((await auth.getUser("t1")).customClaims).toEqual({ role: "teacher", orgId: "o1", plan: "super_seat", planUntil: until, frozen: true });
    expect((await auth.getUser("s1")).customClaims).toEqual({ role: "student", orgId: "o1" });
    expect([...auth.revoked].sort()).toEqual(["a1", "t1"]);
    // The same event again (a retry): no claims written, nobody signed out twice.
    const writes = auth.claimWrites.length;
    await fn(billing.onOrgLicence).run(event("active", "suspended"));
    expect(auth.claimWrites.length).toBe(writes);
    expect(auth.revoked.length).toBe(2);
    db.docs.set("orgs/o1", { ...doc("orgs/o1"), status: "active" });
    await fn(billing.onOrgLicence).run(event("suspended", "active"));
    expect((await auth.getUser("a1")).customClaims).toEqual({ role: "orgAdmin", orgId: "o1" });
    expect((await auth.getUser("t1")).customClaims).toEqual({ role: "teacher", orgId: "o1", plan: "super_seat", planUntil: until });
    expect(auth.revoked.length).toBe(2);
    // A status change that isn't a suspension (pending to active) refreshes nobody.
    const again = auth.claimWrites.length;
    auth.failGet = () => true;
    await fn(billing.onOrgLicence).run(event("pending", "active"));
    expect(auth.claimWrites.length).toBe(again);
    // Nor does a suspended organization that starts being deleted: its staff stay frozen until deleteOrg releases them.
    await fn(billing.onOrgLicence).run(event("suspended", "deleting"));
    expect(auth.claimWrites.length).toBe(again);
  });

  it("freezes the staff of an active organization that starts being deleted, as a suspension does", async () => {
    db.docs.set("orgs/o1", { name: "School", status: "deleting" });
    for (const [uid, role] of [["a1", "orgAdmin"], ["t1", "teacher"], ["s1", "student"]] as const) {
      db.docs.set(`users/${uid}`, { role, orgId: "o1", name: uid });
      auth.users.set(uid, { uid, customClaims: { role, orgId: "o1" } });
    }
    await fn(billing.onOrgLicence).run(event("active", "deleting"));
    expect((await auth.getUser("a1")).customClaims).toEqual({ role: "orgAdmin", orgId: "o1", frozen: true });
    expect((await auth.getUser("t1")).customClaims).toEqual({ role: "teacher", orgId: "o1", frozen: true });
    expect((await auth.getUser("s1")).customClaims).toEqual({ role: "student", orgId: "o1" });
    expect([...auth.revoked].sort()).toEqual(["a1", "t1"]);
  });
});

describe("no seats for an organization that is suspended or being deleted", () => {
  const as = (data: Record<string, unknown>, who: { uid: string; role: string; orgId?: string } = { uid: "admin", role: "superadmin" }) => ({ auth: { uid: who.uid, token: { role: who.role, orgId: who.orgId } }, data });
  const orgAdmin = { uid: "a1", role: "orgAdmin", orgId: "o1" };
  beforeEach(() => {
    auth.users.set("admin", { uid: "admin", customClaims: { role: "superadmin" } });
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1", frozen: true } });
    db.docs.set("users/s1", { role: "student", orgId: "o1", name: "Amal" });
    db.docs.set("users/s2", { role: "student", orgId: "o1", name: "Zeinab", superSeat: true });
    auth.users.set("s1", { uid: "s1", customClaims: { role: "student", orgId: "o1" } });
    auth.users.set("s2", { uid: "s2", customClaims: { role: "student", orgId: "o1" } });
  });

  it("giving a seat and fillSeats are refused with the status's reason, for its admins and platform admins, and change nothing", async () => {
    for (const status of ["suspended", "deleting"]) {
      db.docs.set("orgs/o1", { name: "School", status, licence: { plan: "super_seat", seats: 10, until: Date.now() + YEAR } });
      for (const who of [orgAdmin, undefined]) {
        expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: true }, who))), status).toBe(`org-${status}`);
        expect(await reason(fn(billing.fillSeats).run(as({ orgId: "o1" }, who))), status).toBe(`org-${status}`);
      }
      // Its own admins take nothing back either: they manage nothing while it is closed.
      expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s2", on: false }, orgAdmin))), status).toBe(`org-${status}`);
    }
    expect(doc("users/s1")).not.toHaveProperty("superSeat");
    expect(doc("users/s2")!.superSeat).toBe(true);
    expect(auth.claimWrites).toEqual([]);
    expect(admin.audits).toEqual([]);
    // Active again: the same calls go through.
    db.docs.set("orgs/o1", { name: "School", status: "active", licence: { plan: "super_seat", seats: 10, until: Date.now() + YEAR } });
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: true })))).toBeUndefined();
    expect(doc("users/s1")!.superSeat).toBe(true);
  });

  it("a platform admin still takes a seat back there: the seat goes, the claims follow, it is audited, and nobody gets one", async () => {
    for (const status of ["suspended", "deleting"]) {
      db.docs.set("orgs/o1", { name: "School", status, licence: { plan: "super_seat", seats: 10, until: Date.now() + YEAR } });
      db.docs.set("users/s2", { role: "student", orgId: "o1", name: "Zeinab", superSeat: true });
      // The claims the seat gave while the organization was active.
      auth.users.set("s2", { uid: "s2", customClaims: { role: "student", orgId: "o1", plan: "super_seat", planUntil: Date.now() + YEAR } });
      auth.claimWrites.length = 0; admin.audits.length = 0;
      expect(await fn(billing.setSeat).run(as({ orgId: "o1", uid: "s2", on: false })), status).toEqual({ ok: true });
      expect(doc("users/s2")!.superSeat, status).toBe(false);
      expect(auth.claimWrites, status).toEqual(["s2"]);
      expect(auth.users.get("s2")!.customClaims, status).toEqual({ role: "student", orgId: "o1" });
      expect(admin.audits, status).toEqual([expect.objectContaining({ action: "setSeat", by: "admin", orgId: "o1", uid: "s2", on: false })]);
      // Taking back what isn't held changes no seat; giving stays refused, to the same person too.
      expect(await fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: false })), status).toEqual({ ok: true });
      expect(doc("users/s1")!.superSeat, status).toBe(false);
      expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s2", on: true }))), status).toBe(`org-${status}`);
      expect(doc("users/s2")!.superSeat, status).toBe(false);
      // Someone who isn't its member is still refused as such.
      db.docs.set("users/x9", { role: "student", orgId: "o2", superSeat: true });
      expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "x9", on: false }))), status).toBe("not-member");
      expect(doc("users/x9")!.superSeat).toBe(true);
    }
  });

  it("fillSeats stops, and gives no more, when the organization is suspended between two passes", async () => {
    db.docs.set("orgs/o1", { name: "School", status: "active", licence: { plan: "super_seat", seats: 1000, until: Date.now() + YEAR } });
    for (let i = 0; i < 900; i++) db.docs.set(`users/m${i}`, { role: "student", orgId: "o1", name: `N${String(i).padStart(4, "0")}` });
    // Suspended once the first pass has committed (its claims refresh is the first Auth read after it), before the
    // second pass reads the organization.
    auth.failGet = (uid) => { if (uid.startsWith("m") && doc("orgs/o1")!.status !== "suspended") db.docs.set("orgs/o1", { ...doc("orgs/o1"), status: "suspended" }); return false; };
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 450, more: false });
    // The 450 of the first pass (Amal, by name, and 449 pupils) beside Zeinab's seat from before; nobody after it.
    expect([...db.docs.entries()].filter(([k, d]) => k.startsWith("users/") && d.superSeat === true)).toHaveLength(451);
  });
});

describe("Give Super, Fill seats and their refusals (enterprise pass)", () => {
  const as = (data: Record<string, unknown>, who: { uid: string; role: string; orgId?: string } = { uid: "admin", role: "superadmin" }) => ({ auth: { uid: who.uid, token: { role: who.role, orgId: who.orgId } }, data });
  const members = (n: number, teachers = 0) => {
    for (let i = 0; i < n; i++) {
      const uid = `m${i}`, role = i < teachers ? "teacher" : "student";
      db.docs.set(`users/${uid}`, { role, orgId: "o1", name: `N${String(i).padStart(4, "0")}` });
      auth.users.set(uid, { uid, customClaims: { role, orgId: "o1" } });
    }
  };
  const seated = () => [...db.docs.entries()].filter(([path, d]) => path.startsWith("users/") && d.superSeat === true).map(([path]) => path.slice(6));
  const passes = () => db.writes.filter((w) => w.path === "orgs/o1/private/seats").length;
  beforeEach(() => {
    auth.users.set("admin", { uid: "admin", customClaims: { role: "superadmin" } });
    db.docs.set("config/plans", { plans: [monthly, seat] });
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 1000, until: Date.now() + YEAR } });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("Give Super writes the credits and the subscription in one transaction: a tutor hold in between isn't handed back", async () => {
    db.docs.set("credits/u1", { plan: 0, planUntil: 0, packs: 50 });
    let held = false;
    db.between = async () => {
      // The tutor's hold (its own transaction on credits/{uid}) lands between the grant's read and its write.
      await db.runTransaction(async (tx) => { const t = tx as Tx; t.set(db.doc("credits/u1"), holdCredits((await t.get(db.doc("credits/u1"))).data() as Credits, 20)!.next); });
      held = true;
    };
    await fn(billing.grantSuper).run(as({ uid: "u1", days: 30 }));
    expect(held).toBe(true);
    // Before: the credits were read, the hold took 20, and the grant wrote the packs it had read (50 again).
    expect(doc("credits/u1")).toMatchObject({ plan: 300, packs: 30 });
    expect(doc("credits/u1")!.planUntil).toBe(doc("subscriptions/u1")!.currentPeriodEnd);
  });
  it("Give Super builds on a payment that lands in between: its days come after the paid period, credits to the same end", async () => {
    let paidEnd = 0;
    db.between = async () => { await recordPayment(pay()); paidEnd = doc("subscriptions/u1")!.currentPeriodEnd; };
    await fn(billing.grantSuper).run(as({ uid: "u1", days: 10 }));
    expect(paidEnd).toBeGreaterThan(Date.now() + 29 * DAY);
    // Before: the grant wrote "now + 10 days" over the 30 days just paid for.
    expect(doc("subscriptions/u1")).toMatchObject({ source: "paymob", status: "active", currentPeriodEnd: paidEnd + 10 * DAY });
    expect(doc("credits/u1")).toMatchObject({ plan: 300, planUntil: paidEnd + 10 * DAY });
  });

  it("Fill seats goes on past 450 in one call: 900 waiting members get a seat and fresh claims, and it says there is no more", async () => {
    members(900, 20);
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 900, more: false });
    expect(seated().length).toBe(900);
    expect(passes()).toBe(2); // two transactions of 450, under the seat lock
    expect(auth.claimWrites.length).toBe(900);
    expect((await auth.getUser("m899")).customClaims).toMatchObject({ role: "student", plan: "super_seat" });
    expect(admin.audits).toContainEqual(expect.objectContaining({ action: "fillSeats", orgId: "o1", given: 900, more: false }));
    // Nobody waits now: a second call gives nothing.
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 0, more: false });
  });
  it("Fill seats stops at the licence's seats, teachers first, counting seats already given", async () => {
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 500, until: Date.now() + YEAR } });
    members(900, 20);
    db.docs.set("users/m899", { ...doc("users/m899"), superSeat: true }); // given by hand before
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 499, more: false });
    expect(seated().length).toBe(500);
    for (let i = 0; i < 20; i++) expect(doc(`users/m${i}`)!.superSeat).toBe(true);
    // No seat free: nothing given, nobody refused.
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 0, more: false });
  });
  it("Fill seats skips someone who left the organization while it ran, so no seat flag follows them elsewhere", async () => {
    members(10);
    db.between = async () => { db.docs.set("users/m3", { ...doc("users/m3"), orgId: "o2", superSeat: false }); };
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 9, more: false });
    expect(doc("users/m3")).toMatchObject({ orgId: "o2", superSeat: false });
    expect(seated().length).toBe(9);
  });
  it("Fill seats says there is more when its time runs out, so the screen calls again", async () => {
    members(900);
    const real = Date.now.bind(Date);
    let late = 0;
    vi.spyOn(Date, "now").mockImplementation(() => real() + late);
    db.between = async () => { late = 241e3; }; // the first pass took four minutes
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 450, more: true });
    late = 0;
    expect(await fn(billing.fillSeats).run(as({ orgId: "o1" }))).toEqual({ given: 450, more: false });
  });

  it("every refusal carries a reason code beside its English words", async () => {
    const orgAdmin = { uid: "a1", role: "orgAdmin", orgId: "o1" }, teacher = { uid: "t1", role: "teacher", orgId: "o1" };
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
    auth.users.set("t1", { uid: "t1", customClaims: { role: "teacher", orgId: "o1" } });
    db.docs.set("users/s1", { role: "student", orgId: "o1", name: "Amal" });
    db.docs.set("users/s2", { role: "student", orgId: "o1", name: "Zeinab", superSeat: true });
    db.docs.set("orgs/o2", { name: "No licence" });
    db.docs.set("users/x1", { role: "student", orgId: "o2", name: "Hoda" });
    // setSuperOn
    expect(await reason(fn(billing.setSuperOn).run(as({ on: "yes" })))).toBe("bad-args");
    // grantSuper and grantCredits
    expect(await reason(fn(billing.grantSuper).run(as({ uid: "u1", days: 0 })))).toBe("bad-days");
    expect(await reason(fn(billing.grantSuper).run(as({ uid: "nobody", days: 30 })))).toBe("no-account");
    expect(await reason(fn(billing.grantSuper).run(as({ days: 30 })))).toBe("no-account");
    expect(await reason(fn(billing.grantCredits).run(as({ uid: "u1", credits: 0 })))).toBe("bad-credits");
    expect(await reason(fn(billing.grantCredits).run(as({ uid: "nobody", credits: 5 })))).toBe("no-account");
    // setOrgLicence
    expect(await reason(fn(billing.setOrgLicence).run(as({ orgId: "gone", seats: 5 })))).toBe("no-org");
    expect(await reason(fn(billing.setOrgLicence).run(as({ seats: 5 })))).toBe("no-org");
    expect(await reason(fn(billing.setOrgLicence).run(as({ orgId: "o1", seats: 0 })))).toBe("bad-seats");
    expect(await reason(fn(billing.setOrgLicence).run(as({ orgId: "o1", seats: 5, days: 0 })))).toBe("bad-days");
    // setSeat
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1" }, orgAdmin)))).toBe("bad-args");
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: true }, teacher)))).toBe("not-org-admin");
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o2", uid: "x1", on: true }, orgAdmin)))).toBe("not-org-admin"); // another organization's admin
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "x1", on: true }, orgAdmin)))).toBe("not-member");
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o2", uid: "x1", on: true })))).toBe("no-licence");
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 1, until: Date.now() + YEAR } });
    expect(await reason(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: true }, orgAdmin)))).toBe("seats-full");
    // fillSeats
    expect(await reason(fn(billing.fillSeats).run(as({}, orgAdmin)))).toBe("bad-args");
    expect(await reason(fn(billing.fillSeats).run(as({ orgId: "o1" }, teacher)))).toBe("not-org-admin");
    expect(await reason(fn(billing.fillSeats).run(as({ orgId: "o2" })))).toBe("no-licence");
    db.docs.set("orgs/o1", { name: "School", licence: { plan: "super_seat", seats: 5, until: Date.now() - DAY } });
    expect(await reason(fn(billing.fillSeats).run(as({ orgId: "o1" }, orgAdmin)))).toBe("no-licence");
    // The English words stay, for an app that doesn't know a code yet.
    await expect(fn(billing.setSeat).run(as({ orgId: "o1", uid: "s1", on: true }, orgAdmin))).rejects.toThrow(/no Darsi Super licence/);
    // Nothing was given or changed by any of them.
    expect(doc("users/s1")).not.toHaveProperty("superSeat");
    expect(auth.claimWrites).toEqual([]);
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
