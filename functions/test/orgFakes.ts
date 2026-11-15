// Fakes for the organization lifecycle tests (orgLifecycle.test.ts, orgExport.test.ts): fakeFirestore's FakeDb with
// what paging a large organization needs (queries ordered by document id, startAfter, a real limit, recursiveDelete,
// snapshots that keep their Timestamps; batches are FakeDb's own), Auth that fails the way the Admin SDK does, a bucket, and the
// ../src/admin.js stand-in both tests share. Not a test file itself (vitest runs only *.test.ts).
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { FakeAuth, FakeDb } from "./fakeFirestore";

type Data = Record<string, unknown>;
/** A copy that keeps Timestamps (structuredClone, which FakeDb uses, turns them into plain objects). */
const copy = (v: unknown): unknown => v instanceof Timestamp ? v : Array.isArray(v) ? v.map(copy)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, copy(x)])) : v;

export class OrgDb extends FakeDb {
  /** Called before every query runs, with its collection path: a test's clock moves here (fake timers). */
  onQuery: ((col: string) => void) | null = null;

  snap(path: string) {
    const s = super.snap(path), data = this.docs.get(path);
    return { ...s, data: () => (data === undefined ? undefined : copy(data)) as Data };
  }
  /** Queries as Firestore answers them: in document-id order, from after a cursor, at most `limit`. */
  query(col: string, filters: [string, unknown][] = [], page: { after?: string; limit?: number } = {}) {
    const self = this;
    const run = () => {
      self.onQuery?.(col);
      let docs = [...self.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).sort()
        .map((k) => self.snap(k)).filter((s) => filters.every(([f, v]) => s.get(f) === v));
      if (page.after !== undefined) docs = docs.filter((d) => d.id > page.after!);
      return page.limit ? docs.slice(0, page.limit) : docs;
    };
    const q = {
      where: (f: string, _op: "==", v: unknown) => self.query(col, [...filters, [f, v]], page),
      select: (..._f: string[]) => q,
      orderBy: (_by: unknown) => q, // document id, the only order these callables use
      startAfter: (id: string) => self.query(col, filters, { ...page, after: id }),
      limit: (n: number) => self.query(col, filters, { ...page, limit: n }),
      get: async () => { const docs = run(); return { docs, size: docs.length, empty: !docs.length }; },
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      isQuery: true,
    };
    return q;
  }
  async recursiveDelete(ref: { path: string }) {
    for (const k of [...this.docs.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) this.docs.delete(k);
  }
  /** The documents of one top-level collection, by id. */
  all(col: string): ({ id: string } & Data)[] { return [...this.docs.entries()].filter(([k]) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map(([k, v]) => ({ id: k.slice(col.length + 1), ...v })); }
}

/** Auth whose missing account fails with the Admin SDK's code, which deleteOrg tells apart from a passing fault. */
export class OrgAuth extends FakeAuth {
  async getUser(uid: string) {
    const u = this.users.get(uid);
    if (!u) throw Object.assign(new Error("There is no user record corresponding to the provided identifier."), { code: "auth/user-not-found" });
    return structuredClone(u);
  }
}

type Saved = { body: Buffer; opts: { resumable?: boolean; gzip?: boolean; contentType?: string; metadata?: { cacheControl?: string; metadata?: Record<string, string> } } };
export class FakeBucket {
  files = new Map<string, Saved>();
  /** Prefixes deleteFiles was asked for, and a way to make some fail. */
  deleted: string[] = [];
  failDelete: ((prefix: string) => boolean) | null = null;
  async deleteFiles({ prefix }: { prefix: string }) {
    if (this.failDelete?.(prefix)) throw new Error(`storage: could not delete ${prefix}`);
    this.deleted.push(prefix);
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k);
  }
  async getFiles({ prefix }: { prefix: string }) {
    return [[...this.files.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, f]) => ({ name, metadata: { metadata: f.opts.metadata?.metadata } }))];
  }
  /** Called when a file is about to be saved, with its name: a test stages what happens meanwhile (an erasure, a newer export). */
  onSave: ((name: string) => void) | null = null;
  file(name: string) {
    return {
      save: async (body: Buffer | string, opts: Saved["opts"]) => { this.onSave?.(name); this.files.set(name, { body: Buffer.from(body), opts }); },
      delete: async (_opts?: { ignoreNotFound?: boolean }) => { this.files.delete(name); },
    };
  }
}

export type Audit = { action: string; by: string } & Data;
/** What ../src/admin.js is in these tests: the fakes, callers checked against the fake Auth's claims, a recorded audit log. */
export function adminMock() {
  const db = new OrgDb(), auth = new OrgAuth(), audits: Audit[] = [];
  type Req = { auth?: { uid: string; token: Data } };
  const freshCaller = async (req: Req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const claims = (await auth.getUser(req.auth.uid).catch(() => null))?.customClaims ?? {};
    return { uid: req.auth.uid, role: (claims.role as string) ?? "learner", orgId: claims.orgId as string | undefined };
  };
  return {
    db, auth, audits, freshCaller,
    audit: async (action: string, by: string, data: Data) => { audits.push({ action, by, ...data }); },
    releasePupils: async () => 0,
    requireSuper: async (req: Req) => { const c = await freshCaller(req); if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Platform admins only."); return c; },
    str: (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : ""),
  };
}
export type AdminMock = ReturnType<typeof adminMock>;
