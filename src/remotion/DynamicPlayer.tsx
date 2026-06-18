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

export const DynamicPlayer: React.FC<DynamicPlayerProps> = ({
  code,
  durationInFrames,
  onEnded,
  onRetry,
  retrying,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const { Component, error } = useCompilation(code);

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