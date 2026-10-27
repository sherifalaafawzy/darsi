import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, cx } from "./primitives";

export interface VideoPlayerProps {
  title: string;
  meta?: string;
  /** Poster node (SVG/illustration) or image URL. */
  poster?: ReactNode | string;
  src?: string;
  /** <track kind="captions" …> elements, one per language. */
  tracks?: ReactNode;
  /** "anonymous" when the video or its captions come from another origin: a cross-origin <track> loads only then. */
  crossOrigin?: "anonymous";
  duration: number;
  current?: number;
  chapters?: { at: number; label: string }[];
  /** Seconds where a question pauses the video (diamond markers). */
  questionsAt?: number[];
  /** Current caption line (for designs; real captions come from `tracks`). */
  caption?: string;
  captions?: boolean;
  /** A question shown over the paused video. */
  checkpoint?: ReactNode;
  checkpointLabel?: string;
  speed?: string;
  quality?: string;
  actions?: ReactNode;
  playing?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  /** The video could not load (missing file, offline, not downloaded): show the transcript instead. */
  onError?: () => void;
  playLabel?: string; pauseLabel?: string; captionsLabel?: string; seekLabel?: string;
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Low-data player: 240p default, captions on, no autoplay, preload none. Control bar is always LTR. */
export function VideoPlayer(p: VideoPlayerProps) {
  const { title, meta, poster, src, tracks, duration, chapters = [], questionsAt = [], caption, checkpoint, checkpointLabel = "Pause and answer",
    speed = "1×", quality = "240p", actions, playLabel = "Play", pauseLabel = "Pause", captionsLabel = "Captions", seekLabel = "Seek" } = p;
  const [playing, setPlaying] = useState(!!p.playing);
  const [cc, setCc] = useState(p.captions !== false);
  const [current, setCurrent] = useState(p.current ?? 0);
  const ref = useRef<HTMLVideoElement>(null);
  // A checkpoint question pauses the video until it is answered.
  useEffect(() => { if (checkpoint && ref.current && !ref.current.paused) { ref.current.pause(); setPlaying(false); } }, [checkpoint]);
  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const toggle = () => { const v = ref.current; if (v) { if (v.paused) void v.play(); else v.pause(); } setPlaying(!playing); };
  return (
    <figure className={cx("dr-video", checkpoint ? "has-checkpoint" : undefined)}>
      <div className="dr-video-stage">
        {src ? (
          <video ref={ref} src={src} crossOrigin={p.crossOrigin} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); p.onError?.(); }} poster={typeof poster === "string" ? poster : undefined} preload="none" playsInline
            onTimeUpdate={(e) => { setCurrent(e.currentTarget.currentTime); p.onTimeUpdate?.(e.currentTarget.currentTime); }}>{tracks}</video>
        ) : <div className="dr-video-poster">{typeof poster === "string" ? <img src={poster} alt="" /> : poster}</div>}
        {!playing && !checkpoint && <button type="button" className="dr-video-bigplay" onClick={toggle} aria-label={playLabel}><Icon name="play" size={32} /></button>}
        {cc && caption && !checkpoint && <p className="dr-video-caption" dir="auto">{caption}</p>}
        {checkpoint && (
          <div className="dr-video-checkpoint" role="dialog" aria-label={checkpointLabel}>
            <div className="dr-video-checkpoint-card"><span className="dr-video-checkpoint-tag"><Icon name="pause" size={16} />{checkpointLabel}</span>{checkpoint}</div>
          </div>
        )}
      </div>
      <div className="dr-video-bar" dir="ltr">
        <button type="button" className="dr-video-btn" onClick={toggle} aria-label={playing ? pauseLabel : playLabel}><Icon name={playing ? "pause" : "play"} size={20} /></button>
        <span className="dr-video-time">{fmt(current)} / {fmt(duration)}</span>
        <div className="dr-video-scrub" role="slider" tabIndex={0} aria-label={seekLabel} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(current)}>
          <div className="dr-video-scrub-fill" style={{ width: `${pct}%` }} />
          {chapters.map((c, i) => <i key={i} className="dr-video-tick" style={{ left: `${(c.at / duration) * 100}%` }} title={c.label} />)}
          {questionsAt.map((t, i) => <i key={`q${i}`} className="dr-video-qmark" style={{ left: `${(t / duration) * 100}%` }} />)}
        </div>
        <button type="button" className={cx("dr-video-btn", cc && "is-on")} onClick={() => setCc(!cc)} aria-pressed={cc} aria-label={captionsLabel}><Icon name="captions" size={20} /></button>
        <span className="dr-video-chip">{speed}</span>
        <span className="dr-video-chip">{quality}</span>
      </div>
      <figcaption className="dr-video-meta">
        <div><strong>{title}</strong><span>{meta}</span></div>
        <div className="dr-video-actions">{actions}</div>
      </figcaption>
    </figure>
  );
}
