const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  generateCoursePlan,
  generateCourseQuiz,
  generateLessonCode,
  generateLessonHeader,
  generateCourseComponents,
  generateNextCourseSuggestions,
  patchSceneFromRuntimeError,
  patchHeaderFromRuntimeError,
  locateErrorIsInHeader,
  extractErrorLine,
  locateSceneIndexAtLineInFullCode,
  extractUndefinedIdentifier,
  locateIdentifierScope,
} = require("../services/claudeService");
const { generateScenePlan } = require("../services/sceneService");
const { generateAllSceneAudioPipelined } = require("../services/ttsService");
const Course = require("../models/Course");
const GenerationLog = require("../models/GenerationLog");
const User = require("../models/User");
const QuizAttempt = require("../models/QuizAttempt");
const AiUsageLog = require("../models/AiUsageLog");
const { grantCredits } = require("../services/creditService");
const sendEmail = require("../services/emailService");

// Same fallback/env-var convention as authController.js's
// ADMIN_NOTIFICATION_EMAIL and referralController.js's ADMIN_EMAIL — one
// inbox, reused across every "notify the owner" email in the app rather than
// introducing a course-specific one.
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_EMAIL || "tuyishimechristophe84@gmail.com";

// Audio dir — for cleanup when a course is deleted
const AUDIO_DIR = path.resolve(__dirname, "../../remotion-render/public/audio");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Fires once whenever a course transitions into "all lessons built" — the
// initial full build (1/3/6-lesson tiers alike) and the free-trial
// unlock-the-rest flow both count. Never throws — a failed notification
// should never surface as a course-generation error.
async function sendCourseReadyEmail(courseId, userId) {
  if (!userId) return;
  try {
    const [course, user] = await Promise.all([
      Course.findById(courseId).select("topic lessonCount lessons.status"),
      User.findById(userId).select("email name"),
    ]);
    if (!course || !user?.email) return;

    // course.status "ready" only means "not actively generating anymore" —
    // it does NOT mean every lesson succeeded (see retryLessonHandler's own
    // comment on the same distinction). A lesson can still be sitting at
    // status "failed" with a retry button in the UI. Sending "all N lessons
    // are ready to watch" in that case is simply false, so skip the email
    // entirely rather than mislead the user — they'll see the failed lesson
    // (and retry option) in-app regardless.
    const hasFailedLesson = course.lessons?.some((l) => l.status === "failed");
    if (hasFailedLesson) {
      console.log(`[${courseId}] Skipping course-ready email — at least one lesson failed.`);
      return;
    }

    const title = course.topic || "Your course";
    const lessonWord = course.lessonCount === 1 ? "lesson" : "lessons";
    const courseUrl = `${process.env.CLIENT_URL}/ai_tutor/${courseId}`;

    await sendEmail({
      to: user.email,
      subject: `"${title}" is ready to watch`,
      text: `Hi ${user.name || ""},\n\nAll ${course.lessonCount || ""} ${lessonWord} of "${title}" have finished generating and are ready to watch.\n\n${courseUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Your course is ready!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Hi ${escapeHtml(user.name || "")}, all ${course.lessonCount || ""} ${lessonWord} of
            <strong>${escapeHtml(title)}</strong> have finished generating.
          </p>
          <a href="${courseUrl}"
             style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
            Watch it now
          </a>
        </div>
      `,
    });

    // Owner's own copy — same "a course just finished" event, same
    // ADMIN_NOTIFICATION_EMAIL inbox every other admin notification in this
    // app (signups, logins, feedback, referrals) already goes to. A separate
    // send with its own subject/content rather than adding a second `to`
    // address on the email above — the admin inbox shouldn't be exposed to
    // the user's own copy, or vice versa.
    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `New course generated: "${title}"`,
      text: [
        `A course just finished generating.`,
        ``,
        `Title: ${title}`,
        `User: ${user.name || "Unknown"} (${user.email})`,
        `Lessons: ${course.lessonCount || ""}`,
        `Course ID: ${courseId}`,
        `Time: ${new Date().toISOString()}`,
        ``,
        `${process.env.CLIENT_URL}/admin/courses/${courseId}`,
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin: 0 0 16px;">New course generated</h2>
          <table style="width: 100%; font-size: 14px; color: #334155; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #94a3b8; width: 80px;">Title</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(title)}</td></tr>
            <tr><td style="padding: 6px 0; color: #94a3b8;">User</td><td style="padding: 6px 0;">${escapeHtml(user.name || "Unknown")} (${escapeHtml(user.email)})</td></tr>
            <tr><td style="padding: 6px 0; color: #94a3b8;">Lessons</td><td style="padding: 6px 0;">${course.lessonCount || ""}</td></tr>
          </table>
          <a href="${process.env.CLIENT_URL}/admin/courses/${courseId}"
             style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1e293b; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
            View in admin
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error(`[${courseId}] Failed to send course-ready email:`, err.message);
  }
}

// ── Entry point: client calls this to start course generation ────────────────
async function generateCourseHandler(req, res) {
  try {
    const topic = req.body.topic || "";
    const pdfBuffer = req.file?.buffer ?? null;
    const sourceFileName = req.file?.originalname ?? null;
    // Level from the optional pre-course chat ("beginner"|"intermediate"|
    // "advanced"). Absent/empty if the user skipped the chat.
    const level = req.body.level || null;

    if (!topic && !pdfBuffer) {
      res.status(400).json({ error: "Topic or file required" });
      return;
    }

    // Set by checkCredits middleware — the free trial's fixed shape, the
    // selected tier's shape (already atomically paid for), or (for callers
    // that don't send a tier, e.g. collab room creation) the legacy flat
    // shape, which still needs its own deduction below exactly as before.
    const tierSnapshot = req.courseTierSnapshot;

    const course = await Course.create({
      userId: req.user._id,
      topic: topic || req.file?.originalname,
      status: "generating",
      isFreeTrialCourse: !!req.usingFreeTrial,
      tier: tierSnapshot.tier,
      tierName: tierSnapshot.tierName,
      lessonCount: tierSnapshot.lessonCount,
      mcqCount: tierSnapshot.mcqCount,
      timeAllocationMinutes: tierSnapshot.timeAllocationMinutes,
      creditCost: tierSnapshot.creditCost,
      lessons: [],
      questions: [],
    });

    if (req.usingFreeTrial) {
      await User.findByIdAndUpdate(req.user._id, { freeTrialUsed: true });
    } else if (!tierSnapshot.tier) {
      // Legacy no-tier caller — checkCredits didn't spend anything for this
      // path, so deduct the flat 1 credit here exactly as this always did.
      await User.findByIdAndUpdate(req.user._id, { $inc: { courseCredits: -1 } });
    }
    // Tier path: checkCredits already atomically spent tierSnapshot.creditCost.

    res.json({ courseId: course._id, status: "generating" });
    processCourse(
      course._id.toString(),
      topic,
      pdfBuffer,
      !!req.usingFreeTrial,
      level,
      sourceFileName,
      tierSnapshot.lessonCount,
      tierSnapshot.mcqCount,
      req.user._id
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start course generation" });
  }
}

// ── Builds one lesson: scenes → audio → code → save to DB ───────────────────
async function buildLesson(courseId, lesson, userId = null) {
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

  // Prints the ACTUAL total tokens + $ cost this ONE lesson's generation
  // used — scene plan + header + every chunk/patch attempt (including
  // retries) + TTS — queried straight from AiUsageLog, the same ledger
  // every recordAiUsage call already writes to (see aiUsageService.js),
  // filtered to this course+lesson (see lessonNumber on AiUsageLog).
  // Deliberately does NOT blend a real number with a guess: realCostUsd
  // only sums rows OpenRouter itself billed a cost for (GLM/DeepSeek calls,
  // via `usage: { include: true }` — see streamOpenAiCompatible/
  // generateJson in claudeService.js), which is the actual dollar amount
  // charged, not a static per-token-price estimate — that covers the large
  // majority of a lesson's cost. estimatedCostUsd is called out separately,
  // currently only ever TTS (Kokoro's API returns no cost/usage data at
  // all, so there's no way to make that portion exact — see
  // config/modelPricing.js's own comment on why).
  async function logLessonUsageSummary() {
    try {
      const rows = await AiUsageLog.find({ courseId, lessonNumber: lesson.lessonNumber })
        .select("promptTokens completionTokens costUsd isRealCost")
        .lean();
      if (rows.length === 0) return;

      const promptTokens = rows.reduce((sum, r) => sum + (r.promptTokens || 0), 0);
      const completionTokens = rows.reduce((sum, r) => sum + (r.completionTokens || 0), 0);
      const realCostUsd = rows.filter((r) => r.isRealCost).reduce((sum, r) => sum + r.costUsd, 0);
      const estimatedCostUsd = rows.filter((r) => !r.isRealCost).reduce((sum, r) => sum + r.costUsd, 0);
      const totalCostUsd = realCostUsd + estimatedCostUsd;

      const estimatedNote = estimatedCostUsd > 0
        ? ` (includes $${estimatedCostUsd.toFixed(4)} ESTIMATED for TTS — Kokoro's API returns no real cost figure)`
        : "";
      console.log(
        `[${courseId}] Lesson ${lesson.lessonNumber} usage: ${promptTokens} input tokens, ${completionTokens} output tokens, ` +
        `$${totalCostUsd.toFixed(4)} total across ${rows.length} AI call(s) — $${realCostUsd.toFixed(4)} of that is the ACTUAL ` +
        `OpenRouter-billed cost, not an estimate${estimatedNote}.`
      );
    } catch (err) {
      console.error(`[${courseId}] Failed to compute lesson ${lesson.lessonNumber} usage summary (non-fatal):`, err.message);
    }
  }

  // ── Stage 1: scene plan ──────────────────────────────────────────────────
  // Previously NOT wrapped in try/catch — if this threw for a lesson built
  // in a parallel batch (Promise.allSettled), the rejection was silently
  // swallowed and the lesson's status stayed "rendering" forever, with no
  // error surfaced anywhere. Fixed: this stage now reports failure
  // correctly, the same way the code-generation stage already did.
  //
  // Audio is NOT awaited here at all (previously Stage "1+2": scene plan
  // THEN audio, both inside this same try). generateAllSceneAudioPipelined
  // fires every scene's audio immediately and returns per-scene PROMISES
  // synchronously instead of one aggregate promise — code generation below
  // then awaits EACH scene's own promise individually, right before that
  // specific scene's code generation starts, instead of the whole lesson
  // waiting for every scene's audio to finish before code generation even
  // begins. A scene whose audio ultimately fails still surfaces as a
  // real failure (its promise rejects, which generateLessonCode's own scene
  // loop catches and — since ttsService tags that rejection with
  // `.stage = "audio"` — the Stage 2 catch block below still reports it as
  // an "audio" stage failure, not a misleading "code" one).
  let scenePlan, scenePromises, headerPromise;
  try {
    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: scene plan...`);
    scenePlan = await generateScenePlan(lesson, 3, { userId, courseId });

    // Scene count/labels are known immediately — initialize a placeholder
    // progress entry per scene right away, before audio or code generation
    // even starts, so the frontend's filmstrip can appear instantly instead
    // of waiting for the first real completion event. Non-fatal: a failure
    // here shouldn't block generation, just means the filmstrip stays empty
    // a little longer.
    try {
      const initialProgress = scenePlan.map((s, i) => ({
        index: i,
        durationInFrames: null,
        label: s.onScreenText || `Scene ${i + 1}`,
        audioReady: false,
        codeReady: false,
        previewCode: null,
      }));
      await Course.findByIdAndUpdate(courseId, {
        $set: { [`lessons.${lesson.lessonNumber - 1}.sceneProgress`]: initialProgress },
      });
    } catch (progressInitErr) {
      console.error(`[${courseId}] Lesson ${lesson.lessonNumber}: failed to initialize scene progress (non-fatal):`, progressInitErr.message);
    }

    // Header generation only needs visualType/onScreenText/mechanism/
    // visualDescription — never durationInFrames/audioUrl — so it doesn't
    // actually need to wait for scene audio to finish measuring the way the
    // scene-code chunks do. Kick it off now, concurrently with audio
    // synthesis below, instead of after Stage 2 finishes; generateLessonCode
    // picks up this promise for its first attempt (see headerPromise param).
    // Attach a no-op .catch immediately so a header failure here doesn't
    // surface as an unhandled rejection before it's actually awaited —
    // generateLessonCode still sees (and handles) the real rejection when it
    // awaits this same promise.
    headerPromise = generateLessonHeader(lesson, scenePlan, undefined, { userId, courseId });
    headerPromise.catch(() => {});

    console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: audio...`);
    ({ scenePromises } = generateAllSceneAudioPipelined(scenePlan, async (index, measuredScene) => {
      try {
        await Course.findByIdAndUpdate(courseId, {
          $set: {
            [`lessons.${lesson.lessonNumber - 1}.sceneProgress.${index}.audioReady`]: true,
            [`lessons.${lesson.lessonNumber - 1}.sceneProgress.${index}.durationInFrames`]: measuredScene.durationInFrames,
          },
        });
      } catch (progressErr) {
        console.error(`[${courseId}] Lesson ${lesson.lessonNumber}: failed to save audio progress for scene ${index + 1} (non-fatal):`, progressErr.message);
      }
    }, { userId, courseId, lessonNumber: lesson.lessonNumber }));
  } catch (err) {
    const stage = "scenes";
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

  // ── Stage 2: wait for every scene's audio ────────────────────────────────
  // Single-call code generation needs the FULL scene table (every real
  // duration + audio URL) up front — it writes the whole <Series> in one
  // response, so it can't start on a partial scene table the way per-scene
  // generation could. Awaited ONCE, outside the code-gen retry loop below
  // (scenePromises never changes across retries — retrying can't fix a
  // scene whose audio itself failed, so an audio failure here is terminal,
  // not retried).
  //
  // Promise.allSettled, not Promise.all: with several scenePromises in
  // flight, Promise.all only ever attaches its OWN rejection handling to
  // "whichever settles first" — if a SECOND scene's audio also fails after
  // the first rejection already resolved the Promise.all, that second
  // rejection has no handler left anywhere and crashes the whole Node
  // process with an unhandled rejection, taking down every other course
  // building concurrently, not just this one. allSettled attaches its own
  // handler to EVERY promise regardless of order, so this can't happen.
  const settled = await Promise.allSettled(scenePromises);
  const firstRejection = settled.find((s) => s.status === "rejected");
  if (firstRejection) {
    const err = firstRejection.reason;
    const stage = err?.stage || "audio";
    const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
    console.error(
      `[${courseId}] Lesson ${lesson.lessonNumber} failed at ${stage} stage (${elapsedMin} min elapsed): ${err?.message}`
    );
    await logAttempt({ status: "failed", stage, errorMessage: err?.message, attemptNumber: 1 });
    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`lessons.${lesson.lessonNumber - 1}.status`]: "failed",
        [`lessons.${lesson.lessonNumber - 1}.error`]: `Failed at ${stage}: ${err?.message}`,
      },
    });
    return;
  }

  const measuredScenes = settled.map((s) => s.value);
  const totalFrames = measuredScenes.reduce((sum, s) => sum + s.durationInFrames, 0);

  // ── Stage 3: code generation (already had its own retry loop) ──────────
  let lastError = null;
  let lastAttempt = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastAttempt = attempt;
    const componentName = `Lesson${crypto.randomBytes(4).toString("hex")}`;

    try {
      if (attempt > 1) {
        console.log(
          `[${courseId}] Lesson ${lesson.lessonNumber}: code failed — retrying (attempt ${attempt}/${MAX_ATTEMPTS})...`
        );
      }

      console.log(`[${courseId}] Lesson ${lesson.lessonNumber}: code...`);
      // headerPromise only passed on this outer loop's first attempt — a
      // retry here means Stage 3 already failed once, so a fresh header is
      // generated the normal way (matches generateLessonCode's own internal
      // "only attempt 1" rule for the same promise).
      const { code: tsxCode } = await generateLessonCode(
        lesson,
        componentName,
        measuredScenes,
        totalFrames,
        undefined,
        {
          userId, courseId, headerPromise: attempt === 1 ? headerPromise : null,
          // Fires the instant a chunk of scenes (start..start+count-1) lands
          // — lets the filmstrip show a green check per scene as chunks
          // finish, instead of everything jumping from 0 to "ready" only
          // once the WHOLE lesson's code is done. Best-effort: a failed
          // write here shouldn't fail code generation, just leaves those
          // scenes showing "not ready yet" a little longer than reality.
          onChunkReady: (start, count) => {
            const update = {};
            for (let i = start; i < start + count; i++) {
              update[`lessons.${lesson.lessonNumber - 1}.sceneProgress.${i}.codeReady`] = true;
            }
            Course.findByIdAndUpdate(courseId, { $set: update }).catch((progressErr) => {
              console.error(`[${courseId}] Lesson ${lesson.lessonNumber}: failed to save code progress for scenes ${start + 1}-${start + count} (non-fatal):`, progressErr.message);
            });
          },
        }
      );

      // Scene boundaries for replay analytics (Progress model) — computed
      // from the same measured scenes the code generator just used, in the
      // same order they're laid out in the compiled <Series>.
      let cursor = 0;
      const sceneMeta = measuredScenes.map((s, i) => {
        const startFrame = cursor;
        cursor += s.durationInFrames;
        return { index: i, startFrame, endFrame: cursor, label: s.onScreenText || `Scene ${i + 1}` };
      });

      // measuredScenes still carries each scene's full spoken `.narration`
      // (generateSceneAudio spreads the original scenePlan entry, see
      // ttsService.js) — everything ELSE about a scene (visualDescription,
      // mechanism) is discarded after code generation, but this is worth
      // keeping: it's the actual rich educational content that ends up in
      // the video, and generateCourseQuiz (claudeService.js) reads it back
      // from here to ground the quiz in what the course actually teaches,
      // instead of just the pre-generation plan's title/description.
      const narrationScript = measuredScenes.map((s) => s.narration).filter(Boolean).join(" ");

      await Course.findByIdAndUpdate(courseId, {
        $set: {
          [`lessons.${lesson.lessonNumber - 1}.code`]: tsxCode,
          [`lessons.${lesson.lessonNumber - 1}.totalFrames`]: totalFrames,
          [`lessons.${lesson.lessonNumber - 1}.narrationScript`]: narrationScript,
          [`lessons.${lesson.lessonNumber - 1}.scenes`]: sceneMeta,
          [`lessons.${lesson.lessonNumber - 1}.status`]: "ready",
          [`lessons.${lesson.lessonNumber - 1}.error`]: null,
        },
      });

      const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
      console.log(`[${courseId}] Lesson ${lesson.lessonNumber} ready — took ${elapsedMin} min total (scene plan + audio + code).`);
      await logAttempt({ status: "success", stage: "code", errorMessage: null, attemptNumber: attempt });
      await logLessonUsageSummary();

      return;

    } catch (err) {
      lastError = err;
      console.error(
        `[${courseId}] Lesson ${lesson.lessonNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`
      );
      await logAttempt({ status: "failed", stage: err.stage || "code", errorMessage: err.message, attemptNumber: attempt });

      // scenePromises is created ONCE, outside this retry loop, and reused
      // across every attempt (same as measuredScenes/totalFrames used to
      // be) — a scene whose audio permanently failed has an already-
      // rejected promise that will reject again identically on every future
      // attempt. Retrying can't ever change that outcome, so don't burn a
      // second attempt (and its backoff delay) on a failure mode retrying
      // is guaranteed not to fix — matches the original pre-pipelining
      // behavior, where an audio failure was never retried at all.
      if (err.stage === "audio") break;
    }
  }

  const elapsedMin = ((Date.now() - lessonStart) / 60000).toFixed(1);
  console.error(
    `[${courseId}] Lesson ${lesson.lessonNumber} permanently failed after ${lastAttempt} attempt(s) (${elapsedMin} min elapsed)`
  );
  await Course.findByIdAndUpdate(courseId, {
    $set: {
      [`lessons.${lesson.lessonNumber - 1}.status`]: "failed",
      [`lessons.${lesson.lessonNumber - 1}.error`]: lastError?.message || "Unknown error",
    },
  });
  // Still worth knowing the real spend even on a lesson that never made it
  // — every retry attempt already cost real tokens regardless of outcome.
  await logLessonUsageSummary();
}


// Builds every lesson in a course CONCURRENTLY — shared by processCourse
// (the normal path) and unlockRemainingLessonsHandler (resuming a
// free-trial course after the user buys credits), so this logic only lives
// in one place.
//
// Lesson code generation is one call per lesson (see generateLessonCode in
// claudeService.js) — the pool (limitLessonCodeCall, default 6 — see
// claudeService.js) is sized to let every lesson in a course build at once
// with no queuing. A lesson that fails doesn't block its siblings —
// buildLesson handles its own errors internally and never rethrows for a
// content failure, only Promise.allSettled below needs to know it settled.
async function buildLessonsConcurrently(courseId, lessons, userId = null) {
  await Promise.allSettled(lessons.map((lesson) => buildLesson(courseId, lesson, userId)));
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
async function processCourse(
  courseId,
  topic,
  pdfBuffer,
  isFreeTrialCourse = false,
  level = null,
  sourceFileName = null,
  lessonCount = 6,
  mcqCount = 20,
  userId = null
) {
  const courseStart = Date.now();
  try {
    console.log(`[${courseId}] Generating course plan...`);
    // Quiz questions are NOT generated here anymore — generateCoursePlan
    // only produces the lesson outline now (see its own comment in
    // claudeService.js). This call used to also have to produce mcqCount
    // structured MCQs before ANY lesson could start building; dropping that
    // shortens time-to-first-lesson. The quiz itself is generated further
    // down, AFTER buildLessonsConcurrently, so it can be grounded in what
    // the lessons actually say (their real narration) instead of just this
    // plan's title/description/keyPoints.
    const { lessons } = await generateCoursePlan(
      topic,
      null,
      pdfBuffer,
      sourceFileName,
      level,
      3,
      lessonCount,
      { userId, courseId }
    );

    await Course.findByIdAndUpdate(courseId, {
      lessons: lessons.map((l) => ({
        ...l,
        // Every lesson renders now, trial or not — no "locked" status.
        status: "rendering",
        code: null,
        totalFrames: null,
      })),
    });

    // Course-level component pre-generation — runs ONCE, before any lesson
    // starts building below. buildLessonsConcurrently fires every lesson's
    // full pipeline in PARALLEL, so this is the only point where something
    // can be guaranteed visible to every lesson in this course from the
    // start (see generateCourseComponents's own comment in claudeService.js
    // for why this can't be done per-lesson instead). Awaited, not fire-
    // and-forget: the whole point is for lessons to see these from their
    // very first header-generation call, not sometime after they've already
    // started. Non-fatal internally (see its own try/catch) — this never
    // throws, so no try/catch needed here.
    console.log(`[${courseId}] Course-level component planning...`);
    await generateCourseComponents(topic, lessons, { userId, courseId });

    // Build all of this course's lessons one at a time, regardless of trial
    // status — how many that is now depends on the selected tier (or the
    // free trial's fixed 6), not a hardcoded count.
    await buildLessonsConcurrently(courseId, lessons, userId);

    // Quiz generation, now that every lesson has (attempted to) build and
    // narrationScript is populated for whichever ones succeeded. Wrapped so
    // a quiz-generation failure never fails the whole course — the lessons
    // are already built and watchable regardless; the frontend's QuizSection
    // already renders an empty/pending state when questions.length === 0
    // (see AiTutor.tsx), so a course landing without a quiz degrades
    // gracefully instead of erroring the user's whole course out.
    try {
      const builtCourse = await Course.findById(courseId).select("lessons.title lessons.narrationScript");
      const questions = await generateCourseQuiz(topic, builtCourse.lessons, mcqCount, undefined, { userId, courseId });
      await Course.findByIdAndUpdate(courseId, { questions });
    } catch (quizErr) {
      console.error(`[${courseId}] Quiz generation failed (course still usable without it):`, quizErr.message);
    }

    await Course.findByIdAndUpdate(courseId, { status: "ready" });
    const totalMin = ((Date.now() - courseStart) / 60000).toFixed(1);
    console.log(`[${courseId}] Course fully ready — took ${totalMin} min total.`);
    sendCourseReadyEmail(courseId, userId);
  } catch (err) {
    const totalMin = ((Date.now() - courseStart) / 60000).toFixed(1);
    console.error(`[${courseId}] Course processing failed after ${totalMin} min:`, err);
    // findByIdAndUpdate without {new: true} returns the PRE-update doc, which
    // still has the credit-cost snapshot needed to refund it.
    const course = await Course.findByIdAndUpdate(courseId, { status: "failed" });
    if (course && !course.isFreeTrialCourse && course.creditCost > 0) {
      try {
        await grantCredits(course.userId, course.creditCost, "refund", {
          courseId,
          reason: "generation_failed",
        });
        console.log(`[${courseId}] Refunded ${course.creditCost} credits to ${course.userId} after generation failure.`);
      } catch (refundErr) {
        console.error(`[${courseId}] Failed to refund credits after generation failure:`, refundErr.message);
      }
    }
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

// ── Generate (or return existing) share link for a course ───────────────────
// Owner-only — creates a random, unguessable token the first time this is
// called for a course, then always returns the same token on subsequent
// calls. The token (not the Mongo _id) is what appears in the public URL,
// so a shared link never exposes or lets anyone guess a real course ID.
async function generateShareLinkHandler(req, res) {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      userId: req.user._id,
    });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    // Only fully-generated courses can be shared — sharing a course that's
    // still generating, or that failed, would show a broken/incomplete
    // experience to whoever receives the link.
    if (course.status !== "ready") {
      res.status(400).json({ error: "Only a fully-generated course can be shared." });
      return;
    }

    if (!course.shareToken) {
      course.shareToken = crypto.randomBytes(12).toString("hex");
      course.isShared = true;
      await course.save();
    } else if (!course.isShared) {
      // Token already exists (was shared before, then unshared) — just
      // re-enable it rather than generating a new token, so any link
      // already sent out before still works after re-sharing.
      course.isShared = true;
      await course.save();
    }

    const shareUrl = `${process.env.CLIENT_URL}/shared/${course.shareToken}`;
    res.json({ shareToken: course.shareToken, shareUrl, isShared: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate share link" });
  }
}

// ── Turn off sharing for a course (owner-only) ───────────────────────────────
// Keeps the same shareToken in the database (so re-sharing later doesn't
// invalidate a link that was already sent out and then paused), but flips
// isShared to false so the public endpoint below stops serving it.
//
// Also cascades to isPublished: a published gallery listing links straight
// to the /shared/:shareToken page (see publishCourseHandler) — if the link
// itself stops working, leaving the gallery entry up would just be a dead
// link in a public listing. Unsharing always fully removes a course from
// public view; the reverse isn't true (see unpublishCourseHandler).
async function unshareCourseHandler(req, res) {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.courseId, userId: req.user._id },
      { $set: { isShared: false, isPublished: false } },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json({ isShared: false, isPublished: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unshare course" });
  }
}

// ── Publish a course to the public gallery (owner-only) ─────────────────────
// Publishing implies sharing: the gallery links each card straight to the
// existing /shared/:shareToken viewer, so publishing ensures a share token
// exists and is active (reusing generateShareLinkHandler's same lazy-create
// logic) before flipping isPublished on. publishedAt is stamped fresh on
// every publish call — including re-publishing after an unpublish — so a
// course a user brings back gets fresh gallery visibility rather than
// keeping its original (possibly ancient) position in the recency sort.
async function publishCourseHandler(req, res) {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      userId: req.user._id,
    });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (course.status !== "ready") {
      res.status(400).json({ error: "Only a fully-generated course can be published." });
      return;
    }

    if (!course.shareToken) {
      course.shareToken = crypto.randomBytes(12).toString("hex");
    }
    course.isShared = true;
    course.isPublished = true;
    course.publishedAt = new Date();
    await course.save();

    res.json({
      isPublished: true,
      publishedAt: course.publishedAt,
      shareUrl: `${process.env.CLIENT_URL}/shared/${course.shareToken}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to publish course" });
  }
}

// ── Remove a course from the public gallery (owner-only) ────────────────────
// Delists only — does NOT touch isShared/shareToken, so a direct link the
// owner already shared keeps working. To fully revoke access, use unshare.
async function unpublishCourseHandler(req, res) {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.courseId, userId: req.user._id },
      { $set: { isPublished: false } },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json({ isPublished: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unpublish course" });
  }
}

// ── Keyset pagination cursor (opaque to the client) ──────────────────────────
// Encodes the (publishedAt, _id) of the last row on a page, so the next page
// can resume with "everything after this point" instead of skip/limit's
// "everything before this point, discarded" — the difference that keeps
// this O(limit) per page at any depth instead of O(page * limit).
function encodeCursor(course) {
  return Buffer.from(JSON.stringify({ p: course.publishedAt, id: course._id.toString() })).toString("base64url");
}
function decodeCursor(raw) {
  try {
    const { p, id } = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!p || !id) return null;
    return { publishedAt: new Date(p), id };
  } catch {
    return null;
  }
}

// ── Public gallery: search + paginate published courses (no auth) ───────────
// ?q= optional search term (matched against topic via the isPublished+topic
// text index) — result set is always sorted by recency (publishedAt), not
// text relevance, so the same keyset cursor logic works identically whether
// or not a search term is present.
async function listPublicCoursesHandler(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const q = (req.query.q || "").trim();
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;

    const filter = { isPublished: true };
    if (q) filter.$text = { $search: q };
    if (cursor) {
      filter.$or = [
        { publishedAt: { $lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await Course.find(filter)
      .select("topic publishedAt userId shareToken")
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate("userId", "name")
      .lean();

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      courses: page.map((c) => ({
        _id: c._id,
        topic: c.topic,
        publishedAt: c.publishedAt,
        shareUrl: `/shared/${c.shareToken}`,
        author: c.userId?.name || "Anonymous",
      })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load the public gallery" });
  }
}

// ── Public, unauthenticated fetch of a shared course by its share token ─────
// No auth required — this is the endpoint the recipient of a shared link
// hits. Only returns data if isShared is currently true, so the owner can
// revoke access at any time via unshareCourseHandler above.
//
// Deliberately strips anything the recipient doesn't need and shouldn't
// see: userId, email-adjacent fields, internal generation logs, etc. Only
// the actual course content (lessons, questions) plus the topic are exposed.
async function getSharedCourseHandler(req, res) {
  try {
    const course = await Course.findOne({
      shareToken: req.params.shareToken,
      isShared: true,
    }).select("topic lessons questions createdAt");

    if (!course) {
      res.status(404).json({ error: "This shared course wasn't found, or is no longer being shared." });
      return;
    }

    res.json(course);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load shared course" });
  }
}

// ── List the logged-in user's courses ────────────────────────────────────────
// Supports pagination via ?page=1&limit=8 — defaults to page 1, 8 per page.
// Fetches one extra document beyond the page size to cheaply determine
// hasMore without a separate count() query.
//
// Excludes the heavy per-lesson fields (compiled Remotion `code`, the
// mid-generation `sceneProgress` array with its own duplicate `previewCode`
// per scene, and TTS-only `narrationScript`/`audioUrl`) that this sidebar
// list never renders — see HistorySidebar, which only reads
// title/date/status per entry. A single course document without this
// projection can run 600KB+ (100k+ chars of generated code PER lesson x 6
// lessons, often doubled again by sceneProgress's own previewCode copies),
// so fetching a page of ~9 full documents just to show a title list was
// transferring and JSON-parsing several MB for a UI that displays none of
// it. The frontend (AiTutor.tsx's restoreEntry) lazily fetches the full
// course — code included — via getCourseStatus only when a course is
// actually opened, not on every initial sidebar load.
const COURSE_LIST_EXCLUDED_FIELDS = "-lessons.code -lessons.narrationScript -lessons.audioUrl -lessons.sceneProgress";

async function listCoursesHandler(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
    const skip = (page - 1) * limit;

    const courses = await Course.find({ userId: req.user._id })
      .select(COURSE_LIST_EXCLUDED_FIELDS)
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
// Shared by the user-facing handler below (ownership-checked) and the admin
// delete endpoint (adminController.js's adminDeleteCourse, no ownership
// check — an admin can delete ANY course). `course` must already be the
// fetched Mongoose/lean doc for the course to delete.
async function deleteCourseById(course) {
  // Collect every audio file path first, then delete them all in parallel
  // off the event loop (fs.promises.unlink instead of the old
  // fs.existsSync + fs.unlinkSync pair, which blocked the whole server —
  // not just this request — once per scene, sequentially).
  const filePaths = (course.lessons || [])
    .flatMap((lesson) => lesson.scenes || [])
    .map((scene) => scene.audioUrl?.split("/audio/")[1])
    .filter(Boolean)
    .map((fileName) => path.join(AUDIO_DIR, fileName));

  await Promise.all(
    filePaths.map((filePath) =>
      fs.promises.unlink(filePath).catch((e) => {
        if (e.code !== "ENOENT") console.error("Failed to delete audio file (non-fatal):", e.message);
      })
    )
  );

  await Course.deleteOne({ _id: course._id });
}

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

    await deleteCourseById(course);
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

    // Mark as rendering so the frontend shows the loading state. Also flip
    // the PARENT course.status back to "generating" — the course was
    // "ready" before this retry (every lesson had finished), but
    // pollCourse (CourseApi.ts) stops polling the instant course.status is
    // "ready", checking only that top-level field, never per-lesson status.
    // Without this, pollCourse's very first tick would see the still-"ready"
    // course, fire onUpdate once, then immediately stop — leaving the
    // frontend's lessonStatuses stuck on that one stale "rendering" snapshot
    // forever, even after this retry actually finishes and the lesson is
    // fully playable (a real reported symptom: "it's done but still shows
    // loading"). Same fix already applied in unlockRemainingLessonsHandler
    // for the identical hazard.
    await Course.findByIdAndUpdate(courseId, {
      $set: {
        [`lessons.${idx}.status`]: "rendering",
        [`lessons.${idx}.code`]: null,
        status: "generating",
      },
    });

    res.json({ ok: true, message: "Regenerating lesson" });

    // Rebuild in background (same as initial generation)
    const lessonData = {
      lessonNumber: idx + 1,
      title: lesson.title,
      description: lesson.description,
      keyPoints: lesson.keyPoints,
    };

    // buildLesson resolves normally whether this lesson ends up "ready" or
    // permanently "failed" (it handles its own error paths internally and
    // never rethrows for a content/generation failure — only for a truly
    // unexpected exception does the .catch below fire) — so flipping
    // course.status back to "ready" here, unconditionally on resolution,
    // mirrors how the initial course build treats "ready" as "not actively
    // generating anymore," not "every lesson definitely succeeded" (see
    // processCourse's own unconditional `status: "ready"` after
    // buildLessonsConcurrently). Without this, course.status would stay
    // "generating" forever after a retry, since nothing else ever flips it
    // back — the opposite failure mode from the bug this whole change fixes
    // (pollCourse would never stop, instead of stopping too early).
    buildLesson(courseId, lessonData, req.user._id)
      .then(() => Course.findByIdAndUpdate(courseId, { status: "ready" }))
      .catch((err) => {
        console.error(`[${courseId}] Retry lesson ${idx + 1} failed:`, err.message);
      });
  } catch (err) {
    console.error("retryLessonHandler error:", err);
    res.status(500).json({ error: "Failed to retry lesson" });
  }
}

// ── Fix ONE scene — or the shared header — not the whole lesson ─────────────
// Called when a real user hits a crash watching an already-finished lesson
// (see DynamicPlayer.tsx's onRetry) — the far more common case than a broken
// lesson slipping past generation-time validation entirely. Regenerating the
// whole lesson for a one-scene (or one-header-line) bug is wasteful (a full
// lesson is 6-14 scenes + narration audio); this patches just whatever
// actually broke, using the lesson's OWN saved code as context (see
// patchSceneFromRuntimeError's own comment for why no separately-stored
// scene spec is needed). A bug can live in either place: a single scene's
// own code, or the header every scene shares (PALETTE, Backdrop, Arrow,
// etc.) — see locateErrorIsInHeader below for how those are told apart.
//
// Synchronous, unlike retryLessonHandler's fire-and-forget: one patch is one
// small LLM call, fast enough to just await and return the result — no
// course.status flip, no polling. The frontend shows its own lightweight
// "Fixing the part that broke…" state around this single request instead of
// the full lesson-generating skeleton.
async function retrySceneHandler(req, res) {
  try {
    const { courseId, lessonIndex } = req.params;
    const { crashFrame, errorMessage } = req.body;
    const idx = parseInt(lessonIndex, 10);

    if (!errorMessage) {
      return res.status(400).json({ error: "errorMessage is required" });
    }

    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (idx < 0 || idx >= course.lessons.length) return res.status(400).json({ error: "Invalid lesson index" });

    const lesson = course.lessons[idx];
    if (!lesson.code) return res.status(400).json({ error: "Lesson has no code to patch" });

    const componentName = lesson.code.match(/export const (\w+) =/)?.[1];
    if (!componentName) {
      return res.status(422).json({ error: "Could not identify lesson component name", fallbackToFullRetry: true });
    }

    // Resolve WHERE the bug actually is, in priority order:
    //   1. A compile error's own line number, if it lands in the HEADER —
    //      the shared imports/constants/components every scene calls into
    //      (a broken PALETTE value, a buggy Backdrop) — fixing a SCENE
    //      wouldn't find anything wrong, since the bug isn't there.
    //   2. The crash frame (most reliable when available — exactly which
    //      <Series.Sequence> was on screen when it broke) against the
    //      lesson's own saved scene boundaries.
    //   3. The error's own line number against the saved code directly (a
    //      compile error caught before playback ever started, so there's no
    //      frame) — landing in a scene this time, not the header.
    //   4. The IDENTIFIER named in the error, if it's the "X is not defined"/
    //      "X is not a function" shape — the common case for a compile-time
    //      crash, and the one tiers 1 and 3 can't actually reach: the
    //      frontend (useCompilation.ts) only ever keeps the error's bare
    //      message, never a line number, and even if it had one, that line
    //      would point into a Babel-transpiled/import-stripped/prelude-
    //      prepended COPY of the code, not reliably mappable back to
    //      lesson.code at all. Searching for where the named identifier is
    //      actually referenced sidesteps needing a line number in the first
    //      place. See locateIdentifierScope's own comment.
    // If none of these resolve, there's nothing to target a patch at.
    const errorLine = extractErrorLine(errorMessage);
    let targetsHeader = locateErrorIsInHeader(lesson.code, errorLine);

    let sceneIndex = null;
    if (!targetsHeader) {
      if (typeof crashFrame === "number" && lesson.scenes?.length) {
        const scene = lesson.scenes.find((s) => crashFrame >= s.startFrame && crashFrame < s.endFrame);
        if (scene) sceneIndex = scene.index;
      }
      if (sceneIndex === null) {
        sceneIndex = locateSceneIndexAtLineInFullCode(lesson.code, errorLine);
      }
      if (sceneIndex === null) {
        const identifier = extractUndefinedIdentifier(errorMessage);
        const located = identifier ? locateIdentifierScope(lesson.code, identifier) : null;
        if (located?.type === "header") targetsHeader = true;
        else if (located?.type === "scene") sceneIndex = located.index;
      }
    }

    if (!targetsHeader && sceneIndex === null) {
      return res.status(422).json({
        error: "Could not isolate which scene (or the header) failed",
        fallbackToFullRetry: true,
      });
    }

    const patchedCode = targetsHeader
      ? await patchHeaderFromRuntimeError(
          lesson, componentName, lesson.code, errorMessage,
          { userId: req.user._id, courseId }
        )
      : await patchSceneFromRuntimeError(
          lesson, componentName, lesson.code, sceneIndex, errorMessage,
          { userId: req.user._id, courseId }
        );

    await Course.findByIdAndUpdate(courseId, {
      $set: { [`lessons.${idx}.code`]: patchedCode },
    });

    // Returns the patched code directly (unlike retryLessonHandler's
    // fire-and-forget + poll) — one scene is one fast LLM call, so the
    // frontend can just await this and swap the code in immediately instead
    // of spinning up a poll loop for something that's already done.
    res.json(
      targetsHeader
        ? { ok: true, target: "header", code: patchedCode }
        : { ok: true, target: "scene", sceneIndex, sceneNumber: sceneIndex + 1, code: patchedCode }
    );
  } catch (err) {
    console.error("retrySceneHandler error:", err);
    res.status(500).json({ error: "Failed to patch lesson", fallbackToFullRetry: true });
  }
}

// ── Unlock the rest of a free-trial course ──────────────────────────────────
// Called after the user buys credits and wants to continue a course that
// was capped at lesson 1. Costs 1 credit (same price as any other course),
// then builds lessons 2-6 one at a time, same as a normal paid course would.
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

    buildLessonsConcurrently(courseId, lessonsToBuild, req.user._id)
      .then(() => Course.findByIdAndUpdate(courseId, { status: "ready" }))
      .then(() => sendCourseReadyEmail(courseId, req.user._id))
      .catch((err) => {
        console.error(`[${courseId}] Unlock build failed:`, err.message);
      });
  } catch (err) {
    console.error("unlockRemainingLessonsHandler error:", err);
    res.status(500).json({ error: "Failed to unlock course" });
  }
}

// ── Continuous learning: "what should I learn next?" ────────────────────────
// GET /api/course/:courseId/next-suggestions — owner-only. Works for ANY
// finished course, solo or collaborative, not just rooms — this is what
// turns course generation into an ongoing curriculum instead of one-off
// requests. Weak topics (if the user has taken the quiz) steer the
// suggestions toward reinforcing what they actually struggled with.
async function getNextSuggestionsHandler(req, res) {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, userId: req.user._id })
      .select("topic status")
      .lean();
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.status !== "ready") {
      return res.status(400).json({ error: "This course isn't finished generating yet" });
    }

    const latestAttempt = await QuizAttempt.findOne({ userId: req.user._id, courseId: course._id })
      .sort({ submittedAt: -1 })
      .lean();
    const weakTopics = latestAttempt
      ? latestAttempt.topicBreakdown.filter((t) => t.pct < 70).map((t) => t.topic)
      : [];

    const suggestions = await generateNextCourseSuggestions(course.topic, weakTopics, 2, { userId: req.user._id, courseId: course._id });
    res.json({ suggestions });
  } catch (err) {
    console.error("getNextSuggestionsHandler error:", err);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
}

module.exports = {
  generateCourseHandler,
  getCourseStatusHandler,
  listCoursesHandler,
  deleteCourseHandler,
  getShowcaseCoursesHandler,
  retryLessonHandler,
  retrySceneHandler,
  unlockRemainingLessonsHandler,
  generateShareLinkHandler,
  // Exported for collabController.js — creating a collaborative room's
  // shared course reuses this exact background generation flow (scene plan
  // -> audio -> code, per lesson) rather than duplicating it.
  processCourse,
  buildLesson,
  unshareCourseHandler,
  getSharedCourseHandler,
  publishCourseHandler,
  unpublishCourseHandler,
  listPublicCoursesHandler,
  getNextSuggestionsHandler,
  // Exported for adminController.js's adminDeleteCourse — same audio-cleanup
  // + delete logic, just without the ownership (userId) filter.
  deleteCourseById,
};