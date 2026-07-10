import { Download, Loader2, CheckCircle, XCircle, X } from "lucide-react";
import { Audio as MediaAudio } from "@remotion/media";
import { useCompilation } from "../remotion/useCompilation";
import { useWebExport } from "../remotion/useWebExport";

interface WebDownloadLessonButtonProps {
  /** The lesson's Remotion TSX source — the SAME string passed to <DynamicPlayer code={...} />. */
  code: string;
  /** Total frames — the SAME value passed to <DynamicPlayer durationInFrames={...} />. */
  durationInFrames: number;
  lessonTitle?: string;
}

// SPIKE: client-side counterpart to DownloadLessonButton. Instead of asking the
// server to render (startLessonExport → poll → download), it compiles the same
// lesson code with the same useCompilation path the Player uses, then renders
// the MP4 in the browser via renderMediaOnWeb. Keep behind VITE_ENABLE_WEB_DOWNLOAD
// until fidelity + audio are confirmed on real courses.
export function WebDownloadLessonButton({ code, durationInFrames, lessonTitle }: WebDownloadLessonButtonProps) {
  // Compile with @remotion/media's <Audio> instead of the classic remotion
  // <Audio> — the client-side renderer only supports the former. (MediaAudio is
  // a stable module reference, so useCompilation's memo stays valid.) The
  // Player keeps its own BufferedAudio path; this override is export-only.
  const { Component, error: compileError } = useCompilation(code, MediaAudio);
  const { exportVideo, cancel, status, progress, supported } = useWebExport();

  // Browser can't do it — say so honestly and point them at the share link,
  // rather than showing a button that will fail.
  if (!supported) {
    return (
      <p className="text-xs text-slate-400 max-w-[220px]">
        Video download needs Chrome or Firefox. On this browser, use{" "}
        <span className="font-medium text-slate-500">Share</span> to send the lesson link instead.
      </p>
    );
  }

  // Nothing to export if the code didn't compile — the Player will already be
  // showing its own error state, so we just render nothing here.
  if (compileError || !Component) return null;

  const rendering = status === "rendering";
  const pct = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            !rendering &&
            exportVideo({ component: Component, durationInFrames, title: lessonTitle })
          }
          disabled={rendering}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:cursor-not-allowed ${
            status === "done"
              ? "bg-emerald-100 text-emerald-700"
              : status === "error"
              ? "bg-red-100 text-red-600"
              : "bg-slate-900 text-white hover:bg-slate-700"
          }`}
        >
          {status === "idle" && (<><Download className="h-4 w-4" /> Download video</>)}
          {rendering && (<><Loader2 className="h-4 w-4 animate-spin" /> Preparing… {pct}%</>)}
          {status === "done" && (<><CheckCircle className="h-4 w-4" /> Downloaded!</>)}
          {status === "error" && (<><XCircle className="h-4 w-4" /> Export failed</>)}
        </button>

        {rendering && (
          <button
            onClick={cancel}
            className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            aria-label="Cancel export"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {rendering && (
        <>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Rendering on your device — keep this tab open.
          </p>
        </>
      )}

      {status === "error" && (
        <p className="text-xs text-red-500 max-w-[220px]">
          Couldn't create the video here. Try again, or use Share to send the link.
        </p>
      )}
    </div>
  );
}