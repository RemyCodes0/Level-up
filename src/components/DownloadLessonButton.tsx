import { useState, useRef, useEffect } from "react";
import { Download, Loader2, CheckCircle, XCircle, ChevronDown, RectangleHorizontal, RectangleVertical, Square, X } from "lucide-react";
import { Audio as MediaAudio } from "@remotion/media";
import { startLessonExport, pollExport, downloadExportedFile, type ExportFormat } from "../api/ExportAPI";
import { useCompilation } from "../remotion/useCompilation";
import { useWebExport, WEB_EXPORT_SUPPORTED } from "../remotion/useWebExport";
import { withWatermark } from "../remotion/ExportWatermark";

interface DownloadLessonButtonProps {
  courseId: string;
  lessonNumber: number;
  lessonTitle?: string;
  /** The lesson's Remotion TSX source — the SAME string passed to <DynamicPlayer code={...} />. Compiled client-side to render the landscape format. */
  code: string;
  /** Total frames — the SAME value passed to <DynamicPlayer durationInFrames={...} />. */
  durationInFrames: number;
  /** Server-rendered vertical/square path availability (VITE_ENABLE_DOWNLOAD). */
  serverFormatsEnabled?: boolean;
  /** Client-side (WebCodecs) landscape path availability (VITE_ENABLE_WEB_DOWNLOAD). */
  webFormatEnabled?: boolean;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; sublabel: string; icon: typeof RectangleHorizontal }[] = [
  { value: "landscape", label: "Landscape", sublabel: "16:9 — original, YouTube/desktop", icon: RectangleHorizontal },
  { value: "vertical", label: "Vertical", sublabel: "9:16 — Instagram Reels/Stories", icon: RectangleVertical },
  { value: "square", label: "Square", sublabel: "1:1 — Instagram feed", icon: Square },
];

type CombinedStatus = "idle" | "queued" | "rendering" | "ready" | "failed" | "unsupported";

// Landscape renders entirely client-side via WebCodecs (useWebExport) — fast,
// free, no server load. Vertical/square still go through the server render
// (headless Chrome + ffmpeg letterbox pass) since client-side letterboxing to
// a non-native aspect ratio isn't built yet. Both paths share this one
// button/dropdown/status UI rather than being two separate components.
export function DownloadLessonButton({
  courseId,
  lessonNumber,
  lessonTitle,
  code,
  durationInFrames,
  serverFormatsEnabled = true,
  webFormatEnabled = true,
}: DownloadLessonButtonProps) {
  // Server path state (vertical/square).
  const [state, setState] = useState<CombinedStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  // Client-side path (landscape only). Compiled with @remotion/media's <Audio>
  // instead of the Player's BufferedAudio — the client-side renderer only
  // supports the former (see useCompilation's audioOverride param). This is a
  // second, export-flavored compile independent of whatever <DynamicPlayer>
  // is doing for live playback.
  const { Component, error: compileError } = useCompilation(code, MediaAudio);
  const webExport = useWebExport();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Whichever path is actually in flight (or just finished/failed) drives the
  // button's displayed status — starting one export disables the other, so
  // at most one of these is ever non-idle at a time.
  const usingWeb = webExport.status !== "idle";
  const combinedStatus: CombinedStatus = usingWeb
    ? webExport.status === "rendering"
      ? "rendering"
      : webExport.status === "done"
      ? "ready"
      : webExport.status === "unsupported"
      ? "unsupported"
      : "failed"
    : state;
  const combinedProgress = usingWeb ? Math.round(webExport.progress * 100) : progress;
  const rendering = combinedStatus === "rendering" || combinedStatus === "queued";

  const startServerExport = async (format: ExportFormat) => {
    setState("queued");
    setProgress(0);
    setErrorMsg("");

    try {
      const { jobId } = await startLessonExport(courseId, lessonNumber, format);

      cancelPollRef.current = pollExport(jobId, async (status) => {
        setProgress(status.progress);

        if (status.status === "queued" || status.status === "rendering") {
          setState(status.status);
        }

        if (status.status === "ready") {
          setState("ready");
          try {
            await downloadExportedFile(jobId, `${lessonTitle || "lesson"}-${format}.mp4`);
          } catch {
            setErrorMsg("Render finished but download failed. Try again.");
            setState("failed");
          }
          setTimeout(() => setState("idle"), 2000);
        }

        if (status.status === "failed") {
          setState("failed");
          setErrorMsg(status.error || "Export failed");
          setTimeout(() => setState("idle"), 3000);
        }
      });
    } catch {
      setState("failed");
      setErrorMsg("Couldn't start the export. Please try again.");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  const startExport = (format: ExportFormat) => {
    setMenuOpen(false);
    if (rendering) return;

    if (format === "landscape") {
      // Never fall back to the server render for unsupported browsers — say
      // so honestly instead of triggering a render path known to OOM.
      if (!WEB_EXPORT_SUPPORTED) {
        setState("unsupported");
        setErrorMsg("Video download needs Chrome or Firefox. Use Share to send the lesson link instead.");
        setTimeout(() => setState("idle"), 4000);
        return;
      }
      if (compileError || !Component) {
        setState("failed");
        setErrorMsg("This lesson couldn't be prepared for download here. Try refreshing, or use Share to send the link.");
        setTimeout(() => setState("idle"), 4000);
        return;
      }
      setErrorMsg("");
      webExport.exportVideo({ component: withWatermark(Component), durationInFrames, title: lessonTitle });
      return;
    }

    startServerExport(format);
  };

  const cancel = () => {
    if (usingWeb) {
      webExport.cancel();
    } else {
      cancelPollRef.current?.();
      cancelPollRef.current = null;
      setState("idle");
      setProgress(0);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5" ref={menuRef}>
      <div className="relative flex items-center gap-2">
        <button
          onClick={() => !rendering && setMenuOpen((o) => !o)}
          disabled={rendering}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:cursor-not-allowed ${
            combinedStatus === "ready"
              ? "bg-emerald-100 text-emerald-700"
              : combinedStatus === "failed" || combinedStatus === "unsupported"
              ? "bg-red-100 text-red-600"
              : "bg-slate-900 text-white hover:bg-slate-700"
          }`}
        >
          {combinedStatus === "idle" && (
            <><Download className="h-4 w-4" /> Download video <ChevronDown className="h-3.5 w-3.5 opacity-70" /></>
          )}
          {combinedStatus === "queued" && (
            <><Loader2 className="h-4 w-4 animate-spin" /> Queued…</>
          )}
          {combinedStatus === "rendering" && (
            <><Loader2 className="h-4 w-4 animate-spin" /> {usingWeb ? "Preparing" : "Rendering"}… {combinedProgress}%</>
          )}
          {combinedStatus === "ready" && (
            <><CheckCircle className="h-4 w-4" /> Downloaded!</>
          )}
          {(combinedStatus === "failed" || combinedStatus === "unsupported") && (
            <><XCircle className="h-4 w-4" /> {combinedStatus === "unsupported" ? "Not supported" : "Export failed"}</>
          )}
        </button>

        {rendering && (
          <button
            onClick={cancel}
            className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            aria-label="Cancel export"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-20 top-full">
            <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              Choose a format
            </p>
            {FORMAT_OPTIONS.map(({ value, label, sublabel, icon: Icon }) => {
              const disabled =
                value === "landscape"
                  ? !webFormatEnabled || Boolean(compileError) || !Component
                  : !serverFormatsEnabled;
              return (
                <button
                  key={value}
                  onClick={() => !disabled && startExport(value)}
                  disabled={disabled}
                  title={disabled ? "Not available right now" : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                    disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{sublabel}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {combinedStatus === "rendering" && (
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${combinedProgress}%` }}
          />
        </div>
      )}
      {combinedStatus === "rendering" && usingWeb && (
        <p className="text-[11px] text-slate-400">Rendering on your device — keep this tab open.</p>
      )}

      {(combinedStatus === "failed" || combinedStatus === "unsupported") && errorMsg && (
        <p className="text-xs text-red-500">{errorMsg}</p>
      )}
    </div>
  );
}
