import { config } from "dotenv";
config({ path: "./server/.env" });

import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { generateLessonCode } = require("./server/services/claudeService");
const { bundleLessonCode } = require("./server/services/bundleService");
const { generateVoiceover } = require("./server/services/ttsService");
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
  narrationScript:
    "Welcome to this lesson on Dijkstra's algorithm. Imagine you are trying to find the fastest route across a city. Each intersection is a node, and each road has a travel time. Dijkstra's algorithm solves this elegantly. We start at our source, set its distance to zero, and every other node to infinity. Then we repeatedly pick the closest unvisited node, look at its neighbours, and update their distances if we found a shorter path. This process of updating is called relaxation. To do this efficiently, we use a priority queue, which always hands us the closest node next. By the time we reach our destination, we have the shortest possible path. Let's explore how this works step by step.",
};

async function run() {
  const renderId = crypto.randomBytes(4).toString("hex");
    const componentName = `Lesson${renderId}`;
  let cleanup = null;

  try {
    // STEP 1 — Generate code
    console.log("Step 1: Generating animation code...");
    const t1 = Date.now();
    const tsxCode = await generateLessonCode(testLesson, componentName);
    console.log(`Code done: ${((Date.now() - t1) / 1000).toFixed(1)}s, ${tsxCode.length} chars\n`);

    // STEP 2 — Generate voiceover
    console.log("Step 2: Generating voiceover with OpenAI TTS...");
    const t2 = Date.now();
    const audioUrl = await generateVoiceover(testLesson.narrationScript);
    console.log(`Voiceover done: ${((Date.now() - t2) / 1000).toFixed(1)}s`);
    console.log(`Audio URL: ${audioUrl}\n`);

    // STEP 3 — Bundle + deploy
    console.log("Step 3: Bundling + deploying to Lambda...");
    const t3 = Date.now();
    const bundle = await bundleLessonCode(componentName, tsxCode, renderId);
    cleanup = bundle.cleanup;
    console.log(`Bundle done: ${((Date.now() - t3) / 1000).toFixed(1)}s\n`);

    // STEP 4 — Render on Lambda
    console.log("Step 4: Rendering video on Lambda...");
    const t4 = Date.now();
    const { renderId: lambdaRenderId, bucketName } = await startRender(
      bundle.serveUrl,
      componentName,
      {
        title: testLesson.title,
        description: testLesson.description,
        keyPoints: testLesson.keyPoints,
        lessonNumber: testLesson.lessonNumber,
        audioUrl,
      }
    );

    const videoUrl = await pollRender(lambdaRenderId, bucketName);
    console.log(`Render done: ${((Date.now() - t4) / 1000).toFixed(1)}s\n`);

    console.log("SUCCESS — full pipeline works!");
    console.log(`VIDEO URL: ${videoUrl}`);
  } catch (err) {
    console.error("\nFAILED:");
    console.error(err);
  } finally {
    if (cleanup) {
      console.log("\nCleaning up Lambda site...");
      await cleanup();
      console.log("Cleaned up");
    }
  }
}

run();