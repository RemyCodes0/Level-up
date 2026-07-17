// controllers/exportController.js
//
// Manages video export jobs: start a render, poll its progress, download
// the finished file. Jobs are kept in memory (Map) — fine for a single
// server instance; if you ever scale to multiple server processes, this
// would need to move to a shared store (Redis, DB) since job state
// wouldn't be visible across processes.
//
// Reliability notes (this file previously let every export request spin up
// its own headless-Chrome Remotion bundle+render immediately, with no cap):
// on a memory-constrained host, two or three of those running at once was
// enough to OOM-kill the whole process — which looked like "the download
// sometimes just errors" from the outside, because it killed whichever
// job(s) happened to be in flight, not just the one that pushed memory over
// the edge. Two fixes address that directly:
//   1. A concurrency limiter serializes renders server-wide (EXPORT_MAX_CONCURRENT,
//      default 1) — extra requests QUEUE instead of running in parallel.
//   2. Duplicate requests for the same course+lesson+format (double-clicks,
//      multiple tabs, a re-mounted button) reuse the in-flight job instead
//      of starting a second one from scratch.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Course = require("../models/Course");
const { renderLessonToFile, FORMATS } = require("../services/renderService");
const { createLimiter } = require("../utils/concurrencyLimiter");

const EXPORTS_DIR = path.resolve(__dirname, "../exports");
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// jobId -> { status: "queued"|"rendering"|"ready"|"failed", progress, filePath, error, key }
const jobs = new Map();

// Rendering is the expensive, memory-heavy part (headless Chrome + Remotion
// bundling) — cap how many run at once, independent of how many export
// requests come in. Override via EXPORT_MAX_CONCURRENT if the host can
// genuinely handle more.
const EXPORT_MAX_CONCURRENT = Number(process.env.EXPORT_MAX_CONCURRENT) || 1;
const limitRender = createLimiter(EXPORT_MAX_CONCURRENT);

// courseId:lessonNumber:format -> jobId, for de-duplicating concurrent
// requests for the exact same export. Cleared whenever that job finishes
// (success or failure) so a later, genuinely-new request isn't stuck reusing
// a stale key.
const inFlightByKey = new Map();

function jobKey(courseId, lessonNumber, format) {
  return `${courseId}:${lessonNumber}:${format}`;
}

// Cleans up a finished/failed job's file + memory entry after a delay, so
// exports don't pile up on disk forever if the user never downloads them.
function scheduleCleanup(jobId, delayMs = 30 * 60 * 1000) {
  setTimeout(() => {
    const job = jobs.get(jobId);
    if (job?.filePath && fs.existsSync(job.filePath)) {
      fs.unlink(job.filePath, () => {});
    }
    jobs.delete(jobId);
  }, delayMs);
}

// POST /api/export/:courseId/:lessonNumber?format=vertical — starts a render job, returns immediately
exports.startExport = async (req, res) => {
  const { courseId, lessonNumber } = req.params;
  const lessonIdx = parseInt(lessonNumber, 10) - 1;
  const format = req.query.format || "landscape";

  if (!FORMATS[format]) {
    return res.status(400).json({
      message: `Invalid format "${format}". Use one of: ${Object.keys(FORMATS).join(", ")}`,
    });
  }

  try {
    // Reuse an in-flight job for the exact same export instead of starting
    // a second one — a double-click, a second browser tab, or a re-mounted
    // download button would otherwise each kick off their own full
    // bundle+render for identical output.
    //
    // The reservation (jobId generation + inFlightByKey.set) happens HERE,
    // synchronously, before any `await` — not after the Course lookup below.
    // Two concurrent requests for the same key both reach this function
    // before either one's DB query resolves; if the reservation happened
    // after that await, both would see an empty inFlightByKey and each
    // start its own render. Reserving first, validating second, means the
    // second request always sees the first's reservation.
    const key = jobKey(courseId, lessonNumber, format);
    const existingJobId = inFlightByKey.get(key);
    if (existingJobId && jobs.has(existingJobId)) {
      return res.json({ jobId: existingJobId });
    }

    const jobId = crypto.randomBytes(8).toString("hex");
    jobs.set(jobId, { status: "queued", progress: 0, filePath: null, error: null, key });
    inFlightByKey.set(key, jobId);

    const course = await Course.findById(courseId).select("lessons").lean();
    const lesson = course?.lessons[lessonIdx];
    if (!course || !lesson || !lesson.code) {
      // Release the reservation — there's no render to queue behind it.
      jobs.delete(jobId);
      inFlightByKey.delete(key);
      return res
        .status(course ? 400 : 404)
        .json({ message: course ? "Lesson isn't ready yet" : "Course not found" });
    }

    const outputPath = path.join(EXPORTS_DIR, `${jobId}.mp4`);

    // Respond immediately — render runs in the background (queued behind
    // any other in-flight render), frontend polls for progress.
    res.json({ jobId });

    limitRender(() =>
      renderLessonToFile(
        { code: lesson.code, totalFrames: lesson.totalFrames },
        outputPath,
        (progress) => {
          const job = jobs.get(jobId);
          // First progress callback fires once the render actually starts —
          // that's the real "queued -> rendering" transition, since a job
          // can now sit queued for a while behind another render.
          if (job) {
            if (job.status === "queued") job.status = "rendering";
            job.progress = progress;
          }
        },
        format
      )
    )
      .then(() => {
        jobs.set(jobId, { status: "ready", progress: 100, filePath: outputPath, error: null, key });
        inFlightByKey.delete(key);
        scheduleCleanup(jobId);
      })
      .catch((err) => {
        console.error(`[export ${jobId}] Render failed:`, err);
        jobs.set(jobId, { status: "failed", progress: 0, filePath: null, error: err.message, key });
        inFlightByKey.delete(key);
        scheduleCleanup(jobId, 5 * 60 * 1000);
      });
  } catch (err) {
    console.error("startExport error:", err);
    res.status(500).json({ message: "Failed to start export" });
  }
};

// GET /api/export/:jobId/status — frontend polls this for progress
exports.getExportStatus = (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ message: "Export job not found (may have expired)" });

  res.json({ status: job.status, progress: job.progress, error: job.error });
};

// GET /api/export/:jobId/download — streams the finished file once ready
exports.downloadExport = (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ message: "Export job not found (may have expired)" });
  if (job.status !== "ready") {
    return res.status(409).json({ message: `Export is ${job.status}, not ready yet` });
  }
  // The file can legitimately be gone by the time this is called — the
  // 30-minute cleanup timer, or (on some hosts) a container restart between
  // "ready" and the user actually clicking download. Without this check,
  // res.download() throws an ENOENT that surfaces as an opaque 500.
  if (!job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(410).json({ message: "This export has expired. Please generate it again." });
  }

  res.download(job.filePath, "lesson.mp4");
};
