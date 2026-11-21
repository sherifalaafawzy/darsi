// Retention (retention.ts; TECHNICAL.md): the nightly clean-up deletes nothing until the owner sets a
// period, then only what that period covers, a bounded amount a night; and only platform admins set, preview or
// delete by hand. Firestore and Storage are stand-ins that refuse what the real ones would need a composite index for.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { activePeriods, cutoffs, DAY, PERIOD_KEYS, shotPath, validatePeriods } from "../src/retentionCore";

type Data = Record<string, unknown>;
type Filter = [field: string, op: string, value: unknown];
interface Snap { id: string; exists: boolean; ref: { path: string; delete(): Promise<void> }; data(): Data | undefined; get(f: string): unknown }
interface QueryState { filters: Filter[]; order?: string; fields?: string[]; after?: { key: unknown; id: string }; limit?: number }

/** A small Firestore: single-field queries, pages, counts and batches, and nothing a composite index would be needed for. */
const store = vi.hoisted(() => {
  const docs = new Map<string, Data>();
  const s = { docs, audits: [] as Data[], pages: 0, counts: 0, batches: 0, broken: "" };
  return s;
});
const files = vi.hoisted(() => ({ all: new Map<string, string>(), stuck: new Set<string>(), deleted: [] as string[] }));

vi.mock("../src/admin.js", async () => {
  const { HttpsError } = await import("firebase-functions/v2/https");
  const { FieldValue } = await import("firebase-admin/firestore");
  const { docs } = store;
  const norm = (v: unknown) => (v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis(): number }).toMillis() : v);
  const pick = (d: Data | undefined, f: string) => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), d);
  const ref = (path: string) => ({
    path, id: path.split("/").pop()!,
    get: async () => snap(path, docs.get(path)),
    set: async (data: Data, opts?: { merge?: boolean }) => { docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : { ...data }); },
    delete: async () => { docs.delete(path); },
  });
  const snap = (path: string, data: Data | undefined, fields?: string[]): Snap => {
    // A projection really hides the other fields, as select() does: code that reads one it didn't ask for sees nothing.
    const shown = (f: string) => !fields || fields.some((x) => f === x || f.startsWith(`${x}.`));
    return { id: path.split("/").pop()!, exists: data !== undefined, ref: ref(path), data: () => (data ? structuredClone(data) : undefined), get: (f: string) => (shown(f) ? pick(data, f) : undefined) };
  };
  const query = (col: string, st: QueryState) => {
    const run = () => {
      if (store.broken === col) throw new Error(`UNAVAILABLE ${col}`);
      // What production has no index for: two filtered fields, or an order on another field than the range filter's.
      if (new Set(st.filters.map(([f]) => f)).size > 1) throw new Error(`FAILED_PRECONDITION: ${col} needs a composite index`);
      const range = st.filters.find(([, op]) => op !== "==");
      if (st.order && st.filters.some(([f]) => f !== st.order)) throw new Error(`FAILED_PRECONDITION: ${col} orders by ${st.order} but filters another field`);
      // Like Firestore, a range filter orders by its own field when no order is given.
      const orderField = st.order ?? range?.[0];
      const key = (d: Data) => (orderField ? norm(pick(d, orderField)) : 0) as number | string;
      let rows = [...docs.entries()].filter(([k]) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map(([k, d]) => ({ path: k, id: k.slice(col.length + 1), d }));
      rows = rows.filter(({ d }) => st.filters.every(([f, op, v]) => {
        const a = norm(pick(d, f)), b = norm(v);
        if (a === undefined || a === null || typeof a !== typeof b) return false;
        if (op === "==") return a === b;
        if (op === "<") return (a as number) < (b as number);
        throw new Error(`unsupported operator ${op}`);
      }));
      rows.sort((x, y) => (key(x.d) < key(y.d) ? -1 : key(x.d) > key(y.d) ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      const after = st.after;
      if (after) rows = rows.filter((r) => key(r.d) > (after.key as number | string) || (key(r.d) === after.key && r.id > after.id));
      return rows;
    };
    return {
      where: (f: string, op: string, v: unknown) => query(col, { ...st, filters: [...st.filters, [f, op, v]] }),
      orderBy: (f: string) => query(col, { ...st, order: f }),
      select: (...fields: string[]) => query(col, { ...st, fields }),
      limit: (n: number) => query(col, { ...st, limit: n }),
      startAfter: (s: Snap) => {
        const key = st.order ? norm(s.get(st.order)) : 0;
        if (st.order && key === undefined) throw new Error(`startAfter: the snapshot has no "${st.order}" (select it)`);
        return query(col, { ...st, after: { key, id: s.id } });
      },
      get: async () => { store.pages++; const page = run().slice(0, st.limit ?? Infinity).map((r) => snap(r.path, r.d, st.fields)); return { docs: page, size: page.length, empty: !page.length }; },
      count: () => ({ get: async () => { store.counts++; return { data: () => ({ count: run().length }) }; } }),
    };
  };
  const db = {
    doc: ref,
    collection: (col: string) => query(col, { filters: [] }),
    batch: () => {
      const writes: { path: string; data?: Data }[] = [];
      return {
        delete: (r: { path: string }) => { writes.push({ path: r.path }); },
        // Like Firestore's update: only the fields given, a FieldValue.delete() takes its field away, and the document must exist.
        update: (r: { path: string }, data: Data) => { writes.push({ path: r.path, data }); },
        commit: async () => {
          if (writes.length > 500) throw new Error("a batch holds 500 writes");
          store.batches++;
          for (const w of writes) {
            if (!w.data) { docs.delete(w.path); continue; }
            const now = docs.get(w.path);
            if (!now) throw new Error(`NOT_FOUND: ${w.path}`);
            const next = { ...now };
            for (const [k, v] of Object.entries(w.data)) { if (v instanceof FieldValue && v.isEqual(FieldValue.delete())) delete next[k]; else next[k] = v; }
            docs.set(w.path, next);
          }
        },
      };
    },
  };
  type Req = { auth?: { uid: string; token: Data } };
  return {
    db,
    audit: async (action: string, by: string, data: Data) => { store.audits.push({ action, by, ...data }); },
    requireSuper: async (req: Req) => {
      if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
      if (req.auth.token.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only.");
      return { uid: req.auth.uid, role: "superadmin" };
    },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
});

vi.mock("../src/storage.js", () => {
  const file = (name: string) => ({
    name, metadata: { timeCreated: files.all.get(name) },
    delete: async (o?: { ignoreNotFound?: boolean }) => {
      if (files.stuck.has(name)) throw new Error("503 try again");
      if (!files.all.delete(name)) { if (!o?.ignoreNotFound) throw Object.assign(new Error("No such object"), { code: 404 }); return; }
      files.deleted.push(name);
    },
  });
  return {
    bucket: () => ({
      file,
      getFiles: async (q: { prefix: string; maxResults?: number; pageToken?: string }) => {
        const names = [...files.all.keys()].filter((n) => n.startsWith(q.prefix)).sort().filter((n) => !q.pageToken || n > q.pageToken);
        const page = names.slice(0, q.maxResults ?? 1000);
        return [page.map(file), names.length > page.length ? { pageToken: page.at(-1) } : null, {}];
      },
    }),
  };
});

const retention = await import("../src/retention");
const { docs } = store;
type Run = { run: (req: unknown) => Promise<unknown> };
const call = (fn: unknown, data: unknown, role: string | null = "superadmin") => (fn as Run).run({ data, ...(role ? { auth: { uid: `${role}-1`, token: { role, ...(role === "orgAdmin" ? { orgId: "o1" } : {}) } } } : {}) });
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; details?: { reason?: string } }) => e.details?.reason ?? e.code);

const NOW = Date.UTC(2026, 10, 11, 3, 10);
const ago = (days: number) => Timestamp.fromMillis(NOW - days * DAY);
const day = (days: number) => new Date(NOW - days * DAY).toISOString().slice(0, 10);
const periods = (p: Data) => docs.set("config/retention", { periods: p });
const ids = (col: string) => [...docs.keys()].filter((k) => k.startsWith(`${col}/`)).map((k) => k.slice(col.length + 1)).sort();
const report = (id: string, d: Data, shot = true) => {
  const path = `bugReports/${id}.jpg`;
  docs.set(`bugReports/${id}`, { text: "It broke", ...d, shot: shot ? { path, bytes: 10 } : null });
  if (shot) files.all.set(path, new Date(NOW).toISOString());
};
/** Something old in every category, and something new beside it. */
function seed() {
  report("closedOld", { status: "closed", createdAt: ago(200), statusAt: ago(120) });
  report("fixedOld", { status: "fixed", createdAt: ago(100), statusAt: ago(91) });
  report("fixedNew", { status: "fixed", createdAt: ago(100), statusAt: ago(30) });
  report("openOld", { status: "new", createdAt: ago(400) });
  report("reopened", { status: "new", createdAt: ago(300), statusAt: ago(250) });
  report("new", { status: "new", createdAt: ago(1) });
  docs.set("analyticsDevices/oldPhone", { last: day(200), first: day(300), role: "guest" });
  docs.set("analyticsDevices/newPhone", { last: day(2), first: day(300), role: "guest" });
  docs.set("checkouts/openOld", { status: "open", uid: "u1", createdAt: ago(60) });
  docs.set("checkouts/failedOld", { status: "failed", uid: "u1", createdAt: ago(60) });
  docs.set("checkouts/openNew", { status: "open", uid: "u1", createdAt: ago(1) });
  docs.set("checkouts/paidOld", { status: "paid", uid: "u1", createdAt: ago(900) });
  docs.set("checkouts/refundedOld", { status: "refunded", uid: "u1", createdAt: ago(900) });
  docs.set("joinAttempts/u1", { n: 3, since: NOW - 40 * DAY });
  docs.set("joinAttempts/u2", { n: 1, since: NOW - 3600e3 });
  docs.set("audit/old", { action: "joinOrg", by: "u1", at: ago(800) });
  docs.set("audit/new", { action: "joinOrg", by: "u2", at: ago(5) });
  files.all.set("exports/o1/old.xlsx", new Date(NOW - 20 * DAY).toISOString());
  files.all.set("exports/o1/new.xlsx", new Date(NOW - DAY).toISOString());
  files.all.set("content/catalog.json", new Date(NOW - 900 * DAY).toISOString());
  // What the job must never look at, whatever the periods.
  docs.set("users/u1", { name: "Mona", createdAt: ago(2000) });
  docs.set("payments/p1", { uid: "u1", at: ago(2000) });
  docs.set("subscriptions/u1", { status: "canceled", updatedAt: ago(2000) });
}
const everything = { bugReportsClosedDays: 90, bugReportsAnyDays: 365, analyticsDevicesDays: 180, checkoutsOpenDays: 30, joinAttemptsDays: 30, auditDays: 730, orgExportsDays: 7 };

beforeEach(() => {
  docs.clear(); store.audits.length = 0; store.pages = 0; store.counts = 0; store.batches = 0; store.broken = "";
  files.all.clear(); files.stuck.clear(); files.deleted.length = 0;
});

describe("the periods (retentionCore)", () => {
  it("are whole days from 1 to 3650 or null, and a key left out is null", () => {
    expect(validatePeriods({ auditDays: 730, bugReportsAnyDays: null })).toEqual({ ...Object.fromEntries(PERIOD_KEYS.map((k) => [k, null])), auditDays: 730 });
    expect(validatePeriods({})).toEqual(Object.fromEntries(PERIOD_KEYS.map((k) => [k, null])));
    expect(validatePeriods({ auditDays: 1, orgExportsDays: 3650 })).toMatchObject({ auditDays: 1, orgExportsDays: 3650 });
  });
  it("refuse 0, fractions, text, numbers too big and keys nobody knows", () => {
    for (const bad of [{ auditDays: 0 }, { auditDays: -1 }, { auditDays: 1.5 }, { auditDays: "30" }, { auditDays: 3651 }, { auditDays: NaN }, { usersDays: 30 }, { auditDays: 30, paymentsDays: 1 }, [], "90", null, undefined, 90]) {
      expect(validatePeriods(bad)).toBeNull();
    }
  });
  it("read from storage, count only when valid: anything else is no period", () => {
    expect(activePeriods({ auditDays: 0, bugReportsAnyDays: "30", checkoutsOpenDays: 1.5, joinAttemptsDays: -3, orgExportsDays: 9999, analyticsDevicesDays: 180 }))
      .toEqual({ ...Object.fromEntries(PERIOD_KEYS.map((k) => [k, null])), analyticsDevicesDays: 180 });
    for (const none of [undefined, null, "x", 3]) expect(Object.values(activePeriods(none)).every((v) => v === null)).toBe(true);
  });
  it("give a cut-off only to categories with a period; phones' is a UTC day", () => {
    expect(cutoffs({}, NOW)).toEqual({});
    expect(cutoffs({ auditDays: null, bugReportsAnyDays: 0 }, NOW)).toEqual({});
    expect(cutoffs({ auditDays: 2, analyticsDevicesDays: 30 }, NOW)).toEqual({ audit: NOW - 2 * DAY, analyticsDevices: "2026-10-12" });
  });
  it("a screenshot is only a file directly under bugReports/", () => {
    expect(shotPath("bugReports/abc.jpg")).toBe("bugReports/abc.jpg");
    for (const p of ["content/catalog.json", "bugReports/../content/catalog.json", "bugReports/a/b.jpg", "submissions/o1/u1/x.jpg", "", null, 4]) expect(shotPath(p)).toBeNull();
  });
});

describe("the nightly job", () => {
  it("deletes nothing while there is no configuration, and still writes its heartbeat", async () => {
    seed();
    const before = new Map(docs), filesBefore = new Map(files.all);
    const r = await retention.runRetention({ now: NOW });
    expect(r).toEqual({ deleted: { bugReports: 0, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 }, stopped: false, failed: [] });
    expect(docs.get("stats/jobs")).toMatchObject({ retentionJob: { ok: true, stopped: false, failed: [], deleted: r.deleted } });
    expect((docs.get("stats/jobs")!.retentionJob as { at: number }).at).toBeGreaterThan(0);
    docs.delete("stats/jobs");
    expect(docs).toEqual(before);
    expect(files.all).toEqual(filesBefore);
    expect(store.pages).toBe(0); // not even a query
    expect(store.audits).toEqual([]);
  });
  it("deletes nothing for periods that are empty, 0 or not whole days (a hand-edited document)", async () => {
    seed();
    periods({ bugReportsClosedDays: 0, bugReportsAnyDays: null, analyticsDevicesDays: "30", checkoutsOpenDays: 0.5, joinAttemptsDays: -1, auditDays: 99999 });
    const size = docs.size, fileCount = files.all.size;
    const r = await retention.runRetention({ now: NOW });
    expect(Object.values(r.deleted).every((n) => n === 0)).toBe(true);
    expect(docs.size).toBe(size + 1); // the heartbeat
    expect(files.all.size).toBe(fileCount);
  });
  it("keeps the other jobs' heartbeats", async () => {
    docs.set("stats/jobs", { statsJob: { at: 1, ok: true } });
    await retention.runRetention({ now: NOW });
    expect(docs.get("stats/jobs")).toMatchObject({ statsJob: { at: 1, ok: true }, retentionJob: { ok: true } });
  });

  it("with 90 days for closed reports, deletes only those closed more than 90 days ago, with their screenshots", async () => {
    seed();
    periods({ bugReportsClosedDays: 90 });
    const r = await retention.runRetention({ now: NOW });
    expect(r.deleted).toEqual({ bugReports: 2, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 });
    expect(ids("bugReports")).toEqual(["fixedNew", "new", "openOld", "reopened"]);
    expect(files.deleted.sort()).toEqual(["bugReports/closedOld.jpg", "bugReports/fixedOld.jpg"]);
    for (const kept of ["fixedNew", "new", "openOld", "reopened"]) expect(files.all.has(`bugReports/${kept}.jpg`)).toBe(true);
    // Nothing else was touched.
    expect(ids("checkouts")).toHaveLength(5);
    expect(ids("audit")).toEqual(["new", "old"]);
    expect(files.all.has("exports/o1/old.xlsx")).toBe(true);
    expect(store.audits).toEqual([{ action: "retention", by: "retentionJob", deleted: r.deleted }]);
  });
  it("a screenshot that is already gone doesn't fail the run; one Storage won't delete keeps its report for next time", async () => {
    seed();
    periods({ bugReportsClosedDays: 90 });
    files.all.delete("bugReports/closedOld.jpg");
    files.stuck.add("bugReports/fixedOld.jpg");
    report("noShot", { status: "closed", createdAt: ago(100), statusAt: ago(95) }, false);
    docs.set("bugReports/odd", { status: "closed", createdAt: ago(100), statusAt: ago(95), shot: { path: "content/catalog.json" } });
    const r = await retention.runRetention({ now: NOW });
    expect(r).toMatchObject({ deleted: { bugReports: 3 }, failed: [] });
    expect(ids("bugReports")).toEqual(["fixedNew", "fixedOld", "new", "openOld", "reopened"]);
    expect(files.all.has("content/catalog.json")).toBe(true); // a path outside bugReports/ is never deleted
    files.stuck.clear();
    expect((await retention.runRetention({ now: NOW })).deleted.bugReports).toBe(1);
    expect(ids("bugReports")).toEqual(["fixedNew", "new", "openOld", "reopened"]);
  });
  it("the 'any report' period takes old reports whatever their status, and a report under both periods counts once", async () => {
    seed();
    periods({ bugReportsAnyDays: 180, bugReportsClosedDays: 90 });
    const r = await retention.runRetention({ now: NOW });
    // closedOld (200 days), openOld and reopened by age; fixedOld by its status.
    expect(r.deleted.bugReports).toBe(4);
    expect(ids("bugReports")).toEqual(["fixedNew", "new"]);
    expect(files.deleted).toHaveLength(4);
  });

  it("never deletes a paid or refunded checkout, only open and failed ones older than the period", async () => {
    seed();
    // Money a provider took that gave nothing (billing.ts recordPayment, "unapplied"): the record a platform admin
    // refunds or applies from. And a status this code has never heard of stays too: only open and failed ever go.
    docs.set("checkouts/unappliedOld", { status: "unapplied", uid: "u1", createdAt: ago(900) });
    docs.set("checkouts/laterOld", { status: "disputed", uid: "u1", createdAt: ago(900) });
    periods({ checkoutsOpenDays: 30 });
    const r = await retention.runRetention({ now: NOW });
    expect(r.deleted.checkouts).toBe(2);
    expect(ids("checkouts")).toEqual(["laterOld", "openNew", "paidOld", "refundedOld", "unappliedOld"]);
    periods({ checkoutsOpenDays: 1 });
    await retention.runRetention({ now: NOW + 30 * DAY });
    expect(ids("checkouts")).toEqual(["laterOld", "paidOld", "refundedOld", "unappliedOld"]);
  });
  it("cleans phones, join tries, the audit log and exported files by their own periods, and nothing else", async () => {
    seed();
    periods(everything);
    const r = await retention.runRetention({ now: NOW });
    expect(r).toEqual({ deleted: { bugReports: 3, analyticsDevices: 1, checkouts: 2, joinAttempts: 1, audit: 1, orgExports: 1 }, stopped: false, failed: [] });
    expect(ids("analyticsDevices")).toEqual(["newPhone"]);
    expect(ids("joinAttempts")).toEqual(["u2"]);
    expect(ids("audit")).toEqual(["new"]);
    expect([...files.all.keys()].filter((n) => !n.startsWith("bugReports/")).sort()).toEqual(["content/catalog.json", "exports/o1/new.xlsx"]);
    expect(docs.has("users/u1") && docs.has("payments/p1") && docs.has("subscriptions/u1")).toBe(true);
    expect(docs.get("config/retention")).toEqual({ periods: everything });
  });

  // content.ts lastVersionOf reads a unit's version counter from these when units/{id} doesn't hold it (unpublished
  // before `lastVersion` was kept, or deleted and made again): without them the next publish would reuse v1, and unit
  // files are immutable and cached for good on phones.
  it("the audit period never deletes a unit's publishes, however old: they hold its version counter", async () => {
    seed();
    docs.set("audit/pub1", { action: "publishUnit", by: "s1", unitId: "ai-1-1", owner: "public", version: 1, at: ago(900) });
    docs.set("audit/pub4", { action: "publishUnit", by: "s1", unitId: "ai-1-1", owner: "public", version: 4, at: ago(800) });
    docs.set("audit/unpub", { action: "unpublishUnit", by: "s1", unitId: "ai-1-1", owner: "public", at: ago(799) });
    // Enough of them that the entries to delete are on a later page than the ones that stay.
    for (let i = 0; i < 300; i++) docs.set(`audit/p${String(i).padStart(3, "0")}`, { action: "publishUnit", unitId: `u${i}`, owner: "public", version: 2, at: ago(1000) });
    periods({ auditDays: 1 });
    const spy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    try { expect(await call(retention.previewRetention, {})).toMatchObject({ counts: { audit: 3 }, partial: false }); } finally { spy.mockRestore(); }
    const r = await retention.runRetention({ now: NOW });
    expect(r).toMatchObject({ deleted: { audit: 3 }, stopped: false, failed: [] }); // old, new (5 days) and unpub
    expect(ids("audit").filter((id) => !/^p\d{3}$/.test(id))).toEqual(["pub1", "pub4"]);
    expect(ids("audit")).toHaveLength(302);
    expect(docs.get("audit/pub4")).toMatchObject({ unitId: "ai-1-1", version: 4 });
    // And the next night finds nothing more to do.
    expect((await retention.runRetention({ now: NOW + DAY })).deleted.audit).toBe(0);
    expect(ids("audit")).toHaveLength(302);
  });

  // payments.ts unmatched: money a provider took that matched no checkout is written only here (no payments/ document),
  // "where a platform admin sees it and can refund or apply it by hand". An unapplied payment keeps its payments/{id}.
  it("the audit period never deletes an unmatched payment: it is the only record of that money", async () => {
    seed();
    docs.set("audit/unm", { action: "paymentUnmatched", by: "webhook", provider: "paymob", ref: "501", checkout: "chk1", why: "amount differs", cents: 100, currency: "EGP", at: ago(900) });
    docs.set("audit/unap", { action: "paymentUnapplied", by: "webhook", payment: "paymob_9", at: ago(900) });
    periods({ auditDays: 1 });
    const spy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    try { expect(await call(retention.previewRetention, {})).toMatchObject({ counts: { audit: 3 }, partial: false }); } finally { spy.mockRestore(); }
    const r = await retention.runRetention({ now: NOW });
    expect(r).toMatchObject({ deleted: { audit: 3 }, stopped: false, failed: [] }); // old, new (5 days) and unap
    expect(ids("audit")).toEqual(["unm"]);
    expect(docs.get("audit/unm")).toMatchObject({ provider: "paymob", ref: "501", checkout: "chk1", why: "amount differs", cents: 100, currency: "EGP" });
    expect((await retention.runRetention({ now: NOW + DAY })).deleted.audit).toBe(0);
    expect(ids("audit")).toEqual(["unm"]);
  });

  // admin.ts audit writes the caller's address and a request id on every entry a callable makes, publishUnit included.
  // A kept entry is kept for its version (or its money), not for where the publisher was.
  it("a kept audit entry older than the period loses its address and request id, and nothing else; it is not counted as deleted", async () => {
    seed();
    const pub = { action: "publishUnit", unitId: "ai-1-1", owner: "public", version: 4, by: "s1" };
    docs.set("audit/pubIp", { ...pub, ip: "203.0.113.9", rid: "ab12cd34", at: ago(800) });
    docs.set("audit/pubRid", { ...pub, version: 5, catalog: "pending", rid: "ef56ab78", at: ago(700) }); // only one of the two
    docs.set("audit/pubPlain", { ...pub, version: 2, at: ago(900) }); // a seed's publish: nothing to take off
    docs.set("audit/pubNew", { ...pub, version: 6, ip: "203.0.113.9", rid: "0a0a0a0a", at: ago(3) }); // inside the period
    docs.set("audit/unm", { action: "paymentUnmatched", by: "webhook", ref: "501", cents: 100, ip: "198.51.100.4", rid: "11112222", at: ago(600) });
    periods({ auditDays: 30 });
    const spy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    // The preview says what would be deleted: "old" alone ("new" is 5 days old), and it changes nothing.
    try { expect(await call(retention.previewRetention, {})).toMatchObject({ counts: { audit: 1 }, partial: false }); } finally { spy.mockRestore(); }
    expect(docs.get("audit/pubIp")).toMatchObject({ ip: "203.0.113.9", rid: "ab12cd34" });

    const r = await retention.runRetention({ now: NOW });
    expect(r).toMatchObject({ deleted: { audit: 1 }, stopped: false, failed: [] });
    expect(ids("audit")).toEqual(["new", "pubIp", "pubNew", "pubPlain", "pubRid", "unm"]);
    expect(docs.get("audit/pubIp")).toEqual({ ...pub, at: ago(800) });
    expect(docs.get("audit/pubRid")).toEqual({ ...pub, version: 5, catalog: "pending", at: ago(700) });
    expect(docs.get("audit/pubPlain")).toEqual({ ...pub, version: 2, at: ago(900) });
    expect(docs.get("audit/unm")).toEqual({ action: "paymentUnmatched", by: "webhook", ref: "501", cents: 100, at: ago(600) });
    // Inside the period an entry is whole, like every other entry of its age.
    expect(docs.get("audit/pubNew")).toMatchObject({ ip: "203.0.113.9", rid: "0a0a0a0a" });
    // The job's own audit entry counts what was deleted, not what was trimmed.
    expect(store.audits).toEqual([{ action: "retention", by: "retentionJob", deleted: r.deleted }]);

    // A second run finds nothing to trim: it writes no batch at all.
    const batches = store.batches;
    expect(batches).toBe(2); // one delete, one trim
    expect((await retention.runRetention({ now: NOW })).deleted.audit).toBe(0);
    expect(store.batches).toBe(batches);
    // Without an audit period nothing is trimmed either.
    docs.set("audit/pubLater", { ...pub, version: 7, ip: "203.0.113.9", rid: "0b0b0b0b", at: ago(800) });
    periods({ joinAttemptsDays: 30 });
    await retention.runRetention({ now: NOW });
    expect(docs.get("audit/pubLater")).toMatchObject({ ip: "203.0.113.9", rid: "0b0b0b0b" });
  });
  it("trims at most 500 kept entries a night, beside the 500 it deletes", async () => {
    for (let i = 0; i < 620; i++) docs.set(`audit/p${String(i).padStart(3, "0")}`, { action: "publishUnit", unitId: `u${i}`, owner: "public", version: 1, by: "s1", ip: "203.0.113.9", rid: "ab12cd34", at: ago(100) });
    for (let i = 0; i < 510; i++) docs.set(`audit/x${String(i).padStart(3, "0")}`, { action: "joinOrg", by: "u1", ip: "203.0.113.9", at: ago(100) });
    periods({ auditDays: 30 });
    const withIp = () => [...docs.entries()].filter(([k, d]) => k.startsWith("audit/p") && "ip" in d).length;
    expect((await retention.runRetention({ now: NOW })).deleted.audit).toBe(500);
    expect(withIp()).toBe(120);
    expect((await retention.runRetention({ now: NOW })).deleted.audit).toBe(10);
    expect(withIp()).toBe(0);
    expect(ids("audit")).toHaveLength(620);
  });

  it("deletes at most 500 of a category a run, and a second run the same day just carries on", async () => {
    for (let i = 0; i < 620; i++) docs.set(`audit/a${String(i).padStart(4, "0")}`, { action: "x", at: ago(100 + (i % 7)) });
    for (let i = 0; i < 30; i++) docs.set(`audit/keep${i}`, { action: "x", at: ago(3) });
    for (let i = 0; i < 300; i++) report(`any${String(i).padStart(3, "0")}`, { status: "new", createdAt: ago(400) }, i % 3 === 0);
    for (let i = 0; i < 300; i++) report(`closed${String(i).padStart(3, "0")}`, { status: "closed", createdAt: ago(100), statusAt: ago(95) }, false);
    for (let i = 0; i < 520; i++) docs.set(`checkouts/open${String(i).padStart(3, "0")}`, { status: "open", createdAt: ago(40) });
    for (let i = 0; i < 300; i++) docs.set(`checkouts/paid${String(i).padStart(3, "0")}`, { status: "paid", createdAt: ago(40) });
    for (let i = 0; i < 510; i++) files.all.set(`exports/o1/f${String(i).padStart(3, "0")}.xlsx`, new Date(NOW - 30 * DAY).toISOString());
    periods({ auditDays: 90, bugReportsAnyDays: 365, bugReportsClosedDays: 90, checkoutsOpenDays: 30, orgExportsDays: 7 });

    const first = await retention.runRetention({ now: NOW });
    expect(first.deleted).toMatchObject({ audit: 500, bugReports: 500, checkouts: 500, orgExports: 500 });
    expect(ids("audit")).toHaveLength(150);
    expect(ids("bugReports")).toHaveLength(100);
    expect(ids("checkouts")).toHaveLength(320);

    const second = await retention.runRetention({ now: NOW });
    expect(second.deleted).toMatchObject({ audit: 120, bugReports: 100, checkouts: 20, orgExports: 10 });
    expect(ids("audit")).toHaveLength(30);
    expect(ids("checkouts").every((id) => id.startsWith("paid"))).toBe(true);
    expect(files.all.size).toBe(0);

    const third = await retention.runRetention({ now: NOW });
    expect(Object.values(third.deleted).every((n) => n === 0)).toBe(true);
    expect(store.audits.filter((a) => a.action === "retention")).toHaveLength(2); // nothing deleted, nothing to record
  });
  it("stops cleanly when its time is up: nothing half-done, and the heartbeat says it stopped", async () => {
    seed();
    periods(everything);
    const size = docs.size;
    const r = await retention.runRetention({ now: NOW, budgetMs: 0 });
    expect(r.stopped).toBe(true);
    expect(Object.values(r.deleted).every((n) => n === 0)).toBe(true);
    expect(docs.size).toBe(size + 1);
    expect(docs.get("stats/jobs")).toMatchObject({ retentionJob: { ok: true, stopped: true } });
  });
  it("a category that fails doesn't stop the others, and the heartbeat says which", async () => {
    seed();
    periods(everything);
    store.broken = "analyticsDevices";
    const r = await retention.runRetention({ now: NOW });
    expect(r.failed).toEqual(["analyticsDevices"]);
    expect(r.deleted).toMatchObject({ bugReports: 3, analyticsDevices: 0, checkouts: 2, audit: 1, orgExports: 1 });
    expect(docs.get("stats/jobs")).toMatchObject({ retentionJob: { ok: false, failed: ["analyticsDevices"] } });
  });
  it("runs as the scheduled function", async () => {
    seed();
    await (retention.retentionJob as unknown as Run).run({});
    expect(docs.get("stats/jobs")).toMatchObject({ retentionJob: { ok: true } });
    expect(ids("bugReports")).toHaveLength(6);
  });
});

describe("platform admins only", () => {
  it("refuses an org admin, a teacher and a visitor on every callable, and changes nothing", async () => {
    seed();
    const size = docs.size;
    for (const role of ["orgAdmin", "teacher", "learner"]) {
      expect(await refusal(call(retention.saveRetention, { periods: { auditDays: 1 } }, role))).toBe("permission-denied");
      expect(await refusal(call(retention.previewRetention, { periods: { auditDays: 1 } }, role))).toBe("permission-denied");
      expect(await refusal(call(retention.deleteBugReport, { id: "new" }, role))).toBe("permission-denied");
    }
    for (const fn of [retention.saveRetention, retention.previewRetention, retention.deleteBugReport]) expect(await refusal(call(fn, { id: "new", periods: {} }, null))).toBe("unauthenticated");
    expect(docs.size).toBe(size);
    expect(docs.has("config/retention")).toBe(false);
    expect(store.audits).toEqual([]);
  });
});

describe("saveRetention", () => {
  it("refuses bad periods and saves nothing", async () => {
    for (const bad of [{ auditDays: 0 }, { auditDays: 4000 }, { auditDays: 1.5 }, { auditDays: "90" }, { accountsDays: 30 }, undefined, [], "x"]) {
      expect(await refusal(call(retention.saveRetention, { periods: bad }))).toBe("bad-periods");
    }
    expect(await refusal(call(retention.saveRetention, {}))).toBe("bad-periods");
    expect(docs.has("config/retention")).toBe(false);
  });
  it("saves the periods as a whole, with who and when, and audits the old and the new", async () => {
    expect(await call(retention.saveRetention, { periods: { auditDays: 730, checkoutsOpenDays: 30 } })).toEqual({ periods: { ...Object.fromEntries(PERIOD_KEYS.map((k) => [k, null])), auditDays: 730, checkoutsOpenDays: 30 } });
    expect(docs.get("config/retention")).toMatchObject({ periods: { auditDays: 730, checkoutsOpenDays: 30, bugReportsAnyDays: null }, updatedBy: "superadmin-1" });
    // A later save replaces them all: a period left out is off again.
    await call(retention.saveRetention, { periods: { auditDays: 365 } });
    expect((docs.get("config/retention")!.periods as Data).checkoutsOpenDays).toBeNull();
    expect(store.audits).toHaveLength(2);
    expect(store.audits[1]).toMatchObject({ action: "saveRetention", by: "superadmin-1", was: { auditDays: 730, checkoutsOpenDays: 30 }, periods: { auditDays: 365, checkoutsOpenDays: null } });
  });
});

describe("previewRetention", () => {
  const realNow = () => vi.spyOn(Date, "now").mockReturnValue(NOW);
  it("answers all zeros on an empty configuration, without reading a thing", async () => {
    seed();
    expect(await call(retention.previewRetention, {})).toEqual({ counts: { bugReports: 0, analyticsDevices: 0, checkouts: 0, joinAttempts: 0, audit: 0, orgExports: 0 }, partial: false });
    expect(store.pages + store.counts).toBe(0);
  });
  it("counts what the given periods would delete now, and deletes nothing", async () => {
    seed();
    const size = docs.size, fileCount = files.all.size, spy = realNow();
    try {
      expect(await call(retention.previewRetention, { periods: everything })).toEqual({ counts: { bugReports: 3, analyticsDevices: 1, checkouts: 2, joinAttempts: 1, audit: 1, orgExports: 1 }, partial: false });
      expect(await call(retention.previewRetention, { periods: { bugReportsAnyDays: 180, bugReportsClosedDays: 90 } })).toMatchObject({ counts: { bugReports: 4, audit: 0 } });
      expect(store.counts).toBeGreaterThan(0); // count() where one field decides
    } finally { spy.mockRestore(); }
    expect(docs.size).toBe(size);
    expect(files.all.size).toBe(fileCount);
    expect(docs.has("config/retention")).toBe(false); // a preview saves nothing
    expect(store.audits).toEqual([]);
  });
  it("uses the saved periods when none are given, and refuses bad ones", async () => {
    seed();
    periods({ auditDays: 730 });
    const spy = realNow();
    try { expect(await call(retention.previewRetention, {})).toMatchObject({ counts: { audit: 1, bugReports: 0 } }); } finally { spy.mockRestore(); }
    expect(await refusal(call(retention.previewRetention, { periods: { auditDays: 0 } }))).toBe("bad-periods");
  });
  it("counts past the job's nightly limit", async () => {
    for (let i = 0; i < 620; i++) docs.set(`checkouts/open${i}`, { status: "open", createdAt: ago(40) });
    const spy = realNow();
    try { expect(await call(retention.previewRetention, { periods: { checkoutsOpenDays: 30 } })).toMatchObject({ counts: { checkouts: 620 } }); } finally { spy.mockRestore(); }
    expect(ids("checkouts")).toHaveLength(620);
  });
});

describe("deleteBugReport", () => {
  it("removes the report and its screenshot, and audits it", async () => {
    seed();
    expect(await call(retention.deleteBugReport, { id: "new" })).toEqual({ ok: true });
    expect(docs.has("bugReports/new")).toBe(false);
    expect(files.all.has("bugReports/new.jpg")).toBe(false);
    expect(ids("bugReports")).toHaveLength(5);
    expect(store.audits).toEqual([{ action: "deleteBugReport", by: "superadmin-1", id: "new", hadShot: true }]);
  });
  it("works for a report without a screenshot, or whose screenshot is already gone", async () => {
    report("plain", { status: "new", createdAt: ago(1) }, false);
    report("lost", { status: "new", createdAt: ago(1) });
    files.all.delete("bugReports/lost.jpg");
    expect(await call(retention.deleteBugReport, { id: "plain" })).toEqual({ ok: true });
    expect(await call(retention.deleteBugReport, { id: "lost" })).toEqual({ ok: true });
    expect(store.audits.map((a) => a.hadShot)).toEqual([false, true]);
    expect(ids("bugReports")).toEqual([]);
  });
  it("keeps the report when Storage refuses, so it can be tried again", async () => {
    report("r1", { status: "new", createdAt: ago(1) });
    files.stuck.add("bugReports/r1.jpg");
    await expect(call(retention.deleteBugReport, { id: "r1" })).rejects.toThrow();
    expect(docs.has("bugReports/r1")).toBe(true);
    expect(store.audits).toEqual([]);
  });
  it("refuses an id that isn't a report", async () => {
    seed();
    for (const id of ["nope", "", "new/extra", "../users/u1", undefined, 7]) expect(await refusal(call(retention.deleteBugReport, { id }))).toBe("no-report");
    expect(ids("bugReports")).toHaveLength(6);
    expect(docs.has("users/u1")).toBe(true);
  });
});
