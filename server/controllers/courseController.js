const crypto = require("crypto");
const pdf = require("pdf-parse");
const {
  generateCoursePlan,
  generateLessonCode,
} = require("../services/claudeService");
const { generateScenePlan } = require("../services/sceneService");
const { generateAllSceneAudio } = require("../services/ttsService");
const { bundleLessonCode } = require("../services/bundleService");
const { renderLessonVideo } = require("../services/renderService");
const Course = require("../models/Course");

// Base URL the frontend uses to reach this backend (and its served videos).
// Set SERVER_BASE_URL in .env. Defaults to localhost for dev.
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
      topic: topic || req.file?.originalname,
      status: "generating",
      lessons: [],
      questions: [],
    });

    // Respond immediately so the frontend can start polling
    res.json({ courseId: course._id, status: "generating" });

    // Process in the background (don't await)
    processCourse(course._id.toString(), topic, pdfText);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start course generation" });
  }
}

// ── Builds one lesson fully: scenes → audio → code → bundle → render ──────────
async function buildLesson(courseId, lesson) {
  const renderId = crypto.randomBytes(4).toString("hex");
  const componentName = `Lesson${renderId}`;
  let cleanup = null;

  try {
    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
    const scenes = await generateScenePlan(lesson);

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: audio...`);
    const { scenes: measuredScenes, totalFrames } =
      await generateAllSceneAudio(scenes);

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: code...`);
    const tsxCode = await generateLessonCode(
      lesson,
      componentName,
      measuredScenes,
      totalFrames
    );

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: bundle...`);
    const bundle = await bundleLessonCode(
      componentName,
      tsxCode,
      renderId,
      totalFrames
    );
    cleanup = bundle.cleanup;

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: render...`);
    await renderLessonVideo(bundle.serveUrl, componentName, renderId);

    // The video is served statically from /videos/<renderId>.mp4
    const videoUrl = `${BASE_URL}/videos/${renderId}.mp4`;
    console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready: ${videoUrl}`);

    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`lessons.${lesson.lessonNumber - 1}.videoUrl`]: videoUrl,
        [`lessons.${lesson.lessonNumber - 1}.status`]: "ready",
      },
    });
  } catch (err) {
    console.error(
      `[${courseId}] Lesson ${lesson.lessonNumber} failed:`,
      err.message
    );
    await Course.findByIdAndUpdate(courseId, {
      $set: { [`lessons.${lesson.lessonNumber - 1}.status`]: "failed" },
    });
  } finally {
    if (cleanup) cleanup();
  }
}

// ── Orchestrates the whole course ────────────────────────────────────────────
async function processCourse(courseId, topic, pdfText) {
  try {
    console.log(`[${courseId}] Generating course plan...`);
    const { lessons, questions } = await generateCoursePlan(topic, pdfText);

    // Save lesson metadata immediately so the UI can render the shell + quiz
    await Course.findByIdAndUpdate(courseId, {
      lessons: lessons.map((l) => ({
        ...l,
        status: "rendering",
        videoUrl: null,
      })),
      questions,
    });

    // Build lesson 1 (the intro) FIRST so the user can start watching ASAP
    await buildLesson(courseId, lessons[0]);

    // Build the remaining lessons SEQUENTIALLY in the background.
    // Local rendering is CPU-bound on one machine — running them one at a
    // time keeps each render fast and avoids overloading the server.
    // The user watches lesson 1 while lesson 2 renders, and so on.
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

// ── Status endpoint the frontend polls ───────────────────────────────────────
async function getCourseStatusHandler(req, res) {
  try {
    const course = await Course.findById(req.params.courseId);
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

module.exports = { generateCourseHandler, getCourseStatusHandler };