import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useRef, useEffect, useState, useCallback } from "react";
import {
  Loader2, RefreshCw, Play, Pause, Volume2, VolumeX,
  Maximize2, Minimize2, RotateCcw, SkipBack, SkipForward,
  Repeat,
} from "lucide-react";
import { useCompilation } from "./useCompilation";

interface DynamicPlayerProps {
  code: string;
  durationInFrames: number;
  onEnded?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}

const FPS = 30;
const SKIP_SECONDS = 10;
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
// Rendered as a SIBLING of <Player>, not a child — per Remotion's own
// best-practices guidance, this means frequently-changing state (the
// playhead position, ticking every frame) only re-renders this lightweight
// bar, not the much heavier <Player> itself.
function VideoControls({
  playerRef,
  durationInFrames,
  fps,
  playbackRate,
  setPlaybackRate,
  loop,
  setLoop,
}: {
  playerRef: React.RefObject<PlayerRef | null>;
  durationInFrames: number;
  fps: number;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  loop: boolean;
  setLoop: (l: boolean) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [seeking, setSeeking] = useState(false);

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
    const onFullscreenChange = (e: { detail: { isFullscreen: boolean } }) => {
      setFullscreen(e.detail.isFullscreen);
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("frameupdate", onFrameUpdate as any);
    player.addEventListener("fullscreenchange", onFullscreenChange as any);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("frameupdate", onFrameUpdate as any);
      player.removeEventListener("fullscreenchange", onFullscreenChange as any);
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

  const toggleFullscreen = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isFullscreen()) player.exitFullscreen();
    else player.requestFullscreen();
  }, [playerRef]);

  const handleSeekInput = useCallback((frame: number) => {
    setSeeking(true);
    setCurrentFrame(frame);
  }, []);

  const handleSeekCommit = useCallback((frame: number) => {
    playerRef.current?.seekTo(frame);
    setSeeking(false);
  }, [playerRef]);

  return (
    <div className="bg-slate-900 rounded-b-xl px-3 sm:px-4 py-2.5 select-none">
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
            with no available workaround). */}
        {fullscreenSupported && (
          <button onClick={toggleFullscreen} className="p-1.5 text-white/70 hover:text-white transition-colors" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
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
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const { Component, error } = useCompilation(code);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);

  // Prefetches every scene's audio file as soon as the lesson loads —
  // before the user even presses play. Without this, each scene's <Audio>
  // tag only starts fetching its file right when that scene's Sequence
  // becomes active, which combined with pauseWhenBuffering causes a brief
  // pause at EVERY scene transition while it waits for data that hasn't
  // arrived yet. Pre-warming the browser's HTTP cache here means that by
  // the time playback reaches scene 5, its audio is already loaded and
  // pauseWhenBuffering has nothing to wait for.
  useEffect(() => {
    if (!code) return;
    const urls = extractAudioUrls(code);
    const preloadedAudio = urls.map((url) => {
      const audio = new window.Audio();
      audio.preload = "auto";
      audio.src = url;
      // Calling load() explicitly kicks off the fetch immediately in all
      // browsers, rather than waiting for some browsers' lazier defaults.
      audio.load();
      return audio;
    });

    // Nothing to clean up beyond letting these get garbage collected —
    // they're not attached to the DOM and don't play anything themselves,
    // they exist purely to warm the browser's HTTP cache for these URLs.
    return () => {
      preloadedAudio.forEach((audio) => {
        audio.src = "";
      });
    };
  }, [code]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onEnded) return;
    player.addEventListener("ended", onEnded);
    return () => player.removeEventListener("ended", onEnded);
  }, [onEnded, Component]);

  if (error) {
    return (
      <div
        style={{ aspectRatio: "16/9" }}
        className="flex flex-col items-center justify-center bg-slate-900 rounded-xl text-red-400 text-sm p-6 text-center overflow-auto"
      >
        <p className="font-semibold mb-2">Animation compilation error</p>
        <pre className="text-red-400/70 text-xs text-left whitespace-pre-wrap max-w-full max-h-48 overflow-auto bg-black/30 p-3 rounded">
          {error}
        </pre>
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
    <div>
      <Player
        ref={playerRef}
        component={Component}
        durationInFrames={durationInFrames}
        fps={FPS}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px 12px 0 0" }}
        playbackRate={playbackRate}
        loop={loop}
        controls={false}
        clickToPlay
        doubleClickToFullscreen
      />
      <VideoControls
        playerRef={playerRef}
        durationInFrames={durationInFrames}
        fps={FPS}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        loop={loop}
        setLoop={setLoop}
      />
    </div>
  );
};