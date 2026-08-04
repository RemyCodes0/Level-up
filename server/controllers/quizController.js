const Course = require("../models/Course");
const QuizAttempt = require("../models/QuizAttempt");
const CollabRoom = require("../models/CollabRoom");
const { maybeTriggerRemedial } = require("../services/remedialService");

const READY_PCT = 85;
const ALMOST_PCT = 70;
const REVIEW_PCT = 55;

function readinessLabel(pct) {
  if (pct >= READY_PCT) return "Exam Ready";
  if (pct >= ALMOST_PCT) return "Almost Ready";
  if (pct >= REVIEW_PCT) return "Needs Review";
  return "Needs Practice";
}

// Server-side scoring — the client sends only { questionId, selected }, never
// a score or correctness, so nothing about the result can be forged by
// tampering with the request body. Shared by quiz submission here and by
// remedialService's group-weakness analysis (both need the same shape).
function scoreAnswers(questions, submittedAnswers) {
  const bySelected = new Map(submittedAnswers.map((a) => [a.questionId, a.selected]));

  const answers = questions.map((q) => {
    const selected = bySelected.has(q.id) ? bySelected.get(q.id) : -1;
    return { questionId: q.id, selected, correct: selected === q.correct, topic: q.topic };
  });

  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  const byTopic = new Map();
  for (const a of answers) {
    if (!byTopic.has(a.topic)) byTopic.set(a.topic, { correct: 0, total: 0 });
    const t = byTopic.get(a.topic);
    t.total++;
    if (a.correct) t.correct++;
  }
  const topicBreakdown = [...byTopic.entries()]
    .map(([topic, t]) => ({ topic, correct: t.correct, total: t.total, pct: Math.round((t.correct / t.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  return { answers, score, total, pct, topicBreakdown };
}

function buildMissedQuestions(questions, answers) {
  return questions
    .filter((q) => {
      const a = answers.find((x) => x.questionId === q.id);
      return a && !a.correct;
    })
    .map((q) => {
      const a = answers.find((x) => x.questionId === q.id);
      return {
        questionId: q.id,
        question: q.question,
        topic: q.topic,
        yourAnswer: a.selected >= 0 ? q.options[a.selected] : null,
        correctAnswer: q.options[q.correct],
      };
    });
}

// `attempt` is the attempt being viewed/just-submitted — trend is computed
// relative to it, so this works identically whether called right after
// submission or later when restoring a past result (getLatestAttempt).
async function buildTrend(attempt) {
  const [previous, attemptNumber] = await Promise.all([
    QuizAttempt.findOne({
      userId: attempt.userId,
      courseId: attempt.courseId,
      submittedAt: { $lt: attempt.submittedAt },
    })
      .sort({ submittedAt: -1 })
      .lean(),
    QuizAttempt.countDocuments({
      userId: attempt.userId,
      courseId: attempt.courseId,
      submittedAt: { $lte: attempt.submittedAt },
    }),
  ]);
  if (!previous) return null;

  const prevByTopic = new Map(previous.topicBreakdown.map((t) => [t.topic, t.pct]));
  const improvedTopics = [];
  const regressedTopics = [];
  for (const t of attempt.topicBreakdown) {
    const prevPct = prevByTopic.get(t.topic);
    if (prevPct === undefined) continue;
    if (t.pct > prevPct) improvedTopics.push(t.topic);
    else if (t.pct < prevPct) regressedTopics.push(t.topic);
  }

  return { previousPct: previous.pct, delta: attempt.pct - previous.pct, attemptNumber, improvedTopics, regressedTopics };
}

async function buildRoomComparison(room, courseId, userPct) {
  if (!room) return null;
  const memberIds = room.participants.map((p) => p.userId);
  const roomAttempts = await QuizAttempt.find({ courseId, roomId: room._id, userId: { $in: memberIds } })
    .sort({ submittedAt: -1 })
    .lean();
  const latestByUser = new Map();
  for (const a of roomAttempts) {
    const key = a.userId.toString();
    if (!latestByUser.has(key)) latestByUser.set(key, a);
  }
  const pcts = [...latestByUser.values()].map((a) => a.pct);
  const roomAveragePct = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : userPct;
  return { roomAveragePct, aboveAverage: userPct >= roomAveragePct, membersReporting: pcts.length };
}

// Shared shape-builder — used by BOTH submitQuiz's response and
// getLatestAttempt, so a restored ("what did I get last time") view is
// exactly as rich as the just-submitted one, never a stripped-down version
// of it. This is what the frontend (QuizResultsView in
// src/collab/CollabRoomPage.tsx, and AiTutor.tsx's ResultsSection) relies on
// being interchangeable regardless of which endpoint produced it.
async function buildEnrichedResult({ course, attempt, room }) {
  const missedQuestions = buildMissedQuestions(course.questions, attempt.answers);
  const trend = await buildTrend(attempt);
  const roomComparison = await buildRoomComparison(room, course._id, attempt.pct);

  return {
    attemptId: attempt._id,
    score: attempt.score,
    total: attempt.total,
    pct: attempt.pct,
    readinessLabel: readinessLabel(attempt.pct),
    topicBreakdown: attempt.topicBreakdown,
    missedQuestions,
    trend,
    roomComparison,
  };
}

// POST /api/quiz/:courseId/submit
// Body: { answers: [{ questionId, selected }], roomId? }
exports.submitQuiz = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { answers: submitted, roomId } = req.body;

    if (!Array.isArray(submitted)) {
      return res.status(400).json({ error: "answers must be an array" });
    }

    const course = await Course.findById(courseId).select("questions status");
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!course.questions?.length) return res.status(400).json({ error: "This course has no quiz" });

    // If a roomId was passed, confirm the requester is actually a member —
    // otherwise anyone could attribute a fabricated attempt to a room they
    // never joined, polluting the group dashboard/remedial trigger.
    let room = null;
    if (roomId) {
      room = await CollabRoom.findOne({ _id: roomId, courseId, "participants.userId": req.user._id }).lean();
      if (!room) return res.status(403).json({ error: "You're not a member of this room" });
    }

    const { answers, score, total, pct, topicBreakdown } = scoreAnswers(course.questions, submitted);

    const attempt = await QuizAttempt.create({
      userId: req.user._id,
      courseId,
      roomId: roomId || null,
      answers,
      score,
      total,
      pct,
      topicBreakdown,
    });

    const result = await buildEnrichedResult({ course, attempt, room });
    res.json(result);

    // Fire-and-forget — never let the remedial-lesson pipeline (which can
    // involve minutes of scene/audio/code generation) hold up the response
    // the user is waiting on for their own result. Only relevant when this
    // attempt was submitted inside a room.
    if (room) {
      maybeTriggerRemedial(room._id.toString()).catch((err) =>
        console.error(`[quiz] remedial check failed for room ${room._id}:`, err.message)
      );
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};

// GET /api/quiz/:courseId/attempts — this user's full attempt history for a
// course, oldest first (powers a score-over-time trend line).
exports.getAttempts = async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({ userId: req.user._id, courseId: req.params.courseId })
      .sort({ submittedAt: 1 })
      .select("-answers")
      .lean();
    res.json(attempts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quiz attempts" });
  }
};

// GET /api/quiz/:courseId/attempts/latest — restores the results view on
// reload instead of it vanishing (the pre-existing bug this whole feature
// starts by fixing). Returns the SAME enriched shape submitQuiz does.
exports.getLatestAttempt = async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({ userId: req.user._id, courseId: req.params.courseId }).sort({ submittedAt: -1 });
    if (!attempt) return res.status(404).json({ error: "No attempt found" });

    const course = await Course.findById(req.params.courseId).select("questions");
    if (!course) return res.status(404).json({ error: "Course not found" });

    let room = null;
    if (attempt.roomId) {
      room = await CollabRoom.findOne({ _id: attempt.roomId, "participants.userId": req.user._id }).lean();
    }

    const result = await buildEnrichedResult({ course, attempt, room });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load latest attempt" });
  }
};

exports.scoreAnswers = scoreAnswers;
exports.readinessLabel = readinessLabel;
