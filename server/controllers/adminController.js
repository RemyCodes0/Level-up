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
const Progress = require("../models/Progress");
const GenerationLog = require("../models/GenerationLog");
const CreditTransaction = require("../models/CreditTransaction");
const CollabRoom = require("../models/CollabRoom");
const QuizAttempt = require("../models/QuizAttempt");
const { grantCredits, spendCredits, getSpendableBalance, InsufficientCreditsError } = require("../services/creditService");
const { getPricingConfig } = require("../services/pricingConfigService");

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
      purchasesMonth,
      purchasesAllTime,
      referredCount,
      referralCreditsAgg,
      activeRoomsCount,
      roomParticipantsAgg,
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
      // Purchase transactions from CreditTransaction — see getRevenue below
      // for the full breakdown; this is just enough for the dashboard's
      // headline cards. Grouped by packKey so $ can be computed from
      // CURRENT PricingConfig pricing in JS below (see getRevenue's own
      // comment on why this is "current price × count", not a historical
      // price snapshot — CreditTransaction doesn't record price-at-purchase).
      CreditTransaction.aggregate([
        { $match: { source: "purchase", createdAt: { $gte: monthAgo } } },
        { $group: { _id: "$meta.packKey", count: { $sum: 1 } } },
      ]),
      CreditTransaction.aggregate([
        { $match: { source: "purchase" } },
        { $group: { _id: "$meta.packKey", count: { $sum: 1 } } },
      ]),
      // Referral funnel: how many of the TOTAL users above were referred by
      // someone else, vs. organic signups.
      User.countDocuments({ referredBy: { $ne: null } }),
      User.aggregate([
        { $group: { _id: null, total: { $sum: "$referralCreditsEarned" } } },
      ]),
      CollabRoom.countDocuments({ status: "active" }),
      CollabRoom.aggregate([
        { $project: { size: { $size: "$participants" } } },
        { $group: { _id: null, total: { $sum: "$size" } } },
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

    // Turn {packKey, count} rows into real dollars using CURRENT
    // PricingConfig pricing. Caveat (same one getRevenue documents in full):
    // CreditTransaction never recorded the price AT THE TIME of a purchase,
    // only which pack — so if a pack's price has changed since an old
    // purchase, that purchase is priced at today's rate here, not what was
    // actually charged then. Accurate for packs whose price hasn't moved
    // (true for most of this app's life so far); flagged, not hidden.
    const pricingConfig = await getPricingConfig();
    const priceByPackKey = new Map(pricingConfig.creditPacks.map((p) => [p.key, p.priceCents]));
    const sumPurchaseRows = (rows) =>
      rows.reduce((sum, r) => sum + (r.count || 0) * ((priceByPackKey.get(r._id) || 0) / 100), 0);
    const purchaseCountRows = (rows) => rows.reduce((sum, r) => sum + (r.count || 0), 0);

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
      // totalRemainingCredits is still a useful "liability" figure (credits
      // issued but not yet spent) — kept alongside the now-real revenue
      // numbers below rather than replaced by them; they answer different
      // questions (what's been collected vs. what's still owed in credits).
      creditsProxy: {
        totalRemainingCredits,
      },
      // Real revenue, from CreditTransaction's "purchase" rows — see
      // getRevenue for the full breakdown (by pack, a trend chart, and the
      // one gap worth knowing: NotchPay purchases bypass this ledger
      // entirely and write straight to User.courseCredits, so this is a
      // Stripe-only figure, not total revenue across every payment path).
      revenue: {
        last30dUsd: Math.round(sumPurchaseRows(purchasesMonth) * 100) / 100,
        allTimeUsd: Math.round(sumPurchaseRows(purchasesAllTime) * 100) / 100,
        purchaseCountAllTime: purchaseCountRows(purchasesAllTime),
      },
      referrals: {
        totalReferred: referredCount,
        conversionRate: totalUsers > 0 ? Math.round((referredCount / totalUsers) * 100) : 0,
        totalCreditsGranted: referralCreditsAgg[0]?.total || 0,
      },
      collab: {
        activeRooms: activeRoomsCount,
        totalParticipants: roomParticipantsAgg[0]?.total || 0,
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

// GET /api/admin/revenue?range=7d
// Real $ revenue, derived from CreditTransaction's "purchase" rows — not an
// estimate the way the old creditsProxy comment on getOverview used to
// apologize for. Same range convention as getAiUsage/getPageViewStats
// (24h/7d/30d/90d, default 7d).
//
// TWO caveats worth knowing, both stated here instead of just in a code
// comment nobody reading the dashboard will see — surfaced in the response
// so the frontend can show them inline:
//   1. CreditTransaction records WHICH PACK was bought, not the price paid
//      at that moment — $ here is pack-count × CURRENT PricingConfig price.
//      Accurate unless a pack's price changed since an old purchase.
//   2. Stripe-only. NotchPay's webhook (controllers/notchpayController.js)
//      grants credits with a direct User.courseCredits $inc and never writes
//      a CreditTransaction row at all — those purchases are invisible here.
//      (Worth fixing in notchpayController.js itself at some point — it also
//      means NotchPay's own duplicate-webhook guard, `user.paymentRefs`, is
//      never actually written: that field isn't declared on the User schema,
//      so Mongoose's default strict mode silently drops it.)
exports.getRevenue = async (req, res) => {
  try {
    const rangeDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[req.query.range] || 7;
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const [pricingConfig, daily, byPack, allTimeByPack] = await Promise.all([
      getPricingConfig(),
      CreditTransaction.aggregate([
        { $match: { source: "purchase", createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            packKey: "$meta.packKey",
          },
        },
        { $group: { _id: "$_id", counts: { $push: "$packKey" } } },
        { $sort: { _id: 1 } },
      ]),
      CreditTransaction.aggregate([
        { $match: { source: "purchase", createdAt: { $gte: since } } },
        { $group: { _id: "$meta.packKey", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      CreditTransaction.aggregate([
        { $match: { source: "purchase" } },
        { $group: { _id: "$meta.packKey", count: { $sum: 1 } } },
      ]),
    ]);

    const priceByPackKey = new Map(pricingConfig.creditPacks.map((p) => [p.key, p.priceCents]));
    const packLabel = new Map(pricingConfig.creditPacks.map((p) => [p.key, p]));
    const usdFor = (packKey, count) => ((priceByPackKey.get(packKey) || 0) / 100) * count;

    // `daily` grouped per-day counts as an array of packKeys (Mongo has no
    // clean "group by two keys, sum a derived value" in one pass without a
    // second $group) — turn that into a $ total per day here.
    const dailyUsd = daily.map((d) => ({
      date: d._id,
      totalUsd: Math.round(d.counts.reduce((sum, k) => sum + usdFor(k, 1), 0) * 100) / 100,
      purchases: d.counts.length,
    }));

    const byPackBreakdown = byPack.map((p) => ({
      packKey: p._id,
      label: packLabel.get(p._id)?.credits ? `${packLabel.get(p._id).credits} credits` : p._id || "unknown pack",
      count: p.count,
      totalUsd: Math.round(usdFor(p._id, p.count) * 100) / 100,
    }));

    const totalUsd = Math.round(byPackBreakdown.reduce((sum, p) => sum + p.totalUsd, 0) * 100) / 100;
    const allTimeUsd =
      Math.round(allTimeByPack.reduce((sum, p) => sum + usdFor(p._id, p.count), 0) * 100) / 100;
    const allTimePurchases = allTimeByPack.reduce((sum, p) => sum + p.count, 0);

    res.json({
      range: req.query.range || "7d",
      totalUsd,
      purchaseCount: byPackBreakdown.reduce((sum, p) => sum + p.count, 0),
      daily: dailyUsd,
      byPack: byPackBreakdown,
      allTime: { totalUsd: allTimeUsd, purchaseCount: allTimePurchases },
      caveats: {
        pricedAtCurrentRate: true,
        stripeOnly: true,
      },
    });
  } catch (err) {
    console.error("admin getRevenue error:", err);
    res.status(500).json({ error: "Failed to load revenue data" });
  }
};

// GET /api/admin/referrals
// The referral program's real numbers: how many of this app's users were
// referred by someone else (vs. organic), how many credits the program has
// cost in grants, and who's actually driving it — a leaderboard, not just a
// total, since in practice referral programs are usually carried by a small
// handful of people worth knowing by name.
exports.getReferralStats = async (req, res) => {
  try {
    const [totalUsers, referredUsers, creditsAgg, leaderboard] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ referredBy: { $ne: null } }),
      User.aggregate([{ $group: { _id: null, total: { $sum: "$referralCreditsEarned" } } }]),
      User.find({ referralCount: { $gt: 0 } })
        .select("name email referralCode referralCount referralCreditsEarned createdAt")
        .sort({ referralCount: -1 })
        .limit(25)
        .lean(),
    ]);

    res.json({
      totalUsers,
      totalReferred: referredUsers,
      conversionRate: totalUsers > 0 ? Math.round((referredUsers / totalUsers) * 100) : 0,
      totalCreditsGranted: creditsAgg[0]?.total || 0,
      leaderboard,
    });
  } catch (err) {
    console.error("admin getReferralStats error:", err);
    res.status(500).json({ error: "Failed to load referral stats" });
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
//
// Split by isRealCost (see AiUsageLog's own comment) as well as by kind —
// totalUsd alone reads as "one approximate number" even on a course where
// the vast majority of it is the ACTUAL OpenRouter-billed amount, not an
// estimate. realUsd/estimatedUsd (overall and per-kind) let the admin page
// show that split directly instead of leaving every course's cost looking
// equally uncertain. TTS (Kokoro has no cost field at all) is the one kind
// that's always estimated; every LLM call kind is real cost as of this
// session's fix to the 4 generateJson-based call sites that were silently
// discarding usage.cost.
exports.getCourseCosts = async (req, res) => {
  try {
    const rows = await AiUsageLog.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(req.params.courseId) } },
      { $group: { _id: { kind: "$kind", isRealCost: "$isRealCost" }, subtotalUsd: { $sum: "$costUsd" }, calls: { $sum: 1 } } },
    ]);

    const byKindMap = new Map();
    let realUsd = 0;
    let estimatedUsd = 0;
    for (const row of rows) {
      const { kind, isRealCost } = row._id;
      if (!byKindMap.has(kind)) byKindMap.set(kind, { kind, totalUsd: 0, calls: 0, realUsd: 0, estimatedUsd: 0 });
      const entry = byKindMap.get(kind);
      entry.totalUsd += row.subtotalUsd;
      entry.calls += row.calls;
      if (isRealCost) {
        entry.realUsd += row.subtotalUsd;
        realUsd += row.subtotalUsd;
      } else {
        entry.estimatedUsd += row.subtotalUsd;
        estimatedUsd += row.subtotalUsd;
      }
    }

    const byKind = [...byKindMap.values()].sort((a, b) => b.totalUsd - a.totalUsd);
    res.json({ totalUsd: realUsd + estimatedUsd, realUsd, estimatedUsd, byKind });
  } catch (err) {
    console.error("admin getCourseCosts error:", err);
    res.status(500).json({ error: "Failed to load course costs" });
  }
};

// GET /api/admin/courses/:courseId/generation-time
// How long THIS course actually took to generate, broken down by lesson —
// shown on the course detail view, same idea as getCourseCosts just above.
//
// Built entirely from GenerationLog (models/GenerationLog.js), which
// already existed and needed no new instrumentation: buildLesson
// (courseController.js) writes one entry per generation ATTEMPT for a
// lesson, and — important for this aggregation — durationSec on every one
// of those entries is `Date.now() - lessonStart`, i.e. CUMULATIVE from the
// lesson's true start, not "how long did just this attempt take." So the
// entry with the highest attemptNumber for a given lesson already IS that
// lesson's total wall-clock generation time, retries included — summing
// across every attempt would double-count. Sorting by attemptNumber desc
// before grouping and taking $first per (courseId, lessonNumber) picks out
// exactly that terminal entry.
//
// A lesson that failed every attempt still has a terminal entry (status
// "failed") — it's included, since real time was genuinely spent on it,
// same reasoning as counting it in the course total below.
exports.getCourseGenerationTime = async (req, res) => {
  try {
    const courseId = new mongoose.Types.ObjectId(req.params.courseId);
    const rows = await GenerationLog.aggregate([
      { $match: { courseId } },
      { $sort: { lessonNumber: 1, attemptNumber: -1 } },
      {
        $group: {
          _id: "$lessonNumber",
          lessonTitle: { $first: "$lessonTitle" },
          durationSec: { $first: "$durationSec" },
          status: { $first: "$status" },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const lessons = rows.map((r) => ({
      lessonNumber: r._id,
      lessonTitle: r.lessonTitle,
      durationSec: r.durationSec,
      status: r.status,
      attempts: r.attempts,
    }));
    const totalSec = lessons.reduce((sum, l) => sum + l.durationSec, 0);

    res.json({ totalSec, lessons });
  } catch (err) {
    console.error("admin getCourseGenerationTime error:", err);
    res.status(500).json({ error: "Failed to load course generation time" });
  }
};

// GET /api/admin/courses/generation-stats
// Dashboard-wide "how long does a course take to generate, on average" —
// the Courses section's summary stat, independent of pagination/filtering
// on the activity list itself. Registered BEFORE /courses/:courseId in
// routes/admin.js so "generation-stats" doesn't get swallowed as a
// :courseId value.
//
// Same per-lesson terminal-duration logic as getCourseGenerationTime above,
// just carried one level further: sum each course's lessons into that
// course's own total, then average those totals across courses. Only
// courses that have actually FINISHED (status "ready" or "failed", i.e.
// not still "generating") are counted — an in-progress course's lessons so
// far would understate its eventual total and bias the average down.
exports.getCourseGenerationStats = async (req, res) => {
  try {
    const result = await GenerationLog.aggregate([
      { $sort: { courseId: 1, lessonNumber: 1, attemptNumber: -1 } },
      {
        $group: {
          _id: { courseId: "$courseId", lessonNumber: "$lessonNumber" },
          durationSec: { $first: "$durationSec" },
        },
      },
      { $group: { _id: "$_id.courseId", courseTotalSec: { $sum: "$durationSec" } } },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "course",
          pipeline: [{ $project: { status: 1 } }],
        },
      },
      { $match: { "course.0.status": { $in: ["ready", "failed"] } } },
      { $group: { _id: null, avgSec: { $avg: "$courseTotalSec" }, coursesCounted: { $sum: 1 } } },
    ]);

    const avgSec = result[0]?.avgSec ?? null;
    const coursesCounted = result[0]?.coursesCounted ?? 0;
    res.json({ avgSec, coursesCounted });
  } catch (err) {
    console.error("admin getCourseGenerationStats error:", err);
    res.status(500).json({ error: "Failed to load course generation stats" });
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

    // Every quiz submission for this course, newest first — a course has
    // exactly one owner (course.userId), so these are all that one user's
    // attempts; QuizAttempt isn't overwritten on retake (see its own
    // comment), so this can be more than one row.
    const quizAttempts = await QuizAttempt.find({ courseId: course._id })
      .sort({ submittedAt: -1 })
      .select("-answers")
      .lean();

    res.json({ course, quizAttempts });
  } catch (err) {
    console.error("admin getCourseDetail error:", err);
    res.status(500).json({ error: "Failed to load course detail" });
  }
};

// GET /api/admin/courses/:courseId/lineage
// Same ancestors/descendants walk as courseController.getCourseLineageHandler,
// just without that one's `userId: req.user._id` ownership filter — an admin
// needs to see lineage across every user's courses, not just their own.
const ADMIN_LINEAGE_EXCLUDED_FIELDS = "-lessons.code -lessons.narrationScript -lessons.audioUrl -lessons.sceneProgress";
const ADMIN_MAX_LINEAGE_DEPTH = 10;
const ADMIN_MAX_LINEAGE_DESCENDANTS = 40;
exports.getCourseLineage = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId).select("parentCourseId");
    if (!course) return res.status(404).json({ error: "Course not found" });

    const ancestors = [];
    const seen = new Set([String(course._id)]);
    let cursor = course.parentCourseId;
    while (cursor && ancestors.length < ADMIN_MAX_LINEAGE_DEPTH && !seen.has(String(cursor))) {
      seen.add(String(cursor));
      const ancestor = await Course.findById(cursor).select(ADMIN_LINEAGE_EXCLUDED_FIELDS);
      if (!ancestor) break;
      ancestors.unshift(ancestor);
      cursor = ancestor.parentCourseId;
    }

    const descendants = [];
    const queue = [String(course._id)];
    const visited = new Set(queue);
    while (queue.length > 0 && descendants.length < ADMIN_MAX_LINEAGE_DESCENDANTS) {
      const batch = await Course.find({ parentCourseId: { $in: queue.splice(0, queue.length) } })
        .select(ADMIN_LINEAGE_EXCLUDED_FIELDS)
        .sort({ createdAt: 1 })
        .limit(ADMIN_MAX_LINEAGE_DESCENDANTS - descendants.length);
      if (batch.length === 0) break;
      for (const child of batch) {
        const id = String(child._id);
        if (visited.has(id)) continue;
        visited.add(id);
        descendants.push(child);
        queue.push(id);
      }
    }

    res.json({ ancestors, descendants });
  } catch (err) {
    console.error("admin getCourseLineage error:", err);
    res.status(500).json({ error: "Failed to load course lineage" });
  }
};

// GET /api/admin/users/:userId/progress
// Every course a user has touched, with per-lesson watched-state AND their
// last-reported playback position (see Progress.js's lastPositionFrame) —
// lets an admin see not just "watched Y/N" but exactly where a user left
// off in a lesson they haven't finished. Course lookup is explicitly
// projected to topic/lessons.lessonNumber/lessons.title/lessons.totalFrames
// — never lessons.code, which is a multi-KB generated TSX string with no
// use here.
exports.getUserProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    const [user, progressDocs] = await Promise.all([
      User.findById(userId).select("name email").lean(),
      Progress.find({ userId }).lean(),
    ]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const courseIds = progressDocs.map((p) => p.courseId);
    const courses = await Course.find({ _id: { $in: courseIds } })
      .select("topic lessons.lessonNumber lessons.title lessons.totalFrames")
      .lean();
    const courseById = new Map(courses.map((c) => [String(c._id), c]));

    const result = progressDocs.map((progress) => {
      const course = courseById.get(String(progress.courseId));
      const lessonMetaByNumber = new Map(
        (course?.lessons || []).map((l) => [l.lessonNumber, l])
      );

      return {
        courseId: progress.courseId,
        topic: course?.topic || "(deleted course)",
        completedAt: progress.completedAt,
        lessons: progress.lessons.map((l) => {
          const meta = lessonMetaByNumber.get(l.lessonNumber);
          return {
            lessonNumber: l.lessonNumber,
            title: meta?.title || `Lesson ${l.lessonNumber}`,
            totalFrames: meta?.totalFrames ?? null,
            watched: l.watched,
            watchedAt: l.watchedAt,
            replayCount: l.replayCount,
            lastPositionFrame: l.lastPositionFrame || 0,
            lastPlayedAt: l.lastPlayedAt,
          };
        }),
      };
    });

    res.json({ user, courses: result });
  } catch (err) {
    console.error("admin getUserProgress error:", err);
    res.status(500).json({ error: "Failed to load user progress" });
  }
};

// GET /api/admin/users/:userId/profile — powers the dedicated admin user-
// profile page. Deliberately separate from getUserProgress above:
// getUserProgress only returns courses that have a Progress doc (i.e. the
// user opened a lesson at least once), which misses courses that are still
// generating, failed outright, or were simply never watched — "the courses
// he has generated" means every Course.userId match, not just watched ones.
exports.getUserCourses = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select("-password")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const courses = await Course.find({ userId })
      .select("topic status isFreeTrialCourse lessons.status createdAt parentCourseId followUpKind")
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = courses.map((c) => c._id);
    // Latest attempt per course — a course can be retaken, so group in JS
    // rather than a second query per course.
    const attempts = await QuizAttempt.find({ courseId: { $in: courseIds } })
      .sort({ submittedAt: -1 })
      .select("courseId score total pct submittedAt")
      .lean();
    const latestQuizByCourse = new Map();
    for (const a of attempts) {
      const key = String(a.courseId);
      if (!latestQuizByCourse.has(key)) latestQuizByCourse.set(key, a);
    }

    const result = courses.map((c) => ({
      _id: c._id,
      topic: c.topic,
      status: c.status,
      isFreeTrial: c.isFreeTrialCourse,
      lessonsReady: (c.lessons || []).filter((l) => l.status === "ready").length,
      lessonsFailed: (c.lessons || []).filter((l) => l.status === "failed").length,
      lessonsTotal: (c.lessons || []).length,
      createdAt: c.createdAt,
      parentCourseId: c.parentCourseId || null,
      followUpKind: c.followUpKind || null,
      latestQuiz: latestQuizByCourse.get(String(c._id)) || null,
    }));

    res.json({ user, courses: result });
  } catch (err) {
    console.error("admin getUserCourses error:", err);
    res.status(500).json({ error: "Failed to load user courses" });
  }
};

// POST /api/admin/users/:userId/credits — the sanctioned way to hand-adjust
// a user's balance from the dashboard. Deliberately NOT a raw
// `user.courseCredits = X; user.save()` — routes through spendCredits/
// grantCredits (creditService.js) like every other credit mutation in the
// app, so an admin adjustment is race-safe, can never push the balance
// negative on a removal, and leaves a real CreditTransaction ledger row
// (source: "admin_adjustment", meta records which admin and why) instead of
// being invisible on the user's transaction history.
exports.adjustUserCredits = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, direction, reason } = req.body;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (direction !== "add" && direction !== "remove") {
      return res.status(400).json({ error: 'direction must be "add" or "remove"' });
    }

    const meta = { adminEmail: req.user.email, reason: reason || null };
    const updated =
      direction === "add"
        ? await grantCredits(userId, amount, "admin_adjustment", meta)
        : await spendCredits(userId, amount, "admin_adjustment", meta);

    res.json({
      user: {
        _id: updated._id,
        courseCredits: updated.courseCredits,
        signupBonusCredits: updated.signupBonusCredits,
        signupBonusExpiresAt: updated.signupBonusExpiresAt,
        spendableBalance: getSpendableBalance(updated),
      },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return res.status(400).json({ error: "This user doesn't have that many credits to remove" });
    }
    if (err.message === "User not found") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error("admin adjustUserCredits error:", err);
    res.status(500).json({ error: "Failed to adjust credits" });
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