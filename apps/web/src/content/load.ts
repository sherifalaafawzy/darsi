import { useEffect, useState } from "react";
import { kitUrl, type Catalog, type Placement, type Unit } from "./types";

const memo = new Map<string, Promise<unknown>>();
/** Fetches content JSON; the service worker serves it from cache when offline. */
export function loadJSON<T>(path: string): Promise<T> {
  if (!memo.has(path)) memo.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }).catch((e) => { memo.delete(path); throw e; }));
  return memo.get(path) as Promise<T>;
}
export const loadCatalog = () => loadJSON<Catalog>("/content/catalog.json");
export const loadUnit = (id: string) => loadJSON<Unit>(`/content/units/${id}.json`);
export const loadPlacement = () => loadJSON<Placement>("/content/placement.json");

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean; retry: () => void } {
  const [s, setS] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true; setS({ loading: true });
    fn().then((data) => live && setS({ data, loading: false })).catch((error: Error) => live && setS({ error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...s, retry: () => setN((x) => x + 1) };
}

/** All URLs needed to use a unit offline: its JSON, kit files in both formats for the current language, captions, videos. */
export function unitAssetUrls(unit: Unit, lang: string): string[] {
  const urls = [`/content/units/${unit.id}.json`];
  for (const l of unit.lessons) {
    for (const k of l.kit) if (k.kind !== "video") for (const f of k.formats) urls.push(kitUrl(k, lang, f));
    for (const s of l.steps) if (s.type === "video") { if (s.src) urls.push(s.src.replace("{lang}", lang)); const c = s.captions?.[lang]; if (c) urls.push(c); }
  }
  return urls;
}
