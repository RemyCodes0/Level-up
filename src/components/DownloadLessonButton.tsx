import { useState } from "react";
import { Download, Loader2, CheckCircle, XCircle } from "lucide-react";
import { startLessonExport, pollExport, downloadExportedFile } from "../api/ExportAPI";

interface DownloadLessonButtonProps {
  courseId: string;
  lessonNumber: number;
  lessonTitle?: string;
}

export function DownloadLessonButton({ courseId, lessonNumber, lessonTitle }: DownloadLessonButtonProps) {
  const [state, setState] = useState<"idle" | "rendering" | "ready" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const handleClick = async () => {
    if (state === "rendering") return; // already in progress

    setState("rendering");
    setProgress(0);
    setErrorMsg("");

    try {
      const { jobId } = await startLessonExport(courseId, lessonNumber);

      pollExport(jobId, async (status) => {
        setProgress(status.progress);

        if (status.status === "ready") {
          setState("ready");
          try {
            await downloadExportedFile(jobId, `${lessonTitle || "lesson"}.mp4`);
          } catch {
            setErrorMsg("Render finished but download failed. Try again.");
            setState("failed");
          }
          // Reset to idle after a moment so the button can be used again
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
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        onClick={handleClick}
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
          <><Download className="h-4 w-4" /> Download video</>
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