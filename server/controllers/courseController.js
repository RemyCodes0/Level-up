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
const GenerationLog = require("../models/GenerationLog");
const User = require("../models/User");
const sendEmail = require("../services/emailService");
const { completeReferral } = require("./referralController");

// Email subjects can't contain newlines (Resend, and most providers, reject
// them outright). course.topic is user-supplied — a typed topic or a PDF's
// filename — and either could contain a stray \n (e.g. a multi-line paste,
// or a PDF filename with embedded control characters). Strip any line
// breaks before using untrusted text in a subject line.
function sanitizeForSubject(text) {
  return String(text || "").replace(/[\r\n]+/g, " ").trim();
}

// Audio dir — for cleanup when a course is deleted
const AUDIO_DIR = path.resolve(__dirname, "../../remotion-render/public/audio");

// Where to send the "someone generated a course" notification. Falls back to
// your own address if a dedicated env var isn't set, same pattern as the
// feedback notifications.
const COURSE_NOTIFICATION_EMAIL =
  process.env.COURSE_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || "tuyishimechristophe84@gmail.com";

// Fires a "new course generation started" email. Non-blocking and never
// throws into the caller — a notification failure should never affect course
// generation itself, same reasoning as the feedback controller's email call.
function notifyCourseGenerated({ course, user, isFreeTrialCourse }) {
  const kind = isFreeTrialCourse ? "Free trial" : "Paid";
  sendEmail({
    to: COURSE_NOTIFICATION_EMAIL,
    subject: `New course generated — ${sanitizeForSubject(course.topic) || "Untitled"} (${kind})`,
    text: [
      `A new course was just started.`,
      ``,
      `Topic: ${course.topic || "Untitled"}`,
      `Type: ${kind}`,
      `User: ${user?.name || "Unknown"} (${user?.email || "no email"})`,
      `Course ID: ${course._id}`,
      `Started: ${new Date().toISOString()}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e293b; margin: 0 0 16px;">New course generated</h2>
        <table style="width: 100%; font-size: 14px; color: #334155; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #94a3b8; width: 80px;">Topic</td><td style="padding: 6px 0; font-weight: 600;">${course.topic || "Untitled"}</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">Type</td><td style="padding: 6px 0;">${kind}</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">User</td><td style="padding: 6px 0;">${user?.name || "Unknown"} (${user?.email || "no email"})</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">Course ID</td><td style="padding: 6px 0; font-family: monospace; font-size: 12px;">${course._id}</td></tr>
        </table>
        <p style="margin-top: 16px; color: #94a3b8; font-size: 11px;">${new Date().toISOString()}</p>
      </div>
    `,
  }).catch((err) => console.error("Failed to send course-generated notification email:", err.message));
}

// ── Entry point: client calls this to start course generation ────────────────
async function generateCourseHandler(req, res) {
  try {
    const topic = req.body.topic || "";
    const pdfBuffer = req.file?.buffer ?? null;
    // Level from the optional pre-course chat ("beginner"|"intermediate"|
    // "advanced"). Absent/empty if the user skipped the chat.
    const level = req.body.level || null;

    if (!topic && !pdfBuffer) {
      res.status(400).json({ error: "Topic or file required" });
      return;
    }

    const course = await Course.create({
      userId: req.user._id,
      topic: topic || req.file?.originalname,
      status: "generating",
      isFreeTrialCourse: !!req.usingFreeTrial,
      lessons: [],
      questions: [],
    });

    // Deduct credit or mark free trial as used
    if (req.usingFreeTrial) {
      await User.findByIdAndUpdate(req.user._id, { freeTrialUsed: true });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $inc: { courseCredits: -1 } });
    }

    // Fire-and-forget notification — doesn't block the response or affect
    // generation if it fails.
    notifyCourseGenerated({ course, user: req.user, isFreeTrialCourse: !!req.usingFreeTrial });

    res.json({ courseId: course._id, status: "generating" });
    processCourse(course._id.toString(), topic, pdfBuffer, !!req.usingFreeTrial, level);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start course generation" });
  }
}

// ── Builds one lesson: scenes → audio → code → save to DB ───────────────────
async function buildLesson(courseId, lesson) {
  const MAX_ATTEMPTS = 2;
  const lessonStart = Date.now();

  // Helper: writes a GenerationLog entry. Never throws — a logging failure
  // should never take down lesson generation itself.
  async function logAttempt({ status, stage, errorMessage, attemptNumber }) {
    try {
      await GenerationLog.create({
        courseId,
        lessonNumber: lesson.lessonNumber,
        lessonTitle: lesson.title,
        status,
        stage,
        errorMessage,
        durationSec: Math.round((Date.now() - lessonStart) / 1000),
        attemptNumber,
      });
    } catch (logErr) {
      console.error(`[${courseId}] Failed to write generation log:`, logErr.message);
    }
  }

  // ── Stage 1+2: scene plan + audio ───────────────────────────────────────
  // Previously NOT wrapped in try/catch — if either of these threw for a
  // lesson built in a parallel batch (Promise.allSettled), the rejection
  // was silently swallowed and the lesson's status stayed "rendering"
  // forever, with no error surfaced anywhere. Fixed: both stages now report
  // failure correctly, the same way the code-generation stage already did.
  let measuredScenes, totalFrames;
  try {
    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
    const scenes = await generateScenePlan(lesson);

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: audio...`);
    ({ scenes: measuredScenes, totalFrames } = await generateAllSceneAudio(scenes));
  } catch (err) {
    const stage = measuredScenes === undefined ? "scenes" : "audio";
    const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
    console.error(
      `[${courseId}] Lesson ${lesson.lessonNumber} failed at ${stage} stage (${elapsedMin} min elapsed): ${err.message}`
    );
    await logAttempt({ status: "failed", stage, errorMessage: err.message, attemptNumber: 1 });
    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`lessons.${lesson.lessonNumber - 1}.status`]: "failed",
        [`lessons.${lesson.lessonNumber - 1}.error`]: `Failed at ${stage}: ${err.message}`,
      },
    });
    return;
  }

  // ── Stage 3: code generation (already had its own retry loop) ──────────
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
          [`lessons.${lesson.lessonNumber - 1}.error`]: null,
        },
      });

      const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready — took ${elapsedMin} min total (scene plan + audio + code).`);
      await logAttempt({ status: "success", stage: "code", errorMessage: null, attemptNumber: attempt });

      // Trigger referral reward check when lesson 1 completes — this is the
      // moment the referred user has genuinely used the product (free trial
      // lesson generated), which is our anti-abuse gate for referral credit.
      if (lesson.lessonNumber === 1) {
        const course = await Course.findById(courseId).select("userId");
        if (course) completeReferral(course.userId.toString());
      }

      return;

    } catch (err) {
      lastError = err;
      console.error(
        `[${courseId}] Lesson ${lesson.lessonNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
      await logAttempt({ status: "failed", stage: "code", errorMessage: err.message, attemptNumber: attempt });
    }
  }

  const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
  console.error(
    `[${courseId}] Lesson ${lesson.lessonNumber} permanently failed after ${MAX_ATTEMPTS} attempts (${elapsedMin} min elapsed)`
  );
  await Course.findByIdAndUpdate(courseId, {
    $set: {
      [`lessons.${lesson.lessonNumber - 1}.status`]: "failed",
      [`lessons.${lesson.lessonNumber - 1}.error`]: lastError?.message || "Unknown error",
    },
  });
}


// Builds a list of lessons 2 at a time, in order — shared by processCourse
// (the normal path) and unlockRemainingLessonsHandler (resuming a
// free-trial course after the user buys credits), so the pairing logic
// only lives in one place.
async function buildLessonsInPairs(courseId, lessons) {
  for (let i = 0; i < lessons.length; i += 2) {
    const batch = lessons.slice(i, i + 2);
    await Promise.allSettled(batch.map((l) => buildLesson(courseId, l)));
  }
}

// ── Orchestrates the whole course ────────────────────────────────────────────
// UPDATED: with GLM-5.2 dropping per-course cost from ~$2.50 to under ~$1,
// the free trial now generates the FULL course (all 6 lessons + quiz) rather
// than gating lessons 2-6 behind a mid-course paywall. This turns the trial
// into "see the whole product once," which converts far better than "watch
// 1/6 and hit a wall." The paywall now only appears when the user tries to
// start a SECOND course without credits — see generateCourseHandler /
// the free-trial-eligibility middleware upstream, unchanged by this file.
//
// isFreeTrialCourse is still recorded on the course document for analytics
// and the frontend's "this was a free trial" UI/feedback-prompt logic, but
// it NO LONGER affects generation — every course builds all 6 lessons.
async function processCourse(courseId, topic, pdfBuffer, isFreeTrialCourse = false, level = null) {
  const courseStart = Date.now();
  try {
    console.log(`[${courseId}] Generating course plan...`);
    const { lessons, questions } = await generateCoursePlan(topic, null, pdfBuffer, level);

    await Course.findByIdAndUpdate(courseId, {
      lessons: lessons.map((l) => ({
        ...l,
        // Every lesson renders now, trial or not — no "locked" status.
        status: "rendering",
        code: null,
        totalFrames: null,
      })),
      questions,
    });

    // Build all 6 lessons in pairs, regardless of trial status.
    await buildLessonsInPairs(courseId, lessons);

    await Course.findByIdAndUpdate(courseId, { status: "ready" });
    const totalMin = ((Date.now() - courseStart) / 60000).toFixed(1);
    console.log(`[${courseId}] Course fully ready — took ${totalMin} min total.`);
  } catch (err) {
    const totalMin = ((Date.now() - courseStart) / 60000).toFixed(1);
    console.error(`[${courseId}] Course processing failed after ${totalMin} min:`, err);
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
// Supports pagination via ?page=1&limit=8 — defaults to page 1, 8 per page.
// Fetches one extra document beyond the page size to cheaply determine
// hasMore without a separate count() query.
async function listCoursesHandler(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
    const skip = (page - 1) * limit;

    const courses = await Course.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1);

    const hasMore = courses.length > limit;
    res.json({ courses: courses.slice(0, limit), hasMore });
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

// ── Unlock the rest of a free-trial course ──────────────────────────────────
// Called after the user buys credits and wants to continue a course that
// was capped at lesson 1. Costs 1 credit (same price as any other course),
// then builds lessons 2-6 in pairs, same as a normal paid course would.
async function unlockRemainingLessonsHandler(req, res) {
  try {
    const { courseId } = req.params;

    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (!course.isFreeTrialCourse) {
      return res.status(400).json({ error: "This course isn't locked — nothing to unlock" });
    }

    const stillLocked = course.lessons.some((l) => l.status === "locked");
    if (!stillLocked) {
      return res.status(400).json({ error: "This course has already been unlocked" });
    }

    const user = await User.findById(req.user._id).select("courseCredits");
    if (!user || user.courseCredits < 1) {
      return res.status(402).json({
        error: "no_credits",
        message: "You need at least 1 course credit to unlock the rest of this course.",
      });
    }

    // Deduct the credit and flip the course out of free-trial mode BEFORE
    // responding, so a double-click can't unlock twice on the same credit.
    // Also set status back to "generating": the course was "ready" after
    // lesson 1, but now lessons 2-6 are about to build, and the frontend's
    // pollCourse STOPS polling when status === "ready". Without flipping this
    // back to "generating", polling would quit immediately and the user
    // would have to refresh to see lessons 2-6 appear.
    await User.findByIdAndUpdate(req.user._id, { $inc: { courseCredits: -1 } });
    await Course.findByIdAndUpdate(courseId, { isFreeTrialCourse: false, status: "generating" });

    // Mark lessons 2-6 as rendering so the frontend shows the loading state
    // immediately, instead of waiting for the first background update.
    const lockedLessons = course.lessons
      .map((l, i) => ({ ...l.toObject(), index: i }))
      .filter((l) => l.status === "locked");

    await Promise.all(
      lockedLessons.map((l) =>
        Course.findByIdAndUpdate(courseId, {
          $set: { [`lessons.${l.index}.status`]: "rendering" },
        })
      )
    );

    res.json({ ok: true, message: "Unlocking the rest of this course" });

    // Build the unlocked lessons in the background, same pairing logic as
    // a normal paid course.
    const lessonsToBuild = lockedLessons.map((l) => ({
      lessonNumber: l.lessonNumber,
      title: l.title,
      description: l.description,
      keyPoints: l.keyPoints,
    }));

    buildLessonsInPairs(courseId, lessonsToBuild)
      .then(() => Course.findByIdAndUpdate(courseId, { status: "ready" }))
      .catch((err) => {
        console.error(`[${courseId}] Unlock build failed:`, err.message);
      });
  } catch (err) {
    console.error("unlockRemainingLessonsHandler error:", err);
    res.status(500).json({ error: "Failed to unlock course" });
  }
}

module.exports = {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  deleteCourseHandler,
  getShowcaseCoursesHandler,
  retryLessonHandler,
  unlockRemainingLessonsHandler,
};