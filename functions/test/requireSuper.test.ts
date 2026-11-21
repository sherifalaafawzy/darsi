// requireSuper (src/admin.ts), run against the real admin.ts with the Admin SDK faked (fakeAdminSdk.ts, as in
// audit.test.ts): anyone but a platform admin, as Auth holds the claims now, is refused with `details.reason`
// "not-super", which the admin screens word (apps/web admin/refusals.ts) instead of guessing from the English message.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock("firebase-admin/firestore", async (orig) => {
  const real = await orig<typeof import("firebase-admin/firestore")>();
  const { install } = await import("./fakeAdminSdk");
  return { ...real, getFirestore: () => install(real as never).db };
});
vi.mock("firebase-admin/auth", async () => { const { install } = await import("./fakeAdminSdk"); return { getAuth: () => install().auth }; });
vi.mock("firebase-admin/messaging", () => ({ getMessaging: () => ({}) }));
vi.mock("firebase-functions/v2", async (orig) => ({ ...(await orig<object>()), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const admin = await import("../src/admin");
const { fake } = await import("./fakeAdminSdk");
const { auth } = fake;
const req = (uid: string, token: Record<string, unknown>) => ({ auth: { uid, token } }) as never;

beforeEach(() => {
  auth.users.clear(); auth.down = false;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
});

describe("requireSuper", () => {
  it("lets a platform admin through", async () => {
    expect(await admin.requireSuper(req("root", { role: "superadmin" }))).toMatchObject({ uid: "root", role: "superadmin" });
  });

  it("refuses everyone else with the reason not-super, whatever their token says", async () => {
    for (const [uid, token] of [["a1", { role: "orgAdmin", orgId: "o1" }], ["a1", { role: "superadmin" }], ["s9", { role: "student" }], ["n1", {}]] as const) {
      await expect(admin.requireSuper(req(uid, token)), uid).rejects.toMatchObject({ code: "permission-denied", message: "Platform admins only.", details: { reason: "not-super" } });
    }
    // Demoted since the token was made: Auth's claims decide.
    auth.users.set("root", { uid: "root", customClaims: { role: "learner" } });
    await expect(admin.requireSuper(req("root", { role: "superadmin" }))).rejects.toMatchObject({ details: { reason: "not-super" } });
  });

  it("still refuses a signed-out request as unauthenticated, before any reason", async () => {
    await expect(admin.requireSuper({} as never)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
