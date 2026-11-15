// A tutor call's credits (startCall, endCall, balance): what a call holds is kept on its lease (tutorLeases/{uid}), so
// a call that never ended (a timeout, a crash) gives it back when its lease runs out, once, and a call that ends after
// that is charged its cost without getting the hold back a second time. Also who has Super. Firestore is the
// in-memory fake, with its transactions run one after another, as Firestore's own are on the documents they read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const db = new FakeDb();
  // The fake alone lets two overlapping transactions both read the old documents; Firestore makes the second wait or
  // run again. One after another is what the functions can rely on.
  const run = db.runTransaction.bind(db);
  let last: Promise<unknown> = Promise.resolve();
  db.runTransaction = ((fn: Parameters<typeof run>[0]) => { const p = last.then(() => run(fn)); last = p.catch(() => undefined); return p; }) as typeof db.runTransaction;
  return { db, caller: () => ({ uid: "u1", role: "learner" }), str: (v: unknown) => String(v ?? "") };
});
vi.mock("../src/settings.js", () => ({ superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ bucket: () => ({ file: () => ({ download: async () => { throw Object.assign(new Error("No such object"), { code: 404 }); } }) }) }));
vi.mock("../src/agent.js", () => ({ AgentError: class extends Error {}, askAgent: async () => null, openSession: async () => "s1" }));

const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { balance, endCall, hasSuper, startCall } = await import("../src/tutor");

const T0 = Date.parse("2026-11-10T10:00:00Z"), HOUR = 3_600_000;
const credits = () => db.docs.get("credits/u1") as { plan: number; planUntil: number; packs: number };
const leases = () => ((db.docs.get("tutorLeases/u1") as { calls?: Record<string, { kind: string; until: number; hold?: { fromPlan: number; fromPacks: number } }> } | undefined)?.calls ?? {});
const refused = async (p: Promise<unknown>) => (await p.then(() => null, (e: { code?: string; message?: string }) => `${e.code}:${e.message}`));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  db.docs.clear();
  db.docs.set("credits/u1", { plan: 100, planUntil: T0 + 30 * 24 * HOUR, packs: 0 });
});
afterEach(() => vi.useRealTimers());

describe("who has Darsi Super (the token's planUntil)", () => {
  it("is no one without planUntil, or with one that passed", () => {
    expect(hasSuper(undefined)).toBe(false);
    expect(hasSuper({})).toBe(false);
    expect(hasSuper({ role: "teacher", plan: "super_month" })).toBe(false);
    expect(hasSuper({ planUntil: T0 - 1 })).toBe(false);
    expect(hasSuper({ planUntil: T0 })).toBe(false);
    expect(hasSuper({ planUntil: "soon" })).toBe(false);
  });
  it("is anyone whose planUntil is still ahead", () => {
    expect(hasSuper({ planUntil: T0 + 1 })).toBe(true);
    expect(hasSuper({ planUntil: T0 + 24 * HOUR, role: "student" })).toBe(true);
  });
});

describe("a call's hold is kept on its lease", () => {
  it("startCall writes what it took out of the credits beside the call", async () => {
    const call = await startCall("u1", "text", 15, 200_000);
    expect(call.hold).toEqual({ fromPlan: 15, fromPacks: 0 });
    expect(credits().plan).toBe(85);
    expect(leases()[call.id]).toEqual({ kind: "text", until: T0 + 200_000, hold: { fromPlan: 15, fromPacks: 0 } });
  });

  it("a call that never ended gives its hold back when the next one starts, before that one holds", async () => {
    const lost = await startCall("u1", "text", 15, 200_000);
    vi.setSystemTime(T0 + 200_001);
    const next = await startCall("u1", "text", 15, 200_000);
    // 100 − 15 (lost) + 15 (given back) − 15 (held now): before, the first 15 were gone for good.
    expect(credits().plan).toBe(85);
    expect(Object.keys(leases())).toEqual([next.id]);
    expect(leases()[lost.id]).toBeUndefined();
    // And ending the new call gives its own hold back, as ever.
    expect(await endCall("u1", next.id, next.hold, 2)).toEqual({ charged: 2, left: 98, short: false });
  });

  it("someone whose whole balance was held reads it again, so they aren't refused 'no-credits' for good", async () => {
    db.docs.set("credits/u1", { plan: 0, planUntil: 0, packs: 10 });
    await startCall("u1", "voice", 15, 16 * 60_000); // takes all 10
    expect(await balance("u1")).toBe(0);
    vi.setSystemTime(T0 + 16 * 60_000 + 1);
    expect(await balance("u1")).toBe(10);
    expect(credits().packs).toBe(10);
    expect(leases()).toEqual({});
    // Read again: nothing more comes back.
    expect(await balance("u1")).toBe(10);
  });

  it("gives an expired hold back exactly once when two calls start together", async () => {
    await startCall("u1", "text", 15, 200_000);
    vi.setSystemTime(T0 + 200_001);
    const [a, b] = await Promise.all([startCall("u1", "text", 15, 200_000), startCall("u1", "text", 15, 200_000)]);
    // 100 − 15 + 15 (once) − 15 − 15. Given back twice, it would be 85.
    expect(credits().plan).toBe(70);
    expect(Object.keys(leases()).sort()).toEqual([a.id, b.id].sort());
    // The same with the balance read at the same moment as a new call.
    vi.setSystemTime(T0 + 400_002);
    const [left] = await Promise.all([balance("u1"), startCall("u1", "text", 15, 200_000)]);
    expect(credits().plan).toBe(85); // 70 + 30 given back − 15
    expect([85, 100]).toContain(left); // read before or after the new call's hold, never 115
  });

  it("gives an expired hold back even when the new call is refused as busy", async () => {
    await startCall("u1", "text", 15, 1_000);
    await startCall("u1", "voice", 10, 16 * 60_000);
    expect(credits().plan).toBe(75);
    vi.setSystemTime(T0 + 1_001);
    expect(await refused(startCall("u1", "voice", 10, 16 * 60_000))).toBe("resource-exhausted:busy");
    expect(credits().plan).toBe(90); // the typed call's 15 came back; the voice call still holds its 10
    expect(Object.values(leases()).map((l) => l.kind)).toEqual(["voice"]);
  });

  it("refuses 'no-credits' only when nothing is left after what expired calls held came back", async () => {
    db.docs.set("credits/u1", { plan: 0, planUntil: 0, packs: 5 });
    await startCall("u1", "text", 15, 1_000); // takes all 5
    expect(await refused(startCall("u1", "text", 15, 1_000))).toBe("resource-exhausted:no-credits");
    vi.setSystemTime(T0 + 1_001);
    const again = await startCall("u1", "text", 15, 1_000);
    expect(again.hold).toEqual({ fromPlan: 0, fromPacks: 5 });
  });

  it("a hold from an allowance that has lapsed since isn't given back as this period's credits", async () => {
    db.docs.set("credits/u1", { plan: 20, planUntil: T0 + 1_000, packs: 4 });
    await startCall("u1", "text", 22, 500); // 20 from the plan, 2 from the packs
    vi.setSystemTime(T0 + 2_000); // the period ended
    expect(await balance("u1")).toBe(4); // the packs' 2 came back; the lapsed allowance's 20 didn't
  });
});

describe("ending a call", () => {
  it("settles against the lease's hold while the lease is there, even past its time", async () => {
    const call = await startCall("u1", "text", 15, 200_000);
    vi.setSystemTime(T0 + 200_001);
    expect(await endCall("u1", call.id, call.hold, 2)).toEqual({ charged: 2, left: 98, short: false });
    expect(leases()).toEqual({});
    // Nothing is left on a lease to give back later.
    await startCall("u1", "text", 15, 200_000);
    expect(credits().plan).toBe(83);
  });

  it("with its lease gone, charges the cost and gives nothing back a second time", async () => {
    const call = await startCall("u1", "voice", 15, 16 * 60_000);
    vi.setSystemTime(T0 + 16 * 60_000 + 1);
    expect(await balance("u1")).toBe(100); // the lease ran out: its hold came back here
    // The call ends after all (a relay that outlived its lease): its cost is charged; its 15 don't come back again.
    expect(await endCall("u1", call.id, call.hold, 2.5)).toEqual({ charged: 2.5, left: 97.5, short: false });
    expect(credits().plan).toBe(97.5);
    // Ended twice by mistake: charged again at most, never credited.
    expect((await endCall("u1", call.id, call.hold, 0)).left).toBe(97.5);
  });

  it("with its lease gone, never takes the balance below zero", async () => {
    db.docs.set("credits/u1", { plan: 0, planUntil: 0, packs: 3 });
    const call = await startCall("u1", "voice", 15, 1_000);
    vi.setSystemTime(T0 + 1_001);
    await balance("u1"); // 3 back
    expect(await endCall("u1", call.id, call.hold, 7)).toEqual({ charged: 3, left: 0, short: true });
    expect(credits()).toMatchObject({ plan: 0, packs: 0 });
    // A cost that isn't a number charges what was held, at most what is left (as settleCredits does).
    db.docs.set("credits/u1", { plan: 0, planUntil: 0, packs: 50 });
    expect(await endCall("u1", call.id, { fromPlan: 0, fromPacks: 3 }, NaN)).toEqual({ charged: 3, left: 47, short: false });
  });

  it("writes no credits for an account whose documents are gone (deleted mid-call)", async () => {
    const call = await startCall("u1", "text", 15, 200_000);
    db.docs.delete("credits/u1");
    db.docs.delete("tutorLeases/u1");
    expect(await endCall("u1", call.id, call.hold, 2)).toEqual({ charged: 0, left: 0, short: true });
    expect(db.docs.has("credits/u1")).toBe(false);
  });
});

describe("leases from before holds were kept on them", () => {
  it("are dropped once expired, with nothing given back", async () => {
    db.docs.set("credits/u1", { plan: 50, planUntil: T0 + HOUR, packs: 0 });
    db.docs.set("tutorLeases/u1", { warmAt: 5, calls: { old: { kind: "text", until: T0 - 1 }, junk: null } });
    expect(await balance("u1")).toBe(50);
    const call = await startCall("u1", "text", 15, 200_000);
    expect(credits().plan).toBe(35);
    expect(Object.keys(leases())).toEqual([call.id]);
    expect((db.docs.get("tutorLeases/u1") as { warmAt: number }).warmAt).toBe(5); // the warm-up time is kept
  });

  it("still settle against the hold their call carries, while they last", async () => {
    db.docs.set("credits/u1", { plan: 85, planUntil: T0 + HOUR, packs: 0 });
    db.docs.set("tutorLeases/u1", { calls: { old: { kind: "voice", until: T0 + 60_000 } } });
    expect(await endCall("u1", "old", { fromPlan: 15, fromPacks: 0 }, 2)).toEqual({ charged: 2, left: 98, short: false });
    expect(leases()).toEqual({});
  });
});
