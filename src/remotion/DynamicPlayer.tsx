import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useRef, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useCompilation } from "./useCompilation";

interface DynamicPlayerProps {
  code: string;
  durationInFrames: number;
  onEnded?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}

// Pulls every audio URL out of the lesson's generated code (each scene has
// its own <Audio src="..."/> tag) so they can all be prefetched up front.
function extractAudioUrls(code: string): string[] {
  const matches = code.matchAll(/<Audio\s+[^>]*src=\{?["']([^"']+)["']\}?/g);
  return [...matches].map((m) => m[1]);
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
    <Player
      ref={playerRef}
      component={Component}
      durationInFrames={durationInFrames}
      fps={30}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px" }}
      controls
    />
  );
};