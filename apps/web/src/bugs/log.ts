/**
 * What happened just before someone reports a problem (TECHNICAL.md "Problem reports"): the last errors, failed
 * requests and pages, kept in memory only and sent only inside a report. Startup code, so it stays tiny and imports
 * nothing; main.tsx starts it, App notes each page. Opening the report itself is `openReport()`, which the nav rail
 * also calls.
 */
export interface LogEntry { t: number; kind: "error" | "rejection" | "console" | "resource" | "request"; msg: string; stack?: string }
const MAX = 25;
const entries: LogEntry[] = [];
const pages: { t: number; path: string }[] = [];
const started = Date.now();

const cut = (s: unknown, n = 500) => String(s ?? "").slice(0, n);
/** Query values can hold invite codes and reset links: only the path is kept. */
const pathOf = (url: string) => { try { const u = new URL(url, location.href); return u.origin === location.origin ? u.pathname : `${u.origin}${u.pathname}`; } catch { return cut(url, 200); } };
function add(e: Omit<LogEntry, "t">) {
  entries.push({ t: Date.now(), ...e });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
}
const describe = (v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());

let on = false;
/** Listens for errors and failed requests from now on. Called once, at startup. */
export function startBugLog() {
  if (on || typeof window === "undefined") return;
  on = true;
  window.addEventListener("error", (e) => {
    const el = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    // A script, picture or stylesheet that failed to load reaches here (capture phase) without a message.
    if (el && el !== (window as unknown) && el.tagName) add({ kind: "resource", msg: `${el.tagName.toLowerCase()} ${pathOf(el.src || el.href || "")}` });
    else add({ kind: "error", msg: cut(e.message || describe(e.error)), stack: cut((e.error as Error | undefined)?.stack, 1200) || `${pathOf(e.filename || "")}:${e.lineno}:${e.colno}` });
  }, true);
  window.addEventListener("unhandledrejection", (e) => add({ kind: "rejection", msg: cut(describe(e.reason)), stack: cut((e.reason as Error | undefined)?.stack, 1200) || undefined }));
  const err = console.error.bind(console);
  console.error = (...a: unknown[]) => { add({ kind: "console", msg: cut(a.map(describe).join(" ")) }); err(...a); };
  // Requests that failed or were refused: method, path and status, never the body or the query.
  const f = window.fetch?.bind(window);
  if (f) window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    try {
      const r = await f(input, init);
      if (!r.ok && r.type !== "opaque") add({ kind: "request", msg: `${method} ${pathOf(url)} ${r.status}` });
      return r;
    } catch (e) {
      // A request its own code cancelled (the Firestore SDK does it all the time) isn't a problem.
      if ((e as Error | undefined)?.name !== "AbortError") add({ kind: "request", msg: `${method} ${pathOf(url)} failed: ${cut(describe(e), 200)}` });
      throw e;
    }
  };
}

/** App calls this on every page change. */
export function notePage(path: string) {
  if (pages[pages.length - 1]?.path === path) return;
  pages.push({ t: Date.now(), path: cut(path, 200) });
  if (pages.length > 15) pages.shift();
}

/** A copy of the log, for a report. */
export const bugLog = () => ({ since: started, entries: entries.map((e) => ({ ...e })), pages: pages.map((p) => ({ ...p })) });

/** Opens "Report a problem" from anywhere (the floating button, the nav rail). App's ReportBug listens. */
export const OPEN_REPORT = "darsi:report";
export const openReport = () => window.dispatchEvent(new Event(OPEN_REPORT));
