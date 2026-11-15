/**
 * Analytics (TECHNICAL.md "Analytics").
 * - `collect`: phones send their queued events here in one small batch (darsiai.org/api/collect, a Hosting rewrite,
 *   so no second connection). It counts them per day in analytics/{yyyy-mm-dd}, counts active phones through
 *   analyticsDevices/{id}, and forwards the events to Google Analytics (the Firebase web stream) when a platform
 *   admin has connected it on /super/analytics (`setGaConfig`). A batch sent again is counted once, the batches of one
 *   moment share one write, and Google Analytics being slow or down never fails or holds a phone's request.
 * - `statsJob` (daily) and `refreshStats` (a platform admin, on demand): accounts and organizations from users'
 *   summaries, read in pages, into stats/overview. statsJob leaves its heartbeat in stats/jobs.
 */
import { gunzipSync } from "node:zlib";
import { FieldPath, FieldValue, Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { audit, db, freshCaller } from "./admin.js";
import { superStats, type Subscription } from "./billingCore.js";
import { addCounts, capBuilds, dailyCounts, dayOf, measurementPayloads, overviewAcc, parseBatch, sanitize, OTHER, type Batch, type Counts, type Known, type OrgRow } from "./analyticsCore.js";
import { clientIp } from "./clientIp.js";
import { catalogOf } from "./courses.js";
import { loadLanguages, loadTracks } from "./settings.js";
import { LAB_IDS } from "./shared/labs.js";

/** Counts become increments, so batches arriving at the same moment add up instead of overwriting each other. */
function increments(c: Counts): Record<string, unknown> {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "number" ? FieldValue.increment(v) : increments(v)]));
}

/** The Google Analytics stream, as set on /super/analytics; re-read at most every 10 minutes per instance. */
let ga: { at: number; mid: string; secret: string } | null = null;
export async function gaConfig() {
  if (ga && Date.now() - ga.at < 10 * 60e3) return ga;
  const d = (await db.doc("config/analytics").get()).data() ?? {};
  ga = { at: Date.now(), mid: typeof d.measurementId === "string" ? d.measurementId : "", secret: typeof d.apiSecret === "string" ? d.apiSecret : "" };
  return ga;
}

/**
 * The batch, on to Google Analytics. It never fails and never holds the phone's request: Darsi's own counts are in by
 * now, and an error here used to answer 500, so the phone sent the whole batch again and it was counted twice. One
 * attempt per payload (3 s each, side by side), a failed read of the settings is only logged, and the whole of it
 * gives up after 4 s. It still runs before the answer: Cloud Functions may stop an instance's work once it has answered.
 */
const FORWARD_MS = 4000, PAYLOAD_MS = 3000;
async function forward(batch: Batch, nowSec: number): Promise<void> {
  const send = async () => {
    const { mid, secret } = await gaConfig();
    if (!mid || !secret) return;
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`;
    await Promise.all(measurementPayloads(batch, nowSec).map(async (body) => {
      const r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(PAYLOAD_MS) }).catch((e: Error) => e);
      if (r instanceof Error || !r.ok) logger.warn("analytics: Google Analytics refused a batch", { status: r instanceof Error ? r.message : r.status });
    }));
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    send().catch((e) => logger.warn("analytics: Google Analytics not reached", { error: String(e) })),
    new Promise<void>((late) => { timer = setTimeout(() => { logger.warn("analytics: Google Analytics too slow, batch not forwarded"); late(); }, FORWARD_MS); }),
  ]);
  clearTimeout(timer); // no timer outlives the request
}

/**
 * A phone seen for the first time today (or ever) adds to the day's active (and new) phones: `counts` for the day, and
 * `fields` for its own record, which is written after the counts (countBatch), so a failed count is retried in full.
 */
function deviceSeen(snap: DocumentSnapshot, batch: Batch, day: string) {
  const last = snap.get("last") as string | undefined;
  if (last && last >= day) return null;
  const { role, lang, org, aud, inst } = batch.ctx;
  return {
    counts: { dev: 1, ...(snap.exists ? {} : { devNew: 1 }), devRole: { [role]: 1 } } as Counts,
    fields: { last: day, ...(snap.exists ? {} : { first: day }), role, lang, inst, ...(org ? { org } : {}), ...(aud ? { aud } : {}) },
  };
}

/**
 * The builds each day's errBuild already names (capBuilds keeps a day to 20), per instance: read from the day's
 * document the first time a batch brings errors for that day, and again after 10 minutes (what other instances added).
 * Instances don't see each other's additions in between, so a day can end with a few more than 20 names (at most 20 per
 * instance): the point is that made-up builds can't fill the document.
 */
const builds = new Map<string, { at: number; names: Promise<Set<string>> }>();
function buildsOf(day: string): Promise<Set<string>> {
  const hit = builds.get(day);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.names;
  const names = (async () => {
    const mine = hit ? await hit.names.catch(() => new Set<string>()) : new Set<string>();
    const stored = (await db.doc(`analytics/${day}`).get()).get("errBuild") as unknown;
    return new Set([...mine, ...Object.keys(stored && typeof stored === "object" ? stored : {})].filter((b) => b !== OTHER));
  })();
  if (builds.size > 40) builds.clear(); // a batch reaches back 30 days at most
  builds.set(day, { at: Date.now(), names });
  names.catch(() => { if (builds.get(day)?.names === names) builds.delete(day); });
  return names;
}

/**
 * One write for the batches of one moment. Every batch used to be its own write to analytics/{day}, a document
 * Firestore takes about one write a second on; now the counts of the requests that arrive within 250 ms (on this
 * instance) are added up and written once, each day's to its own document, all days in one commit (so a batch that
 * spans two days is in both or in neither). Every request of the window waits for that commit and answers by it. The
 * 250 ms timer belongs to the window's first request, which is still waiting when it fires.
 */
const COALESCE_MS = 250;
interface Window { days: Record<string, Counts>; done: Promise<void> }
let pending: Window | null = null;
function countSoon(days: Record<string, Counts>): Promise<void> {
  if (!pending) {
    const mine: Window = { days: {}, done: Promise.resolve() };
    mine.done = new Promise<void>((go) => setTimeout(go, COALESCE_MS)).then(async () => {
      if (pending === mine) pending = null; // batches from now on start the next window
      const write = db.batch();
      for (const [day, c] of Object.entries(mine.days)) write.set(db.doc(`analytics/${day}`), { ...increments(c), day }, { merge: true });
      await write.commit();
    });
    // Every request of the window awaits `done` and answers by it; this only keeps a failed write from being an
    // unhandled rejection (which ends the instance, and every request on it) should a window ever be left with no one waiting.
    mine.done.catch(() => {});
    pending = mine;
  }
  for (const [day, c] of Object.entries(days)) addCounts((pending.days[day] ??= {}), c);
  return pending.done;
}

/** One phone's batches are counted one at a time (on this instance), so the second of two sees what the first left on the phone's record. */
const busy = new Map<string, Promise<unknown>>();
async function inTurn<T>(device: string, work: () => Promise<T>): Promise<T> {
  const mine = (busy.get(device) ?? Promise.resolve()).catch(() => {}).then(work);
  busy.set(device, mine);
  try { return await mine; } finally { if (busy.get(device) === mine) busy.delete(device); }
}

/**
 * Counts one batch, once. A phone sends a batch again whenever it got no 2xx answer (a lost connection, a 500), with
 * the same batch id (`b`); the id of the last batch counted is kept on the phone's record (lastBatch), written after
 * the counts. So an answer lost after the counts were written is caught when the batch comes again, and a batch whose
 * counts failed is counted in full the next time. Batches without an id (older apps) are counted every time, as before.
 */
async function countBatch(raw: Batch): Promise<Batch | null> {
  const ref = db.doc(`analyticsDevices/${raw.ctx.d}`);
  const [batch, snap] = await Promise.all([clean(raw), ref.get()]);
  if (raw.b && snap.get("lastBatch") === raw.b) return null;
  const days = dailyCounts(batch);
  for (const [day, c] of Object.entries(days)) if (c.errBuild) days[day] = capBuilds(c, await buildsOf(day));
  const latest = dayOf(Math.max(...batch.events.map((e) => e.t)));
  const device = deviceSeen(snap, batch, latest);
  if (device) days[latest] = { ...(days[latest] ?? {}), ...device.counts };
  await countSoon(days);
  // From here the batch is counted, so nothing may fail the request any more (the phone would send it all again).
  const record = { ...(device?.fields ?? {}), ...(raw.b ? { lastBatch: raw.b } : {}) };
  if (Object.keys(record).length) await ref.set(record, { merge: true }).catch((e) => logger.warn("analytics: device record not written", { error: String(e) }));
  return batch;
}

/**
 * Requests per minute, per instance: per address and device (L6: the client's address as clientIp.ts finds it behind
 * Hosting and Cloudflare), per address alone (a school's phones share one), and for the whole instance: the brake that
 * holds even when someone makes up addresses and device ids.
 */
const seen = new Map<string, { at: number; n: number }>();
function over(key: string, max: number, now: number) {
  const s = seen.get(key);
  if (!s || now - s.at > 60e3) { if (seen.size > 20000) seen.clear(); seen.set(key, { at: now, n: 1 }); return false; }
  return ++s.n > max;
}
let instance = { at: 0, n: 0 };
export const LIMITS = { device: 12, address: 300, instance: 3000 };
export function tooMany(ip: string, device: string, now = Date.now()) {
  if (now - instance.at > 60e3) instance = { at: now, n: 0 };
  if (++instance.n > LIMITS.instance) return true;
  return over(`a:${ip}`, LIMITS.address, now) || over(`d:${ip}:${device}`, LIMITS.device, now);
}
export { clientIp };

/** The ids counts may be kept under (sanitize), re-read at most every 10 minutes per instance. */
let knownIds: { at: number; v: Promise<Known> } | null = null;
const orgCatalogs = new Map<string, { at: number; ids: Promise<Set<string>> }>();
function loadKnown(): Promise<Known> {
  if (knownIds && Date.now() - knownIds.at < 10 * 60e3) return knownIds.v;
  const v = (async (): Promise<Known> => {
    const [pub, orgs, tracks, langs] = await Promise.all([catalogOf("public"), db.collection("orgs").where("status", "==", "active").select().get(), loadTracks(), loadLanguages()]);
    return {
      units: new Set(pub.map((u) => u.id)), labs: new Set(LAB_IDS), orgs: new Set(orgs.docs.map((d) => d.id)),
      tracks: new Set(tracks.map((t) => t.id)), langs: new Set(["en", "ar", "und", ...langs.map((l) => l.code)]),
    };
  })();
  knownIds = { at: Date.now(), v };
  v.catch(() => { if (knownIds?.v === v) knownIds = null; });
  return v;
}
/** The org's own course ids, for batches from its members. */
function orgUnits(orgId: string): Promise<Set<string>> {
  const hit = orgCatalogs.get(orgId);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.ids;
  const ids = catalogOf(orgId).then((c) => new Set(c.map((u) => u.id)));
  orgCatalogs.set(orgId, { at: Date.now(), ids });
  ids.catch(() => orgCatalogs.delete(orgId));
  return ids;
}
async function clean(batch: Batch): Promise<Batch> {
  const k = await loadKnown();
  const org = batch.ctx.org && k.orgs.has(batch.ctx.org) ? batch.ctx.org : null;
  return sanitize(batch, org ? { ...k, units: new Set([...k.units, ...(await orgUnits(org))]) } : k);
}

export const collect = onRequest({ maxInstances: 3, memory: "256MiB", timeoutSeconds: 30, concurrency: 80 }, async (req, res) => {
  // Same origin through Hosting; the cloudfunctions.net address answers other origins too, for the emulators.
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "POST").set("Access-Control-Allow-Headers", "Content-Type").status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }
  const raw = req.rawBody;
  if (!raw || raw.length > 64 * 1024) { res.status(413).end(); return; }
  const nowSec = Math.floor(Date.now() / 1000);
  let batch: Batch;
  try {
    // Phones gzip the batch when they can (CompressionStream): ?z=1.
    const text = req.query.z === "1" ? gunzipSync(raw, { maxOutputLength: 512 * 1024 }).toString("utf8") : raw.toString("utf8");
    batch = parseBatch(JSON.parse(text), nowSec);
  } catch { res.status(400).end(); return; }
  if (tooMany(clientIp(req.headers, String(req.ip ?? "?")), batch.ctx.d)) { res.status(429).end(); return; }
  if (!batch.events.length) { res.status(204).end(); return; }
  try {
    const sent = batch;
    const counted = await inTurn(sent.ctx.d, () => countBatch(sent));
    // A batch counted before (null) went to Google Analytics then, or was given up on: never twice.
    if (counted) await forward(counted, nowSec);
    res.status(204).end();
  } catch (e) {
    logger.error("analytics: collect failed", e);
    res.status(500).end(); // the phone keeps the batch and tries again later
  }
});

/**
 * Every document of a collection, 2,000 at a time in document-id order, with only `fields` leaving Firestore. One
 * query for all accounts held every one of them in memory at once (and again as rows); a page is let go once folded in.
 */
const STATS_PAGE = 2000;
async function eachPage(col: string, fields: string[], each: (docs: QueryDocumentSnapshot[]) => void): Promise<number> {
  let last: string | undefined, n = 0;
  for (;;) {
    let q = db.collection(col).orderBy(FieldPath.documentId()).select(...fields).limit(STATS_PAGE);
    if (last !== undefined) q = q.startAfter(last);
    const page = await q.get();
    each(page.docs);
    n += page.size;
    if (page.size < STATS_PAGE) return n;
    last = page.docs[page.docs.length - 1].id;
  }
}

/**
 * orgs.memberCount is kept by increments beside each change of membership, and a failed or repeated one leaves it off
 * for good. After the accounts were counted, an organization whose stored number differs gets the counted one: that one
 * field, at most 400 organizations a run (the rest the next day). Someone who joins while the job runs can be missed
 * for a day; the next run puts it right. A failed update is only logged.
 */
const MEND_MAX = 400;
async function mendMemberCounts(orgs: QueryDocumentSnapshot[], counted: Map<string, number>): Promise<number> {
  const wrong = orgs.filter((d) => d.get("memberCount") !== (counted.get(d.id) ?? 0)).slice(0, MEND_MAX);
  for (let i = 0; i < wrong.length; i += 50) {
    await Promise.all(wrong.slice(i, i + 50).map((d) => d.ref.update({ memberCount: counted.get(d.id) ?? 0 })
      .catch((e) => logger.warn("analytics: memberCount not mended", { orgId: d.id, error: String(e) }))));
  }
  if (wrong.length) logger.info("analytics: memberCount mended", { orgs: wrong.length });
  return wrong.length;
}

/**
 * Every account's role, organization, dates and summary (only those fields), folded in page by page (overviewAcc);
 * subscriptions the same way, with the four fields superStats reads; then every organization. The organizations are
 * read last, so their memberCount is compared with a count that is seconds old.
 */
async function buildOverview() {
  const acc = overviewAcc();
  const seatHolders: Record<string, number> = {};
  const subs: Array<Partial<Subscription>> = [];
  const [users] = await Promise.all([
    eachPage("users", ["role", "orgId", "createdAt", "lastActive", "superSeat", "summary.lessonsDone", "summary.graded", "summary.xp", "summary.avgAccuracy", "summary.lastActive", "summary.weeks"], (docs) => {
      for (const d of docs) {
        const u = d.data(), s = (u.summary ?? {}) as Record<string, unknown>;
        const last = [u.lastActive, s.lastActive].filter((x): x is string => typeof x === "string").sort().pop() ?? null;
        acc.add({
          role: u.role, orgId: u.orgId ?? null, createdAt: u.createdAt instanceof Timestamp ? u.createdAt.toMillis() : null, lastActive: last,
          lessonsDone: Number(s.lessonsDone) || 0, ...(typeof s.graded === "number" ? { graded: s.graded } : {}), xp: Number(s.xp) || 0, avgAccuracy: Number(s.avgAccuracy) || 0, weeks: (s.weeks as Record<string, number>) ?? {},
        });
        if (u.superSeat === true && u.orgId) seatHolders[u.orgId] = (seatHolders[u.orgId] ?? 0) + 1;
      }
    }),
    eachPage("subscriptions", ["plan", "status", "currentPeriodEnd", "source"], (docs) => { for (const d of docs) subs.push(d.data()); }),
  ]);
  const orgs = await db.collection("orgs").select("name", "status", "country", "memberCount", "licence").get();
  const orgRows: OrgRow[] = orgs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrgRow, "id">) }));
  const o = { ...acc.finish(orgRows), super: superStats(subs, orgs.docs.map((d) => ({ id: d.id, licence: d.get("licence") })), seatHolders) };
  await db.doc("stats/overview").set(o);
  const mended = await mendMemberCounts(orgs.docs, acc.members());
  return { overview: o, users, mended };
}

/**
 * The daily run, and its heartbeat in stats/jobs (the shape every scheduled job leaves: {at, ok, …}; a failure adds
 * the error's first 200 characters). A run that fails is rethrown, so Cloud Scheduler's one retry still happens; a
 * heartbeat older than a day, or ok: false, is what an alert or /super should look at.
 */
export const statsJob = onSchedule({ schedule: "30 2 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "1GiB", retryCount: 1 }, async () => {
  const beat = (fields: Record<string, unknown>) => db.doc("stats/jobs").set({ statsJob: { at: Date.now(), ...fields } }, { merge: true });
  let r: Awaited<ReturnType<typeof buildOverview>>;
  try { r = await buildOverview(); } catch (e) {
    await beat({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }).catch((x) => logger.error("analytics: statsJob heartbeat not written", { error: String(x) }));
    throw e;
  }
  logger.info("analytics: overview", { users: r.users, orgs: Object.keys(r.overview.orgs).length, mended: r.mended });
  await beat({ ok: true, users: r.users, error: FieldValue.delete() }); // a run that worked clears the last failure's words
});

export const refreshStats = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  if ((await freshCaller(req)).role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
  return { at: (await buildOverview()).overview.at };
});

/**
 * Connects (or, with both fields empty, disconnects) the Google Analytics stream `collect` forwards to. Platform
 * admins only, checked against Auth now; the same checks as the rule on config/analytics, which this replaces as the
 * way to write it, so the change is audited. The audit entry says whether a secret is set, never the secret.
 * `collect` forwards with the new settings within 10 minutes (gaConfig): it runs on instances of its own, so forgetting
 * the cached settings here only counts where the functions share a process (the tests).
 */
const GA_ID = /^(G-[A-Z0-9]{4,16})?$/;
const GA_SECRET_MAX = 100;
export const setGaConfig = onCall(async (req) => {
  const c = await freshCaller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.", { reason: "not-super" });
  const d = (req.data ?? {}) as Record<string, unknown>;
  const measurementId = typeof d.measurementId === "string" ? d.measurementId.trim() : null;
  const apiSecret = typeof d.apiSecret === "string" ? d.apiSecret.trim() : null;
  // Two reasons, so the page can point at the right field: "bad-ga" for the ID (or a field that isn't text), and
  // "bad-ga-secret" for an API secret that is too long. A bad ID is said first.
  if (measurementId === null || apiSecret === null || !GA_ID.test(measurementId)) {
    throw new HttpsError("invalid-argument", "A measurement ID looks like G-ABC123XYZ.", { reason: "bad-ga" });
  }
  if (apiSecret.length > GA_SECRET_MAX) {
    throw new HttpsError("invalid-argument", `The API secret has at most ${GA_SECRET_MAX} characters.`, { reason: "bad-ga-secret" });
  }
  await db.doc("config/analytics").set({ measurementId, apiSecret, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
  ga = null;
  await audit("setGaConfig", c.uid, { measurementId, hasSecret: apiSecret !== "" });
  return { ok: true };
});
