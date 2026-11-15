// The voice relay's explainers (sfm-02): the agent's turn is charged even when the learner hangs up before it is
// drawn, before the credits held for the call are released; a failed one is charged at what it cost; and only one is
// made at a time per call. A real relay on a free port talks to a stand-in for Gemini Live; the tutor's credits, the
// course and the agent are stand-ins too.
// Its gates (be-relay): who may start a call, what one learner's failed read does to the others, room for a class
// behind one address, and a stopping instance. The stand-ins are switched through `h`.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

const h = vi.hoisted(() => ({
  charges: [] as number[], events: [] as string[], asks: 0, agent: null as null | (() => Promise<unknown>), backend: "gemini", token: null as null | Promise<string>,
  // The gates: who the token is (null: Auth refuses it), whether the tutor is on, the credits left, the course
  // (undefined: the stand-in course; a function: its result, null or a rejection), config/tutor (a function: its
  // result instead), and what startCall throws.
  user: null as null | Record<string, unknown>, on: true, balance: 50, unit: undefined as undefined | (() => Promise<unknown>),
  config: null as null | (() => Promise<never>), start: null as null | string, verified: [] as unknown[][],
}));
const SUPER = () => ({ uid: "u1", planUntil: Date.now() + 864e5 });
h.user = SUPER();
vi.mock("../src/admin.js", () => ({
  auth: { verifyIdToken: async (token: string, checkRevoked?: boolean) => { h.verified.push([token, checkRevoked]); if (!h.user) throw new Error("auth/id-token-revoked"); return h.user; } },
  // Organization addresses outside *.darsiai.org (sites/{host}): one live, one approved whose CNAME isn't there yet,
  // one approved without its ownership record, and one only asked for.
  db: { collection: (name: string) => ({ where: (field: string, op: string, values: string[]) => ({ get: async () => {
    const ok = { owner: "ok", dns: "ok", hosting: "ok", cert: "ok", auth: "ok", cors: "ok" };
    const all: Record<string, Record<string, unknown>> = {
      "learn.cis.edu.eg": { orgId: "o1", status: "live", steps: ok },
      "soon.school.org": { orgId: "o2", status: "connecting", steps: { ...ok, dns: "wait", auth: "wait", cors: "wait" } },
      "unproved.school.org": { orgId: "o2", status: "connecting", steps: { ...ok, owner: "wait", auth: "wait", cors: "wait" } },
      "asked.school.org": { orgId: "o3", status: "requested", steps: null },
    };
    if (`${name} ${field} ${op}` !== "sites status in") throw new Error(`unexpected query ${name} ${field} ${op}`);
    return { docs: Object.entries(all).filter(([, d]) => values.includes(d.status as string)).map(([id, d]) => ({ id, data: () => d })) };
  } }) }) },
}));
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
    balance: async () => h.balance,
    charge: async (_uid: string, usd: number) => { h.charges.push(usd); h.events.push("charge"); return { ok: true, credits: usd / 0.002, left: 40, short: 0 }; },
    endCall: async () => { h.events.push("release"); return { charged: 0, left: 40, short: false }; },
    GEMINI_KEY: { value: () => "k" }, googleToken: async () => (h.token ? h.token : "t"), vertexModel: () => "m",
    // The same one-line rules as tutor.ts (which can't be loaded here: it brings Firebase with it).
    hasSuper: (token: Record<string, unknown> | undefined) => Number(token?.planUntil) > Date.now(), tutorReady: (cfg: { on: boolean }) => cfg.on,
    loadUnit: async () => (h.unit ? h.unit() : unit), minuteCredits: async () => 10,
    startCall: async () => { if (h.start) throw new Error(h.start); h.events.push("start"); return { id: "c1", hold: { fromPlan: 10, fromPacks: 0 } }; },
    trackIndex: async (u: never, _o: unknown, lang: string) => core.buildIndex(core.sections(u, lang)),
    tutorConfig: async () => (h.config ? h.config() : { on: h.on, backend: h.backend, engine: "agent", agentId: "a1", live: core.LIVE_PRICES, maxMinutes: 14, liveModel: "m", voice: "Kore", liveLocation: "us-central1", vertexProject: "p", agentPrices: AGENT_PRICES }),
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
process.env.TUTOR_ORIGINS = "http://test.local, https://*.darsiai.org";
process.env.PORT = "0";
// Small limits, so the tests can reach them: 5 sockets per address that haven't said hello, 60 on the instance.
process.env.RELAY_MAX_PENDING_PER_IP = "5";
process.env.RELAY_MAX_SOCKETS = "60";
// The relay's log: one JSON line per event on stdout. Kept here (and off the test output); anything else passes.
type Line = { severity: string; message: string; [k: string]: unknown };
const logged: Line[] = [];
const write = process.stdout.write.bind(process.stdout);
vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array, ...rest: unknown[]) => {
  try { const l = JSON.parse(String(chunk)) as Line; if (l && typeof l.severity === "string" && typeof l.message === "string") { logged.push(l); return true; } } catch { /* not the relay's */ }
  return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
}) as typeof process.stdout.write);
// The relay's own process handlers: the ones that are there after it loads and weren't before.
const SIGNALS = ["SIGTERM", "unhandledRejection", "uncaughtException"] as const;
const had = Object.fromEntries(SIGNALS.map((s) => [s, process.listeners(s as "SIGTERM")])) as Record<string, unknown[]>;
const { server, ipOf } = await import("../src/relay.js");
const handler = (s: (typeof SIGNALS)[number]) => {
  const mine = (process.listeners(s as "SIGTERM") as unknown[]).filter((f) => !had[s].includes(f)) as ((...a: unknown[]) => void)[];
  if (mine.length !== 1) throw new Error(`the relay should add one ${s} handler, found ${mine.length}`);
  return mine[0];
};
await new Promise((ok) => (server.listening ? ok(null) : server.once("listening", ok)));
const port = (server.address() as AddressInfo).port;
const relayUrl = `ws://127.0.0.1:${port}/live`;
const { AgentError } = (await import("../src/agent.js")) as unknown as { AgentError: new (m: string, usd: number, t?: boolean) => Error };

afterAll(async () => { await new Promise((ok) => server.close(ok)); await new Promise((ok) => gem.close(ok)); });
beforeEach(() => { h.user = SUPER(); h.on = true; h.balance = 50; h.unit = undefined; h.config = null; h.start = null; h.verified.length = 0; });

const until = async (f: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((ok) => setTimeout(ok, 10)); } };
const later = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const explainCall = (id: string) => live!.send(JSON.stringify({ toolCall: { functionCalls: [{ id, name: "explain", args: { topic: "phishing" } }] } }));
const TOKEN = "id-token-kept-out-of-the-logs";
/** A phone: its socket, what the relay told it, and whether it is closed. `ip` is the address Google's front end would report. */
function dial(ip?: string, url = relayUrl) {
  const phone = new WebSocket(url, { origin: "http://test.local", headers: ip ? { "x-forwarded-for": ip } : {} });
  const got: { type?: string; code?: string }[] = [];
  let shut = false;
  phone.on("message", (d, binary) => { if (!binary) got.push(JSON.parse(String(d))); });
  phone.on("error", () => {});
  const closed = new Promise<void>((ok) => phone.once("close", () => { shut = true; ok(); }));
  const opened = new Promise((ok) => phone.once("open", ok));
  return {
    phone, got, opened, closed, isClosed: () => shut,
    hello: () => phone.send(JSON.stringify({ type: "hello", token: TOKEN, unitId: "cyber-1-1", lessonId: "cyber-1-1-2", lang: "en" })),
    ready: () => got.some((m) => m.type === "ready"),
    /** The error codes the relay sent. */
    errors: () => got.filter((m) => m.type === "error").map((m) => m.code),
  };
}
type Phone = ReturnType<typeof dial>;
const hangUp = async (...phones: Phone[]) => { for (const p of phones) p.phone.close(); await Promise.all(phones.map((p) => p.closed)); };
const releases = () => h.events.filter((e) => e === "release").length;
async function startCall() {
  h.charges.length = 0; h.events.length = 0; h.asks = 0; toolResults.length = 0; said.length = 0;
  const c = dial();
  await c.opened;
  c.hello();
  await until(c.ready);
  return c;
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

describe("which pages may open the relay (L9, organization sites)", () => {
  /** Whether a socket from this origin opens (the relay answers a refused one with 401 before any WebSocket). */
  const opens = (origin?: string) => new Promise<boolean>((ok) => {
    const s = new WebSocket(relayUrl, origin ? { origin } : {});
    s.once("open", () => { s.close(); ok(true); });
    s.once("unexpected-response", (_req, res) => { ok(res.statusCode === 101); });
    s.once("error", () => ok(false));
  });
  it("lets in Darsi's listed origins and organization sites under *.darsiai.org, over https only", async () => {
    expect(await opens("http://test.local")).toBe(true);
    expect(await opens("https://cis.darsiai.org")).toBe(true);
    expect(await opens("https://a.b.darsiai.org")).toBe(true);
    expect(await opens("http://cis.darsiai.org")).toBe(false);
    expect(await opens("https://darsiai.org.evil.com")).toBe(false);
    expect(await opens("https://evildarsiai.org")).toBe(false);
    expect(await opens("https://cis.darsiai.org:8443")).toBe(false);
    expect(await opens(undefined)).toBe(false);
  });
  it("lets in an organization address elsewhere while it may sign in, without a new TUTOR_ORIGINS, and no other", async () => {
    expect(await opens("https://learn.cis.edu.eg")).toBe(true);
    expect(await opens("https://soon.school.org")).toBe(false);
    expect(await opens("https://unproved.school.org")).toBe(false);
    expect(await opens("https://asked.school.org")).toBe(false);
    expect(await opens("https://never.heard.of")).toBe(false);
  });
});

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** A course that is slow to load: `h.unit` hands out `promise`, `asked()` says how many hellos have reached it. */
const slowCourse = () => {
  const course = later<unknown>();
  let n = 0;
  h.unit = () => { n++; return course.promise; };
  return { asked: () => n, arrive: () => course.resolve({ id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords and phishing" }, lessons: [
    { id: "cyber-1-1-2", title: { en: "Spot phishing" }, steps: [{ id: "read", type: "read", title: { en: "Phishing" }, body: { en: "Phishing is a message that pretends to come from someone you trust." } }] },
  ] }) };
};
const health = async (at = port) => { const r = await fetch(`http://127.0.0.1:${at}/health`); return { status: r.status, cache: r.headers.get("cache-control"), body: (await r.json()) as { ok: boolean; sockets: number } }; };
/** Waits until the relay itself has seen sockets close (its count is `n`): a phone's own close event can come first. */
const socketsAre = async (n: number) => { const t0 = Date.now(); while ((await health()).body.sockets !== n) { if (Date.now() - t0 > 4000) throw new Error("timed out waiting for the relay's sockets"); await sleep(10); } };

describe("who may start a call (be-relay)", () => {
  /** Says hello and waits for the relay to close the socket: the codes it gave, whether a call was started (credits held), and Live sessions opened. */
  const refused = async () => {
    h.events.length = 0;
    const sessions = liveSessions;
    const c = dial();
    await c.opened;
    c.hello();
    await c.closed;
    return { codes: c.errors(), started: h.events.includes("start"), upstream: liveSessions - sessions };
  };
  const no = (code: string) => ({ codes: [code], started: false, upstream: 0 });

  it("refuses a token Auth doesn't accept (checked for a revoked session), and opens nothing upstream", async () => {
    h.user = null;
    expect(await refused()).toEqual(no("auth"));
    expect(h.verified).toEqual([[TOKEN, true]]);
  });
  it("refuses an account without Darsi Super, or whose Super has run out", async () => {
    h.user = { uid: "u1" };
    expect(await refused()).toEqual(no("no-super"));
    h.user = { uid: "u1", planUntil: Date.now() - 1000 };
    expect(await refused()).toEqual(no("no-super"));
  });
  it("refuses everyone while the tutor is turned off", async () => {
    h.on = false;
    expect(await refused()).toEqual(no("tutor-closed"));
  });
  it("refuses an account with no credits left", async () => {
    h.balance = 0;
    expect(await refused()).toEqual(no("no-credits"));
  });
  it("refuses a course the learner can't see", async () => {
    h.unit = async () => null;
    expect(await refused()).toEqual(no("no-course"));
  });
  it("says busy to a second call from one account, and no-credits when the minute can't be held", async () => {
    h.start = "busy";
    expect(await refused()).toEqual(no("busy"));
    h.start = "no-credits";
    expect(await refused()).toEqual(no("no-credits"));
  });
  it("starts one call for a phone that says hello again while its first hello is still being checked", async () => {
    const course = slowCourse();
    h.events.length = 0;
    const sessions = liveSessions;
    const c = dial();
    await c.opened;
    c.hello(); c.hello();
    await until(() => course.asked() > 0);
    await sleep(60);
    // The second hello was dropped: one check, so one hold and one Live session (two would have left a hold unreleased).
    expect(course.asked()).toBe(1);
    course.arrive();
    await until(c.ready);
    expect(h.events.filter((e) => e === "start")).toHaveLength(1);
    expect(liveSessions).toBe(sessions + 1);
    await hangUp(c);
    await until(() => releases() === 1);
  });

  it("closes a socket that never says hello, ten seconds after it opened", async () => {
    // Only the timers are faked: the sockets are real, so nothing here may wait on a timer of its own.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const c = dial("198.51.100.30");
      await c.opened;
      await vi.advanceTimersByTimeAsync(9_900);
      expect(c.isClosed()).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await c.closed;
      expect(c.errors()).toEqual(["no-hello"]);
    } finally { vi.useRealTimers(); }
  });
});

describe("one learner's failure stays that learner's (be-relay)", () => {
  /**
   * A call is under way; then another phone's hello fails in `arrange`'s way. That phone is told "tutor-gone" and
   * closed, its credits released once if any were held, the failure logged as one error line without the token, and
   * the first call carries on. (Before, the rejection was nobody's: Node ended the process and every call with it.)
   */
  const failsAlone = async (arrange: () => void, held: boolean) => {
    const other = await startCall();
    const sessions = liveSessions, at = logged.length;
    arrange();
    const bad = dial();
    await bad.opened;
    bad.hello();
    await bad.closed;
    expect(bad.errors()).toEqual(["tutor-gone"]);
    await until(() => releases() === (held ? 1 : 0));
    await sleep(60);
    const lines = logged.slice(at);
    expect(lines.filter((l) => l.message === "relay: hello failed")).toHaveLength(1);
    expect(lines.find((l) => l.message === "relay: hello failed")).toMatchObject({ severity: "ERROR", error: expect.any(String), stack: expect.any(String), ...(held ? { uid: "u1", call: "c1" } : {}) });
    expect(lines.some((l) => /unhandled|uncaught/.test(l.message))).toBe(false);
    expect(JSON.stringify(logged)).not.toContain(TOKEN);
    expect(h.events.filter((e) => e === "start")).toHaveLength(held ? 2 : 1);
    expect(releases()).toBe(held ? 1 : 0);
    // The first call is still open, still has its Live session (the newest: the failed phone opened none) and still gets its turns.
    expect(liveSessions).toBe(sessions);
    expect(other.phone.readyState).toBe(WebSocket.OPEN);
    expect(other.errors()).toEqual([]);
    live!.send(JSON.stringify({ serverContent: { turnComplete: true } }));
    await until(() => other.got.some((m) => m.type === "turn"));
    await hangUp(other);
    await until(() => releases() === (held ? 2 : 1));
  };

  it("when the tutor's settings can't be read", () => failsAlone(() => { h.config = () => Promise.reject(new Error("firestore: deadline exceeded")); }, false));
  it("when the course can't be read from Storage", () => failsAlone(() => { h.unit = () => Promise.reject(new Error("storage: 503")); }, false));
  it("when it fails after the call's credits were held: they are released, once", async () => {
    const url = process.env.VERTEX_LIVE_URL;
    try { await failsAlone(() => { h.backend = "vertex"; process.env.VERTEX_LIVE_URL = "not an address"; }, true); }
    finally { h.backend = "gemini"; process.env.VERTEX_LIVE_URL = url; }
  });

  it("logs a promise nobody caught as one JSON line, with keys taken out, and keeps running", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      const at = logged.length;
      handler("unhandledRejection")(new Error("fetch wss://x/y?key=AIzaSECRET&alt=1 failed, Authorization: Bearer ya29.SECRET-token"), Promise.resolve());
      expect(logged.slice(at)).toHaveLength(1);
      expect(logged[at]).toMatchObject({ severity: "ERROR", message: "relay: unhandled rejection", stack: expect.stringContaining("relay.test") });
      expect(String(logged[at].error)).toContain("?key=…&alt=1");
      expect(JSON.stringify(logged[at])).not.toMatch(/AIzaSECRET|ya29/);
      expect(exit).not.toHaveBeenCalled();
    } finally { exit.mockRestore(); }
  });
});

describe("room on the relay (be-relay, M6)", () => {
  it("answers GET /health with the sockets it holds, never cached; /warm and unknown paths as before", async () => {
    await socketsAre(0);
    const c = dial();
    await c.opened;
    expect(await health()).toEqual({ status: 200, cache: "no-store", body: { ok: true, sockets: 1 } });
    await hangUp(c);
    await socketsAre(0);
    expect((await fetch(`http://127.0.0.1:${port}/warm?u=cyber-1-1&l=en`)).status).toBe(204);
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(404);
  });

  it("keeps a class behind one address talking, and brakes only the sockets that never say hello", async () => {
    await socketsAre(0);
    h.events.length = 0;
    const school = "198.51.100.20";
    const room: Phone[] = [];
    // Thirty learners, one public address, six times the limit for sockets that haven't said hello.
    for (let i = 0; i < 30; i++) { const c = dial(school); await c.opened; c.hello(); await until(c.ready); room.push(c); }
    // Five more that say nothing are let in; the sixth is accepted, told the tutor is busy and closed.
    const silent: Phone[] = [];
    for (let i = 0; i < 5; i++) { const c = dial(school); await c.opened; silent.push(c); }
    const at = logged.length;
    const over = dial(school);
    await over.opened;
    await over.closed;
    expect(over.errors()).toEqual(["busy"]);
    expect(logged.slice(at).find((l) => l.message === "relay: refused")).toMatchObject({ severity: "WARNING", reason: "address-pending", pendingForAddress: 5, maxPendingPerAddress: 5, sockets: 35 });
    expect(JSON.stringify(logged)).not.toContain(school);
    // Another address still gets in, and nobody already in was cut.
    const elsewhere = dial("198.51.100.21");
    await elsewhere.opened;
    await sleep(60);
    expect([...room, ...silent, elsewhere].filter((c) => c.phone.readyState !== WebSocket.OPEN || c.errors().length)).toEqual([]);
    // A silent socket that leaves makes room for the next one from that address.
    await hangUp(silent[0]);
    await socketsAre(35);
    const next = dial(school);
    await next.opened;
    await sleep(60);
    expect(next.isClosed()).toBe(false);

    // The instance's own limit (60 here): the socket after the last place is told busy too, whatever its address.
    const fill: Phone[] = [];
    for (let i = 0; i < 60 - 36; i++) { const c = dial(`203.0.113.${i + 1}`); await c.opened; fill.push(c); }
    const mark = logged.length;
    const late = dial("203.0.113.200");
    await late.opened;
    await late.closed;
    expect(late.errors()).toEqual(["busy"]);
    expect(logged.slice(mark).find((l) => l.message === "relay: refused")).toMatchObject({ reason: "instance-full", sockets: 60, maxSockets: 60 });
    expect(room.every((c) => c.phone.readyState === WebSocket.OPEN)).toBe(true);

    await hangUp(...room, ...silent.slice(1), elsewhere, next, ...fill);
    await socketsAre(0);
    // Each of the thirty calls held credits once and gave them back once.
    await until(() => releases() === 30);
    expect(h.events.filter((e) => e === "start")).toHaveLength(30);
  });
});

// Last: these stop the relay (and the last one loads a second one).
describe("a stopping instance (be-relay)", () => {
  const reply = (usd: number) => ({ usd, explainer: null, sessionId: "s1", reply: { inScope: true, answer: "", sources: [] } });

  it("on SIGTERM takes no new phones, ends every call, charges and releases each once, then exits", async () => {
    await socketsAre(0);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      const a = await startCall();
      const b = dial("198.51.100.40");
      await b.opened; b.hello(); await until(b.ready);
      const silent = dial("198.51.100.41");
      await silent.opened;
      // b's tutor is drawing (b's Live session is the newest): its cost comes back after the signal.
      const turn = later<unknown>();
      h.agent = () => turn.promise;
      explainCall("s1");
      await until(() => b.got.some((m) => m.type === "board"));
      // mid's hello is still being checked (its course is slow to load): it holds credits only after the signal.
      const course = slowCourse();
      const mid = dial("198.51.100.42");
      await mid.opened; mid.hello(); await until(() => course.asked() > 0);

      const sigterm = handler("SIGTERM");
      sigterm();
      sigterm(); // Cloud Run, or an operator, signals twice: nothing is settled twice
      await Promise.all([a.closed, b.closed, mid.closed, silent.closed]);
      for (const c of [a, b, mid, silent]) expect(c.errors()).toEqual(["tutor-gone"]);
      expect(server.listening).toBe(false);
      // a's credits are back; the instance waits for b's explainer before it goes.
      await until(() => releases() === 1);
      await sleep(100);
      expect(exit).not.toHaveBeenCalled();
      turn.resolve(reply(0.02));
      await until(() => releases() === 2);
      expect(h.charges.reduce((x, y) => x + y, 0)).toBeCloseTo(0.02, 9);
      expect(h.events.lastIndexOf("charge")).toBeLessThan(h.events.lastIndexOf("release"));
      // And for mid's hello: its hold is taken now, on a call that has already ended, and given straight back.
      await sleep(100);
      expect(exit).not.toHaveBeenCalled();
      course.arrive();
      await until(() => exit.mock.calls.length > 0);
      expect(h.events.filter((e) => e === "start")).toHaveLength(3);
      expect(releases()).toBe(3);
      expect(mid.ready()).toBe(false);
      await sleep(100);
      expect(exit.mock.calls).toEqual([[0]]);
      expect(releases()).toBe(3);
      expect(logged.filter((l) => l.message === "relay: stopping")).toHaveLength(1);
      // A phone that tries now finds nothing listening.
      const late = dial();
      await late.closed;
      expect(late.got).toEqual([]);
    } finally { exit.mockRestore(); }
  });

  it("after an exception nobody caught, logs it, settles its calls the same way and exits 1", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const before = process.listeners("uncaughtException") as unknown[];
    vi.resetModules();
    const second = (await import("../src/relay.js")).server;
    try {
      await new Promise((ok) => (second.listening ? ok(null) : second.once("listening", ok)));
      const mine = (process.listeners("uncaughtException") as unknown[]).filter((f) => !before.includes(f)) as ((e: Error) => void)[];
      expect(mine).toHaveLength(1);
      h.events.length = 0;
      const c = dial(undefined, `ws://127.0.0.1:${(second.address() as AddressInfo).port}/live`);
      await c.opened; c.hello(); await until(c.ready);
      const at = logged.length;
      mine[0](new Error("a bug"));
      await c.closed;
      await until(() => exit.mock.calls.length > 0);
      expect(exit.mock.calls).toEqual([[1]]);
      expect(releases()).toBe(1);
      expect(logged.slice(at).find((l) => l.message === "relay: uncaught exception")).toMatchObject({ severity: "ERROR", error: "Error: a bug", stack: expect.any(String) });
    } finally { exit.mockRestore(); if (second.listening) await new Promise((ok) => second.close(ok)); }
  });
});
