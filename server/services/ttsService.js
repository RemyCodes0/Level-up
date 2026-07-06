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
  timeout: 150 * 1000, // 150 seconds — scenes 12-13 with long narration were timing out at 90s
  maxRetries: 0,       // handle retries manually below with backoff
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

      // Verify the file actually landed on disk with the right size.
      // On constrained hosts (Starter, 0.5 CPU), concurrent writeFileSync
      // calls occasionally produce zero-byte or truncated files due to I/O
      // contention — this catches that silently before it becomes a 404.
      const written = fs.statSync(audioFilePath).size;
      if (written < buffer.length * 0.9) {
        fs.unlinkSync(audioFilePath);
        throw new Error(`File write incomplete: wrote ${written} bytes, expected ~${buffer.length}`);
      }

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
      const backoffMs = 2000 * attempt; // 2s, 4s, 6s — longer wait for terminated connections
      console.warn(`  [tts] Scene ${scene.id}: attempt ${attempt} failed (${err.message}), retrying in ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

// Generates audio for all scenes with bounded concurrency (5 at a time).
// Fully parallel (Promise.all over 13+ scenes) causes I/O contention on
// constrained hosts — concurrent writeFileSync calls race each other and
// can produce truncated files. Batching keeps throughput high while
// preventing the disk from being hammered by too many simultaneous writes.
async function generateAllSceneAudio(scenes) {
  console.log(`  [tts] Generating ${scenes.length} audio clips (max 5 concurrent)...`);

  const BATCH_SIZE = 5;
  const enriched = [];

  for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
    const batch = scenes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((scene) => generateSceneAudio(scene)));
    enriched.push(...results);
  }

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