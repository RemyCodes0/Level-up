import { useState, useRef, useEffect } from "react";
import { Download, Loader2, CheckCircle, XCircle, ChevronDown, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";
import { startLessonExport, pollExport, downloadExportedFile, type ExportFormat } from "../api/ExportAPI";

interface DownloadLessonButtonProps {
  courseId: string;
  lessonNumber: number;
  lessonTitle?: string;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; sublabel: string; icon: typeof RectangleHorizontal }[] = [
  { value: "landscape", label: "Landscape", sublabel: "16:9 — original, YouTube/desktop", icon: RectangleHorizontal },
  { value: "vertical", label: "Vertical", sublabel: "9:16 — Instagram Reels/Stories", icon: RectangleVertical },
  { value: "square", label: "Square", sublabel: "1:1 — Instagram feed", icon: Square },
];

export function DownloadLessonButton({ courseId, lessonNumber, lessonTitle }: DownloadLessonButtonProps) {
  const [state, setState] = useState<"idle" | "rendering" | "ready" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const startExport = async (format: ExportFormat) => {
    setMenuOpen(false);
    if (state === "rendering") return;

    setState("rendering");
    setProgress(0);
    setErrorMsg("");

    try {
      const { jobId } = await startLessonExport(courseId, lessonNumber, format);

      pollExport(jobId, async (status) => {
        setProgress(status.progress);

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
    } catch (err) {
      setState("failed");
      setErrorMsg("Couldn't start the export. Please try again.");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5" ref={menuRef}>
      <div className="relative">
        <button
          onClick={() => state !== "rendering" && setMenuOpen((o) => !o)}
          disabled={state === "rendering"}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            state === "ready"
              ? "bg-emerald-100 text-emerald-700"
              : state === "failed"
              ? "bg-red-100 text-red-600"
              : "bg-slate-900 text-white hover:bg-slate-700"
          } disabled:cursor-not-allowed`}
        >
          {state === "idle" && (
            <><Download className="h-4 w-4" /> Download video <ChevronDown className="h-3.5 w-3.5 opacity-70" /></>
          )}
          {state === "rendering" && (
            <><Loader2 className="h-4 w-4 animate-spin" /> Rendering… {progress}%</>
          )}
          {state === "ready" && (
            <><CheckCircle className="h-4 w-4" /> Downloaded!</>
          )}
          {state === "failed" && (
            <><XCircle className="h-4 w-4" /> Export failed</>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-20">
            <p className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              Choose a format
            </p>
            {FORMAT_OPTIONS.map(({ value, label, sublabel, icon: Icon }) => (
              <button
                key={value}
                onClick={() => startExport(value)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
              >
                <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400">{sublabel}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {state === "rendering" && (
        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {state === "failed" && errorMsg && (
        <p className="text-xs text-red-500">{errorMsg}</p>
      )}
    </div>
  );
}