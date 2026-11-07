// An organization keeps an admin (platform.ts refuseLastAdmin): its only admin isn't demoted, moved out or removed until
// someone else is its admin, for any caller, and refusals carry a stable reason code that the admin screens put in the
// admin's language (apps/web/src/admin/refusals.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeAuth, FakeDb } from "./fakeFirestore";

vi.mock("../src/admin.js", async () => {
  const { FakeDb, FakeAuth } = await import("./fakeFirestore");
  const { HttpsError } = await import("firebase-functions/v2/https");
  const db = new FakeDb(), auth = new FakeAuth();
  type Req = { auth?: { uid: string; token: Record<string, unknown> } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, freshCaller,
    audit: async () => {},
    releasePupils: async () => 0,
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});
vi.mock("../src/billing.js", () => ({ writeClaims: async () => {} }));
vi.mock("../src/storage.js", () => ({ bucket: () => ({ deleteFiles: async () => {} }) }));

const admin = (await import("../src/admin.js")) as unknown as { db: FakeDb; auth: FakeAuth };
const { db, auth } = admin;
const platform = await import("../src/platform");
type Run = { run: (req: unknown) => Promise<unknown> };
const asSuper = (data: Record<string, unknown>) => ({ auth: { uid: "root", token: {} }, data });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { details?: { reason?: string } }) => e.details?.reason ?? "no reason");

beforeEach(() => {
  db.docs.clear(); auth.users.clear();
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  db.docs.set("orgs/o1", { name: "Nile School", status: "active", memberCount: 3 });
  db.docs.set("orgs/o2", { name: "Delta School", status: "active", memberCount: 0 });
  db.docs.set("users/a1", { role: "orgAdmin", orgId: "o1" });
  db.docs.set("users/t1", { role: "teacher", orgId: "o1" });
  db.docs.set("users/s1", { role: "student", orgId: "o1" });
});

describe("an organization's only admin", () => {
  it("can't be made a teacher, a learner or another organization's admin", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBe("last-admin");
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "learner" })))).toBe("last-admin");
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "orgAdmin", orgId: "o2" })))).toBe("last-admin");
    expect(db.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
  });

  it("can be changed once someone else is its admin, and other members never wait on it", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "learner" })))).toBeNull();
    expect(await refusal(setUserRole.run(asSuper({ uid: "t1", role: "orgAdmin", orgId: "o1" })))).toBeNull();
    expect(await refusal(setUserRole.run(asSuper({ uid: "a1", role: "teacher", orgId: "o1" })))).toBeNull();
    expect(db.docs.get("users/a1")).toMatchObject({ role: "teacher", orgId: "o1" });
  });

  it("says why with a code: your own role, no organization, an inactive one", async () => {
    const setUserRole = platform.setUserRole as unknown as Run;
    expect(await refusal(setUserRole.run(asSuper({ uid: "root", role: "learner" })))).toBe("self-role");
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "teacher", orgId: "nope" })))).toBe("no-org");
    db.docs.set("orgs/o3", { name: "Closed", status: "rejected" });
    expect(await refusal(setUserRole.run(asSuper({ uid: "s1", role: "teacher", orgId: "o3" })))).toBe("org-inactive");
  });
});
