// scripts/renderLessonToMp4.js
//
// CLI wrapper around renderService.renderLessonToFile — pulls a lesson's
// code from MongoDB and renders it to a real .mp4 file. This is now the
// ONLY caller of renderService.js's server-side (headless Chrome + ffmpeg)
// render path — the web "Download video" button used to share it too (via
// controllers/exportController.js, for vertical/square formats) but that
// endpoint was removed entirely; the button is client-side-only now
// (landscape, via useWebExport.ts/WebCodecs).
//
// ── One-time setup ───────────────────────────────────────────────────────
//   REMOTION_VERSION=$(node -p "require('./node_modules/remotion/package.json').version")
//   npm install @remotion/bundler@$REMOTION_VERSION @remotion/renderer@$REMOTION_VERSION
//
// ── Usage ────────────────────────────────────────────────────────────────
//   node scripts/renderLessonToMp4.js <courseId> <lessonNumber> [outputPath]

const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

const Course = require("../models/Course");
const { renderLessonToFile } = require("../services/renderService");

async function main() {
  const [courseId, lessonNumberArg, outputPathArg] = process.argv.slice(2);

  if (!courseId || !lessonNumberArg) {
    console.error(
      "Usage: node scripts/renderLessonToMp4.js <courseId> <lessonNumber> [outputPath]"
    );
    process.exit(1);
  }

  const lessonNumber = parseInt(lessonNumberArg, 10);
  const outputPath = outputPathArg
    ? path.resolve(outputPathArg)
    : path.resolve(`./exports/lesson-${lessonNumber}-${Date.now()}.mp4`);

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGO_URI);

  console.log(`Fetching course ${courseId}...`);
  const course = await Course.findById(courseId);
  if (!course) {
    console.error(`Course ${courseId} not found.`);
    process.exit(1);
  }

  const lesson = course.lessons[lessonNumber - 1];
  if (!lesson || !lesson.code) {
    console.error(
      `Lesson ${lessonNumber} not found or has no generated code yet (status: ${lesson?.status}).`
    );
    process.exit(1);
  }

  try {
    console.log("Rendering...");
    await renderLessonToFile(
      { code: lesson.code, totalFrames: lesson.totalFrames },
      outputPath,
      (percent) => process.stdout.write(`\r  Progress: ${percent}%`)
    );
    console.log(`\nDone! Saved to ${outputPath}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});