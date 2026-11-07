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
      .map((k) => self.snap(k)).filter((s) => filters.every(([f, v]) => s.get(f) === v));
    const q = {
      where: (f: string, _op: "==", v: unknown) => self.query(col, [...filters, [f, v]]),
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
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
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

/** Auth accounts and their custom claims. */
export class FakeAuth {
  users = new Map<string, { uid: string; customClaims?: Record<string, unknown> }>();
  claimWrites: string[] = [];
  async getUser(uid: string) { const u = this.users.get(uid); if (!u) throw new Error("auth/user-not-found"); return clone(u); }
  async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
    const u = this.users.get(uid); if (!u) throw new Error("auth/user-not-found");
    u.customClaims = clone(claims); this.claimWrites.push(uid);
  }
  async revokeRefreshTokens() { /* sessions end; nothing to keep */ }
}
