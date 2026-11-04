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

  it("takes the answer from the text the tutor wrote before reply, not from text before another tool", () => {
    const say = (...parts: Record<string, unknown>[]) => ({ author: "darsi_tutor", content: { parts } });
    const t = readTurn([
      say({ text: "Let me look." }, { function_call: { name: "make_explainer" } }),
      say({ text: "Urgency rushes you " }, { text: "so you don't check." }, { function_call: { name: "reply" } }),
      { author: "darsi_tutor", partial: true, content: { parts: [{ text: "Urgency rushes you" }] } }, // streamed copies don't count twice
      { author: "darsi_tutor", content: { parts: [{ text: "thinking", thought: true }] } },
      { author: "darsi_tutor", actions: { state_delta: { reply: { inScope: true, answer: "", sources: ["cyber-1-1-2/read"] } } } },
    ]);
    expect(t.reply).toEqual({ inScope: true, answer: "Urgency rushes you so you don't check.", sources: ["cyber-1-1-2/read"] });
    // A turn that ends with its explainer (no reply) is in scope; askAgent words it from the explainer.
    expect(readTurn([say({ function_call: { name: "make_explainer" } }), say({ function_response: { name: "make_explainer" } }, { text: '{"title":"How"}' }), ev({ explainer: { title: "How", scenes: [] } })]).reply).toEqual({ inScope: true, answer: "", sources: [] });
    // An answer put in reply's own argument still wins (the older form).
    expect(readTurn([say({ text: "ignored" }), ev({ reply: { inScope: false, answer: "Outside.", sources: [] } })]).reply?.answer).toBe("Outside.");
  });

  it("charges tokens at 3.8 Flash prices plus the runtime's seconds", () => {
    // The measured explainer turn in Arabic: 10,670 in, 1,649 out, about 30 s.
    const usd = turnCost({ in: 10670, cached: 0, out: 1649, calls: 3 }, 30, AGENT_PRICES);
    expect(usd).toBeCloseTo(10670 * 0.75e-6 + 1649 * 3.75e-6 + 30 * AGENT_PRICES.runtimePerSec, 8);
    expect(usd).toBeLessThan(0.02);
    expect(turnCost(null, -1, AGENT_PRICES)).toBe(0);
  });

  it("sends the question with the sections found for it, and asks for an explainer when the learner taps Show me", () => {
    expect(agentMessage("What is phishing?", "[s1] text", false)).toBe("Answer in text only. Do not call make_explainer.\n\nWhat is phishing?\n\nSECTIONS THAT MAY HELP:\n[s1] text");
    expect(agentMessage("What is phishing?", "", true)).toMatch(/^The learner asked to see this on the board/);
    expect(agentMessage("What is phishing?", "", true)).toContain("call make_explainer");
    // With nothing new found, the note says whether the search found anything at all, so the agent needn't search again.
    expect(agentMessage("Capital of France?", "", false, false)).toContain("found nothing for this question");
    expect(agentMessage("What is phishing?", "", false, true)).toContain("found nothing beyond the lesson material");
    expect(repairMessage(["scenes[2].content: badEdge"])).toContain("scenes[2].content: badEdge");
  });
});
