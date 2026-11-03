/**
 * Darsi Super on the server (docs/SUPER.md, TECHNICAL.md "Darsi Super"):
 * - writeClaims: every role or organization change goes through it, so Super (from a person's subscription, or a seat
 *   in their organization's licence) is never lost. A trigger re-runs it when a subscription or a licence changes.
 * - Plans (config/plans, published as content/plans.json), complimentary Super, org licences and seats.
 * - recordPayment / recordRefund: the one path that turns a verified payment into Super, Darsi's revenue counts and a
 *   Google Analytics `purchase` (the Paymob and Stripe webhooks in payments.ts call it).
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, auth, caller, db, str } from "./admin.js";
import { gaConfig } from "./analytics.js";
import { addPackCredits, claimsFor, entitlement, grantPlanCredits, periodDays, revenueEvent, validateEconomics, validatePlans, type Credits, type Licence, type PaymentRecord, type Plan, type Subscription } from "./billingCore.js";
import { savePublicJson } from "./storage.js";

/* ---------- Claims ---------- */

/** Sets {role, orgId} and, while it lasts, {plan, planUntil}; mirrors the plan on users/{uid} so the phone knows to refresh its token. */
export async function writeClaims(uid: string, role: string, orgId: string | null) {
  const [sub, user, org] = await Promise.all([db.doc(`subscriptions/${uid}`).get(), db.doc(`users/${uid}`).get(), orgId ? db.doc(`orgs/${orgId}`).get() : null]);
  const seat = Boolean(orgId) && user.get("superSeat") === true && user.get("orgId") === orgId;
  const e = entitlement({ sub: sub.data() as Subscription | undefined, licence: org?.get("licence") as Licence | undefined, seat });
  await auth.setCustomUserClaims(uid, claimsFor(role, orgId, e));
  const plan = e ? { plan: e.plan, planUntil: e.until, planSource: e.source } : { plan: null, planUntil: null, planSource: null };
  if (user.exists && ((user.get("plan") ?? null) !== plan.plan || (user.get("planUntil") ?? null) !== plan.planUntil)) await user.ref.set(plan, { merge: true });
  return e;
}

/** Re-runs writeClaims with the role and organization the account already has. */
export async function refreshClaims(uid: string) {
  const u = await auth.getUser(uid).catch(() => null);
  if (!u) return null;
  const c = u.customClaims ?? {};
  return writeClaims(uid, (c.role as string) ?? "learner", (c.orgId as string) ?? null);
}

export const onSubscriptionWrite = onDocumentWritten("subscriptions/{uid}", async (event) => { await refreshClaims(event.params.uid); });

/** A licence that changed (seats, end date, plan): everyone holding one of its seats gets fresh claims. */
export const onOrgLicence = onDocumentUpdated("orgs/{orgId}", async (event) => {
  const before = JSON.stringify(event.data?.before.get("licence") ?? null), after = JSON.stringify(event.data?.after.get("licence") ?? null);
  if (before === after) return;
  const seats = await db.collection("users").where("orgId", "==", event.params.orgId).where("superSeat", "==", true).select().get();
  for (const s of seats.docs) await refreshClaims(s.id);
});

/* ---------- Plans and platform admin actions ---------- */

function requireSuper(req: CallableRequest) {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
  return c;
}
async function plans(): Promise<Plan[]> { return ((await db.doc("config/plans").get()).get("plans") as Plan[] | undefined) ?? []; }

/**
 * Saves the plans with the provider's cost per credit and the EGP rate (every price must keep MIN_MARGIN), and
 * publishes the active plans (content/plans.json, without the costs) for the Super screen, which guests can read too.
 */
export const savePlans = onCall(async (req) => {
  const c = requireSuper(req);
  let list: Plan[], economics;
  try { economics = validateEconomics(req.data?.economics); list = validatePlans(req.data?.plans, economics); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  const ref = db.doc("config/plans");
  const rev = ((await ref.get()).get("rev") as number | undefined ?? 0) + 1;
  await ref.set({ plans: list, economics, rev, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
  await savePublicJson("content/plans.json", { version: rev, plans: list.filter((p) => p.active) });
  await audit("savePlans", c.uid, { count: list.length });
  return { rev };
});

/** Complimentary Super for one person (days > 0), or taking it back (days 0). Never counted as revenue. */
export const grantSuper = onCall(async (req) => {
  const c = requireSuper(req);
  const uid = str(req.data?.uid, 128), days = Math.round(Number(req.data?.days));
  if (!Number.isFinite(days) || days < 0 || days > 3660) throw new HttpsError("invalid-argument", "days must be 0–3660.");
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError("not-found", "No such account.");
  const ref = db.doc(`subscriptions/${uid}`);
  const have = (await ref.get()).data() as Subscription | undefined;
  const all = await plans();
  const plan = str(req.data?.plan, 32) || have?.plan || all.find((p) => p.kind === "individual")?.id || "super";
  const start = Math.max(Date.now(), have && have.status !== "expired" ? have.currentPeriodEnd : 0);
  // Complimentary Super comes with the plan's credits for the time given (pro rata to a 30-day period, at least the plan's allowance once).
  const credits = all.find((p) => p.id === plan)?.credits ?? 0;
  if (days) await creditsRef(uid).set(grantPlanCredits((await creditsRef(uid).get()).data() as Credits | undefined, Math.max(credits, Math.round((credits * days) / 30)), start + days * 864e5));
  await ref.set(days
    ? { plan, status: "active", source: have?.source && have.source !== "grant" ? have.source : "grant", currentPeriodEnd: start + days * 864e5, updatedAt: FieldValue.serverTimestamp() }
    : { status: "expired", currentPeriodEnd: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit("grantSuper", c.uid, { uid, days, plan });
  return { ok: true };
});

/** An organization's licence: a plan, a number of seats and an end date; seats 0 removes it. */
export const setOrgLicence = onCall(async (req) => {
  const c = requireSuper(req);
  const orgId = str(req.data?.orgId, 128), seats = Math.round(Number(req.data?.seats)), days = Math.round(Number(req.data?.days ?? 365));
  const ref = db.doc(`orgs/${orgId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such organization.");
  if (!Number.isFinite(seats) || seats < 0 || seats > 100000) throw new HttpsError("invalid-argument", "seats must be 0–100000.");
  const plan = str(req.data?.plan, 32) || (await plans()).find((p) => p.kind === "seat")?.id || "super_seat";
  await ref.update({ licence: seats ? { plan, seats, until: Date.now() + Math.max(1, days) * 864e5 } : FieldValue.delete() });
  await audit("setOrgLicence", c.uid, { orgId, seats, days, plan });
  return { ok: true };
});

/** Gives or takes back one member's seat (the org's admins, or a platform admin), within the licence's seats. */
export const setSeat = onCall(async (req) => {
  const c = caller(req);
  const orgId = str(req.data?.orgId, 128), uid = str(req.data?.uid, 128), on = req.data?.on === true;
  if (!(c.role === "superadmin" || (c.role === "orgAdmin" && c.orgId === orgId))) throw new HttpsError("permission-denied", "Only this organization's admins can do that.");
  const [org, user] = await Promise.all([db.doc(`orgs/${orgId}`).get(), db.doc(`users/${uid}`).get()]);
  if (user.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.");
  const licence = org.get("licence") as Licence | undefined;
  if (on) {
    if (!licence || licence.until < Date.now()) throw new HttpsError("failed-precondition", "This organization has no Darsi Super licence.");
    const used = (await db.collection("users").where("orgId", "==", orgId).where("superSeat", "==", true).count().get()).data().count;
    if (user.get("superSeat") !== true && used >= licence.seats) throw new HttpsError("resource-exhausted", "Every seat is taken.");
  }
  await user.ref.update({ superSeat: on });
  await refreshClaims(uid);
  return { ok: true };
});

/** Fills the free seats: teachers first, then students, by name (org admins only by hand). */
export const fillSeats = onCall(async (req) => {
  const c = caller(req);
  const orgId = str(req.data?.orgId, 128);
  if (!(c.role === "superadmin" || (c.role === "orgAdmin" && c.orgId === orgId))) throw new HttpsError("permission-denied", "Only this organization's admins can do that.");
  const licence = (await db.doc(`orgs/${orgId}`).get()).get("licence") as Licence | undefined;
  if (!licence || licence.until < Date.now()) throw new HttpsError("failed-precondition", "This organization has no Darsi Super licence.");
  const members = (await db.collection("users").where("orgId", "==", orgId).select("role", "name", "superSeat").get()).docs;
  let free = licence.seats - members.filter((m) => m.get("superSeat") === true).length;
  // Teachers, then students; an org admin who also wants a seat gets one by hand (setSeat).
  const order = (r: string) => (r === "teacher" ? 0 : 1);
  const waiting = members.filter((m) => m.get("superSeat") !== true && (m.get("role") === "teacher" || m.get("role") === "student")).sort((a, b) => order(a.get("role")) - order(b.get("role")) || String(a.get("name")).localeCompare(String(b.get("name"))));
  let given = 0;
  for (const m of waiting) {
    if (free <= 0) break;
    await m.ref.update({ superSeat: true });
    await refreshClaims(m.id);
    free--; given++;
  }
  return { given };
});

/* ---------- Credits ---------- */

/** credits/{uid}: the period's allowance and packs on top (billingCore.Credits); only the functions write it. */
const creditsRef = (uid: string) => db.doc(`credits/${uid}`);

/** Complimentary credits (a pack that never expires), e.g. for a support case. Never counted as revenue. */
export const grantCredits = onCall(async (req) => {
  const c = requireSuper(req);
  const uid = str(req.data?.uid, 128), n = Math.round(Number(req.data?.credits));
  if (!Number.isFinite(n) || n < 1 || n > 100000) throw new HttpsError("invalid-argument", "credits must be 1–100000.");
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError("not-found", "No such account.");
  await db.runTransaction(async (tx) => { const r = creditsRef(uid); tx.set(r, addPackCredits((await tx.get(r)).data() as Credits | undefined, n)); });
  await audit("grantCredits", c.uid, { uid, credits: n });
  return { ok: true };
});

/* ---------- Payments and revenue ---------- */

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function toGoogle(body: ReturnType<typeof revenueEvent>, debug = false) {
  const { mid, secret } = await gaConfig();
  if (!mid || !secret) return { sent: false, reason: "Google Analytics is not connected." };
  const url = `https://www.google-analytics.com/${debug ? "debug/" : ""}mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`;
  const r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { sent: r.ok, status: r.status, ...(debug ? { validation: await r.json().catch(() => null) } : {}) };
}

/**
 * A verified payment, once: payments/{provider}_{ref} is created only if absent, then the subscription or licence is
 * extended by the plan's period, the day's revenue counted, and a Google Analytics `purchase` sent.
 */
export async function recordPayment(p: PaymentRecord) {
  const id = `${p.provider}_${p.ref}`;
  const ref = db.doc(`payments/${id}`);
  const now = Date.now();
  const fresh = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.create(ref, { provider: p.provider, ref: p.ref, kind: p.kind, uid: p.uid ?? null, orgId: p.orgId ?? null, plan: p.plan.id, amount: p.amount, currency: p.currency, seats: p.seats ?? null, checkout: p.checkout ?? null, status: "paid", at: FieldValue.serverTimestamp() });
    return true;
  });
  if (!fresh) return { duplicate: true };
  const extend = periodDays(p.plan) * 864e5;
  if (p.kind === "subscription" && p.uid) {
    const s = db.doc(`subscriptions/${p.uid}`);
    const have = (await s.get()).data() as Subscription | undefined;
    const from = Math.max(now, have && have.status !== "expired" ? have.currentPeriodEnd : 0);
    await s.set({ plan: p.plan.id, status: "active", source: p.provider, currentPeriodEnd: from + extend, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // Each paid period brings the plan's credits; what was left of the last period lapses.
    await creditsRef(p.uid).set(grantPlanCredits((await creditsRef(p.uid).get()).data() as Credits | undefined, p.plan.credits, from + extend));
  } else if (p.kind === "credits" && p.uid) {
    const r = creditsRef(p.uid);
    await db.runTransaction(async (tx) => { tx.set(r, addPackCredits((await tx.get(r)).data() as Credits | undefined, p.plan.credits)); });
  } else if (p.kind === "licence" && p.orgId) {
    const o = db.doc(`orgs/${p.orgId}`);
    const have = (await o.get()).get("licence") as Licence | undefined;
    const from = Math.max(now, have?.until ?? 0);
    await o.update({ licence: { plan: p.plan.id, seats: Math.max(have?.seats ?? 0, p.seats ?? 1), until: from + extend } });
  }
  await db.doc(`analytics/${day(now)}`).set({ day: day(now), revenue: { [p.currency]: { value: FieldValue.increment(p.amount), n: FieldValue.increment(1) }, plan: { [p.plan.id]: FieldValue.increment(1) } } }, { merge: true });
  const ga = await toGoogle(revenueEvent(p, "purchase", now)).catch((e) => ({ sent: false, reason: String(e) }));
  if (!ga.sent) logger.warn("billing: purchase not sent to Google Analytics", { id, ga });
  return { duplicate: false, ga };
}

/** A refund: the payment is marked, the day's refunds counted, Google Analytics told. Access ends with the period. */
export async function recordRefund(p: PaymentRecord) {
  const ref = db.doc(`payments/${p.provider}_${p.ref}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("status") === "refunded") return { changed: false };
  await ref.update({ status: "refunded", refundedAt: FieldValue.serverTimestamp() });
  const now = Date.now();
  await db.doc(`analytics/${day(now)}`).set({ day: day(now), refunds: { [p.currency]: { value: FieldValue.increment(p.amount), n: FieldValue.increment(1) } } }, { merge: true });
  await toGoogle(revenueEvent(p, "refund", now)).catch(() => {});
  return { changed: true };
}

/**
 * Checks the purchase event Google Analytics will get, against its validation endpoint (nothing is recorded there):
 * a platform admin can see the revenue path is right before any real payment.
 */
export const checkRevenueEvent = onCall(async (req) => {
  requireSuper(req);
  const plan = (await plans()).find((p) => p.id === str(req.data?.plan, 32));
  if (!plan) throw new HttpsError("not-found", "Save the plan first.");
  const currency = req.data?.currency === "USD" ? "USD" : "EGP";
  const amount = plan.prices[currency];
  if (!amount) throw new HttpsError("failed-precondition", `This plan has no ${currency} price.`);
  const body = revenueEvent({ provider: "stripe", ref: `check_${Date.now()}`, kind: plan.kind === "seat" ? "licence" : plan.kind === "credits" ? "credits" : "subscription", uid: req.auth!.uid, plan, amount, currency }, "purchase");
  return { body, ...(await toGoogle(body, true)) };
});
