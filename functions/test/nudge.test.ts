import { describe, expect, it } from "vitest";
import { isoWeek, localDay, pickNudge, recentWeeks, streakWeeks, utcHourFor, type NudgeInput } from "../src/nudge";

const at = (s: string) => new Date(s);
// Wednesday 21 October 2026 (ISO week 2026-W43), 16:00 UTC. The week runs Monday 19 to Sunday 25 October.
const WED = at("2026-10-21T16:00:00Z");
const base = (o: Partial<NudgeInput> = {}): NudgeInput => ({
  tz: "UTC", lastLessonAt: "2026-10-20T09:00:00Z", createdAt: "2026-09-01T08:00:00Z", weeks: {}, weeklyGoal: 4, ...o,
});
const daily = (n: unknown) => expect(n).toMatchObject({ kind: expect.stringMatching(/^daily[012]$/) });

describe("time helpers", () => {
  it("isoWeek is the ISO 8601 week in UTC, across year ends", () => {
    expect(isoWeek(at("2026-10-25T23:59:59Z"))).toBe("2026-W43"); // Sunday
    expect(isoWeek(at("2026-10-26T00:00:00Z"))).toBe("2026-W44"); // Monday
    expect(isoWeek(at("2026-01-01T00:00:00Z"))).toBe("2026-W01"); // a Thursday
    expect(isoWeek(at("2027-01-01T12:00:00Z"))).toBe("2026-W53"); // a Friday
    expect(isoWeek(at("2027-01-04T00:00:00Z"))).toBe("2027-W01");
    expect(isoWeek(at("2021-01-03T00:00:00Z"))).toBe("2020-W53");
  });

  it("localDay follows the time zone", () => {
    const t = at("2026-10-21T20:00:00Z").getTime();
    expect(localDay(t, "UTC")).toBe("2026-10-21");
    expect(localDay(t, "Asia/Kolkata")).toBe("2026-10-22"); // 01:30 the next morning
    expect(localDay(t, "Africa/Cairo")).toBe("2026-10-21"); // 23:00
    expect(localDay(t, "America/Los_Angeles")).toBe("2026-10-21");
  });

  it("utcHourFor maps the local hour to a UTC hour, never early in half-hour zones", () => {
    expect(utcHourFor(18, "UTC", WED)).toBe(18);
    expect(utcHourFor(18, "Asia/Kolkata", WED)).toBe(13); // 18:00 IST = 12:30 UTC; the 13:00 run is 18:30 local
    expect(utcHourFor(18, "Asia/Kathmandu", WED)).toBe(13); // +5:45
    expect(utcHourFor(7, "Asia/Tokyo", WED)).toBe(22); // the previous UTC day
    expect(utcHourFor(20, "America/New_York", WED)).toBe(0); // the next UTC day
    expect(utcHourFor(0, "UTC", WED)).toBe(0);
  });

  it("utcHourFor follows DST (Cairo, London, New York)", () => {
    // Egypt: summer time (UTC+3) until the last Thursday of October, 29 October 2026.
    expect(utcHourFor(18, "Africa/Cairo", at("2026-07-01T09:00:00Z"))).toBe(15);
    expect(utcHourFor(18, "Africa/Cairo", at("2026-10-28T09:00:00Z"))).toBe(15);
    expect(utcHourFor(18, "Africa/Cairo", at("2026-10-30T09:00:00Z"))).toBe(16);
    expect(utcHourFor(18, "Africa/Cairo", at("2026-12-01T09:00:00Z"))).toBe(16);
    // UK clocks go back on Sunday 25 October 2026 at 01:00 UTC.
    expect(utcHourFor(18, "Europe/London", at("2026-10-24T09:00:00Z"))).toBe(17);
    expect(utcHourFor(18, "Europe/London", at("2026-10-25T09:00:00Z"))).toBe(18);
    // US clocks go back on Sunday 1 November 2026.
    expect(utcHourFor(7, "America/New_York", at("2026-10-31T15:00:00Z"))).toBe(11);
    expect(utcHourFor(7, "America/New_York", at("2026-11-01T15:00:00Z"))).toBe(12);
  });

  it("utcHourFor lands after a spring-forward gap, never before it", () => {
    // 8 March 2026, New York: 02:00 does not exist (01:59 EST → 03:00 EDT = 07:00 UTC).
    expect(utcHourFor(2, "America/New_York", at("2026-03-08T15:00:00Z"))).toBe(7);
    // 29 March 2026, London: 01:00 does not exist (00:59 GMT → 02:00 BST = 01:00 UTC).
    expect(utcHourFor(1, "Europe/London", at("2026-03-29T12:00:00Z"))).toBe(1);
  });

  it("an invalid time zone is treated as UTC", () => {
    expect(utcHourFor(18, "Not/AZone", WED)).toBe(18);
  });

  it("recentWeeks counts lessons per ISO week and keeps only the last 12 weeks", () => {
    const now = at("2026-10-21T10:00:00Z");
    const w = recentWeeks(["2026-10-19T08:00:00Z", "2026-10-21T08:00:00Z", "2026-10-12T08:00:00Z", "2026-08-03T08:00:00Z", "2026-07-27T08:00:00Z", "garbage", null], now);
    expect(w).toEqual({ "2026-W43": 2, "2026-W42": 1, "2026-W32": 1 }); // W32 is the 12th week back; W31 is dropped
    expect(Object.keys(recentWeeks([], now))).toHaveLength(0);
  });

  it("streakWeeks counts goal-half weeks ending this week or last week", () => {
    expect(streakWeeks({ "2026-W43": 2, "2026-W42": 2, "2026-W41": 5 }, 4, WED)).toBe(3);
    expect(streakWeeks({ "2026-W42": 2, "2026-W41": 2 }, 4, WED)).toBe(2); // this week not yet: counts from last week
    expect(streakWeeks({ "2026-W42": 2, "2026-W40": 2 }, 4, WED)).toBe(1); // a gap ends it
    expect(streakWeeks({ "2026-W43": 1, "2026-W42": 1 }, 1, WED)).toBe(2); // goal 1 → at least 1
    expect(streakWeeks({ "2026-W43": 1, "2026-W42": 1 }, 4, WED)).toBe(0);
    expect(streakWeeks({ "2026-W53": 2, "2026-W52": 2 }, 3, at("2027-01-06T10:00:00Z"))).toBe(2); // across the year end
  });
});

describe("pickNudge rule 1: at most one automatic nudge per local day", () => {
  it("is quiet when one was already sent today", () => {
    expect(pickNudge(base({ lastAutoAt: "2026-10-21T06:00:00Z" }), WED)).toBeNull();
    daily(pickNudge(base({ lastAutoAt: "2026-10-20T16:00:00Z" }), WED));
  });

  it("uses the person's local day (Asia/Kolkata, +5:30)", () => {
    const now = at("2026-10-21T12:30:00Z"); // 18:00 IST on 21 October
    // 19:00 UTC on the 20th is 00:30 IST on the 21st: already today in Kolkata, yesterday in UTC.
    expect(pickNudge(base({ tz: "Asia/Kolkata", lastAutoAt: "2026-10-20T19:00:00Z" }), now)).toBeNull();
    daily(pickNudge(base({ tz: "UTC", lastAutoAt: "2026-10-20T19:00:00Z" }), now));
    // 18:00 UTC on the 20th is 23:30 IST on the 20th: yesterday.
    daily(pickNudge(base({ tz: "Asia/Kolkata", lastAutoAt: "2026-10-20T18:00:00Z" }), now));
  });

  it("uses the person's local day (Africa/Cairo, +3 in summer time)", () => {
    const now = at("2026-10-21T15:00:00Z"); // 18:00 in Cairo
    expect(pickNudge(base({ tz: "Africa/Cairo", lastAutoAt: "2026-10-20T21:30:00Z" }), now)).toBeNull(); // 00:30 on the 21st
    daily(pickNudge(base({ tz: "Africa/Cairo", lastAutoAt: "2026-10-20T20:30:00Z" }), now)); // 23:30 on the 20th
  });
});

describe("pickNudge rule 2: no nudge after learning today", () => {
  it("is quiet when the last lesson was today", () => {
    expect(pickNudge(base({ lastLessonAt: "2026-10-21T07:00:00Z" }), WED)).toBeNull();
  });
  it("uses the local day", () => {
    const now = at("2026-10-21T15:00:00Z");
    expect(pickNudge(base({ tz: "Africa/Cairo", lastLessonAt: "2026-10-20T22:00:00Z" }), now)).toBeNull(); // 01:00 Cairo on the 21st
    daily(pickNudge(base({ tz: "UTC", lastLessonAt: "2026-10-20T22:00:00Z" }), now));
  });
});

describe("pickNudge rule 3: comebacks after a break", () => {
  it("sends comeback7 after 7 local days without a lesson, not after 6", () => {
    expect(pickNudge(base({ lastLessonAt: "2026-10-14T20:00:00Z" }), WED)).toEqual({ kind: "comeback7" });
    daily(pickNudge(base({ lastLessonAt: "2026-10-15T08:00:00Z" }), WED));
  });

  it("counts whole days in the person's time zone", () => {
    const now = at("2026-10-21T12:30:00Z");
    const last = "2026-10-14T19:00:00Z"; // 14 October in UTC, 15 October 00:30 in Kolkata
    expect(pickNudge(base({ tz: "UTC", lastLessonAt: last }), now)).toEqual({ kind: "comeback7" });
    daily(pickNudge(base({ tz: "Asia/Kolkata", lastLessonAt: last }), now));
  });

  it("is quiet between day 7 and day 21 once comeback7 was sent", () => {
    const i = base({ lastLessonAt: "2026-10-10T09:00:00Z", comeback7At: "2026-10-17T16:00:00Z" });
    expect(pickNudge(i, WED)).toBeNull(); // day 11
    expect(pickNudge(i, at("2026-10-30T16:00:00Z"))).toBeNull(); // day 20
    expect(pickNudge(i, at("2026-10-31T16:00:00Z"))).toEqual({ kind: "comeback21" }); // day 21
  });

  it("sends comeback21 once, then stops for good", () => {
    const last = "2026-09-30T09:00:00Z"; // 21 days before WED
    expect(pickNudge(base({ lastLessonAt: last }), WED)).toEqual({ kind: "comeback21" }); // even if comeback7 never went out
    const sent = base({ lastLessonAt: last, comeback7At: "2026-10-07T16:00:00Z", comeback21At: "2026-10-21T10:00:00Z" });
    expect(pickNudge(sent, at("2026-10-22T16:00:00Z"))).toBeNull();
    expect(pickNudge(sent, at("2027-03-01T16:00:00Z"))).toBeNull();
  });

  it("resets the flags when the person comes back", () => {
    // Both flags are older than the latest lesson, so they no longer count.
    const i = base({ lastLessonAt: "2026-10-12T09:00:00Z", comeback7At: "2026-09-01T16:00:00Z", comeback21At: "2026-09-15T16:00:00Z" });
    expect(pickNudge(i, at("2026-10-19T16:00:00Z"))).toEqual({ kind: "comeback7" });
    expect(pickNudge(i, at("2026-11-02T16:00:00Z"))).toEqual({ kind: "comeback21" });
  });

  it("falls back to createdAt without any lesson, and to Infinity without either", () => {
    expect(pickNudge(base({ lastLessonAt: null, createdAt: "2026-10-11T08:00:00Z" }), WED)).toEqual({ kind: "comeback7" });
    daily(pickNudge(base({ lastLessonAt: null, createdAt: "2026-10-19T08:00:00Z" }), WED));
    expect(pickNudge(base({ lastLessonAt: null, createdAt: null }), WED)).toEqual({ kind: "comeback21" });
    expect(pickNudge(base({ lastLessonAt: null, createdAt: null, comeback21At: "2026-10-01T00:00:00Z" }), WED)).toBeNull();
    // With no lesson at all, any flag counts as sent.
    expect(pickNudge(base({ lastLessonAt: null, createdAt: "2026-10-11T08:00:00Z", comeback7At: "2026-10-18T00:00:00Z" }), WED)).toBeNull();
  });

  it("ignores unparsable dates", () => {
    daily(pickNudge(base({ lastLessonAt: "2026-10-20T09:00:00Z", lastAutoAt: "not a date", comeback7At: "nope" }), WED));
  });
});

describe("pickNudge rule 4: weekly goal near the end of the week", () => {
  const SAT = at("2026-10-24T16:00:00Z"), SUN = at("2026-10-25T16:00:00Z"), FRI = at("2026-10-23T16:00:00Z");
  const i = base({ lastLessonAt: "2026-10-22T09:00:00Z", weeks: { "2026-W43": 2 } }); // 2 of the default 4 done

  it("on Saturday and Sunday (UTC) it says how many lessons are left", () => {
    expect(pickNudge(i, SAT)).toEqual({ kind: "weekGoal", n: 2 });
    expect(pickNudge(i, SUN)).toEqual({ kind: "weekGoal", n: 2 });
    expect(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeklyGoal: 2, weeks: { "2026-W43": 1 } }), SAT)).toEqual({ kind: "weekGoal", n: 1 });
  });

  it("only when the goal is within reach (at most half left), since the message says \"You're close\"", () => {
    daily(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeks: { "2026-W43": 1 } }), SAT)); // 3 of 4 left
    daily(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeklyGoal: 12, weeks: { "2026-W43": 2 } }), SUN)); // 10 of 12 left
    expect(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeklyGoal: 12, weeks: { "2026-W43": 6 } }), SUN)).toEqual({ kind: "weekGoal", n: 6 });
  });

  it("not earlier in the week", () => {
    daily(pickNudge(i, FRI));
    daily(pickNudge({ ...i, lastLessonAt: "2026-10-20T09:00:00Z" }, WED));
  });

  it("not when the goal is met", () => {
    daily(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeks: { "2026-W43": 4 } }), SAT));
    daily(pickNudge(base({ lastLessonAt: "2026-10-22T09:00:00Z", weeks: { "2026-W43": 6 } }), SUN));
  });

  it("uses the UTC week and day, whatever the local day", () => {
    // 22:00 UTC on Sunday is 07:00 on Monday in Tokyo: still the UTC week's last day.
    expect(pickNudge({ ...i, tz: "Asia/Tokyo" }, at("2026-10-25T22:00:00Z"))).toEqual({ kind: "weekGoal", n: 2 });
    // 00:30 UTC on Monday is already the next week, with nothing done yet: no weekGoal on a Monday.
    daily(pickNudge({ ...i, tz: "America/Los_Angeles" }, at("2026-10-26T00:30:00Z")));
  });

  it("comes before the streak", () => {
    const s = base({ lastLessonAt: "2026-10-22T09:00:00Z", weeks: { "2026-W43": 2, "2026-W42": 4, "2026-W41": 4 } });
    expect(pickNudge(s, SAT)).toEqual({ kind: "weekGoal", n: 2 });
    // Midweek: this week's 2 already meets the streak bar (ceil(4/2)), so the streak counts 3 weeks.
    expect(pickNudge({ ...s, lastLessonAt: "2026-10-20T09:00:00Z" }, WED)).toEqual({ kind: "streak", n: 3 });
  });
});

describe("pickNudge rule 5: streak of weeks", () => {
  it("celebrates a streak of 2+ weeks while this week's goal is not met yet", () => {
    expect(pickNudge(base({ weeks: { "2026-W42": 2, "2026-W41": 2 } }), WED)).toEqual({ kind: "streak", n: 2 });
    expect(pickNudge(base({ weeks: { "2026-W43": 2, "2026-W42": 3, "2026-W41": 2 } }), WED)).toEqual({ kind: "streak", n: 3 });
  });
  it("not for a one-week streak or a met goal", () => {
    daily(pickNudge(base({ weeks: { "2026-W42": 4 } }), WED));
    daily(pickNudge(base({ weeks: { "2026-W43": 4, "2026-W42": 4, "2026-W41": 4 } }), WED));
  });
  it("works across the ISO year end", () => {
    const now = at("2027-01-06T16:00:00Z");
    expect(pickNudge(base({ lastLessonAt: "2027-01-04T09:00:00Z", weeklyGoal: 3, weeks: { "2026-W53": 2, "2026-W52": 2 } }), now)).toEqual({ kind: "streak", n: 2 });
  });
});

describe("pickNudge rule 6: daily rotation", () => {
  it("rotates daily0, daily1, daily2 by local day of the year", () => {
    // 21 October is day 294 (294 % 3 = 0).
    expect(pickNudge(base(), at("2026-10-21T16:00:00Z"))).toEqual({ kind: "daily0" });
    expect(pickNudge(base(), at("2026-10-22T16:00:00Z"))).toEqual({ kind: "daily1" });
    expect(pickNudge(base(), at("2026-10-23T16:00:00Z"))).toEqual({ kind: "daily2" });
    expect(pickNudge(base({ lastLessonAt: "2026-12-30T09:00:00Z" }), at("2027-01-01T10:00:00Z"))).toEqual({ kind: "daily1" }); // day 1
  });
  it("uses the local day, not the UTC day", () => {
    const now = at("2026-10-21T20:00:00Z"); // 21 October in UTC, 22 October 01:30 in Kolkata
    expect(pickNudge(base(), now)).toEqual({ kind: "daily0" });
    expect(pickNudge(base({ tz: "Asia/Kolkata" }), now)).toEqual({ kind: "daily1" });
  });
  it("treats an invalid time zone as UTC and an odd goal as a sane one", () => {
    expect(pickNudge(base({ tz: "Mars/Olympus" }), WED)).toEqual({ kind: "daily0" });
    expect(pickNudge(base({ weeklyGoal: Number.NaN }), WED)).toEqual({ kind: "daily0" });
  });
});
