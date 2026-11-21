// dailyNudges as one run (notify.ts) against an in-memory Firestore that pages (pagingFirestore.ts) and a stand-in for
// FCM: it takes the people of this UTC hour 50 at a time, stops by itself once 500 s have passed, and leaves its
// heartbeat in stats/jobs.dailyNudges with `complete`, so a run that left people without their nudge is seen.
import { logger } from "firebase-functions/v2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PagingDb } from "./pagingFirestore";

const fcm = vi.hoisted(() => ({ sent: [] as string[], failFor: new Set<string>() }));
vi.mock("../src/admin.js", async () => {
  const { PagingDb } = await import("./pagingFirestore");
  const messaging = {
    sendEachForMulticast: async ({ tokens }: { tokens: string[] }) => {
      if (tokens.some((t) => fcm.failFor.has(t))) throw new Error("messaging/internal-error");
      fcm.sent.push(...tokens);
      return { successCount: tokens.length, responses: tokens.map(() => ({ success: true })) };
    },
  };
  return {
    db: new PagingDb(), messaging, auth: {}, audit: async () => {},
    caller: () => { throw new Error("not used"); }, freshCaller: async () => { throw new Error("not used"); },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});

const { db } = (await import("../src/admin.js")) as unknown as { db: PagingDb };
const { dailyNudges } = await import("../src/notify");
const run = () => (dailyNudges as unknown as { run: (x: unknown) => Promise<void> }).run({});
const doc = (path: string) => db.docs.get(path) as Record<string, any> | undefined;

// A Wednesday (no weekly-goal nudge), 09:00 UTC. The clock is the test's: `clock.t` is what Date.now() answers.
const T0 = Date.parse("2026-11-11T09:00:02Z"), HOUR = 9, DAY = 864e5;
const clock = { t: T0 };
const uid = (i: number) => `u${String(i).padStart(5, "0")}`;
/** Someone whose reminder hour this is. `nudge`: they have a phone and last learned two days ago, so a daily reminder is due. */
function person(i: number, o: { nudge?: boolean; hourUtc?: number; hourLocal?: number; on?: boolean } = {}) {
  db.docs.set(`users/${uid(i)}`, {
    role: "student", createdAt: new Date(T0 - 30 * DAY).toISOString(),
    notify: { on: o.on ?? true, hourUtc: o.hourUtc ?? HOUR, hourLocal: o.hourLocal ?? HOUR, tz: "UTC", weeklyGoal: 4, cats: { reminders: o.nudge === true, reviews: true, staff: true, news: true } },
    summary: { lastLessonAt: new Date(T0 - 2 * DAY).toISOString(), weeks: {} },
  });
  if (o.nudge) db.docs.set(`users/${uid(i)}/devices/d1`, { token: `token-${uid(i)}-0123456789`, lang: "ar" });
}
const userReads = () => db.reads.filter((r) => r.col === "users");

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db.docs.clear(); db.writes = []; db.reads = []; db.failOn = null; db.failRead = null;
  fcm.sent = []; fcm.failFor.clear();
  clock.t = T0;
  vi.spyOn(Date, "now").mockImplementation(() => clock.t);
  errors = vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("dailyNudges", () => {
  it("a full run takes everyone of this hour, page after page, and writes complete: true", async () => {
    for (let i = 1; i <= 640; i++) person(i, { nudge: i === 7 || i === 333 || i === 640 });
    person(700, { nudge: true, hourUtc: 10 }); // another hour's
    person(701, { nudge: true, on: false }); // notifications off
    fcm.failFor.add(`token-${uid(333)}-0123456789`);
    db.docs.set("stats/jobs", { statsJob: { at: 1, ok: true, users: 5 }, dailyNudges: { at: 1, ok: false, error: "an hour ago" } });

    await run();
    expect(userReads().map((r) => [r.size, r.after, r.limit])).toEqual([[300, undefined, 300], [300, uid(300), 300], [40, uid(600), 300]]);
    expect(fcm.sent).toEqual([`token-${uid(7)}-0123456789`, `token-${uid(640)}-0123456789`]);
    expect(doc(`users/${uid(7)}`)!.notify.lastAutoAt).toBe(new Date(T0).toISOString());
    expect(doc(`users/${uid(333)}`)!.notify).not.toHaveProperty("lastAutoAt"); // one person's failure stops nobody else
    const jobs = doc("stats/jobs")!;
    expect(jobs.dailyNudges).toEqual({ at: T0, ok: true, hour: HOUR, seen: 640, sent: 2, failed: 1, complete: true });
    expect(jobs.statsJob).toEqual({ at: 1, ok: true, users: 5 }); // other jobs' heartbeats are left alone
    expect(errors).not.toHaveBeenCalled();
  });

  it("an hour with exactly one full page is complete once the next page comes back empty", async () => {
    for (let i = 1; i <= 300; i++) person(i);
    await run();
    expect(userReads().map((r) => r.size)).toEqual([300, 0]);
    expect(doc("stats/jobs")!.dailyNudges).toMatchObject({ seen: 300, sent: 0, complete: true });
  });

  it("stops taking people once 500 s have passed, writes complete: false and logs it as an error", async () => {
    for (let i = 1; i <= 640; i++) person(i, { nudge: i <= 3 || i === 400 });
    // The 120th person's hour moved (daylight saving): their record is rewritten, and here that takes the rest of the budget.
    person(120, { nudge: true, hourLocal: 10 });
    db.failOn = (w) => { if (w.path === `users/${uid(120)}`) clock.t = T0 + 500e3; return false; };

    await run();
    expect(userReads()).toHaveLength(1); // no second page is read
    expect(fcm.sent).toHaveLength(3); // the 400th person waits for tomorrow, and nobody is told otherwise
    expect(doc("stats/jobs")!.dailyNudges).toEqual({ at: T0 + 500e3, ok: true, hour: HOUR, seen: 150, sent: 3, failed: 0, complete: false });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith("dailyNudges incomplete", { hour: HOUR, seen: 150 });
  });

  it("is not complete when the time ran out on the last person of a full page", async () => {
    for (let i = 1; i <= 640; i++) person(i);
    person(300, { nudge: true, hourLocal: 10 });
    db.failOn = (w) => { if (w.path === `users/${uid(300)}`) clock.t = T0 + 501e3; return false; };
    await run();
    expect(userReads()).toHaveLength(1);
    expect(doc("stats/jobs")!.dailyNudges).toMatchObject({ seen: 300, complete: false });
    expect(errors).toHaveBeenCalledWith("dailyNudges incomplete", { hour: HOUR, seen: 300 });
  });

  it("a run just inside the budget still finishes", async () => {
    for (let i = 1; i <= 340; i++) person(i);
    person(300, { nudge: true, hourLocal: 10 });
    db.failOn = (w) => { if (w.path === `users/${uid(300)}`) clock.t = T0 + 499e3; return false; };
    await run();
    expect(doc("stats/jobs")!.dailyNudges).toMatchObject({ seen: 340, complete: true });
    expect(errors).not.toHaveBeenCalled();
  });

  it("a query that fails writes ok: false with the error and fails the run", async () => {
    for (let i = 1; i <= 10; i++) person(i);
    db.failRead = (col) => col === "users";
    await expect(run()).rejects.toThrow(/DEADLINE_EXCEEDED/);
    const beat = doc("stats/jobs")!.dailyNudges;
    expect(beat).toMatchObject({ at: T0, ok: false, hour: HOUR, seen: 0, sent: 0, failed: 0, complete: false });
    expect(beat.error).toHaveLength(200);
  });

  it("a heartbeat that can't be written doesn't fail a run whose nudges went out", async () => {
    person(1, { nudge: true });
    db.failOn = (w) => w.path === "stats/jobs";
    await run();
    expect(fcm.sent).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith("dailyNudges heartbeat not written", expect.anything());
  });
});
