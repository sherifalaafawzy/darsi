// The pure parts of the security review's fixes (TECHNICAL.md "Security"): what analytics may count under, the progress
// rows the summary trigger keeps, credits held for tutor calls, refunds, and which claims changes end sessions.
import { describe, expect, it } from "vitest";
import { dailyCounts, FUTURE_SEC, parseBatch, sanitize, type Known } from "../src/analyticsCore";
import { afterRefund, holdCredits, settleCredits, type Credits } from "../src/billingCore";
import { losesPower } from "../src/roles";
import { cleanRow, sameRow, summarize } from "../src/summary";
import { LAB_IDS } from "../src/shared/labs";
import { labsFile, labIds } from "../scripts/copy-shared.mjs";

const NOW = Date.parse("2026-11-01T12:00:00Z") / 1000;
const D = "a1b2c3d4e5f6a7b8c9d0";
const known: Known = { units: new Set(["ai-1-1"]), labs: new Set(["neuron"]), orgs: new Set(["org123"]), tracks: new Set(["ai"]), langs: new Set(["en", "ar", "und"]) };

describe("collect (H3)", () => {
  it("drops events more than ten minutes ahead of the server's clock", () => {
    const b = parseBatch({ d: D, c: {}, e: [{ n: "session_start", t: NOW + FUTURE_SEC - 1 }, { n: "session_start", t: NOW + FUTURE_SEC + 1 }, { n: "session_start", t: NOW + 3600 }] }, NOW);
    expect(b.events).toHaveLength(1);
  });
  it("counts only under ids Darsi knows; anything a phone makes up is \"other\"", () => {
    const b = parseBatch({ d: D, c: { r: "teacher", l: "xq", a: "aliens", o: "fake-org" }, e: [
      { n: "lesson_complete", t: NOW, p: { u: "made-up-unit-1", tr: "made-up", acc: 50, sec: 10 } },
      { n: "lesson_complete", t: NOW, p: { u: "ai-1-1", tr: "ai" } },
      { n: "lab_open", t: NOW, p: { lab: "zzz" } },
      { n: "screen_view", t: NOW, p: { s: "random_screen" } },
      { n: "session_start", t: NOW },
    ] }, NOW);
    const s = sanitize(b, known);
    expect(s.ctx).toMatchObject({ lang: "other", aud: "other" });
    expect(s.ctx.org).toBeUndefined();
    const c = dailyCounts(s)["2026-11-01"] as Record<string, Record<string, Record<string, number>>>;
    expect(c.lessons.unit).toEqual({ other: 1, "ai-1-1": 1 });
    expect(c.lessons.track).toEqual({ other: 1, ai: 1 });
    expect(c.labs).toEqual({ other: 1 });
    expect(c.screens).toEqual({ other: 1 });
    expect(c.sessions.lang).toEqual({ other: 1 });
    expect(c.org).toBeUndefined();
  });
  it("so a flood of random ids adds no new fields to the day", () => {
    const e = Array.from({ length: 100 }, (_, i) => ({ n: "lesson_complete", t: NOW, p: { u: `u${i}x${Math.random().toString(36).slice(2, 8)}` } }));
    const c = dailyCounts(sanitize(parseBatch({ d: D, c: { r: "guest" }, e }, NOW), known))["2026-11-01"] as Record<string, Record<string, Record<string, number>>>;
    expect(Object.keys(c.lessons.unit)).toEqual(["other"]);
  });
  it("keeps a known org and its audience", () => {
    const s = sanitize(parseBatch({ d: D, c: { r: "student", l: "ar", a: "students", o: "org123" }, e: [] }, NOW), known);
    expect(s.ctx).toMatchObject({ org: "org123", aud: "students", lang: "ar" });
  });
  it("knows every Labs app (functions/src/shared/labs.ts is generated from the web app and committed)", () => {
    expect(LAB_IDS.length).toBeGreaterThan(50);
    expect(labsFile(labIds())).toBe(labsFile([...LAB_IDS]));
  });
});

describe("the summary's rows (H2, M1)", () => {
  const meta = { unitId: "ai-1-1", track: "ai", competencies: ["T.1"] };
  it("takes the course, track and competencies from the unit, never from the phone", () => {
    const row = cleanRow({ lessonId: "ai-1-1-1", accuracy: 3, xp: 900, seconds: 99e9, completedAt: "2026-10-30T09:00:00Z", unitId: "forged", track: "forged", competencies: ["ALL", "OF", "THEM"] }, meta);
    expect(row).toEqual({ accuracy: 1, xp: 100, seconds: 86400, completedAt: "2026-10-30T09:00:00Z", unitId: "ai-1-1", track: "ai", competencies: ["T.1"] });
    expect(cleanRow(undefined, meta)).toBeNull();
  });
  it("sums the rows exactly as before", () => {
    const rows = [cleanRow({ accuracy: 0.5, xp: 10, seconds: 60, completedAt: "2026-10-30T09:00:00Z" }, meta)!, cleanRow({ accuracy: 1, xp: 20, seconds: 120, completedAt: "2026-10-31T09:00:00Z" }, { ...meta, unitId: "ai-1-2" })!];
    expect(summarize(rows, new Date("2026-11-01T12:00:00Z"))).toMatchObject({ lessonsDone: 2, xp: 30, seconds: 180, units: { "ai-1-1": 1, "ai-1-2": 1 }, competencies: { "T.1": 2 }, weeks: { "2026-W44": 2 } });
  });
  it("tells a repeated delivery from a change, whatever order Firestore gives the keys", () => {
    const a = cleanRow({ accuracy: 0.5, xp: 10, seconds: 60, completedAt: "x" }, meta)!;
    const sorted = Object.fromEntries(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)));
    expect(sameRow(a, sorted)).toBe(true);
    expect(sameRow(a, { ...a, xp: 11 })).toBe(false);
    expect(sameRow(undefined, null)).toBe(true);
  });
});

describe("credits held for tutor calls (M5)", () => {
  const now = 1_000_000;
  const c: Credits = { plan: 1, planUntil: now + 1000, packs: 2 };
  it("holds what a call may cost, or all that's left, and nothing when there is nothing", () => {
    expect(holdCredits(c, 0.5, now)).toEqual({ next: { plan: 0.5, planUntil: now + 1000, packs: 2 }, hold: { fromPlan: 0.5, fromPacks: 0 } });
    expect(holdCredits(c, 10, now)).toEqual({ next: { plan: 0, planUntil: now + 1000, packs: 0 }, hold: { fromPlan: 1, fromPacks: 2 } });
    expect(holdCredits({ plan: 0, planUntil: 0, packs: 0 }, 1, now)).toBeNull();
    expect(holdCredits(undefined, 1, now)).toBeNull();
  });
  it("so two calls at once can't both spend the last credits", () => {
    const first = holdCredits({ plan: 0, planUntil: 0, packs: 0.01 }, 0.3, now)!;
    expect(first.hold.fromPacks).toBe(0.01);
    expect(holdCredits(first.next, 0.3, now)).toBeNull();
  });
  it("gives back what wasn't used, packs first, and takes any extra from what's left", () => {
    const h = holdCredits(c, 2, now)!; // 1 from the plan, 1 from packs; 0 + 1 left
    expect(settleCredits(h.next, h.hold, 0.25, now)).toEqual({ next: { plan: 0.75, planUntil: now + 1000, packs: 2 }, charged: 0.25, short: false });
    expect(settleCredits(h.next, h.hold, 2.5, now)).toEqual({ next: { plan: 0, planUntil: now + 1000, packs: 0.5 }, charged: 2.5, short: false });
    expect(settleCredits(h.next, h.hold, 9, now)).toMatchObject({ next: { packs: 0 }, charged: 3, short: true });
  });
});

describe("refunds take back what they bought (L7)", () => {
  const now = 10 * 864e5;
  const plan = { period: "month" as const, credits: 300 };
  it("a subscription's last period ends now, with its credits", () => {
    const r = afterRefund("subscription", plan, { sub: { plan: "super", status: "active", currentPeriodEnd: now + 20 * 864e5, source: "paymob" }, credits: { plan: 250, planUntil: now + 20 * 864e5, packs: 40 } }, now);
    expect(r.sub).toMatchObject({ status: "expired", currentPeriodEnd: now });
    expect(r.credits).toEqual({ plan: 0, planUntil: now, packs: 40 });
  });
  it("a renewed subscription keeps the period that is still paid", () => {
    const r = afterRefund("subscription", plan, { sub: { plan: "super", status: "active", currentPeriodEnd: now + 50 * 864e5, source: "stripe" }, credits: { plan: 250, planUntil: now + 50 * 864e5, packs: 0 } }, now);
    expect(r.sub).toMatchObject({ status: "active", currentPeriodEnd: now + 20 * 864e5 });
    expect(r.credits).toEqual({ plan: 250, planUntil: now + 20 * 864e5, packs: 0 });
  });
  it("a pack loses its unspent credits, a licence its period", () => {
    expect(afterRefund("credits", { period: "month", credits: 100 }, { credits: { plan: 5, planUntil: now + 1, packs: 130 } }, now).credits).toEqual({ plan: 5, planUntil: now + 1, packs: 30 });
    expect(afterRefund("credits", { period: "month", credits: 100 }, { credits: { plan: 5, planUntil: now + 1, packs: 60 } }, now).credits?.packs).toBe(0);
    expect(afterRefund("licence", { period: "year", credits: 0 }, { licence: { plan: "seat", seats: 30, until: now + 100 * 864e5 } }, now).licence).toBeNull();
    expect(afterRefund("licence", { period: "month", credits: 0 }, { licence: { plan: "seat", seats: 30, until: now + 100 * 864e5 } }, now).licence).toEqual({ plan: "seat", seats: 30, until: now + 70 * 864e5 });
  });
});

describe("claims changes that end sessions (M2)", () => {
  it("a demotion, or leaving an organization", () => {
    expect(losesPower({ role: "orgAdmin", orgId: "o1" }, { role: "teacher", orgId: "o1" })).toBe(true);
    expect(losesPower({ role: "superadmin" }, { role: "learner", orgId: null })).toBe(true);
    expect(losesPower({ role: "student", orgId: "o1" }, { role: "learner", orgId: null })).toBe(true);
    expect(losesPower({ role: "teacher", orgId: "o1" }, { role: "teacher", orgId: "o2" })).toBe(true);
  });
  it("but not a promotion, joining, or the same claims again (a subscription's refresh)", () => {
    expect(losesPower({ role: "teacher", orgId: "o1" }, { role: "orgAdmin", orgId: "o1" })).toBe(false);
    expect(losesPower({ role: "learner" }, { role: "student", orgId: "o1" })).toBe(false);
    expect(losesPower({}, { role: "learner", orgId: null })).toBe(false);
    expect(losesPower({ role: "student", orgId: "o1" }, { role: "student", orgId: "o1" })).toBe(false);
  });
});
