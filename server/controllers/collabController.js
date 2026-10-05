const crypto = require("crypto");
const Course = require("../models/Course");
const User = require("../models/User");
const CollabRoom = require("../models/CollabRoom");
const Progress = require("../models/Progress");
const QuizAttempt = require("../models/QuizAttempt");
const { processCourse } = require("./courseController");

async function joinRoomInternal(room, userId) {
  const already = room.participants.some((p) => p.userId.toString() === userId.toString());
  if (!already) {
    room.participants.push({ userId });
    await room.save();
  }
  return room;
}

// POST /api/collab/rooms — creates the shared Course exactly the way a solo
// course is created (same Course.create shape, same background
// processCourse pipeline, same credit/free-trial deduction), then wraps it
// in a CollabRoom. The owner is auto-joined as the first participant.
exports.createRoom = async (req, res) => {
  try {
    const topic = req.body.topic || "";
    const pdfBuffer = req.file?.buffer ?? null;
    const sourceFileName = req.file?.originalname ?? null;
    const level = req.body.level || null;
    const name = (req.body.name || topic || req.file?.originalname || "Study Group").trim();
    const visibility = req.body.visibility === "public" ? "public" : "invite-only";
    const completionThreshold = Math.min(100, Math.max(1, Number(req.body.completionThreshold) || 100));

    if (!topic && !pdfBuffer) {
      return res.status(400).json({ error: "Topic or file required" });
    }

    // Set by checkCredits (routes/collab.js runs it the same as the solo
    // /generate route) — either the selected tier's real shape (already
    // atomically paid for by checkCredits via spendCredits) or, for a
    // request that sent no `tier`, the flat LEGACY_COURSE_SHAPE. Mirrors
    // generateCourseHandler's own handling of this in courseController.js —
    // see that function's comment for the full tier/legacy split. Fixes a
    // real bug: this used to ignore the snapshot entirely, always deducting
    // a flat 1 credit via $inc below while still generating a 6-lesson/
    // 20-question course regardless of what (if anything) was actually
    // paid for.
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
      // Legacy no-tier request — checkCredits didn't spend anything for
      // this path, so deduct the flat 1 credit here exactly as this always
      // did. Tier path: checkCredits already atomically spent
      // tierSnapshot.creditCost, so nothing more to deduct here.
      await User.findByIdAndUpdate(req.user._id, { $inc: { courseCredits: -1 } });
    }

    const room = await CollabRoom.create({
      courseId: course._id,
      ownerId: req.user._id,
      name,
      visibility,
      inviteCode: crypto.randomBytes(4).toString("hex").toUpperCase(), // 8 chars, typeable
      shareToken: crypto.randomBytes(12).toString("hex"), // long, unguessable — join-via-link
      completionThreshold,
      participants: [{ userId: req.user._id }],
    });

    res.json({
      roomId: room._id,
      courseId: course._id,
      inviteCode: room.inviteCode,
      joinUrl: `${process.env.CLIENT_URL}/collab/join/${room.inviteCode}`,
    });

    // Fire-and-forget, identical to how generateCourseHandler kicks off a
    // solo course — the response above doesn't wait for generation. Now
    // actually passes the tier's lessonCount/mcqCount through (previously
    // omitted, silently falling back to processCourse's own defaults of
    // 6 lessons / 20 questions regardless of what was paid for above).
    processCourse(
      course._id.toString(), topic, pdfBuffer, !!req.usingFreeTrial, level, sourceFileName,
      tierSnapshot.lessonCount, tierSnapshot.mcqCount, req.user._id
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create collaborative room" });
  }
};

// POST /api/collab/rooms/:roomId/join — direct join, public rooms only.
exports.joinRoomById = async (req, res) => {
  try {
    const room = await CollabRoom.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.visibility !== "public") return res.status(403).json({ error: "This room is invite-only — use an invite code or link." });
    await joinRoomInternal(room, req.user._id);
    res.json({ roomId: room._id, courseId: room.courseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to join room" });
  }
};

// POST /api/collab/join/:inviteCode — works for BOTH visibility settings:
// knowing the code is itself the invitation, regardless of whether the room
// is also publicly listed.
exports.joinRoomByCode = async (req, res) => {
  try {
    const room = await CollabRoom.findOne({ inviteCode: req.params.inviteCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: "Invalid invite code" });
    await joinRoomInternal(room, req.user._id);
    res.json({ roomId: room._id, courseId: room.courseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to join room" });
  }
};

// GET /api/collab/join/link/:shareToken — PUBLIC, no auth. A preview of what
// you're about to join (name/topic/member count) before committing, same as
// following a course share link shows the course before any account action.
exports.previewRoomByLink = async (req, res) => {
  try {
    const room = await CollabRoom.findOne({ shareToken: req.params.shareToken })
      .populate("courseId", "topic status")
      .lean();
    if (!room) return res.status(404).json({ error: "Invalid or expired invite link" });
    res.json({
      roomId: room._id,
      name: room.name,
      topic: room.courseId?.topic,
      visibility: room.visibility,
      memberCount: room.participants.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load invite" });
  }
};

// POST /api/collab/join/link/:shareToken — the actual join action, requires auth.
exports.joinRoomByLink = async (req, res) => {
  try {
    const room = await CollabRoom.findOne({ shareToken: req.params.shareToken });
    if (!room) return res.status(404).json({ error: "Invalid or expired invite link" });
    await joinRoomInternal(room, req.user._id);
    res.json({ roomId: room._id, courseId: room.courseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to join room" });
  }
};

// GET /api/collab/rooms/:roomId — room + course, for a member (or anyone,
// if the room is public).
exports.getRoom = async (req, res) => {
  try {
    const room = await CollabRoom.findById(req.params.roomId)
      .populate("courseId")
      .populate("participants.userId", "name")
      .lean();
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isMember = room.participants.some((p) => p.userId._id.toString() === req.user._id.toString());
    if (room.visibility !== "public" && !isMember) {
      return res.status(403).json({ error: "You're not a member of this room" });
    }

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load room" });
  }
};

// GET /api/collab/rooms/mine — rooms the current user owns or belongs to.
exports.listMyRooms = async (req, res) => {
  try {
    const rooms = await CollabRoom.find({ "participants.userId": req.user._id })
      .sort({ createdAt: -1 })
      .populate("courseId", "topic status")
      .lean();
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list rooms" });
  }
};

// GET /api/collab/rooms/:roomId/dashboard — the shared dashboard: per-member
// progress + quiz scores, group topic strengths/weaknesses, and the
// most-replayed lessons/scenes across the whole group. Computed fresh on
// every call (polled by the frontend, same pattern as course-generation
// status polling — no push infra in this app to build on).
exports.getDashboard = async (req, res) => {
  try {
    const room = await CollabRoom.findById(req.params.roomId)
      .populate("participants.userId", "name")
      .populate("courseId")
      .lean();
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isMember = room.participants.some((p) => p.userId._id.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: "You're not a member of this room" });

    const courseId = room.courseId._id;
    const memberIds = room.participants.map((p) => p.userId._id);
    const totalLessons = room.courseId.lessons.length;

    const [progressDocs, quizAttempts] = await Promise.all([
      Progress.find({ courseId, userId: { $in: memberIds } }).lean(),
      QuizAttempt.find({ courseId, roomId: room._id, userId: { $in: memberIds } }).sort({ submittedAt: -1 }).lean(),
    ]);

    const latestAttemptByUser = new Map();
    for (const a of quizAttempts) {
      const key = a.userId.toString();
      if (!latestAttemptByUser.has(key)) latestAttemptByUser.set(key, a);
    }
    const progressByUser = new Map(progressDocs.map((p) => [p.userId.toString(), p]));

    const members = room.participants.map((p) => {
      const uid = p.userId._id.toString();
      const progress = progressByUser.get(uid);
      const watchedCount = progress ? progress.lessons.filter((l) => l.watched).length : 0;
      const attempt = latestAttemptByUser.get(uid);
      return {
        userId: uid,
        name: p.userId.name,
        lessonsWatched: watchedCount,
        totalLessons,
        watchPct: totalLessons > 0 ? Math.round((watchedCount / totalLessons) * 100) : 0,
        quizPct: attempt ? attempt.pct : null,
        quizSubmitted: !!attempt,
        completed: !!progress?.completedAt,
      };
    });

    // Group topic strengths/weaknesses — average pct per topic across every
    // member's LATEST attempt only (a member's earlier, superseded attempts
    // don't get double-counted).
    const topicAgg = new Map();
    for (const a of latestAttemptByUser.values()) {
      for (const t of a.topicBreakdown) {
        if (!topicAgg.has(t.topic)) topicAgg.set(t.topic, []);
        topicAgg.get(t.topic).push(t.pct);
      }
    }
    const groupTopics = [...topicAgg.entries()]
      .map(([topic, pcts]) => ({
        topic,
        avgPct: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
        respondents: pcts.length,
      }))
      .sort((a, b) => a.avgPct - b.avgPct);

    // Most-replayed lessons/scenes across the whole group.
    const lessonReplayTotals = new Map();
    const sceneReplayTotals = new Map();
    for (const progress of progressDocs) {
      for (const l of progress.lessons) {
        lessonReplayTotals.set(l.lessonNumber, (lessonReplayTotals.get(l.lessonNumber) || 0) + (l.replayCount || 0));
        for (const sr of l.sceneReplays || []) {
          const key = `${l.lessonNumber}:${sr.sceneIndex}`;
          sceneReplayTotals.set(key, (sceneReplayTotals.get(key) || 0) + sr.count);
        }
      }
    }
    const lessonByNumber = new Map(room.courseId.lessons.map((l) => [l.lessonNumber, l]));
    const mostReplayedLessons = [...lessonReplayTotals.entries()]
      .map(([lessonNumber, count]) => ({ lessonNumber, title: lessonByNumber.get(lessonNumber)?.title, replayCount: count }))
      .filter((l) => l.replayCount > 0)
      .sort((a, b) => b.replayCount - a.replayCount)
      .slice(0, 5);
    const mostReplayedScenes = [...sceneReplayTotals.entries()]
      .map(([key, count]) => {
        const [lessonNumber, sceneIndex] = key.split(":").map(Number);
        const lesson = lessonByNumber.get(lessonNumber);
        const scene = lesson?.scenes?.find((s) => s.index === sceneIndex);
        return { lessonNumber, sceneIndex, lessonTitle: lesson?.title, sceneLabel: scene?.label, replayCount: count };
      })
      .filter((s) => s.replayCount > 0)
      .sort((a, b) => b.replayCount - a.replayCount)
      .slice(0, 5);

    res.json({
      room: {
        _id: room._id,
        name: room.name,
        completionThreshold: room.completionThreshold,
        remedialTriggered: room.remedialTriggered,
      },
      course: { topic: room.courseId.topic, status: room.courseId.status, totalLessons },
      members,
      groupTopics,
      mostReplayedLessons,
      mostReplayedScenes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
};
