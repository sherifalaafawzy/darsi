import { useEffect, useRef, type Ref } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, cx, trackClass, useTrackStyles, type IconName } from "@darsi/design-system";
import { useMine } from "../content/mine";
import { useTracks } from "../content/settings";
import { useI18n } from "../i18n";

/**
 * The current track in Home's app bar; tapping it opens TrackMenu to switch track, or add and remove tracks. `ref` is the
 * button, so Home can give it focus back when the menu closes (Escape or a pick), instead of losing it to the page.
 */
export function TrackSwitchButton({ open, onToggle, ref }: { open: boolean; onToggle: () => void; ref?: Ref<HTMLButtonElement> }) {
  const { t } = useI18n();
  const tracks = useTracks();
  const style = useTrackStyles();
  const { active, all } = useMine();
  if (!active && all) return (
    <button ref={ref} type="button" className="track-switch" aria-expanded={open} aria-controls="track-menu" onClick={onToggle} aria-label={t("tracks.switch", { track: t("tracks.all") })}>
      <Icon name="learn" size={20} /><span>{t("tracks.all")}</span><Icon name={open ? "up" : "down"} size={18} />
    </button>
  );
  if (!active) return <>{t("home.title")}</>;
  return (
    <button ref={ref} type="button" className={cx("track-switch", trackClass(style(active)))} aria-expanded={open} aria-controls="track-menu" onClick={onToggle}
      aria-label={t("tracks.switch", { track: tracks.name(active) })}>
      <Icon name={tracks.of(active).icon as IconName} size={20} /><span>{tracks.name(active)}</span><Icon name={open ? "up" : "down"} size={18} />
    </button>
  );
}

/** The learner's tracks (tap one to show it on Home), then "Add or remove tracks". Platform admins also get "All tracks". Shown under the app bar. */
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
      {mine.all && (
        <button type="button" ref={first} className="track-menu-item" aria-pressed={!mine.active} onClick={() => { mine.setActive(undefined); onClose(); }}>
          <span className="track-menu-icon"><Icon name="learn" size={20} /></span><span className="track-menu-name">{t("tracks.all")}</span>
          {!mine.active && <Icon name="check" size={20} />}
        </button>
      )}
      {mine.tracks.map((tr, i) => (
        <button key={tr.id} ref={i === 0 && !mine.all ? first : undefined} type="button" className={cx("track-menu-item", trackClass(style(tr.id)))} aria-pressed={tr.id === mine.active}
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
