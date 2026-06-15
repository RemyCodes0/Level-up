import { config } from "dotenv";
config({ path: "./server/.env" });

import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { generateLessonCode } = require("./server/services/claudeService");
const { bundleLessonCode } = require("./server/services/bundleService");

const testLesson = {
  lessonNumber: 1,
  title: "Introduction to Dijkstra's Algorithm",
  description:
    "Learn how Dijkstra's algorithm finds the shortest path in a weighted graph using a greedy approach and a priority queue.",
  keyPoints: [
    "Graphs are made of nodes connected by weighted edges",
    "Dijkstra always picks the closest unvisited node",
    "Edge relaxation updates shortest known distances",
    "A priority queue makes it efficient",
  ],
};

async function run() {
  const renderId = crypto.randomBytes(4).toString("hex");
  const componentName = `Lesson_${renderId}`;

  console.log("🤖 Step 1: Generating code with Claude...");
  const t1 = Date.now();
  const tsxCode = await generateLessonCode(testLesson, componentName);
  console.log(`✅ Code generated in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`📄 Code length: ${tsxCode.length} chars`);
  console.log("─".repeat(60));
  console.log(tsxCode.slice(0, 500) + "...");
  console.log("─".repeat(60));

  console.log("\n📦 Step 2: Bundling + deploying to Lambda...");
  const t2 = Date.now();
  const bundle = await bundleLessonCode(componentName, tsxCode, renderId);
  console.log(`✅ Bundled + deployed in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  console.log(`🌐 Serve URL: ${bundle.serveUrl}`);

  console.log("\n🧹 Cleaning up...");
  await bundle.cleanup();
  console.log("✅ Done — bundle works end to end!");
}

run().catch((err) => {
  console.error("\n❌ FAILED:");
  console.error(err);
  process.exit(1);
});