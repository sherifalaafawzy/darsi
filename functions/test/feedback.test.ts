import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";
import { cleanPath, FEEDBACK_LIMITS, MAX_COMMENT, parseFeedback } from "../src/feedbackCore";
import { limiter } from "../src/bugsCore";

// sendFeedback itself (feedback.ts), for what it stores: Firestore is the in-memory fake, and a token verifies when it
// is one of `tokens`.
const tokens = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("../src/admin.js", async () => {
  const { FakeDb } = await import("./fakeFirestore");
  return { db: new FakeDb(), auth: { verifyIdToken: async (t: string) => { const who = tokens.get(t); if (!who) throw new Error("auth/argument-error"); return who; } } };
});
const { db } = (await import("../src/admin.js")) as unknown as { db: FakeDb };
const { sendFeedback } = await import("../src/feedback");

describe("parseFeedback", () => {
  it("keeps a rating, its topic, the comment, the page as a path and the course", () => {
    expect(parseFeedback({ rating: 4, text: "  Loved the labs  ", topic: "labs", path: "/learn?code=ABCD-EFGH#x", unitId: "ai-2-1", source: "course", lang: "ar" }))
      .toEqual({ rating: 4, text: "Loved the labs", topic: "labs", path: "/learn", unitId: "ai-2-1", source: "course", lang: "ar", queuedAt: null });
  });
  it("needs a whole number of stars from 1 to 5, and nothing else", () => {
    for (const rating of [0, 6, 3.5, "4", null, undefined, NaN]) expect(() => parseFeedback({ rating })).toThrow();
    for (const body of [null, [], "x", 5]) expect(() => parseFeedback(body)).toThrow();
    expect(parseFeedback({ rating: 1 })).toMatchObject({ rating: 1, text: "", topic: null, path: "", unitId: null, source: "button", lang: null });
  });
  it("drops a topic, course, language or date it doesn't know, and cuts the comment", () => {
    const f = parseFeedback({ rating: 5, topic: "money", unitId: "../../etc", lang: "<b>", queuedAt: "soon", source: "course", text: "a".repeat(MAX_COMMENT + 50) });
    expect(f).toMatchObject({ topic: null, unitId: null, lang: null, queuedAt: null, source: "button" });
    expect(f.text).toHaveLength(MAX_COMMENT);
    expect(parseFeedback({ rating: 5, queuedAt: "2026-11-12T08:00:00.000Z" }).queuedAt).toBe("2026-11-12T08:00:00.000Z");
  });
  it("keeps a page only as a path on this site", () => {
    expect(cleanPath("/lesson/ai-1-1/ai-1-1-2?step=3")).toBe("/lesson/ai-1-1/ai-1-1-2");
    expect(cleanPath("/signin#sso=TICKET")).toBe("/signin");
    for (const bad of ["https://evil.example/x", "//evil.example", "learn", "/a b", "/<script>", 7, null]) expect(cleanPath(bad)).toBe("");
  });
  it("lets a whole class rate a course from one address, but not one person over and over", () => {
    const over = limiter(FEEDBACK_LIMITS);
    for (let i = 0; i < 30; i++) expect(over("10.0.0.1", `pupil${i}`, 0)).toBe(false);
    const one = limiter(FEEDBACK_LIMITS);
    for (let i = 0; i < FEEDBACK_LIMITS.account.n; i++) expect(one(`10.1.0.${i}`, "u1", 0)).toBe(false);
    expect(one("10.1.1.1", "u1", 0)).toBe(true);
  });
});

describe("what sendFeedback stores", () => {
  let n = 0;
  /** One POST to the function, from an address of its own (so the per-address limit never plays a part). */
  async function send(body: unknown, token?: string, raw?: Buffer) {
    const out = { status: 0, json: null as unknown };
    const res = { set: () => res, status: (c: number) => { out.status = c; return res; }, json: (j: unknown) => { out.json = j; return res; }, end: () => res, on: () => res };
    const req = { method: "POST", rawBody: raw ?? Buffer.from(JSON.stringify(body)), ip: `10.30.${n >> 8}.${n++ & 255}`, headers: { "user-agent": "vitest", ...(token ? { authorization: `Bearer ${token}` } : {}) } };
    await (sendFeedback as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);
    const id = (out.json as { id?: string } | null)?.id;
    return { status: out.status, doc: id ? (db.docs.get(`feedback/${id}`) as Record<string, unknown>) : null };
  }
  beforeEach(() => { db.docs.clear(); tokens.clear(); });

  it("a guest's feedback names no one", async () => {
    const { status, doc } = await send({ rating: 5, text: "Clear videos", topic: "videos", path: "/learn" });
    expect(status).toBe(201);
    expect(doc).toMatchObject({ status: "new", rating: 5, text: "Clear videos", topic: "videos", path: "/learn", user: null, source: "button" });
  });

  it("signed in, the verified token says who, whatever the body says", async () => {
    tokens.set("good", { uid: "u1", email: "mona@example.com", role: "teacher", orgId: "org1" });
    db.docs.set("users/u1", { name: "Mona" });
    const { status, doc } = await send({ rating: 3, unitId: "ai-2-1", source: "course", user: { uid: "someone-else" } }, "good");
    expect(status).toBe(201);
    expect(doc).toMatchObject({ rating: 3, unitId: "ai-2-1", source: "course", user: { uid: "u1", name: "Mona", role: "teacher", orgId: "org1" } });
    expect(JSON.stringify(doc)).not.toContain("someone-else");
  });

  it("refuses a token that does not verify, a body without a rating, one too big, and anything but POST", async () => {
    expect((await send({ rating: 5 }, "forged")).status).toBe(401);
    expect((await send({ text: "no stars" })).status).toBe(400);
    expect((await send(null, undefined, Buffer.from("{"))).status).toBe(400);
    expect((await send(null, undefined, Buffer.alloc(20_000, 32))).status).toBe(413);
    expect(db.docs.size).toBe(0);
    const out = { status: 0 };
    const res = { set: () => res, status: (c: number) => { out.status = c; return res; }, end: () => res, json: () => res, on: () => res };
    await (sendFeedback as unknown as (req: unknown, res: unknown) => Promise<void>)({ method: "GET", headers: {} }, res);
    expect(out.status).toBe(405);
  });
});
