// analytics.ts against an in-memory Firestore that pages (fakeFirestore.ts plus orderBy/startAfter/limit and write
// batches): statsJob reads accounts and subscriptions in pages of 2,000 and folds them in, leaves its heartbeat in
// stats/jobs, and mends orgs.memberCount; setGaConfig (platform admins, audited without the secret); and the collect
// handler with a fake request: a batch sent again is counted once, Google Analytics can't fail or hold a request, the
// batches of one moment share one write, and a batch over two days is in both or in neither.
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth } from "./fakeFirestore";
import type { PagingDb } from "./pagingFirestore";

vi.mock("../src/admin.js", async () => {
  const { FakeAuth } = await import("./fakeFirestore");
  const { PagingDb } = await import("./pagingFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  type Data = Record<string, unknown>;
  const db = new PagingDb(), auth = new FakeAuth(), audits: Data[] = [];
  type Req = { auth?: { uid: string; token: Data } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return { db, auth, audits, freshCaller, audit: async (action: string, by: string, data: Data) => { audits.push({ action, by, ...data }); } };
});
// What collect may count under (sanitize): one course, one track, English and Arabic.
vi.mock("../src/courses.js", () => ({ catalogOf: async (owner: string) => (owner === "public" ? [{ id: "ai-1-1", track: "ai" }] : []) }));
vi.mock("../src/settings.js", () => ({ loadTracks: async () => [{ id: "ai" }], loadLanguages: async () => [] }));

const admin = (await import("../src/admin.js")) as unknown as { db: PagingDb; auth: FakeAuth; audits: Record<string, unknown>[] };
const { db, auth, audits } = admin;
const { collect, refreshStats, setGaConfig, statsJob } = await import("../src/analytics");
type Run = { run: (x: unknown) => Promise<unknown> };
const fn = (f: unknown) => f as Run;
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;
const as = (uid: string, data: unknown = {}) => ({ auth: { uid, token: {} }, data });

const DAY = 864e5;
beforeEach(() => {
  db.docs.clear(); db.writes = []; db.reads = []; db.commits = []; db.failOn = null; db.failRead = null;
  auth.users.clear(); audits.length = 0;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("head", { uid: "head", customClaims: { role: "orgAdmin", orgId: "o1" } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

/** 4,500 accounts: every 9th has no organization, the rest are spread over o1..o3; some hold a Super seat. */
function seedUsers(n = 4500) {
  const now = Date.now();
  const roles = ["student", "teacher", "learner"];
  for (let i = 1; i <= n; i++) {
    const orgId = i % 9 === 0 ? null : `o${(i % 3) + 1}`;
    db.docs.set(`users/u${String(i).padStart(5, "0")}`, {
      role: orgId ? roles[i % 2] : "learner", orgId, name: `Person ${i}`, email: `p${i}@example.test`,
      createdAt: Timestamp.fromMillis(now - (i % 40) * DAY - 1000), lastActive: new Date(now - (i % 50) * DAY - 1000).toISOString(),
      ...(orgId === "o1" && i % 10 === 1 ? { superSeat: true } : {}),
      summary: { lessonsDone: i % 4, graded: i % 4, xp: (i % 4) * 10, avgAccuracy: 0.5, lastActive: new Date(now - 60 * DAY).toISOString(), weeks: i % 4 ? { "2026-W45": i % 4 } : {} },
    });
  }
}
const countWhere = (f: (u: Record<string, any>) => boolean) => [...db.docs].filter(([k, u]) => k.startsWith("users/") && f(u as Record<string, any>)).length;
function seedOrgs() {
  const now = Date.now();
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", country: "EG", memberCount: 7, licence: { plan: "super_seat", seats: 200, until: now + 30 * DAY } });
  db.docs.set("orgs/o2", { name: "Delta College", status: "active", memberCount: countWhere((u) => u.orgId === "o2") });
  db.docs.set("orgs/o3", { name: "Sinai Institute", status: "active" }); // no memberCount at all
  db.docs.set("orgs/o4", { name: "Waiting", status: "pending", memberCount: 0 });
}

describe("statsJob", () => {
  it("reads 4,500 accounts in three pages by document id, only the fields it needs, and the totals match", async () => {
    seedUsers(); seedOrgs();
    const now = Date.now();
    // 2,300 subscriptions, two pages: every third still runs.
    for (let i = 1; i <= 2300; i++) db.docs.set(`subscriptions/s${String(i).padStart(5, "0")}`, { plan: "super_monthly", status: "active", source: i % 2 ? "paymob" : "stripe", currentPeriodEnd: now + (i % 3 ? -DAY : DAY), stripeSub: "sub_x", card: "4242" });
    await fn(statsJob).run({});

    const users = db.reads.filter((r) => r.col === "users");
    expect(users.map((r) => [r.size, r.after, r.limit])).toEqual([[2000, undefined, 2000], [2000, "u02000", 2000], [500, "u04000", 2000]]);
    expect(users[0].fields).toEqual(["role", "orgId", "createdAt", "lastActive", "superSeat", "summary.lessonsDone", "summary.graded", "summary.xp", "summary.avgAccuracy", "summary.lastActive", "summary.weeks"]);
    const subs = db.reads.filter((r) => r.col === "subscriptions");
    expect(subs.map((r) => [r.size, r.after])).toEqual([[2000, undefined], [300, "s02000"]]);
    expect(subs[0].fields).toEqual(["plan", "status", "currentPeriodEnd", "source"]);

    const o = doc("stats/overview")!;
    expect(o.users.total).toBe(4500);
    expect(o.users.byRole).toEqual({ student: countWhere((u) => u.role === "student"), teacher: countWhere((u) => u.role === "teacher"), learner: countWhere((u) => u.role === "learner") });
    expect(o.users.new7).toBe(countWhere((u) => now - u.createdAt.toMillis() < 7 * DAY));
    expect(o.users.active30).toBe(countWhere((u) => now - Date.parse(u.lastActive) < 30 * DAY)); // the newer of the two dates
    const lessons = [...db.docs].filter(([k]) => k.startsWith("users/")).reduce((a, [, u]) => a + (u as Record<string, any>).summary.lessonsDone, 0);
    expect(o.lessons).toBe(lessons);
    expect(o.xp).toBe(lessons * 10);
    expect(o.weeks).toEqual({ "2026-W45": lessons });
    expect(o.avgAccuracy).toBeCloseTo(0.5);
    expect(Object.keys(o.orgs)).toEqual(["o1", "o2", "o3"]);
    for (const id of ["o1", "o2", "o3"]) {
      expect(o.orgs[id].members).toBe(countWhere((u) => u.orgId === id));
      expect(o.orgs[id].teachers).toBe(countWhere((u) => u.orgId === id && u.role === "teacher"));
    }
    expect(o.orgsByStatus).toEqual({ active: 3, pending: 1 });
    expect(o.super).toEqual({
      individuals: 766, byPlan: { super_monthly: 766 }, bySource: { paymob: 383, stripe: 383 },
      orgs: 1, seats: 200, seatsUsed: countWhere((u) => u.orgId === "o1" && u.superSeat === true),
    });
    expect(o.super.seatsUsed).toBeGreaterThan(0);
  });

  it("leaves its heartbeat in stats/jobs: ok, how many accounts, and when", async () => {
    seedUsers(30); seedOrgs();
    db.docs.set("stats/jobs", { dailyNudges: { at: 1, ok: true }, statsJob: { at: 1, ok: false, error: "yesterday's failure" } });
    const before = Date.now();
    await fn(statsJob).run({});
    const jobs = doc("stats/jobs")!;
    expect(jobs.statsJob).toEqual({ at: expect.any(Number), ok: true, users: 30 }); // the old error is gone
    expect(jobs.statsJob.at).toBeGreaterThanOrEqual(before);
    expect(jobs.dailyNudges).toEqual({ at: 1, ok: true }); // other jobs' heartbeats are left alone
  });

  it("a read that fails writes ok: false with the error's first 200 characters, and the run still fails", async () => {
    seedUsers(30); seedOrgs();
    db.docs.set("stats/overview", { at: "yesterday" });
    db.docs.set("stats/jobs", { statsJob: { at: 1, ok: true, users: 29 } });
    db.failRead = (col) => col === "users";
    await expect(fn(statsJob).run({})).rejects.toThrow(/DEADLINE_EXCEEDED/);
    const beat = doc("stats/jobs")!.statsJob;
    expect(beat).toMatchObject({ ok: false, at: expect.any(Number), users: 29 });
    expect(beat.at).toBeGreaterThan(1);
    expect(beat.error).toHaveLength(200);
    expect(beat.error).toMatch(/^4 DEADLINE_EXCEEDED: reading users/);
    expect(doc("stats/overview")).toEqual({ at: "yesterday" }); // half a count is never published
    // A heartbeat that can't be written either doesn't hide the real error.
    const said = vi.spyOn(logger, "error").mockImplementation(() => {});
    db.failOn = (w) => w.path === "stats/jobs";
    await expect(fn(statsJob).run({})).rejects.toThrow(/DEADLINE_EXCEEDED/);
    expect(said).toHaveBeenCalledWith("analytics: statsJob heartbeat not written", expect.anything());
  });

  it("mends a wrong memberCount (that one field) and leaves a right one unwritten", async () => {
    seedUsers(300); seedOrgs();
    await fn(statsJob).run({});
    const mended = db.writes.filter((w) => w.path.startsWith("orgs/"));
    expect(mended.map((w) => [w.path, w.op, w.data])).toEqual([
      ["orgs/o1", "update", { memberCount: countWhere((u) => u.orgId === "o1") }],
      ["orgs/o3", "update", { memberCount: countWhere((u) => u.orgId === "o3") }],
    ]);
    expect(doc("orgs/o1")).toMatchObject({ name: "Nile School", status: "active", country: "EG", memberCount: 67 });
    expect(doc("orgs/o1")!.licence.seats).toBe(200); // nothing else on the document is touched
    expect(doc("orgs/o4")!.memberCount).toBe(0);
    // A second run finds nothing to mend.
    db.writes = [];
    await fn(statsJob).run({});
    expect(db.writes.filter((w) => w.path.startsWith("orgs/"))).toEqual([]);
  });

  it("mends at most 400 organizations a run, and one that can't be updated doesn't fail the run", async () => {
    seedUsers(10);
    for (let i = 1; i <= 450; i++) db.docs.set(`orgs/x${String(i).padStart(3, "0")}`, { name: `Org ${i}`, status: "active", memberCount: 5 });
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    db.failOn = (w) => w.path === "orgs/x003";
    await fn(statsJob).run({});
    expect(db.writes.filter((w) => w.path.startsWith("orgs/"))).toHaveLength(399);
    expect(doc("orgs/x003")!.memberCount).toBe(5);
    expect(doc("orgs/x400")!.memberCount).toBe(0);
    expect(doc("orgs/x401")!.memberCount).toBe(5); // tomorrow's run
    expect(doc("stats/jobs")!.statsJob.ok).toBe(true);
  });

  it("refreshStats builds the same overview for a platform admin, and refuses anyone else", async () => {
    seedUsers(12); seedOrgs();
    await expect(fn(refreshStats).run(as("head"))).rejects.toMatchObject({ code: "permission-denied" });
    expect(doc("stats/overview")).toBeUndefined();
    const r = (await fn(refreshStats).run(as("root"))) as { at: string };
    expect(doc("stats/overview")).toMatchObject({ at: r.at, users: { total: 12 } });
    expect(doc("stats/jobs")).toBeUndefined(); // the heartbeat is the scheduled job's
  });
});

describe("setGaConfig", () => {
  const good = { measurementId: "G-ABC123XYZ", apiSecret: "s3cr3t-Value_1" };
  it("refuses an organization's admin, a learner and a visitor", async () => {
    await expect(fn(setGaConfig).run(as("head", good))).rejects.toMatchObject({ code: "permission-denied", details: { reason: "not-super" } });
    await expect(fn(setGaConfig).run(as("nobody", good))).rejects.toMatchObject({ code: "permission-denied", details: { reason: "not-super" } });
    await expect(fn(setGaConfig).run({ data: good })).rejects.toMatchObject({ code: "unauthenticated" });
    // A token that still says superadmin after the claim was taken away is refused too (freshCaller).
    auth.users.set("was", { uid: "was", customClaims: { role: "teacher" } });
    await expect(fn(setGaConfig).run({ auth: { uid: "was", token: { role: "superadmin" } }, data: good })).rejects.toMatchObject({ details: { reason: "not-super" } });
    expect(doc("config/analytics")).toBeUndefined();
    expect(audits).toEqual([]);
  });
  it("refuses a bad measurement ID or secret, as the rule on config/analytics did", async () => {
    for (const data of [
      { ...good, measurementId: "UA-12345-1" }, { ...good, measurementId: "g-abc123xyz" }, { ...good, measurementId: "G-AB" },
      { ...good, measurementId: `G-${"A".repeat(17)}` }, { ...good, measurementId: 5 }, { apiSecret: "x" },
      { ...good, apiSecret: null }, { measurementId: "G-ABC123XYZ" }, undefined,
      // A bad ID with an over-long secret: the ID is said first.
      { measurementId: "UA-12345-1", apiSecret: "x".repeat(101) },
    ]) await expect(fn(setGaConfig).run(as("root", data))).rejects.toMatchObject({ code: "invalid-argument", details: { reason: "bad-ga" } });
    expect(doc("config/analytics")).toBeUndefined();
    expect(audits).toEqual([]);
  });
  it("an API secret over 100 characters has a reason of its own, so the page can point at that field", async () => {
    for (const data of [{ ...good, apiSecret: "x".repeat(101) }, { measurementId: "", apiSecret: ` ${"x".repeat(101)} ` }]) {
      await expect(fn(setGaConfig).run(as("root", data))).rejects.toMatchObject({ code: "invalid-argument", details: { reason: "bad-ga-secret" } });
    }
    expect(doc("config/analytics")).toBeUndefined();
    expect(audits).toEqual([]);
    // Exactly 100 (after trimming) is fine.
    expect(await fn(setGaConfig).run(as("root", { ...good, apiSecret: ` ${"x".repeat(100)} ` }))).toEqual({ ok: true });
    expect(doc("config/analytics")).toMatchObject({ apiSecret: "x".repeat(100) });
  });
  it("writes the settings and an audit entry that says a secret is set, never the secret", async () => {
    expect(await fn(setGaConfig).run(as("root", { measurementId: " G-ABC123XYZ ", apiSecret: " s3cr3t-Value_1 " }))).toEqual({ ok: true });
    expect(doc("config/analytics")).toEqual({ measurementId: "G-ABC123XYZ", apiSecret: "s3cr3t-Value_1", updatedAt: expect.any(Number), updatedBy: "root" });
    expect(audits).toEqual([{ action: "setGaConfig", by: "root", measurementId: "G-ABC123XYZ", hasSecret: true }]);
    expect(JSON.stringify(audits)).not.toContain("s3cr3t");
    // Both empty disconnects it.
    expect(await fn(setGaConfig).run(as("root", { measurementId: "", apiSecret: "" }))).toEqual({ ok: true });
    expect(doc("config/analytics")).toMatchObject({ measurementId: "", apiSecret: "" });
    expect(audits[1]).toEqual({ action: "setGaConfig", by: "root", measurementId: "", hasSecret: false });
  });
});

/* ---------- collect ---------- */

type Res = { code: number; ended: boolean; headers: Record<string, string>; set(k: string, v: string): Res; status(c: number): Res; end(): void };
function post(body: unknown, ip = "203.0.113.7"): Promise<number> {
  const res: Res = { code: 0, ended: false, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, end() { this.ended = true; } };
  const req = { method: "POST", rawBody: Buffer.from(JSON.stringify(body)), query: {}, headers: {}, ip };
  return (collect as unknown as (req: unknown, res: Res) => Promise<void>)(req, res).then(() => { expect(res.ended).toBe(true); return res.code; });
}
let devices = 0;
const device = () => `dev${String(++devices).padStart(4, "0")}a1b2c3d4e5f6`;
const sec = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - DAY).toISOString().slice(0, 10);
const C = { r: "teacher", l: "ar", i: 1 };
const lesson = (t = sec()) => ({ n: "lesson_complete", t, p: { u: "ai-1-1", tr: "ai", acc: 80, sec: 120 } });
const dayWrites = () => db.commits.filter((c) => c.some((p) => p.startsWith("analytics/")));

describe("collect", () => {
  it("counts a batch once: the same batch id again answers 204 and changes nothing", async () => {
    const d = device(), body = { d, b: "k3j9x0q2ab", c: C, e: [{ n: "session_start", t: sec() }, lesson()] };
    expect(await post(body)).toBe(204);
    const day = structuredClone(doc(`analytics/${today()}`));
    expect(day).toMatchObject({ day: today(), n: 2, ev: { session_start: 1, lesson_complete: 1 }, lessons: { n: 1, unit: { "ai-1-1": 1 } }, dev: 1, devNew: 1, devRole: { teacher: 1 } });
    expect(doc(`analyticsDevices/${d}`)).toEqual({ last: today(), first: today(), role: "teacher", lang: "ar", inst: true, lastBatch: "k3j9x0q2ab" });

    // The phone never got the answer and sends the batch again.
    expect(await post(body)).toBe(204);
    expect(doc(`analytics/${today()}`)).toEqual(day);
    expect(dayWrites()).toHaveLength(1);

    // Its next batch is counted, and the phone is not a new or a second active phone.
    expect(await post({ ...body, b: "m4n5p6q7rs", e: [lesson()] })).toBe(204);
    expect(doc(`analytics/${today()}`)).toMatchObject({ n: 3, lessons: { n: 2 }, dev: 1, devNew: 1 });
    expect(doc(`analyticsDevices/${d}`)!.lastBatch).toBe("m4n5p6q7rs");
  });

  it("counts the same batch id once even when both copies arrive together", async () => {
    const body = { d: device(), b: "aaaa1111bbbb", c: C, e: [lesson(), lesson()] };
    expect(await Promise.all([post(body), post(body)])).toEqual([204, 204]);
    expect(doc(`analytics/${today()}`)).toMatchObject({ n: 2, lessons: { n: 2 }, dev: 1 });
  });

  it("counts a batch without an id every time, as before", async () => {
    const d = device(), body = { d, c: C, e: [lesson()] };
    expect(await post(body)).toBe(204);
    expect(await post(body)).toBe(204);
    expect(doc(`analytics/${today()}`)).toMatchObject({ n: 2, dev: 1 });
    expect(doc(`analyticsDevices/${d}`)).not.toHaveProperty("lastBatch");
    // Already seen today and no id to remember: its record isn't written again.
    expect(db.writes.filter((w) => w.path === `analyticsDevices/${d}`)).toHaveLength(1);
  });

  it("a failed count answers 500 and leaves no mark, so the batch sent again is counted in full", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const d = device(), body = { d, b: "ffff0000eeee", c: C, e: [{ n: "session_start", t: sec() }, lesson()] };
    db.failOn = (w) => w.path.startsWith("analytics/");
    expect(await post(body)).toBe(500);
    expect(doc(`analytics/${today()}`)).toBeUndefined();
    expect(doc(`analyticsDevices/${d}`)).toBeUndefined();
    expect(await post(body)).toBe(204);
    expect(doc(`analytics/${today()}`)).toMatchObject({ n: 2, sessions: { n: 1 }, lessons: { n: 1 }, dev: 1, devNew: 1 });
  });

  it("a batch over two days is one commit: each day counted once, under its own day", async () => {
    const d = device(), t = sec();
    const body = { d, b: "twodays00001", c: C, e: [lesson(t - 86400), lesson(t - 86400), lesson(t)] };
    expect(await post(body)).toBe(204);
    expect(dayWrites()).toEqual([[`analytics/${yesterday()}`, `analytics/${today()}`]]);
    expect(doc(`analytics/${yesterday()}`)).toMatchObject({ day: yesterday(), n: 2, lessons: { n: 2 } });
    expect(doc(`analytics/${yesterday()}`)).not.toHaveProperty("dev"); // the phone is active on its latest day
    expect(doc(`analytics/${today()}`)).toMatchObject({ day: today(), n: 1, lessons: { n: 1 }, dev: 1 });
    // One day failing fails both, so the batch sent again can't double the day that went through.
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const again = { ...body, d: device(), b: "twodays00002" };
    db.failOn = (w) => w.path === `analytics/${today()}`;
    expect(await post(again)).toBe(500);
    expect(doc(`analytics/${yesterday()}`)!.n).toBe(2);
    expect(await post(again)).toBe(204);
    expect(doc(`analytics/${yesterday()}`)!.n).toBe(4);
    expect(doc(`analytics/${today()}`)!.n).toBe(2);
  });

  it("five batches inside 250 ms make one write, and every one of them waits for it", async () => {
    const answers = await Promise.all(Array.from({ length: 5 }, (_, i) => post({ d: device(), b: `fivebatch00${i}`, c: C, e: [{ n: "session_start", t: sec() }, lesson()] }, `198.51.100.${i + 1}`)));
    expect(answers).toEqual([204, 204, 204, 204, 204]);
    expect(dayWrites()).toEqual([[`analytics/${today()}`]]);
    expect(doc(`analytics/${today()}`)).toMatchObject({ day: today(), n: 10, sessions: { n: 5 }, lessons: { n: 5, acc: 400, accN: 5 }, dev: 5, devNew: 5, devRole: { teacher: 5 } });
    // The next moment's batch is the next write.
    expect(await post({ d: device(), c: C, e: [lesson()] })).toBe(204);
    expect(dayWrites()).toHaveLength(2);
    expect(doc(`analytics/${today()}`)!.n).toBe(11);
  });

  it("when the shared write fails, every batch of that moment answers 500", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    db.failOn = (w) => w.path.startsWith("analytics/");
    const bodies = Array.from({ length: 3 }, (_, i) => ({ d: device(), b: `sharedfail0${i}`, c: C, e: [lesson()] }));
    expect(await Promise.all(bodies.map((b) => post(b)))).toEqual([500, 500, 500]);
    expect(await Promise.all(bodies.map((b) => post(b)))).toEqual([204, 204, 204]);
    expect(doc(`analytics/${today()}`)).toMatchObject({ n: 3, dev: 3 });
  });

  it("counts the app's errors by kind and build, and keeps a day to 20 builds", async () => {
    const day = yesterday(), t = sec() - 86400; // a day of its own: the builds a day has are remembered per instance
    db.docs.set(`analytics/${day}`, { day, errBuild: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`old${i}`, 1])) });
    const err = (k: string) => ({ n: "app_error", t, p: { s: "lesson", k, h: "0123456789ab" } });
    expect(await post({ d: device(), c: { ...C, v: "b20" }, e: [err("chunk"), err("chunk"), err("render")] })).toBe(204);
    expect(await post({ d: device(), c: { ...C, v: "b21" }, e: [err("error")] })).toBe(204);
    expect(await post({ d: device(), c: { ...C, v: "old3" }, e: [err("error")] })).toBe(204);
    const got = doc(`analytics/${day}`)!;
    expect(got.err).toEqual({ n: 5, k: { chunk: 2, render: 1, error: 2 } });
    expect(got.errBuild).toMatchObject({ b20: 3, other: 1, old3: 2 });
    expect(got.errBuild).not.toHaveProperty("b21");
    expect(Object.keys(got.errBuild).filter((b) => b !== "other")).toHaveLength(20);
  });

  it("a build named like something every object has is counted, and doesn't fail the batches beside it", async () => {
    const day = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), t = sec() - 2 * 86400; // a day of its own
    const err = { n: "app_error", t, p: { k: "error" } };
    const answers = await Promise.all([
      post({ d: device(), b: "protobuild01", c: { ...C, v: "constructor" }, e: [err, err] }),
      post({ d: device(), b: "protobuild02", c: { ...C, v: "toString" }, e: [err] }),
      post({ d: device(), b: "protobuild03", c: { ...C, v: "b1" }, e: [err] }),
    ]);
    expect(answers).toEqual([204, 204, 204]);
    const got = doc(`analytics/${day}`)!;
    expect(got.err).toEqual({ n: 4, k: { error: 4 } });
    expect(Object.entries(got.errBuild).sort()).toEqual([["b1", 1], ["constructor", 2], ["toString", 1]]);
  });

  describe("Google Analytics", () => {
    const connect = () => fn(setGaConfig).run(as("root", { measurementId: "G-ABC123XYZ", apiSecret: "s3cr3t" })); // also forgets the cached settings
    it("gets the batch once, without the app's errors; a failure there still answers 204 and the batch is counted", async () => {
      await connect();
      const fetched = vi.fn(async (_url: string, _init: { body: string }) => ({ ok: true, status: 204 }));
      vi.stubGlobal("fetch", fetched);
      const body = { d: device(), b: "gabatch00001", c: C, e: [lesson(), { n: "app_error", t: sec(), p: { k: "error" } }] };
      expect(await post(body)).toBe(204);
      expect(fetched).toHaveBeenCalledTimes(1);
      expect(fetched.mock.calls[0][0]).toContain("measurement_id=G-ABC123XYZ");
      expect(JSON.parse(fetched.mock.calls[0][1].body).events.map((e: { name: string }) => e.name)).toEqual(["lesson_complete"]);
      expect(await post(body)).toBe(204); // sent again: not forwarded again
      expect(fetched).toHaveBeenCalledTimes(1);

      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const before = doc(`analytics/${today()}`)!.n;
      fetched.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND www.google-analytics.com"));
      expect(await post({ ...body, b: "gabatch00002" })).toBe(204);
      fetched.mockResolvedValueOnce({ ok: false, status: 503 });
      expect(await post({ ...body, b: "gabatch00003" })).toBe(204);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(doc(`analytics/${today()}`)!.n).toBe(before + 4);
    });

    it("settings that can't be read are only logged", async () => {
      await connect();
      const fetched = vi.fn(async () => ({ ok: true, status: 204 }));
      vi.stubGlobal("fetch", fetched);
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const get = db.doc.bind(db);
      vi.spyOn(db, "doc").mockImplementation((path: string) => (path === "config/analytics" ? { ...get(path), get: async () => { throw new Error("14 UNAVAILABLE"); } } : get(path)));
      const d = device();
      expect(await post({ d, b: "noconfig0001", c: C, e: [lesson()] })).toBe(204);
      expect(fetched).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("analytics: Google Analytics not reached", { error: "Error: 14 UNAVAILABLE" });
      expect(doc(`analyticsDevices/${d}`)!.lastBatch).toBe("noconfig0001");
    });

    it("that never answers holds the request for 4 s at most", async () => {
      await connect();
      vi.spyOn(logger, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const d = device();
      let code = 0;
      const done = post({ d, b: "slowga000001", c: C, e: [lesson()] }).then((c) => { code = c; });
      await vi.advanceTimersByTimeAsync(300); // the shared write
      expect(doc(`analyticsDevices/${d}`)!.lastBatch).toBe("slowga000001"); // counted and marked before Google Analytics
      await vi.advanceTimersByTimeAsync(3900);
      expect(code).toBe(0);
      await vi.advanceTimersByTimeAsync(200);
      await done;
      expect(code).toBe(204);
      expect(vi.getTimerCount()).toBe(0); // no timer outlives the request
    });
  });
});
