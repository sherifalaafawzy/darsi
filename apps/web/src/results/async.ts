import { useCallback, useEffect, useRef, useState } from "react";
import type { Catalog, Unit } from "../content/types";

/**
 * What these screens need from content/load, passed in from App. Importing content/load here would split the startup
 * bundle (CLAUDE.md "Keep the startup bundle in one file"): a new lazy chunk sharing it with startup did, 4 files to 7.
 * `subscribe`: content/load's catalog subscription (forgetCatalog tells it when the catalog is due again: the app came
 * back after a long while, or the editor published). Without it the catalog is read once per visit, as before.
 */
export interface ContentLoader {
  loadCatalog: () => Promise<Catalog>;
  loadUnit: (id: string) => Promise<Unit>;
  subscribe?: (onForget: () => void) => () => void;
}

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

/**
 * The catalog, read again whenever content/load forgets it (useAsync(loadCatalog) does the same for the screens that
 * may import content/load). A re-read keeps what is shown until the new list answers, and for good if it fails: a list
 * of course names is better a little old than gone.
 */
export function useCatalog(content: ContentLoader): { data?: Catalog; error?: Error; loading: boolean } {
  const [version, setVersion] = useState(0);
  const { subscribe } = content;
  useEffect(() => subscribe?.(() => setVersion((v) => v + 1)), [subscribe]);
  const [s, setS] = useState<{ data?: Catalog; error?: Error; loading: boolean }>({ loading: true });
  const now = useRef(s);
  now.current = s;
  const { loadCatalog } = content;
  useEffect(() => {
    let live = true;
    loadCatalog().then((data) => { if (live) setS({ data, loading: false }); },
      (error: Error) => { if (live && now.current.data === undefined) setS({ error, loading: false }); });
    return () => { live = false; };
  }, [loadCatalog, version]);
  return s;
}

/** A one-shot read that says when Retry is under way (`retrying`), so its error note can show a spinner. */
export interface Once<T> { data?: T; error?: unknown; loading: boolean; retrying: boolean; retry: () => void }

/**
 * As staff/LoadState's useRead (one read, again on retry(); other deps never show the previous one's data), and it says
 * when a retry is on its way. A retry keeps the error and the data on screen until its answer, so the note with the
 * focused Retry button stays where it is (the button shows a spinner and keeps the focus) instead of becoming a
 * spinner of the whole page. `load` null: nothing to read yet.
 */
export function useOnce<T>(load: (() => Promise<T>) | null, deps: unknown[]): Once<T> {
  const [n, setN] = useState(0);
  const key = JSON.stringify(deps);
  const [s, setS] = useState<{ data?: T; error?: unknown; key?: string; n?: number }>({});
  useEffect(() => {
    if (!load) return;
    let live = true;
    // Inside the promise, so a read that throws while it is built shows as an error instead of breaking the screen.
    Promise.resolve().then(load).then((data) => { if (live) setS({ data, key, n }); },
      (error: unknown) => { if (live) setS((p) => (p.key === key ? { data: p.data, error, key, n } : { error, key, n })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const retry = useCallback(() => setN((x) => x + 1), []);
  if (load === null) return { loading: false, retrying: false, retry };
  if (s.key !== key) return { loading: true, retrying: false, retry };
  // An answer for this key is shown; a later one (`n`) is still on its way.
  return { data: s.data, error: s.error, loading: false, retrying: s.n !== n, retry };
}
