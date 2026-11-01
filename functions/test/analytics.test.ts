import { describe, expect, it } from "vitest";
import { dailyCounts, measurementPayloads, overview, parseBatch, MAX_EVENTS } from "../src/analyticsCore";

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
});
