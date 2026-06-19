// services/renderService.js
//
// Renders one lesson's AI-generated Remotion code to a real .mp4 file.
// Reusable by both the CLI script (scripts/renderLessonToMp4.js) and the
// download endpoint (controllers/exportController.js) — same rendering
// logic, different callers.

const path = require("path");
const fs = require("fs");
const os = require("os");

// fps/width/height MUST match what DynamicPlayer.tsx uses in the browser.
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Renders a lesson to an mp4 file.
//
// lesson: { code, totalFrames } — pulled from the Course document
// outputPath: absolute path to write the .mp4 to
// onProgress: optional callback(percent: number 0-100), called during both
//   the bundling and rendering phases so callers can report combined progress
async function renderLessonToFile(lesson, outputPath, onProgress = () => {}) {
  const { bundle } = require("@remotion/bundler");
  const { renderMedia, selectComposition } = require("@remotion/renderer");

  const { code, totalFrames } = lesson;

  const match = code.match(/export const (\w+)\s*=/);
  if (!match) {
    throw new Error("Could not find an exported component name in the lesson code.");
  }
  const componentName = match[1];

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-export-"));
  const componentFile = path.join(tempDir, "LessonComponent.tsx");
  const entryFile = path.join(tempDir, "index.tsx");

  fs.writeFileSync(componentFile, code, "utf8");
  fs.writeFileSync(
    entryFile,
    `
import { registerRoot, Composition } from "remotion";
import { ${componentName} } from "./LessonComponent";

const RemotionRoot = () => (
  <Composition
    id="Lesson"
    component={${componentName}}
    durationInFrames={${totalFrames}}
    fps={${FPS}}
    width={${WIDTH}}
    height={${HEIGHT}}
  />
);

registerRoot(RemotionRoot);
    `,
    "utf8"
  );

  try {
    // Bundling counts as the first 30% of overall progress, rendering the
    // remaining 70% — an approximation, but gives the user a moving bar
    // instead of it sitting at 0% during the (often slow) bundle step.
    const bundleLocation = await bundle({
      entryPoint: entryFile,
      onProgress: (percent) => onProgress(Math.round(percent * 0.3)),
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "Lesson",
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      onProgress: ({ progress }) => onProgress(30 + Math.round(progress * 70)),
    });

    onProgress(100);
    return outputPath;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { renderLessonToFile };