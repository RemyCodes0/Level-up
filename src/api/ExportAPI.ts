const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type ExportFormat = "landscape" | "vertical" | "square";

export interface ExportStatus {
  status: "queued" | "rendering" | "ready" | "failed";
  progress: number;
  error?: string | null;
}

// Starts a render job for one lesson, returns a jobId immediately.
export async function startLessonExport(
  courseId: string,
  lessonNumber: number,
  format: ExportFormat = "landscape"
): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE_URL}/api/export/${courseId}/${lessonNumber}?format=${format}`, {
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
//
// Two failure modes this guards against that previously made the download
// button hang forever with no feedback:
//   - The job disappears server-side (e.g. a server restart wipes the
//     in-memory job map — see exportController.js) — every subsequent poll
//     404s, and the old version just logged it and retried forever.
//   - The render itself genuinely hangs (a stuck headless-Chrome page,
//     network partition) well past any reasonable wait.
// Both now surface as a real "failed" status after a bounded number of
// consecutive errors / a bounded total wait, instead of polling silently
// until the user gives up and refreshes the page.
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_TOTAL_WAIT_MS = 10 * 60 * 1000; // 10 min — generous headroom over the 3 min server-side render timeout, since a job can now queue behind another render first

export function pollExport(
  jobId: string,
  onUpdate: (status: ExportStatus) => void,
  intervalMs = 2000
): () => void {
  let stopped = false;
  let consecutiveErrors = 0;
  const startedAt = Date.now();

  const fail = (message: string) => {
    stopped = true;
    onUpdate({ status: "failed", progress: 0, error: message });
  };

  const tick = async () => {
    if (stopped) return;

    if (Date.now() - startedAt > MAX_TOTAL_WAIT_MS) {
      fail("This export is taking much longer than expected. Please try again.");
      return;
    }

    try {
      const status = await getExportStatus(jobId);
      consecutiveErrors = 0;
      onUpdate(status);
      if (status.status === "ready" || status.status === "failed") {
        stopped = true;
        return;
      }
    } catch (err) {
      console.error("Export polling error:", err);
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        fail("Lost track of this export — please try again.");
        return;
      }
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