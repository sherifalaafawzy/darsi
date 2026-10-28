import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, cx, trackClass, useTrackStyles, type IconName } from "@darsi/design-system";
import { useMine } from "../content/mine";
import { useTracks } from "../content/settings";
import { useI18n } from "../i18n";

/** The current track in Home's app bar; tapping it opens TrackMenu to switch track, or add and remove tracks. */
export function TrackSwitchButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const tracks = useTracks();
  const style = useTrackStyles();
  const { active } = useMine();
  if (!active) return <>{t("home.title")}</>;
  return (
    <button type="button" className={cx("track-switch", trackClass(style(active)))} aria-expanded={open} aria-controls="track-menu" onClick={onToggle}
      aria-label={t("tracks.switch", { track: tracks.name(active) })}>
      <Icon name={tracks.of(active).icon as IconName} size={20} /><span>{tracks.name(active)}</span><Icon name={open ? "up" : "down"} size={18} />
    </button>
  );
}

/** The learner's tracks (tap one to show it on Home), then "Add or remove tracks". Shown under the app bar. */
export function TrackMenu({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const tracks = useTracks();
  const style = useTrackStyles();
  const mine = useMine();
  const nav = useNavigate();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div id="track-menu" className="track-menu" role="group" aria-label={t("tracks.title")} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      {mine.tracks.map((tr, i) => (
        <button key={tr.id} ref={i === 0 ? first : undefined} type="button" className={cx("track-menu-item", trackClass(style(tr.id)))} aria-pressed={tr.id === mine.active}
          onClick={() => { mine.setActive(tr.id); onClose(); }}>
          <span className="track-menu-icon"><Icon name={tr.icon as IconName} size={20} /></span><span className="track-menu-name">{tracks.name(tr.id)}</span>
          {tr.id === mine.active && <Icon name="check" size={20} />}
        </button>
      ))}
      <button type="button" className="track-menu-item" onClick={() => nav("/tracks")}>
        <span className="track-menu-icon"><Icon name="settings" size={20} /></span><span className="track-menu-name">{t("tracks.manage")}</span>
      </button>
    </div>
  );
}
