// The audit log (src/admin.ts audit, src/audit.ts orgAudit), run against the real admin.ts with the Admin SDK itself
// faked (fakeAdminSdk.ts): entries carry the request's address and id, requests answered at once keep their own, a
// disabled staff account is refused, and an organization's admin reads only their own organization's entries.
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
const { logger } = await import("firebase-functions/v2");
const admin = await import("../src/admin");
const { orgAudit } = await import("../src/audit");
const { fake } = await import("./fakeAdminSdk");
const { db, auth } = fake;

type Req = { auth?: { uid: string; token: Record<string, unknown> }; data?: unknown; rawRequest?: unknown };
type Entry = Record<string, unknown> & { id: string; action: string; by: string; byName: string; at: number };
const run = (data: Record<string, unknown>, uid: string, role: string, orgId?: string) =>
  (orgAudit as unknown as { run: (r: Req) => Promise<{ entries: Entry[]; next: number | null }> }).run({ auth: { uid, token: { role, orgId } }, data });
const reason = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => e.details?.reason ?? e.code);
const from = (uid: string, role: string, ip: string, ua = "Vitest") => ({ auth: { uid, token: { role } }, rawRequest: { headers: { "fastly-client-ip": ip, "user-agent": ua }, ip: "10.0.0.1" } });
/** A request as the server starts one: from its own callback, never from the test's own async context. */
const request = <T>(fn: () => Promise<T>) => new Promise<T>((ok, fail) => setImmediate(() => fn().then(ok, fail)));
const gate = () => { let open!: () => void; const wait = new Promise<void>((r) => { open = r; }); return { open, wait }; };
/** What a callable does: who is calling (checked against Auth), some work, then the audit entry. */
const act = async (req: Req, label: string, wait?: Promise<void>, how: "caller" | "freshCaller" = "freshCaller") => {
  const c = await admin[how](req as never);
  await wait;
  await admin.audit("test", c.uid, { label });
};
const entry = (label: string) => db.all("audit").find((e) => (e as { label?: string }).label === label) as Record<string, unknown> | undefined;

beforeEach(() => {
  db.docs.clear(); auth.users.clear(); auth.reads.length = 0; auth.down = false; db.getAlls = 0;
  vi.mocked(logger.info).mockClear();
  auth.users.set("root", { uid: "root", customClaims: { role: "superadmin" } });
  auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
  auth.users.set("a2", { uid: "a2", customClaims: { role: "orgAdmin", orgId: "o2" } });
  auth.users.set("t1", { uid: "t1", customClaims: { role: "teacher", orgId: "o1" } });
  db.docs.set("users/a1", { name: "Amal Admin", orgId: "o1" });
  db.docs.set("users/root", { name: "Root" });
});

describe("an audit entry's request", () => {
  it("has the caller's address and a request id; the log line has the id and never the details", async () => {
    await request(() => act(from("root", "superadmin", "203.0.113.9"), "one"));
    const e = entry("one")!;
    expect(e).toMatchObject({ action: "test", by: "root", label: "one", ip: "203.0.113.9" });
    expect(e.rid).toMatch(/^[0-9a-f]{8}$/);
    expect(e.at).toBeInstanceOf(Timestamp);
    expect(vi.mocked(logger.info).mock.calls).toEqual([["audit", { action: "test", by: "root", orgId: null, rid: e.rid }]]);
  });

  it("puts a caller's orgId in the log line, as it is in the entry", async () => {
    await request(async () => { const c = await admin.freshCaller(from("a1", "orgAdmin", "198.51.100.7") as never); await admin.audit("removeMember", c.uid, { orgId: c.orgId, uid: "s1", name: "A student" }); });
    expect(db.all("audit")[0]).toMatchObject({ orgId: "o1", uid: "s1", ip: "198.51.100.7" });
    expect(vi.mocked(logger.info).mock.calls[0][1]).toEqual({ action: "removeMember", by: "a1", orgId: "o1", rid: expect.stringMatching(/^[0-9a-f]{8}$/) });
  });

  it("is absent outside a request (triggers, schedules, scripts), also right after one", async () => {
    await request(() => act(from("root", "superadmin", "203.0.113.9"), "in"));
    await admin.audit("statsJob", "system", { label: "out" });
    expect(entry("in")).toHaveProperty("rid");
    expect(entry("out")).toEqual({ id: expect.any(String), action: "statsJob", by: "system", label: "out", at: expect.any(Timestamp) });
  });

  it("is kept apart for two requests answered at once", async () => {
    const a = gate(), b = gate();
    const first = request(() => act(from("root", "superadmin", "203.0.113.1"), "a", a.wait));
    const second = request(() => act(from("a1", "orgAdmin", "203.0.113.2"), "b", b.wait));
    // Both are past their Auth check and waiting; the second finishes first.
    await new Promise((r) => setTimeout(r, 5));
    b.open(); await second;
    a.open(); await first;
    expect(entry("a")).toMatchObject({ by: "root", ip: "203.0.113.1" });
    expect(entry("b")).toMatchObject({ by: "a1", ip: "203.0.113.2" });
    expect(entry("a")!.rid).not.toBe(entry("b")!.rid);
  });

  it("is kept apart even when two handlers start in the same turn, with or without the Auth check", async () => {
    for (const how of ["caller", "freshCaller"] as const) {
      const a = gate(), b = gate();
      await request(async () => {
        const first = act(from("root", "superadmin", "203.0.113.1"), `a-${how}`, a.wait, how), second = act(from("a1", "orgAdmin", "203.0.113.2"), `b-${how}`, b.wait, how);
        b.open(); a.open();
        await Promise.all([first, second]);
      });
      expect(entry(`a-${how}`)).toMatchObject({ by: "root", ip: "203.0.113.1" });
      expect(entry(`b-${how}`)).toMatchObject({ by: "a1", ip: "203.0.113.2" });
    }
  });

  it("keeps one id for a request, however often its handler asks who is calling", async () => {
    await request(async () => {
      const req = from("root", "superadmin", "203.0.113.9", "U".repeat(500));
      admin.caller(req as never);
      const rid = admin.requestContext()!.rid;
      await admin.requireSuper(req as never);
      expect(admin.requestContext()).toEqual({ ip: "203.0.113.9", ua: "U".repeat(200), rid });
    });
  });

  it("works for a request with nothing but who is calling (the other tests' bare requests)", async () => {
    await request(() => act({ auth: { uid: "root", token: { role: "superadmin" } } }, "bare"));
    expect(entry("bare")).toMatchObject({ by: "root", ip: "?" });
    await expect(request(async () => admin.caller({} as never))).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("takes the visitor's address from Cloudflare's header only behind Cloudflare, and the last forwarded hop without Hosting", async () => {
    await request(() => act({ auth: { uid: "root", token: {} }, rawRequest: { headers: { "fastly-client-ip": "172.64.1.1", "cf-connecting-ip": "203.0.113.50" } } }, "cf"));
    await request(() => act({ auth: { uid: "root", token: {} }, rawRequest: { headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.60" } } }, "direct"));
    expect(entry("cf")!.ip).toBe("203.0.113.50");
    expect(entry("direct")!.ip).toBe("203.0.113.60");
  });
});

describe("freshCaller", () => {
  it("refuses a disabled staff account, whatever its token still says", async () => {
    auth.users.set("a1", { uid: "a1", disabled: true, customClaims: { role: "orgAdmin", orgId: "o1" } });
    const p = admin.freshCaller(from("a1", "orgAdmin", "203.0.113.9") as never);
    await expect(p).rejects.toMatchObject({ code: "permission-denied", details: { reason: "disabled" } });
    await expect(admin.requireSuper({ auth: { uid: "a1", token: { role: "superadmin" } } } as never)).rejects.toMatchObject({ details: { reason: "disabled" } });
  });

  it("keeps its other answers: claims from Auth, an Auth error reads as a learner, a learner's token is not looked up", async () => {
    expect(await admin.freshCaller({ auth: { uid: "a1", token: { role: "superadmin" } } } as never)).toEqual({ uid: "a1", role: "orgAdmin", orgId: "o1" });
    auth.down = true;
    expect(await admin.freshCaller({ auth: { uid: "a1", token: { role: "orgAdmin", orgId: "o1" } } } as never)).toEqual({ uid: "a1", role: "learner", orgId: undefined });
    auth.reads.length = 0;
    expect(await admin.freshCaller({ auth: { uid: "s9", token: { role: "student", orgId: "o1" } } } as never)).toEqual({ uid: "s9", role: "student", orgId: "o1" });
    expect(auth.reads).toEqual([]);
  });
});

describe("orgAudit", () => {
  const T0 = 1_780_000_000; // seconds
  const at = (ms: number, micros = 0) => new Timestamp(T0 + Math.floor(ms / 1000), (ms % 1000) * 1e6 + micros * 1000);
  const put = (id: string, data: Record<string, unknown>) => db.docs.set(`audit/${id}`, data);
  beforeEach(() => {
    put("e1", { action: "createMembers", by: "a1", orgId: "o1", count: 3, ip: "203.0.113.1", rid: "aaaaaaaa", at: at(1000) });
    put("e2", { action: "setMemberRole", by: "a1", orgId: "o1", uid: "t1", role: "teacher", ip: "203.0.113.1", rid: "bbbbbbbb", at: at(2000) });
    put("e3", { action: "removeMember", by: "root", orgId: "o1", uid: "s1", ip: "203.0.113.2", rid: "cccccccc", at: at(3000) });
    // Two in the same millisecond, 200 microseconds apart.
    put("e4", { action: "setMemberRole", by: "t1", orgId: "o1", uid: "s2", ip: "203.0.113.3", rid: "dddddddd", at: at(4000, 200) });
    put("e5", { action: "resetPassword", by: "a1", orgId: "o1", uid: "s2", ip: "203.0.113.1", rid: "eeeeeeee", at: at(4000, 400) });
    put("x1", { action: "removeMember", by: "a2", orgId: "o2", uid: "z1", ip: "203.0.113.9", at: at(5000) });
    put("x2", { action: "setUserRole", by: "root", uid: "s1", at: at(6000) }); // written before orgId was passed
  });

  it("is for the organization's own admins and platform admins only", async () => {
    expect(await reason(run({ orgId: "o1" }, "a2", "orgAdmin", "o2"))).toBe("not-org-admin");
    expect(await reason(run({ orgId: "o1" }, "t1", "teacher", "o1"))).toBe("not-org-admin");
    expect(await reason(run({ orgId: "o1" }, "s1", "student", "o1"))).toBe("not-org-admin");
    // A token that still says "admin of o1" after the person was moved to o2.
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o2" } });
    expect(await reason(run({ orgId: "o1" }, "a1", "orgAdmin", "o1"))).toBe("not-org-admin");
    expect(await reason(run({}, "root", "superadmin"))).toBe("no-org");
    expect(await reason((orgAudit as unknown as { run: (r: Req) => Promise<unknown> }).run({ data: { orgId: "o1" } }))).toBe("unauthenticated");
  });

  // A suspended organization's admin keeps the role in their claims (frozen): the role and the organization alone
  // went on showing them the log, who reported what included.
  it("is closed to the organization's own admins while it is suspended or being deleted, and open to platform admins", async () => {
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1", frozen: true } });
    db.docs.set("orgs/o1", { name: "School", status: "suspended" });
    expect(await reason(run({ orgId: "o1" }, "a1", "orgAdmin", "o1"))).toBe("org-suspended");
    db.docs.set("orgs/o1", { name: "School", status: "deleting" });
    expect(await reason(run({ orgId: "o1" }, "a1", "orgAdmin", "o1"))).toBe("org-deleting");
    expect((await run({ orgId: "o1" }, "root", "superadmin")).entries).toHaveLength(5);
    // Active again (or never given a status): its admins read it as before.
    auth.users.set("a1", { uid: "a1", customClaims: { role: "orgAdmin", orgId: "o1" } });
    db.docs.set("orgs/o1", { name: "School", status: "active" });
    expect((await run({ orgId: "o1" }, "a1", "orgAdmin", "o1")).entries).toHaveLength(5);
    // Another organization's suspension closes nothing here.
    db.docs.set("orgs/o1", { name: "School", status: "suspended" });
    expect((await run({ orgId: "o2" }, "a2", "orgAdmin", "o2")).entries.map((e) => e.id)).toEqual(["x1"]);
  });

  it("returns only that organization's entries, newest first, with who acted by name, and writes nothing", async () => {
    const before = db.docs.size;
    const { entries, next } = await run({ orgId: "o1" }, "a1", "orgAdmin", "o1");
    expect(entries.map((e) => e.id)).toEqual(["e5", "e4", "e3", "e2", "e1"]);
    expect(next).toBeNull();
    expect(entries[0]).toMatchObject({ action: "resetPassword", by: "a1", byName: "Amal Admin", uid: "s2", orgId: "o1", rid: "eeeeeeee", at: (T0 + 4) * 1000 });
    expect(entries.map((e) => e.byName)).toEqual(["Amal Admin", "", "Root", "Amal Admin", "Amal Admin"]);
    expect(db.getAlls).toBe(1);
    expect(db.docs.size).toBe(before);
  });

  it("hides the address from an organization's admin and shows it to a platform admin", async () => {
    const own = await run({ orgId: "o1" }, "a1", "orgAdmin", "o1");
    expect(own.entries.every((e) => !("ip" in e) && typeof e.rid === "string")).toBe(true);
    const platform = await run({ orgId: "o1" }, "root", "superadmin");
    expect(platform.entries.map((e) => e.ip)).toEqual(["203.0.113.1", "203.0.113.3", "203.0.113.2", "203.0.113.1", "203.0.113.1"]);
  });

  // account.ts wipe counts what it removed into the entry. How many payments, problem reports, tutor conversations and
  // devices a member had is theirs and the platform's (exportAccountData gives an organization's admin none of it).
  it("hides a deleted account's payments, problem reports, tutor sessions and devices from an organization's admin", async () => {
    put("e6", { action: "deleteAccount", by: "u9", orgId: "o1", uid: "u9", self: true, role: "teacher", devices: 2, files: 3, leftoversChecked: true, projects: 1, reports: 2, requests: 1, payments: 3, released: 0, sessions: 41, sessionsFailed: true, sessionsQueued: true, ssoIdentities: 1, unlisted: 2, ip: "203.0.113.4", at: at(6000) });
    const own = (await run({ orgId: "o1", action: "deleteAccount" }, "a1", "orgAdmin", "o1")).entries;
    expect(own).toHaveLength(1);
    // What is the organization's own stays: who, their role, their files and projects, the pupils handed on.
    expect(own[0]).toMatchObject({ id: "e6", action: "deleteAccount", uid: "u9", self: true, role: "teacher", orgId: "o1", files: 3, leftoversChecked: true, projects: 1, released: 0 });
    for (const key of ["payments", "reports", "sessions", "sessionsFailed", "sessionsQueued", "devices", "requests", "ssoIdentities", "unlisted", "ip"]) expect(own[0], key).not.toHaveProperty(key);
    const platform = (await run({ orgId: "o1", action: "deleteAccount" }, "root", "superadmin")).entries;
    expect(platform[0]).toMatchObject({ payments: 3, reports: 2, sessions: 41, sessionsFailed: true, sessionsQueued: true, devices: 2, requests: 1, ssoIdentities: 1, unlisted: 2, files: 3, ip: "203.0.113.4" });
    // Nothing stored changed, and other actions keep their own fields of the same names.
    expect(db.docs.get("audit/e6")).toMatchObject({ payments: 3, sessions: 41 });
    put("e7", { action: "fillSeats", by: "a1", orgId: "o1", devices: 5, at: at(7000) });
    put("e8", { action: "constructor", by: "a1", orgId: "o1", payments: 1, at: at(8000) });
    const rest = (await run({ orgId: "o1" }, "a1", "orgAdmin", "o1")).entries;
    expect(rest.find((e) => e.id === "e7")).toMatchObject({ devices: 5 });
    expect(rest.find((e) => e.id === "e8")).toMatchObject({ payments: 1 });
  });

  it("pages with next, without skipping or repeating entries of the same millisecond", async () => {
    const seen: string[] = [];
    let before: number | undefined, calls = 0;
    do {
      const page = await run({ orgId: "o1", limit: 2, ...(before ? { before } : {}) }, "a1", "orgAdmin", "o1");
      seen.push(...page.entries.map((e) => e.id));
      before = page.next ?? undefined; calls++;
    } while (before && calls < 10);
    expect(seen).toEqual(["e5", "e4", "e3", "e2", "e1"]);
    expect(calls).toBe(3);
    // A date the admin picked (whole milliseconds) works as a cursor too.
    expect((await run({ orgId: "o1", before: (T0 + 3) * 1000 }, "a1", "orgAdmin", "o1")).entries.map((e) => e.id)).toEqual(["e2", "e1"]);
    // A cursor that is no date at all (past the year 9999, negative, not a number) reads from the top; it never fails.
    for (const junk of [8.6e15, 2.6e14, -5, "soon", Infinity]) expect((await run({ orgId: "o1", before: junk }, "a1", "orgAdmin", "o1")).entries).toHaveLength(5);
  });

  it("filters by action, and by person (who acted or whom it was for)", async () => {
    expect((await run({ orgId: "o1", action: "setMemberRole" }, "a1", "orgAdmin", "o1")).entries.map((e) => e.id)).toEqual(["e4", "e2"]);
    expect((await run({ orgId: "o1", uid: "t1" }, "a1", "orgAdmin", "o1")).entries.map((e) => e.id)).toEqual(["e4", "e2"]);
    expect((await run({ orgId: "o1", uid: "s2", action: "resetPassword" }, "a1", "orgAdmin", "o1")).entries.map((e) => e.id)).toEqual(["e5"]);
    expect(await run({ orgId: "o1", action: "nothing" }, "a1", "orgAdmin", "o1")).toEqual({ entries: [], next: null });
  });

  it("keeps the limit between 1 and 100 (50 when none is given) and sends nested times as milliseconds", async () => {
    for (let i = 0; i < 120; i++) put(`n${String(i).padStart(3, "0")}`, { action: "bulk", by: "a1", orgId: "o1", at: at(10_000 + i) });
    put("nested", { action: "licence", by: "root", orgId: "o1", until: at(99_000), was: { until: at(98_000) }, at: at(20_000) });
    expect((await run({ orgId: "o1" }, "a1", "orgAdmin", "o1")).entries).toHaveLength(50);
    expect((await run({ orgId: "o1", limit: 1000 }, "a1", "orgAdmin", "o1")).entries).toHaveLength(100);
    const one = await run({ orgId: "o1", limit: 0 }, "a1", "orgAdmin", "o1");
    expect(one.entries).toHaveLength(1);
    expect(one.entries[0]).toMatchObject({ id: "nested", until: (T0 + 99) * 1000, was: { until: (T0 + 98) * 1000 } });
    expect(one.next).not.toBeNull();
  });

  it("stops a long scan at its cap and goes on from there on the next call", async () => {
    // 520 newer entries of another kind sit before the one the filter wants.
    for (let i = 0; i < 520; i++) put(`m${String(i).padStart(3, "0")}`, { action: "bulk", by: "a1", orgId: "o1", at: at(50_000 + i) });
    const first = await run({ orgId: "o1", action: "removeMember" }, "a1", "orgAdmin", "o1");
    expect(first.entries).toEqual([]);
    expect(first.next).not.toBeNull();
    const second = await run({ orgId: "o1", action: "removeMember", before: first.next }, "a1", "orgAdmin", "o1");
    expect(second.entries.map((e) => e.id)).toEqual(["e3"]);
    expect(second.next).toBeNull();
  });
});
