// services/renderService.js

const path = require("path");
const fs = require("fs");
const os = require("os");

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Raised from 60s to 180s — complex particle-field animations with many
// elements per frame can exceed 60s on slower machines or when headless
// Chrome is under load. 3 minutes gives headroom without hanging indefinitely.
const REMOTION_TIMEOUT_MS = 180_000;

const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  vertical:  { width: 1080, height: 1920 },
  square:    { width: 1080, height: 1080 },
};

function buildEntryFile(componentName, totalFrames) {
  return `
import { registerRoot, Composition, delayRender, continueRender } from "remotion";
import React from "react";
import { ${componentName} } from "./LessonComponent";

const SAFETY_TIMEOUT_MS = ${Math.floor(REMOTION_TIMEOUT_MS / 2)};
if (typeof window !== "undefined") {
  setTimeout(() => {
    const handles = window.remotion_delayRenderTimeouts
      ? Object.keys(window.remotion_delayRenderTimeouts)
      : [];
    if (handles.length > 0) {
      console.warn(
        "[renderService safety-net] Force-resolving " + handles.length +
        " stuck delayRender handle(s). Fix the composition to avoid this."
      );
      handles.forEach((id) => {
        try { continueRender(Number(id)); } catch (_) {}
      });
    }
  }, SAFETY_TIMEOUT_MS);
}

class LessonErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  componentDidCatch(err, info) {
    console.error("[LessonErrorBoundary]", err, info);
  }
  render() {
    if (this.state.error) {
      return React.createElement(
        "div",
        { style: { color: "red", padding: 40, fontFamily: "monospace", fontSize: 28 } },
        "Lesson render error: " + String(this.state.error)
      );
    }
    return this.props.children;
  }
}

const WrappedLesson = (props) =>
  React.createElement(
    LessonErrorBoundary,
    null,
    React.createElement(${componentName}, props)
  );

const RemotionRoot = () => (
  <Composition
    id="Lesson"
    component={WrappedLesson}
    durationInFrames={${totalFrames}}
    fps={${FPS}}
    width={${WIDTH}}
    height={${HEIGHT}}
  />
);

registerRoot(RemotionRoot);
`;
}

function validateLessonCode(code) {
  const errors = [];

  const exportMatch = code.match(/export const (\w+)\s*=/);
  if (!exportMatch) {
    errors.push("No exported component found. The AI code must contain `export const MyComponent =`.");
  }

  // Note: fetch()/axios check removed — it was producing false positives on
  // generated code that contained the word "fetch" inside strings, comments,
  // or identifier names like "prefetch". Audio <Audio src="..."> tags are
  // safe hardcoded strings, not dynamic network calls.

  const hasDelay    = /\bdelayRender\b/.test(code);
  const hasContinue = /\bcontinueRender\b/.test(code);
  if (hasDelay && !hasContinue) {
    errors.push(
      "Generated code calls delayRender() but never calls continueRender() — this will always timeout."
    );
  }

  if (errors.length) {
    throw new Error("Lesson code validation failed:\n" + errors.map((e) => "  • " + e).join("\n"));
  }

  return exportMatch[1];
}

async function renderLessonToFile(lesson, outputPath, onProgress = () => {}, format = "landscape") {
  const { bundle }                         = require("@remotion/bundler");
  const { renderMedia, selectComposition } = require("@remotion/renderer");

  if (!FORMATS[format]) {
    throw new Error(`Unknown export format "${format}". Use: ${Object.keys(FORMATS).join(", ")}`);
  }

  const { code, totalFrames } = lesson;

  const componentName = validateLessonCode(code);

  const tempDir       = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-export-"));
  const componentFile = path.join(tempDir, "LessonComponent.tsx");
  const entryFile     = path.join(tempDir, "index.tsx");

  fs.writeFileSync(componentFile, code, "utf8");
  fs.writeFileSync(entryFile, buildEntryFile(componentName, totalFrames), "utf8");

  const nativeRenderPath =
    format === "landscape" ? outputPath : path.join(tempDir, "native.mp4");

  try {
    console.log(`[renderService] Bundling lesson (component: ${componentName}, frames: ${totalFrames})`);
    const bundleLocation = await bundle({
      entryPoint: entryFile,
      onProgress: (percent) => onProgress(Math.round(percent * 0.3)),
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "Lesson",
      timeoutInMilliseconds: REMOTION_TIMEOUT_MS,
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    console.log(`[renderService] Rendering to ${nativeRenderPath}`);
    await renderMedia({
      composition,
      serveUrl:       bundleLocation,
      codec:          "h264",
      outputLocation: nativeRenderPath,
      // Raised to match REMOTION_TIMEOUT_MS — complex generated scenes with
      // particle fields and many animated elements need more than 60s per frame
      // on a dev machine.
      timeoutInMilliseconds: REMOTION_TIMEOUT_MS,
      // Limit concurrent frame renders to prevent RAM spikes on dev machines.
      // Remotion defaults to CPU core count; 2 keeps it stable for heavy scenes.
      concurrency: 2,
      onBrowserLog: (log) => {
        const level = log.type === "error" ? "ERROR" : log.type === "warning" ? "WARN" : "LOG";
        console.log(`[browser:${level}] ${log.text}`);
      },
      onProgress: ({ progress }) => {
        onProgress(30 + Math.round(progress * 60));
      },
    });

    if (format !== "landscape") {
      console.log(`[renderService] Padding to ${format}`);
      await padToFormat(nativeRenderPath, outputPath, FORMATS[format]);
    }

    onProgress(100);
    console.log(`[renderService] Done → ${outputPath}`);
    return outputPath;

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function padToFormat(inputPath, outputPath, { width: targetW, height: targetH }) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require("ffmpeg-static");
    const { spawn } = require("child_process");

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