const Course = require("../models/Course");
const CollabRoom = require("../models/CollabRoom");
const QuizAttempt = require("../models/QuizAttempt");
const { buildLesson } = require("../controllers/courseController");
const { generateRemedialLessonPlan } = require("./claudeService");

// Aggregates every participant's LATEST quiz attempt for the room's course
// and returns the topic with the lowest average pct across the group — the
// weakest shared spot, not any one individual's weak spot. Returns null if
// there isn't any quiz data yet (shouldn't happen once maybeTriggerRemedial
// has confirmed the completion threshold is met, but guarded regardless).
async function analyzeGroupWeaknesses(room) {
  const memberIds = room.participants.map((p) => p.userId);
  const attempts = await QuizAttempt.find({
    courseId: room.courseId,
    roomId: room._id,
    userId: { $in: memberIds },
  })
    .sort({ submittedAt: -1 })
    .lean();

  const latestByUser = new Map();
  for (const a of attempts) {
    const key = a.userId.toString();
    if (!latestByUser.has(key)) latestByUser.set(key, a);
  }
  if (latestByUser.size === 0) return null;

  const topicAgg = new Map();
  for (const a of latestByUser.values()) {
    for (const t of a.topicBreakdown) {
      if (!topicAgg.has(t.topic)) topicAgg.set(t.topic, []);
      topicAgg.get(t.topic).push(t.pct);
    }
  }
  if (topicAgg.size === 0) return null;

  let weakest = null;
  for (const [topic, pcts] of topicAgg) {
    const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
    if (!weakest || avgPct < weakest.avgPct) weakest = { topic, avgPct };
  }
  return weakest;
}

// Called after every quiz submission inside a room. Checks whether the
// group has reached its completion threshold and, if so and a remedial
// lesson hasn't already been generated for this room, generates and appends
// one. The remedialTriggered flip is a single atomic findOneAndUpdate
// filtered on the field's CURRENT false value — if two members submit their
// final quiz attempt within milliseconds of each other, only one of the two
// concurrent calls can win that filter and proceed past it.
async function maybeTriggerRemedial(roomId) {
  const room = await CollabRoom.findById(roomId);
  if (!room || room.remedialTriggered) return;

  const memberIds = room.participants.map((p) => p.userId);
  const submittedUserIds = await QuizAttempt.distinct("userId", {
    courseId: room.courseId,
    roomId: room._id,
    userId: { $in: memberIds },
  });
  const pctDone = memberIds.length > 0 ? (submittedUserIds.length / memberIds.length) * 100 : 0;

  if (pctDone < room.completionThreshold) return;

  const claimed = await CollabRoom.findOneAndUpdate(
    { _id: roomId, remedialTriggered: false },
    { $set: { remedialTriggered: true } },
    { new: true }
  );
  if (!claimed) return; // another concurrent submission already claimed this

  try {
    const weakest = await analyzeGroupWeaknesses(claimed);
    if (!weakest) {
      console.warn(`[remedial] Room ${roomId}: completion threshold met but no topic data found — skipping`);
      return;
    }

    const course = await Course.findById(claimed.courseId);
    if (!course) return;

    console.log(
      `[remedial] Room ${roomId}: generating remedial lesson for weakest group topic "${weakest.topic}" (avg ${weakest.avgPct}%)`
    );

    const plan = await generateRemedialLessonPlan(course.topic, weakest.topic, weakest.avgPct, 3, { userId: course.userId, courseId: course._id });
    const lessonNumber = course.lessons.length + 1;

    // buildLesson only ever $sets fields on an EXISTING lessons[] slot — it
    // never pushes a new element. So the placeholder has to exist first.
    await Course.findByIdAndUpdate(claimed.courseId, {
      $push: {
        lessons: {
          lessonNumber,
          title: plan.title,
          description: plan.description,
          keyPoints: plan.keyPoints,
          status: "rendering",
          code: null,
          totalFrames: null,
          isRemedial: true,
        },
      },
    });

    await buildLesson(claimed.courseId.toString(), {
      lessonNumber,
      title: plan.title,
      description: plan.description,
      keyPoints: plan.keyPoints,
    }, course.userId, course.courseLanguage);

    console.log(`[remedial] Room ${roomId}: remedial lesson ${lessonNumber} ready`);
  } catch (err) {
    console.error(`[remedial] Room ${roomId}: generation failed:`, err.message);
    // remedialTriggered stays true — a failed remedial generation doesn't
    // retry-storm on every subsequent quiz submission in the room, the same
    // way a permanently-failed solo-course lesson doesn't auto-retry either.
  }
}

module.exports = { analyzeGroupWeaknesses, maybeTriggerRemedial };
