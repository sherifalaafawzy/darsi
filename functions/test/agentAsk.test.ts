// askAgent's cost when it gets no answer (sfm-03): a turn given up at its time limit throws AgentError with what it
// surely cost, a reply-less turn with what it measured, and a failed repair turn with the first turn's cost too.
// Agent Runtime is a stubbed fetch; the tutor module is a stand-in (as in tutorSearch.test.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { abandonedCost, AGENT_PRICES, turnCost } from "../src/agentCore.js";
import { buildIndex, sections, type TutorUnit } from "../src/tutorCore.js";

vi.mock("../src/tutor.js", () => ({ PROJECT: "darsi-test", googleToken: async () => "t", tutorConfig: async () => ({}), loadUnit: async () => null, trackIndex: async () => null }));
const { AgentError, askAgent, ANSWER_MS, EXPLAINER_MS } = await import("../src/agent.js");

const unit = { id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords and phishing" }, lessons: [
  { id: "cyber-1-1-2", title: { en: "Spot phishing" }, steps: [{ id: "read", type: "read", title: { en: "Phishing" }, body: { en: "Phishing is a message that pretends to come from someone you trust." } }] },
] } as unknown as TutorUnit;
const cfg = { agentLocation: "europe-west1", agentId: "a1", agentPrices: AGENT_PRICES } as never;
const ix = buildIndex(sections(unit, "en"));
const ask = (o: { show?: boolean; sessionId?: string } = {}) => askAgent({ cfg, uid: "u1", orgId: null, unit, lessonId: "cyber-1-1-2", lang: "en", question: "What is phishing?", ix, en: null, ...o });

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
