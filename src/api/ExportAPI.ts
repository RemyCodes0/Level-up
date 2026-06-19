const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ExportStatus {
  status: "rendering" | "ready" | "failed";
  progress: number;
  error?: string | null;
}

// Starts a render job for one lesson, returns a jobId immediately.
export async function startLessonExport(
  courseId: string,
  lessonNumber: number
): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE_URL}/api/export/${courseId}/${lessonNumber}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to start export");
  return res.json();
}

// Polls a job's status once.
export async function getExportStatus(jobId: string): Promise<ExportStatus> {
  const res = await fetch(`${BASE_URL}/api/export/${jobId}/status`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to get export status");
  return res.json();
}

// Polls repeatedly until the export is ready or fails, calling onUpdate each time.
export function pollExport(
  jobId: string,
  onUpdate: (status: ExportStatus) => void,
  intervalMs = 2000
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const status = await getExportStatus(jobId);
      onUpdate(status);
      if (status.status === "ready" || status.status === "failed") {
        stopped = true;
        return;
      }
    } catch (err) {
      console.error("Export polling error:", err);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };

  tick();
  return () => { stopped = true; };
}

// Triggers the actual browser file download once a job is ready.
// Uses a fetch + blob approach (not a plain <a href>) so the auth header
// can be attached — the download endpoint is behind `protect` middleware.
export async function downloadExportedFile(jobId: string, fileName = "lesson.mp4") {
  const res = await fetch(`${BASE_URL}/api/export/${jobId}/download`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to download export");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}