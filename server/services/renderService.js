const path = require("path");
const fs = require("fs");
const { selectComposition, renderMedia } = require("@remotion/renderer");

// Where finished videos are saved locally before serving/uploading
const OUTPUT_DIR = path.resolve(__dirname, "../../rendered-videos");

// Ensure the output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Renders a bundled composition to an MP4 file LOCALLY on this machine.
// No AWS, no Lambda. Returns the local file path of the finished video.
async function renderLessonVideo(serveUrl, componentName, renderId) {
  const outputPath = path.join(OUTPUT_DIR, `${renderId}.mp4`);

  console.log(`[${renderId}] Selecting composition ${componentName}...`);
  const composition = await selectComposition({
    serveUrl,
    id: componentName,
  });

  console.log(`[${renderId}] Rendering to ${outputPath}...`);
  await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outputPath,
  concurrency: null,
  timeoutInMilliseconds: 90000, // 90s per frame (default is 30s)
  onProgress: ({ progress }) => {
    const pct = Math.round(progress * 100);
    if (pct % 10 === 0) {
      console.log(`[${renderId}] Render: ${pct}%`);
    }
  },
});

  console.log(`[${renderId}] Render complete: ${outputPath}`);
  return outputPath;
}

module.exports = { renderLessonVideo, OUTPUT_DIR };