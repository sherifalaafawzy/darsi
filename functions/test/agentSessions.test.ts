// The tutor agent's conversations by account (agentSessions.ts): listed, deleted and exported through Agent Runtime's
// `:query` endpoint, with a failure reported and never thrown. Agent Runtime is a stubbed fetch that keeps sessions in
// a map; the settings and the service account's token are stand-ins for tutor.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({ agentId: "777", agentLocation: "europe-west1" }));
vi.mock("../src/tutor.js", () => ({ PROJECT: "demo-darsi", googleToken: async () => "sa-token", tutorConfig: async () => ({ ...cfg }) }));
const { deleteSession, deleteSessions, exportSessions, listSessions } = await import("../src/agentSessions");

type Call = { url: string; method: string; input: Record<string, string>; auth: string | null };
let calls: Call[] = [];
let sessions = new Map<string, string[]>(); // user → session ids
let failOn: ((c: Call) => Response | null) | null = null;
/** How many sessions one listing returns (Agent Runtime may page). */
let page = 100;

beforeEach(() => {
  calls = []; sessions = new Map([["u1", ["s1", "s2", "s3"]], ["u2", ["other"]]]); failOn = null; page = 100;
  Object.assign(cfg, { agentId: "777", agentLocation: "europe-west1" });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as { class_method: string; input: Record<string, string> };
    const call = { url, method: body.class_method, input: body.input, auth: init.headers.Authorization ?? null };
    calls.push(call);
    const failed = failOn?.(call);
    if (failed) return failed;
    const mine = sessions.get(body.input.user_id) ?? [];
    if (body.class_method === "async_list_sessions") return Response.json({ output: { sessions: mine.slice(0, page).map((id) => ({ id, userId: body.input.user_id, lastUpdateTime: 1762000000, events: [] })) } });
    if (body.class_method === "async_get_session") return Response.json({ output: { id: body.input.session_id, events: [{ author: "user", timestamp: 1762000000, content: { parts: [{ text: `asked in ${body.input.session_id}` }] } }] } });
    if (body.class_method === "async_delete_session") { sessions.set(body.input.user_id, mine.filter((s) => s !== body.input.session_id)); return Response.json({ output: null }); }
    return new Response("no such method", { status: 400 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("an account's tutor sessions", () => {
  it("are listed from the agent in config/tutor, as its service account", async () => {
    expect(await listSessions("u1")).toEqual([{ id: "s1", updatedAt: 1762000000000 }, { id: "s2", updatedAt: 1762000000000 }, { id: "s3", updatedAt: 1762000000000 }]);
    expect(calls).toEqual([{ url: "https://europe-west1-aiplatform.googleapis.com/v1/projects/demo-darsi/locations/europe-west1/reasoningEngines/777:query", method: "async_list_sessions", input: { user_id: "u1" }, auth: "Bearer sa-token" }]);
  });

  it("are all deleted, and nobody else's", async () => {
    expect(await deleteSessions("u1")).toEqual({ sessions: 3, sessionsFailed: false });
    expect(sessions.get("u1")).toEqual([]);
    expect(sessions.get("u2")).toEqual(["other"]);
    expect(calls.filter((c) => c.method === "async_delete_session").map((c) => c.input)).toEqual([{ user_id: "u1", session_id: "s1" }, { user_id: "u1", session_id: "s2" }, { user_id: "u1", session_id: "s3" }]);
    expect(calls.at(-1)!.method).toBe("async_list_sessions"); // asked once more, to see none are left
  });

  it("are deleted through every page of the listing", async () => {
    page = 2;
    expect(await deleteSessions("u1")).toEqual({ sessions: 3, sessionsFailed: false });
    expect(sessions.get("u1")).toEqual([]);
  });

  it("do nothing when no agent is set up", async () => {
    cfg.agentId = "";
    expect(await listSessions("u1")).toEqual([]);
    expect(await deleteSessions("u1")).toEqual({ sessions: 0, sessionsFailed: false });
    expect(await exportSessions("u1")).toEqual({ complete: true, sessions: [] });
    await deleteSession("u1", "s1");
    expect(calls).toEqual([]);
  });

  it("report a failure with how many did go, and never throw", async () => {
    failOn = (c) => (c.method === "async_delete_session" && c.input.session_id === "s2" ? new Response("quota", { status: 429 }) : null);
    expect(await deleteSessions("u1")).toEqual({ sessions: 1, sessionsFailed: true });
    expect(sessions.get("u1")).toEqual(["s2", "s3"]);
    failOn = () => new Response("down", { status: 503 });
    expect(await deleteSessions("u1")).toEqual({ sessions: 0, sessionsFailed: true });
    failOn = () => { throw new Error("network"); };
    expect(await deleteSessions("u1")).toEqual({ sessions: 0, sessionsFailed: true });
    await expect(listSessions("u1")).rejects.toThrow("network"); // a caller that needs to know is told
  });

  it("stop at their time budget and say some are left", async () => {
    expect(await deleteSessions("u1", -1)).toEqual({ sessions: 0, sessionsFailed: true });
    expect(sessions.get("u1")).toHaveLength(3);
  });

  it("can be asked of another agent (an older one that still holds sessions)", async () => {
    await deleteSession("u1", "s1", { agentId: "555", agentLocation: "us-central1" });
    expect(calls[0].url).toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/demo-darsi/locations/us-central1/reasoningEngines/555:query");
  });
});

describe("an account's tutor conversations for its export", () => {
  it("give each session's id, last use and what was said", async () => {
    expect(await exportSessions("u2")).toEqual({ complete: true, sessions: [{ id: "other", updatedAt: 1762000000000, events: [{ at: new Date(1762000000000).toISOString(), author: "user", parts: [{ text: "asked in other" }] }] }] });
  });
  it("say so when a session's events could not be read, or the listing failed", async () => {
    failOn = (c) => (c.method === "async_get_session" && c.input.session_id === "s2" ? new Response("down", { status: 503 }) : null);
    const out = await exportSessions("u1");
    expect(out.complete).toBe(false);
    expect(out.sessions.map((s) => [s.id, s.events === null])).toEqual([["s1", false], ["s2", true], ["s3", false]]);
    failOn = () => new Response("down", { status: 503 });
    expect(await exportSessions("u1")).toEqual({ complete: false, sessions: [] });
  });
  it("list the sessions without their events once the time budget is spent", async () => {
    const out = await exportSessions("u1", 0);
    expect(out.complete).toBe(false);
    expect(out.sessions.map((s) => s.events)).toEqual([null, null, null]);
  });
});
