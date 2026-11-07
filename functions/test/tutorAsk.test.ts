// tutorAsk when the tutor agent doesn't answer in time or fails (sfm-03): what its turn cost Darsi is charged with the
// direct answer that takes its place, and counted; with no answer at all the learner isn't charged but the cost is
// still counted. Firestore is the in-memory fake, Storage a map, the agent a stand-in, and Gemini a stubbed fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import type { TutorUnit } from "../src/tutorCore";

process.env.GEMINI_API_KEY = "test-key";

const files = vi.hoisted(() => new Map<string, unknown>());
const agent = vi.hoisted(() => ({ ask: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  return {
    db: new FakeDb(),
    caller: (req: { auth?: { uid: string; token: Record<string, unknown> } }) => { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return { uid: req.auth.uid, role: "learner", orgId: undefined }; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/settings.js", () => ({ superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ bucket: () => ({ file: (p: string) => ({ download: async () => { if (!files.has(p)) throw new Error("No such object"); return [Buffer.from(JSON.stringify(files.get(p)))]; } }) }) }));
vi.mock("../src/agent.js", () => {
  class AgentError extends Error { constructor(m: string, readonly usd: number, readonly timedOut = false) { super(m); } }
  return { AgentError, askAgent: (...a: unknown[]) => agent.ask!(...a), openSession: async () => "s1" };
});

const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { AgentError } = (await import("../src/agent.js")) as unknown as { AgentError: new (m: string, usd: number, t?: boolean) => Error };
const { tutorAsk } = await import("../src/tutor");
const run = (data: Record<string, unknown>) => (tutorAsk as unknown as { run: (r: unknown) => Promise<Record<string, unknown>> }).run({ auth: { uid: "u1", token: { planUntil: Date.now() + 864e5 } }, data });

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
afterEach(() => vi.unstubAllGlobals());

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
