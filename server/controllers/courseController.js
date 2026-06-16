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
const Course = require("../models/Course");

// Audio dir — for cleanup when a course is deleted
const AUDIO_DIR = path.resolve(__dirname, "../../remotion-render/public/audio");

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

// ── Builds one lesson: scenes → audio → code → save to DB ───────────────────
// No bundling, no rendering. The browser compiles and plays the code directly.
// Audio files stay on disk until the course is deleted.
async function buildLesson(courseId, lesson) {
  const MAX_ATTEMPTS = 2;
  let measuredScenes = null;
  let totalFrames = 0;

  // Step 1 — Scene plan
  console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
  const scenes = await generateScenePlan(lesson);

  // Step 2 — Audio (parallel, generated once, reused across retries)
  console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: audio...`);
  ({ scenes: measuredScenes, totalFrames } = await generateAllSceneAudio(scenes));

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const componentName = `Lesson${crypto.randomBytes(4).toString("hex")}`;

    try {
      if (attempt > 1) {
        console.log(
          `[${courseId}] Lesson ${lesson.lessonNumber}: code failed — retrying (attempt ${attempt}/${MAX_ATTEMPTS})...`
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

      // Step 4 — Save code + audio metadata to DB. No bundle, no render.
      await Course.findByIdAndUpdate(courseId, {
        $set: {
          [`lessons.${lesson.lessonNumber - 1}.code`]: tsxCode,
          [`lessons.${lesson.lessonNumber - 1}.totalFrames`]: totalFrames,
          [`lessons.${lesson.lessonNumber - 1}.status`]: "ready",
        },
      });

      console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready.`);
      return; // success

    } catch (err) {
      lastError = err;
      console.error(
        `[${courseId}] Lesson ${lesson.lessonNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
    }
  }

  // All attempts exhausted
  console.error(
    `[${courseId}] Lesson ${lesson.lessonNumber} permanently failed after ${MAX_ATTEMPTS} attempts`
  );
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
        code: null,
        totalFrames: null,
      })),
      questions,
    });

    // Build lesson 1 first so the user can start watching immediately
    await buildLesson(courseId, lessons[0]);

    // Build the rest in the background sequentially
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

// ── Delete a course + clean up its audio files ───────────────────────────────
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

    // Delete each lesson's audio files from disk
    for (const lesson of course.lessons || []) {
      // audioFilePath is stored per scene inside the lesson's code metadata.
      // Since we save audioUrl (HTTP URL) not audioFilePath in the DB,
      // we derive the filename from the URL and delete from AUDIO_DIR.
      if (lesson.scenes) {
        for (const scene of lesson.scenes) {
          try {
            if (scene.audioUrl) {
              const fileName = scene.audioUrl.split("/audio/")[1];
              if (fileName) {
                const filePath = path.join(AUDIO_DIR, fileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              }
            }
          } catch (e) {
            console.error("Failed to delete audio file (non-fatal):", e.message);
          }
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