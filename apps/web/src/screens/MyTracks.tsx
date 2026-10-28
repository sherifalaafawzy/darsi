import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, ChoiceCard, type IconName } from "@darsi/design-system";
import { loadCatalog, useAsync } from "../content/load";
import { useMine } from "../content/mine";
import { useTracks } from "../content/settings";
import { audienceOf, type Track } from "../content/types";
import { PlacementQuiz } from "./Onboarding";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";

/**
 * Add or remove tracks. Home shows one of them at a time (the switcher at its top). Removing a track only hides it:
 * its progress stays, and adding it back brings everything back. At least one track stays. Each track's level can be
 * checked again here (the onboarding check, for that track only), and a track just added offers it.
 */
export function MyTracks() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { state, dispatch } = useStore();
  const tracks = useTracks();
  const mine = useMine();
  const { data: catalog } = useAsync(loadCatalog, []);
  const [warn, setWarn] = useState(false);
  const [checking, setChecking] = useState<Track | null>(null);
  const [added, setAdded] = useState<Track | null>(null);
  const chosen = mine.tracks.map((x) => x.id);
  const courses = (id: string) => (catalog?.units ?? []).filter((u) => u.track === id && u.available && audienceOf(u) === mine.audience).length;
  const toggle = (id: string) => {
    const on = chosen.includes(id);
    if (on && chosen.length === 1) { setWarn(true); return; }
    setWarn(false);
    setAdded(on ? null : id);
    // A track just added is the one Home shows next.
    dispatch({ type: "set", patch: on ? { tracks: chosen.filter((x) => x !== id) } : { tracks: [...chosen, id], track: id } });
  };
  if (checking) return <PlacementQuiz tracks={[checking]} onClose={() => setChecking(null)}
    onDone={(lv) => { dispatch({ type: "set", patch: { levels: { ...state.levels, ...lv } } }); setChecking(null); setAdded(null); }} />;
  const levelOf = (id: Track) => Math.min(state.levels[id] ?? 1, tracks.of(id).levels);
  return (
    <>
      <AppBar title={t("tracks.title")} onBack={() => nav("/learn")} backLabel={t("common.back")} />
      <main className="screen narrow stack">
        <p className="muted">{t("tracks.body")}</p>
        {tracks.visible.map((tr) => {
          const n = courses(tr.id);
          return <ChoiceCard key={tr.id} multi icon={tr.icon as IconName} title={tracks.name(tr.id)} selected={chosen.includes(tr.id)} onClick={() => toggle(tr.id)}
            description={catalog ? (n ? t("tracks.courses", { n }) : t("tracks.none")) : undefined} />;
        })}
        {warn && <p className="notice" role="status">{t("tracks.keepOne")}</p>}
        {added && <div className="notice row-gap" role="status"><span>{t("tracks.checkNew", { track: tracks.name(added) })}</span>
          <Button size="sm" onClick={() => setChecking(added)}>{t("tracks.check")}</Button></div>}
        <section className="stack" aria-labelledby="levels-h">
          <h2 id="levels-h" className="section-title">{t("me.levels")}</h2>
          {chosen.map((id) => (
            <div key={id} className="row-gap">
              <span>{tracks.name(id)}{t("common.sep")}<strong>{tracks.levelName(id, levelOf(id))}</strong></span>
              <Button size="sm" variant="secondary" onClick={() => setChecking(id)}>{t("tracks.check")}</Button>
            </div>
          ))}
        </section>
        <Button block iconEnd="next" onClick={() => nav("/learn")}>{t("tracks.done")}</Button>
      </main>
    </>
  );
}
