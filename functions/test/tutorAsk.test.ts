// tutorAsk when the tutor agent doesn't answer in time or fails (sfm-03): what its turn cost Darsi is charged with the
// direct answer that takes its place, and counted; with no answer at all the learner isn't charged but the cost is
// still counted. Also who may ask (Darsi Super), that the credits held are settled or given back on every path, and
// that the whole call keeps to its deadline. Firestore is the in-memory fake, Storage a map, the agent a stand-in, and
// Gemini a stubbed fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "firebase-functions/v2";
import type { FakeDb } from "./fakeFirestore";
import type { TutorUnit } from "../src/tutorCore";

process.env.GEMINI_API_KEY = "test-key";

const files = vi.hoisted(() => new Map<string, unknown>());
const agent = vi.hoisted(() => ({ ask: null as null | ((...a: unknown[]) => Promise<unknown>) }));
const storage = vi.hoisted(() => ({ down: false, reads: 0, downAfter: Infinity }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  return {
    db: new FakeDb(),
    caller: (req: { auth?: { uid: string; token: Record<string, unknown> } }) => { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return { uid: req.auth.uid, role: "learner", orgId: req.auth.token.orgId as string | undefined }; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/settings.js", () => ({ superOn: async () => true }));
// A missing file is Storage's 404 (an ApiError with code 404); `down` (or every read after `downAfter`) is any other failure.
vi.mock("../src/storage.js", () => ({ bucket: () => ({ file: (p: string) => ({ download: async () => {
  if (storage.down || ++storage.reads > storage.downAfter) throw Object.assign(new Error("backend unavailable"), { code: 503 });
  if (!files.has(p)) throw Object.assign(new Error("No such object"), { code: 404 });
  return [Buffer.from(JSON.stringify(files.get(p)))];
} }) }) }));
vi.mock("../src/agent.js", () => {
  class AgentError extends Error { constructor(m: string, readonly usd: number, readonly timedOut = false) { super(m); } }
  return { AgentError, askAgent: (...a: unknown[]) => agent.ask!(...a), openSession: async () => "s1" };
});

const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { AgentError } = (await import("../src/agent.js")) as unknown as { AgentError: new (m: string, usd: number, t?: boolean) => Error };
const { tutorAsk } = await import("../src/tutor");
const run = (data: Record<string, unknown>, token?: Record<string, unknown>) => (tutorAsk as unknown as { run: (r: unknown) => Promise<Record<string, unknown>> }).run({ auth: { uid: "u1", token: token ?? { planUntil: Date.now() + 864e5 } }, data });
const ASK = { unitId: "ai-1-1", lessonId: "ai-1-1-1", question: "What is training data?", lang: "en" };
const plan = () => (db.docs.get("credits/u1") as { plan: number }).plan;
const calls = () => (db.docs.get("tutorLeases/u1") as { calls?: Record<string, unknown> } | undefined)?.calls ?? {};
/** Gemini's answer, as `direct()` gives it, after `before` ran (something that goes wrong once the model has answered). */
const directThen = (before: () => void) => vi.stubGlobal("fetch", vi.fn(async () => {
  before();
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ inScope: true, answer: "The examples.", sources: ["ai-1-1-1/r"] }) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }));
}));

const unit: TutorUnit = { id: "ai-1-1", track: "ai", level: 1, title: { en: "AI basics" }, lessons: [
  { id: "ai-1-1-1", title: { en: "What is AI?" }, steps: [{ id: "r", type: "read", title: { en: "Patterns" }, body: { en: "Training data is the examples a model learns from." } }] },
] };
const today = () => new Date().toISOString().slice(0, 10);
/** Gemini's direct answer: 1,000 tokens in and 100 out at Flash-Lite's prices = $0.00055. */
const direct = (ok = true) => vi.stubGlobal("fetch", vi.fn(async () => ok
  ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ inScope: true, answer: "The examples a model learns from.", sources: ["ai-1-1-1/r"] }) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }))
  : new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 })));

beforeEach(() => {
  db.docs.clear();
  files.clear();
  files.set("content/catalog.json", { units: [{ id: "ai-1-1", track: "ai", src: "content/units/ai-1-1/v1.json" }] });
  files.set("content/units/ai-1-1/v1.json", unit);
  db.docs.set("config/tutor", { backend: "gemini", engine: "agent", agentId: "a1" });
  db.docs.set("config/plans", { economics: { usdPerCredit: 0.002, egpPerUsd: 50 } });
  db.docs.set("credits/u1", { plan: 100, planUntil: Date.now() + 864e5, packs: 0 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); storage.down = false; storage.reads = 0; storage.downAfter = Infinity; db.failOn = null; });

describe("tutorAsk when the agent doesn't answer (sfm-03)", () => {
  it("charges the agent's turn with the direct answer that took its place, and counts it", async () => {
    agent.ask = async () => { throw new AgentError("TimeoutError: aborted", 0.004, true); };
    direct();
    const r = await run({ unitId: "ai-1-1", lessonId: "ai-1-1-1", question: "What is training data?", lang: "en" });
    // $0.004 + $0.00055 = 2.28 credits (the direct answer alone was 0.28: the agent's turn went uncharged).
    expect(r).toMatchObject({ inScope: true, credits: 2.28 });
    expect((db.docs.get("credits/u1") as { plan: number }).plan).toBeCloseTo(97.72, 6);
    expect((db.docs.get(`tutorUsage/u1/days/${today()}`) as { usd: number }).usd).toBeCloseTo(0.00455, 8);
  });

  it("charges only the direct answer when the agent's failure cost nothing", async () => {
    agent.ask = async () => { throw new AgentError("Agent Runtime 429", 0); };
    direct();
    expect((await run({ unitId: "ai-1-1", lessonId: "ai-1-1-1", question: "What is training data?", lang: "en" })).credits).toBe(0.28);
  });

  it("with no answer at all, gives back what was held but still counts what the agent cost", async () => {
    agent.ask = async () => { throw new AgentError("TimeoutError: aborted", 0.004, true); };
    direct(false);
    await expect(run({ unitId: "ai-1-1", lessonId: "ai-1-1-1", question: "What is training data?", lang: "en" })).rejects.toThrow(/didn't answer/);
    expect((db.docs.get("credits/u1") as { plan: number }).plan).toBe(100);
    expect((db.docs.get(`tutorUsage/u1/days/${today()}`) as { usd: number; credits: number }).usd).toBeCloseTo(0.004, 8);
  });
});

describe("prices typed wrong in config/tutor (sfm-04)", () => {
  it("are ignored for the defaults, so an answer is charged and the balance stays a number", async () => {
    db.docs.set("config/tutor", { backend: "gemini", engine: "direct", text: { textIn: "0,30", textOut: null } });
    direct();
    const r = await run({ unitId: "ai-1-1", lessonId: "ai-1-1-1", question: "What is training data?", lang: "en" });
    expect(r.credits).toBe(0.28);
    expect(Number.isFinite((db.docs.get("credits/u1") as { plan: number }).plan)).toBe(true);
  });
});

describe("who may ask: Darsi Super, from the token's planUntil", () => {
  it("refuses a token without planUntil, and one whose planUntil has passed, and holds nothing", async () => {
    agent.ask = async () => { throw new Error("the agent must not be asked"); };
    direct();
    for (const token of [{}, { role: "teacher" }, { planUntil: Date.now() - 1 }, { planUntil: 0 }, { planUntil: "2099-01-01" }]) {
      await expect(run(ASK, token), JSON.stringify(token)).rejects.toMatchObject({ code: "permission-denied" });
      // A warm-up is refused the same way.
      await expect(run({ ...ASK, warm: true }, token)).rejects.toMatchObject({ code: "permission-denied" });
    }
    expect(plan()).toBe(100);
    expect(db.docs.has("tutorLeases/u1")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    // The same account with Super still ahead is answered.
    db.docs.set("config/tutor", { backend: "gemini", engine: "direct" });
    expect(await run(ASK, { planUntil: Date.now() + 60_000 })).toMatchObject({ inScope: true, credits: 0.28 });
  });
});

// A session's state is fixed when it opens (the lesson's text, and the organization and course its search asks for).
// The phone's session id used to be passed on as it came: someone removed from an organization went on asking in the
// session opened on its private course, naming any public course in the question.
describe("a session the phone kept is used only for what it was opened for", () => {
  type Asked = { sessionId?: string; orgId: string | null };
  const reply = { inScope: true, answer: "The examples.", sources: ["ai-1-1-1/r"] };
  const HERE = { orgId: null, unitId: "ai-1-1", lessonId: "ai-1-1-1", lang: "en" };
  let opened = 0;
  beforeEach(() => {
    opened = 0;
    agent.ask = vi.fn(async (o: unknown) => ({ reply, explainer: null, sessionId: (o as Asked).sessionId ?? `new${++opened}`, usd: 0.001 }));
  });
  const passed = () => vi.mocked(agent.ask!).mock.calls.map((c) => (c[0] as Asked).sessionId);
  const session = () => (db.docs.get("tutorLeases/u1") as { session?: unknown } | undefined)?.session;

  it("an id this account was never given opens a new session, which is recorded and then reused", async () => {
    expect(await run({ ...ASK, sessionId: "someone-elses" })).toMatchObject({ inScope: true, sessionId: "new1" });
    expect(session()).toEqual({ id: "new1", ...HERE });
    expect(await run({ ...ASK, sessionId: "new1" })).toMatchObject({ sessionId: "new1" });
    expect(await run({ ...ASK, sessionId: "new1" })).toMatchObject({ sessionId: "new1" });
    expect(passed()).toEqual([undefined, "new1", "new1"]);
    // The call's place is still freed, and the record sits beside the leases without disturbing them.
    expect(calls()).toEqual({});
  });

  it("a session opened in an organization is not used once the account is no longer in it", async () => {
    db.docs.set("tutorLeases/u1", { session: { id: "sA", ...HERE, orgId: "orgA" } });
    // The same person, without the organization in their claims now, asking with a public course and that session.
    expect(await run({ ...ASK, sessionId: "sA", show: true })).toMatchObject({ sessionId: "new1" });
    expect(passed()).toEqual([undefined]);
    expect(vi.mocked(agent.ask!).mock.calls[0][0]).toMatchObject({ orgId: null });
    expect(session()).toEqual({ id: "new1", ...HERE });
  });

  it("nor one opened for another course, lesson or language", async () => {
    for (const was of [{ unitId: "ai-9-9" }, { lessonId: "ai-1-1-2" }, { lessonId: null }, { lang: "ar" }]) {
      db.docs.set("tutorLeases/u1", { session: { id: "s1", ...HERE, ...was } });
      await run({ ...ASK, sessionId: "s1" });
    }
    expect(passed()).toEqual([undefined, undefined, undefined, undefined]);
    // The one recorded for exactly this is used.
    db.docs.set("tutorLeases/u1", { session: { id: "s1", ...HERE } });
    await run({ ...ASK, sessionId: "s1" });
    expect(passed().at(-1)).toBe("s1");
  });

  it("the session a warm-up opened is recorded, and the first question uses it", async () => {
    expect(await run({ ...ASK, warm: true })).toEqual({ sessionId: "s1" });
    expect(session()).toEqual({ id: "s1", ...HERE });
    await run({ ...ASK, sessionId: "s1" });
    expect(passed()).toEqual(["s1"]);
  });
});

describe("the credits held for a question are settled or given back on every path", () => {
  beforeEach(() => db.docs.set("config/tutor", { backend: "gemini", engine: "direct" }));

  it("frees the call's place and gives back the rest after an answer", async () => {
    direct();
    expect(await run(ASK)).toMatchObject({ credits: 0.28, left: 99.72 });
    expect(calls()).toEqual({});
  });

  it("gives the hold back when the answer can't be priced after the model answered (economics() throws)", async () => {
    // The price goes missing between the hold and the settle: before, the 15 credits held were lost for good.
    directThen(() => db.docs.set("config/plans", {}));
    await expect(run(ASK)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(plan()).toBe(100);
    expect(calls()).toEqual({});
    // What the model cost Darsi is still counted, with nothing charged.
    const used = db.docs.get(`tutorUsage/u1/days/${today()}`) as { usd: number; credits: number };
    expect(used.usd).toBeCloseTo(0.00055, 8);
    expect(used.credits).toBe(0);
  });

  it("gives the learner the answer when the settle itself fails, and the lease gives the hold back later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const errors = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    // Firestore refuses the settle's write (the hold's own write, before the model was asked, went through).
    directThen(() => { db.failOn = (w) => w.path === "credits/u1"; });
    const r = await run(ASK);
    // Not thrown to the learner: the answer, nothing charged, and what is left while the 15 are still held.
    expect(r).toMatchObject({ inScope: true, answer: "The examples.", credits: 0, left: 85 });
    expect(errors.mock.calls.find((c) => c[0] === "tutor: call not settled")?.[1]).toMatchObject({ uid: "u1", credits: 0.28 });
    expect(plan()).toBe(85);
    expect(Object.keys(calls())).toHaveLength(1);
    // Once the lease has run out (200 s), the next question gives the 15 back before it holds again.
    vi.setSystemTime(Date.now() + 200_001);
    direct();
    expect(await run(ASK)).toMatchObject({ credits: 0.28, left: 99.72 });
    expect(calls()).toEqual({});
  });

  it("gives the hold back when the search index can't be built, and says to try again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 30 * 60_000); // past the five minutes this instance keeps a catalog
    db.docs.set("credits/u1", { plan: 100, planUntil: Date.now() + 864e5, packs: 0 });
    // Two courses in a track of their own, so their index isn't one an earlier test left on the instance.
    files.set("content/catalog.json", { units: [{ id: "x-1", track: "x", src: "content/units/x-1/v1.json" }, { id: "x-2", track: "x", src: "content/units/x-2/v1.json" }] });
    files.set("content/units/x-1/v1.json", { ...unit, id: "x-1", track: "x" });
    files.set("content/units/x-2/v1.json", { ...unit, id: "x-2", track: "x" });
    direct();
    // The catalog and the asked course are read; Storage then fails on the track's other course, after the hold.
    storage.reads = 0;
    storage.downAfter = 2;
    await expect(run({ ...ASK, unitId: "x-1", lessonId: null })).rejects.toMatchObject({ code: "unavailable" });
    expect(storage.reads).toBe(3);
    expect(plan()).toBe(100);
    expect(calls()).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("courses that can't be read just now (a Storage error, not a missing file)", () => {
  it("are 'try again' for a question and nothing for a warm-up, hold nothing, and are read again the next time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 90 * 60_000); // past everything this instance keeps
    db.docs.set("credits/u1", { plan: 100, planUntil: Date.now() + 864e5, packs: 0 });
    db.docs.set("config/tutor", { backend: "gemini", engine: "direct" });
    direct();
    storage.down = true;
    await expect(run(ASK)).rejects.toMatchObject({ code: "unavailable" });
    expect(await run({ ...ASK, warm: true })).toEqual({ sessionId: "" });
    expect(plan()).toBe(100);
    expect(db.docs.has("tutorLeases/u1")).toBe(false);
    // Storage is back: the failure wasn't kept as an empty catalog ("No such course" for five minutes, before).
    storage.down = false;
    expect(await run(ASK)).toMatchObject({ inScope: true, credits: 0.28 });
  });
});

describe("tutorAsk keeps to its deadline (165 s of the function's 180 s)", () => {
  let START = 0;
  beforeEach(() => {
    START = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
  });
  /** An agent that gives up after `ms`: an explainer turn and its repair both timing out are 150 s. */
  const slowAgent = (ms: number) => { agent.ask = vi.fn(() => new Promise((_, no) => setTimeout(() => no(new AgentError("TimeoutError: aborted", 0.004, true)), ms))); };
  const timeouts = () => vi.mocked(AbortSignal.timeout).mock.calls.map((c) => c[0]);

  it("tells the agent when the call must be over", async () => {
    agent.ask = vi.fn(async () => { throw new AgentError("Agent Runtime 429", 0); });
    direct();
    await run(ASK);
    expect(vi.mocked(agent.ask).mock.calls[0][0]).toMatchObject({ deadline: START + 165_000 });
  });

  it("after an agent that timed out twice (150 s), gives the direct answer only the time that is left", async () => {
    slowAgent(150_000);
    direct();
    const asked = run(ASK);
    await vi.advanceTimersByTimeAsync(150_000);
    const r = await asked;
    // 165 − 150 − 5 s to settle = 10 s, not the usual 30 (which would end at the function's own limit).
    expect(timeouts()).toEqual([10_000]);
    // Answered, charged with what the agent cost, and settled inside the deadline.
    expect(r).toMatchObject({ inScope: true, credits: 2.28 });
    expect(Date.now() - START).toBeLessThan(165_000);
    expect(calls()).toEqual({});
  });

  it("gives the direct answer its usual 30 s when the agent failed early", async () => {
    slowAgent(8_000);
    direct();
    const asked = run(ASK);
    await vi.advanceTimersByTimeAsync(8_000);
    await asked;
    expect(timeouts()).toEqual([30_000]);
  });

  it("with no time left, doesn't ask the direct model: the hold is given back and the agent's cost counted", async () => {
    slowAgent(161_000);
    direct();
    const asked = run(ASK).catch((e) => e);
    await vi.advanceTimersByTimeAsync(161_000);
    expect(await asked).toMatchObject({ code: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
    expect(plan()).toBe(100);
    expect(calls()).toEqual({});
    expect((db.docs.get(`tutorUsage/u1/days/${today()}`) as { usd: number }).usd).toBeCloseTo(0.004, 8);
  });
});
