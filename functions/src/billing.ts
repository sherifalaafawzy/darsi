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
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, auth, db, freshCaller, requireSuper, str } from "./admin.js";
import { losesPower } from "./roles.js";
import { gaConfig } from "./analytics.js";
import { addPackCredits, afterRefund, claimsFor, entitlement, grantPlanCredits, paymentEffects, PlanError, renewalOf, revenueEvent, revokeEffects, sameClaims, seatsToRelease, validateEconomics, validatePlans, type Credits, type Licence, type PaidFor, type PaymentRecord, type Plan, type Subscription } from "./billingCore.js";
import { SETTINGS, writeSettingsFile } from "./settings.js";
import { savePublicJson } from "./storage.js";
import { ssoClaimsMoved } from "./ssoStore.js";

/* ---------- Claims ---------- */

/** Organization statuses whose staff carry `frozen` (writeClaims) and get no seat changes (setSeat, fillSeats). */
export const freezes = (status: unknown) => status === "suspended" || status === "deleting";
/**
 * The refusal for seat changes and seat purchases in an organization that is suspended or being deleted, or null.
 * Read from the org document the caller already has (in setSeat and fillSeats, the one their transaction read).
 */
export function orgClosed(status: unknown): HttpsError | null {
  if (status === "suspended") return new HttpsError("permission-denied", "This organization is suspended.", { reason: "org-suspended" });
  if (status === "deleting") return new HttpsError("permission-denied", "This organization is being deleted.", { reason: "org-deleting" });
  return null;
}

type Account = Awaited<ReturnType<typeof auth.getUser>>;
/**
 * The Auth account, or null only when Auth says there is none ("auth/user-not-found"). Any other error is thrown:
 * read as "no such account", an Auth hiccup used to skip a claims refresh for good (paid, and no Super), and on a
 * demotion the end of the account's sessions.
 */
const accountOf = (uid: string): Promise<Account | null> =>
  auth.getUser(uid).catch((e: { code?: string } | null) => { if (e?.code === "auth/user-not-found") return null; throw e; });

/**
 * Sets {role, orgId} and, while it lasts, {plan, planUntil}; mirrors the plan on users/{uid} so the phone knows to refresh
 * its token (and planRenewal, for the Super screen's Cancel renewal). Claims that already say this aren't written
 * again, so refreshing a whole organization a second time (a retried trigger) is cheap.
 * A suspended organization, or one being deleted (orgs/{id}.status "suspended" or "deleting"), puts `frozen: true` in
 * its teachers' and admins' claims, and takes it out again once the organization is active; nothing else changes for
 * its members (a seat's Super stays). The same `frozen` is mirrored on users/{uid}, where the security rules read it
 * for the hour in which a token minted before the suspension is still alive.
 */
export async function writeClaims(uid: string, role: string, orgId: string | null, known?: Account | null) {
  // `unread`: Auth couldn't say what the account holds now (a hiccup, not "no such account"). The new claims are still
  // written, and since nobody can tell whether this change takes power away, the sessions end as if it did.
  let unread = false;
  const [sub, user, org, account] = await Promise.all([db.doc(`subscriptions/${uid}`).get(), db.doc(`users/${uid}`).get(), orgId ? db.doc(`orgs/${orgId}`).get() : null,
    known ?? accountOf(uid).catch((e) => { unread = true; logger.warn("billing: account not read before a claims change", { uid, error: String(e) }); return null; })]);
  const seat = Boolean(orgId) && user.get("superSeat") === true && user.get("orgId") === orgId;
  const mine = sub.data() as Subscription | undefined;
  const e = entitlement({ sub: mine, licence: org?.get("licence") as Licence | undefined, seat });
  const had = account?.customClaims ?? {};
  // Suspended, or being deleted (deleteOrg; never undone): its staff are frozen, the same either way. A deletion runs in
  // steps that can take a while, and an active organization's teachers and admins must not go on changing it (or its
  // people) until deleteOrg releases them; nor does deleting a suspended one hand them their powers back on the way out.
  const frozen = (role === "teacher" || role === "orgAdmin") && freezes(org?.get("status"));
  const claims = claimsFor(role, orgId, e, frozen);
  // `frozen` on the profile too: the security rules read it there as well as in the token (firestore.rules
  // notStopped, storage.rules notStoppedS), because the ID token in an open tab was minted before the suspension and
  // says nothing of it for up to an hour. Before the claims, so a failure in between leaves the profile saying frozen
  // and the rules refusing, never the reverse; on the way back the token's own claim refuses until Auth has the new ones.
  if (user.exists && (user.get("frozen") === true) !== frozen) await user.ref.set({ frozen: frozen ? true : FieldValue.delete() }, { merge: true });
  if (!account || !sameClaims(had, claims)) await auth.setCustomUserClaims(uid, claims);
  // Less power than before (a demotion, leaving an organization, an organization just suspended): the account's
  // sessions end, so no device keeps the old role in a token it refreshes; privileged callables also re-read the
  // claims (freshCaller). Once per suspension: claims that already say frozen end nothing again.
  if (unread || (account && (losesPower(had, { role, orgId }) || (claims.frozen === true && had.frozen !== true)))) await auth.revokeRefreshTokens(uid);
  // School sign-in (ssoStore.ssoClaimsMoved): every organization change passes here, so an account that left one (or
  // whose old organization Auth couldn't say) no longer opens through that school's sign-in. After the claims, and never
  // failing the change: sign-in itself also refuses an identity whose account names another organization (ssoCore).
  if (unread || (typeof had.orgId === "string" && had.orgId && had.orgId !== orgId)) {
    await ssoClaimsMoved(uid, orgId).catch((e) => logger.error("billing: school sign-in not updated after an organization change", { uid, error: String(e).slice(0, 200) }));
  }
  const plan = { ...(e ? { plan: e.plan, planUntil: e.until, planSource: e.source } : { plan: null, planUntil: null, planSource: null }), planRenewal: renewalOf(mine) };
  // `planSource` counts too: onOrgLicence finds by it ("org") the members whose seat went but whose claims didn't follow.
  if (user.exists && ((user.get("plan") ?? null) !== plan.plan || (user.get("planUntil") ?? null) !== plan.planUntil || (user.get("planSource") ?? null) !== plan.planSource || (user.get("planRenewal") ?? null) !== plan.planRenewal)) await user.ref.set(plan, { merge: true });
  return e;
}

/**
 * Re-runs writeClaims with the role and organization the account already has. null: Auth has no such account (deleted;
 * a retried trigger ends quietly on it). Throws when Auth couldn't be read, so retried triggers and refreshAll try again.
 */
export async function refreshClaims(uid: string) {
  const u = await accountOf(uid);
  if (!u) return null;
  const c = u.customClaims ?? {};
  return writeClaims(uid, (c.role as string) ?? "learner", (c.orgId as string) ?? null, u);
}

/**
 * Fresh claims for many people, 25 at a time (sfm-08): one at a time, a large organization's seat holders didn't all
 * get theirs before the function's time ran out, and those left kept the old end date. Throws once all were tried if
 * any failed, so a retried trigger tries again (writeClaims skips the ones already done).
 */
async function refreshAll(ids: string[]) {
  let failed = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const done = await Promise.allSettled(ids.slice(i, i + 25).map((id) => refreshClaims(id)));
    for (const [j, d] of done.entries()) if (d.status === "rejected") { failed++; logger.error("billing: claims not refreshed", { uid: ids[i + j], error: String(d.reason) }); }
  }
  if (failed) throw new Error(`${failed} of ${ids.length} claims not refreshed`);
}

/** How long a retried trigger keeps trying before it gives up (and says so in the log). */
const RETRY_FOR_MS = 6 * 3600e3;

/**
 * A subscription that changed (a payment, a refund, a renewal cancelled, complimentary days): the claims follow.
 * Retried on failure for up to six hours, as onOrgLicence is: paid access must not hang on one attempt (writeClaims is
 * idempotent, and a deleted account ends it quietly). recordPayment and recordRefund also refresh the claims themselves.
 */
export const onSubscriptionWrite = onDocumentWritten({ document: "subscriptions/{uid}", retry: true }, async (event) => {
  if (Date.now() - Date.parse(event.time) > RETRY_FOR_MS) { logger.error("onSubscriptionWrite: gave up retrying", { uid: event.params.uid, time: event.time }); return; }
  await refreshClaims(event.params.uid);
});

/**
 * Seat holders beyond the licence's seats lose their seat (seatsToRelease), under the seat lock, at most 450 a
 * transaction. A licence that was removed takes no seats away: without one they give nothing, and they are there
 * again when it comes back.
 */
async function releaseExtraSeats(orgId: string): Promise<string[]> {
  const out: string[] = [];
  for (;;) {
    const ids = await db.runTransaction(async (tx) => {
      const [org] = await Promise.all([tx.get(db.doc(`orgs/${orgId}`)), tx.get(seatLock(orgId))]);
      const licence = org.get("licence") as Licence | undefined;
      if (!licence) return [];
      const holders = (await tx.get(db.collection("users").where("orgId", "==", orgId).where("superSeat", "==", true).select("role", "name"))).docs;
      const extra = seatsToRelease(holders.map((d) => ({ id: d.id, role: d.get("role"), name: d.get("name") })), licence.seats).slice(0, 450);
      for (const id of extra) tx.update(db.doc(`users/${id}`), { superSeat: false });
      if (extra.length) tx.set(seatLock(orgId), { at: Date.now() });
      return extra;
    });
    out.push(...ids);
    if (ids.length < 450) return out;
  }
}

/**
 * A licence that changed (seats, end date, plan): seats beyond a smaller licence are freed, and everyone who holds
 * or held one gets fresh claims. Retried on failure (writeClaims is idempotent), for up to six hours; a retry finds
 * again the members an earlier try freed but didn't refresh, by their profile's `planSource`.
 * An organization suspended, made active again or starting to be deleted (a status that freezes its staff on one side
 * only: `freezes`): its teachers and admins get fresh claims, so `frozen` goes on or comes off whoever changed the
 * status (a second refresh by that code changes nothing). A suspended organization that starts being deleted
 * refreshes nobody: its staff are frozen either way, until deleteOrg releases them.
 */
export const onOrgLicence = onDocumentUpdated({ document: "orgs/{orgId}", timeoutSeconds: 540, retry: true }, async (event) => {
  const before = JSON.stringify(event.data?.before.get("licence") ?? null), after = JSON.stringify(event.data?.after.get("licence") ?? null);
  const was = event.data?.before.get("status"), now = event.data?.after.get("status");
  const froze = freezes(was) !== freezes(now);
  if (before === after && !froze) return;
  if (Date.now() - Date.parse(event.time) > RETRY_FOR_MS) { logger.error("onOrgLicence: gave up retrying", { orgId: event.params.orgId, time: event.time }); return; }
  const orgId = event.params.orgId;
  const ids: string[] = [];
  if (before !== after) {
    const freed = await releaseExtraSeats(orgId);
    // Also everyone whose profile still says their Super comes from the organization (`planSource: "org"`, the mirror
    // writeClaims keeps and clears only once the claims are written). A member freed by an earlier try whose claims
    // refresh failed, or never ran (a timeout, a crash, a seat taken back by hand), is in neither list on a retry:
    // nobody is extra any more, so they kept Super in their token until the old licence's end while their seat went
    // to someone else. Two equality filters, so no extra index; it empties itself as the claims catch up.
    const [seats, stale] = await Promise.all([
      db.collection("users").where("orgId", "==", orgId).where("superSeat", "==", true).select().get(),
      db.collection("users").where("orgId", "==", orgId).where("planSource", "==", "org").select().get(),
    ]);
    ids.push(...seats.docs.map((s) => s.id), ...freed, ...stale.docs.map((s) => s.id));
  }
  if (froze) {
    // Equality filters only, so no extra index (one query per staff role).
    const staff = await Promise.all(["teacher", "orgAdmin"].map((role) => db.collection("users").where("orgId", "==", orgId).where("role", "==", role).select().get()));
    ids.push(...staff.flatMap((q) => q.docs.map((d) => d.id)));
  }
  await refreshAll([...new Set(ids)]);
});

/* ---------- Plans and platform admin actions ---------- */

async function plans(): Promise<Plan[]> { return ((await db.doc("config/plans").get()).get("plans") as Plan[] | undefined) ?? []; }

/**
 * Saves the plans with the provider's cost per credit and the EGP rate (every price must keep MIN_MARGIN), and
 * publishes the active plans (content/plans.json, without the costs) for the Super screen, which guests can read too.
 */
export const savePlans = onCall(async (req) => {
  const c = await requireSuper(req);
  let list: Plan[], economics;
  // A refusal carries its reason and numbers (PlanError), so the Plans page words it in the admin's language.
  try { economics = validateEconomics(req.data?.economics); list = validatePlans(req.data?.plans, economics); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message, e instanceof PlanError ? { reason: e.reason, ...e.vars } : undefined); }
  const ref = db.doc("config/plans");
  const rev = ((await ref.get()).get("rev") as number | undefined ?? 0) + 1;
  await ref.set({ plans: list, economics, rev, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
  await savePublicJson("content/plans.json", { version: rev, plans: list.filter((p) => p.active) });
  await audit("savePlans", c.uid, { count: list.length });
  return { rev };
});

/**
 * Darsi Super on or off for everyone. Off, the tutor (typed and spoken) and new purchases refuse, and phones hide Super
 * (content/settings.json); subscriptions, credits and payments already under way are kept, so turning it on again
 * gives everyone back what they had.
 */
export const setSuperOn = onCall(async (req) => {
  const c = await requireSuper(req);
  if (typeof req.data?.on !== "boolean") throw new HttpsError("invalid-argument", "on must be true or false.", { reason: "bad-args" });
  await db.doc(SETTINGS).set({ superOn: req.data.on, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid }, { merge: true });
  await writeSettingsFile();
  await audit("setSuperOn", c.uid, { on: req.data.on });
  return { on: req.data.on as boolean };
});

/**
 * Complimentary Super for one person (days 1–3660), or taking it back ({revoke: true}). Never counted as revenue.
 * Taking back is its own flag: an empty Days field (0) used to take Super away when the button said "Give Super".
 * It ends the subscription and its period's credits now (packs stay), and doesn't refund or stop a provider's renewal.
 */
export const grantSuper = onCall(async (req) => {
  const c = await requireSuper(req);
  const revoke = req.data?.revoke === true;
  const uid = str(req.data?.uid, 128), days = revoke ? 0 : Math.round(Number(req.data?.days));
  if (!revoke && (!Number.isFinite(days) || days < 1 || days > 3660)) throw new HttpsError("invalid-argument", "days must be 1–3660.", { reason: "bad-days" });
  if (!uid || !(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  const ref = db.doc(`subscriptions/${uid}`);
  if (revoke) {
    // The subscription ends now and its period's credits with it; packs stay (revokeEffects). One transaction with the
    // tutor's holds and charges on credits/{uid}, so a call under way can't write back an allowance taken away.
    const done = await db.runTransaction(async (tx) => {
      const [s, cr] = await Promise.all([tx.get(ref), tx.get(creditsRef(uid))]);
      const fx = revokeEffects({ sub: s.data() as Subscription | undefined, credits: cr.data() as Credits | undefined });
      if (fx.sub) tx.set(ref, { ...fx.sub, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (fx.credits) tx.set(creditsRef(uid), fx.credits);
      return { sub: !!fx.sub, credits: !!fx.credits };
    });
    await audit("grantSuper", c.uid, { uid, days: 0, revoke: true, ended: done.sub, creditsEnded: done.credits });
    return { ok: true };
  }
  const all = await plans();
  // The subscription and the credits are read and written in one transaction, as when taking back. Read apart, a
  // tutor hold or a payment that landed between the read and the write was overwritten: held credits came back, or
  // the allowance ended on another day than the subscription.
  const plan = await db.runTransaction(async (tx) => {
    const [s, cr] = await Promise.all([tx.get(ref), tx.get(creditsRef(uid))]);
    const have = s.data() as Subscription | undefined, now = Date.now();
    const plan = str(req.data?.plan, 32) || have?.plan || all.find((p) => p.kind === "individual")?.id || "super";
    const start = Math.max(now, have && have.status !== "expired" ? have.currentPeriodEnd : 0);
    // Complimentary Super comes with the plan's credits for the time given (pro rata to a 30-day period, at least the plan's allowance once).
    const credits = all.find((p) => p.id === plan)?.credits ?? 0;
    // Days given on top of a paid plan that still runs keep its source, and a card subscription its renewal status (a
    // cancelled renewal stays cancelled, so the Super screen doesn't say it renews). Otherwise the time is complimentary,
    // and the id of a card subscription that ended goes, so it can't read as one that renews by itself.
    const paidLive = !!have && have.source !== "grant" && have.status !== "expired" && have.currentPeriodEnd > now;
    tx.set(creditsRef(uid), grantPlanCredits(cr.data() as Credits | undefined, Math.max(credits, Math.round((credits * days) / 30)), start + days * 864e5));
    tx.set(ref, { plan, status: paidLive && have!.source === "stripe" ? have!.status : "active", source: paidLive ? have!.source : "grant", ...(paidLive ? {} : { stripeSub: FieldValue.delete() }), currentPeriodEnd: start + days * 864e5, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return plan;
  });
  await audit("grantSuper", c.uid, { uid, days, plan });
  return { ok: true };
});

/**
 * An organization's licence: a plan, a number of seats (1–100000) and days from now (at least 1); {remove: true}
 * removes it. Removing is its own flag, like taking Super back: an empty Seats field used to remove the licence.
 */
export const setOrgLicence = onCall(async (req) => {
  const c = await requireSuper(req);
  const remove = req.data?.remove === true;
  const orgId = str(req.data?.orgId, 128), seats = remove ? 0 : Math.round(Number(req.data?.seats)), days = remove ? 0 : Math.round(Number(req.data?.days ?? 365));
  if (!orgId) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  const ref = db.doc(`orgs/${orgId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such organization.", { reason: "no-org" });
  if (!remove && (!Number.isFinite(seats) || seats < 1 || seats > 100000)) throw new HttpsError("invalid-argument", "seats must be 1–100000.", { reason: "bad-seats" });
  if (!remove && (!Number.isFinite(days) || days < 1)) throw new HttpsError("invalid-argument", "days must be at least 1.", { reason: "bad-days" });
  const plan = str(req.data?.plan, 32) || (await plans()).find((p) => p.kind === "seat")?.id || "super_seat";
  await ref.update({ licence: remove ? FieldValue.delete() : { plan, seats, until: Date.now() + days * 864e5 } });
  await audit("setOrgLicence", c.uid, { orgId, seats, days, plan, remove });
  return { ok: true };
});

/**
 * Seat changes for one organization run one at a time: each holds orgs/{orgId}/private/seats in its transaction, so
 * two admins (or two taps) can't both see the last free seat and both take it.
 */
const seatLock = (orgId: string) => db.doc(`orgs/${orgId}/private/seats`);
const seatsTaken = async (orgId: string) => (await db.collection("users").where("orgId", "==", orgId).where("superSeat", "==", true).count().get()).data().count;

/**
 * Gives or takes back one member's seat (the org's admins, or a platform admin), within the licence's seats. Not in an
 * organization that is suspended or being deleted (`org-suspended`, `org-deleting`): nobody is given a seat there, and
 * its own admins change nothing. A platform admin may still take a seat back (on: false), which gives nothing to
 * anyone: the way to end one person's Darsi Super while the organization is closed.
 */
export const setSeat = onCall(async (req) => {
  const c = await freshCaller(req);
  const orgId = str(req.data?.orgId, 128), uid = str(req.data?.uid, 128), on = req.data?.on === true;
  if (!orgId || !uid) throw new HttpsError("invalid-argument", "orgId and uid are required.", { reason: "bad-args" });
  if (!(c.role === "superadmin" || (c.role === "orgAdmin" && c.orgId === orgId))) throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  await db.runTransaction(async (tx) => {
    const lock = seatLock(orgId);
    const [org, user] = await Promise.all([tx.get(db.doc(`orgs/${orgId}`)), tx.get(db.doc(`users/${uid}`)), tx.get(lock)]);
    // On the org document this transaction holds, so a suspension that lands meanwhile retries it into a refusal.
    const closed = orgClosed(org.get("status"));
    if (closed && (on || c.role !== "superadmin")) throw closed;
    if (user.get("orgId") !== orgId) throw new HttpsError("not-found", "Not a member of this organization.", { reason: "not-member" });
    const licence = org.get("licence") as Licence | undefined;
    if (on && user.get("superSeat") !== true) {
      if (!licence || licence.until < Date.now()) throw new HttpsError("failed-precondition", "This organization has no Darsi Super licence.", { reason: "no-licence" });
      if ((await seatsTaken(orgId)) >= licence.seats) throw new HttpsError("resource-exhausted", "Every seat is taken.", { reason: "seats-full" });
    }
    tx.update(user.ref, { superSeat: on });
    tx.set(lock, { at: Date.now() });
  });
  // The seat is already given or taken: the claims are tried twice (an Auth hiccup). If both fail the call fails, and
  // a seat taken back still shows in the profile's `planSource`, which the licence trigger's next run sweeps (onOrgLicence).
  await refreshClaims(uid).catch(() => refreshClaims(uid));
  await audit("setSeat", c.uid, { orgId, uid, on });
  return { ok: true };
});

/** How many seats one transaction gives (it holds at most 500 writes), and how long one call keeps filling. */
const FILL_PASS = 450, FILL_FOR_MS = 240e3;

/**
 * Fills the free seats: teachers first, then students, by name (org admins only by hand). The waiting members are read
 * once, outside any transaction (before, every member was read inside the callback, and again on each of its
 * retries), and one call stopped at 450 seats. Now the server goes on, pass after pass, each one transaction of at
 * most 450 seats under the seat lock, until no seat is free, nobody waits, or 240 s have passed. A pass reads again
 * the people it is about to seat: someone who left the organization or got a seat by hand meanwhile is skipped (a
 * seat flag written on them could count in another organization). Claims are refreshed after each pass, 25 at a time.
 * Answers {given, more}; `more`: time ran out with free seats and people still waiting, so the screen calls again.
 * Refused, like setSeat, for an organization that is suspended or being deleted (`org-suspended`, `org-deleting`).
 */
export const fillSeats = onCall({ timeoutSeconds: 300 }, async (req) => {
  const c = await freshCaller(req);
  const orgId = str(req.data?.orgId, 128);
  if (!orgId) throw new HttpsError("invalid-argument", "orgId is required.", { reason: "bad-args" });
  if (!(c.role === "superadmin" || (c.role === "orgAdmin" && c.orgId === orgId))) throw new HttpsError("permission-denied", "Only this organization's admins can do that.", { reason: "not-org-admin" });
  const started = Date.now();
  const waits = (m: { get(f: string): unknown }) => m.get("superSeat") !== true && (m.get("role") === "teacher" || m.get("role") === "student");
  // Teachers, then students; an org admin who also wants a seat gets one by hand (setSeat).
  const order = (r: unknown) => (r === "teacher" ? 0 : 1);
  const members = (await db.collection("users").where("orgId", "==", orgId).select("role", "name", "superSeat").get()).docs;
  const waiting = members.filter(waits).sort((a, b) => order(a.get("role")) - order(b.get("role")) || String(a.get("name")).localeCompare(String(b.get("name")))).map((m) => m.id);
  let at = 0, given = 0, more = false;
  for (let pass = 0; ; pass++) {
    const done = await db.runTransaction(async (tx) => {
      const lock = seatLock(orgId);
      const [org] = await Promise.all([tx.get(db.doc(`orgs/${orgId}`)), tx.get(lock)]);
      // An organization suspended or being deleted gets no seats: refused at the start, and the filling stops if that
      // happens between two passes (as for a licence that ends).
      const closed = orgClosed(org.get("status"));
      if (closed) {
        if (!pass) throw closed;
        return { ids: [] as string[], tried: 0, free: 0 };
      }
      const licence = org.get("licence") as Licence | undefined;
      if (!licence || licence.until < Date.now()) {
        // No licence when the call starts is a refusal; one that ended between two passes only stops the filling.
        if (!pass) throw new HttpsError("failed-precondition", "This organization has no Darsi Super licence.", { reason: "no-licence" });
        return { ids: [] as string[], tried: 0, free: 0 };
      }
      const free = licence.seats - (await seatsTaken(orgId));
      const next = waiting.slice(at, at + Math.max(0, Math.min(FILL_PASS, free)));
      // One batched read for the pass (getAll refuses an empty list).
      const ids = (next.length ? await tx.getAll(...next.map((id) => db.doc(`users/${id}`))) : []).filter((m) => m.get("orgId") === orgId && waits(m)).map((m) => m.id);
      for (const id of ids) tx.update(db.doc(`users/${id}`), { superSeat: true });
      tx.set(lock, { at: Date.now() });
      return { ids, tried: next.length, free: free - ids.length };
    });
    given += done.ids.length; at += done.tried;
    // The seats are given either way; anyone whose claims failed is tried once more, and logged if that fails too.
    await refreshAll(done.ids).catch(() => refreshAll(done.ids)).catch((e) => logger.error("fillSeats: some claims not refreshed", { orgId, error: String(e) }));
    if (!done.tried || done.free <= 0 || at >= waiting.length) break;
    if (Date.now() - started > FILL_FOR_MS) { more = true; break; }
  }
  await audit("fillSeats", c.uid, { orgId, given, more });
  return { given, more };
});

/* ---------- Credits ---------- */

/** credits/{uid}: the period's allowance and packs on top (billingCore.Credits); only the functions write it. */
const creditsRef = (uid: string) => db.doc(`credits/${uid}`);

/** Complimentary credits (a pack that never expires), e.g. for a support case. Never counted as revenue. */
export const grantCredits = onCall(async (req) => {
  const c = await requireSuper(req);
  const uid = str(req.data?.uid, 128), n = Math.round(Number(req.data?.credits));
  if (!Number.isFinite(n) || n < 1 || n > 100000) throw new HttpsError("invalid-argument", "credits must be 1–100000.", { reason: "bad-credits" });
  if (!uid || !(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError("not-found", "No such account.", { reason: "no-account" });
  await db.runTransaction(async (tx) => { const r = creditsRef(uid); tx.set(r, addPackCredits((await tx.get(r)).data() as Credits | undefined, n)); });
  await audit("grantCredits", c.uid, { uid, credits: n });
  return { ok: true };
});

/* ---------- Payments and revenue ---------- */

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/**
 * The buyer's claims straight after a payment or a refund, without waiting for (or hanging on) onSubscriptionWrite.
 * It never fails the webhook: the money is already recorded, and the retried trigger still follows.
 */
const claimsAfter = async (uid: string | undefined, what: "payment" | "refund") => {
  if (uid) await refreshClaims(uid).catch((e) => logger.error(`billing: claims not refreshed after a ${what}`, { uid, error: String(e) }));
};
/** A plan id as a map key in analytics/{day}: plan ids are platform admins' (validatePlans), never a payer's. */
const safeKey = (id: string) => (/^[A-Za-z0-9_-]{1,32}$/.test(id) ? id : "other");

async function toGoogle(body: ReturnType<typeof revenueEvent>, debug = false) {
  const { mid, secret } = await gaConfig();
  if (!mid || !secret) return { sent: false, reason: "Google Analytics is not connected." };
  const url = `https://www.google-analytics.com/${debug ? "debug/" : ""}mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`;
  const r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { sent: r.ok, status: r.status, ...(debug ? { validation: await r.json().catch(() => null) } : {}) };
}

/**
 * A verified payment, once (sfm-06): payments/{provider}_{ref}, what it buys (paymentEffects: the subscription and
 * its credits, a pack, or the licence) and its checkout are written in one transaction, so either all of it happens
 * or none of it does, and a webhook that failed half-way is retried in full instead of being taken for a duplicate.
 * A licence for an organization that no longer exists is kept as "unapplied" and audited for a platform admin.
 * Then the buyer's claims are refreshed (never failing the payment), the day's revenue is counted and a Google
 * Analytics `purchase` sent.
 */
export async function recordPayment(p: PaymentRecord): Promise<{ duplicate: boolean; unapplied?: boolean; ga?: unknown }> {
  const id = `${p.provider}_${p.ref}`;
  const ref = db.doc(`payments/${id}`);
  const now = Date.now();
  const subRef = p.kind === "subscription" && p.uid ? db.doc(`subscriptions/${p.uid}`) : null;
  const credRef = p.kind !== "licence" && p.uid ? creditsRef(p.uid) : null;
  const orgRef = p.kind === "licence" && p.orgId ? db.doc(`orgs/${p.orgId}`) : null;
  const chkRef = p.checkout ? db.doc(`checkouts/${p.checkout}`) : null;
  const fx = await db.runTransaction(async (tx) => {
    // Every read before any write (Firestore's rule for transactions).
    const [mark, sub, cred, org, chk] = await Promise.all([tx.get(ref), subRef ? tx.get(subRef) : null, credRef ? tx.get(credRef) : null, orgRef ? tx.get(orgRef) : null, chkRef ? tx.get(chkRef) : null]);
    if (mark.exists) return null;
    const e = paymentEffects(p, { sub: sub?.data() as Subscription | undefined, credits: cred?.data() as Credits | undefined, org: org?.exists ? { licence: (org.get("licence") as Licence | undefined) ?? null } : null }, now);
    const paid: PaidFor = e.kind === "subscription" ? { added: e.added } : e.kind === "licence" ? { licence: { before: e.before, after: e.licence } } : {};
    tx.create(ref, { provider: p.provider, ref: p.ref, kind: p.kind, uid: p.uid ?? null, orgId: p.orgId ?? null, plan: p.plan.id, amount: p.amount, currency: p.currency, seats: p.seats ?? null, checkout: p.checkout ?? null,
      status: e.kind === "unapplied" ? "unapplied" : "paid", ...(e.kind === "unapplied" ? { reason: e.reason } : {}), ...paid, at: FieldValue.serverTimestamp() });
    // A subscription that isn't a card one (any more) drops the id of a card subscription that ended, so that one's late
    // webhooks (stripeWebhook's ownerOf) can't touch it.
    if (e.kind === "subscription" && subRef && credRef) { tx.set(subRef, { ...e.sub, ...(e.sub.stripeSub ? {} : { stripeSub: FieldValue.delete() }), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); tx.set(credRef, e.credits); }
    else if (e.kind === "credits" && credRef) tx.set(credRef, e.credits);
    else if (e.kind === "licence" && orgRef) tx.update(orgRef, { licence: e.licence });
    if (chk?.exists) tx.update(chkRef!, { status: e.kind === "unapplied" ? "unapplied" : "paid", paidAt: FieldValue.serverTimestamp(), [`payments.${p.ref}`]: true });
    return e;
  });
  // Also for a payment already recorded: the provider's retry of a webhook that died right here finishes the job.
  await claimsAfter(p.uid, "payment");
  if (!fx) return { duplicate: true };
  if (fx.kind === "unapplied") {
    logger.error("billing: a payment could not be applied", { id, reason: fx.reason });
    await audit("paymentUnapplied", "webhook", { payment: id, kind: p.kind, reason: fx.reason, uid: p.uid ?? null, orgId: p.orgId ?? null }).catch(() => {});
  }
  // Bookkeeping never fails the payment: the webhook's retry would find it recorded and stop there.
  await db.doc(`analytics/${day(now)}`).set({ day: day(now), revenue: { [p.currency]: { value: FieldValue.increment(p.amount), n: FieldValue.increment(1) }, plan: { [safeKey(p.plan.id)]: FieldValue.increment(1) } } }, { merge: true })
    .catch((e) => logger.error("billing: revenue not counted", { id, error: String(e) }));
  const ga = await toGoogle(revenueEvent(p, "purchase", now)).catch((e) => ({ sent: false, reason: String(e) }));
  if (!ga.sent) logger.warn("billing: purchase not sent to Google Analytics", { id, ga });
  return { duplicate: false, unapplied: fx.kind === "unapplied", ga };
}

/**
 * A full refund: the payment is marked (once), what it bought is taken back (afterRefund: the refunded period of a
 * subscription or licence, a pack's unspent credits), the claims follow, the day's refunds are counted and Google
 * Analytics told. Logged in audit for a platform admin to look at.
 */
export async function recordRefund(p: PaymentRecord) {
  const ref = db.doc(`payments/${p.provider}_${p.ref}`);
  const now = Date.now();
  const changed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") === "refunded") return false;
    const subRef = p.uid ? db.doc(`subscriptions/${p.uid}`) : null, credRef = p.uid ? creditsRef(p.uid) : null, orgRef = p.orgId ? db.doc(`orgs/${p.orgId}`) : null;
    const [sub, cred, org] = await Promise.all([subRef ? tx.get(subRef) : null, credRef ? tx.get(credRef) : null, orgRef && p.kind === "licence" ? tx.get(orgRef) : null]);
    // What the payment did (kept on it since sfm-01): an "unapplied" one gave nothing, so nothing is taken back.
    const paid: PaidFor = { added: snap.get("added") ?? null, seats: snap.get("seats") ?? null, licence: snap.get("licence") ?? null };
    const back = snap.get("status") === "unapplied" ? {} : afterRefund(p.kind, p.plan, { sub: sub?.data() as Subscription | undefined, credits: cred?.data() as Credits | undefined, licence: org?.get("licence") as Licence | undefined, paid }, now);
    tx.update(ref, { status: "refunded", refundedAt: FieldValue.serverTimestamp() });
    if (back.sub && subRef) tx.set(subRef, { ...back.sub, updatedAt: FieldValue.serverTimestamp() });
    if (back.credits && credRef) tx.set(credRef, back.credits);
    if (back.licence !== undefined && orgRef) tx.update(orgRef, { licence: back.licence ?? FieldValue.delete() });
    return true;
  });
  // The buyer's claims follow here, and again through the retried triggers (onSubscriptionWrite; a licence's seat
  // holders through onOrgLicence).
  await claimsAfter(p.uid, "refund");
  if (!changed) return { changed: false };
  await audit("refund", "webhook", { payment: `${p.provider}_${p.ref}`, kind: p.kind, uid: p.uid ?? null, orgId: p.orgId ?? null }).catch(() => {});
  await db.doc(`analytics/${day(now)}`).set({ day: day(now), refunds: { [p.currency]: { value: FieldValue.increment(p.amount), n: FieldValue.increment(1) } } }, { merge: true })
    .catch((e) => logger.error("billing: refund not counted", { error: String(e) }));
  await toGoogle(revenueEvent(p, "refund", now)).catch(() => {});
  return { changed: true };
}

/**
 * Checks the purchase event Google Analytics will get, against its validation endpoint (nothing is recorded there):
 * a platform admin can see the revenue path is right before any real payment.
 */
export const checkRevenueEvent = onCall(async (req) => {
  await requireSuper(req);
  const plan = (await plans()).find((p) => p.id === str(req.data?.plan, 32));
  if (!plan) throw new HttpsError("not-found", "Save the plan first.");
  const currency = req.data?.currency === "USD" ? "USD" : "EGP";
  const amount = plan.prices[currency];
  if (!amount) throw new HttpsError("failed-precondition", `This plan has no ${currency} price.`);
  const body = revenueEvent({ provider: "stripe", ref: `check_${Date.now()}`, kind: plan.kind === "seat" ? "licence" : plan.kind === "credits" ? "credits" : "subscription", uid: req.auth!.uid, plan, amount, currency }, "purchase");
  return { body, ...(await toGoogle(body, true)) };
});
