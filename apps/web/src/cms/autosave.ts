import { useEffect, useRef } from "react";

/** Changes save by themselves this long after the last one. */
export const AUTOSAVE_MS = 3000;

interface Options {
  /** The screen holds changes not saved yet. */
  dirty: boolean;
  /** Wait: something else runs (a save, a publish). The timer starts again once it is done. */
  paused: boolean;
  /** Never save by itself: someone else saved meanwhile, and saving would overwrite their work. */
  blocked: boolean;
  /** Anything that changes with each edit, so the timer starts again after the last one. */
  change: unknown;
  /** The quiet save (`quiet`: no message unless it fails). It reads the revision from a ref, not from state: a save
   *  queued behind another runs after that one has moved the revision on, sometimes after the screen has closed. */
  save: (quiet: boolean) => Promise<boolean>;
}

/**
 * Saves a draft by itself, as the course editor and the Languages page do: AUTOSAVE_MS after the last change, at once
 * when the tab is hidden (switching apps on a phone) and with Ctrl+S, and when the screen closes with changes left.
 * That last one covers the app's own navigation (the rail, the bottom nav, a link): BrowserRouter can't hold it with a
 * prompt, so the save goes out as the screen closes and Firestore's queue finishes it.
 *
 * Saves run one at a time (`run` queues a job behind the one in flight), so two never race with the same revision.
 * `skip()` is for a deliberate "Leave without saving" or a delete: the closing screen then saves nothing.
 */
export function useAutosave({ dirty, paused, blocked, change, save }: Options) {
  const now = useRef({ dirty, blocked, save });
  now.current = { dirty, blocked, save };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const skipped = useRef(false);
  const api = useRef({
    run<T>(job: () => Promise<T>): Promise<T> {
      const p = queue.current.then(job);
      queue.current = p.catch(() => undefined);
      return p;
    },
    /** `false` again when the screen goes on with another draft (the editor opening another unit). */
    skip(on = true) { skipped.current = on; },
  }).current;

  useEffect(() => {
    if (!dirty || paused || blocked) return;
    const id = setTimeout(() => { void api.run(() => now.current.save(true)); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [change, dirty, paused, blocked, api]);

  useEffect(() => {
    const flush = () => { const c = now.current; if (c.dirty && !c.blocked && !skipped.current) void api.run(() => now.current.save(true)); };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void api.run(() => now.current.save(false)); } };
    document.addEventListener("visibilitychange", hide);
    addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", hide); removeEventListener("keydown", key); flush(); };
  }, [api]);

  return api;
}
