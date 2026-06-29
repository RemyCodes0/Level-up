// controllers/showcaseController.js
//
// Public endpoint powering the landing page's "real video" showcase. No auth
// required — this is marketing content meant for anonymous visitors.
//
// Which courses get shown is controlled entirely by the SHOWCASE_COURSE_IDS
// env var (comma-separated Mongo IDs) — change which courses are featured by
// editing that env var, no code change or redeploy of this file needed.

const Course = require("../models/Course");

exports.getShowcaseVideos = async (req, res) => {
  try {
    const raw = process.env.SHOWCASE_COURSE_IDS || "";
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);

    if (ids.length === 0) {
      return res.json({ videos: [] });
    }

    const courses = await Course.find({ _id: { $in: ids } }).lean();

    // Re-order to match the env var's order (Mongo's $in doesn't preserve it),
    // so whoever sets the env var controls the displayed order too.
    const byId = new Map(courses.map((c) => [String(c._id), c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    const videos = ordered
      .map((course) => {
        // Use the first lesson that's actually ready with code — usually
        // lesson 1, but defensive in case it isn't.
        const lesson = (course.lessons || []).find((l) => l.status === "ready" && l.code);
        if (!lesson) return null;
        return {
          courseId: course._id,
          topic: course.topic,
          lessonTitle: lesson.title,
          code: lesson.code,
          totalFrames: lesson.totalFrames ?? 3600,
        };
      })
      .filter(Boolean);

    res.json({ videos });
  } catch (err) {
    console.error("getShowcaseVideos error:", err);
    res.status(500).json({ error: "Failed to load showcase videos" });
  }
};