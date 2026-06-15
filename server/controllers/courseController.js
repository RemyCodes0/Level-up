const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const {
  generateCoursePlan,
  generateLessonCode,
} = require("../services/claudeService");
const { generateScenePlan } = require("../services/sceneService");
const { generateAllSceneAudio, cleanupAudio } = require("../services/ttsService");
const { bundleLessonCode } = require("../services/bundleService");
const { renderLessonVideo, OUTPUT_DIR } = require("../services/renderService");
const Course = require("../models/Course");

const BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:5000";

// ── Entry point: client calls this to start course generation ────────────────
async function generateCourseHandler(req, res) {
  try {
    const topic = req.body.topic || "";
    let pdfText;

    if (req.file) {
      const parsed = await pdf(req.file.buffer);
      pdfText = parsed.text;
    }

    if (!topic && !pdfText) {
      res.status(400).json({ error: "Topic or file required" });
      return;
    }

    const course = await Course.create({
      userId: req.user._id,
      topic: topic || req.file?.originalname,
      status: "generating",
      lessons: [],
      questions: [],
    });

    res.json({ courseId: course._id, status: "generating" });
    processCourse(course._id.toString(), topic, pdfText);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start course generation" });
  }
}

// ── Builds one lesson fully: scenes → audio → code → bundle → render ─────────
// Generates scenes + audio ONCE, then retries code + bundle + render up to
// MAX_ATTEMPTS times if the render crashes (e.g. bad AI-generated code).
async function buildLesson(courseId, lesson) {
  const MAX_ATTEMPTS = 2;
  let measuredScenes = null;
  let totalFrames = 0;

  // Step 1 — Scene plan (once, not retried)
  console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
  const scenes = await generateScenePlan(lesson);

  // Step 2 — Audio (once — reused across retries to save time + cost)
  console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: audio...`);
  ({ scenes: measuredScenes, totalFrames } = await generateAllSceneAudio(scenes));

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Each attempt gets a fresh renderId + componentName so there are no
    // file collisions between the original attempt and any retry.
    const renderId = crypto.randomBytes(4).toString("hex");
    const componentName = `Lesson${renderId}`;
    let cleanup = null;

    try {
      if (attempt > 1) {
        console.log(
          `[${courseId}] Lesson ${lesson.lessonNumber}: render failed — regenerating code (attempt ${attempt}/${MAX_ATTEMPTS})...`
        );
      }

      // Step 3 — Generate code
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: code...`);
      const tsxCode = await generateLessonCode(
        lesson,
        componentName,
        measuredScenes,
        totalFrames
      );

      // Step 4 — Bundle
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: bundle...`);
      const bundle = await bundleLessonCode(
        componentName,
        tsxCode,
        renderId,
        totalFrames
      );
      cleanup = bundle.cleanup;

      // Step 5 — Render
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: render...`);
      await renderLessonVideo(bundle.serveUrl, componentName, renderId);

      const videoUrl = `${BASE_URL}/videos/${renderId}.mp4`;
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready: ${videoUrl}`);

      await Course.findByIdAndUpdate(courseId, {
        $set: {
          [`lessons.${lesson.lessonNumber - 1}.videoUrl`]: videoUrl,
          [`lessons.${lesson.lessonNumber - 1}.status`]: "ready",
        },
      });

      cleanupAudio(measuredScenes);
      return; // success — exit retry loop

    } catch (err) {
      lastError = err;
      console.error(
        `[${courseId}] Lesson ${lesson.lessonNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
      if (cleanup) cleanup(); // clean up bundle files before retrying
    }
  }

  // All attempts exhausted — mark lesson as failed
  console.error(
    `[${courseId}] Lesson ${lesson.lessonNumber} permanently failed after ${MAX_ATTEMPTS} attempts`
  );
  cleanupAudio(measuredScenes);
  await Course.findByIdAndUpdate(courseId, {
    $set: { [`lessons.${lesson.lessonNumber - 1}.status`]: "failed" },
  });
}

// ── Orchestrates the whole course ────────────────────────────────────────────
async function processCourse(courseId, topic, pdfText) {
  try {
    console.log(`[${courseId}] Generating course plan...`);
    const { lessons, questions } = await generateCoursePlan(topic, pdfText);

    await Course.findByIdAndUpdate(courseId, {
      lessons: lessons.map((l) => ({
        ...l,
        status: "rendering",
        videoUrl: null,
      })),
      questions,
    });

    // Build lesson 1 first so the user can start watching immediately
    await buildLesson(courseId, lessons[0]);

    // Build the rest sequentially in the background
    for (let i = 1; i < lessons.length; i++) {
      await buildLesson(courseId, lessons[i]);
    }

    await Course.findByIdAndUpdate(courseId, { status: "ready" });
    console.log(`[${courseId}] Course fully ready.`);
  } catch (err) {
    console.error(`[${courseId}] Course processing failed:`, err);
    await Course.findByIdAndUpdate(courseId, { status: "failed" });
  }
}

// ── Status endpoint the frontend polls (scoped to the owner) ─────────────────
async function getCourseStatusHandler(req, res) {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      userId: req.user._id,
    });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get course status" });
  }
}

// ── List the logged-in user's courses (newest first) for the sidebar ─────────
async function listCoursesHandler(req, res) {
  try {
    const courses = await Course.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list courses" });
  }
}

// ── Delete a course (scoped to the owner) + remove its video files ───────────
async function deleteCourseHandler(req, res) {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      userId: req.user._id,
    });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    for (const lesson of course.lessons || []) {
      if (lesson.videoUrl) {
        try {
          const fileName = lesson.videoUrl.split("/videos/")[1];
          if (fileName) {
            const filePath = path.join(OUTPUT_DIR, fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error("Failed to delete video file (non-fatal):", e.message);
        }
      }
    }

    await Course.deleteOne({ _id: course._id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete course" });
  }
}

module.exports = {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  deleteCourseHandler,
};