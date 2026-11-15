// Course access (src/access.ts), against the real admin.ts with the Admin SDK faked (fakeAdminSdk.ts): only platform
// admins grant and revoke, both are in the audit log, and a grant reads the results of the organizations it names
// and no others.
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

const { Timestamp } = await import("firebase-admin/firestore");
const access = await import("../src/access");
const { fake } = await import("./fakeAdminSdk");
const { db, auth } = fake;

type Req = { auth?: { uid: string; token: Record<string, unknown> }; data?: unknown };
type Row = { uid: string; lessonId: string; accuracy: number; completedAt: string | null };
type Work = Record<string, unknown> & { id: string; uid: string; final: boolean; createdAt: { seconds: number } | null };
type Out = { results: Row[]; work: Work[]; more: boolean };
const call = <T = { ok: true }>(fn: unknown, data: Record<string, unknown>, uid = "root", token: Record<string, unknown> = { role: "superadmin" }) =>
  (fn as { run: (r: Req) => Promise<T> }).run({ auth: { uid, token }, data });
const results = (unitId: string, uid: string, token: Record<string, unknown> = {}) => call<Out>(access.courseResults, { unitId }, uid, token);
const reason = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => e.details?.reason ?? e.code);
const audits = () => db.all("audit") as Record<string, unknown>[];
const owners = (rows: { uid: string }[]) => [...new Set(rows.map((r) => r.uid))].sort();
const DAY = 864e5;

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); auth.reads.length = 0; auth.down = false;
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
  // The university teachers: one in o1, one in no organization.
  auth.users.set("prof", { uid: "prof", email: "prof@uni.example", displayName: "Auth Name", customClaims: { role: "teacher", orgId: "o1" } });
  auth.users.set("free", { uid: "free", email: "free@mail.example", displayName: "Free Lancer" });
  db.docs.set("users/prof", { name: "Dr Mona", email: "old@uni.example", orgId: "o1", role: "teacher", teach: "university" });
  db.docs.set("orgs/o1", { name: "Nile University" });
  db.docs.set("orgs/o2", { name: "Delta University" });
  // Students: two in o1, one in o2, one in no organization, and the leftovers of a deleted account.
  db.docs.set("users/s1", { name: "S One", orgId: "o1" });
  db.docs.set("users/s2", { name: "S Two", orgId: "o1" });
  db.docs.set("users/s3", { name: "S Three", orgId: "o2" });
  db.docs.set("users/s4", { name: "S Four", orgId: null });
  for (const [uid, acc] of [["s1", 0.9], ["s2", 0.7], ["s3", 0.6], ["s4", 0.5], ["gone", 0.4]] as const) {
    db.docs.set(`users/${uid}/progress/ai-u1-1`, { lessonId: "ai-u1-1", unitId: "ai-u1", track: "ai", accuracy: acc, xp: 40, seconds: 300, completedAt: "2026-10-30T10:00:00.000Z" });
  }
  db.docs.set("users/s1/progress/cyber-u1-1", { lessonId: "cyber-u1-1", unitId: "cyber-u1", accuracy: 1, completedAt: "2026-10-31T10:00:00.000Z" });
  db.docs.set("users/s1/submissions/w1", { lessonId: "ai-u1-4", unitId: "ai-u1", stepId: "p1", orgId: "o1", text: "My project", name: "S One", fileUrl: null, fileName: null, status: "approved", feedback: "Good", reviewedBy: "t9", createdAt: new Timestamp(1_780_000_100, 5e8) });
  db.docs.set("users/s2/submissions/w2", { lessonId: "ai-u1-4", unitId: "ai-u1", text: "Final", final: true, explain: "How I did it", aiUse: "none", name: "S Two", files: [{ url: "https://firebasestorage.googleapis.com/x", name: "a.pdf" }], status: "submitted", createdAt: new Timestamp(1_780_000_050, 0) });
  db.docs.set("users/s2/submissions/w3", { lessonId: "ai-u1-2", unitId: "ai-u1", text: "Newest", name: "S Two", status: "submitted", createdAt: new Timestamp(1_780_000_200, 0) });
  db.docs.set("users/s3/submissions/w4", { lessonId: "ai-u1-4", unitId: "ai-u1", orgId: "o2", text: "From o2", capstone: true, repo: "https://github.com/x/y", links: [], checks: [{ id: "readme", ok: true }], aiReview: { status: "done", scores: [], usd: 0.004 }, name: "S Three", status: "submitted", createdAt: new Timestamp(1_780_000_300, 0) });
  db.docs.set("users/s4/submissions/w5", { lessonId: "ai-u1-4", unitId: "ai-u1", text: "Independent", name: "S Four", status: "submitted", createdAt: new Timestamp(1_780_000_400, 0) });
});

describe("granting and revoking", () => {
  it("is for platform admins only, checked against Auth, and a refusal writes nothing", async () => {
    expect(await reason(call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"] }, "a1", { role: "orgAdmin", orgId: "o1" }))).toBe("not-super");
    // A token that still claims the role after it was taken away.
    expect(await reason(call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"] }, "a1", { role: "superadmin" }))).toBe("not-super");
    expect(await reason(call(access.revokeCourseAccess, { uid: "prof" }, "prof", { role: "teacher", orgId: "o1" }))).toBe("not-super");
    expect(await reason((access.grantCourseAccess as unknown as { run: (r: Req) => Promise<unknown> }).run({ data: { uid: "prof", units: ["ai-u1"] } }))).toBe("unauthenticated");
    expect(db.docs.has("courseAccess/prof")).toBe(false);
    expect(audits()).toEqual([]);
  });

  it("stores the grant with the person's name and email, and leaves an audit entry", async () => {
    const until = Date.now() + 90 * DAY;
    expect(await call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1", "cyber-u1", "ai-u1"], orgs: ["o1", "none"], until })).toEqual({ ok: true, orgs: ["o1", "none"] });
    expect(db.docs.get("courseAccess/prof")).toEqual({ units: ["ai-u1", "cyber-u1"], orgs: ["o1", "none"], until, name: "Dr Mona", email: "prof@uni.example", grantedBy: "root", updatedAt: expect.any(Timestamp) });
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({ action: "grantCourseAccess", by: "root", uid: "prof", units: ["ai-u1", "cyber-u1"], orgs: ["o1", "none"], until });
  });

  it("names an account with no profile yet from Auth, and a new grant replaces the old one whole", async () => {
    await call(access.grantCourseAccess, { uid: "free", units: ["ai-u1"], orgs: ["o2"], until: Date.now() + DAY });
    expect(db.docs.get("courseAccess/free")).toMatchObject({ name: "Free Lancer", email: "free@mail.example", orgs: ["o2"] });
    // No organization named: the person's own is stored as it is now ("none" for someone in no organization).
    expect(await call(access.grantCourseAccess, { uid: "free", units: ["iot-u1"] })).toEqual({ ok: true, orgs: ["none"] });
    expect(db.docs.get("courseAccess/free")).toMatchObject({ units: ["iot-u1"], orgs: ["none"], until: null });
    expect(audits()[1]).toMatchObject({ action: "grantCourseAccess", uid: "free", units: ["iot-u1"], orgs: ["none"], own: true, until: null });
  });

  it("pins a grant that names no organization to the teacher's organization at that moment, from Auth and not the profile", async () => {
    db.docs.set("users/prof", { name: "Dr Mona", orgId: "o2", role: "teacher" }); // a profile that lags behind Auth
    expect(await call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"] })).toEqual({ ok: true, orgs: ["o1"] });
    expect(db.docs.get("courseAccess/prof")).toMatchObject({ units: ["ai-u1"], orgs: ["o1"] });
    expect(audits()[0]).toMatchObject({ action: "grantCourseAccess", uid: "prof", orgs: ["o1"], own: true });
    // Named organizations are stored as named, and the entry does not call them the teacher's own.
    await call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"], orgs: ["o2"] });
    expect(db.docs.get("courseAccess/prof")).toMatchObject({ orgs: ["o2"] });
    expect(audits()[1]).not.toHaveProperty("own");
  });

  it("refuses bad courses, organizations, end dates and accounts, each with its reason", async () => {
    const grant = (d: Record<string, unknown>) => reason(call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"], ...d }));
    for (const units of [undefined, "ai-u1", [], ["Ai-U1"], ["a"], ["ai u1"], ["ai-u1", 7], ["../x"], Array.from({ length: 51 }, (_, i) => `ai-${i}`)]) expect(await grant({ units })).toBe("bad-units");
    for (const orgs of ["o1", [], ["o1", ""], ["a/b"], [3], ["nope"], Array.from({ length: 21 }, () => "o1")]) expect(await grant({ orgs })).toBe("bad-orgs");
    for (const until of [Date.now() - 1, 1_800_000_000, "soon", Date.now() + 11 * 365 * DAY, 1.5]) expect(await grant({ until })).toBe("bad-until");
    expect(await grant({ uid: "nobody" })).toBe("no-account");
    expect(await grant({ uid: "" })).toBe("no-account");
    expect(await grant({ units: Array.from({ length: 50 }, (_, i) => `ai-${i}`), orgs: ["o1", "o2", "none"], until: null })).toBeNull();
    expect(audits()).toHaveLength(1);
  });

  it("revokes, and the audit entry keeps what the person had", async () => {
    db.docs.set("courseAccess/prof", { units: ["ai-u1", "cyber-u1"], orgs: ["o1"], name: "Dr Mona", email: "", grantedBy: "root" });
    expect(await call(access.revokeCourseAccess, { uid: "prof" })).toEqual({ ok: true });
    expect(db.docs.has("courseAccess/prof")).toBe(false);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({ action: "revokeCourseAccess", by: "root", uid: "prof", units: ["ai-u1", "cyber-u1"] });
    expect(await reason(results("ai-u1", "prof", { role: "teacher", orgId: "o1" }))).toBe("no-grant");
  });
});

describe("courseResults", () => {
  const prof = { role: "teacher", orgId: "o1" };
  const grant = (uid: string, g: Record<string, unknown>) => db.docs.set(`courseAccess/${uid}`, { name: "", email: "", grantedBy: "root", ...g });

  it("refuses without a grant, after the grant ended, and for a course it does not list", async () => {
    expect(await reason(results("ai-u1", "prof", prof))).toBe("no-grant");
    grant("prof", { units: ["ai-u1"], orgs: ["o1"], until: Date.now() - 1000 });
    expect(await reason(results("ai-u1", "prof", prof))).toBe("no-grant");
    grant("prof", { units: ["ai-u1"], orgs: ["o1"], until: Date.now() + DAY });
    expect(await reason(results("cyber-u1", "prof", prof))).toBe("no-grant");
    expect(await reason(results("", "prof", prof))).toBe("no-grant");
    expect(await reason((access.courseResults as unknown as { run: (r: Req) => Promise<unknown> }).run({ data: { unitId: "ai-u1" } }))).toBe("unauthenticated");
    expect((await results("ai-u1", "prof", prof)).results).not.toHaveLength(0);
  });

  it("returns only the named organization's rows", async () => {
    grant("prof", { units: ["ai-u1"], orgs: ["o2"] });
    const out = await results("ai-u1", "prof", prof);
    expect(owners(out.results)).toEqual(["s3"]);
    expect(out.work.map((w) => w.id)).toEqual(["w4"]);
    expect(out.more).toBe(false);
    grant("prof", { units: ["ai-u1"], orgs: ["o1"] });
    const own = await results("ai-u1", "prof", prof);
    expect(own.results).toEqual([
      { uid: "s1", lessonId: "ai-u1-1", accuracy: 0.9, completedAt: "2026-10-30T10:00:00.000Z" },
      { uid: "s2", lessonId: "ai-u1-1", accuracy: 0.7, completedAt: "2026-10-30T10:00:00.000Z" },
    ]);
    expect(owners(own.work)).toEqual(["s1", "s2"]);
  });

  it("returns only people in no organization for 'none', and both for a grant that names both", async () => {
    grant("prof", { units: ["ai-u1"], orgs: ["none"] });
    const out = await results("ai-u1", "prof", prof);
    expect(owners(out.results)).toEqual(["s4"]);
    expect(out.work.map((w) => w.id)).toEqual(["w5"]);
    grant("prof", { units: ["ai-u1"], orgs: ["none", "o2"] });
    expect(owners((await results("ai-u1", "prof", prof)).results)).toEqual(["s3", "s4"]);
  });

  it("reads the organization pinned when the grant was made, whatever the teacher does afterwards", async () => {
    await call(access.grantCourseAccess, { uid: "prof", units: ["ai-u1"] });
    expect(owners((await results("ai-u1", "prof", prof)).results)).toEqual(["s1", "s2"]);
    // They leave (or are removed): the grant does not turn into "everyone in no organization".
    auth.users.set("prof", { uid: "prof", customClaims: { role: "learner" } });
    db.docs.set("users/prof", { name: "Dr Mona", orgId: null, role: "learner" });
    for (const token of [prof, { role: "learner" }]) {
      const out = await results("ai-u1", "prof", token);
      expect(owners(out.results)).toEqual(["s1", "s2"]);
      expect(owners(out.work)).toEqual(["s1", "s2"]);
    }
    // They join another school with its student code: its students stay closed to them.
    auth.users.set("prof", { uid: "prof", customClaims: { role: "student", orgId: "o2" } });
    db.docs.set("users/prof", { name: "Dr Mona", orgId: "o2", role: "student" });
    const out = await results("ai-u1", "prof", { role: "student", orgId: "o2" });
    expect(owners(out.results)).toEqual(["s1", "s2"]);
    expect(out.work.some((w) => w.uid === "s3" || w.uid === "s4")).toBe(false);
    // Auth can't be read: nothing about the scope depended on it.
    auth.down = true;
    expect(owners((await results("ai-u1", "prof", { role: "student", orgId: "o2" })).results)).toEqual(["s1", "s2"]);
  });

  it("a teacher in no organization is pinned to 'none', and joining a school later opens none of its students", async () => {
    await call(access.grantCourseAccess, { uid: "free", units: ["ai-u1"] });
    expect(owners((await results("ai-u1", "free", { role: "learner" })).results)).toEqual(["s4"]);
    auth.users.set("free", { uid: "free", customClaims: { role: "student", orgId: "o2" } });
    const out = await results("ai-u1", "free", { role: "student", orgId: "o2" });
    expect(owners(out.results)).toEqual(["s4"]);
    expect(owners(out.work)).toEqual(["s4"]);
  });

  it("a grant stored without organizations (made before they were pinned) reads nothing, wherever the teacher is now", async () => {
    grant("prof", { units: ["ai-u1"] });
    expect(await reason(results("ai-u1", "prof", prof))).toBe("no-grant");
    grant("prof", { units: ["ai-u1"], orgs: [] });
    expect(await reason(results("ai-u1", "prof", prof))).toBe("no-grant");
    grant("prof", { units: ["ai-u1"], orgs: [7, "", "a/b"] });
    expect(await reason(results("ai-u1", "prof", prof))).toBe("no-grant");
    grant("free", { units: ["ai-u1"] });
    expect(await reason(results("ai-u1", "free", { role: "learner" }))).toBe("no-grant");
    auth.users.set("free", { uid: "free", customClaims: { role: "student", orgId: "o2" } });
    expect(await reason(results("ai-u1", "free", { role: "student", orgId: "o2" }))).toBe("no-grant");
  });

  it("refuses a disabled account whose token is still alive, with or without a staff role, whatever the grant names", async () => {
    grant("free", { units: ["ai-u1"], orgs: ["o1"] });
    auth.users.set("free", { uid: "free", disabled: true });
    expect(await reason(results("ai-u1", "free", { role: "learner" }))).toBe("disabled");
    grant("free", { units: ["ai-u1"], orgs: ["none"] });
    expect(await reason(results("ai-u1", "free", {}))).toBe("disabled");
    grant("prof", { units: ["ai-u1"], orgs: ["o1"] });
    auth.users.set("prof", { uid: "prof", disabled: true, customClaims: { role: "teacher", orgId: "o1" } });
    expect(await reason(results("ai-u1", "prof", prof))).toBe("disabled");
    // Auth can't be read: the grant still reads its organizations.
    auth.users.set("free", { uid: "free" });
    grant("free", { units: ["ai-u1"], orgs: ["o1"] });
    auth.down = true;
    expect(owners((await results("ai-u1", "free", { role: "learner" })).results)).toEqual(["s1", "s2"]);
  });

  it("shows a platform admin every organization's rows, with no grant", async () => {
    const out = await results("ai-u1", "root", { role: "superadmin" });
    expect(owners(out.results)).toEqual(["gone", "s1", "s2", "s3", "s4"]);
    expect(out.work.map((w) => w.id).sort()).toEqual(["w1", "w2", "w3", "w4", "w5"]);
    expect(await reason(results("", "root", { role: "superadmin" }))).toBe("bad-unit");
    // A token that only claims the role gets nothing.
    expect(await reason(results("ai-u1", "a1", { role: "superadmin" }))).toBe("no-grant");
  });

  it("sends work with the fields the screen reads: final projects first then the newest, createdAt as {seconds}, no review", async () => {
    grant("prof", { units: ["ai-u1"], orgs: ["o1", "o2"] });
    const { work } = await results("ai-u1", "prof", prof);
    expect(work.map((w) => w.id)).toEqual(["w2", "w4", "w3", "w1"]);
    expect(work[0]).toEqual({
      id: "w2", uid: "s2", lessonId: "ai-u1-4", stepId: null, text: "Final", final: true, explain: "How I did it", aiUse: "none", name: "S Two",
      fileUrl: null, fileName: null, files: [{ url: "https://firebasestorage.googleapis.com/x", name: "a.pdf" }], createdAt: { seconds: 1_780_000_050 },
    });
    expect(work[3]).toMatchObject({ id: "w1", stepId: "p1", final: false, createdAt: { seconds: 1_780_000_100 } });
    for (const w of work) for (const k of ["status", "feedback", "reviewedBy", "orgId", "unitId", "queue"]) expect(w).not.toHaveProperty(k);
    // A capstone milestone keeps what its card shows, without what the AI review cost.
    expect(work[1]).toMatchObject({ id: "w4", capstone: true, repo: "https://github.com/x/y", checks: [{ id: "readme", ok: true }], aiReview: { status: "done", scores: [] } });
    expect(work[1].aiReview).not.toHaveProperty("usd");
  });

  it("leaves no audit entry for a read, and ignores documents of the same name outside a user's own", async () => {
    grant("prof", { units: ["ai-u1"], orgs: ["o1"] });
    db.docs.set("orgs/o1/progress/x", { unitId: "ai-u1", accuracy: 1 });
    const out = await results("ai-u1", "prof", prof);
    expect(out.results).toHaveLength(2);
    expect(audits()).toEqual([]);
  });

  it("finds a small organization's rows behind a busy course's first 2,000, and says when it stopped early", async () => {
    for (let i = 0; i < 2100; i++) {
      const uid = `b${String(i).padStart(4, "0")}`;
      db.docs.set(`users/${uid}`, { orgId: "o9" });
      db.docs.set(`users/${uid}/progress/ai-u1-1`, { lessonId: "ai-u1-1", unitId: "ai-u1", accuracy: 0.5, completedAt: "2026-10-30T10:00:00.000Z" });
    }
    grant("prof", { units: ["ai-u1"], orgs: ["o1"] });
    const own = await results("ai-u1", "prof", prof);
    expect(owners(own.results)).toEqual(["s1", "s2"]);
    expect(own.more).toBe(false);
    grant("prof", { units: ["ai-u1"], orgs: ["o9"] });
    const busy = await results("ai-u1", "prof", prof);
    expect(busy.results).toHaveLength(2000);
    expect(busy.more).toBe(true);
    const all = await results("ai-u1", "root", { role: "superadmin" });
    expect(all.results).toHaveLength(2000);
    expect(all.more).toBe(true);
  });
});
