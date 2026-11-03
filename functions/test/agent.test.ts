import { describe, expect, it } from "vitest";
import { AGENT_PRICES, agentMessage, parseEvents, readTurn, repairMessage, turnCost } from "../src/agentCore.js";

const ev = (delta: Record<string, unknown>) => ({ author: "darsi_tutor", actions: { state_delta: delta } });

describe("the tutor agent's turns", () => {
  it("reads events whether they come as server-sent events, JSON lines or an array", () => {
    const events = [ev({ usage: { in: 1, cached: 0, out: 2, calls: 1 } }), ev({ reply: { inScope: true, answer: "Hi", sources: ["a"] } })];
    const sse = events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n") + "\n\n";
    expect(parseEvents(sse)).toEqual(events);
    expect(parseEvents(events.map((e) => JSON.stringify(e)).join("\n"))).toEqual(events);
    expect(parseEvents(JSON.stringify(events))).toEqual(events);
    expect(parseEvents(": keep-alive\n\ndata: {broken")).toEqual([]);
  });

  it("takes this turn's reply, explainer and usage from the state deltas, the last one winning", () => {
    const t = readTurn([
      ev({ usage: { in: 2335, cached: 0, out: 134, calls: 1 } }),
      ev({ explainer: { title: "First", scenes: [] } }),
      ev({ explainer: { title: "Repaired", scenes: [] }, usage: { in: 9000, cached: 0, out: 1500, calls: 3 } }),
      { actions: { stateDelta: { reply: { inScope: true, answer: "Phishing pretends…", sources: ["cyber-1-1-2/read"] } } } },
    ]);
    expect(t.reply).toEqual({ inScope: true, answer: "Phishing pretends…", sources: ["cyber-1-1-2/read"] });
    expect(t.explainer?.title).toBe("Repaired");
    expect(t.usage).toEqual({ in: 9000, cached: 0, out: 1500, calls: 3 });
    expect(t.error).toBeNull();
    expect(readTurn([{ error_message: "quota" }]).error).toBe("quota");
  });

  it("charges tokens at 3.8 Flash prices plus the runtime's seconds", () => {
    // The measured explainer turn in Arabic: 10,670 in, 1,649 out, about 30 s.
    const usd = turnCost({ in: 10670, cached: 0, out: 1649, calls: 3 }, 30, AGENT_PRICES);
    expect(usd).toBeCloseTo(10670 * 0.75e-6 + 1649 * 3.75e-6 + 30 * AGENT_PRICES.runtimePerSec, 8);
    expect(usd).toBeLessThan(0.02);
    expect(turnCost(null, -1, AGENT_PRICES)).toBe(0);
  });

  it("sends the question with the sections found for it, and asks for an explainer when the learner taps Show me", () => {
    expect(agentMessage("What is phishing?", "[s1] text", false)).toBe("What is phishing?\n\nSECTIONS THAT MAY HELP:\n[s1] text");
    expect(agentMessage("What is phishing?", "", true)).toMatch(/^The learner asked to see this explained: call make_explainer/);
    expect(repairMessage(["scenes[2].content: badEdge"])).toContain("scenes[2].content: badEdge");
  });
});
