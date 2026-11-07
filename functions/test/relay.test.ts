// The voice relay's explainers (sfm-02): the agent's turn is charged even when the learner hangs up before it is
// drawn, before the credits held for the call are released; a failed one is charged at what it cost; and only one is
// made at a time per call. A real relay on a free port talks to a stand-in for Gemini Live; the tutor's credits, the
// course and the agent are stand-ins too.
import { afterAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

const h = vi.hoisted(() => ({ charges: [] as number[], events: [] as string[], asks: 0, agent: null as null | (() => Promise<unknown>), backend: "gemini", token: null as null | Promise<string> }));
vi.mock("../src/admin.js", () => ({ auth: { verifyIdToken: async () => ({ uid: "u1", planUntil: Date.now() + 864e5 }) } }));
vi.mock("../src/agent.js", () => {
  class AgentError extends Error { constructor(m: string, readonly usd: number, readonly timedOut = false) { super(m); } }
  return { AgentError, askAgent: () => { h.asks++; return h.agent!(); } };
});
vi.mock("../src/tutor.js", async () => {
  const core = await import("../src/tutorCore.js");
  const { AGENT_PRICES } = await import("../src/agentCore.js");
  const unit = { id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords and phishing" }, lessons: [
    { id: "cyber-1-1-2", title: { en: "Spot phishing" }, steps: [{ id: "read", type: "read", title: { en: "Phishing" }, body: { en: "Phishing is a message that pretends to come from someone you trust." } }] },
  ] };
  return {
    balance: async () => 50,
    charge: async (_uid: string, usd: number) => { h.charges.push(usd); h.events.push("charge"); return { ok: true, credits: usd / 0.002, left: 40, short: 0 }; },
    endCall: async () => { h.events.push("release"); return { charged: 0, left: 40, short: false }; },
    GEMINI_KEY: { value: () => "k" }, googleToken: async () => (h.token ? h.token : "t"), hasSuper: () => true, tutorReady: () => true, vertexModel: () => "m",
    loadUnit: async () => unit, minuteCredits: async () => 10,
    startCall: async () => { h.events.push("start"); return { id: "c1", hold: { fromPlan: 10, fromPacks: 0 } }; },
    trackIndex: async (u: never, _o: unknown, lang: string) => core.buildIndex(core.sections(u, lang)),
    tutorConfig: async () => ({ backend: h.backend, engine: "agent", agentId: "a1", live: core.LIVE_PRICES, maxMinutes: 14, liveModel: "m", voice: "Kore", liveLocation: "us-central1", vertexProject: "p", agentPrices: AGENT_PRICES }),
  };
});

// The stand-in for Gemini Live: answers the setup, and keeps what the relay sends it.
const gem = new WebSocketServer({ port: 0, host: "127.0.0.1" });
await new Promise((ok) => gem.once("listening", ok));
let live: WebSocket | null = null, liveSessions = 0;
const toolResults: string[] = [], said: string[] = [];
gem.on("connection", (s) => {
  live = s; liveSessions++;
  s.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.setup) s.send(JSON.stringify({ setupComplete: {} }));
    for (const r of m.toolResponse?.functionResponses ?? []) toolResults.push(String(r.response?.result));
    if (m.realtimeInput?.text) said.push(String(m.realtimeInput.text));
  });
});
process.env.GEMINI_LIVE_URL = `ws://127.0.0.1:${(gem.address() as AddressInfo).port}`;
process.env.VERTEX_LIVE_URL = process.env.GEMINI_LIVE_URL;
process.env.TUTOR_ORIGINS = "http://test.local";
process.env.PORT = "0";
const { server, ipOf } = await import("../src/relay.js");
await new Promise((ok) => (server.listening ? ok(null) : server.once("listening", ok)));
const relayUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/live`;
const { AgentError } = (await import("../src/agent.js")) as unknown as { AgentError: new (m: string, usd: number, t?: boolean) => Error };

afterAll(async () => { await new Promise((ok) => server.close(ok)); await new Promise((ok) => gem.close(ok)); });

const until = async (f: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((ok) => setTimeout(ok, 10)); } };
const later = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const explainCall = (id: string) => live!.send(JSON.stringify({ toolCall: { functionCalls: [{ id, name: "explain", args: { topic: "phishing" } }] } }));
async function startCall() {
  h.charges.length = 0; h.events.length = 0; h.asks = 0; toolResults.length = 0; said.length = 0;
  const phone = new WebSocket(relayUrl, { origin: "http://test.local" });
  const got: { type?: string }[] = [];
  phone.on("message", (d, binary) => { if (!binary) got.push(JSON.parse(String(d))); });
  await new Promise((ok) => phone.once("open", ok));
  phone.send(JSON.stringify({ type: "hello", token: "x", unitId: "cyber-1-1", lessonId: "cyber-1-1-2", lang: "en" }));
  await until(() => got.some((m) => m.type === "ready"));
  return { phone, got };
}

describe("the voice relay's explainers (sfm-02)", () => {
  it("charges the explainer when the learner hangs up before it is drawn, then releases the call's credits", async () => {
    const turn = later<unknown>();
    h.agent = () => turn.promise;
    const { phone, got } = await startCall();
    explainCall("f1");
    await until(() => got.some((m) => m.type === "board"));
    phone.close();
    await new Promise((ok) => setTimeout(ok, 150));
    // The call has ended, but its credits wait for the explainer (and the voice place with them).
    expect(h.events).not.toContain("release");
    turn.resolve({ usd: 0.018, explainer: null, sessionId: "s1", reply: { inScope: true, answer: "", sources: [] } });
    await until(() => h.events.includes("release"));
    expect(h.charges.reduce((a, b) => a + b, 0)).toBeCloseTo(0.018, 9);
    expect(h.events.indexOf("charge")).toBeLessThan(h.events.indexOf("release"));
  });

  it("charges a failed explainer at what it cost, and tells the tutor to explain in words", async () => {
    h.agent = () => Promise.reject(new AgentError("TimeoutError", 0.009, true));
    const { phone } = await startCall();
    explainCall("f2");
    await until(() => h.charges.length > 0);
    expect(h.charges[0]).toBeCloseTo(0.009, 9);
    await until(() => said.some((t) => t.includes("could not be drawn")));
    phone.close();
    await until(() => h.events.includes("release"));
  });

  it("makes one explainer at a time per call", async () => {
    const turn = later<unknown>();
    h.agent = () => turn.promise;
    const { phone } = await startCall();
    explainCall("f3");
    await until(() => toolResults.length === 1);
    explainCall("f4");
    await until(() => toolResults.length === 2);
    expect(h.asks).toBe(1);
    expect(toolResults[1]).toMatch(/still being made/);
    turn.resolve({ usd: 0.01, explainer: null, sessionId: "s1", reply: { inScope: true, answer: "", sources: [] } });
    await until(() => h.charges.length > 0);
    phone.close();
    await until(() => h.events.includes("release"));
    expect(h.charges.reduce((a, b) => a + b, 0)).toBeCloseTo(0.01, 9);
  });
});

describe("the voice relay's brakes (sfm-10, sfm-11)", () => {
  it("counts sockets per address by the entry Google's front end adds, not one the caller wrote", () => {
    const sock = { remoteAddress: "10.0.0.9" };
    expect(ipOf({ headers: { "x-forwarded-for": "203.0.113.7" }, socket: sock })).toBe("203.0.113.7");
    // A caller who sends its own X-Forwarded-For gets the real address appended after it.
    expect(ipOf({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8 , 203.0.113.7" }, socket: sock })).toBe("203.0.113.7");
    expect(ipOf({ headers: { "x-forwarded-for": ["9.9.9.9", "203.0.113.7"] }, socket: sock })).toBe("203.0.113.7");
    expect(ipOf({ headers: {}, socket: sock })).toBe("10.0.0.9");
    expect(ipOf({ headers: { "x-forwarded-for": " , " }, socket: {} })).toBe("?");
  });

  it("opens no Live session for a phone that left while Google's token was fetched, and releases its call", async () => {
    const token = later<string>();
    h.backend = "vertex"; h.token = token.promise; h.events.length = 0;
    const sessions = liveSessions;
    try {
      const phone = new WebSocket(relayUrl, { origin: "http://test.local" });
      await new Promise((ok) => phone.once("open", ok));
      phone.send(JSON.stringify({ type: "hello", token: "x", unitId: "cyber-1-1", lessonId: "cyber-1-1-2", lang: "en" }));
      await until(() => h.events.includes("start"));
      phone.close();
      await until(() => h.events.includes("release"));
      token.resolve("t");
      await new Promise((ok) => setTimeout(ok, 200));
      expect(liveSessions).toBe(sessions);
      expect(h.events.filter((e) => e === "release")).toHaveLength(1);
    } finally { h.backend = "gemini"; h.token = null; }
  });
});
