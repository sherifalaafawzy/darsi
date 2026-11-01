import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  playLabel?: string; pauseLabel?: string; captionsLabel?: string; captionsOffLabel?: string; seekLabel?: string;
  speedLabel?: string; speedNormalLabel?: string; fullscreenLabel?: string; exitFullscreenLabel?: string;
  muteLabel?: string; unmuteLabel?: string; volumeLabel?: string; settingsLabel?: string; loadingLabel?: string;
}

/** Playback speeds offered in the settings menu, Normal (1×) in the middle. */
export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Clock time, always Western digits so the line stays stable inside its LTR run. Hours appear only past 59:59. */
export function formatVideoTime(total: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const s = t % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Digit keys 0–9 jump to that tenth of the video (0 is the start, 5 is halfway). */
export function timeForDigit(digit: number, duration: number): number {
  return (Math.min(9, Math.max(0, Math.floor(digit))) / 10) * duration;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Low-data player: 240p default, captions on, no autoplay, preload none. The timeline and the clock stay LTR
 * (time runs left to right, as on YouTube); the buttons follow the page, so Arabic puts Play on the right.
 * Full screen uses the Fullscreen API on the player. iPhone Chrome has no such API on elements: the video's own
 * webkitEnterFullscreen() is used instead (playsinline keeps ordinary playback inline). If that is missing too, the
 * player is fixed over the viewport. An upright phone in that fallback is turned sideways so the 16:9 picture fits.
 */
/** In full screen, turn the phone to landscape where the browser allows it (Android Chrome); undone on exit. */
let lockedLandscape = false;
function lockLandscape(on: boolean) {
  const so = (typeof screen !== "undefined" ? screen.orientation : undefined) as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  try {
    if (on && so?.lock) { lockedLandscape = true; void so.lock("landscape").catch(() => { lockedLandscape = false; }); }
    else if (!on && lockedLandscape) { lockedLandscape = false; so?.unlock?.(); }
  } catch { lockedLandscape = false; }
}

interface CapItem { id: string; label: string; language: string }

/** iOS (Chrome and Safari) fullscreens a video with these, not element.requestFullscreen. */
type IOSVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};
function enterIOSFullscreen(video: HTMLVideoElement | null): boolean {
  const enter = video && (video as IOSVideo).webkitEnterFullscreen;
  if (typeof enter !== "function") return false;
  try { enter.call(video); return true; } catch { return false; }
}
/** Calls the iOS exit. Returns false when the page itself must clear the button (no method, or it threw). */
function exitIOSFullscreen(video: HTMLVideoElement | null): boolean {
  const exit = video && (video as IOSVideo).webkitExitFullscreen;
  if (typeof exit !== "function") return false;
  try { exit.call(video); return true; } catch { return false; }
}

function cueText(tt: TextTrack): string {
  return Array.from(tt.activeCues ?? []).map((c) => ("text" in c ? String((c as VTTCue).text) : "")).filter(Boolean).join("\n");
}

export function VideoPlayer(p: VideoPlayerProps) {
  const { title, meta, poster, src, tracks, duration, chapters = [], questionsAt = [], caption, checkpoint, checkpointLabel = "Pause and answer",
    quality = "240p", actions, playLabel = "Play", pauseLabel = "Pause", captionsLabel = "Captions", captionsOffLabel = "Off",
    seekLabel = "Seek", speedLabel = "Playback speed", speedNormalLabel = "Normal", fullscreenLabel = "Full screen",
    exitFullscreenLabel = "Exit full screen", muteLabel = "Mute", unmuteLabel = "Unmute", volumeLabel = "Volume",
    settingsLabel = "Settings", loadingLabel = "Loading" } = p;
  const [playing, setPlaying] = useState(!!p.playing);
  const [cc, setCc] = useState(p.captions !== false);
  const [current, setCurrent] = useState(p.current ?? 0);
  const [rate, setRate] = useState(1);
  const [full, setFull] = useState<"" | "api" | "webkit" | "page">("");
  const [tall, setTall] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [menu, setMenu] = useState<"" | "root" | "speed" | "captions">("");
  const [volOpen, setVolOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [cue, setCue] = useState("");
  const [capList, setCapList] = useState<CapItem[]>([]);
  const [capId, setCapId] = useState("");
  const [flash, setFlash] = useState<"" | "back" | "fwd">("");
  const [metaTick, setMetaTick] = useState(0);
  const speedDomId = `${useId()}-speed`;
  const ccDomId = `${useId()}-cc`;
  const ref = useRef<HTMLVideoElement>(null);
  const fig = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const settingsBtn = useRef<HTMLButtonElement>(null);
  const resume = useRef(false);
  const currentRef = useRef(p.current ?? 0);
  const volumeRef = useRef(1);
  const skipClick = useRef(false);
  const volFromTouch = useRef(false);
  const tapRef = useRef<{ t: number; side: "back" | "fwd" | "mid" } | null>(null);
  const timers = useRef({ hide: 0, tap: 0, flash: 0 });
  const idleRef = useRef(false);
  const flags = useRef({ playing: false, menu: "" as "" | "root" | "speed" | "captions", volOpen: false, locked: false, scrubbing: false });
  const locked = !!checkpoint;
  flags.current = { playing, menu, volOpen, locked, scrubbing };

  const remember = (at: number) => { currentRef.current = at; setCurrent(at); };
  const reveal = () => {
    if (idleRef.current) { idleRef.current = false; setIdle(false); }
    window.clearTimeout(timers.current.hide);
    const f = flags.current;
    if (f.playing && !f.menu && !f.volOpen && !f.locked && !f.scrubbing)
      timers.current.hide = window.setTimeout(() => { idleRef.current = true; setIdle(true); }, 3000);
  };

  // A checkpoint question pauses the video until it is answered, then the video plays on.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (checkpoint && !v.paused) { resume.current = true; v.pause(); }
    else if (!checkpoint && resume.current) { resume.current = false; void v.play()?.catch(() => {}); }
  }, [!!checkpoint]);

  // Captions are painted by us (so they sit above the controls). The selected track stays "hidden": the browser
  // still fires cue changes, and it does not draw its own line on top of ours. The others are disabled.
  useEffect(() => {
    const v = ref.current;
    const list = v ? Array.from(v.textTracks ?? []).filter((t) => t.kind === "captions" || t.kind === "subtitles") : [];
    const items = list.map((t, i) => ({ id: t.language || t.label || String(i), label: t.label || t.language || captionsLabel, language: t.language || "" }));
    setCapList((prev) => prev.length === items.length && prev.every((item, i) => item.id === items[i].id && item.label === items[i].label && item.language === items[i].language) ? prev : items);
    const showing = list.find((t) => t.mode === "showing");
    const showingId = showing ? (showing.language || showing.label || String(list.indexOf(showing))) : "";
    const chosen = capId && items.some((x) => x.id === capId) ? capId : (showingId || items[0]?.id || "");
    if (chosen !== capId) setCapId(chosen);
    const cleanups: (() => void)[] = [];
    if (!cc) setCue("");
    list.forEach((tt, i) => {
      const on = cc && items[i].id === chosen;
      if (!on) { tt.mode = "disabled"; return; }
      tt.mode = "hidden";
      const update = () => setCue(cueText(tt));
      const prev = tt.oncuechange;
      tt.oncuechange = update;
      update();
      cleanups.push(() => { if (tt.oncuechange === update) tt.oncuechange = prev; });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [cc, capId, src, metaTick, captionsLabel]);

  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate, src]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    try { v.muted = muted; v.volume = volume; } catch { /* jsdom leaves volume alone */ }
  }, [muted, volume, src]);
  useEffect(() => {
    const on = () => {
      if (document.fullscreenElement !== fig.current) lockLandscape(false);
      setFull((f) => (document.fullscreenElement === fig.current ? "api" : f === "api" ? "" : f));
    };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  // iOS fires these on the video itself (they do not bubble). The button follows them: native full screen hides our controls.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const begin = () => setFull("webkit");
    const end = () => setFull((f) => (f === "webkit" ? "" : f));
    v.addEventListener("webkitbeginfullscreen", begin);
    v.addEventListener("webkitendfullscreen", end);
    return () => {
      v.removeEventListener("webkitbeginfullscreen", begin);
      v.removeEventListener("webkitendfullscreen", end);
    };
  }, [src]);
  useEffect(() => {
    if (full !== "page") return;
    const root = document.documentElement, body = document.body;
    const prevRoot = root.style.overflow, prevBody = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // On an upright phone the page-wide player is turned on its side, so the 16:9 video fills the screen.
    const turn = () => setTall(innerHeight > innerWidth);
    turn();
    addEventListener("resize", turn);
    return () => { root.style.overflow = prevRoot; body.style.overflow = prevBody; removeEventListener("resize", turn); };
  }, [full]);
  useEffect(() => {
    if (!playing || menu || volOpen || locked || scrubbing) {
      window.clearTimeout(timers.current.hide);
      if (idleRef.current) { idleRef.current = false; setIdle(false); }
      return;
    }
    window.clearTimeout(timers.current.hide);
    timers.current.hide = window.setTimeout(() => { idleRef.current = true; setIdle(true); }, 3000);
    return () => window.clearTimeout(timers.current.hide);
  }, [playing, menu, volOpen, locked, scrubbing]);
  useEffect(() => () => {
    window.clearTimeout(timers.current.hide);
    window.clearTimeout(timers.current.tap);
    window.clearTimeout(timers.current.flash);
  }, []);
  useEffect(() => {
    if (!menu && !volOpen) return;
    const close = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (menu && !el.closest(".dr-video-menu, .dr-video-settings")) { setMenu(""); settingsBtn.current?.focus(); }
      if (volOpen && !el.closest(".dr-video-vol")) setVolOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu, volOpen]);

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const bufPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const toggle = () => {
    if (locked) return;
    const v = ref.current;
    if (!v) { setPlaying((on) => !on); reveal(); return; }
    if (v.paused) void v.play()?.catch(() => setPlaying(false));
    else v.pause();
    reveal();
  };
  const seekTo = (t: number) => {
    if (locked) return;
    const at = clamp(t, 0, duration);
    if (ref.current) { try { ref.current.currentTime = at; } catch { /* not seekable yet */ } }
    remember(at);
    p.onTimeUpdate?.(at);
    reveal();
  };
  const setVol = (v: number) => {
    const next = clamp(v, 0, 1);
    volumeRef.current = next;
    setVolume(next);
    setMuted(next === 0);
  };
  const toggleMute = () => setMuted((m) => { const next = !m; if (!next && volumeRef.current === 0) setVol(1); return next; });
  const fromClient = (el: HTMLElement, client: number, along: "x" | "y") => {
    const r = el.getBoundingClientRect();
    const span = along === "x" ? r.width : r.height;
    if (!span) return null;
    const pos = along === "x" ? client - r.left : r.bottom - client;
    return clamp(pos / span, 0, 1);
  };
  const showFlash = (side: "back" | "fwd") => {
    setFlash(side);
    window.clearTimeout(timers.current.flash);
    timers.current.flash = window.setTimeout(() => setFlash(""), 700);
  };
  const toggleFull = () => {
    const video = ref.current;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (full === "webkit") { if (!exitIOSFullscreen(video)) setFull(""); return; }
    if (full === "page") { setFull(""); return; }
    // iPhone Chrome: elements have no requestFullscreen. The video's own method is the native player; the fixed
    // viewport is only for a browser with neither.
    const elementApi = !!(document.fullscreenEnabled && fig.current && typeof fig.current.requestFullscreen === "function");
    if (elementApi) {
      void fig.current!.requestFullscreen().then(() => lockLandscape(true), () => { if (!enterIOSFullscreen(video)) setFull("page"); });
      return;
    }
    if (!enterIOSFullscreen(video)) setFull("page");
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("input, textarea, select")) return;
    if (e.key === "Escape") {
      if (menu) { setMenu(""); settingsBtn.current?.focus(); e.stopPropagation(); return; }
      if (volOpen) { setVolOpen(false); return; }
      if (full === "webkit") { if (!exitIOSFullscreen(ref.current)) setFull(""); return; }
      if (full === "page") setFull("");
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (locked) return;
    const button = el.closest("button");
    const onVol = !!el.closest(".dr-video-vol-slider");
    const k = e.key;
    if (onVol && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
      e.preventDefault();
      setVol(volumeRef.current + (k === "ArrowUp" || k === "ArrowRight" ? 0.05 : -0.05));
      reveal();
      return;
    }
    if (menu && (k.startsWith("Arrow") || k === "j" || k === "J" || k === "l" || k === "L" || /^[0-9]$/.test(k) || k === "Home" || k === "End")) return;
    if ((k === " " || k === "Spacebar") && button) return;
    const run = (fn: () => void) => { e.preventDefault(); fn(); reveal(); };
    if (k === " " || k === "Spacebar" || k === "k" || k === "K") { run(toggle); return; }
    if (k === "j" || k === "J") { run(() => seekTo(currentRef.current - 10)); return; }
    if (k === "l" || k === "L") { run(() => seekTo(currentRef.current + 10)); return; }
    if (k === "ArrowLeft") { run(() => seekTo(currentRef.current - 5)); return; }
    if (k === "ArrowRight") { run(() => seekTo(currentRef.current + 5)); return; }
    if (k === "ArrowUp") { run(() => setVol(volumeRef.current + 0.05)); return; }
    if (k === "ArrowDown") { run(() => setVol(volumeRef.current - 0.05)); return; }
    if (k === "Home") { run(() => seekTo(0)); return; }
    if (k === "End") { run(() => seekTo(duration)); return; }
    if (k === "f" || k === "F") { run(toggleFull); return; }
    if (k === "c" || k === "C") { run(() => setCc((on) => !on)); return; }
    if (k === "m" || k === "M") { run(toggleMute); return; }
    if (/^[0-9]$/.test(k)) { run(() => seekTo(timeForDigit(Number(k), duration))); }
  };
  const readBuffered = (v: HTMLVideoElement) => {
    try {
      let end = 0;
      for (let i = 0; i < v.buffered.length; i++) end = Math.max(end, v.buffered.end(i));
      setBuffered(end);
    } catch { /* jsdom has no ranges */ }
  };
  const onStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || locked) return;
    const el = e.target as HTMLElement;
    if (el.closest("button, a, input, .dr-video-chrome")) return;
    skipClick.current = true;
    const now = performance.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
    const side: "back" | "fwd" | "mid" = ratio < 0.4 ? "back" : ratio > 0.6 ? "fwd" : "mid";
    const prev = tapRef.current;
    if (prev && now - prev.t < 320 && side !== "mid" && prev.side === side) {
      window.clearTimeout(timers.current.tap);
      tapRef.current = null;
      seekTo(currentRef.current + (side === "back" ? -10 : 10));
      showFlash(side);
      return;
    }
    tapRef.current = { t: now, side };
    window.clearTimeout(timers.current.tap);
    timers.current.tap = window.setTimeout(() => {
      tapRef.current = null;
      if (flags.current.playing && !idleRef.current) { idleRef.current = true; setIdle(true); window.clearTimeout(timers.current.hide); }
      else reveal();
    }, 280);
  };
  const line = (cc && (cue || caption)) || "";
  const volIcon = muted || volume === 0 ? "volume-off" : "volume";
  const previewRatio = hover === null || !duration ? null : clamp(hover / duration, 0, 1);

  return (
    <figure ref={fig} className={cx("dr-video", checkpoint ? "has-checkpoint" : undefined, full === "page" && "is-full", full === "page" && tall && "is-turned", idle && "is-idle", !idle && "is-chrome")}
      onKeyDown={onKey} onPointerMove={(e) => { if (e.pointerType === "mouse") reveal(); }} onFocusCapture={() => reveal()}>
      <div ref={stageRef} className="dr-video-stage" tabIndex={-1}
        onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "VIDEO") stageRef.current?.focus(); }}
        onPointerUp={onStagePointerUp}
        onClick={(e) => {
          if (locked || skipClick.current) { skipClick.current = false; return; }
          const el = e.target as HTMLElement;
          if (el.closest("button, a, input, .dr-video-chrome")) return;
          toggle();
        }}>
        {src ? (
          <video ref={ref} src={src} crossOrigin={p.crossOrigin} aria-label={title} controls={false} poster={typeof poster === "string" ? poster : undefined} preload="none" playsInline
            onPlay={() => { setPlaying(true); setWaiting(false); }} onPause={() => setPlaying(false)}
            onWaiting={() => setWaiting(true)} onStalled={() => setWaiting(true)} onSeeking={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)} onSeeked={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
            onProgress={(e) => readBuffered(e.currentTarget)} onLoadedMetadata={() => setMetaTick((n) => n + 1)}
            onError={() => { setPlaying(false); setWaiting(false); p.onError?.(); }}
            onTimeUpdate={(e) => { remember(e.currentTarget.currentTime); p.onTimeUpdate?.(e.currentTarget.currentTime); readBuffered(e.currentTarget); }}>{tracks}</video>
        ) : <div className="dr-video-poster">{typeof poster === "string" ? <img src={poster} alt="" /> : poster}</div>}
        <div className="dr-video-scrim" aria-hidden />
        {!playing && !checkpoint && !waiting && <button type="button" className="dr-video-bigplay" onClick={toggle} aria-label={playLabel}><Icon name="play" size={32} /></button>}
        {waiting && !checkpoint && <div className="dr-video-spinner" role="status"><span className="dr-spinner" /><span className="dr-video-sr">{loadingLabel}</span></div>}
        {flash && <div className={cx("dr-video-seekflash", flash === "back" ? "is-back" : "is-fwd")} dir="ltr" style={flash === "back" ? { left: 0 } : { right: 0 }} aria-hidden>{flash === "back" ? "−10" : "+10"}</div>}
        {line && !checkpoint && <p className="dr-video-caption" dir="auto">{line}</p>}
        {checkpoint && (
          <div className="dr-video-checkpoint" role="dialog" aria-label={checkpointLabel}>
            <div className="dr-video-checkpoint-card"><span className="dr-video-checkpoint-tag"><Icon name="pause" size={16} />{checkpointLabel}</span>{checkpoint}</div>
          </div>
        )}
        <div className="dr-video-chrome">
          <div className={cx("dr-video-scrub", (hover !== null || scrubbing) && "is-hot")} dir="ltr" role="slider" tabIndex={locked ? -1 : 0}
            aria-label={seekLabel} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(current)}
            aria-valuetext={`${formatVideoTime(current)} / ${formatVideoTime(duration)}`} aria-disabled={locked || undefined}
            onPointerDown={locked ? undefined : (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setScrubbing(true); const ratio = fromClient(e.currentTarget, e.clientX, "x"); if (ratio !== null) seekTo(ratio * duration); }}
            onPointerMove={locked ? undefined : (e) => {
              const ratio = fromClient(e.currentTarget, e.clientX, "x");
              if (ratio === null) return;
              setHover(ratio * duration);
              if (e.currentTarget.hasPointerCapture?.(e.pointerId)) seekTo(ratio * duration);
            }}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            onPointerLeave={() => setHover(null)}>
            <div className="dr-video-scrub-rail" />
            <div className="dr-video-buffered" style={{ inlineSize: `${bufPct}%` }} />
            <div className="dr-video-scrub-fill" style={{ inlineSize: `${pct}%` }} />
            {chapters.map((c, i) => <i key={i} className="dr-video-tick" style={{ insetInlineStart: `${duration ? (c.at / duration) * 100 : 0}%` }} title={c.label} />)}
            {questionsAt.map((t, i) => <i key={`q${i}`} className="dr-video-qmark" style={{ insetInlineStart: `${duration ? (t / duration) * 100 : 0}%` }} />)}
            <i className="dr-video-thumb" style={{ insetInlineStart: `${pct}%` }} />
            {previewRatio !== null && <span className="dr-video-preview" dir="ltr" style={{ insetInlineStart: `${clamp(previewRatio * 100, 8, 92)}%` }}>{formatVideoTime(hover ?? 0)}</span>}
          </div>
          <div className="dr-video-controls">
            <div className="dr-video-controls-start">
              <button type="button" className="dr-video-btn" onClick={toggle} disabled={locked} aria-label={playing ? pauseLabel : playLabel}><Icon name={playing ? "pause" : "play"} size={22} /></button>
              <div className={cx("dr-video-vol", volOpen && "is-open")}>
                <button type="button" className="dr-video-btn" aria-label={muted || volume === 0 ? unmuteLabel : muteLabel} aria-pressed={muted || volume === 0}
                  onPointerDown={(e) => { volFromTouch.current = e.pointerType !== "mouse"; }}
                  onClick={() => { if (volFromTouch.current && !volOpen) { setVolOpen(true); volFromTouch.current = false; return; } toggleMute(); }}>
                  <Icon name={volIcon} size={22} />
                </button>
                <div className="dr-video-vol-slider" role="slider" tabIndex={locked ? -1 : 0} aria-label={volumeLabel}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((muted ? 0 : volume) * 100)} aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const ratio = fromClient(e.currentTarget, e.clientX, "x"); if (ratio !== null) setVol(ratio); }}
                  onPointerMove={(e) => { if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return; const ratio = fromClient(e.currentTarget, e.clientX, "x"); if (ratio !== null) setVol(ratio); }}>
                  <div className="dr-video-vol-track"><div className="dr-video-vol-fill" style={{ inlineSize: `${(muted ? 0 : volume) * 100}%` }} /></div>
                </div>
              </div>
              <span className="dr-video-time" dir="ltr">{formatVideoTime(current)} / {formatVideoTime(duration)}</span>
            </div>
            <div className="dr-video-controls-end">
              <button type="button" className={cx("dr-video-btn", cc && "is-on")} onClick={() => setCc((on) => !on)} aria-pressed={cc} aria-label={captionsLabel}><Icon name="captions" size={22} /></button>
              <div className="dr-video-settings-wrap">
                <button ref={settingsBtn} type="button" className={cx("dr-video-btn", "dr-video-settings", menu && "is-on")} aria-label={settingsLabel} aria-haspopup="menu" aria-expanded={menu !== ""}
                  onClick={() => setMenu((open) => open ? "" : "root")}><Icon name="settings" size={22} /></button>
                {menu && (
                  <div className="dr-video-menu" role="menu" aria-label={settingsLabel}>
                    {menu === "root" && (
                      <>
                        <button type="button" role="menuitem" className="dr-video-menu-item" onClick={() => setMenu("speed")}>
                          <span>{speedLabel}</span><bdi dir="ltr" className="dr-video-menu-value">{rate === 1 ? speedNormalLabel : `${rate}×`}</bdi>
                        </button>
                        <button type="button" role="menuitem" className="dr-video-menu-item" onClick={() => setMenu("captions")}>
                          <span>{captionsLabel}</span>
                          <span className="dr-video-menu-value">{cc ? (capList.find((c) => c.id === capId)?.label ?? captionsLabel) : captionsOffLabel}</span>
                        </button>
                        {quality && <p className="dr-video-menu-note" dir="ltr">{quality}</p>}
                      </>
                    )}
                    {menu === "speed" && (
                      <>
                        <button type="button" role="menuitem" className="dr-video-menu-item" onClick={() => setMenu("root")}><Icon name="back" size={18} />{speedLabel}</button>
                        <div role="group" aria-labelledby={speedDomId} id={speedDomId}>
                          {VIDEO_SPEEDS.map((s) => (
                            <button type="button" role="menuitemradio" key={s} aria-checked={rate === s} className="dr-video-menu-item"
                              onClick={() => { setRate(s); setMenu(""); settingsBtn.current?.focus(); }}>
                              {rate === s && <Icon name="check" size={16} />}
                              <bdi dir="ltr">{s === 1 ? speedNormalLabel : `${s}×`}</bdi>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {menu === "captions" && (
                      <>
                        <button type="button" role="menuitem" className="dr-video-menu-item" onClick={() => setMenu("root")}><Icon name="back" size={18} />{captionsLabel}</button>
                        <div role="group" aria-labelledby={ccDomId} id={ccDomId}>
                          <button type="button" role="menuitemradio" aria-checked={!cc} className="dr-video-menu-item" onClick={() => { setCc(false); setMenu(""); settingsBtn.current?.focus(); }}>{!cc && <Icon name="check" size={16} />}{captionsOffLabel}</button>
                          {capList.map((c) => (
                            <button type="button" role="menuitemradio" key={c.id} aria-checked={cc && capId === c.id} className="dr-video-menu-item" lang={c.language || undefined}
                              onClick={() => { setCapId(c.id); setCc(true); setMenu(""); settingsBtn.current?.focus(); }}>
                              {cc && capId === c.id && <Icon name="check" size={16} />}
                              <span className="dr-other-script" lang={c.language || undefined}>{c.label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className={cx("dr-video-btn", full && "is-on")} onClick={toggleFull} aria-pressed={!!full} aria-label={full ? exitFullscreenLabel : fullscreenLabel}><Icon name={full ? "fullscreen-exit" : "fullscreen"} size={22} /></button>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="dr-video-meta">
        <div><strong>{title}</strong><span dir="auto">{meta}</span></div>
        <div className="dr-video-actions">{actions}</div>
      </figcaption>
    </figure>
  );
}
