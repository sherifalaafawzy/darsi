// startCheckout for seats (src/payments.ts): an organization that is suspended or being deleted is sold no licence
// (`org-suspended`, `org-deleting`), checked before a checkout is stored or a provider is called. Its admins' claims
// still say orgAdmin (frozen), so the role check alone would have let them through.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "./fakeFirestore";

const params = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => params.values[name] ?? "" }),
  defineString: (name: string, o?: { default?: string }) => ({ name, value: () => params.values[name] ?? o?.default ?? "" }),
}));
vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const caller = (req: Req) => { if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first."); return { uid: req.auth.uid, role: (req.auth.token.role as string) ?? "learner", orgId: req.auth.token.orgId as string | undefined }; };
  const freshCaller = async (req: Req) => { const c = caller(req); const claims = (await auth.getUser(c.uid).catch(() => null))?.customClaims ?? {}; return { uid: c.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined }; };
  return {
    db, auth, caller, freshCaller,
    audit: async () => {},
    requireSuper: async () => { throw new HttpsError("permission-denied", "Platform admins only.", { reason: "not-super" }); },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/analytics.js", () => ({ gaConfig: async () => ({ mid: "", secret: "" }) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {}, superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({}) }));

const { db, auth } = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: import("./fakeFirestore").FakeAuth };
const { startCheckout } = await import("../src/payments");
const run = (data: Record<string, unknown>) => (startCheckout as unknown as { run: (r: unknown) => Promise<unknown> }).run({ auth: { uid: "a1", token: { role: "orgAdmin", orgId: "o1" } }, data });
const outcome = (p: Promise<unknown>) => p.then(() => "ok", (e: { message?: string; details?: { reason?: string } }) => e.details?.reason ?? e.message);
const fetched: string[] = [];

const seat = { id: "super_seat", name: { en: "Super seats", ar: "مقاعد سوبر" }, kind: "seat", period: "year", prices: { EGP: 600, USD: 20 }, credits: 300, active: true };

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); fetched.length = 0;
  params.values = {}; // no provider keys: an accepted request stops at "payments-closed", before any provider call
  vi.stubGlobal("fetch", async (url: string) => { fetched.push(String(url)); throw new Error("no network in tests"); });
  db.docs.set("config/plans", { plans: [seat] });
  // A frozen admin: their claims still name the role and the organization.
  auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1", frozen: true } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("seats for an organization that is suspended or being deleted", () => {
  it("are refused with the status's reason, and no checkout is stored", async () => {
    for (const status of ["suspended", "deleting"]) {
      db.docs.set("orgs/o1", { name: "School", status });
      expect(await outcome(run({ plan: "super_seat", currency: "EGP", seats: 5 })), status).toBe(`org-${status}`);
      expect(await outcome(run({ plan: "super_seat", currency: "USD", seats: 5 })), status).toBe(`org-${status}`);
    }
    expect([...db.docs.keys()].filter((k) => k.startsWith("checkouts/"))).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it("an active organization's admin gets past the check (here to payments-closed, with no keys set)", async () => {
    db.docs.set("orgs/o1", { name: "School", status: "active" });
    expect(await outcome(run({ plan: "super_seat", currency: "EGP", seats: 5 }))).toBe("payments-closed");
  });
});
