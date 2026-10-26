/**
 * Undo and redo for the course editor: the last 50 changes, in memory only. Typing in one place counts as one change
 * (edits with the same `group` less than a second apart merge); moves, inserts and deletes are each their own.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const LIMIT = 50;
const MERGE_MS = 1000;

interface State<T> { past: T[]; value: T; future: T[]; version: number }

export function useHistory<T>(initial: T) {
  const [h, setH] = useState<State<T>>({ past: [], value: initial, future: [], version: 0 });
  const last = useRef({ group: "", at: 0 });
  /** A new value. `group` (e.g. the item being typed in) merges quick edits; leave it out for a step of its own. */
  const set = useCallback((next: T, group = "") => {
    const now = Date.now();
    const merge = group !== "" && group === last.current.group && now - last.current.at < MERGE_MS;
    last.current = { group, at: now };
    setH((s) => ({ ...s, past: merge ? s.past : [...s.past, s.value].slice(-LIMIT), value: next, future: [] }));
  }, []);
  const undo = useCallback(() => {
    last.current.group = "";
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), value: s.past[s.past.length - 1], future: [s.value, ...s.future], version: s.version + 1 } : s));
  }, []);
  const redo = useCallback(() => {
    last.current.group = "";
    setH((s) => (s.future.length ? { past: [...s.past, s.value], value: s.future[0], future: s.future.slice(1), version: s.version + 1 } : s));
  }, []);
  /** Start over from `v` (a loaded unit): nothing to undo. */
  const reset = useCallback((v: T) => { last.current.group = ""; setH((s) => ({ past: [], value: v, future: [], version: s.version + 1 })); }, []);
  return {
    value: h.value, set, undo, redo, reset,
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
    /** Changes on every undo, redo and reset, so forms that keep their own text can start again from the value. */
    version: h.version,
  };
}

/** Ctrl+Z / Cmd+Z undoes, Ctrl+Y / Ctrl+Shift+Z redoes, everywhere on the page (text fields included, so one history). */
export function useUndoKeys(undo: () => void, redo: () => void, on = true) {
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [undo, redo, on]);
}
