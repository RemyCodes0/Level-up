import { Download, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Audio as MediaAudio } from "@remotion/media";
import { useCompilation } from "../remotion/useCompilation";
import { useWebExport, WEB_EXPORT_SUPPORTED } from "../remotion/useWebExport";
import { withWatermark } from "../remotion/ExportWatermark";

interface DownloadLessonButtonProps {
  lessonTitle?: string;
  /** The lesson's Remotion TSX source — the SAME string passed to <DynamicPlayer code={...} />. Compiled client-side to render the export. */
  code: string;
  /** Total frames — the SAME value passed to <DynamicPlayer durationInFrames={...} />. */
  durationInFrames: number;
}

// Landscape (16:9), rendered entirely client-side via WebCodecs (useWebExport)
// — fast, free, no server load, no upload/download round-trip. Vertical and
// square used to be available too, via a server-side render (headless Chrome
// + ffmpeg letterboxing) — removed entirely since that path needed 2GB+ RAM
// and OOM'd the server under concurrent downloads. Landscape is now the only
// format, so this is a single click, not a format picker.
export function DownloadLessonButton({ lessonTitle, code, durationInFrames }: DownloadLessonButtonProps) {
  // Compiled with @remotion/media's <Audio> instead of the Player's
  // BufferedAudio — the client-side renderer only supports the former (see
  // useCompilation's audioOverride param).
  const { Component, error: compileError } = useCompilation(code, MediaAudio);
  const webExport = useWebExport();

  const rendering = webExport.status === "rendering";
  const unsupported = !WEB_EXPORT_SUPPORTED;
  const hasError = unsupported || webExport.status === "error" || Boolean(compileError);
  const disabled = rendering || unsupported || Boolean(compileError) || !Component;

  const handleClick = () => {
    if (disabled) return;
    webExport.exportVideo({ component: withWatermark(Component!), durationInFrames, title: lessonTitle });
  };

  const errorMsg = unsupported
    ? "Video download needs Chrome or Firefox."
    : webExport.status === "error"
    ? webExport.error || "Export failed"
    : compileError
    ? "This lesson couldn't be prepared for download here. Try refreshing."
    : "";

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:cursor-not-allowed ${
          webExport.status === "done"
            ? "bg-emerald-100 text-emerald-700"
            : hasError
            ? "bg-red-100 text-red-600"
            : "bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50"
        }`}
      >
        {webExport.status === "rendering" ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Preparing… {Math.round(webExport.progress * 100)}%</>
        ) : webExport.status === "done" ? (
          <><CheckCircle className="h-4 w-4" /> Downloaded!</>
        ) : hasError ? (
          <><XCircle className="h-4 w-4" /> {unsupported ? "Not supported" : "Export failed"}</>
        ) : (
          <><Download className="h-4 w-4" /> Download video</>
        )}
      </button>

      {rendering && (
        <>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${Math.round(webExport.progress * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Rendering on your device — keep this tab open.</p>
        </>
      )}

      {hasError && errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
    </div>
  );
}
