import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useRef, useEffect, useState, useCallback } from "react";
import {
  Loader2, RefreshCw, Play, Pause, Volume2, VolumeX,
  Maximize2, Minimize2, RotateCcw, SkipBack, SkipForward,
  Repeat,
} from "lucide-react";
import { useCompilation } from "./useCompilation";
import { analytics } from "../lib/analytics";

interface DynamicPlayerProps {
  code: string;
  durationInFrames: number;
  onEnded?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  // Fires when playback jumps backward by more than a couple seconds (a
  // deliberate re-watch, not the small backward drift that can happen at a
  // loop boundary) — the new frame position, for the caller to bucket into
  // "which scene got replayed" using the lesson's persisted scene
  // boundaries. Used for collaborative-room replay analytics.
  onSeekBack?: (frame: number) => void;
}

const FPS = 30;
const SKIP_SECONDS = 10;
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// How long controls stay visible after the last tap/move, while playing.
const AUTO_HIDE_MS = 3000;

// Pulls every audio URL out of the lesson's generated code (each scene has
// its own <Audio src="..."/> tag) so they can all be prefetched up front.
function extractAudioUrls(code: string): string[] {
  const matches = code.matchAll(/<Audio\s+[^>]*src=\{?["']([^"']+)["']\}?/g);
  return [...matches].map((m) => m[1]);
}

function formatTime(frame: number, fps: number): string {
  const totalSeconds = Math.max(0, Math.floor(frame / fps));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Custom control bar ──────────────────────────────────────────────────────
// Rendered as an OVERLAY on top of the video (inside the same fullscreen
// container as the Player — see DynamicPlayer below), so it's:
//   1. Still reachable while in fullscreen, since it's now a descendant of
//      whatever element actually gets fullscreened, instead of a sibling
//      sitting outside it (which was the bug: fullscreening just the
//      Player left the controls behind, invisible).
//   2. Tap/click anywhere on the video reveals it via the `visible` prop
//      controlled by the parent, then auto-hides after a few seconds while
//      playing — the standard video-player pattern.
function VideoControls({
  playerRef,
  durationInFrames,
  fps,
  playbackRate,
  setPlaybackRate,
  loop,
  setLoop,
  visible,
  isFullscreen,
  onToggleFullscreen,
}: {
  playerRef: React.RefObject<PlayerRef | null>;
  durationInFrames: number;
  fps: number;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  loop: boolean;
  setLoop: (l: boolean) => void;
  visible: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  useEffect(() => {
    // Feature-detect Fullscreen API support — notably absent on iOS Safari
    // and any iOS browser (all run on WebKit under Apple's rules). There's
    // no workaround for this; we simply don't show a button that can't work.
    setFullscreenSupported(typeof document !== "undefined" && document.fullscreenEnabled === true);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      if (!seeking) setCurrentFrame(e.detail.frame);
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("frameupdate", onFrameUpdate as any);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("frameupdate", onFrameUpdate as any);
    };
  }, [playerRef, seeking]);

  // Spacebar play/pause. Remotion's built-in spaceKeyToPlayOrPause only
  // works when controls={true}; since we render fully custom controls, we
  // wire it up ourselves — but only when focus isn't in a text field
  // elsewhere on the page, so we don't hijack typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      playerRef.current?.toggle();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playerRef]);

  const togglePlay = useCallback(() => playerRef.current?.toggle(), [playerRef]);

  const skip = useCallback((deltaSeconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const next = Math.min(Math.max(player.getCurrentFrame() + deltaSeconds * fps, 0), durationInFrames - 1);
    player.seekTo(next);
    setCurrentFrame(next);
  }, [playerRef, fps, durationInFrames]);

  const restart = useCallback(() => {
    playerRef.current?.seekTo(0);
    setCurrentFrame(0);
  }, [playerRef]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) { player.unmute(); setMuted(false); }
    else { player.mute(); setMuted(true); }
  }, [playerRef, muted]);

  const handleVolumeChange = useCallback((v: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(v);
    setVolume(v);
    if (v > 0 && muted) { player.unmute(); setMuted(false); }
  }, [playerRef, muted]);

  const handleSeekInput = useCallback((frame: number) => {
    setSeeking(true);
    setCurrentFrame(frame);
  }, []);

  const handleSeekCommit = useCallback((frame: number) => {
    playerRef.current?.seekTo(frame);
    setSeeking(false);
  }, [playerRef]);

  return (
    <div
      // Overlay positioning + a gradient so controls stay legible against
      // bright video content underneath, rather than a solid bar. Hidden
      // via opacity/pointer-events (not unmounted) so it doesn't lose focus
      // or re-trigger effects every time it shows/hides.
      className={`absolute bottom-0 left-0 right-0 px-3 sm:px-4 pt-8 pb-2.5 select-none transition-opacity duration-200 ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{ background: "linear-gradient(to top, rgba(15,23,42,0.92), rgba(15,23,42,0.5) 60%, transparent)" }}
      // Stop taps on the control bar itself from bubbling up to the
      // container's "toggle controls visibility" handler — otherwise
      // tapping a button would immediately hide the bar again.
      onClick={(e) => e.stopPropagation()}
    >
      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={Math.max(durationInFrames - 1, 0)}
        step={1}
        value={currentFrame}
        onChange={(e) => handleSeekInput(Number(e.target.value))}
        onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
        className="w-full h-1.5 mb-2.5 rounded-full cursor-pointer accent-blue-500"
        aria-label="Seek"
      />

      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
        {/* Play / pause */}
        <button onClick={togglePlay} className="p-1.5 text-white/90 hover:text-white transition-colors" aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" />}
        </button>

        {/* Skip back / forward */}
        <button onClick={() => skip(-SKIP_SECONDS)} className="p-1.5 text-white/70 hover:text-white transition-colors" aria-label={`Back ${SKIP_SECONDS}s`}>
          <SkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
        <button onClick={() => skip(SKIP_SECONDS)} className="p-1.5 text-white/70 hover:text-white transition-colors" aria-label={`Forward ${SKIP_SECONDS}s`}>
          <SkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>

        {/* Restart */}
        <button onClick={restart} className="p-1.5 text-white/70 hover:text-white transition-colors hidden sm:inline-flex" aria-label="Restart">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {/* Time */}
        <span className="text-xs text-white/70 tabular-nums ml-1 shrink-0" style={{ fontFamily: "monospace" }}>
          {formatTime(currentFrame, fps)} / {formatTime(durationInFrames, fps)}
        </span>

        <div className="flex-1" />

        {/* Volume */}
        <div className="flex items-center gap-1.5 group">
          <button onClick={toggleMute} className="p-1.5 text-white/70 hover:text-white transition-colors" aria-label={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-14 sm:w-16 h-1 rounded-full cursor-pointer accent-blue-500 hidden sm:block"
            aria-label="Volume"
          />
        </div>

        {/* Loop toggle */}
        <button
          onClick={() => setLoop(!loop)}
          className={`p-1.5 transition-colors ${loop ? "text-blue-400" : "text-white/70 hover:text-white"}`}
          aria-label="Toggle loop"
          title="Loop"
        >
          <Repeat className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>

        {/* Playback speed */}
        <select
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value))}
          className="bg-transparent text-white/70 hover:text-white text-xs border border-white/20 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none"
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-slate-800 text-white">{s}x</option>
          ))}
        </select>

        {/* Fullscreen — hidden entirely where the browser doesn't support it
            (notably all iOS browsers, a WebKit/Apple platform limitation
            with no available workaround). Fullscreen is now handled by the
            parent on the WHOLE container (player + this control bar), so
            controls stay visible and reachable while fullscreen. */}
        {fullscreenSupported && (
          <button onClick={onToggleFullscreen} className="p-1.5 text-white/70 hover:text-white transition-colors" aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export const DynamicPlayer: React.FC<DynamicPlayerProps> = ({
  code,
  durationInFrames,
  onEnded,
  onRetry,
  retrying,
  onSeekBack,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  // Wraps BOTH the Player and the controls overlay — this is the element we
  // actually fullscreen, so the controls (a descendant, not a sibling) stay
  // visible and tappable once fullscreen is active. This is the core fix:
  // previously only the Player itself was fullscreened, leaving the
  // controls bar behind outside the fullscreened element.
  const containerRef = useRef<HTMLDivElement>(null);
  const { Component, error } = useCompilation(code);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks fullscreen state by watching the actual document, since we now
  // fullscreen containerRef directly (via requestFullscreen/exitFullscreen)
  // rather than relying on the Player's own internal fullscreen handling.
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen().catch((err) => {
        console.error("Failed to enter fullscreen:", err);
      });
    }
  }, []);

  // Auto-hide logic: any tap/move shows controls and resets a 3s timer.
  // While paused, controls always stay visible (no point hiding them on a
  // still frame the user is presumably about to interact with).
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // Track play/pause at this level too (separate from VideoControls' own
  // tracking) purely to drive the auto-hide timer above.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => { setIsPlaying(true); showControls(); };
    const onPause = () => { setIsPlaying(false); setControlsVisible(true); if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Component]);

  // Prefetches every scene's audio file as soon as the lesson loads —
  // before the user even presses play. Without this, each scene's <Audio>
  // tag only starts fetching its file right when that scene's Sequence
  // becomes active, which combined with pauseWhenBuffering causes a brief
  // pause at EVERY scene transition while it waits for data that hasn't
  // arrived yet. Pre-warming the browser's HTTP cache here means that by
  // the time playback reaches scene 5, its audio is already loaded and
  // pauseWhenBuffering has nothing to wait for.
  //
  // Two safety layers added after a production incident where this effect
  // re-fired repeatedly (upstream reference churn on `code`) and spawned a
  // fresh wave of fetches for the same files every time — 20,000+ requests
  // to a single broken audio URL in minutes:
  //   1. Depend on the actual extracted URLs (joined into a stable string),
  //      not the raw `code` prop — so a new `code` reference with identical
  //      audio URLs does NOT re-trigger this effect at all.
  //   2. Track URLs already attempted in a ref that persists for the life of
  //      this component instance, so even if the effect DOES legitimately
  //      re-run, it never re-fetches a URL it already tried.
  const attemptedUrlsRef = useRef<Set<string>>(new Set());
  const audioUrls = extractAudioUrls(code);
  const audioUrlsKey = audioUrls.join("|");

  useEffect(() => {
    if (!code || audioUrls.length === 0) return;

    const newAudioElements: HTMLAudioElement[] = [];

    audioUrls.forEach((url) => {
      // Skip anything already attempted by this component instance — this is
      // the hard stop that prevents the runaway retry loop.
      if (attemptedUrlsRef.current.has(url)) return;
      attemptedUrlsRef.current.add(url);

      const audio = new window.Audio();
      audio.preload = "auto";
      // On error, just log once and let it be — do NOT retry, do NOT
      // recreate the element. A broken audio file should fail cleanly, not
      // hammer the server.
      audio.onerror = () => {
        console.warn(`[DynamicPlayer] Audio prefetch failed (will not retry): ${url}`);
      };
      audio.src = url;
      audio.load();
      newAudioElements.push(audio);
    });

    return () => {
      newAudioElements.forEach((audio) => {
        audio.onerror = null;
        audio.src = "";
      });
    };
    // audioUrlsKey (not `code`) is the real dependency — this effect only
    // needs to re-run when the actual set of audio URLs changes, not on
    // every render that happens to produce a new `code` string reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrlsKey]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onEnded) return;
    player.addEventListener("ended", onEnded);
    return () => player.removeEventListener("ended", onEnded);
  }, [onEnded, Component]);

  // Backward-seek detection for replay analytics — a >45-frame (1.5s)
  // backward jump between consecutive frameupdate events is a deliberate
  // rewind, not normal forward playback or minor buffering jitter.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onSeekBack) return;
    let lastFrame = 0;
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      const frame = e.detail.frame;
      if (lastFrame - frame > 45) onSeekBack(frame);
      lastFrame = frame;
    };
    player.addEventListener("frameupdate", onFrameUpdate as any);
    return () => player.removeEventListener("frameupdate", onFrameUpdate as any);
  }, [onSeekBack, Component]);

  // ── Render-time crash state ────────────────────────────────────────────────
  // useCompilation only catches COMPILE-time errors. Generated code can still
  // throw while RENDERING a specific frame (e.g. an out-of-bounds points[i+1]
  // that only executes when that scene plays). The Player's onError reports
  // those; storing them here routes BOTH failure modes into the same error
  // screen below — the one that already has the working Regenerate button.
  const [renderError, setRenderError] = useState(false);

  // A successful retry replaces `code` with freshly generated code — clear the
  // crash state so the new lesson gets a clean mount instead of being stuck
  // behind the previous code's error screen.
  useEffect(() => {
    setRenderError(false);
  }, [code]);

  // The Player emits an "error" EVENT on its ref when the composition throws
  // while rendering a frame — the same event-listener mechanism as the
  // "ended" listener above. This (not a prop) is the reliable hook for
  // render-time crashes; it flips renderError, which swaps the Player out
  // for the unified error screen with the Regenerate button.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlayerError = (e: any) => {
      // Details go to the console ONLY — never the UI. The raw eval'd stack
      // ("<anonymous>:2486:19") lives here for debugging.
      console.error(
        "[DynamicPlayer] Generated lesson code crashed at render time:",
        e?.detail?.error ?? e
      );
      analytics.lessonRenderFailed({ message: e?.detail?.error?.message });
      setRenderError(true);
    };
    player.addEventListener("error", onPlayerError);
    return () => player.removeEventListener("error", onPlayerError);
  }, [Component]);

  // Error DETAILS are deliberately console-only, never shown in the UI —
  // raw messages can reveal internals of the generated code / URLs to end
  // users. The console keeps them available for debugging.
  useEffect(() => {
    if (error) console.error("[DynamicPlayer] Lesson code failed to compile:", error);
  }, [error]);

  if (error || renderError) {
    return (
      <div
        style={{ aspectRatio: "16/9" }}
        className="flex flex-col items-center justify-center bg-slate-900 rounded-xl text-red-400 text-sm p-6 text-center"
      >
        <p className="font-semibold mb-1">This animation hit an error</p>
        <p className="text-red-400/60 text-xs max-w-sm">
          Something went wrong while {renderError ? "playing" : "preparing"} this
          lesson's animation. Regenerating it usually fixes this.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200 transition-all text-xs font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retrying ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</>
            ) : (
              <><RefreshCw className="h-3.5 w-3.5" /> Regenerate this lesson</>
            )}
          </button>
        )}
        {!onRetry && <p className="text-red-500/50 text-xs mt-2">Try regenerating this lesson</p>}
      </div>
    );
  }

  if (!Component) {
    return (
      <div
        style={{ aspectRatio: "16/9" }}
        className="flex flex-col items-center justify-center bg-slate-900 rounded-xl text-purple-400"
      >
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm font-medium">Compiling animation...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden bg-slate-900"
      style={!isFullscreen ? { aspectRatio: "16/9" } : undefined}
      onMouseMove={showControls}
      onTouchStart={showControls}
      onClick={showControls}
    >
      <Player
        ref={playerRef}
        component={Component}
        durationInFrames={durationInFrames}
        fps={FPS}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: "100%", height: "100%" }}
        playbackRate={playbackRate}
        loop={loop}
        controls={false}
        clickToPlay
        acknowledgeRemotionLicense
        // ── Render-time crash containment ──────────────────────────────────
        // The Player's built-in error boundary renders this the MOMENT the
        // composition throws — so the user immediately sees the message and
        // a working Regenerate button (never a blank/dead player). The
        // "error" event listener above additionally flips renderError as a
        // second layer, swapping the whole Player for the unified error
        // screen. Details are console-only in both — no internals in the UI.
        // Inline styles + generous font sizes on purpose: this renders inside
        // the Player surface, which may be scaled, so sizes must stay legible
        // either way.
        errorFallback={() => (
          <div
            style={{
              width: "100%", height: "100%",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              backgroundColor: "#0f172a", color: "#f87171",
              textAlign: "center", padding: 24, gap: 10,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              This animation hit an error
            </div>
            <div style={{ fontSize: 20, color: "rgba(248,113,113,0.65)", maxWidth: 560, lineHeight: 1.4 }}>
              Something went wrong while playing this lesson's animation.
              Regenerating it usually fixes this.
            </div>
            {onRetry ? (
              <button
                onClick={(e) => { e.stopPropagation(); if (!retrying) onRetry(); }}
                disabled={retrying}
                style={{
                  marginTop: 10, padding: "12px 24px", borderRadius: 12,
                  fontSize: 20, fontWeight: 600, cursor: retrying ? "not-allowed" : "pointer",
                  backgroundColor: "rgba(239,68,68,0.2)", color: "#fca5a5",
                  border: "1px solid rgba(239,68,68,0.3)",
                  opacity: retrying ? 0.5 : 1,
                }}
              >
                {retrying ? "Regenerating…" : "Regenerate this lesson"}
              </button>
            ) : (
              <div style={{ fontSize: 16, color: "rgba(239,68,68,0.5)", marginTop: 6 }}>
                Try regenerating this lesson
              </div>
            )}
          </div>
        )}
      />
      {/* Subtle watermark — always visible, non-intrusive, bottom-right corner.
          Stays above the video but below the control bar overlay so it's
          visible while playing but doesn't interfere with controls. */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none select-none z-10"
        style={{ opacity: 0.45 }}
      >
        <img src="/logo.png" alt="" className="w-4 h-4 rounded object-cover" />
        <span style={{
          fontSize: "10px",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontWeight: 500,
          color: "white",
          letterSpacing: "0.04em",
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }}>
          leveluppedu.app
        </span>
      </div>
      <VideoControls
        playerRef={playerRef}
        durationInFrames={durationInFrames}
        fps={FPS}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        loop={loop}
        setLoop={setLoop}
        visible={controlsVisible}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  );
};