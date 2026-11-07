/**
 * Loads a lab app on demand. Each app is its own small chunk (lab-<id>-*.js, vite.config.ts), kept out of the precache
 * and cached by the service worker the first time it opens ("darsi-labs"). "Save all labs" and a downloaded course pin
 * theirs in "darsi-saved" (platform/offline.ts), where they stay across app updates.
 * Import this only from modules in the startup bundle (Labs screens, lesson steps, Downloads), never from a lazy chunk.
 */
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Button, EmptyState } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { takeUpdate } from "../pwa";
import { pinGroups } from "../platform/offline";
import type { CodeLang } from "../content/types";
import { labMeta } from "./catalog";
import type { LabProps } from "./types";

const loaders = import.meta.glob<{ default: ComponentType<LabProps> }>("./apps/*/index.tsx");
const pathOf = (id: string) => `./apps/${id}/index.tsx`;
export const hasLab = (id: string) => pathOf(id) in loaders;
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
/** "Save all labs for offline": every lab's files, pinned so they stay on the phone across app updates. */
export async function saveAllLabs(onProgress: (done: number, total: number) => void) {
  const all = Object.values(loaders);
  await pinGroups(["labs"], {
    onProgress,
    warm: async () => { for (let i = 0; i < all.length; i++) { await all[i](); onProgress(i + 1, all.length); } },
  });
}

const lazies = new Map<string, LazyExoticComponent<ComponentType<LabProps>>>();
const lazyLab = (id: string) => {
  if (!lazies.has(id)) lazies.set(id, lazy(() => loaders[pathOf(id)]()));
  return lazies.get(id)!;
};

/**
 * After a deploy, a phone still running the previous version asks for that version's lab chunk, which the site no
 * longer has. Online, that is the cause: take the waiting new version (or reload) instead of blaming the connection.
 */
export async function reloadForUpdate() {
  const reg = typeof navigator !== "undefined" ? await navigator.serviceWorker?.getRegistration().catch(() => undefined) : undefined;
  await reg?.update().catch(() => {});
  await takeUpdate(reg);
}

/**
 * Whether Darsi's site really answers. A phone can say it is online while nothing gets through (no data left on the
 * bundle, a weak signal, a Wi-Fi sign-in page), and then the lab simply isn't saved. One tiny request (HEAD of sw.js,
 * never cached), given up after `ms`.
 */
export async function siteAnswers(ms = 3000): Promise<boolean> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    const r = await fetch("/sw.js", { method: "HEAD", cache: "no-store", signal: ctl?.signal });
    return r.ok && (r.headers.get("Content-Type") ?? "").includes("javascript");
  } catch { return false; } finally { clearTimeout(timer); }
}

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
    ? <EmptyState tone="offline" title={t("labs.outdated")} action={<Button size="sm" icon="sync" onClick={() => { void reloadForUpdate(); }}>{t("pwa.reload")}</Button>} />
    : <EmptyState tone="offline" title={t("labs.notSaved")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
}

/** A failed chunk (offline, never opened) shows a calm message with Retry instead of breaking the screen. */
class LabBoundary extends Component<{ id: string; fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  retry = () => { lazies.delete(this.props.id); this.setState({ failed: false }); };
  render() { return this.state.failed ? this.props.fallback(this.retry) : this.props.children; }
}

export function LabEmbed({ id, embedded, onDone }: { id: string; embedded?: boolean; onDone?: () => void }) {
  const { t } = useI18n();
  const meta = labMeta(id);
  if (!meta || !hasLab(id)) return <p className="notice">{t("labs.unknown")}</p>;
  const App = lazyLab(id);
  return (
    <LabBoundary key={id} id={id} fallback={(retry) => <LabMissing retry={retry} />}>
      <Suspense fallback={<div className="loading" aria-busy="true" />}><App meta={meta} embedded={embedded} onDone={onDone} /></Suspense>
    </LabBoundary>
  );
}
