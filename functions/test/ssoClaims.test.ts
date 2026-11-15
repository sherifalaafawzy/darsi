// writeClaims (billing.ts) and school sign-in: every organization change passes writeClaims, so it is where an account
// that left an organization stops opening through that school's sign-in (ssoStore.ssoClaimsMoved, design §7). The hook
// runs after the claims, only when the organization changed (or Auth couldn't say what it was), and never fails the change.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Data = Record<string, unknown>;
const f = vi.hoisted(() => ({ docs: new Map<string, Data>(), users: new Map<string, { uid: string; customClaims?: Data }>(), failGet: false, moved: [] as unknown[][], hookFails: false }));
vi.mock("../src/admin.js", () => {
  const db = {
    doc: (path: string) => {
      const ref = { path, get: async () => { const d = f.docs.get(path); return { exists: d !== undefined, data: () => d, get: (k: string) => d?.[k], ref }; }, set: async (data: Data) => { f.docs.set(path, { ...f.docs.get(path), ...data }); } };
      return ref;
    },
  };
  const auth = {
    getUser: async (uid: string) => { if (f.failGet) throw Object.assign(new Error("down"), { code: "auth/internal-error" }); const u = f.users.get(uid); if (!u) throw Object.assign(new Error("gone"), { code: "auth/user-not-found" }); return structuredClone(u); },
    setCustomUserClaims: async (uid: string, claims: Data) => { f.users.set(uid, { uid, customClaims: claims }); },
    revokeRefreshTokens: async () => {},
  };
  return { db, auth, audit: async () => {}, freshCaller: async () => ({}), requireSuper: async () => ({}), str: (v: unknown) => String(v ?? "") };
});
vi.mock("../src/ssoStore.js", () => ({ ssoClaimsMoved: async (...a: unknown[]) => { f.moved.push(a); if (f.hookFails) throw new Error("firestore down"); return 0; } }));
vi.mock("../src/analytics.js", () => ({ gaConfig: async () => ({ mid: "", secret: "" }) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {}, superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({}) }));

const { writeClaims } = await import("../src/billing");

beforeEach(() => { f.docs.clear(); f.users.clear(); f.failGet = false; f.moved.length = 0; f.hookFails = false; });

describe("writeClaims tells school sign-in about organization changes", () => {
  it("leaving or changing organization runs the hook with the new one, after the claims", async () => {
    f.users.set("u1", { uid: "u1", customClaims: { role: "student", orgId: "o1" } });
    await writeClaims("u1", "learner", null);
    expect(f.moved).toEqual([["u1", null]]);
    expect(f.users.get("u1")?.customClaims).toMatchObject({ role: "learner" });
    f.users.set("u2", { uid: "u2", customClaims: { role: "teacher", orgId: "o1" } });
    await writeClaims("u2", "teacher", "o2");
    expect(f.moved).toEqual([["u1", null], ["u2", "o2"]]);
  });

  it("a change inside the same organization, or joining one from none, doesn't", async () => {
    f.users.set("u1", { uid: "u1", customClaims: { role: "student", orgId: "o1" } });
    await writeClaims("u1", "teacher", "o1");
    f.users.set("u2", { uid: "u2", customClaims: { role: "learner" } });
    await writeClaims("u2", "student", "o1");
    expect(f.moved).toEqual([]);
  });

  it("runs it when Auth couldn't say what the account had, and a failing hook never fails the change", async () => {
    f.failGet = true;
    f.users.set("u1", { uid: "u1", customClaims: { role: "student", orgId: "o1" } });
    f.hookFails = true;
    await expect(writeClaims("u1", "learner", null)).resolves.not.toThrow();
    expect(f.moved).toEqual([["u1", null]]);
  });
});
