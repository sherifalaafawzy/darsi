import { useState } from "react";
import { Button } from "@darsi/design-system";
import { useI18n } from "../i18n";
import type { LightLesson, LightPkg } from "../lesson/LightLesson";

/** The light player, passed in by App: importing lesson/LightLesson here split the startup bundle into seven files. */
export type ExplainerPlayer = typeof LightLesson | null;

/**
 * An explainer the tutor agent made (functions/src/explainer.ts): a Lesson Studio package of a few KB that the light
 * player draws on the phone. It waits for Watch when typing (silent, with captions); in a call it starts by itself,
 * under the tutor's voice.
 */
export function ExplainerCard({ pkg, lang, autoplay = false, Player }: { pkg: LightPkg & { manifest: { title?: Record<string, string>; languages: { code: string; duration?: number }[] } }; lang: string; autoplay?: boolean; Player: ExplainerPlayer }) {
  const { t, num } = useI18n();
  const [open, setOpen] = useState(autoplay);
  const [failed, setFailed] = useState(false);
  const title = pkg.manifest.title?.[lang] ?? "";
  const secs = Math.round(pkg.manifest.languages[0]?.duration ?? 0);
  if (!Player || failed) return <p className="muted small">{t("tu.explainerFailed")}</p>;
  return (
    <div className="tu-explainer stack-sm">
      <p className="tu-explainer-title"><span dir="auto">{title}</span> <span className="muted small">{t("tu.explainerLength", { n: num(secs) })}</span></p>
      {open
        ? <Player pkg={pkg} lang={lang} start poster={<p className="muted small">{t("tu.explainerLoading")}</p>} onEvent={() => {}} onError={() => setFailed(true)} />
        : <div><Button size="sm" icon="play" onClick={() => setOpen(true)}>{t("tu.watch")}</Button></div>}
    </div>
  );
}
