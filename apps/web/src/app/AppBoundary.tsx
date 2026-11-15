/**
 * What shows when part of the app fails, so that it never goes blank. Startup code: it imports nothing from Firebase,
 * nothing a lazy chunk owns, and has no import() of its own (App hands it the report sheet's loader).
 *
 * Two things fail in the field:
 * - a chunk that can't load. After a deploy, a tab still running the previous version asks for a file the site no
 *   longer has (a 404); offline, a staff screen or the tutor was never saved on the phone. The import rejects, and
 *   without a boundary React takes the whole app off the page.
 * - a render error in one screen.
 *
 * `RouteBoundary` keeps such a failure to the page it happened on: the nav, the update toast and "Report a problem"
 * stay, and it clears when the address changes, so one broken page never blocks the others. `AppBoundary` is the last
 * line, around everything under the account: a calm card that needs no store, no i18n and no router. Nothing here
 * reloads by itself (two failures in a row would loop): Reload is always a button.
 *
 * Both tell the rest of the app with a `darsi:app-error` window event (APP_ERROR), once per error.
 */
import { Component, createElement, lazy, useEffect, useMemo, useState, type ComponentProps, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button, EmptyState } from "@darsi/design-system";
import { I18nProvider, useI18n } from "../i18n";
import { reloadForUpdate, siteAnswers } from "../pwa";
import { openReport } from "../bugs/log";
import type { About, Shot } from "../bugs/Report";
import { k, WORDS } from "./strings";

/** The window event both boundaries (and main.tsx, for Vite's own preload failures) send. */
export const APP_ERROR = "darsi:app-error";
export interface AppErrorDetail { name: string; message: string; stack: string; chunk: boolean }

/** Errors that came out of a lazyRetry import, and errors already told (the same object reaches us more than once). */
const chunkErrors = new WeakSet<object>();
const told = new WeakSet<object>();
/** A failed import() as each browser words it, for lazy components made elsewhere (React.lazy in a page). */
const CHUNK = /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (?:CSS )?chunk|ChunkLoadError/i;
const isObject = (v: unknown): v is object => (typeof v === "object" || typeof v === "function") && v !== null;
export const isChunkError = (e: unknown) => (isObject(e) && chunkErrors.has(e)) || CHUNK.test(String((e as { message?: unknown } | null)?.message ?? e));

/** Sends APP_ERROR for an error, once: Vite's preload event and the boundary both see the same rejected import. */
export function tellAppError(error: unknown, chunk = isChunkError(error)) {
  if (typeof window === "undefined") return;
  if (isObject(error)) { if (told.has(error)) return; told.add(error); }
  const e = error instanceof Error ? error : new Error(String(error));
  const detail: AppErrorDetail = { name: e.name, message: String(e.message).slice(0, 500), stack: String(e.stack ?? "").slice(0, 2000), chunk };
  try { window.dispatchEvent(new CustomEvent<AppErrorDetail>(APP_ERROR, { detail })); } catch { /* a browser without CustomEvent: nothing listens */ }
}

/** Lazy screens whose import failed: each gets a new React.lazy before the next try (React.lazy keeps a rejection). */
const stale = new Set<() => void>();
function renewLazies() {
  const all = [...stale];
  stale.clear();
  all.forEach((renew) => renew());
}

/**
 * React.lazy whose import can be tried again. React.lazy remembers a rejected import for good, so a Retry button would
 * show the same failure without asking the network; here the lazy component sits in a holder that the boundaries
 * replace (renewLazies: on Retry, when the address changes, and when a boundary mounts), as labs/loader.tsx does for labs.
 * A failed import is marked as a chunk failure, whatever words the browser used for it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any component's props, as React.lazy has it
export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): ComponentType<ComponentProps<T>> {
  let current: LazyExoticComponent<T>;
  const renew = () => { current = lazy(load); };
  const load = () => factory().catch((e: unknown) => {
    const error = e instanceof Error ? e : new Error(String(e));
    chunkErrors.add(error);
    stale.add(renew);
    throw error;
  });
  renew();
  // Not renewed while this render waits or fails: only a boundary does that, or a rejection would ask again for ever.
  return function Lazy(props: ComponentProps<T>) { return createElement(current as unknown as ComponentType<ComponentProps<T>>, props); };
}

/** The report sheet's chunk (bugs/Report.tsx), as App loads it. */
type ReportLoader = () => Promise<Pick<typeof import("../bugs/Report"), "capture" | "ReportSheet">>;
/**
 * Whose report the card's sheet sends, as bugs/Fab.tsx works it out for the app's own button: App reads it from the
 * account above AppBoundary (the one provider that is still there). `getToken` is null for an account that is signed
 * in on this device but offline before the SDK loaded; the server keeps who sent a report from a verified token only.
 */
export interface Reporter { uid: string; name: string | null; offline?: boolean; getToken: (() => Promise<string>) | null }

/** What a boundary hands its fallback: the error, whether a chunk failed to load, and a way to try again. */
export interface Failure { error: unknown; chunk: boolean; retry: () => void }
type Fallback = (failure: Failure) => ReactNode;

interface BoundaryProps { at?: string; fallback: Fallback; children: ReactNode }
/** `at`: where it was caught (undefined until the render after the catch says where). */
interface BoundaryState { caught: { error: unknown; chunk: boolean; at?: string | null } | null }
/**
 * `at`: the address. A failure clears when the address is no longer the one it happened at (not a React key: a healthy
 * page must not remount because a parameter in its address changed).
 */
class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { caught: null };
  constructor(props: BoundaryProps) {
    super(props);
    renewLazies(); // a part closed after it failed (the tutor's panel) and opened again asks the network again
  }
  static getDerivedStateFromError(error: unknown): BoundaryState { return { caught: { error, chunk: isChunkError(error) } }; }
  /** The render right after a catch notes the address, so a page that fails as it opens isn't taken for a move away. */
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): BoundaryState | null {
    return state.caught && state.caught.at === undefined ? { caught: { ...state.caught, at: props.at ?? null } } : null;
  }
  componentDidCatch(error: unknown) {
    tellAppError(error);
    console.error(error); // also lands in the "Report a problem" log (bugs/log.ts)
  }
  componentDidUpdate() {
    const caught = this.state.caught;
    if (caught && caught.at !== undefined && caught.at !== (this.props.at ?? null)) this.retry(); // moved on: the new page gets its try
  }
  retry = () => { renewLazies(); this.setState({ caught: null }); };
  render() {
    const caught = this.state.caught;
    return caught ? this.props.fallback({ error: caught.error, chunk: caught.chunk, retry: this.retry }) : this.props.children;
  }
}

/**
 * Why a chunk didn't load, as LabMissing works it out for labs: the site answers, so this copy of Darsi is out of date
 * ("outdated"); or nothing gets through, so it simply isn't saved on this phone yet ("missing"). null while it asks;
 * "error" for anything that isn't a chunk.
 */
export function useChunkCause(chunk: boolean): "outdated" | "missing" | "error" | null {
  const said = typeof navigator === "undefined" || navigator.onLine !== false;
  const [online, setOnline] = useState<boolean | null>(said ? null : false);
  useEffect(() => {
    if (!chunk || !said) return;
    let live = true;
    void siteAnswers().then((ok) => { if (live) setOnline(ok); });
    return () => { live = false; };
  }, [chunk, said]);
  return !chunk ? "error" : online === null ? null : online ? "outdated" : "missing";
}

const reload = () => { void reloadForUpdate(); };

/**
 * Reload on a "Darsi was updated" card (here and labs/loader.tsx). The tap can take up to 15 s while the new version
 * finishes saving on the phone (reloadForUpdate), so the button shows that it is working. Never reset: the page reloads.
 */
export function UpdateReload({ label, size }: { label: string; size?: "sm" }) {
  const [busy, setBusy] = useState(false);
  return <Button size={size} icon="sync" loading={busy} onClick={() => { setBusy(true); void reloadForUpdate(); }}>{label}</Button>;
}

/** A page that failed, in the page's place: the app's frame around it stays as it was. */
function PageError({ chunk, retry }: Failure) {
  const { t } = useI18n();
  const cause = useChunkCause(chunk);
  if (cause === null) return <div className="loading" aria-busy="true" />;
  return (
    <main className="screen narrow">
      {cause === "outdated" ? <EmptyState tone="offline" icon="sync" title={t(k("shell.outdated"))} action={<UpdateReload label={t("pwa.reload")} />} />
        : cause === "missing" ? <EmptyState tone="offline" title={t(k("shell.notSaved"))} action={<Button icon="sync" onClick={retry}>{t("common.retry")}</Button>} />
        : <EmptyState tone="error" title={t(k("shell.pageError"))} body={t("err.body")} action={<Button onClick={retry}>{t("common.retry")}</Button>}
            secondary={<><Button variant="secondary" icon="sync" onClick={reload}>{t("pwa.reload")}</Button><Button variant="ghost" icon="bug" onClick={openReport}>{t("bug.button")}</Button></>} />}
    </main>
  );
}
const pageError: Fallback = (failure) => <PageError {...failure} />;

/**
 * Around a page (or a part of one, with its own `fallback`): a chunk that won't load says whether Darsi was updated
 * (take the update and reload) or the page isn't on this phone yet (Retry asks again); any other error offers Retry,
 * Reload and "Report a problem". Inside the router and the i18n provider.
 */
export function RouteBoundary({ children, fallback = pageError }: { children: ReactNode; fallback?: Fallback }) {
  return <Boundary at={useLocation().pathname} fallback={fallback}>{children}</Boundary>;
}

/** The page's language, when it is one the card has words for. */
function pageLang(): "en" | "ar" | null {
  const lang = (typeof document === "undefined" ? "" : document.documentElement.lang || "").toLowerCase();
  return lang.startsWith("ar") ? "ar" : lang.startsWith("en") ? "en" : null;
}

/**
 * The whole app failed. No provider is left under AppBoundary, so: the words straight from the dictionaries, in the
 * page's language (both when it is neither), and a report sheet of its own, since App's "Report a problem" went with
 * the tree. The sheet gets the account App handed in (`who`; none for a guest) and what failed; the store went with the
 * tree, so nothing about the learner's settings (the log holds the rest).
 */
function Crashed({ error, loadReport, who }: { error: unknown; loadReport?: ReportLoader; who?: Reporter | null }) {
  const lang = pageLang();
  const [sheet, setSheet] = useState<{ mod: Awaited<ReturnType<ReportLoader>>; shot: Shot | null; at: number } | null>(null);
  const [report, setReport] = useState<"idle" | "busy" | "failed">("idle");
  const about = useMemo<About>(() => ({
    who: who ? who.name || who.uid : null,
    // Only the uid, as the app's own button sends it (bugs/Fab.tsx): the server takes the rest from the verified token.
    account: who ? (who.offline ? { uid: who.uid, offline: true } : { uid: who.uid }) : null,
    learner: { crashed: String(error instanceof Error ? `${error.name}: ${error.message}` : error).slice(0, 500) },
  }), [error, who]);
  const open = async () => {
    if (!loadReport) return;
    setReport("busy");
    try {
      const mod = await loadReport();
      setSheet({ mod, shot: await mod.capture(), at: Date.now() });
      setReport("idle");
    } catch { setReport("failed"); } // the report's chunk isn't on this phone, and it's offline
  };
  return (
    <main className="screen narrow">
      {(lang ? [lang] : (["en", "ar"] as const)).map((l) => (
        // Arabic on a page in another language uses the phone's font (no web font download for one card).
        <div key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} className={l === "ar" && lang !== "ar" ? "dr-other-script" : undefined}>
          <EmptyState tone="error" title={WORDS[l]["shell.crashT"]} body={WORDS[l][report === "failed" ? "shell.reportFailed" : "shell.crashB"]}
            action={<Button icon="sync" onClick={reload}>{WORDS[l]["shell.reload"]}</Button>}
            secondary={loadReport && report !== "failed" && <Button variant="ghost" icon="bug" loading={report === "busy"} onClick={() => { void open(); }}>{WORDS[l]["shell.report"]}</Button>} />
        </div>
      ))}
      {/* If the sheet itself fails, it goes and the card stays; asking again opens a new one (the key). */}
      {sheet && <Boundary key={sheet.at} fallback={() => null}><I18nProvider lang={document.documentElement.lang || "en"}>
        <sheet.mod.ReportSheet shot={sheet.shot} about={about} uid={who?.uid ?? null} getToken={who?.getToken ?? null} onClose={() => setSheet(null)} />
      </I18nProvider></Boundary>}
    </main>
  );
}

/**
 * Around everything under the account (App): a failure no page boundary caught shows the card, never a blank page.
 * `report`: how to load the report sheet's chunk (`() => import("./bugs/Report")`, from App: this file stays free of
 * import() so that nothing here can move startup code into another chunk); without it the card has no Report button.
 * `who`: the account, so a signed-in person's report of the crash still says whose it is (anonymous without it).
 */
export function AppBoundary({ children, report, who }: { children: ReactNode; report?: ReportLoader; who?: Reporter | null }) {
  return <Boundary fallback={({ error }) => <Crashed error={error} loadReport={report} who={who} />}>{children}</Boundary>;
}
