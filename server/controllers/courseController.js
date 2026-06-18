const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  generateCoursePlan,
  generateLessonCode,
} = require("../services/claudeService");
const { generateScenePlan } = require("../services/sceneService");
const { generateAllSceneAudio } = require("../services/ttsService");
const Course = require("../models/Course");
const User = require("../models/User");

// Audio dir — for cleanup when a course is deleted
const AUDIO_DIR = path.resolve(__dirname, "../../remotion-render/public/audio");

// ── Entry point: client calls this to start course generation ────────────────
async function generateCourseHandler(req, res) {
  try {
    const topic = req.body.topic || "";
    const pdfBuffer = req.file?.buffer ?? null;

    if (!topic && !pdfBuffer) {
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

    // Deduct credit or mark free trial as used
    if (req.usingFreeTrial) {
      await User.findByIdAndUpdate(req.user._id, { freeTrialUsed: true });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $inc: { courseCredits: -1 } });
    }

    res.json({ courseId: course._id, status: "generating" });
    processCourse(course._id.toString(), topic, pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start course generation" });
  }
}

// ── Builds one lesson: scenes → audio → code → save to DB ───────────────────
async function buildLesson(courseId, lesson) {
  const MAX_ATTEMPTS = 2;
  let measuredScenes = null;
  let totalFrames = 0;

  console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
  const scenes = await generateScenePlan(lesson);

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

      console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: code...`);
      const tsxCode = await generateLessonCode(
        lesson,
        componentName,
        measuredScenes,
        totalFrames
      );

      await Course.findByIdAndUpdate(courseId, {
        $set: {
          [`lessons.${lesson.lessonNumber - 1}.code`]: tsxCode,
          [`lessons.${lesson.lessonNumber - 1}.totalFrames`]: totalFrames,
          [`lessons.${lesson.lessonNumber - 1}.status`]: "ready",
        },
      });

      console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready.`);
      return;

    } catch (err) {
      lastError = err;
      console.error(
        `[${courseId}] Lesson ${lesson.lessonNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
    }
  }

  console.error(
    `[${courseId}] Lesson ${lesson.lessonNumber} permanently failed after ${MAX_ATTEMPTS} attempts`
  );
  await Course.findByIdAndUpdate(courseId, {
    $set: { [`lessons.${lesson.lessonNumber - 1}.status`]: "failed" },
  });
}

// ── Orchestrates the whole course ────────────────────────────────────────────
// ── Orchestrates the whole course ────────────────────────────────────────────
async function processCourse(courseId, topic, pdfBuffer) {
  try {
    console.log(`[${courseId}] Generating course plan...`);
    const { lessons, questions } = await generateCoursePlan(topic, null, pdfBuffer);

    await Course.findByIdAndUpdate(courseId, {
      lessons: lessons.map((l) => ({
        ...l,
        status: "rendering",
        code: null,
        totalFrames: null,
      })),
      questions,
    });

    // Lesson 1 first — user can start watching while the rest generate
    await buildLesson(courseId, lessons[0]);

    // Build remaining lessons one at a time, in the background
    const remaining = lessons.slice(1);
    for (const lesson of remaining) {
      await buildLesson(courseId, lesson);
    }

    await Course.findByIdAndUpdate(courseId, { status: "ready" });
    console.log(`[${courseId}] Course fully ready.`);
  } catch (err) {
    console.error(`[${courseId}] Course processing failed:`, err);
    await Course.findByIdAndUpdate(courseId, { status: "failed" });
  }
}

// ── Status endpoint ───────────────────────────────────────────────────────────
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

// ── List the logged-in user's courses ────────────────────────────────────────
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

    for (const lesson of course.lessons || []) {
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

// ── Public showcase: fetch a curated set of example courses, no auth ───────
// Course IDs come from SHOWCASE_COURSE_IDS env var (comma-separated Mongo
// ObjectIds) so you can swap which courses are featured without redeploying.
async function getShowcaseCoursesHandler(req, res) {
  try {
    const idsEnv = process.env.SHOWCASE_COURSE_IDS || "";
    const ids = idsEnv.split(",").map((s) => s.trim()).filter(Boolean);

    if (ids.length === 0) {
      res.json([]);
      return;
    }

    const courses = await Course.find({ _id: { $in: ids }, status: "ready" })
      .select("topic lessons.title lessons.description lessons.keyPoints lessons.code lessons.totalFrames lessons.status questions createdAt")
      .lean();

    // Preserve the order given in SHOWCASE_COURSE_IDS rather than Mongo's default order
    const byId = new Map(courses.map((c) => [c._id.toString(), c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    res.json(ordered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load showcase courses" });
  }
}

// ── Retry a single failed/broken lesson ─────────────────────────────────────
// Rebuilds scene plan + audio + code for one lesson. Only allowed if the
// lesson exists and is owned by the requesting user.
async function retryLessonHandler(req, res) {
  try {
    const { courseId, lessonIndex } = req.params;
    const idx = parseInt(lessonIndex, 10);

    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (idx < 0 || idx >= course.lessons.length) return res.status(400).json({ error: "Invalid lesson index" });

    const lesson = course.lessons[idx];

    // Mark as rendering so the frontend shows the loading state
    await Course.findByIdAndUpdate(courseId, {
      $set: { [`lessons.${idx}.status`]: "rendering", [`lessons.${idx}.code`]: null },
    });

    res.json({ ok: true, message: "Regenerating lesson" });

    // Rebuild in background (same as initial generation)
    const lessonData = {
      lessonNumber: idx + 1,
      title: lesson.title,
      description: lesson.description,
      keyPoints: lesson.keyPoints,
    };

    buildLesson(courseId, lessonData).catch((err) => {
      console.error(`[${courseId}] Retry lesson ${idx + 1} failed:`, err.message);
    });
  } catch (err) {
    console.error("retryLessonHandler error:", err);
    res.status(500).json({ error: "Failed to retry lesson" });
  }
}

module.exports = {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  deleteCourseHandler,
  getShowcaseCoursesHandler,
  retryLessonHandler,
};