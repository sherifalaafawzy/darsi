import { useEffect, useState } from "react";
import type { Catalog, Unit } from "../content/types";

/**
 * What these screens need from content/load, passed in from App. Importing content/load here would split the startup
 * bundle (CLAUDE.md "Keep the startup bundle in one file"): a new lazy chunk sharing it with startup did, 4 files to 7.
 */
export interface ContentLoader { loadCatalog: () => Promise<Catalog>; loadUnit: (id: string) => Promise<Unit> }

/** A promise's result for a screen; re-runs when deps change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error; loading: boolean } {
  const [s, setS] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setS({ loading: true });
    fn().then((data) => { if (live) setS({ data, loading: false }); }, (error: Error) => { if (live) setS({ error, loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}
