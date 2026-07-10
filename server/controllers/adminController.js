// controllers/adminController.js
//
// Powers the private admin dashboard. Every number here is derived from data
// ALREADY stored in MongoDB (users, courses, lesson statuses, credits) — no
// new tracking required. Cost and per-course timing/retry metrics are NOT
// included because they aren't recorded anywhere yet; those panels are
// stubbed on the frontend until we add that logging.
//
// Protected by requireAdmin middleware (see middleware/requireAdmin.js) — a
// simple hardcoded check against your own user id / email.

const User = require("../models/User");
const Course = require("../models/Course");

// GET /api/admin/overview
// Returns the headline numbers + breakdowns for the dashboard, in one call.
exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Run all the independent aggregations in parallel for speed.
    const [
      totalUsers,
      verifiedUsers,
      newUsersWeek,
      totalCourses,
      coursesDay,
      coursesWeek,
      statusBreakdown,
      freeTrialCount,
      creditsAgg,
      lessonStats,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ verified: true }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      Course.countDocuments({}),
      Course.countDocuments({ createdAt: { $gte: dayAgo } }),
      Course.countDocuments({ createdAt: { $gte: weekAgo } }),
      // Course-level status breakdown (generating / ready / failed)
      Course.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Course.countDocuments({ isFreeTrialCourse: true }),
      // Sum of all remaining credits across users (rough proxy for unspent
      // purchased credits).
      User.aggregate([
        { $group: { _id: null, totalCredits: { $sum: "$courseCredits" } } },
      ]),
      // Lesson-level stats: how many individual lessons are ready vs failed
      // vs locked. This is the real "generation health" signal.
      Course.aggregate([
        { $unwind: "$lessons" },
        { $group: { _id: "$lessons.status", count: { $sum: 1 } } },
      ]),
    ]);

    // Reshape the status aggregations into simple objects.
    const courseStatus = { generating: 0, ready: 0, failed: 0 };
    statusBreakdown.forEach((s) => {
      if (s._id) courseStatus[s._id] = s.count;
    });

    const lessonStatus = { rendering: 0, ready: 0, failed: 0, locked: 0 };
    lessonStats.forEach((s) => {
      if (s._id) lessonStatus[s._id] = s.count;
    });

    const totalLessons =
      lessonStatus.rendering + lessonStatus.ready + lessonStatus.failed + lessonStatus.locked;
    const lessonSuccessRate =
      totalLessons > 0
        ? Math.round((lessonStatus.ready / (lessonStatus.ready + lessonStatus.failed || 1)) * 100)
        : null;

    const totalRemainingCredits = creditsAgg[0]?.totalCredits || 0;

    res.json({
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
        newThisWeek: newUsersWeek,
      },
      courses: {
        total: totalCourses,
        last24h: coursesDay,
        last7d: coursesWeek,
        freeTrial: freeTrialCount,
        paid: totalCourses - freeTrialCount,
        status: courseStatus,
      },
      generationHealth: {
        lessonStatus,
        totalLessons,
        // % of finished lessons that succeeded (ready vs failed) — the
        // clearest single health number.
        lessonSuccessRate,
      },
      // Revenue is approximate: we don't store a payments ledger yet, so this
      // shows unspent credits as a proxy. Real revenue tracking would need a
      // payments collection (flagged for later).
      creditsProxy: {
        totalRemainingCredits,
      },
      generatedAt: now,
    });
  } catch (err) {
    console.error("admin getOverview error:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
};

// GET /api/admin/activity?limit=20
// Recent courses across ALL users — the "live activity feed".
exports.getRecentActivity = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const courses = await Course.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "name email")
      .select("topic status isFreeTrialCourse lessons createdAt updatedAt userId")
      .lean();

    const activity = courses.map((c) => {
      const readyLessons = (c.lessons || []).filter((l) => l.status === "ready").length;
      const failedLessons = (c.lessons || []).filter((l) => l.status === "failed").length;
      return {
        id: c._id,
        topic: c.topic,
        status: c.status,
        isFreeTrial: c.isFreeTrialCourse,
        lessonsReady: readyLessons,
        lessonsFailed: failedLessons,
        lessonsTotal: (c.lessons || []).length,
        user: c.userId ? { name: c.userId.name, email: c.userId.email } : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    res.json({ activity });
  } catch (err) {
    console.error("admin getRecentActivity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
};

// GET /api/admin/courses/:courseId
// Full detail for one course, including the generated lesson code, so the
// admin can preview/inspect the actual videos users generated.
exports.getCourseDetail = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId)
      .populate("userId", "name email")
      .lean();

    if (!course) return res.status(404).json({ error: "Course not found" });

    res.json({ course });
  } catch (err) {
    console.error("admin getCourseDetail error:", err);
    res.status(500).json({ error: "Failed to load course detail" });
  }
};