// writeClaims and refreshClaims against small fakes of Auth and Firestore kept in this file (TECHNICAL.md):
// an Auth error is not "no such account", a change made while Auth couldn't be read still ends the sessions, and a
// suspended organization's staff carry `frozen: true` until it is active again.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimsFor, sameClaims } from "../src/billingCore";

type Data = Record<string, unknown>;
type Fakes = {
  docs: Map<string, Data>; profileWrites: string[];
  users: Map<string, { uid: string; customClaims?: Data }>;
  /** Makes getUser fail for these accounts with this Auth error code (not "user-not-found"). */
  failGet: Map<string, string>;
  getUsers: string[]; claimWrites: { uid: string; claims: Data }[]; revoked: string[];
  /** Document writes and claim writes in the order they happened ("doc users/t1", "claims t1"). */
  log: string[];
};

vi.mock("../src/admin.js", async () => {
  const { FieldValue } = await import("firebase-admin/firestore");
  const f: Fakes = { docs: new Map(), profileWrites: [], users: new Map(), failGet: new Map(), getUsers: [], claimWrites: [], revoked: [], log: [] };
  const authError = (code: string, message: string) => Object.assign(new Error(message), { code });
  const db = {
    doc: (path: string) => {
      const ref = {
        path,
        get: async () => { const d = f.docs.get(path); return { exists: d !== undefined, data: () => (d ? { ...d } : undefined), get: (k: string) => d?.[k], ref }; },
        set: async (data: Data, opts?: { merge?: boolean }) => {
          const next: Data = { ...(opts?.merge ? f.docs.get(path) : {}), ...data };
          for (const [k, v] of Object.entries(next)) if (v instanceof FieldValue) delete next[k]; // FieldValue.delete()
          f.docs.set(path, next); f.profileWrites.push(path); f.log.push(`doc ${path}`);
        },
      };
      return ref;
    },
  };
  // Auth as the Admin SDK answers: its errors carry a code, and a missing account is "auth/user-not-found".
  const auth = {
    getUser: async (uid: string) => {
      f.getUsers.push(uid);
      if (f.failGet.has(uid)) throw authError(f.failGet.get(uid)!, "Auth is not answering");
      const u = f.users.get(uid);
      if (!u) throw authError("auth/user-not-found", "There is no user record corresponding to the provided identifier.");
      return structuredClone(u);
    },
    setCustomUserClaims: async (uid: string, claims: Data) => {
      const u = f.users.get(uid);
      if (!u) throw authError("auth/user-not-found", "There is no user record corresponding to the provided identifier.");
      u.customClaims = structuredClone(claims); f.claimWrites.push({ uid, claims }); f.log.push(`claims ${uid}`);
    },
    revokeRefreshTokens: async (uid: string) => { f.revoked.push(uid); },
  };
  return { db, auth, fakes: f, audit: async () => {}, freshCaller: async () => ({}), requireSuper: async () => ({}), str: (v: unknown) => String(v ?? "") };
});
vi.mock("../src/analytics.js", () => ({ gaConfig: async () => ({ mid: "", secret: "" }) }));
vi.mock("../src/settings.js", () => ({ SETTINGS: "config/settings", writeSettingsFile: async () => {}, superOn: async () => true }));
vi.mock("../src/storage.js", () => ({ savePublicJson: async () => {}, bucket: () => ({}) }));

const f = ((await import("../src/admin.js")) as unknown as { fakes: Fakes }).fakes;
const { refreshClaims, writeClaims } = await import("../src/billing");

const DAY = 864e5;
const account = (uid: string, claims: Data) => f.users.set(uid, { uid, customClaims: claims });
const claims = (uid: string) => f.users.get(uid)!.customClaims;

beforeEach(() => {
  f.docs.clear(); f.profileWrites.length = 0; f.users.clear(); f.failGet.clear(); f.getUsers.length = 0; f.claimWrites.length = 0; f.revoked.length = 0; f.log.length = 0;
});

describe("an Auth error is not 'no such account'", () => {
  it("refreshClaims answers null for a missing account, and throws on any other Auth error", async () => {
    // Deleted since: nothing to refresh, and a retried trigger ends quietly.
    expect(await refreshClaims("gone")).toBeNull();
    expect(f.claimWrites).toEqual([]);
    // Auth itself failing used to read as "no such account": the refresh was skipped for good. Now the caller hears
    // of it (a retried trigger runs again; refreshAll counts it as failed).
    account("u1", { role: "learner" });
    f.docs.set("subscriptions/u1", { plan: "super_monthly", status: "active", source: "paymob", currentPeriodEnd: Date.now() + DAY });
    f.failGet.set("u1", "auth/internal-error");
    await expect(refreshClaims("u1")).rejects.toMatchObject({ code: "auth/internal-error" });
    expect(f.claimWrites).toEqual([]);
    f.failGet.clear();
    expect(await refreshClaims("u1")).toMatchObject({ plan: "super_monthly", source: "subscription" });
    expect(claims("u1")).toMatchObject({ role: "learner", plan: "super_monthly" });
  });

  it("refreshClaims keeps the role and organization the account has, and reads Auth once", async () => {
    account("t1", { role: "teacher", orgId: "o1" });
    f.docs.set("orgs/o1", { name: "School", status: "active" });
    f.docs.set("users/t1", { role: "teacher", orgId: "o1" });
    expect(await refreshClaims("t1")).toBeNull(); // no Super
    expect(f.getUsers).toEqual(["t1"]);
    // Claims that already say this are not written again (a whole organization refreshed twice stays cheap).
    expect(f.claimWrites).toEqual([]);
    expect(f.revoked).toEqual([]);
  });

  it("writeClaims still writes a demotion and ends the sessions when the account could not be read", async () => {
    account("a1", { role: "orgAdmin", orgId: "o1" });
    f.docs.set("users/a1", { role: "learner", orgId: null }); // the callable wrote the profile first
    f.failGet.set("a1", "auth/internal-error");
    await writeClaims("a1", "learner", null);
    // Before, the unreadable account read as "none": the claims were written but the old sessions lived on, with the
    // admin role in a token every device could keep refreshing.
    expect(claims("a1")).toEqual({ role: "learner" });
    expect(f.revoked).toEqual(["a1"]);
  });

  it("writeClaims ends the sessions on a demotion it can see, and not on a promotion or an unchanged role", async () => {
    account("a1", { role: "orgAdmin", orgId: "o1" });
    f.docs.set("orgs/o1", { name: "School", status: "active" });
    await writeClaims("a1", "teacher", "o1");
    expect(f.revoked).toEqual(["a1"]);
    await writeClaims("a1", "orgAdmin", "o1");
    await writeClaims("a1", "orgAdmin", "o1");
    expect(f.revoked).toEqual(["a1"]);
    expect(f.claimWrites.map((w) => w.claims.role)).toEqual(["teacher", "orgAdmin"]);
  });

  it("writeClaims for an account Auth doesn't have fails as before (nothing to write claims on)", async () => {
    await expect(writeClaims("gone", "learner", null)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(f.revoked).toEqual([]);
  });
});

describe("a suspended organization freezes its staff", () => {
  const until = Date.now() + 30 * DAY;
  const school = (status: string) => f.docs.set("orgs/o1", { name: "School", status, licence: { plan: "super_seat", seats: 10, until } });
  beforeEach(() => {
    school("suspended");
    for (const [uid, role] of [["t1", "teacher"], ["a1", "orgAdmin"], ["s1", "student"]] as const) {
      account(uid, { role, orgId: "o1" });
      f.docs.set(`users/${uid}`, { role, orgId: "o1", superSeat: uid === "t1" });
    }
  });

  it("a teacher and an admin get frozen: true and their sessions end once; a student gets neither", async () => {
    await refreshClaims("t1"); await refreshClaims("a1"); await refreshClaims("s1");
    // Nothing else changes: the teacher's seat still gives Super.
    expect(claims("t1")).toEqual({ role: "teacher", orgId: "o1", plan: "super_seat", planUntil: until, frozen: true });
    expect(claims("a1")).toEqual({ role: "orgAdmin", orgId: "o1", frozen: true });
    expect(claims("s1")).toEqual({ role: "student", orgId: "o1" });
    expect(f.revoked).toEqual(["t1", "a1"]);
    // Again while still suspended (a retried trigger, a later refresh): nothing is written, nobody is signed out again.
    const writes = f.claimWrites.length;
    await refreshClaims("t1"); await refreshClaims("a1");
    expect(f.claimWrites.length).toBe(writes);
    expect(f.revoked).toEqual(["t1", "a1"]);
  });

  it("an organization active again takes the claim away, without ending sessions", async () => {
    await refreshClaims("t1");
    expect(claims("t1")).toHaveProperty("frozen", true);
    school("active");
    await refreshClaims("t1");
    expect(claims("t1")).toEqual({ role: "teacher", orgId: "o1", plan: "super_seat", planUntil: until });
    expect(f.revoked).toEqual(["t1"]); // only the suspension ended them
    // Suspended a second time: frozen again, and the sessions end again.
    school("suspended");
    await refreshClaims("t1");
    expect(claims("t1")).toHaveProperty("frozen", true);
    expect(f.revoked).toEqual(["t1", "t1"]);
  });

  it("follows the role being written: a teacher made a student is not frozen, a student made a teacher is", async () => {
    await writeClaims("s1", "teacher", "o1");
    expect(claims("s1")).toEqual({ role: "teacher", orgId: "o1", frozen: true });
    await refreshClaims("t1");
    await writeClaims("t1", "student", "o1");
    expect(claims("t1")).not.toHaveProperty("frozen");
    // Someone who leaves the suspended organization is not frozen anywhere else.
    await refreshClaims("a1");
    await writeClaims("a1", "learner", null);
    expect(claims("a1")).toEqual({ role: "learner" });
  });

  it("only 'suspended' and 'deleting' freeze: pending, rejected or no status at all don't", async () => {
    for (const status of ["pending", "active", "rejected"]) { school(status); await refreshClaims("a1"); expect(claims("a1")).not.toHaveProperty("frozen"); }
    f.docs.set("orgs/o1", { name: "School" });
    await refreshClaims("a1");
    expect(claims("a1")).toEqual({ role: "orgAdmin", orgId: "o1" });
    expect(f.revoked).toEqual([]);
  });

  it("a suspended organization that is being deleted keeps its frozen staff frozen until they are released", async () => {
    await refreshClaims("t1"); await refreshClaims("a1");
    school("deleting");
    const writes = f.claimWrites.length;
    // Any refresh on the way (a payment, a seat, a retried trigger) must not hand the staff powers back.
    await refreshClaims("t1"); await refreshClaims("a1");
    expect(claims("t1")).toHaveProperty("frozen", true);
    expect(claims("a1")).toEqual({ role: "orgAdmin", orgId: "o1", frozen: true });
    expect(f.claimWrites.length).toBe(writes);
    expect(f.revoked).toEqual(["t1", "a1"]); // nobody signed out a second time
    // Released by deleteOrg (an independent learner): the claim goes with the role and the organization.
    await writeClaims("a1", "learner", null);
    expect(claims("a1")).toEqual({ role: "learner" });
  });

  it("being deleted freezes like being suspended: staff of an active organization that starts being deleted too", async () => {
    school("deleting");
    await refreshClaims("t1"); await refreshClaims("s1");
    expect(claims("t1")).toHaveProperty("frozen", true);
    expect(claims("s1")).toEqual({ role: "student", orgId: "o1" }); // students keep learning, as in a suspension
    expect(f.revoked).toEqual(["t1"]); // the sessions end once, as for a suspension
    // A frozen claim follows the organization, not the person: someone frozen in another one, moved into an active
    // organization, is not frozen there.
    school("active");
    account("a1", { role: "orgAdmin", orgId: "o9", frozen: true });
    await writeClaims("a1", "orgAdmin", "o1");
    expect(claims("a1")).toEqual({ role: "orgAdmin", orgId: "o1" });
  });

  // The rules read `frozen` from the profile as well (firestore.rules notStopped): the ID token in an open tab was
  // minted before the suspension, carries no `frozen` for up to an hour, and the profile is all that can stop it.
  it("mirrors frozen onto the profile before the claims, and takes it off again when the organization is active", async () => {
    await refreshClaims("t1"); await refreshClaims("a1"); await refreshClaims("s1");
    expect(f.docs.get("users/t1")).toMatchObject({ role: "teacher", orgId: "o1", frozen: true });
    expect(f.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: "o1", frozen: true });
    expect(f.docs.get("users/s1")).not.toHaveProperty("frozen"); // students keep learning
    // The profile first: a claims write that fails leaves the rules refusing, never the profile saying "not frozen".
    expect(f.log.indexOf("doc users/a1")).toBeGreaterThanOrEqual(0);
    expect(f.log.indexOf("doc users/a1")).toBeLessThan(f.log.indexOf("claims a1"));
    // Again while suspended: the profile already says so, and is not written again.
    const writes = f.profileWrites.filter((p) => p === "users/a1").length;
    await refreshClaims("a1");
    expect(f.profileWrites.filter((p) => p === "users/a1").length).toBe(writes);
    school("active");
    await refreshClaims("t1"); await refreshClaims("a1");
    expect(f.docs.get("users/t1")).not.toHaveProperty("frozen");
    expect(f.docs.get("users/a1")).not.toHaveProperty("frozen");
    expect(f.docs.get("users/a1")).toMatchObject({ role: "orgAdmin", orgId: "o1" });
  });

  it("the profile's frozen follows the role and the organization being written, like the claim", async () => {
    await writeClaims("s1", "teacher", "o1"); // a student made a teacher of a suspended organization
    expect(f.docs.get("users/s1")).toHaveProperty("frozen", true);
    await refreshClaims("t1");
    await writeClaims("t1", "student", "o1"); // a teacher made a student
    expect(f.docs.get("users/t1")).not.toHaveProperty("frozen");
    await refreshClaims("a1");
    await writeClaims("a1", "learner", null); // released, or left
    expect(f.docs.get("users/a1")).not.toHaveProperty("frozen");
    // Being deleted freezes the same way; an account with no profile gets none made for it.
    school("deleting");
    account("t2", { role: "teacher", orgId: "o1" });
    await refreshClaims("t2");
    expect(claims("t2")).toHaveProperty("frozen", true);
    expect(f.docs.has("users/t2")).toBe(false);
    f.docs.set("users/t3", { role: "teacher", orgId: "o1" }); account("t3", { role: "teacher", orgId: "o1" });
    await refreshClaims("t3");
    expect(f.docs.get("users/t3")).toHaveProperty("frozen", true);
  });

  it("sameClaims sees frozen, so the claim is written when it turns on or off and at no other time", () => {
    const plain = claimsFor("teacher", "o1", null), frozen = claimsFor("teacher", "o1", null, true);
    expect(frozen).toEqual({ role: "teacher", orgId: "o1", frozen: true });
    expect(plain).not.toHaveProperty("frozen");
    expect(sameClaims(plain, frozen)).toBe(false);
    expect(sameClaims(frozen, plain)).toBe(false);
    expect(sameClaims({ frozen: true, role: "teacher", orgId: "o1" }, frozen)).toBe(true);
  });
});
