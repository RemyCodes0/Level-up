import { useState, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Client-side video export — SPIKE
//
// Renders a lesson to an MP4 entirely in the user's browser using Remotion's
// web renderer (renderMediaOnWeb, @remotion/web-renderer), which encodes with
// WebCodecs instead of FFmpeg. No server render box, no headless Chrome, no
// polling, no artifact storage — the burden lives on the user's machine.
//
// This is the thing we're testing. Two questions the spike must answer:
//   1. FIDELITY — client-side rendering emulates layout to a canvas and only
//      supports a subset of CSS. We pass allowHtmlInCanvas:true so it takes a
//      real screenshot per frame instead (removes the CSS limitation). Do the
//      GLM-generated animations come out looking like they do in the Player?
//   2. AUDIO — the generated lessons use remotion's <Audio> (via our buffered
//      wrapper). Does the web renderer fetch + mux that narration into the MP4?
//      If not, we'll see silent output and need to adjust.
//
// @remotion/web-renderer is EXPERIMENTAL — expect the occasional breaking
// change. Keep it behind a flag until the spike proves it out.
// ─────────────────────────────────────────────────────────────────────────────

export type WebExportStatus = "idle" | "rendering" | "done" | "error" | "unsupported";

export interface WebExportComposition {
  component: React.ComponentType;
  durationInFrames: number;
  fps?: number;      // default 30 (matches DynamicPlayer's FPS)
  width?: number;    // default 1920
  height?: number;   // default 1080
  title?: string;    // used for the download filename
}

// WebCodecs is required — Chrome/Edge and Firefox 130+ have it, Safari is still
// catching up. We feature-detect the encoder/decoder globals rather than trust
// the user agent. (The package also exports canRenderMediaOnWeb() for a more
// thorough check including specific codec support — worth adopting later.)
export const WEB_EXPORT_SUPPORTED =
  typeof window !== "undefined" &&
  typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" &&
  typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== "undefined";

function safeFilename(title: string): string {
  return (title || "lesson")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "lesson";
}

// Encoding quality. Lesson visuals are gradient- and motion-heavy — exactly
// what low-bitrate H.264 crushes into blocky, smeary artifacts (worst on
// gradients, thin strokes, and moving text). The renderer's presets are
// conservative and default to "medium", so we push to the top. Trade-off:
// bigger files. "very-high" is the max preset; for finer control pass an
// explicit bits-per-second number instead (e.g. 16_000_000 = 16 Mbps for
// crisp 1080p, or ~24_000_000 if you also bump resolution).
const VIDEO_BITRATE: string | number = "very-high";
const AUDIO_BITRATE: string | number = "high";

export function useWebExport() {
  const [status, setStatus] = useState<WebExportStatus>("idle");
  const [progress, setProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setProgress(0);
  }, []);

  const exportVideo = useCallback(async (comp: WebExportComposition) => {
    if (!WEB_EXPORT_SUPPORTED) {
      setStatus("unsupported");
      return;
    }

    setStatus("rendering");
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Dynamic import so the (heavy) renderer + WebCodecs glue only loads when
      // the user actually clicks export, instead of bloating the main bundle.
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");

      const { getBlob } = await renderMediaOnWeb({
        composition: {
          id: "lesson",
          component: comp.component,
          durationInFrames: comp.durationInFrames,
          fps: comp.fps ?? 30,
          width: comp.width ?? 1920,
          height: comp.height ?? 1080,
        },
        // Take a real per-frame screenshot instead of the CSS-subset emulation,
        // so complex generated SVG/gradients/filters match the Player. This is
        // the single most important flag for our content type. (v4.0.447+)
        allowHtmlInCanvas: true,
        videoBitrate: VIDEO_BITRATE,
        audioBitrate: AUDIO_BITRATE,
        signal: controller.signal,
        onProgress: ({ progress: p }) => {
          if (!controller.signal.aborted) setProgress(p);
        },
      });

      const blob = await getBlob();
      if (controller.signal.aborted) return;

      // Hand the MP4 straight to the browser's download API — no upload, no
      // round-trip. This is the whole point: the file never touches our server.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFilename(comp.title ?? "lesson")}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setProgress(1);
      setStatus("done");
      // Reset back to idle so the button is ready for another export.
      setTimeout(() => setStatus((s) => (s === "done" ? "idle" : s)), 2500);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      const message = err instanceof Error ? err.message : "Export failed";
      console.error("[useWebExport] Client-side render failed:", err);
      setError(message);
      setStatus("error");
      setTimeout(() => setStatus((s) => (s === "error" ? "idle" : s)), 4000);
    } finally {
      abortRef.current = null;
    }
  }, []);

  return { exportVideo, cancel, status, progress, error, supported: WEB_EXPORT_SUPPORTED };
}