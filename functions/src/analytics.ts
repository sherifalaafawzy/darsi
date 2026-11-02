/**
 * Analytics (TECHNICAL.md "Analytics").
 * - `collect`: phones send their queued events here in one small batch (darsiai.org/api/collect, a Hosting rewrite,
 *   so no second connection). It counts them per day in analytics/{yyyy-mm-dd}, counts active phones through
 *   analyticsDevices/{id}, and forwards the events to Google Analytics (the Firebase web stream) when a platform
 *   admin has connected it on /super/analytics.
 * - `statsJob` (daily) and `refreshStats` (a platform admin, on demand): accounts and organizations from users'
 *   summaries, into stats/overview.
 */
import { gunzipSync } from "node:zlib";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { caller, db } from "./admin.js";
import { superStats } from "./billingCore.js";
import { dailyCounts, dayOf, measurementPayloads, overview, parseBatch, type Batch, type Counts, type OrgRow, type UserRow } from "./analyticsCore.js";

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

async function forward(batch: Batch, nowSec: number) {
  const { mid, secret } = await gaConfig();
  if (!mid || !secret) return;
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`;
  for (const body of measurementPayloads(batch, nowSec)) {
    const r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }).catch((e: Error) => e);
    if (r instanceof Error || !r.ok) logger.warn("analytics: Google Analytics refused a batch", { status: r instanceof Error ? r.message : r.status });
  }
}

/** A phone seen today for the first time today (or ever) adds to the day's active (and new) phones. */
async function countDevice(batch: Batch, day: string) {
  const ref = db.doc(`analyticsDevices/${batch.ctx.d}`);
  const snap = await ref.get();
  const last = snap.get("last") as string | undefined;
  if (last && last >= day) return null;
  const { role, lang, org, aud, inst } = batch.ctx;
  await ref.set({ last: day, ...(snap.exists ? {} : { first: day }), role, lang, inst, ...(org ? { org } : {}), ...(aud ? { aud } : {}) }, { merge: true });
  return { dev: 1, ...(snap.exists ? {} : { devNew: 1 }), devRole: { [role]: 1 } };
}

/** Requests per minute per address, per instance: enough for any real phone, a brake on anyone flooding it. */
const seen = new Map<string, { at: number; n: number }>();
function tooMany(ip: string) {
  const now = Date.now(), s = seen.get(ip);
  if (!s || now - s.at > 60e3) { if (seen.size > 5000) seen.clear(); seen.set(ip, { at: now, n: 1 }); return false; }
  return ++s.n > 30;
}

export const collect = onRequest({ maxInstances: 3, memory: "256MiB", timeoutSeconds: 30, concurrency: 80 }, async (req, res) => {
  // Same origin through Hosting; the cloudfunctions.net address answers other origins too, for the emulators.
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "POST").set("Access-Control-Allow-Headers", "Content-Type").status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (tooMany(String(req.ip ?? "?"))) { res.status(429).end(); return; }
  const raw = req.rawBody;
  if (!raw || raw.length > 64 * 1024) { res.status(413).end(); return; }
  const nowSec = Math.floor(Date.now() / 1000);
  let batch: Batch;
  try {
    // Phones gzip the batch when they can (CompressionStream): ?z=1.
    const text = req.query.z === "1" ? gunzipSync(raw, { maxOutputLength: 512 * 1024 }).toString("utf8") : raw.toString("utf8");
    batch = parseBatch(JSON.parse(text), nowSec);
  } catch { res.status(400).end(); return; }
  if (!batch.events.length) { res.status(204).end(); return; }
  try {
    const days = dailyCounts(batch);
    const latest = dayOf(Math.max(...batch.events.map((e) => e.t)));
    const device = await countDevice(batch, latest);
    if (device) days[latest] = { ...(days[latest] ?? {}), ...device };
    await Promise.all([
      ...Object.entries(days).map(([day, c]) => db.doc(`analytics/${day}`).set({ ...increments(c), day }, { merge: true })),
      forward(batch, nowSec),
    ]);
    res.status(204).end();
  } catch (e) {
    logger.error("analytics: collect failed", e);
    res.status(500).end(); // the phone keeps the batch and tries again later
  }
});

/** Every account's role, organization, dates and summary (only those fields), and every organization. */
async function buildOverview() {
  const [users, orgs, subs] = await Promise.all([
    db.collection("users").select("role", "orgId", "createdAt", "lastActive", "superSeat", "summary.lessonsDone", "summary.xp", "summary.avgAccuracy", "summary.lastActive", "summary.weeks").get(),
    db.collection("orgs").select("name", "status", "country", "memberCount", "licence").get(),
    db.collection("subscriptions").get(),
  ]);
  const rows: UserRow[] = users.docs.map((d) => {
    const u = d.data(), s = (u.summary ?? {}) as Record<string, unknown>;
    const last = [u.lastActive, s.lastActive].filter((x): x is string => typeof x === "string").sort().pop() ?? null;
    return {
      role: u.role, orgId: u.orgId ?? null, createdAt: u.createdAt instanceof Timestamp ? u.createdAt.toMillis() : null, lastActive: last,
      lessonsDone: Number(s.lessonsDone) || 0, xp: Number(s.xp) || 0, avgAccuracy: Number(s.avgAccuracy) || 0, weeks: (s.weeks as Record<string, number>) ?? {},
    };
  });
  const orgRows: OrgRow[] = orgs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrgRow, "id">) }));
  const seatHolders: Record<string, number> = {};
  for (const d of users.docs) if (d.get("superSeat") === true && d.get("orgId")) seatHolders[d.get("orgId")] = (seatHolders[d.get("orgId")] ?? 0) + 1;
  const o = { ...overview(rows, orgRows), super: superStats(subs.docs.map((d) => d.data()), orgs.docs.map((d) => ({ id: d.id, licence: d.get("licence") })), seatHolders) };
  await db.doc("stats/overview").set(o);
  return o;
}

export const statsJob = onSchedule({ schedule: "30 2 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "512MiB", retryCount: 1 }, async () => {
  const o = await buildOverview();
  logger.info("analytics: overview", { users: o.users.total, orgs: Object.keys(o.orgs).length });
});

export const refreshStats = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  if (caller(req).role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
  const o = await buildOverview();
  return { at: o.at };
});
