// A small in-memory Firestore for the billing and tutor tests: documents, merges, dotted field paths, the FieldValue
// sentinels the functions use, simple equality queries, and transactions that apply their writes only when they
// finish (and refuse a read after a write, as Firestore does). `failOn` makes a chosen write fail at commit.
import { FieldValue } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type Write = { path: string; op: "set" | "update" | "create" | "delete"; data?: Data; opts?: { merge?: boolean; mergeFields?: string[] } };

const isSentinel = (v: unknown, name: string) => !!v && typeof v === "object" && (v as object).constructor?.name === name;
const DELETE = FieldValue.delete(), STAMP = FieldValue.serverTimestamp();
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

function resolve(v: unknown, old: unknown): unknown {
  if (v instanceof FieldValue && v.isEqual(STAMP)) return Date.now();
  if (isSentinel(v, "NumericIncrementTransform")) return (typeof old === "number" ? old : 0) + Number((v as unknown as { operand: number }).operand);
  return v;
}
/** Applies one write's fields onto a document (merge = deep, keys with dots = nested paths). */
function apply(doc: Data, data: Data, deep: boolean) {
  for (const [key, v] of Object.entries(data)) {
    const parts = key.split(".");
    let at = doc;
    for (const p of parts.slice(0, -1)) { if (!at[p] || typeof at[p] !== "object") at[p] = {}; at = at[p] as Data; }
    const last = parts.at(-1)!;
    if (v instanceof FieldValue && v.isEqual(DELETE)) { delete at[last]; continue; }
    if (deep && v && typeof v === "object" && !(v instanceof FieldValue) && !Array.isArray(v) && !isSentinel(v, "NumericIncrementTransform")) {
      if (!at[last] || typeof at[last] !== "object") at[last] = {};
      apply(at[last] as Data, v as Data, true);
    } else at[last] = resolve(v, at[last]);
  }
}

/** A filter's value for where(field, "array-contains", value): the field is an array that holds the value. */
class Holds { constructor(readonly value: unknown) {} }

export class FakeDb {
  docs = new Map<string, Data>();
  writes: Write[] = [];
  /** A write (by path) that throws when its transaction or call commits, once. */
  failOn: ((w: Write) => boolean) | null = null;

  snap(path: string) {
    const data = this.docs.get(path);
    const id = path.split("/").pop()!;
    return { id, exists: data !== undefined, data: () => clone(data), get: (f: string) => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), data), ref: this.doc(path) };
  }
  commit(ws: Write[]) {
    for (const w of ws) if (this.failOn?.(w)) { this.failOn = null; throw new Error(`commit failed at ${w.path}`); }
    for (const w of ws) {
      const had = this.docs.get(w.path);
      if (w.op === "create" && had) throw new Error(`ALREADY_EXISTS ${w.path}`);
      if (w.op === "update" && !had) throw new Error(`NOT_FOUND ${w.path}`);
      if (w.op === "delete") { this.docs.delete(w.path); continue; }
      let doc: Data;
      if (w.op === "set" && w.opts?.mergeFields) { doc = clone(had) ?? {}; for (const f of w.opts.mergeFields) { if (w.data && f in w.data) apply(doc, { [f]: w.data[f] }, false); } }
      else if (w.op === "update" || (w.op === "set" && w.opts?.merge)) { doc = clone(had) ?? {}; apply(doc, w.data ?? {}, w.op === "set"); }
      else { doc = {}; apply(doc, w.data ?? {}, false); }
      this.docs.set(w.path, doc);
      this.writes.push(w);
    }
  }
  doc(path: string) {
    const self = this;
    return {
      path, id: path.split("/").pop()!,
      get: async () => self.snap(path),
      set: async (data: Data, opts?: Write["opts"]) => self.commit([{ path, op: "set", data, opts }]),
      update: async (data: Data) => self.commit([{ path, op: "update", data }]),
      create: async (data: Data) => self.commit([{ path, op: "create", data }]),
      delete: async () => self.commit([{ path, op: "delete" }]),
    };
  }
  query(col: string, filters: [string, unknown][] = []) {
    const self = this;
    const run = () => [...self.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/"))
      .map((k) => self.snap(k)).filter((s) => filters.every(([f, v]) => { const got = s.get(f); return v instanceof Holds ? Array.isArray(got) && got.includes(v.value) : got === v; }));
    const q = {
      // Typed as before (the fakes that extend this one declare "==" only); "array-contains" is honoured when it comes.
      where: (f: string, op: "==", v: unknown) => self.query(col, [...filters, [f, (op as string) === "array-contains" ? new Holds(v) : v]]),
      select: (..._f: string[]) => q,
      limit: (_n: number) => q,
      get: async () => { const docs = run(); return { docs, size: docs.length, empty: !docs.length }; },
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      isQuery: true,
    };
    return q;
  }
  collection(col: string) {
    let n = 0;
    return {
      ...this.query(col),
      doc: (id?: string) => this.doc(`${col}/${id ?? `auto${Date.now()}${n++}`}`),
      add: async (data: Data) => { const ref = this.doc(`${col}/auto${Date.now()}${n++}`); await ref.set(data); return ref; },
    };
  }
  /** A write batch: nothing is applied until commit, and then all of it or (on `failOn`, or an update of a missing document) none. */
  batch() {
    const ws: Write[] = [], self = this;
    const b = {
      set: (ref: { path: string }, data: Data, opts?: Write["opts"]) => { ws.push({ path: ref.path, op: "set", data, opts }); return b; },
      update: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "update", data }); return b; },
      create: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "create", data }); return b; },
      delete: (ref: { path: string }) => { ws.push({ path: ref.path, op: "delete" }); return b; },
      commit: async () => {
        for (const w of ws) if (w.op === "update" && !self.docs.has(w.path) && !ws.some((x) => x !== w && x.path === w.path && x.op !== "delete")) throw new Error(`NOT_FOUND ${w.path}`);
        self.commit(ws);
      },
    };
    return b;
  }
  /**
   * When true, transactions run one after another, as Firestore's locks make them: two started together never both
   * read the old value. Off by default: some tests start one transaction from inside another to stage an interleaving.
   */
  serial = false;
  private queue: Promise<unknown> = Promise.resolve();
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    if (!this.serial) return this.transact(fn);
    const run = this.queue.then(() => this.transact(fn));
    this.queue = run.catch(() => {});
    return run;
  }
  private async transact<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const ws: Write[] = [];
    const tx = {
      get: async (ref: { path?: string; get: () => Promise<unknown> }) => {
        if (ws.length) throw new Error("Firestore transactions require all reads to be executed before all writes.");
        return ref.get();
      },
      set: (ref: { path: string }, data: Data, opts?: Write["opts"]) => { ws.push({ path: ref.path, op: "set", data, opts }); return tx; },
      update: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "update", data }); return tx; },
      create: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "create", data }); return tx; },
      delete: (ref: { path: string }) => { ws.push({ path: ref.path, op: "delete" }); return tx; },
    };
    const out = await fn(tx);
    this.commit(ws);
    return out;
  }
}

export type FakeUser = {
  uid: string; customClaims?: Record<string, unknown>; email?: string; displayName?: string; emailVerified?: boolean; disabled?: boolean;
  password?: string; providerData?: { providerId: string }[]; tokensValidAfterTime?: string;
};
/** An Auth error as the Admin SDK throws it: the code is also the message (older tests read that). */
const authError = (code: string) => Object.assign(new Error(code), { code });

/** Auth accounts and their custom claims; accounts can be made, found by email, changed and deleted. */
export class FakeAuth {
  users = new Map<string, FakeUser>();
  claimWrites: string[] = [];
  /** The next this-many claims writes fail (Auth down for a moment). */
  failClaims = 0;
  /** Accounts being made right now, and the most at any one time (createUser takes a moment, as the real one does). */
  creating = 0; maxCreating = 0;
  private made = 0;
  async getUser(uid: string) { const u = this.users.get(uid); if (!u) throw authError("auth/user-not-found"); return clone(u); }
  async getUserByEmail(email: string) {
    const u = [...this.users.values()].find((x) => x.email === String(email).toLowerCase());
    if (!u) throw authError("auth/user-not-found");
    return clone(u);
  }
  async createUser(p: { uid?: string; email?: string; password?: string; displayName?: string; emailVerified?: boolean; disabled?: boolean }) {
    this.maxCreating = Math.max(this.maxCreating, ++this.creating);
    try {
      await new Promise((r) => setTimeout(r, 1));
      const email = p.email?.toLowerCase();
      if (email && [...this.users.values()].some((x) => x.email === email)) throw authError("auth/email-already-exists");
      const uid = p.uid ?? `made${++this.made}`;
      if (this.users.has(uid)) throw authError("auth/uid-already-exists");
      const u: FakeUser = { uid, ...(email ? { email } : {}), ...(p.displayName ? { displayName: p.displayName } : {}), emailVerified: p.emailVerified === true, disabled: p.disabled === true, ...(p.password ? { password: p.password } : {}), providerData: [{ providerId: "password" }] };
      this.users.set(uid, u);
      return clone(u);
    } finally { this.creating--; }
  }
  async updateUser(uid: string, p: Partial<Omit<FakeUser, "uid" | "customClaims">>) {
    const u = this.users.get(uid); if (!u) throw authError("auth/user-not-found");
    Object.assign(u, clone(p), p.email ? { email: p.email.toLowerCase() } : {});
    // A new password ends the account's sessions, as Auth does.
    if (p.password) u.tokensValidAfterTime = new Date().toUTCString();
    return clone(u);
  }
  async deleteUser(uid: string) { if (!this.users.delete(uid)) throw authError("auth/user-not-found"); }
  async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
    const u = this.users.get(uid); if (!u) throw authError("auth/user-not-found");
    if (this.failClaims > 0) { this.failClaims--; throw authError("auth/internal-error"); }
    u.customClaims = clone(claims); this.claimWrites.push(uid);
  }
  async revokeRefreshTokens() { /* sessions end; nothing to keep */ }
}
