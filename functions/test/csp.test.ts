// Content-Security-Policy reports (csp.ts, darsiai.org/api/csp): anyone can post here, so it takes POSTs of at most
// 8 KB in the two formats browsers send, a few a minute per address, logs only the directive, what was blocked (origin
// and path) and the page's path (no query strings: an invite link carries its code there), counts them in stats/csp at
// most every 5 seconds, and always answers 204.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  return { db: new FakeDb() };
});
vi.mock("firebase-functions/v2", async (orig) => ({ ...(await orig<object>()), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { logger } = await import("firebase-functions/v2");
const { handleCsp, readReports, LIMITS, CSP_DOC } = await import("../src/csp");

/** The module keeps its limits and unsent counts per instance, so each test starts a few minutes after the last. */
let now = Date.parse("2026-11-11T08:00:00Z");
const legacy = (r: Record<string, unknown>) => JSON.stringify({ "csp-report": r });
const SCRIPT = legacy({
  "document-uri": "https://darsiai.org/signup?code=ABCD-EFGH-JKLM", referrer: "", "violated-directive": "script-src-elem",
  "effective-directive": "script-src-elem", "original-policy": "default-src 'self'; report-uri /api/csp", disposition: "report",
  "blocked-uri": "https://evil.example/x.js?token=secret#frag", "status-code": 200,
});
async function post(body: string | Buffer | undefined, o: { type?: string; method?: string; ip?: string } = {}) {
  let code = 0, ended = false;
  const res = { status: (c: number) => { code = c; return { end: () => { ended = true; } }; } };
  const rawBody = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body);
  await handleCsp({ method: o.method ?? "POST", rawBody, headers: { "content-type": o.type ?? "application/csp-report", "x-forwarded-for": o.ip ?? "203.0.113.7" } }, res, now);
  expect(ended).toBe(true);
  return code;
}
const logged = () => vi.mocked(logger.warn).mock.calls.filter((c) => c[0] === "csp").map((c) => c[1]);
const counts = () => db.docs.get(CSP_DOC);

beforeEach(async () => {
  // Counts the last test left unsent go out with the next report (as on a real instance): one here, then a new minute.
  now += 5 * 60_000;
  db.failOn = null;
  await post(SCRIPT, { ip: "192.0.2.1" });
  now += 61_000;
  db.docs.clear(); db.writes.length = 0;
  vi.mocked(logger.warn).mockClear(); vi.mocked(logger.error).mockClear();
});

describe("cspReport", () => {
  it("takes POSTs only", async () => {
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) expect(await post(SCRIPT, { method }), method).toBe(405);
    expect(logged()).toEqual([]);
    expect(counts()).toBeUndefined();
  });

  it("refuses a body over 8 KB", async () => {
    expect(await post(legacy({ "effective-directive": "img-src", "blocked-uri": `https://x.example/${"a".repeat(LIMITS.bytes)}` }))).toBe(413);
    expect(await post(Buffer.alloc(LIMITS.bytes + 1, 0x20))).toBe(413);
    expect(logged()).toEqual([]);
    // Exactly 8 KB is read.
    const pad = LIMITS.bytes - Buffer.byteLength(legacy({ "effective-directive": "img-src", x: "" }));
    expect(await post(legacy({ "effective-directive": "img-src", x: "a".repeat(pad) }))).toBe(204);
    expect(logged()).toEqual([{ directive: "img-src", blocked: "", page: "" }]);
  });

  it("answers 204 to a report, logs it without query strings or hosts of ours, and counts it", async () => {
    expect(await post(SCRIPT)).toBe(204);
    expect(logged()).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "/signup" }]);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(/ABCD|secret|frag|original-policy|default-src/);
    expect(counts()).toEqual({ "script-src-elem": 1, at: now });
  });

  it("reads the Reporting API's batches too, and keeps only CSP violations", async () => {
    const batch = JSON.stringify([
      { type: "csp-violation", age: 10, url: "https://learn.school.edu.eg/lesson/ai-4-1/ai-4-1-1?step=2", user_agent: "Mozilla/5.0",
        body: { documentURL: "https://learn.school.edu.eg/lesson/ai-4-1/ai-4-1-1?step=2", effectiveDirective: "connect-src", blockedURL: "wss://relay.example/live?u=1", disposition: "report" } },
      { type: "csp-violation", url: "https://darsiai.org/learn", body: { effectiveDirective: "script-src-elem", blockedURL: "inline" } },
      { type: "deprecation", url: "https://darsiai.org/", body: { id: "x" } },
    ]);
    expect(await post(batch, { type: "application/reports+json; charset=utf-8" })).toBe(204);
    expect(logged()).toEqual([
      { directive: "connect-src", blocked: "wss://relay.example/live", page: "/lesson/ai-4-1/ai-4-1-1" },
      { directive: "script-src-elem", blocked: "inline", page: "/learn" },
    ]);
    expect(counts()).toEqual({ "connect-src": 1, "script-src-elem": 1, at: now });
  });

  it("keeps directive names to a fixed list, so made-up ones can't grow the counts", async () => {
    expect(readReports("application/csp-report", legacy({ "violated-directive": "script-src 'self' https://apis.google.com", "blocked-uri": "eval" })))
      .toEqual([{ directive: "script-src", blocked: "eval", page: "" }]);
    for (const made of ["made-up-src", "x".repeat(41), "Script_Src", "__proto__", "a.b", "at"]) {
      expect(readReports("application/csp-report", legacy({ "effective-directive": made })), made).toEqual([{ directive: "other", blocked: "", page: "" }]);
    }
    // Not a report at all: no directive, another content type, not JSON, not an object.
    expect(readReports("application/csp-report", legacy({ "blocked-uri": "inline" }))).toEqual([]);
    expect(readReports("application/json", SCRIPT)).toEqual([]);
    expect(readReports("text/plain", SCRIPT)).toEqual([]);
    expect(readReports("application/csp-report", "{not json")).toEqual([]);
    expect(readReports("application/csp-report", "null")).toEqual([]);
    expect(readReports("application/reports+json", "7")).toEqual([]);
    // What was blocked: a keyword, a web address without its query, or only the scheme of anything else.
    const blocked = (v: unknown) => readReports("application/csp-report", legacy({ "effective-directive": "img-src", "blocked-uri": v }))[0].blocked;
    expect(blocked("data:image/png;base64,AAAA")).toBe("data:");
    expect(blocked("blob")).toBe("blob");
    expect(blocked("https://user:pw@cdn.example:8443/a/b.png?sig=1")).toBe("https://cdn.example:8443/a/b.png");
    expect(blocked("<script>alert(1)</script>")).toBe("");
    expect(blocked(7)).toBe("");
    // A batch is cut to 10 reports.
    const many = JSON.stringify(Array.from({ length: 30 }, () => ({ type: "csp-violation", body: { effectiveDirective: "img-src" } })));
    expect(readReports("application/reports+json", many)).toHaveLength(LIMITS.reports);
  });

  it("answers 204 to anything else posted, and keeps nothing of it", async () => {
    expect(await post(undefined)).toBe(204);
    expect(await post("")).toBe(204);
    expect(await post("{not json")).toBe(204);
    expect(await post(SCRIPT, { type: "application/json" })).toBe(204);
    expect(logged()).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it("takes 20 reports a minute from one address: the 21st is answered and dropped", async () => {
    for (let i = 0; i < LIMITS.address; i++) expect(await post(SCRIPT)).toBe(204);
    expect(logged()).toHaveLength(20);
    expect(await post(SCRIPT)).toBe(204);
    expect(await post(SCRIPT)).toBe(204);
    expect(logged()).toHaveLength(20);
    // Another address is still heard, and so is the first one a minute later.
    expect(await post(SCRIPT, { ip: "198.51.100.9" })).toBe(204);
    expect(logged()).toHaveLength(21);
    now += 61_000;
    expect(await post(SCRIPT)).toBe(204);
    expect(logged()).toHaveLength(22);
  });

  it("stops listening for the minute after 600 requests, whatever addresses they claim", async () => {
    for (let i = 0; i < LIMITS.instance; i++) await post(SCRIPT, { ip: `10.${i >> 8}.${i & 255}.1` });
    expect(logged()).toHaveLength(LIMITS.instance);
    expect(await post(SCRIPT, { ip: "192.0.2.200" })).toBe(204);
    expect(logged()).toHaveLength(LIMITS.instance);
  });

  it("adds the counts to stats/csp at most every 5 seconds, summing in between", async () => {
    await post(SCRIPT);
    expect(db.writes).toHaveLength(1);
    expect(counts()).toEqual({ "script-src-elem": 1, at: now });
    for (let i = 0; i < 3; i++) { now += 1000; await post(SCRIPT, { ip: `198.51.100.${i}` }); }
    await post(legacy({ "effective-directive": "img-src", "blocked-uri": "data" }), { ip: "198.51.100.50" });
    expect(db.writes).toHaveLength(1);
    now += LIMITS.flushMs;
    await post(SCRIPT, { ip: "198.51.100.60" });
    expect(db.writes).toHaveLength(2);
    expect(counts()).toEqual({ "script-src-elem": 5, "img-src": 1, at: now });
  });

  it("keeps the counts for the next write when Firestore refuses one, and still answers 204", async () => {
    db.failOn = (w) => w.path === CSP_DOC;
    expect(await post(SCRIPT)).toBe(204);
    expect(counts()).toBeUndefined();
    expect(vi.mocked(logger.error)).toHaveBeenCalledOnce();
    now += LIMITS.flushMs;
    expect(await post(SCRIPT, { ip: "198.51.100.61" })).toBe(204);
    expect(counts()).toEqual({ "script-src-elem": 2, at: now });
  });
});
