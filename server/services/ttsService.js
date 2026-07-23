const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { parseBuffer } = require("music-metadata");
const { createLimiter } = require("../utils/concurrencyLimiter");

const FPS = 30;

// GLOBAL cap on simultaneous TTS chunk requests, across ALL scenes in
// flight at once — not per-scene. Chunking (see splitIntoTtsChunks below)
// fixed Kokoro's per-call truncation bug, but each scene now fires several
// chunk requests in parallel, and generateAllSceneAudio already runs
// multiple SCENES concurrently — multiplying to a much bigger real
// concurrency spike than the previous "1 request per scene" baseline ever
// produced (a 140-190 word scene needs ~4-6 chunks; 5 concurrent scenes x
// 5 chunks each is ~25 simultaneous requests). That spike produced the exact
// same kind of "Connection error" failures under load that GLM's own
// concurrency limiter (GLM_SCENE_MAX_CONCURRENT) was lowered to fix — this
// is the equivalent fix for the TTS side. Default of 5 matches the
// concurrency level that was already known to work reliably before chunking
// existed (BATCH_SIZE scenes x 1 request each).
const TTS_CHUNK_MAX_CONCURRENT = Number(process.env.TTS_CHUNK_MAX_CONCURRENT) || 5;
const limitTtsChunkCall = createLimiter(TTS_CHUNK_MAX_CONCURRENT);

const AUDIO_DIR = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../../remotion-render/public/audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:5000";

// OpenRouter's OpenAI-compatible /audio/speech endpoint — same account/key
// as the code-gen providers in claudeService.js, instead of a separate
// OpenAI key just for TTS.
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 150 * 1000, // 150 seconds — scenes 12-13 with long narration were timing out at 90s
  maxRetries: 0,       // handle retries manually below with backoff
});

// Kokoro (via this OpenRouter hosting) silently TRUNCATES any single call's
// audio past roughly 240-290 characters (~36-52 words) — measured directly:
// a 36-word/240-char input played fully at a natural ~150-165 words/minute
// (14.30s), while 52-word/286-char and 143-word/962-char inputs BOTH got cut
// short to the exact same 9.43s, no matter how much MORE text was fed in.
// There's no error, warning, or short response — the returned audio is just
// quietly shorter than the input narration calls for. This is why raising
// the scene-plan's narration word-count target never produced longer
// lessons: the extra words were being discarded by the TTS call, never
// actually spoken. Fix: split narration into chunks safely under that
// truncation boundary, generate each as its OWN TTS call, and concatenate
// the resulting audio — the standard workaround for Kokoro's per-call length
// cap (its documented ~510-token/~500-char context limit, though this
// specific hosting's effective boundary measured tighter than that).
const TTS_CHUNK_MAX_CHARS = 180; // comfortably under the measured ~240-290 char truncation boundary

// Splits narration into TTS-safe chunks, always breaking on sentence
// boundaries (never mid-sentence) so each chunk still sounds natural in
// isolation. A single sentence longer than the limit (rare) falls back to a
// word-level split for just that sentence, rather than sending it whole and
// risking Kokoro truncating it mid-word.
function splitIntoTtsChunks(text, maxChars = TTS_CHUNK_MAX_CHARS) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let current = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      const words = sentence.split(/\s+/);
      let wordChunk = "";
      for (const word of words) {
        const candidate = wordChunk ? `${wordChunk} ${word}` : word;
        if (candidate.length > maxChars && wordChunk) {
          chunks.push(wordChunk.trim());
          wordChunk = word;
        } else {
          wordChunk = candidate;
        }
      }
      if (wordChunk) chunks.push(wordChunk.trim());
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current.trim());

  return chunks;
}

// Generates one narration chunk's audio — a single TTS call, no retry of its
// own (a failure here bubbles up to generateSceneAudio's own retry loop,
// which redoes every chunk for the scene from scratch; simpler than nested
// per-chunk retries for a failure mode that's rare in practice).
async function generateChunkAudio(chunkText) {
  return limitTtsChunkCall(async () => {
    const response = await openai.audio.speech.create({
      model: "hexgrad/kokoro-82m",
      voice: "af_nova",
      input: chunkText,
      response_format: "mp3",
      speed: 1.0,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await parseBuffer(buffer, "audio/mpeg");
    return { buffer, durationSeconds: metadata.format.duration };
  });
}

// Generates audio for a single scene with manual retry + exponential backoff
async function generateSceneAudio(scene, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  [tts] Scene ${scene.id}: generating audio (attempt ${attempt}/${retries})...`);

      // "af_nova" is Kokoro's American Female "Nova" voice, the closest
      // equivalent to the OpenAI "nova" voice this replaced.
      const chunks = splitIntoTtsChunks(scene.narration);
      // Chunks are independent TTS calls — fire them in parallel (order of
      // the REQUESTS doesn't matter, only the order they're concatenated in
      // afterward, which this preserves via .map's index-preserving results).
      const chunkResults = await Promise.all(chunks.map((chunk) => generateChunkAudio(chunk)));

      const buffer = Buffer.concat(chunkResults.map((c) => c.buffer));
      // Summed from each chunk's OWN measured duration, not re-parsed from
      // the concatenated file — more reliable than trusting an MP3 decoder
      // to correctly sum duration across back-to-back frame streams that
      // were never encoded as one continuous file.
      const durationSeconds = chunkResults.reduce((sum, c) => sum + c.durationSeconds, 0);
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

// Generates audio for all scenes with bounded concurrency (2 scenes at a
// time). Fully parallel (Promise.all over 13+ scenes) causes I/O contention
// on constrained hosts — concurrent writeFileSync calls race each other and
// can produce truncated files. Batching keeps throughput high while
// preventing the disk from being hammered by too many simultaneous writes.
//
// The real cap on simultaneous TTS requests is limitTtsChunkCall above
// (TTS_CHUNK_MAX_CONCURRENT = 5), not this number — that limiter bounds
// actual API concurrency regardless of how many scenes are "active" at
// once. This number (scenes) and that one (audio requests) are deliberately
// tuned independently: 2 scenes active at once, each of whose chunks then
// compete for the shared 5-slot TTS request pool.
//
// `onSceneAudioReady(index, measuredScene)` is optional — fires as soon as
// EACH scene's own audio finishes (not just once the whole batch settles),
// with the real 0-based array index (generateSceneAudio itself only ever
// sees scene.id, whatever the scene-plan JSON assigned — not guaranteed to
// be a reliable contiguous index, so the index is threaded through here
// instead). Lets a caller show per-scene progress before code generation
// even starts.
async function generateAllSceneAudio(scenes, onSceneAudioReady) {
  const BATCH_SIZE = 2;
  console.log(`  [tts] Generating ${scenes.length} audio clips (max ${BATCH_SIZE} scenes concurrent, max ${TTS_CHUNK_MAX_CONCURRENT} chunk requests concurrent)...`);

  const enriched = [];

  for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
    const batch = scenes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((scene, batchIdx) => {
        const index = i + batchIdx;
        return generateSceneAudio(scene).then((result) => {
          // Never let a progress-notification failure take down real audio
          // generation — same non-fatal philosophy as the rest of this
          // pipeline's optional progress callbacks.
          try {
            onSceneAudioReady?.(index, result);
          } catch (notifyErr) {
            console.warn(`  [tts] Scene ${index + 1}: onSceneAudioReady callback failed (non-fatal): ${notifyErr.message}`);
          }
          return result;
        });
      })
    );
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