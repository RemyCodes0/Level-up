import { config } from "dotenv";
config({ path: "./server/.env" });

import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { generateScenePlan } = require("./server/services/sceneService");
const { generateAllSceneAudio } = require("./server/services/ttsService");
const { generateLessonCode } = require("./server/services/claudeService");
const { bundleLessonCode } = require("./server/services/bundleService");
const { startRender, pollRender } = require("./server/services/renderService");

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
  const componentName = `Lesson${renderId}`;
  let cleanup = null;

  try {
    // STEP 1 — Scene plan
    console.log("Step 1: Generating scene plan...");
    const t1 = Date.now();
    const scenes = await generateScenePlan(testLesson);
    console.log(`Scene plan: ${((Date.now() - t1) / 1000).toFixed(1)}s, ${scenes.length} scenes\n`);

    // STEP 2 — Per-scene audio + measure durations
    console.log("Step 2: Generating + measuring audio for each scene...");
    const t2 = Date.now();
    const { scenes: measuredScenes, totalFrames } = await generateAllSceneAudio(scenes);
    console.log(`Audio: ${((Date.now() - t2) / 1000).toFixed(1)}s, total ${totalFrames} frames\n`);

    // STEP 3 — Generate synced animation code
    console.log("Step 3: Generating synced animation code...");
    const t3 = Date.now();
    const tsxCode = await generateLessonCode(
      testLesson,
      componentName,
      measuredScenes,
      totalFrames
    );
    console.log(`Code: ${((Date.now() - t3) / 1000).toFixed(1)}s, ${tsxCode.length} chars\n`);

    // STEP 4 — Bundle + deploy (pass totalFrames so the composition duration matches)
    console.log("Step 4: Bundling + deploying...");
    const t4 = Date.now();
    const bundle = await bundleLessonCode(componentName, tsxCode, renderId, totalFrames);
    cleanup = bundle.cleanup;
    console.log(`Bundle: ${((Date.now() - t4) / 1000).toFixed(1)}s\n`);

    // STEP 5 — Render
    console.log("Step 5: Rendering video...");
    const t5 = Date.now();
    const { renderId: lambdaRenderId, bucketName } = await startRender(
      bundle.serveUrl,
      componentName,
      {} // no props — scene data is baked into the code
    );
    const videoUrl = await pollRender(lambdaRenderId, bucketName);
    console.log(`Render: ${((Date.now() - t5) / 1000).toFixed(1)}s\n`);

    console.log("SUCCESS — synced video ready!");
    console.log(`VIDEO URL: ${videoUrl}`);
  } catch (err) {
    console.error("\nFAILED:");
    console.error(err);
  } finally {
    if (cleanup) {
      console.log("\nCleaning up...");
      await cleanup();
      console.log("Cleaned up");
    }
  }
}

run();