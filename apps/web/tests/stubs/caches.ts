/** In-memory Cache Storage for tests (tests/offline*.test.ts, tests/downloads.test.tsx), keyed by absolute URL. */
export function fakeCaches(origin: string) {
  const stores = new Map<string, Map<string, Response>>();
  const abs = (k: string | { url: string }) => new URL(typeof k === "string" ? k : k.url, origin).href;
  const cache = (m: Map<string, Response>) => ({
    match: async (k: string | { url: string }) => m.get(abs(k))?.clone(),
    put: async (k: string | { url: string }, r: Response) => { m.set(abs(k), r.clone()); },
    keys: async () => [...m.keys()].map((url) => ({ url })),
    delete: async (k: string | { url: string }) => m.delete(abs(k)),
  });
  return {
    stores,
    has: async (n: string) => stores.has(n),
    keys: async () => [...stores.keys()],
    open: async (n: string) => { if (!stores.has(n)) stores.set(n, new Map()); return cache(stores.get(n)!); },
    match: async (k: string | { url: string }, o?: { cacheName?: string }) => {
      for (const [n, m] of stores) { if (o?.cacheName && n !== o.cacheName) continue; const r = m.get(abs(k)); if (r) return r.clone(); }
      return undefined;
    },
    delete: async (n: string) => stores.delete(n),
    /** The paths stored in one cache, sorted. */
    paths: (n: string) => [...(stores.get(n)?.keys() ?? [])].map((u) => new URL(u).pathname).sort(),
    /** The full URLs stored in one cache, sorted. */
    urls: (n: string) => [...(stores.get(n)?.keys() ?? [])].sort(),
    seed: (n: string, paths: string[], body = "x") => {
      const m = stores.get(n) ?? new Map<string, Response>();
      stores.set(n, m);
      for (const p of paths) m.set(abs(p), new Response(body));
    },
  };
}
export const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } });
