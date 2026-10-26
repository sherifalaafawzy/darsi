import { useRef, useState } from "react";
import { AppBar, DownloadRow, EmptyState } from "@darsi/design-system";
import { loadCatalog, loadUnit, unitAssetUrls, useAsync } from "../content/load";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { cacheUrls, onMeteredConnection, removeCached } from "../platform";

export function Downloads() {
  const { t, L, lang, num } = useI18n();
  const { state, dispatch } = useStore();
  const { data: catalog } = useAsync(loadCatalog, []);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const aborts = useRef<Record<string, AbortController>>({});
  const units = catalog?.units.filter((u) => u.available) ?? [];
  const blocked = state.dataSaver && onMeteredConnection();

  const entryOf = (id: string) => units.find((u) => u.id === id);
  const download = async (id: string) => {
    const ctl = new AbortController(); aborts.current[id] = ctl;
    setErrors((e) => ({ ...e, [id]: false })); setProgress((p) => ({ ...p, [id]: 1 }));
    try {
      const unit = await loadUnit(id);
      await cacheUrls(unitAssetUrls(unit, lang, entryOf(id)), (d, n) => setProgress((p) => ({ ...p, [id]: Math.round((d / n) * 100) })), ctl.signal);
      dispatch({ type: "download", unit: id, on: true });
    } catch { if (!ctl.signal.aborted) setErrors((e) => ({ ...e, [id]: true })); }
    finally { setProgress((p) => { const n = { ...p }; delete n[id]; return n; }); }
  };
  const remove = async (id: string) => { const unit = await loadUnit(id); await removeCached(unitAssetUrls(unit, lang, entryOf(id))); dispatch({ type: "download", unit: id, on: false }); };

  return (
    <>
      <AppBar title={t("dl.title")} />
      <main className="screen narrow stack">
        {blocked && <p className="notice">{t("dl.dataSaver")}</p>}
        {units.length === 0 && <EmptyState icon="offline" title={t("dl.empty")} body={t("dl.emptyBody")} />}
        {units.map((u) => {
          const p = progress[u.id];
          const st = p !== undefined ? "downloading" : errors[u.id] ? "error" : state.downloads[u.id] ? "done" : "idle";
          return <div key={u.id} className="stack-sm">
            <DownloadRow track={u.track} title={L(u.title)} meta={t("dl.meta", { lessons: u.lessons, size: num(u.sizeMB, { maximumFractionDigits: 1 }) })} state={st} progress={p}
              onDownload={() => !blocked && download(u.id)} onCancel={() => aborts.current[u.id]?.abort()}
              downloadLabel={t("dl.download")} cancelLabel={t("dl.cancel")} doneLabel={t("dl.saved")} retryLabel={t("common.retry")} errorText={t("dl.failed")} />
            {st === "done" && <button type="button" className="link-btn" onClick={() => remove(u.id)}>{t("dl.remove")}</button>}
          </div>;
        })}
      </main>
    </>
  );
}
