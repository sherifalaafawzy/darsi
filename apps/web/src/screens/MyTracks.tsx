import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Button, ChoiceCard, type IconName } from "@darsi/design-system";
import { loadCatalog, useAsync } from "../content/load";
import { useMine } from "../content/mine";
import { useTracks } from "../content/settings";
import { audienceOf } from "../content/types";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";

/**
 * Add or remove tracks. Home shows one of them at a time (the switcher at its top). Removing a track only hides it:
 * its progress stays, and adding it back brings everything back. At least one track stays.
 */
export function MyTracks() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { dispatch } = useStore();
  const tracks = useTracks();
  const mine = useMine();
  const { data: catalog } = useAsync(loadCatalog, []);
  const [warn, setWarn] = useState(false);
  const chosen = mine.tracks.map((x) => x.id);
  const courses = (id: string) => (catalog?.units ?? []).filter((u) => u.track === id && u.available && audienceOf(u) === mine.audience).length;
  const toggle = (id: string) => {
    const on = chosen.includes(id);
    if (on && chosen.length === 1) { setWarn(true); return; }
    setWarn(false);
    // A track just added is the one Home shows next.
    dispatch({ type: "set", patch: on ? { tracks: chosen.filter((x) => x !== id) } : { tracks: [...chosen, id], track: id } });
  };
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
        <Button block iconEnd="next" onClick={() => nav("/learn")}>{t("tracks.done")}</Button>
      </main>
    </>
  );
}
