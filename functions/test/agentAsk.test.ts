// askAgent's cost when it gets no answer (sfm-03): a turn given up at its time limit throws AgentError with what it
// surely cost, a reply-less turn with what it measured, and a failed repair turn with the first turn's cost too.
// Agent Runtime is a stubbed fetch; the tutor module is a stand-in (as in tutorSearch.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abandonedCost, AGENT_PRICES, turnCost } from "../src/agentCore.js";
import { buildIndex, sections, type TutorUnit } from "../src/tutorCore.js";

const courses = vi.hoisted(() => ({ down: false }));
vi.mock("../src/tutor.js", () => ({ PROJECT: "darsi-test", googleToken: async () => "t", tutorConfig: async () => ({}), trackIndex: async () => null,
  loadUnit: async () => { if (courses.down) throw Object.assign(new Error("backend unavailable"), { code: 503 }); return null; } }));
const { AgentError, askAgent, tutorSearch, ANSWER_MS, EXPLAINER_MS, REPAIR_NEEDS_MS } = await import("../src/agent.js");

const unit = { id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords and phishing" }, lessons: [
  { id: "cyber-1-1-2", title: { en: "Spot phishing" }, steps: [{ id: "read", type: "read", title: { en: "Phishing" }, body: { en: "Phishing is a message that pretends to come from someone you trust." } }] },
] } as unknown as TutorUnit;
const cfg = { agentLocation: "europe-west1", agentId: "a1", agentPrices: AGENT_PRICES } as never;
const ix = buildIndex(sections(unit, "en"));
const ask = (o: { show?: boolean; sessionId?: string; deadline?: number } = {}) => askAgent({ cfg, uid: "u1", orgId: null, unit, lessonId: "cyber-1-1-2", lang: "en", question: "What is phishing?", ix, en: null, ...o });

const sse = (...deltas: Record<string, unknown>[]) => deltas.map((d) => `data: ${JSON.stringify({ author: "darsi_tutor", actions: { state_delta: d } })}`).join("\n\n");
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
/** Agent Runtime: a session for :query, then each turn's answer (a body, or an error to throw) in order. */
function runtime(...turns: (string | Error)[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith(":query")) return new Response(JSON.stringify({ output: { id: "s1" } }));
    const t = turns.shift();
    if (t instanceof Error) throw t;
    return new Response(t ?? "");
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("askAgent's cost when it gets no answer (sfm-03)", () => {
  it("a turn that runs past its time limit throws what it surely cost: its input once and the runtime meanwhile", async () => {
    runtime(timeout());
    const e = await ask().catch((x) => x);
    expect(e).toBeInstanceOf(AgentError);
    expect(e.timedOut).toBe(true);
    expect(e.usd).toBeGreaterThan(ANSWER_MS / 1000 * AGENT_PRICES.runtimePerSec);
    expect(e.usd).toBeLessThan(abandonedCost(60000, ANSWER_MS / 1000, AGENT_PRICES));
  });
  it("a turn that ends without a reply throws what it measured", async () => {
    const usage = { in: 6000, cached: 0, out: 400, calls: 1 };
    runtime(sse({ usage }));
    const e = await ask().catch((x) => x);
    expect(e).toBeInstanceOf(AgentError);
    expect(e.usd).toBeGreaterThanOrEqual(turnCost(usage, 0, AGENT_PRICES));
  });
  it("a repair turn that fails throws the first turn's cost as well", async () => {
    const usage = { in: 11000, cached: 0, out: 1700, calls: 2 };
    runtime(sse({ usage, explainer: { title: "Phishing", scenes: [{ template: "title-hook", narration: "Hi" }] } }), timeout());
    const e = await ask({ show: true }).catch((x) => x);
    expect(e).toBeInstanceOf(AgentError);
    expect(e.usd).toBeGreaterThan(turnCost(usage, 0, AGENT_PRICES) + EXPLAINER_MS / 1000 * AGENT_PRICES.runtimePerSec);
  });
  it("a phone's lost session is replaced once; opening it costs nothing to charge", async () => {
    runtime(new Error("Agent Runtime 404: session not found"), sse({ usage: { in: 100, cached: 0, out: 10, calls: 1 }, reply: { inScope: true, answer: "It pretends.", sources: [] } }));
    const r = await ask({ sessionId: "old" });
    expect(r).toMatchObject({ sessionId: "s1", reply: { answer: "It pretends." } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const e = await ask().catch((x) => x);
    expect(e).toBeInstanceOf(AgentError);
    expect(e.usd).toBe(0);
  });
});

describe("askAgent within the caller's deadline (tutorAsk's 165 s)", () => {
  const usage = { in: 11000, cached: 0, out: 1700, calls: 2 };
  // An explainer Lesson Studio rejects (as in the repair test above), and the reply a repair turn would bring.
  const rejected = () => sse({ usage, explainer: { title: "Phishing", scenes: [{ template: "title-hook", narration: "Hi" }] } });
  const turns = () => vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes(":streamQuery")).length;
  const limits = () => vi.mocked(AbortSignal.timeout).mock.calls.map((c) => c[0]);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => new AbortController().signal);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("repairs a rejected explainer only when a whole repair turn still fits (more than 80 s left)", async () => {
    expect(REPAIR_NEEDS_MS).toBe(80_000);
    runtime(rejected(), sse({ usage, reply: { inScope: true, answer: "Repaired.", sources: [] } }));
    const r = await ask({ show: true, deadline: Date.now() + REPAIR_NEEDS_MS + 1_000 });
    expect(turns()).toBe(2);
    expect(r.reply.answer).toBe("Repaired.");
  });

  it("with 80 s or less left, drops the explainer and keeps the answer, at the first turn's cost alone", async () => {
    runtime(rejected(), new Error("the repair turn must not be asked"));
    const r = await ask({ show: true, deadline: Date.now() + REPAIR_NEEDS_MS });
    expect(turns()).toBe(1);
    expect(r.explainer).toBeNull();
    expect(r.reply.answer).toBe("Hi"); // the explainer's opening line, as when a repair fails to mend it
    expect(r.usd).toBeCloseTo(turnCost(usage, 0, AGENT_PRICES), 8);
  });

  it("cuts a turn to end 5 s before the deadline, and leaves it alone with time to spare or no deadline", async () => {
    const reply = () => sse({ usage, reply: { inScope: true, answer: "It pretends.", sources: [] } });
    runtime(reply());
    await ask({ deadline: Date.now() + 9_000 });
    runtime(reply());
    await ask({ show: true, deadline: Date.now() + 165_000 });
    runtime(reply());
    await ask({ show: true });
    // Each ask: the session's 20 s, then its turn's limit.
    expect(limits()).toEqual([20_000, 4_000, 20_000, EXPLAINER_MS, 20_000, EXPLAINER_MS]);
  });

  it("a turn cut short by the deadline is charged for the time it really ran", async () => {
    runtime(timeout());
    const whole = await ask().catch((x) => x);
    runtime(timeout());
    const cut = await ask({ deadline: Date.now() + 7_000 }).catch((x) => x);
    expect(cut).toBeInstanceOf(AgentError);
    expect(cut.timedOut).toBe(true);
    // The same input read once; 2 s of runtime where a whole turn's limit is ANSWER_MS's 8.
    expect(whole.usd - cut.usd).toBeCloseTo((ANSWER_MS / 1000 - 2) * AGENT_PRICES.runtimePerSec, 10);
    expect(cut.usd).toBeGreaterThan(2 * AGENT_PRICES.runtimePerSec);
  });

  it("with no time for a turn, asks nothing (not even a session) and costs nothing", async () => {
    runtime(new Error("no turn must be asked"));
    const e = await ask({ deadline: Date.now() + 5_500 }).catch((x) => x);
    expect(e).toBeInstanceOf(AgentError);
    expect(e.usd).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("tutorSearch when the courses can't be read (a Storage error)", () => {
  const search = async () => {
    let status = 200, sent: unknown;
    const res = { status(n: number) { status = n; return res; }, json(b: unknown) { sent = b; return res; }, end() { return res; } };
    await (tutorSearch as unknown as (req: unknown, res: unknown) => Promise<void>)({ method: "POST", headers: { authorization: "Bearer emulator" }, body: { query: "phishing", unitId: "cyber-1-1", orgId: null, lang: "en" } }, res);
    return { status, sent };
  };
  beforeEach(() => { process.env.FUNCTIONS_EMULATOR = "true"; }); // the emulator's stand-in for the agent's token
  afterEach(() => { delete process.env.FUNCTIONS_EMULATOR; courses.down = false; });

  it("answers 503, so the agent's tool carries on without the search, where a missing course is just no hits", async () => {
    expect(await search()).toEqual({ status: 200, sent: { hits: [] } });
    courses.down = true;
    expect(await search()).toEqual({ status: 503, sent: { error: "unavailable" } });
  });
});
