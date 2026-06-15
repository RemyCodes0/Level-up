const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { parseBuffer } = require("music-metadata");

const FPS = 30;

// Remotion serves files from the `public/` folder inside the remotion project.
// Audio saved here is accessible via staticFile() in the composition code.
const AUDIO_DIR = path.resolve(__dirname, "../../remotion-render/public/audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 40000,  // 40s — fail fast and retry instead of hanging 2 min
  maxRetries: 4,
});

// Generates one audio clip, saves it to remotion-render/public/audio/,
// and measures its duration. Remotion can serve it via staticFile().
async function generateSceneAudio(text) {
  // 1. Generate speech
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    speed: 1.0,
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  // 2. Measure exact duration
  const metadata = await parseBuffer(buffer, "audio/mpeg");
  const durationSeconds = metadata.format.duration;
  const durationInFrames = Math.ceil(durationSeconds * FPS);

  // 3. Save to remotion public folder
  const fileName = `${uuidv4()}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  // The staticFile path is relative to the public folder root
  const staticPath = `audio/${fileName}`;

  return {
    audioUrl: staticPath,      // used in <Audio src={staticFile(audioUrl)} />
    audioFilePath: filePath,   // absolute path for cleanup after render
    durationSeconds,
    durationInFrames,
  };
}

// Generates audio for every scene sequentially.
async function generateAllSceneAudio(scenes) {
  const enriched = [];

  for (const scene of scenes) {
    console.log(`  [tts] Scene ${scene.id}: generating audio...`);
    const { audioUrl, audioFilePath, durationSeconds, durationInFrames } =
      await generateSceneAudio(scene.narration);
    enriched.push({ ...scene, audioUrl, audioFilePath, durationSeconds, durationInFrames });
    console.log(`  [tts] Scene ${scene.id}: ${durationSeconds.toFixed(1)}s = ${durationInFrames} frames`);
  }

  const totalFrames = enriched.reduce((sum, s) => sum + s.durationInFrames, 0);
  console.log(`  [tts] Total: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);

  return { scenes: enriched, totalFrames };
}

// Deletes local audio files after rendering is complete.
function cleanupAudio(scenes) {
  for (const scene of scenes || []) {
    try {
      if (scene.audioFilePath && fs.existsSync(scene.audioFilePath)) {
        fs.unlinkSync(scene.audioFilePath);
      }
    } catch (e) {
      // non-fatal
    }
  }
}

module.exports = { generateSceneAudio, generateAllSceneAudio, cleanupAudio, FPS };