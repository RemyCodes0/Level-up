const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { parseBuffer } = require("music-metadata");
const { createLimiter } = require("../utils/concurrencyLimiter");

const FPS = 30;

const AUDIO_DIR = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../../remotion-render/public/audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:5000";

// Back to OpenAI's own TTS API directly — own key/account, not routed
// through OpenRouter (that was specific to the Kokoro hosting this replaces).
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 150 * 1000, // 150 seconds — scenes 12-13 with long narration were timing out at 90s
  maxRetries: 0,       // handle retries manually below with backoff
});

// Generates audio for a single scene with manual retry + exponential backoff.
// One call per scene, no chunking — that workaround existed only because
// Kokoro's OpenRouter hosting silently truncated any single call past
// ~240-290 characters; OpenAI's own tts-1 has no such limit, so the plain
// single-call version (this project's original design) is back.
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
      // MP3, not raw PCM — tts-1 returns a single, complete, self-consistent
      // MP3 file per call (unlike the old chunked-PCM design, there's no
      // multi-chunk concatenation here to create the framing/metadata
      // mismatch that raw PCM was specifically chosen to avoid), so reading
      // its own declared duration via music-metadata is reliable as-is.
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
        // Tagged so a caller that pipelines this scene's promise straight
        // into code generation (see generateAllSceneAudioPipelined /
        // claudeService.js's generateLessonCode) can still correctly
        // attribute a resulting lesson-build failure to the "audio" stage
        // instead of whatever stage happens to observe the rejection.
        err.stage = err.stage || "audio";
        throw err;
      }
      const backoffMs = 2000 * attempt; // 2s, 4s, 6s — longer wait for terminated connections
      console.warn(`  [tts] Scene ${scene.id}: attempt ${attempt} failed (${err.message}), retrying in ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

// Bounds how many scenes can be actively generating audio (and writing
// files) at once. This exists because fully parallel writeFileSync calls
// across 13+ scenes cause I/O contention on constrained hosts (truncated/
// zero-byte files). A real rolling semaphore, NOT a
// fixed-size batch loop (fire N, wait for ALL N, fire the next N) — the
// batch-loop version had the exact same problem the scene code-gen batching
// was found to have (see claudeService.js's generateLessonCode): one slow
// scene in a group holds back every scene queued behind that whole group,
// even ones that could've started the instant an earlier group-mate
// finished. A plain semaphore lets the next scene start the moment any
// slot frees up.
const SCENE_AUDIO_MAX_CONCURRENT = Number(process.env.SCENE_AUDIO_MAX_CONCURRENT) || 6;
const limitSceneAudioCall = createLimiter(SCENE_AUDIO_MAX_CONCURRENT);

// Kicks off audio generation for every scene immediately and returns
// synchronously (no await) — `scenePromises[i]` is a real Promise for EVERY
// index the moment this function returns, not just the first
// SCENE_AUDIO_MAX_CONCURRENT of them (a caller that wants to start scene i's
// CODE generation the instant scene i's own audio is ready — see
// claudeService.js's generateLessonCode — needs every entry to already be a
// live promise to attach to, not `undefined` for any scene the semaphore
// hasn't reached yet).
//
// `onSceneAudioReady(index, measuredScene)` is optional — fires as soon as
// EACH scene's own audio finishes, with the real 0-based array index
// (generateSceneAudio itself only ever sees scene.id, whatever the
// scene-plan JSON assigned — not guaranteed to be a reliable contiguous
// index, so the index is threaded through here instead). Lets a caller show
// per-scene progress before code generation even starts.
//
// Returns `{ scenePromises, donePromise }`: `donePromise` resolves once
// EVERY scene's audio has landed, with the same `{ scenes, totalFrames }`
// shape generateAllSceneAudio (below) used to return directly — for a
// caller that doesn't need per-scene pipelining and just wants the final
// aggregate result.
function generateAllSceneAudioPipelined(scenes, onSceneAudioReady) {
  const stageStart = Date.now();
  console.log(`  [tts] Generating ${scenes.length} audio clips (max ${SCENE_AUDIO_MAX_CONCURRENT} scenes concurrent)...`);

  const scenePromises = scenes.map((scene, index) =>
    limitSceneAudioCall(() => generateSceneAudio(scene)).then((result) => {
      // Never let a progress-notification failure take down real audio
      // generation — same non-fatal philosophy as the rest of this
      // pipeline's optional progress callbacks.
      try {
        onSceneAudioReady?.(index, result);
      } catch (notifyErr) {
        console.warn(`  [tts] Scene ${index + 1}: onSceneAudioReady callback failed (non-fatal): ${notifyErr.message}`);
      }
      return result;
    })
  );

  const donePromise = Promise.all(scenePromises).then((enriched) => {
    const totalFrames = enriched.reduce((sum, s) => sum + s.durationInFrames, 0);
    // NOTE: this is the narration's own PLAYBACK duration (how long the
    // combined clips run for), not how long generation took — use the
    // wall-clock line below for that. Kept separate on purpose: this number
    // feeds totalFrames for the actual lesson video, that one is diagnostic
    // only.
    console.log(`  [tts] Total narration: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s playback)`);
    console.log(`  [tts] Audio stage wall-clock: ${((Date.now() - stageStart) / 1000).toFixed(1)}s`);
    return { scenes: enriched, totalFrames };
  });

  return { scenePromises, donePromise };
}

// Back-compat wrapper for callers that just want the final aggregate result
// and don't need per-scene pipelining (e.g. adController.js's ad-generation
// path, which builds one short component and has no equivalent to the
// lesson pipeline's per-scene code generation to overlap with).
async function generateAllSceneAudio(scenes, onSceneAudioReady) {
  const { donePromise } = generateAllSceneAudioPipelined(scenes, onSceneAudioReady);
  return donePromise;
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

module.exports = { generateSceneAudio, generateAllSceneAudio, generateAllSceneAudioPipelined, cleanupAudio, FPS };