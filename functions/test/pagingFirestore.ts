// fakeFirestore.ts with what the scheduled jobs and collect need on top: queries in document-id order with limit and
// startAfter (a document id or a query document), every read noted (`reads`), a read that can be made to fail
// (`failRead`), and write batches (`commits`: the paths of each commit, in order). Query documents hand out the stored
// data itself, not a copy, so a Timestamp stays a Timestamp.
import { FakeDb } from "./fakeFirestore";

type Data = Record<string, unknown>;
export type Read = { col: string; size: number; after?: string; fields: string[]; limit?: number };
type Q = { filters: [string, unknown][]; after?: string; limit?: number; fields: string[] };

export class PagingDb extends FakeDb {
  reads: Read[] = [];
  commits: string[][] = [];
  failRead: ((col: string) => boolean) | null = null;

  raw(path: string) {
    const data = this.docs.get(path) as Data;
    return { id: path.split("/").pop()!, exists: true, data: () => data, get: (f: string) => f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), data), ref: this.doc(path) };
  }
  collection(col: string) {
    const self = this, base = super.collection(col);
    const make = (q: Q): Record<string, unknown> => ({
      where: (f: string, _op: string, v: unknown) => make({ ...q, filters: [...q.filters, [f, v]] }),
      orderBy: () => make(q), // document-id order is the only order here
      select: (...fields: string[]) => make({ ...q, fields }),
      limit: (n: number) => make({ ...q, limit: n }),
      startAfter: (at: string | { id: string }) => make({ ...q, after: typeof at === "string" ? at : at.id }),
      get: async () => {
        if (self.failRead?.(col)) throw new Error(`4 DEADLINE_EXCEEDED: reading ${col} took too long. ${"x".repeat(400)}`);
        const ids = [...self.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes("/")).map((k) => k.slice(col.length + 1)).sort();
        let docs = ids.filter((id) => q.after === undefined || id > q.after).map((id) => self.raw(`${col}/${id}`)).filter((s) => q.filters.every(([f, v]) => s.get(f) === v));
        if (q.limit !== undefined) docs = docs.slice(0, q.limit);
        self.reads.push({ col, size: docs.length, after: q.after, fields: q.fields, limit: q.limit });
        return { docs, size: docs.length, empty: !docs.length };
      },
    });
    return { ...base, ...make({ filters: [], fields: [] }) };
  }
  batch() {
    const self = this;
    const ws: Parameters<FakeDb["commit"]>[0] = [];
    const b = {
      set: (ref: { path: string }, data: Data, opts?: { merge?: boolean; mergeFields?: string[] }) => { ws.push({ path: ref.path, op: "set", data, opts }); return b; },
      update: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "update", data }); return b; },
      // As FakeDb's own batch (the type it overrides): nothing here creates or deletes in a batch yet.
      create: (ref: { path: string }, data: Data) => { ws.push({ path: ref.path, op: "create", data }); return b; },
      delete: (ref: { path: string }) => { ws.push({ path: ref.path, op: "delete" }); return b; },
      commit: async () => { self.commit(ws); self.commits.push(ws.map((w) => w.path)); },
    };
    return b;
  }
}
