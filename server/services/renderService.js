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
// The AI-generated scene code is authored assuming this exact 16:9 canvas —
// changing these would distort or clip content that was positioned for a
// wide frame. For other aspect ratios (Instagram vertical/square), we
// always render at this native size first, then PAD the result onto a
// different canvas afterward (see padToFormat below) — never stretch.
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Supported export formats. "landscape" is the native render — no
// post-processing needed. The other two pad the original 16:9 video onto a
// taller canvas with black bars, the same technique used by most
// YouTube-to-Instagram repurposing tools — preserves every pixel of the
// original scene, just reframed for a vertical app layout.
const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 }, // Instagram Reels/Stories (9:16)
  square: { width: 1080, height: 1080 }, // Instagram feed (1:1)
};

// Renders a lesson to an mp4 file.
//
// lesson: { code, totalFrames } — pulled from the Course document
// outputPath: absolute path to write the .mp4 to
// onProgress: optional callback(percent: number 0-100), called during both
//   the bundling and rendering phases so callers can report combined progress
// format: "landscape" (default) | "vertical" | "square"
async function renderLessonToFile(lesson, outputPath, onProgress = () => {}, format = "landscape") {
  const { bundle } = require("@remotion/bundler");
  const { renderMedia, selectComposition } = require("@remotion/renderer");

  if (!FORMATS[format]) {
    throw new Error(`Unknown export format "${format}". Use landscape, vertical, or square.`);
  }

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

  // Landscape renders go directly to outputPath. Other formats render to a
  // temp file first, then get padded into the final outputPath — keeps the
  // native render untouched and the padding step isolated/easy to debug.
  const nativeRenderPath =
    format === "landscape" ? outputPath : path.join(tempDir, "native.mp4");

  try {
    // Bundling counts as the first 30% of overall progress, rendering the
    // next 60%, and padding (if any) the final 10%.
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
      outputLocation: nativeRenderPath,
      onProgress: ({ progress }) => onProgress(30 + Math.round(progress * 60)),
    });

    if (format !== "landscape") {
      await padToFormat(nativeRenderPath, outputPath, FORMATS[format]);
    }

    onProgress(100);
    return outputPath;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Pads a 1920x1080 video onto a taller/different-aspect canvas with black
// bars, preserving every pixel of the original — never crops or stretches.
function padToFormat(inputPath, outputPath, { width: targetW, height: targetH }) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require("ffmpeg-static");
    const { spawn } = require("child_process");

    // Scale to fill the target WIDTH, keeping the source's 16:9 aspect ratio,
    // then pad top/bottom with black to reach the target HEIGHT. Since our
    // source is always 1920x1080 and target width matches (1080), this is a
    // straightforward vertical letterbox — no horizontal padding needed.
    const filter = `scale=${targetW}:-2,pad=${targetW}:${targetH}:0:(${targetH}-ih)/2:black`;

    const args = [
      "-y",
      "-i", inputPath,
      "-vf", filter,
      "-c:v", "libx264",
      "-c:a", "copy",
      outputPath,
    ];

    const proc = spawn(ffmpegPath, args);

    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`ffmpeg padding failed (exit ${exitCode}): ${stderr.slice(-500)}`));
    });

    proc.on("error", reject);
  });
}

module.exports = { renderLessonToFile, FORMATS };