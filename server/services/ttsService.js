const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { parseBuffer } = require("music-metadata");

const FPS = 30;

const AUDIO_DIR = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../../remotion-render/public/audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:5000";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 90 * 1000,  // 90 seconds per request — long enough for any scene
  maxRetries: 3,        // auto-retry on transient timeouts
});

// Generates audio for a single scene with manual retry + exponential backoff
async function generateSceneAudio(scene, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  [tts] Scene ${scene.id}: generating audio (attempt ${attempt}/${retries})...`);

      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: scene.narration,
        speed: 1.0,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await parseBuffer(buffer, "audio/mpeg");
      const durationSeconds = metadata.format.duration;
      const durationInFrames = Math.ceil(durationSeconds * FPS);

      const fileName = `${uuidv4()}.mp3`;
      const audioFilePath = path.join(AUDIO_DIR, fileName);
      fs.writeFileSync(audioFilePath, buffer);

      const audioUrl = `${SERVER_BASE_URL}/audio/${fileName}`;

      console.log(`  [tts] Scene ${scene.id}: ${durationSeconds.toFixed(1)}s = ${durationInFrames} frames`);

      return {
        ...scene,
        audioUrl,
        audioFilePath,
        durationSeconds,
        durationInFrames,
      };
    } catch (err) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        console.error(`  [tts] Scene ${scene.id}: all ${retries} attempts failed — ${err.message}`);
        throw err;
      }
      const backoffMs = 1000 * attempt; // 1s, 2s, 3s
      console.warn(`  [tts] Scene ${scene.id}: attempt ${attempt} failed (${err.message}), retrying in ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

// All scenes generate in parallel
async function generateAllSceneAudio(scenes) {
  console.log(`  [tts] Generating ${scenes.length} audio clips in parallel...`);

  const enriched = await Promise.all(scenes.map((scene) => generateSceneAudio(scene)));

  const totalFrames = enriched.reduce((sum, s) => sum + s.durationInFrames, 0);
  console.log(`  [tts] Total: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);

  return { scenes: enriched, totalFrames };
}

// Call this from deleteCourseHandler only — NOT after code generation,
// since the browser needs the audio files during playback.
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