// tutorSearch answers only the tutor agent: a Google ID token made for this function, by the agent's service account.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndex, sections, type TutorUnit } from "../src/tutorCore.js";

const unit: TutorUnit = { id: "cyber-1-1", track: "cyber", level: 1, title: { en: "Passwords and phishing" }, lessons: [
  { id: "cyber-1-1-2", title: { en: "Spot phishing" }, steps: [{ id: "read", type: "read", title: { en: "Phishing" }, body: { en: "Phishing is a message that pretends to come from someone you trust." } }] },
] } as unknown as TutorUnit;
vi.mock("../src/tutor.js", () => ({
  PROJECT: "darsi-test",
  googleToken: async () => "t",
  tutorConfig: async () => ({ agentAccount: "agent@darsi-test.iam.gserviceaccount.com" }),
  loadUnit: async (id: string) => (id === "cyber-1-1" ? unit : null),
  trackIndex: async (u: TutorUnit, _org: string | null, lang: string) => buildIndex(sections(u, lang)),
}));
const { tutorSearch } = await import("../src/agent.js");

const URL_ = "https://europe-west1-darsi-test.cloudfunctions.net/tutorSearch";
const call = async (auth: string | undefined, body: unknown = { query: "what is phishing", unitId: "cyber-1-1", orgId: null, lang: "en" }) => {
  let status = 200, sent: unknown;
  const res = { status(n: number) { status = n; return res; }, json(b: unknown) { sent = b; return res; }, end() { return res; } };
  await (tutorSearch as unknown as (req: unknown, res: unknown) => Promise<void>)({ method: "POST", headers: { authorization: auth }, body }, res);
  return { status, sent };
};
const tokeninfo = (info: Record<string, unknown>) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(info))));
const good = { aud: URL_, email: "agent@darsi-test.iam.gserviceaccount.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 3600) };
/** A JWT-shaped token carrying these claims (Google's tokeninfo, stubbed, does the real check). */
const jwt = (claims: Record<string, unknown>, sig = "signature-x") => `Bearer ${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${Buffer.from(`${sig}-signature`).toString("base64url")}`;

afterEach(() => vi.unstubAllGlobals());

describe("tutorSearch", () => {
  it("refuses a call without a token, or with one made for another address or by another account", async () => {
    expect((await call(undefined)).status).toBe(401);
    tokeninfo({ ...good, aud: "https://elsewhere" });
    expect((await call(jwt(good, "a"))).status).toBe(401);
    tokeninfo({ ...good, email: "someone@gmail.com" });
    expect((await call(jwt(good, "b"))).status).toBe(401);
    tokeninfo({ ...good, exp: "1" });
    expect((await call(jwt(good, "c"))).status).toBe(401);
  });

  it("turns away junk before reading the settings or asking Google (L11)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(good)));
    vi.stubGlobal("fetch", f);
    expect((await call("Bearer not-a-jwt")).status).toBe(401);
    expect((await call(jwt({ ...good, aud: "https://elsewhere" }, "e"))).status).toBe(401);
    expect((await call(jwt({ ...good, exp: 1 }, "f"))).status).toBe(401);
    expect((await call(jwt({ ...good, email: "someone@gmail.com" }, "g"))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("answers the agent with the course's best sections, and nothing for a course the learner can't see", async () => {
    tokeninfo(good);
    const r = await call(jwt(good, "d"));
    expect(r.status).toBe(200);
    expect((r.sent as { hits: { id: string; text: string }[] }).hits[0]).toMatchObject({ id: "cyber-1-1-2/read", course: "Passwords and phishing" });
    expect((await call(jwt(good, "d"), { query: "x", unitId: "secret-org-unit", lang: "en" })).sent).toEqual({ hits: [] });
  });
});
