import { useState, useRef, useCallback } from "react";

// Client-side MP4 export for a finished ad. Renders in the user's browser via
// Remotion's web renderer (WebCodecs) — no server, no AWS. Ads are short
// (30–60s), so this is more viable than it was for long lessons, but it's still
// experimental: fidelity depends on the browser's HTML-in-canvas support, and it
// needs @remotion/web-renderer + @remotion/media installed (matched to your
// remotion version). Falls back with a clear message when WebCodecs is missing.

export type ExportState = "idle" | "rendering" | "done" | "error" | "unsupported";

const SUPPORTED =
  typeof window !== "undefined" &&
  typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined";

function filename(name: string) {
  return (name || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "ad";
}

export function useAdExport() {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState("idle");
    setProgress(0);
  }, []);

  const exportAd = useCallback(async (opts: {
    component: React.ComponentType;
    durationInFrames: number;
    title?: string;
  }) => {
    if (!SUPPORTED) { setState("unsupported"); return; }
    setState("rendering"); setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const { getBlob } = await renderMediaOnWeb({
        composition: {
          id: "ad",
          component: opts.component,
          durationInFrames: opts.durationInFrames,
          fps: 30,
          width: 1920,
          height: 1080,
        },
        allowHtmlInCanvas: true,      // full-fidelity capture path
        videoBitrate: "very-high",
        signal: controller.signal,
        onProgress: ({ progress: p }: { progress: number }) => setProgress(p),
      });
      const blob = await getBlob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${filename(opts.title ?? "ad")}.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setState("done");
      setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 2500);
    } catch (err) {
      if (controller.signal.aborted) { setState("idle"); return; }
      console.error("[useAdExport] render failed:", err);
      setState("error");
      setTimeout(() => setState((s) => (s === "error" ? "idle" : s)), 4000);
    }
  }, []);

  return { exportAd, cancel, state, progress, supported: SUPPORTED };
}