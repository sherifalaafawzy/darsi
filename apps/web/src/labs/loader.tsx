/**
 * Loads a lab app on demand. Each app is its own small chunk (lab-<id>-*.js, vite.config.ts), kept out of the precache
 * and cached by the service worker the first time it opens ("darsi-labs"), or all at once with "Save all labs".
 * Import this only from modules in the startup bundle (Labs screens, lesson steps), never from a lazy chunk.
 */
import { Component, lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Button, EmptyState } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { loadPhrases } from "../i18n/phrases";
import { takeUpdate } from "../pwa";
import { labMeta } from "./catalog";
import type { LabProps } from "./types";

const loaders = import.meta.glob<{ default: ComponentType<LabProps> }>("./apps/*/index.tsx");
const pathOf = (id: string) => `./apps/${id}/index.tsx`;
export const hasLab = (id: string) => pathOf(id) in loaders;
const idOf = (path: string) => path.split("/")[2];
/** A lab's words in an added language (i18n/phrases.ts): the kit's and the catalogue's, then the app's own. */
const loadLabPhrases = (lang: string, id: string) => Promise.all([loadPhrases(lang, "labs"), loadPhrases(lang, `lab-${id}`)]);
/** Downloads every app chunk (for offline use), one after another, with its words in the page language. */
export async function saveAllLabs(onProgress: (done: number, total: number) => void, lang = "en") {
  const all = Object.entries(loaders);
  for (let i = 0; i < all.length; i++) { await Promise.all([all[i][1](), loadLabPhrases(lang, idOf(all[i][0]))]); onProgress(i + 1, all.length); }
}

const lazies = new Map<string, LazyExoticComponent<ComponentType<LabProps>>>();
const lazyLab = (id: string, lang: string) => {
  const key = `${id}:${lang}`;
  if (!lazies.has(key)) lazies.set(key, lazy(() => Promise.all([loaders[pathOf(id)](), loadLabPhrases(lang, id)]).then(([m]) => m)));
  return lazies.get(key)!;
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

/** What shows when a lab's chunk fails: offline, it isn't saved yet; online, this copy of Darsi is out of date. */
export function LabMissing({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  return online
    ? <EmptyState tone="offline" title={t("labs.outdated")} action={<Button size="sm" icon="sync" onClick={() => { void reloadForUpdate(); }}>{t("pwa.reload")}</Button>} />
    : <EmptyState tone="offline" title={t("labs.notSaved")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />;
}

/** A failed chunk (offline, never opened) shows a calm message with Retry instead of breaking the screen. */
class LabBoundary extends Component<{ id: string; fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
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
