// controllers/exportController.js
//
// Manages video export jobs: start a render, poll its progress, download
// the finished file. Jobs are kept in memory (Map) — fine for a single
// server instance; if you ever scale to multiple server processes, this
// would need to move to a shared store (Redis, DB) since job state
// wouldn't be visible across processes.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Course = require("../models/Course");
const { renderLessonToFile, FORMATS } = require("../services/renderService");

const EXPORTS_DIR = path.resolve(__dirname, "../exports");
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// jobId -> { status: "rendering"|"ready"|"failed", progress: 0-100, filePath, error }
const jobs = new Map();

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
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const lesson = course.lessons[lessonIdx];
    if (!lesson || !lesson.code) {
      return res.status(400).json({ message: "Lesson isn't ready yet" });
    }

    const jobId = crypto.randomBytes(8).toString("hex");
    const outputPath = path.join(EXPORTS_DIR, `${jobId}.mp4`);

    jobs.set(jobId, { status: "rendering", progress: 0, filePath: null, error: null });

    // Respond immediately — render runs in the background, frontend polls for progress.
    res.json({ jobId });

    renderLessonToFile(
      { code: lesson.code, totalFrames: lesson.totalFrames },
      outputPath,
      (progress) => {
        const job = jobs.get(jobId);
        if (job) job.progress = progress;
      },
      format
    )
      .then(() => {
        jobs.set(jobId, { status: "ready", progress: 100, filePath: outputPath, error: null });
        scheduleCleanup(jobId);
      })
      .catch((err) => {
        console.error(`[export ${jobId}] Render failed:`, err);
        jobs.set(jobId, { status: "failed", progress: 0, filePath: null, error: err.message });
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

  res.download(job.filePath, "lesson.mp4");
};