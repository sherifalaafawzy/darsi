import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { errorText } from "./errors";
import { k } from "./strings";

/** A one-shot read as the staff screens hold it (admin/data.ts useOnce, useRead below): never a live listener. */
export interface Read<T> { data?: T; error?: unknown; loading: boolean; reload: () => void }

/**
 * One read, and again on reload() (after the screen's own write, or Retry). A reload keeps what is shown until the new
 * answer is there, and a reload that fails keeps the older data beside its error; other `deps` (another person,
 * another organization) never show the previous one's data. `load` null: nothing to read yet.
 */
export function useRead<T>(load: (() => Promise<T>) | null, deps: unknown[]): Read<T> {
  const [n, setN] = useState(0);
  const key = JSON.stringify(deps);
  const [s, setS] = useState<{ data?: T; error?: unknown; key?: string }>({});
  useEffect(() => {
    if (!load) return;
    let live = true;
    // Inside the promise, so a query that throws while it is built shows as an error instead of breaking the screen.
    Promise.resolve().then(load).then((data) => { if (live) setS({ data, key }); },
      (error: unknown) => { if (live) setS((p) => (p.key === key ? { data: p.data, error, key } : { error, key })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  const loading = load !== null && s.key !== key;
  return s.key !== key ? { loading, reload } : { data: s.data, error: s.error, loading, reload };
}

/** Nothing to list: no answer, or an empty list. */
const nothing = (data: unknown) => data == null || (Array.isArray(data) && !data.length);

/**
 * The three states every staff read has, said the same way everywhere:
 * - still loading, nothing to show yet: a spinner that screen readers hear as "Loading";
 * - failed, nothing to show: the reason in the person's language and Retry, and never `empty` ("Nobody yet" under a
 *   read that failed once led an admin to import the same people twice);
 * - data: the children; `empty` instead when there is nothing in it. If a later reload failed, the older data stays
 *   with a small notice above it.
 */
export function LoadState<T>({ q, empty, children }: { q: Read<T>; empty?: ReactNode; children: (data: T) => ReactNode }) {
  const { t } = useI18n();
  const has = q.data !== undefined;
  if (!has && q.error !== undefined) return <ErrorNote error={q.error} reload={q.reload} />;
  if (!has) {
    // Not loading and no data: a read that hasn't been asked for (useRead(null)). Nothing to say.
    // dr-video-sr is the design system's visually hidden text, the only such class every screen has loaded.
    return q.loading ? <div className="row-gap" role="status"><span className="dr-spinner" aria-hidden="true" /><span className="dr-video-sr">{t(k("st.loading"))}</span></div> : null;
  }
  return (
    <>
      {q.error !== undefined && <ErrorNote error={q.error} reload={q.reload} stale />}
      {empty !== undefined && nothing(q.data) ? empty : children(q.data as T)}
    </>
  );
}

/**
 * Why something failed, in the person's language, with Retry when there is a `reload`. `stale`: older data is still
 * shown under it. The words are worked out once per error, not per render (errorText logs the raw error each time).
 */
export function ErrorNote({ error, reload, stale }: { error: unknown; reload?: () => void; stale?: boolean }) {
  const { t } = useI18n();
  const text = useMemo(() => errorText(error, t), [error, t]);
  return (
    <div className="notice err row-gap" role="alert">
      <span>{stale && `${t(k("st.stale"))} `}{text}</span>
      {reload && <Button size="sm" variant="ghost" icon="sync" onClick={reload}>{t("common.retry")}</Button>}
    </div>
  );
}
