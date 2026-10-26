import { useEffect, useState } from "react";
import { AppBar, Button, ClassroomKit, EmptyState } from "@darsi/design-system";
import { loadCatalog, loadUnit, useAsync } from "../content/load";
import { kitUrl, type KitFile } from "../content/types";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import { saveFile } from "../platform";

type KitFmt = "pdf" | "pptx" | "mp4";
/** Stable id for a kit file across formats, whether it uses `base` (kits), `path` (media) or uploaded `urls` (course editor). */
const fileId = (f: KitFile, lessonId: string) => f.base ?? f.path ?? `${lessonId}/${f.kind}`;
const fileKey = (f: KitFile, fmt: KitFmt, lessonId: string) => `${fileId(f, lessonId)}.${fmt}`;

export function Kit() {
  const { t } = useI18n();
  const { data: catalog } = useAsync(loadCatalog, []);
  const available = (catalog?.units ?? []).filter((u) => u.available);
  useEffect(() => { const id = location.hash.slice(1); if (id) setTimeout(() => document.getElementById(`kit-${id}`)?.scrollIntoView({ block: "start" }), 300); }, [catalog]);
  return (
    <>
      <AppBar title={t("kit.title")} />
      <main className="screen">
        {available.map((u) => <UnitKit key={u.id} id={u.id} />)}
      </main>
    </>
  );
}

function UnitKit({ id }: { id: string }) {
  const { t, L, lang } = useI18n();
  const { state } = useStore();
  const { data: unit } = useAsync(() => loadUnit(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!unit) return <div className="loading" aria-busy="true" />;
  const any = unit.lessons.some((l) => state.progress[l.id]);
  const get = async (f: KitFile, fmt: KitFmt, lessonId: string) => {
    const key = fileKey(f, fmt, lessonId); setBusy(key); setFailed(null);
    try { await saveFile(kitUrl(f, lang, fmt), `darsi-${fileId(f, lessonId).replace(/[/{}]+/g, "-")}-${lang}.${fmt}`); }
    catch { setFailed(key); } finally { setBusy(null); }
  };
  return (
    <section className="stack-lg">
      {!any && <EmptyState icon="award" title={L(unit.title)} body={t("kit.locked")} />}
      {unit.lessons.map((l, i) => {
        const unlocked = !!state.progress[l.id];
        return (
          <div key={l.id} id={`kit-${l.id}`} className="kit-lesson">
            <ClassroomKit track={unit.track} kicker={`${t("kit.kicker")}${t("common.sep")}${t("common.lessonN", { n: i + 1 })}`} title={L(l.title)} subtitle={unlocked ? t("kit.subtitle") : t("kit.locked")}
              items={l.kit.map((f) => ({
                kind: f.kind === "slides" || f.kind === "video" ? "slides" : f.kind === "worksheet" ? "worksheet" : "lesson-plan",
                kindLabel: f.kind === "slides" ? t("kit.slides") : f.kind === "video" ? t("kit.mp4") : t("kit.plan"),
                title: L(f.title), meta: t("kit.pages", { n: f.pages }), locked: !unlocked,
                actions: <KitActions file={f} lessonId={l.id} busy={busy} failed={failed} onGet={get} />,
              }))} />
          </div>
        );
      })}
    </section>
  );
}

const FMT_ICON = { pdf: "file", pptx: "file", mp4: "video" } as const;
const FMT_LABEL = { pdf: "kit.pdf", pptx: "kit.pptx", mp4: "kit.mp4" } as const;

function KitActions({ file, lessonId, busy, failed, onGet }: { file: KitFile; lessonId: string; busy: string | null; failed: string | null; onGet: (f: KitFile, fmt: KitFmt, lessonId: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      {file.formats.map((fmt) => {
        const key = fileKey(file, fmt, lessonId);
        return <Button key={fmt} size="sm" variant={fmt === "pdf" ? "secondary" : "ghost"} icon={failed === key ? "sync" : FMT_ICON[fmt]} loading={busy === key} onClick={() => onGet(file, fmt, lessonId)}>
          {busy === key ? t("kit.downloading") : failed === key ? t("common.retry") : t(FMT_LABEL[fmt])}
        </Button>;
      })}
    </>
  );
}
