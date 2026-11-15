import { describe, expect, it } from "vitest";
import { addCounts, capBuilds, dailyCounts, measurementPayloads, overview, overviewAcc, parseBatch, sanitize, MAX_BUILDS, MAX_EVENTS, type Counts, type Known, type UserRow } from "../src/analyticsCore";

const NOW = Date.parse("2026-11-01T12:00:00Z") / 1000;
const D = "a1b2c3d4e5f6a7b8c9d0";
const batch = (e: unknown[], c: Record<string, unknown> = { r: "teacher", l: "ar", a: "teachers", i: 1, o: "org123" }) => ({ d: D, c, e });

describe("parseBatch", () => {
  it("keeps known events and parameters, clamps numbers and drops the rest", () => {
    const b = parseBatch(batch([
      { n: "lesson_complete", t: NOW - 60, p: { u: "ai-1-1", l: "ai-1-1-1", tr: "ai", acc: 140.4, sec: 300, xp: 50, name: "Amal" }, o: 1 },
      { n: "made_up", t: NOW },
      { n: "lab_open", t: NOW - 40 * 86400, p: { lab: "neuron" } }, // older than 30 days
      { n: "lab_open", t: NOW + 3 * 86400, p: { lab: "neuron" } }, // a phone with a wrong clock
      { n: "screen_view", t: NOW, p: { s: "Not A Screen!" } },
    ]), NOW);
    expect(b.ctx).toEqual({ d: D, role: "teacher", lang: "ar", aud: "teachers", org: "org123", inst: true });
    expect(b.events).toEqual([
      { n: "lesson_complete", t: NOW - 60, p: { u: "ai-1-1", l: "ai-1-1-1", tr: "ai", acc: 100, sec: 300, xp: 50 }, off: true },
      { n: "screen_view", t: NOW, p: {}, off: false },
    ]);
  });
  it("refuses a batch without a proper device id, or with too many events", () => {
    expect(() => parseBatch({ d: "short", c: {}, e: [] }, NOW)).toThrow();
    expect(() => parseBatch({ d: D, c: {}, e: Array(MAX_EVENTS + 1).fill({ n: "session_start", t: NOW }) }, NOW)).toThrow();
    expect(() => parseBatch(null, NOW)).toThrow();
  });
  it("treats an unknown role as a guest and a missing language as undetermined", () => {
    expect(parseBatch(batch([], { r: "king" }), NOW).ctx).toEqual({ d: D, role: "guest", lang: "und", inst: false });
  });
  it("keeps a valid batch id and drops a malformed one (the batch itself is still counted)", () => {
    const e = [{ n: "session_start", t: NOW }];
    expect(parseBatch({ ...batch(e), b: "k3j9x0q2ab" }, NOW).b).toBe("k3j9x0q2ab");
    for (const b of ["short", "UPPERCASE1", "has space 1", "x".repeat(33), 12345678, null, { id: "k3j9x0q2ab" }]) {
      const got = parseBatch({ ...batch(e), b }, NOW);
      expect(got).not.toHaveProperty("b");
      expect(got.events).toHaveLength(1);
    }
    expect(parseBatch(batch(e), NOW)).not.toHaveProperty("b");
  });
});

describe("app_error", () => {
  const K: Known = { units: new Set(), labs: new Set(), orgs: new Set(["org123"]), tracks: new Set(), langs: new Set(["en", "ar", "und"]) };
  const ctx = (v?: unknown) => ({ r: "student", l: "ar", i: 0, ...(v === undefined ? {} : { v }) });
  it("is accepted with clean parameters; an unknown kind is dropped, and so is anything that could carry the message", () => {
    const b = parseBatch(batch([
      { n: "app_error", t: NOW, p: { s: "lesson", k: "chunk", h: "0123456789ab", msg: "TypeError: x is undefined at https://darsiai.org/a.js", stack: "at f (a.js:1)" } },
      { n: "app_error", t: NOW, p: { s: "Lesson Page!", k: "render", h: "not-hex" } }, // the kind is enough
      { n: "app_error", t: NOW, p: { s: "lesson", k: "explosion", h: "0123456789ab" } },
      { n: "app_error", t: NOW, p: { s: "lesson" } },
      { n: "app_error", t: NOW },
    ], ctx("2026.11.11-4245d198")), NOW);
    expect(b.events).toEqual([
      { n: "app_error", t: NOW, p: { s: "lesson", k: "chunk", h: "0123456789ab" }, off: false },
      { n: "app_error", t: NOW, p: { k: "render" }, off: false },
    ]);
    expect(b.ctx.ver).toBe("2026.11.11-4245d198");
    // The screen is kept only when Darsi knows it, like every other screen name.
    const odd = sanitize(parseBatch(batch([{ n: "app_error", t: NOW, p: { s: "made_up_screen", k: "error" } }], ctx()), NOW), K);
    expect(odd.events[0].p).toEqual({ s: "other", k: "error" });
  });
  it("is counted per day under err (by kind) and errBuild (by build; a phone that names none counts as other)", () => {
    const e = [
      { n: "app_error", t: NOW, p: { k: "chunk" } }, { n: "app_error", t: NOW + 1, p: { k: "chunk" } },
      { n: "app_error", t: NOW + 2, p: { k: "rejection" } }, { n: "app_error", t: NOW - 86400, p: { k: "render" } },
      { n: "session_start", t: NOW },
    ];
    const days = dailyCounts(sanitize(parseBatch(batch(e, ctx("1.4.2")), NOW), K));
    expect(days["2026-11-01"]).toMatchObject({ n: 4, ev: { app_error: 3, session_start: 1 }, err: { n: 3, k: { chunk: 2, rejection: 1 } }, errBuild: { "1.4.2": 3 } });
    expect(days["2026-10-31"]).toMatchObject({ n: 1, err: { n: 1, k: { render: 1 } }, errBuild: { "1.4.2": 1 } });
    expect(dailyCounts(sanitize(parseBatch(batch(e, ctx()), NOW), K))["2026-11-01"].errBuild).toEqual({ other: 3 });
    // A build is a map key in analytics/{day}: too long, odd characters, or a name Firestore refuses (__x__) is no build.
    for (const v of ["x".repeat(25), "1.0 beta", "__proto__", "__x__", ".hidden", "a/b", 7]) {
      const b = parseBatch(batch(e, ctx(v)), NOW);
      expect(b.ctx.ver).toBeUndefined();
      expect(dailyCounts(b)["2026-11-01"].errBuild).toEqual({ other: 3 });
    }
    // Without errors a day carries neither key.
    const calm = dailyCounts(parseBatch(batch([{ n: "session_start", t: NOW }], ctx("1.4.2")), NOW))["2026-11-01"];
    expect(calm).not.toHaveProperty("err");
    expect(calm).not.toHaveProperty("errBuild");
  });
  it("keeps a day to 20 builds: the 21st goes to other, and a build the day already has still counts as itself", () => {
    const seen = new Set<string>();
    const day = (build: string, n = 1): Counts => ({ n, err: { n, k: { error: n } }, errBuild: { [build]: n } });
    for (let i = 1; i <= MAX_BUILDS; i++) expect(capBuilds(day(`b${i}`), seen).errBuild).toEqual({ [`b${i}`]: 1 });
    expect(seen.size).toBe(20);
    const over = capBuilds(day("b21", 4), seen);
    expect(over.errBuild).toEqual({ other: 4 });
    expect(over.err).toEqual({ n: 4, k: { error: 4 } }); // only the build's name is lost, never the error
    expect(seen.has("b21")).toBe(false);
    expect(capBuilds(day("b7", 2), seen).errBuild).toEqual({ b7: 2 });
    // Several unknown builds and the phone's own "other" add up under one key, and "other" takes none of the 20 places.
    expect(capBuilds({ errBuild: { b22: 1, b23: 2, other: 3, b1: 5 } }, seen).errBuild).toEqual({ other: 6, b1: 5 });
    const fresh = new Set<string>();
    expect(capBuilds({ errBuild: { other: 9 } }, fresh).errBuild).toEqual({ other: 9 });
    expect(fresh.size).toBe(0);
    // A day without errors passes through untouched.
    const calm: Counts = { n: 3 };
    expect(capBuilds(calm, seen)).toBe(calm);
  });
  it("counts a build named like something every object has (constructor, toString) as a number, like any other", () => {
    // `{}["constructor"]` is a function: the count once became a string, and adding it to the moment's shared counts
    // never ended (a 500 for that phone, with half its batch already in the window).
    const e = [{ n: "app_error", t: NOW, p: { k: "error" } }, { n: "app_error", t: NOW, p: { k: "error" } }];
    for (const v of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      const day = dailyCounts(parseBatch(batch(e, ctx(v)), NOW))["2026-11-01"];
      expect(Object.entries(day.errBuild)).toEqual([[v, 2]]);
      const capped = capBuilds(day, new Set());
      expect(Object.entries(capped.errBuild)).toEqual([[v, 2]]);
      const sum = addCounts(addCounts({}, capped), capped);
      expect(Object.entries(sum.errBuild)).toEqual([[v, 4]]);
      expect(sum.err).toEqual({ n: 4, k: { error: 4 } });
    }
  });
  it("is never sent to Google Analytics", () => {
    const b = parseBatch(batch([
      { n: "app_error", t: NOW, p: { s: "lesson", k: "error", h: "0123456789ab" } },
      { n: "screen_view", t: NOW, p: { s: "learn" } },
    ], ctx("1.4.2")), NOW);
    const out = measurementPayloads(b, NOW) as Array<{ events: Array<{ name: string }> }>;
    expect(out).toHaveLength(1);
    expect(out[0].events.map((e) => e.name)).toEqual(["screen_view"]);
    expect(measurementPayloads(parseBatch(batch([{ n: "app_error", t: NOW, p: { k: "error" } }], ctx()), NOW), NOW)).toEqual([]);
  });
});

describe("addCounts", () => {
  it("adds nested counts key by key, so the batches of one moment become one write", () => {
    const into: Counts = { n: 2, ev: { session_start: 1 }, lessons: { n: 1, track: { ai: 1 } } };
    addCounts(into, { n: 3, ev: { session_start: 1, lab_open: 2 }, lessons: { n: 2, track: { iot: 2 } }, dev: 1, devRole: { teacher: 1 } });
    expect(into).toEqual({ n: 5, ev: { session_start: 2, lab_open: 2 }, lessons: { n: 3, track: { ai: 1, iot: 2 } }, dev: 1, devRole: { teacher: 1 } });
  });
});

describe("dailyCounts", () => {
  it("counts per UTC day: events, sessions, lessons by track and course, labs, offline use", () => {
    const b = parseBatch(batch([
      { n: "session_start", t: NOW - 86400, o: 1 },
      { n: "lesson_complete", t: NOW - 86400 + 10, p: { u: "ai-1-1", tr: "ai", acc: 80, sec: 200 } },
      { n: "session_start", t: NOW },
      { n: "lesson_complete", t: NOW + 5, p: { u: "ai-1-1", tr: "ai", acc: 60, sec: 100 } },
      { n: "lesson_complete", t: NOW + 9, p: { u: "iot-1-2", tr: "iot", acc: 100, sec: 50 } },
      { n: "lab_open", t: NOW + 20, p: { lab: "neuron" } },
    ]), NOW);
    const days = dailyCounts(b);
    expect(Object.keys(days)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(days["2026-10-31"]).toMatchObject({ n: 2, off: 1, sessions: { n: 1, offline: 1, lang: { ar: 1 }, installed: 1 } });
    expect(days["2026-11-01"]).toMatchObject({
      n: 4, ev: { session_start: 1, lesson_complete: 2, lab_open: 1 },
      lessons: { n: 2, track: { ai: 1, iot: 1 }, unit: { "ai-1-1": 1, "iot-1-2": 1 }, acc: 160, accN: 2, sec: 150 },
      labs: { neuron: 1 }, org: { org123: { lessons: 2, events: 2 } }, role: { teacher: { lessons: 2, events: 2 } },
    });
  });
});

describe("measurementPayloads", () => {
  it("sends only the last 72 hours, 25 events per request, with the phone's random id and no personal data", () => {
    const events: unknown[] = Array.from({ length: 30 }, (_, i) => ({ n: "screen_view", t: NOW - i, p: { s: "learn", email: "a@b.c", name: "Amal" } }));
    events.push({ n: "screen_view", t: NOW - 80 * 3600, p: { s: "learn" } });
    const out = measurementPayloads(parseBatch(batch(events), NOW), NOW) as Array<{ client_id: string; events: Array<{ name: string; params: Record<string, unknown>; timestamp_micros: number }> }>;
    expect(out.map((x) => x.events.length)).toEqual([25, 5]);
    expect(out[0].client_id).toBe(D);
    expect(out[0].events[0]).toMatchObject({ name: "screen_view", timestamp_micros: NOW * 1e6, params: { s: "learn", org: "org123", offline: 0, engagement_time_msec: 100 } });
    expect(JSON.stringify(out)).not.toMatch(/email|Amal|a@b/);
  });
});

describe("overview", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const day = 864e5;
  it("counts accounts, activity, lessons and each active organization", () => {
    const o = overview([
      { role: "teacher", orgId: "o1", createdAt: now.getTime() - 2 * day, lastActive: "2026-10-31T10:00:00Z", lessonsDone: 4, xp: 200, avgAccuracy: 0.8, weeks: { "2026-W44": 3 } },
      { role: "student", orgId: "o1", createdAt: now.getTime() - 20 * day, lastActive: "2026-10-15T10:00:00Z", lessonsDone: 2, xp: 80, avgAccuracy: 0.6, weeks: { "2026-W44": 1, "2026-W42": 1 } },
      { role: "learner", orgId: null, createdAt: now.getTime() - 90 * day, lastActive: null, lessonsDone: 0 },
      { role: "student", orgId: "gone", lessonsDone: 1, avgAccuracy: 1 },
    ], [{ id: "o1", name: "Nile School", status: "active", country: "EG" }, { id: "p", name: "Waiting", status: "pending" }], now);
    expect(o.users).toEqual({ total: 4, byRole: { teacher: 1, student: 2, learner: 1 }, new7: 1, new30: 2, active7: 1, active30: 2, withLessons: 3 });
    expect(o.lessons).toBe(7);
    expect(o.avgAccuracy).toBeCloseTo(0.8);
    expect(o.weeks).toEqual({ "2026-W44": 4, "2026-W42": 1 });
    expect(o.orgs).toEqual({ o1: { name: "Nile School", country: "EG", members: 2, teachers: 1, students: 1, active7: 1, active30: 2, lessons: 6, xp: 280, avgAccuracy: 0.7 } });
    expect(o.orgsByStatus).toEqual({ active: 1, pending: 1 });
  });
  it("averages accuracy only over people with graded lessons (FC-06)", () => {
    const o = overview([
      { role: "student", orgId: "o1", lessonsDone: 3, graded: 0, avgAccuracy: 0 }, // only project lessons: no score
      { role: "student", orgId: "o1", lessonsDone: 4, graded: 3, avgAccuracy: 0.6 },
      { role: "teacher", orgId: "o1", lessonsDone: 2, avgAccuracy: 0.8 }, // a summary from before `graded`
    ], [{ id: "o1", name: "Nile School", status: "active" }], now);
    expect(o.users.withLessons).toBe(3);
    expect(o.lessons).toBe(9);
    expect(o.avgAccuracy).toBeCloseTo(0.7);
    expect(o.orgs.o1.avgAccuracy).toBeCloseTo(0.7);
  });
  it("keeps an organization's name and country to the sizes the functions allow, so stats/overview stays small", () => {
    const o = overview([], [{ id: "o1", name: "N".repeat(5000), status: "active", country: "x".repeat(1_048_000) }, { id: "o2", status: "active", country: { not: "a string" } }], now);
    expect(o.orgs.o1.name).toHaveLength(120);
    expect(o.orgs.o1.country).toHaveLength(80);
    expect(o.orgs.o2).toMatchObject({ name: "o2" });
    expect(o.orgs.o2.country).toBeUndefined();
    expect(JSON.stringify(o).length).toBeLessThan(2000);
  });
  it("overviewAcc, fed three pages, gives exactly what overview gives for the same accounts", () => {
    const roles = ["teacher", "student", "learner", "orgAdmin", undefined];
    const rows: UserRow[] = Array.from({ length: 4500 }, (_, i) => ({
      role: roles[i % 5], orgId: i % 7 === 0 ? null : `o${i % 4}`, // o3 is pending, so its members are listed nowhere
      createdAt: i % 3 ? now.getTime() - (i % 60) * day : null,
      lastActive: i % 4 ? new Date(now.getTime() - (i % 45) * day).toISOString() : null,
      lessonsDone: i % 6, ...(i % 2 ? { graded: i % 3 } : {}), xp: i % 90, avgAccuracy: (i % 10) / 10,
      weeks: i % 5 ? { [`2026-W${40 + (i % 5)}`]: i % 4 } : {},
    }));
    const orgs = [{ id: "o0", name: "Nile School", status: "active", country: "EG" }, { id: "o1", status: "active" }, { id: "o2", name: "Delta", status: "active" }, { id: "o3", name: "Waiting", status: "pending" }, { id: "empty", name: "Nobody yet", status: "active" }];
    const acc = overviewAcc(now);
    for (const page of [rows.slice(0, 2000), rows.slice(2000, 4000), rows.slice(4000)]) for (const u of page) acc.add(u);
    const paged = acc.finish(orgs), whole = overview(rows, orgs, now);
    expect(paged).toEqual(whole);
    expect(JSON.stringify(paged)).toBe(JSON.stringify(whole)); // the same keys in the same order
    expect(paged.users.total).toBe(4500);
    expect(paged.orgs.empty).toMatchObject({ members: 0, avgAccuracy: null });
    expect(paged.orgs).not.toHaveProperty("o3");
    // Members per organization id, whatever its status: what statsJob mends orgs.memberCount with.
    const members = acc.members();
    expect(members.get("o3")).toBe(rows.filter((u) => u.orgId === "o3").length);
    expect(members.has("empty")).toBe(false);
    expect([...members.values()].reduce((a, n) => a + n, 0)).toBe(rows.filter((u) => u.orgId).length);
  });
});
