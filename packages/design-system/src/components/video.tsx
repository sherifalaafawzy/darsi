import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
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
  /** Captions start on (default) or off; the CC button switches them. */
  captions?: boolean;
  /** A question shown over the paused video. The video pauses while it is set and plays on once it is cleared. */
  checkpoint?: ReactNode;
  checkpointLabel?: string;
  quality?: string;
  actions?: ReactNode;
  playing?: boolean;
  onTimeUpdate?: (seconds: number) => void;
  /** The video could not load (missing file, offline, not downloaded): show the transcript instead. */
  onError?: () => void;
  playLabel?: string; pauseLabel?: string; captionsLabel?: string; seekLabel?: string;
  speedLabel?: string; fullscreenLabel?: string; exitFullscreenLabel?: string;
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
/** The speed button steps through these. */
export const VIDEO_SPEEDS = [1, 1.25, 1.5, 0.75] as const;

/**
 * Low-data player: 240p default, captions on, no autoplay, preload none. Control bar is always LTR.
 * Full screen covers the player itself (so questions and captions stay on top); phones without the Fullscreen API on
 * elements (iPhone) get the player stretched over the page instead.
 */
export function VideoPlayer(p: VideoPlayerProps) {
  const { title, meta, poster, src, tracks, duration, chapters = [], questionsAt = [], caption, checkpoint, checkpointLabel = "Pause and answer",
    quality = "240p", actions, playLabel = "Play", pauseLabel = "Pause", captionsLabel = "Captions", seekLabel = "Seek", speedLabel = "Speed",
    fullscreenLabel = "Full screen", exitFullscreenLabel = "Exit full screen" } = p;
  const [playing, setPlaying] = useState(!!p.playing);
  const [cc, setCc] = useState(p.captions !== false);
  const [current, setCurrent] = useState(p.current ?? 0);
  const [rate, setRate] = useState(1);
  const [full, setFull] = useState<"" | "api" | "page">("");
  const ref = useRef<HTMLVideoElement>(null);
  const fig = useRef<HTMLElement>(null);
  const resume = useRef(false);

  // A checkpoint question pauses the video until it is answered, then the video plays on.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (checkpoint && !v.paused) { resume.current = true; v.pause(); }
    else if (!checkpoint && resume.current) { resume.current = false; void v.play()?.catch(() => {}); }
  }, [!!checkpoint]);
  // Real captions are the <track>s: CC shows or hides them.
  const applyCaptions = () => {
    for (const tt of Array.from(ref.current?.textTracks ?? [])) if (tt.kind === "captions" || tt.kind === "subtitles") tt.mode = cc ? "showing" : "hidden";
  };
  useEffect(applyCaptions, [cc, src]);
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate, src]);
  useEffect(() => {
    const on = () => setFull((f) => (document.fullscreenElement === fig.current ? "api" : f === "api" ? "" : f));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (full !== "page") return;
    const root = document.documentElement, before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = before; };
  }, [full]);

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const toggle = () => { const v = ref.current; if (v) { if (v.paused) void v.play()?.catch(() => {}); else v.pause(); } setPlaying(!playing); };
  const seekTo = (t: number) => {
    const at = Math.max(0, Math.min(duration, t));
    if (ref.current) ref.current.currentTime = at;
    setCurrent(at);
    p.onTimeUpdate?.(at);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width) seekTo(((e.clientX - r.left) / r.width) * duration);
  };
  const scrubKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = ({ ArrowLeft: current - 5, ArrowRight: current + 5, ArrowDown: current - 5, ArrowUp: current + 5, Home: 0, End: duration } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    seekTo(to);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (full === "page") setFull("");
    else if (document.fullscreenEnabled && fig.current?.requestFullscreen) void fig.current.requestFullscreen().catch(() => setFull("page"));
    else setFull("page");
  };
  const locked = !!checkpoint;
  return (
    <figure ref={fig} className={cx("dr-video", checkpoint ? "has-checkpoint" : undefined, full === "page" && "is-full")}
      onKeyDown={(e) => { if (e.key === "Escape" && full === "page") setFull(""); }}>
      <div className="dr-video-stage">
        {src ? (
          <video ref={ref} src={src} crossOrigin={p.crossOrigin} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); p.onError?.(); }} poster={typeof poster === "string" ? poster : undefined} preload="none" playsInline
            onLoadedMetadata={applyCaptions} onClick={locked ? undefined : toggle}
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
        <button type="button" className="dr-video-btn" onClick={toggle} disabled={locked} aria-label={playing ? pauseLabel : playLabel}><Icon name={playing ? "pause" : "play"} size={20} /></button>
        <span className="dr-video-time">{fmt(current)} / {fmt(duration)}</span>
        <div className="dr-video-scrub" role="slider" tabIndex={locked ? -1 : 0} aria-label={seekLabel} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(current)}
          aria-valuetext={`${fmt(current)} / ${fmt(duration)}`} aria-disabled={locked || undefined} onKeyDown={locked ? undefined : scrubKeys}
          onPointerDown={locked ? undefined : (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
          onPointerMove={locked ? undefined : (e) => { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) fromPointer(e); }}>
          <div className="dr-video-scrub-fill" style={{ width: `${pct}%` }} />
          {chapters.map((c, i) => <i key={i} className="dr-video-tick" style={{ left: `${(c.at / duration) * 100}%` }} title={c.label} />)}
          {questionsAt.map((t, i) => <i key={`q${i}`} className="dr-video-qmark" style={{ left: `${(t / duration) * 100}%` }} />)}
          <i className="dr-video-thumb" style={{ left: `${pct}%` }} />
        </div>
        <button type="button" className={cx("dr-video-btn", cc && "is-on")} onClick={() => setCc(!cc)} aria-pressed={cc} aria-label={captionsLabel}><Icon name="captions" size={20} /></button>
        <button type="button" className="dr-video-chip" onClick={() => setRate(VIDEO_SPEEDS[(VIDEO_SPEEDS.indexOf(rate as (typeof VIDEO_SPEEDS)[number]) + 1) % VIDEO_SPEEDS.length])} aria-label={`${speedLabel}: ${rate}×`}>{rate}×</button>
        <span className="dr-video-chip is-info">{quality}</span>
        <button type="button" className={cx("dr-video-btn", full && "is-on")} onClick={toggleFull} aria-pressed={!!full} aria-label={full ? exitFullscreenLabel : fullscreenLabel}><Icon name={full ? "fullscreen-exit" : "fullscreen"} size={20} /></button>
      </div>
      <figcaption className="dr-video-meta">
        <div><strong>{title}</strong><span>{meta}</span></div>
        <div className="dr-video-actions">{actions}</div>
      </figcaption>
    </figure>
  );
}
