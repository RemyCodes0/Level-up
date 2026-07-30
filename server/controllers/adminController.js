// controllers/adminController.js
//
// Powers the private admin dashboard. Every number here is derived from data
// stored in MongoDB (users, courses, lesson statuses, credits, AI usage,
// page views). Cost is now real — AiUsageLog (see models/AiUsageLog.js)
// records every generation call's tokens + computed $ cost, written by
// services/aiUsageService.js at each call site.
//
// Protected by requireAdmin middleware (see middleware/requireAdmin.js) — a
// simple hardcoded check against your own user id / email.

const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const AiUsageLog = require("../models/AiUsageLog");
const PageView = require("../models/PageView");

// GET /api/admin/overview
// Returns the headline numbers + breakdowns for the dashboard, in one call.
exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

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
      spendDay,
      spendWeek,
      spendMonth,
      spendByKind,
      viewsDay,
      viewsWeek,
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
      // Real AI $ spend — see models/AiUsageLog.js. costUsd is computed and
      // stored at write time (config/modelPricing.js), so summing it here
      // never needs to know current prices.
      AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: dayAgo } } },
        { $group: { _id: null, total: { $sum: "$costUsd" } } },
      ]),
      AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: "$costUsd" } } },
      ]),
      AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: "$costUsd" } } },
      ]),
      // Breakdown by kind over the last 30 days — which stage is actually
      // costing the most.
      AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $group: { _id: "$kind", total: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      PageView.countDocuments({ createdAt: { $gte: dayAgo } }),
      PageView.countDocuments({ createdAt: { $gte: weekAgo } }),
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
      aiSpend: {
        today: spendDay[0]?.total || 0,
        last7d: spendWeek[0]?.total || 0,
        last30d: spendMonth[0]?.total || 0,
        byKind: spendByKind.map((s) => ({ kind: s._id, totalUsd: s.total, calls: s.calls })),
      },
      pageViews: {
        today: viewsDay,
        last7d: viewsWeek,
      },
      generatedAt: now,
    });
  } catch (err) {
    console.error("admin getOverview error:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
};

// GET /api/admin/activity?limit=20&page=1&status=ready
// Recent courses across ALL users — the "live activity feed" widget on
// Overview, AND (with page/status) the full paginated Courses list page.
// Defaults are unchanged from before, so the original Overview widget call
// keeps working exactly as it did.
exports.getRecentActivity = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = {};
    if (["generating", "ready", "failed"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    // Only lessons.status is read below (to count ready/failed) — NOT the
    // full lessons field. A lesson subdocument can run 600KB+ once you
    // include `code` and `sceneProgress` (which duplicates every scene's
    // code again as `previewCode` for live progress tracking — see
    // COURSE_LIST_EXCLUDED_FIELDS in courseController.js, the same fix
    // already applied to the course-list sidebar). Fetching that for 30
    // courses at once was tens of MB of code/audio data this feed never
    // renders, which is what made it hang instead of just being slow.
    const [courses, total] = await Promise.all([
      Course.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email")
        .select("topic status isFreeTrialCourse lessons.status createdAt updatedAt userId")
        .lean(),
      Course.countDocuments(filter),
    ]);

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

    res.json({ activity, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("admin getRecentActivity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
};

// GET /api/admin/ai-usage?range=7d&kind=&model=
// Spend over time (daily buckets) + top-N most expensive courses, for the
// dedicated AI Spend page (Overview only shows the headline totals).
exports.getAiUsage = async (req, res) => {
  try {
    const rangeDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[req.query.range] || 7;
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const match = { createdAt: { $gte: since } };
    if (req.query.kind) match.kind = req.query.kind;
    if (req.query.model) match.model = req.query.model;

    const [daily, topCourses, byModel] = await Promise.all([
      AiUsageLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            totalUsd: { $sum: "$costUsd" },
            calls: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AiUsageLog.aggregate([
        { $match: { ...match, courseId: { $ne: null } } },
        { $group: { _id: "$courseId", totalUsd: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
        { $sort: { totalUsd: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "_id",
            as: "course",
            pipeline: [{ $project: { topic: 1, userId: 1 } }],
          },
        },
      ]),
      AiUsageLog.aggregate([
        { $match: match },
        { $group: { _id: "$model", totalUsd: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
        { $sort: { totalUsd: -1 } },
      ]),
    ]);

    res.json({
      range: `${rangeDays}d`,
      daily: daily.map((d) => ({ date: d._id, totalUsd: d.totalUsd, calls: d.calls })),
      topCourses: topCourses.map((c) => ({
        courseId: c._id,
        totalUsd: c.totalUsd,
        calls: c.calls,
        topic: c.course[0]?.topic || null,
      })),
      byModel: byModel.map((m) => ({ model: m._id, totalUsd: m.totalUsd, calls: m.calls })),
    });
  } catch (err) {
    console.error("admin getAiUsage error:", err);
    res.status(500).json({ error: "Failed to load AI usage" });
  }
};

// GET /api/admin/courses/:courseId/costs
// Every AiUsageLog row for ONE course, broken down by kind — shown on the
// course detail view.
exports.getCourseCosts = async (req, res) => {
  try {
    const byKind = await AiUsageLog.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(req.params.courseId) } },
      { $group: { _id: "$kind", totalUsd: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
      { $sort: { totalUsd: -1 } },
    ]);
    const totalUsd = byKind.reduce((sum, k) => sum + k.totalUsd, 0);
    res.json({ totalUsd, byKind: byKind.map((k) => ({ kind: k._id, totalUsd: k.totalUsd, calls: k.calls })) });
  } catch (err) {
    console.error("admin getCourseCosts error:", err);
    res.status(500).json({ error: "Failed to load course costs" });
  }
};

// GET /api/admin/pageviews?range=7d
// Daily visit counts, unique sessions, top paths/referrers — for the
// Traffic page.
exports.getPageViewStats = async (req, res) => {
  try {
    const rangeDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[req.query.range] || 7;
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const match = { createdAt: { $gte: since } };

    const [daily, topPaths, topReferrers, uniqueSessions] = await Promise.all([
      PageView.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            views: { $sum: 1 },
            sessions: { $addToSet: "$sessionId" },
          },
        },
        { $project: { views: 1, uniqueSessions: { $size: "$sessions" } } },
        { $sort: { _id: 1 } },
      ]),
      PageView.aggregate([
        { $match: match },
        { $group: { _id: "$path", views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 20 },
      ]),
      PageView.aggregate([
        { $match: { ...match, referrer: { $nin: ["", null] } } },
        { $group: { _id: "$referrer", views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 20 },
      ]),
      PageView.distinct("sessionId", match),
    ]);

    res.json({
      range: `${rangeDays}d`,
      daily: daily.map((d) => ({ date: d._id, views: d.views, uniqueSessions: d.uniqueSessions })),
      topPaths: topPaths.map((p) => ({ path: p._id, views: p.views })),
      topReferrers: topReferrers.map((r) => ({ referrer: r._id, views: r.views })),
      totalUniqueSessions: uniqueSessions.length,
    });
  } catch (err) {
    console.error("admin getPageViewStats error:", err);
    res.status(500).json({ error: "Failed to load page view stats" });
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

// DELETE /api/admin/courses/:courseId
// Same audio-cleanup + delete logic as the user-facing deleteCourseHandler
// (courseController.js), just without the ownership (userId) filter — an
// admin can delete ANY user's course.
exports.adminDeleteCourse = async (req, res) => {
  try {
    // Lazy require: courseController.js has a large module-load surface
    // (generation pipeline, etc.) — requiring it lazily here, only when this
    // endpoint is actually hit, avoids paying that cost on every admin
    // request that doesn't touch course deletion.
    const { deleteCourseById } = require("./courseController");
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    await deleteCourseById(course);
    res.json({ success: true });
  } catch (err) {
    console.error("admin adminDeleteCourse error:", err);
    res.status(500).json({ error: "Failed to delete course" });
  }
};