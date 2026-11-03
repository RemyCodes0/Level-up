// Free mode: an admin switch that makes course generation free for everyone.
// Credit balances are never touched while it's on (checkCredits skips the spend
// and free courses store creditCost 0, so failures refund nothing), which is why
// everyone's credits are simply still there when it's switched off.

const Course = require("../models/Course");
const User = require("../models/User");
const FreeModeUsage = require("../models/FreeModeUsage");
const { PricingConfig, getOrCreatePricingConfig } = require("../models/PricingConfig");
const { getPricingConfig, invalidatePricingConfigCache } = require("./pricingConfigService");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SIMULTANEOUS_COURSES = 2;
// A server restart can leave a course stuck on "generating" forever, so older
// ones stop counting as in progress rather than blocking that user for good.
const STUCK_GENERATION_MS = 30 * 60 * 1000;

async function getFreeMode() {
  const { freeMode } = await getPricingConfig();
  return {
    enabled: !!freeMode?.enabled,
    startedAt: freeMode?.startedAt || null,
    dailyLessonLimit: freeMode?.dailyLessonLimit ?? 6,
  };
}

// Rolling 24h, counted from when free mode started so courses from an earlier
// free period don't count. Failed courses don't count either.
async function getFreeUsage(userId, freeMode) {
  const now = Date.now();
  const since = new Date(Math.max(now - DAY_MS, freeMode.startedAt ? new Date(freeMode.startedAt).getTime() : 0));
  const [courses, deleted] = await Promise.all([
    Course.find({ userId, creditCost: 0, status: { $ne: "failed" }, createdAt: { $gte: since } })
      .select("lessonCount status createdAt")
      .lean(),
    FreeModeUsage.find({ userId, courseCreatedAt: { $gte: since } }).select("lessonCount courseCreatedAt").lean(),
  ]);
  const used =
    courses.reduce((sum, c) => sum + (c.lessonCount || 0), 0) +
    deleted.reduce((sum, d) => sum + (d.lessonCount || 0), 0);
  const generating = courses.filter(
    (c) => c.status === "generating" && now - new Date(c.createdAt).getTime() < STUCK_GENERATION_MS
  ).length;
  const times = [...courses.map((c) => c.createdAt), ...deleted.map((d) => d.courseCreatedAt)].map((d) => new Date(d).getTime());
  return {
    used,
    limit: freeMode.dailyLessonLimit,
    remaining: Math.max(freeMode.dailyLessonLimit - used, 0),
    generating,
    nextLessonsAt: times.length ? new Date(Math.min(...times) + DAY_MS) : null,
  };
}

// Returns null when allowed, otherwise { code, message } for a 429.
async function checkFreeLimit(userId, lessonCount, freeMode) {
  const usage = await getFreeUsage(userId, freeMode);
  if (usage.generating >= MAX_SIMULTANEOUS_COURSES) {
    return {
      code: "free_too_many_at_once",
      message: `You already have ${usage.generating} courses building. Wait for one to finish before starting another.`,
    };
  }
  if (usage.used + lessonCount > usage.limit) {
    const hours = usage.nextLessonsAt ? Math.max(Math.ceil((usage.nextLessonsAt.getTime() - Date.now()) / 3600000), 1) : 24;
    return {
      code: "free_daily_limit",
      message: usage.remaining > 0
        ? `That course has ${lessonCount} lessons and you have ${usage.remaining} left today. Pick a smaller course, or try again in about ${hours} hour${hours !== 1 ? "s" : ""}.`
        : `You've used your ${usage.limit} free lessons for today. You can generate more in about ${hours} hour${hours !== 1 ? "s" : ""}.`,
    };
  }
  return null;
}

// The signup bonus has a 30-day expiry that kept running during the free period,
// so push it back by however long free mode lasted (or, for someone who signed up
// during it, how long since they signed up). Includes bonuses that expired
// mid-period, otherwise those users would lose credits they never got to spend.
async function extendSignupBonuses(startedAt, now) {
  const result = await User.collection.updateMany(
    { signupBonusExpiresAt: { $gt: startedAt } },
    [
      {
        $set: {
          signupBonusExpiresAt: {
            $add: ["$signupBonusExpiresAt", { $subtract: [now, { $max: [startedAt, "$createdAt"] }] }],
          },
        },
      },
    ]
  );
  return result.modifiedCount;
}

// The filtered updates make a repeat press (or a second admin tab) a no-op, so
// bonus expiries can't be extended twice.
async function setFreeModeEnabled(enabled) {
  await getOrCreatePricingConfig();
  const now = new Date();
  let bonusesExtended = 0;
  if (enabled) {
    await PricingConfig.updateOne(
      { "freeMode.enabled": { $ne: true } },
      { $set: { "freeMode.enabled": true, "freeMode.startedAt": now } }
    );
  } else {
    const previous = await PricingConfig.findOneAndUpdate(
      { "freeMode.enabled": true },
      { $set: { "freeMode.enabled": false, "freeMode.startedAt": null } }
    ).lean();
    if (previous?.freeMode?.startedAt) {
      invalidatePricingConfigCache();
      bonusesExtended = await extendSignupBonuses(new Date(previous.freeMode.startedAt), now);
    }
  }
  invalidatePricingConfigCache();
  return { bonusesExtended };
}

async function setDailyLessonLimit(limit) {
  await getOrCreatePricingConfig();
  await PricingConfig.updateOne({}, { $set: { "freeMode.dailyLessonLimit": limit } });
  invalidatePricingConfigCache();
}

// Called just before a course is hard-deleted, see FreeModeUsage.js.
async function rememberDeletedFreeCourse(course) {
  const isCounted =
    course.creditCost === 0 &&
    course.status !== "failed" &&
    Date.now() - new Date(course.createdAt).getTime() < DAY_MS;
  if (!isCounted) return;
  await FreeModeUsage.create({
    userId: course.userId,
    lessonCount: course.lessonCount || 0,
    courseCreatedAt: course.createdAt,
  });
}

module.exports = { getFreeMode, getFreeUsage, checkFreeLimit, setFreeModeEnabled, setDailyLessonLimit, rememberDeletedFreeCourse };
