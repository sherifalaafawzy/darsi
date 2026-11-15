/**
 * Loads a lab app on demand. Each app is its own small chunk (lab-<id>-*.js, vite.config.ts), kept out of the precache
 * and cached by the service worker the first time it opens ("darsi-labs"). "Save all labs" and a downloaded course pin
 * theirs in "darsi-saved" (platform/offline.ts), where they stay across app updates.
 * Import this only from modules in the startup bundle (Labs screens, lesson steps, Downloads), never from a lazy chunk.
 */
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Button, EmptyState } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { loadPhrases } from "../i18n/phrases";
import { reloadForUpdate, siteAnswers } from "../pwa";
import { tellAppError, UpdateReload } from "../app/AppBoundary";
import { pinGroups } from "../platform/offline";
import type { CodeLang } from "../content/types";
import { labMeta } from "./catalog";
import type { LabProps } from "./types";

const loaders = import.meta.glob<{ default: ComponentType<LabProps> }>("./apps/*/index.tsx");
const pathOf = (id: string) => `./apps/${id}/index.tsx`;
export const hasLab = (id: string) => pathOf(id) in loaders;
const idOf = (path: string) => path.split("/")[2];
/** A lab's words in an added language (i18n/phrases.ts): the kit's and the catalogue's, then the app's own. */
const loadLabPhrases = (lang: string, id: string) => Promise.all([loadPhrases(lang, "labs"), loadPhrases(lang, `lab-${id}`)]);
/** The offline group of a lab (platform/offline.ts). */
export const labGroup = (id: string) => `lab:${id}`;
/**
 * Labs that run code in the sandbox, and in which runtime: a downloaded course with one of them also saves that runtime
 * (tests/offline.test.ts checks this list against the labs' code).
 */
export const LAB_RUNTIMES: Partial<Record<string, CodeLang>> = { board: "python", bugs: "python", modeller: "python", trace: "python", sqlplay: "sql" };
/**
 * Labs that run Darsi Tiny, the small model at TINYLM_BASE (src/tinylm; the path is repeated here so the startup bundle
 * never imports the model's code). A downloaded course with one of them offers to save the model too, with its size
 * (Downloads). tests/offline.test.ts checks the list and the path against the labs' code.
 */
export const LAB_MODEL = new Set(["agentloop", "approve", "costs", "evals", "guardrails", "inject", "memory", "planner", "privilege", "redteam", "teach", "team", "tools"]);
export const MODEL_BASE = "/lib/tinylm/v1/";
/**
 * The model's files, as the labs fetch them (replay.json only when a lab teaches it something new). model.bin last: the
 * labs take it as the sign that the model is on the phone (isDownloaded), so a save cut short never leaves it alone.
 */
export const MODEL_FILES = ["manifest.json", "tokenizer.json", "world.json", "replay.json", "model.bin"].map((f) => MODEL_BASE + f);
/** Loads these labs' chunks the usual way (development, and the Chrome 61 build, which keeps what it has used). */
export async function prefetchLabs(ids: string[]) {
  for (const id of new Set(ids)) if (hasLab(id)) await loaders[pathOf(id)]().catch(() => undefined);
}
/**
 * "Save all labs for offline": every lab's files, pinned so they stay on the phone across app updates, and their words in
 * the page language (i18n/phrases.ts; "darsi-content" keeps them), which pinning doesn't fetch.
 */
export async function saveAllLabs(onProgress: (done: number, total: number) => void, lang = "en") {
  const all = Object.values(loaders);
  await pinGroups(["labs"], {
    onProgress,
    warm: async () => { for (let i = 0; i < all.length; i++) { await all[i](); onProgress(i + 1, all.length); } },
  });
  await Promise.all(Object.keys(loaders).map((p) => loadLabPhrases(lang, idOf(p))));
}

const lazies = new Map<string, LazyExoticComponent<ComponentType<LabProps>>>();
const lazyLab = (id: string, lang: string) => {
  const key = `${id}:${lang}`;
  if (!lazies.has(key)) lazies.set(key, lazy(() => Promise.all([loaders[pathOf(id)](), loadLabPhrases(lang, id)]).then(([m]) => m)));
  return lazies.get(key)!;
};

// Moved to pwa.tsx, where the app's own boundaries (app/AppBoundary.tsx) use them too; re-exported for existing imports.
export { reloadForUpdate, siteAnswers };

/** What shows when a lab's chunk fails: offline (or no data getting through), it isn't saved yet; online, this copy of Darsi is out of date. */
export function LabMissing({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  const said = typeof navigator === "undefined" || navigator.onLine !== false;
  const [online, setOnline] = useState<boolean | null>(said ? null : false);
  useEffect(() => {
    if (!said) return;
    let live = true;
    void siteAnswers().then((ok) => { if (live) setOnline(ok); });
    return () => { live = false; };
  }, [said]);
  if (online === null) return <div className="loading" aria-busy="true" />;
  return online
    ? <EmptyState tone="offline" title={t("labs.outdated")} action={<UpdateReload size="sm" label={t("pwa.reload")} />} />
    : <EmptyState tone="offline" title={t("labs.notSaved")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
}

/** A failed chunk (offline, never opened) shows a calm message with Retry instead of breaking the screen. */
class LabBoundary extends Component<{ id: string; fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { tellAppError(error); } // the same "darsi:app-error" the app's boundaries send
  retry = () => { for (const k of lazies.keys()) if (k.startsWith(`${this.props.id}:`)) lazies.delete(k); this.setState({ failed: false }); };
  render() { return this.state.failed ? this.props.fallback(this.retry) : this.props.children; }
}

export function LabEmbed({ id, embedded, onDone }: { id: string; embedded?: boolean; onDone?: () => void }) {
  const { t, lang } = useI18n();
  const meta = labMeta(id);
  if (!meta || !hasLab(id)) return <p className="notice">{t("labs.unknown")}</p>;
  const App = lazyLab(id, lang);
  return (
    <LabBoundary key={id} id={id} fallback={(retry) => <LabMissing retry={retry} />}>
      <Suspense fallback={<div className="loading" aria-busy="true" />}><App meta={meta} embedded={embedded} onDone={onDone} /></Suspense>
    </LabBoundary>
  );
}
