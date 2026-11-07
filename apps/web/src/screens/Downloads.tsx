import { useEffect, useRef, useState } from "react";
import { AppBar, Button, DownloadRow, EmptyState } from "@darsi/design-system";
import { loadCatalog, loadUnit, setKeptVersions, unitAssetUrls, useAsync } from "../content/load";
import { useMine } from "../content/mine";
import { useI18n } from "../i18n";
import { useStore, type Download } from "../state/store";
import { cacheUrls, freeSpaceMB, isQuotaError, missingUrls, onMeteredConnection, persistStorage, removeCached, removeUnitMedia } from "../platform";
import { groupsSaved, pinGroups, readPins, setPins } from "../platform/offline";
import { CODE_STEPS, type CatalogEntry, type CodeLang, type Unit } from "../content/types";
import { RUNTIMES, runtimeScript } from "../content/runtimes";
import { prefetchCodeSteps } from "../code/loader";
import { hasLab, labGroup, LAB_MODEL, LAB_RUNTIMES, MODEL_BASE, MODEL_FILES, prefetchLabs } from "../labs/loader";
import { lightPacksOf, prefetchLightPacks } from "../lesson/LightLesson";
import { track } from "../analytics/track";

/** What downloading a course costs in this language (files in other languages fall back to English, as downloads do). */
export const downloadMB = (u: Pick<CatalogEntry, "sizeMB" | "sizeByLang"> | undefined, lang: string) =>
  u ? u.sizeByLang?.[lang] ?? u.sizeByLang?.en ?? u.sizeMB : 0;

/** The labs a course's lessons open. */
const labsOf = (unit: Unit) => [...new Set(unit.lessons.flatMap((l) => l.steps.flatMap((s) => (s.type === "lab" && hasLab(s.tool) ? [s.tool] : []))))];
const hasCode = (unit: Unit) => unit.lessons.some((l) => l.steps.some((s) => CODE_STEPS.has(s.type)));
/** One of the course's labs runs Darsi Tiny: Downloads offers to save the model too (it is not in the course's size). */
export const usesModel = (unit: Unit) => labsOf(unit).some((id) => LAB_MODEL.has(id));
/**
 * What a downloaded course needs besides its files (platform/offline.ts): the code steps, its labs and the packs its
 * light lessons draw with. They are pinned, so they stay on the phone across app updates.
 */
export async function unitGroups(unit: Unit): Promise<string[]> {
  const packs = await lightPacksOf(unit).catch(() => [] as string[]);
  return [...(hasCode(unit) ? ["code"] : []), ...labsOf(unit).map(labGroup), ...packs.map((p) => `pack:${p}`)];
}
/** A course's files in one language: kits, light lessons or videos, captions, and the runtimes its code and labs run in. */
export function downloadUrls(unit: Unit, lang: string): string[] {
  const runtimes = [...new Set(labsOf(unit).map((id) => LAB_RUNTIMES[id]).filter((r): r is CodeLang => !!r))];
  return [...new Set([...unitAssetUrls(unit, lang), ...runtimes.flatMap((r) => [runtimeScript(RUNTIMES[r].files[0]), RUNTIMES[r].files[1]])])];
}
/** Without a build manifest (development, the Chrome 61 build) the chunks are loaded the usual way instead. */
const warm = (unit: Unit) => () => Promise.all([hasCode(unit) ? prefetchCodeSteps() : null, prefetchLabs(labsOf(unit)), prefetchLightPacks(unit)]);

/** The groups that the downloads left and "Save all labs" need; null when one of those courses can't be read now. */
async function neededGroups(ids: string[]): Promise<string[] | null> {
  const groups = new Set<string>((await readPins()).includes("labs") ? ["labs"] : []);
  for (const id of ids) {
    const unit = await loadUnit(id).catch(() => null);
    if (!unit) return null;
    for (const g of await unitGroups(unit)) groups.add(g);
  }
  return [...groups];
}
/** The version a download kept (content/load.ts keeps that unit file through a republish); null: an old record, unknown. */
const keptVersion = (d: Download | undefined) => (d === undefined ? undefined : d === "done" ? null : d.v);

/** Darsi Tiny's download size in MB (its manifest, gzip sizes); null when it can't be read now. */
async function modelMB(): Promise<number | null> {
  try {
    const r = await fetch(`${MODEL_BASE}manifest.json`);
    const m = r.ok ? ((await r.json()) as { files?: Record<string, { gzip?: number }> }) : null;
    const total = Object.values(m?.files ?? {}).reduce((s, f) => s + (f.gzip ?? 0), 0);
    return total > 0 ? Math.max(0.1, Math.round(total / 1e5) / 10) : null;
  } catch { return null; }
}

const CHECKED = "darsi:offlineChecked";
const buildId = () => (typeof document !== "undefined" ? document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src : undefined) ?? "dev";
/**
 * Once per app version (App calls this): pins what every downloaded course needs and unpins what none does. It brings
 * downloads made before chunks were pinned up to date (their labs were never saved), and after an update it confirms that
 * the new version's files are here (public/offline-sw.js fetched them first). Online, when the phone is idle, and not
 * on mobile data with Data saver; nothing at all for someone with no downloads. It also tells the content loader which
 * version of each course was downloaded, so a republish never deletes the one that works offline.
 */
export function useOfflineRefresh() {
  const { state, ready } = useStore();
  const saver = state.dataSaver;
  const downloads = state.downloads;
  const key = Object.keys(downloads).sort().join(",");
  // Until the store is read, nothing is known: every older version stays.
  useEffect(() => { setKeptVersions((id) => (ready ? keptVersion(downloads[id]) : null)); }, [downloads, ready]);
  useEffect(() => {
    if (!ready || typeof caches === "undefined") return;
    const build = buildId();
    try { if (localStorage.getItem(CHECKED) === build) return; } catch { /* private mode: check every start */ }
    let live = true;
    const run = async () => {
      if (!live || !navigator.onLine || (saver && onMeteredConnection())) return;
      const groups = await neededGroups(key ? key.split(",") : []);
      if (!groups || !live) return;
      if (groups.length || (await readPins()).length) await setPins(groups);
      try { localStorage.setItem(CHECKED, build); } catch { /* private mode */ }
    };
    const go = () => {
      const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000));
      idle(() => { void run().catch(() => {}); });
    };
    if (navigator.onLine) go(); else window.addEventListener("online", go, { once: true });
    return () => { live = false; window.removeEventListener("online", go); };
  }, [ready, key, saver]);
}

export function Downloads() {
  const { t, L, lang, num } = useI18n();
  const { state, dispatch } = useStore();
  const { data: catalog, error, retry } = useAsync(loadCatalog, []);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, "failed" | "noSpace">>({});
  /** Saved courses that need fetching again: a newer version or another language ("update"), or files gone ("again"). */
  const [stale, setStale] = useState<Record<string, "update" | "again">>({});
  /** The course waiting for "Download anyway" (Data saver on mobile data). */
  const [ask, setAsk] = useState<string | null>(null);
  /** Saved courses whose labs run Darsi Tiny while the model isn't on the phone, and the model's size once known. */
  const [needModel, setNeedModel] = useState<Record<string, true>>({});
  const [model, setModel] = useState<{ mb: number | null; state: "" | "busy" | "failed" | "noSpace" }>({ mb: null, state: "" });
  const aborts = useRef<Record<string, AbortController>>({});
  const { isMine } = useMine();
  const units = catalog?.units.filter((u) => u.available && isMine(u)) ?? [];
  const metered = state.dataSaver && onMeteredConnection();
  const saved = JSON.stringify(state.downloads);

  // Is each saved course still whole, in this language and its published version? Read from this phone only.
  useEffect(() => {
    if (!catalog) return;
    let live = true;
    (async () => {
      const next: Record<string, "update" | "again"> = {};
      const tiny: Record<string, true> = {};
      let modelMissing: boolean | undefined;
      for (const [id, rec] of Object.entries(state.downloads)) {
        const entry = catalog.units.find((u) => u.id === id);
        if (!entry) continue;
        if (rec !== "done" && (rec.lang !== lang || rec.v !== (entry.version ?? 0))) { next[id] = "update"; continue; }
        const unit = await loadUnit(id).catch(() => null);
        if (!unit) continue;
        if ((await missingUrls(downloadUrls(unit, lang))).length || !(await groupsSaved(await unitGroups(unit)))) next[id] = "again";
        // A download from before versions were kept, and whole: record what it is.
        else if (rec === "done" && live) dispatch({ type: "download", unit: id, on: true, v: entry.version ?? 0, lang });
        if (usesModel(unit) && (modelMissing ??= (await missingUrls(MODEL_FILES)).length > 0)) tiny[id] = true;
      }
      if (!live) return;
      setStale(next);
      setNeedModel(tiny);
    })().catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, lang, saved]);
  // The model's size, read only when a saved course needs it.
  const wantModel = Object.keys(needModel).length > 0;
  useEffect(() => {
    if (!wantModel || model.mb !== null) return;
    let live = true;
    void modelMB().then((mb) => { if (live && mb !== null) setModel((m) => ({ ...m, mb })); });
    return () => { live = false; };
  }, [wantModel, model.mb]);

  const download = async (id: string, anyway = false) => {
    // Checked on the tap: the connection may have changed since the page drew.
    if (!anyway && state.dataSaver && onMeteredConnection()) { setAsk(id); return; }
    setAsk(null);
    const entry = catalog?.units.find((u) => u.id === id);
    const before = state.downloads[id];
    const ctl = new AbortController(); aborts.current[id] = ctl;
    setErrors(({ [id]: _, ...rest }) => rest); setProgress((p) => ({ ...p, [id]: 1 }));
    let stored: string[] = [];
    try {
      const free = await freeSpaceMB();
      if (free !== null && free < downloadMB(entry, lang) * 1.2) throw new DOMException("Not enough space", "QuotaExceededError");
      void persistStorage(); // a tap with clear intent: ask the browser to keep this site's storage
      const unit = await loadUnit(id);
      const urls = downloadUrls(unit, lang);
      stored = await cacheUrls(urls, (d, n) => setProgress((p) => ({ ...p, [id]: Math.max(1, Math.round((d / n) * 100)) })), ctl.signal);
      await pinGroups(await unitGroups(unit), { signal: ctl.signal, warm: warm(unit) });
      dispatch({ type: "download", unit: id, on: true, v: entry?.version ?? 0, lang });
      setStale(({ [id]: _, ...rest }) => rest);
      // An update (a new version, or another language): the files only the old download used leave.
      if (before) await removeUnitMedia(id, urls).catch(() => {});
      track("unit_download", { u: id, mb: Math.round(downloadMB(entry, lang)) });
    } catch (e) {
      if (ctl.signal.aborted) return;
      const full = isQuotaError(e);
      // A full phone: what this attempt stored goes again, so half a course doesn't sit there taking space.
      if (full) await removeCached([...stored, ...((e as { stored?: string[] }).stored ?? [])]).catch(() => {});
      setErrors((x) => ({ ...x, [id]: full ? "noSpace" : "failed" }));
    } finally {
      setProgress(({ [id]: _, ...rest }) => rest);
      delete aborts.current[id];
    }
  };
  const remove = async (id: string) => {
    const rec = state.downloads[id];
    const unit = await loadUnit(id).catch(() => null);
    const langs = [...new Set([lang, ...(rec && rec !== "done" ? [rec.lang] : [])])];
    if (unit) await removeCached([...new Set(langs.flatMap((l) => downloadUrls(unit, l)))]).catch(() => {});
    await removeUnitMedia(id).catch(() => {}); // every version and language of its media
    dispatch({ type: "download", unit: id, on: false });
    setStale(({ [id]: _, ...rest }) => rest);
    setNeedModel(({ [id]: _, ...rest }) => rest);
    // Chunks only this course needed leave too (the code steps, its labs and packs), unless another download uses them.
    const left = await neededGroups(Object.keys(state.downloads).filter((x) => x !== id)).catch(() => null);
    if (left) await setPins(left, { offline: true }).catch(() => {});
  };
  /** Darsi Tiny, once for every course (it stays when a course is removed: labs and other courses use it too). */
  const saveModel = async () => {
    setModel((m) => ({ ...m, state: "busy" }));
    try {
      const free = await freeSpaceMB();
      if (free !== null && model.mb !== null && free < model.mb * 1.2) throw new DOMException("Not enough space", "QuotaExceededError");
      void persistStorage();
      await cacheUrls(MODEL_FILES);
      setNeedModel({});
      setModel((m) => ({ ...m, state: "" }));
    } catch (e) {
      if (isQuotaError(e)) await removeCached(MODEL_FILES, { lib: true }).catch(() => {});
      setModel((m) => ({ ...m, state: isQuotaError(e) ? "noSpace" : "failed" }));
    }
  };

  return (
    <>
      <AppBar title={t("dl.title")} />
      <main className="screen narrow stack">
        {metered && <p className="notice">{t("dl.dataSaver")}</p>}
        {!catalog && !error && <div className="loading" aria-busy="true" />}
        {!catalog && error && <EmptyState tone="offline" title={t("pwa.offline")} action={<Button size="sm" icon="sync" onClick={retry}>{t("common.retry")}</Button>} />}
        {catalog && units.length === 0 && <EmptyState icon="offline" title={t("dl.empty")} body={t("dl.emptyBody")} />}
        {units.map((u) => {
          const p = progress[u.id];
          const again = stale[u.id];
          const size = num(downloadMB(u, lang), { maximumFractionDigits: 1 });
          const st = p !== undefined ? "downloading" : errors[u.id] ? "error" : state.downloads[u.id] && !again ? "done" : "idle";
          const modelSize = model.mb !== null ? num(model.mb, { maximumFractionDigits: 1 }) : null;
          return <div key={u.id} className="stack-sm">
            <DownloadRow track={u.track} title={L(u.title)} meta={t("dl.meta", { lessons: u.lessons, size })} state={st} progress={p}
              onDownload={() => { void download(u.id); }} onCancel={() => aborts.current[u.id]?.abort()}
              downloadLabel={again === "update" ? t("dl.update") : again === "again" ? t("dl.again") : t("dl.download")} cancelLabel={t("dl.cancel")} doneLabel={t("dl.saved")} retryLabel={t("common.retry")}
              errorText={errors[u.id] === "noSpace" ? t("dl.noSpace") : t("dl.failed")} />
            {ask === u.id && p === undefined && (
              <div className="notice stack-sm" role="alert">
                <p>{t("dl.askMetered", { size })}</p>
                <div><Button size="sm" variant="secondary" onClick={() => { void download(u.id, true); }}>{t("dl.anyway")}</Button></div>
              </div>
            )}
            {st === "done" && needModel[u.id] && modelSize !== null && (
              <div className="notice stack-sm">
                <p>{t("dl.model", { size: modelSize })}</p>
                <div><Button size="sm" variant="secondary" icon="offline" loading={model.state === "busy"} onClick={() => { void saveModel(); }}>{t("dl.modelSave", { size: modelSize })}</Button></div>
                {(model.state === "failed" || model.state === "noSpace") && <p className="notice err" role="alert">{t(model.state === "noSpace" ? "dl.noSpace" : "dl.failed")}</p>}
              </div>
            )}
            {(st === "done" || (again && st === "idle")) && <button type="button" className="link-btn" onClick={() => { void remove(u.id); }}>{t("dl.remove")}</button>}
          </div>;
        })}
      </main>
    </>
  );
}
