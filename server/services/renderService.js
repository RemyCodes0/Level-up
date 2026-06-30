// services/renderService.js

const path = require("path");
const fs = require("fs");
const os = require("os");

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Timeout (ms) given to Remotion to render each frame before it gives up.
// 30 s is the default; we raise it to 60 s to absorb slow font/asset loads.
// If you still hit timeouts, the real fix is ensuring the composition never
// calls delayRender without a guaranteed continueRender — see WRAPPER below.
const REMOTION_TIMEOUT_MS = 60_000;

const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  vertical:  { width: 1080, height: 1920 },
  square:    { width: 1080, height: 1080 },
};

// ---------------------------------------------------------------------------
// WRAPPER — injected around every AI-generated component before bundling.
//
// Root cause of the timeout: AI-generated code can call delayRender() inside
// a useEffect or top-level async without guaranteeing continueRender() is
// reached on every code path (errors, missing data, etc.).
//
// This wrapper:
//   1. Wraps the component in an error boundary so a render crash surfaces
//      immediately instead of hanging.
//   2. Adds a global safety net: if ANY delayRender handle is still open
//      after REMOTION_TIMEOUT_MS / 2, we force-call continueRender on it so
//      the renderer can at least produce frames (possibly incomplete) rather
//      than hard-failing.
//
// NOTE: the safety net is a last resort. The right fix is always to ensure
// the generated component itself calls continueRender in a finally block.
// ---------------------------------------------------------------------------
function buildEntryFile(componentName, totalFrames) {
  return `
import { registerRoot, Composition, delayRender, continueRender } from "remotion";
import React from "react";
import { ${componentName} } from "./LessonComponent";

// ── Safety-net: force-resolve any hanging delayRender handles after half
//    the allowed timeout so Remotion can proceed rather than hard-failing.
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

// ── Error boundary so a crash in the generated component is reported
//    immediately rather than causing a silent hang / timeout.
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

// ---------------------------------------------------------------------------
// Validates the AI-generated code before we even try to bundle it.
// Catches the most common issues that cause silent hangs:
//   - No exported component found
//   - Uses fetch() / axios inside the component (network forbidden at render)
//   - delayRender without continueRender
// ---------------------------------------------------------------------------
function validateLessonCode(code) {
  const errors = [];

  const exportMatch = code.match(/export const (\w+)\s*=/);
  if (!exportMatch) {
    errors.push("No exported component found. The AI code must contain `export const MyComponent =`.");
  }

  // Warn (not hard-fail) if network calls detected — they will silently hang.
  if (/\bfetch\s*\(/.test(code) || /\brequire\s*\(\s*['"]axios['"]/.test(code) || /\baxios\b/.test(code)) {
    errors.push(
      "Generated code contains fetch() or axios — network calls are not allowed inside a Remotion composition. " +
      "All data must be passed via inputProps."
    );
  }

  // If delayRender is called, continueRender must also be present.
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

  return exportMatch[1]; // return the component name
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------
async function renderLessonToFile(lesson, outputPath, onProgress = () => {}, format = "landscape") {
  const { bundle }                       = require("@remotion/bundler");
  const { renderMedia, selectComposition } = require("@remotion/renderer");

  if (!FORMATS[format]) {
    throw new Error(`Unknown export format "${format}". Use: ${Object.keys(FORMATS).join(", ")}`);
  }

  const { code, totalFrames } = lesson;

  // 1. Validate before touching the filesystem.
  const componentName = validateLessonCode(code);

  // 2. Write temp files.
  const tempDir       = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-export-"));
  const componentFile = path.join(tempDir, "LessonComponent.tsx");
  const entryFile     = path.join(tempDir, "index.tsx");

  fs.writeFileSync(componentFile, code, "utf8");
  fs.writeFileSync(entryFile, buildEntryFile(componentName, totalFrames), "utf8");

  const nativeRenderPath =
    format === "landscape" ? outputPath : path.join(tempDir, "native.mp4");

  try {
    // 3. Bundle (0 → 30 % of reported progress).
    console.log(`[renderService] Bundling lesson (component: ${componentName}, frames: ${totalFrames})`);
    const bundleLocation = await bundle({
      entryPoint: entryFile,
      onProgress: (percent) => onProgress(Math.round(percent * 0.3)),
    });

    // 4. Select composition with extended timeout.
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "Lesson",
      timeoutInMilliseconds: REMOTION_TIMEOUT_MS,
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // 5. Render (30 → 90 % of reported progress).
    console.log(`[renderService] Rendering to ${nativeRenderPath}`);
    await renderMedia({
      composition,
      serveUrl:       bundleLocation,
      codec:          "h264",
      outputLocation: nativeRenderPath,
      timeoutInMilliseconds: REMOTION_TIMEOUT_MS,
      // Pipe browser console to server logs so stuck delayRender handles
      // show up in your Render.com log stream immediately.
      onBrowserLog: (log) => {
        const level = log.type === "error" ? "ERROR" : log.type === "warning" ? "WARN" : "LOG";
        console.log(`[browser:${level}] ${log.text}`);
      },
      onProgress: ({ progress }) => {
        onProgress(30 + Math.round(progress * 60));
      },
    });

    // 6. Pad to target format if needed (90 → 100 %).
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

// ---------------------------------------------------------------------------
// Letterbox / pillarbox with ffmpeg-static
// ---------------------------------------------------------------------------
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