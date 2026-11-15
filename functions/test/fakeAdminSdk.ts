// A stand-in for the Admin SDK itself, for the tests that run the real src/admin.ts (audit.test.ts, access.test.ts):
// an in-memory Firestore with what those functions use (documents, add, equality filters, orderBy with a cursor,
// document-order paging, collection groups, getAll) and Auth accounts. Server timestamps become real Timestamps, 1 ms
// apart, so paging by time behaves as it does live.
//
// It imports nothing from firebase-admin: the tests mock those modules with factories that load this file, and hand
// the real Timestamp and FieldValue in through install().
type Data = Record<string, unknown>;
interface Sdk { Timestamp: { new (s: number, n: number): { seconds: number; nanoseconds: number }; fromMillis(ms: number): unknown }; FieldValue: { serverTimestamp(): { isEqual(o: unknown): boolean } } }
type Filter = [string, unknown];
interface Shape { group: boolean; name: string; filters: Filter[]; order: [string, "asc" | "desc"] | null; after: unknown; max: number }

const field = (data: Data | undefined, f: string) => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), data);
const micros = (t: unknown) => { const x = t as { seconds: number; nanoseconds: number }; return x.seconds * 1e6 + Math.round(x.nanoseconds / 1000); };

export class FakeFirestore {
  docs = new Map<string, Data>();
  /** How many getAll calls were made, and how many queries ran. */
  getAlls = 0; queries = 0;
  /** The server's clock (ms): each server timestamp written takes the next millisecond. */
  now = Date.UTC(2026, 10, 1);
  constructor(private sdk: Sdk) {}

  private stamp(data: Data): Data {
    const sentinel = this.sdk.FieldValue.serverTimestamp();
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === "object" && typeof (v as { isEqual?: unknown }).isEqual === "function" && sentinel.isEqual(v) ? this.sdk.Timestamp.fromMillis(this.now++) : v]));
  }
  private snap(path: string) {
    const data = this.docs.get(path);
    return { id: path.split("/").pop()!, exists: data !== undefined, ref: this.doc(path), data: () => (data ? { ...data } : undefined), get: (f: string) => field(data, f) };
  }
  doc(path: string) {
    const self = this;
    return {
      path, id: path.split("/").pop()!,
      get: async () => self.snap(path),
      set: async (data: Data, opts?: { merge?: boolean }) => { self.docs.set(path, { ...(opts?.merge ? self.docs.get(path) : {}), ...self.stamp(data) }); },
      update: async (data: Data) => { if (!self.docs.has(path)) throw new Error(`NOT_FOUND ${path}`); self.docs.set(path, { ...self.docs.get(path), ...self.stamp(data) }); },
      delete: async () => { self.docs.delete(path); },
    };
  }
  private query(q: Shape) {
    const self = this;
    const run = () => {
      let paths = [...self.docs.keys()].filter((p) => {
        const parts = p.split("/");
        return q.group ? parts.length % 2 === 0 && parts[parts.length - 2] === q.name : p.startsWith(`${q.name}/`) && parts.length === q.name.split("/").length + 1;
      }).filter((p) => q.filters.every(([f, v]) => field(self.docs.get(p), f) === v)).sort();
      if (q.order) {
        const [f, dir] = q.order, sign = dir === "desc" ? -1 : 1;
        // Like Firestore, a document without the ordered field is not in the result.
        paths = paths.filter((p) => field(self.docs.get(p), f) !== undefined).sort((a, b) => sign * (micros(field(self.docs.get(a), f)) - micros(field(self.docs.get(b), f))));
        if (q.after) paths = paths.filter((p) => sign * (micros(field(self.docs.get(p), f)) - micros(q.after)) > 0);
      } else if (q.after) paths = paths.filter((p) => p > (q.after as { ref: { path: string } }).ref.path);
      return paths.slice(0, q.max).map((p) => self.snap(p));
    };
    return {
      where: (f: string, op: string, v: unknown) => { if (op !== "==") throw new Error(`fake: no ${op}`); return self.query({ ...q, filters: [...q.filters, [f, v]] }); },
      orderBy: (f: string, dir: "asc" | "desc" = "asc") => self.query({ ...q, order: [f, dir] }),
      startAfter: (x: unknown) => self.query({ ...q, after: x }),
      limit: (n: number) => self.query({ ...q, max: n }),
      select: (..._f: string[]) => self.query(q),
      get: async () => { self.queries++; const docs = run(); return { docs, size: docs.length, empty: !docs.length }; },
    };
  }
  private seq = 0;
  collection(name: string) {
    return {
      ...this.query({ group: false, name, filters: [], order: null, after: null, max: Infinity }),
      doc: (id: string) => this.doc(`${name}/${id}`),
      add: async (data: Data) => { const ref = this.doc(`${name}/auto${String(this.seq++).padStart(6, "0")}`); await ref.set(data); return ref; },
    };
  }
  collectionGroup(name: string) { return this.query({ group: true, name, filters: [], order: null, after: null, max: Infinity }); }
  async getAll(...refs: unknown[]) {
    this.getAlls++;
    return refs.filter((r): r is { path: string } => typeof (r as { path?: unknown }).path === "string").map((r) => this.snap(r.path));
  }
  /** The entries of a collection, oldest first (by the order they were written). */
  all(col: string) { return [...this.docs.entries()].filter(([p]) => p.startsWith(`${col}/`) && p.split("/").length === 2).map(([p, d]) => ({ id: p.split("/")[1], ...d })); }
}

export interface Account { uid: string; email?: string; displayName?: string; disabled?: boolean; customClaims?: Record<string, unknown> }
export class FakeAuthSdk {
  users = new Map<string, Account>();
  reads: string[] = [];
  /** Auth is down: every read fails. */
  down = false;
  async getUser(uid: string) {
    this.reads.push(uid);
    const u = this.users.get(uid);
    if (this.down || !u) throw new Error(this.down ? "auth/internal-error" : "auth/user-not-found");
    return structuredClone(u);
  }
}

export const fake = {} as { db: FakeFirestore; auth: FakeAuthSdk };
/** Called by the mocks' factories with the real firebase-admin/firestore; the first call makes the pair. */
export function install(sdk?: Sdk) {
  if (!fake.auth) fake.auth = new FakeAuthSdk();
  if (!fake.db && sdk) fake.db = new FakeFirestore(sdk);
  return fake;
}
