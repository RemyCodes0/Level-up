const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { createLimiter } = require("../utils/concurrencyLimiter");
const { recordAiUsage } = require("./aiUsageService");
const { estimateTokensFromChars } = require("../config/modelPricing");

// Kokoro's raw PCM output format via this OpenRouter hosting — measured
// directly: a 13-word sentence produced a PCM buffer whose length implies
// 4.67s at 24kHz/16-bit/mono, matching the ~150-165wpm natural speaking rate
// for that word count; a second check against the SAME text's MP3-reported
// duration (5.952s) came within 0.05s of the PCM-implied duration (5.900s)
// for a longer sentence — confirming this format.
const PCM_SAMPLE_RATE = 24000;
const PCM_BITS_PER_SAMPLE = 16;
const PCM_CHANNELS = 1;
const PCM_BYTES_PER_SAMPLE = PCM_BITS_PER_SAMPLE / 8;

// Prepends a standard 44-byte RIFF/WAVE header to raw PCM sample data,
// producing one complete, valid, independently-decodable WAV file. Every
// player determines duration and content directly from this file's own
// declared sizes — nothing here depends on trusting multiple concatenated
// chunks' own internal metadata (see the comment on generateSceneAudio's
// concatenation for why that mattered).
function pcmToWav(pcmBuffer, { sampleRate = PCM_SAMPLE_RATE, channels = PCM_CHANNELS, bitsPerSample = PCM_BITS_PER_SAMPLE } = {}) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

const FPS = 30;

// GLOBAL cap on simultaneous TTS chunk requests, across ALL scenes in
// flight at once — not per-scene. Chunking (see splitIntoTtsChunks below)
// fixed Kokoro's per-call truncation bug, but each scene now fires several
// chunk requests in parallel, and generateAllSceneAudio already runs
// multiple SCENES concurrently — multiplying to a much bigger real
// concurrency spike than a "1 request per scene" baseline would produce (a
// 140-190 word scene needs ~4-6 chunks; 5 concurrent scenes x 5 chunks each
// is ~25 simultaneous requests). That spike produces the same kind of
// "Connection error" failures under load that the code-gen limiters in
// claudeService.js exist to prevent — this is the equivalent fix for the
// TTS side.
const TTS_CHUNK_MAX_CONCURRENT = Number(process.env.TTS_CHUNK_MAX_CONCURRENT) || 8;
const limitTtsChunkCall = createLimiter(TTS_CHUNK_MAX_CONCURRENT);

const AUDIO_DIR = process.env.NODE_ENV === "production"
  ? "/data/audio"
  : path.resolve(__dirname, "../../remotion-render/public/audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:5000";

// OpenRouter's OpenAI-compatible /audio/speech endpoint — same account/key
// as the course-path code-gen providers in claudeService.js, instead of a
// separate OpenAI key just for TTS.
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
// quietly shorter than the input narration calls for. Fix: split narration
// into chunks safely under that truncation boundary, generate each as its
// OWN TTS call, and concatenate the resulting audio — the standard
// workaround for Kokoro's per-call length cap (its documented ~510-token/
// ~500-char context limit, though this specific hosting's effective
// boundary measured tighter than that).
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
//
// Requests RAW PCM, not MP3. MP3 chunks each carry their own internal
// metadata (e.g. a Xing/VBR header describing THAT chunk's own frame count),
// and naively Buffer.concat-ing several independently-encoded MP3s produces
// a file where duration-estimating decoders read only the FIRST chunk's own
// declared length and ignore the rest — even though the actual audio bytes
// for every chunk are all still physically present in the file. That
// silently truncates PLAYBACK (not just measurement) for any narration
// needing more than one chunk. Raw PCM has no such per-chunk framing at all
// — chunks concatenate byte-for-byte with zero ambiguity — so this crosses
// that entire failure class off, not just patches around it.
async function generateChunkAudio(chunkText) {
  return limitTtsChunkCall(async () => {
    const response = await openai.audio.speech.create({
      model: "hexgrad/kokoro-82m",
      voice: "af_nova",
      input: chunkText,
      response_format: "pcm",
      speed: 1.0,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    // Computed directly from byte length at a KNOWN, fixed sample rate —
    // raw PCM has no embedded duration metadata to (mis)trust in the first
    // place, so there's nothing here that can drift from the real content.
    const durationSeconds = buffer.length / (PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * PCM_CHANNELS);
    return { buffer, durationSeconds };
  });
}

// Generates audio for a single scene with manual retry + exponential backoff.
// `context` ({ userId, courseId }) feeds the AI cost ledger — Kokoro's
// audio.speech API returns no token-count usage at all, so cost here is
// estimated from total characters SENT across this scene's chunks (see
// config/modelPricing.js's estimateTokensFromChars for why that's an
// estimate, not an exact figure).
async function generateSceneAudio(scene, retries = 3, context = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  [tts] Scene ${scene.id}: generating audio (attempt ${attempt}/${retries})...`);

      // "af_nova" is Kokoro's American Female "Nova" voice, the closest
      // equivalent to the previous OpenAI "nova" voice.
      const chunks = splitIntoTtsChunks(scene.narration);
      // Chunks are independent TTS calls — fire them in parallel (order of
      // the REQUESTS doesn't matter, only the order they're concatenated in
      // afterward, which this preserves via .map's index-preserving results).
      //
      // Promise.allSettled, not Promise.all: with several chunk calls in
      // flight, Promise.all only attaches its own rejection handling to
      // whichever settles first — if a SECOND chunk also rejects after the
      // first rejection already resolved the Promise.all, that second
      // rejection has no handler left anywhere and crashes the whole Node
      // process with an unhandled rejection (a real incident: a transient
      // network blip during TTS took down every course building
      // concurrently, not just the one scene that failed). allSettled
      // attaches its own handler to EVERY promise regardless of order, so
      // this can't happen — the retry/throw behavior below is unchanged.
      const settledChunks = await Promise.allSettled(chunks.map((chunk) => generateChunkAudio(chunk)));
      const firstRejected = settledChunks.find((s) => s.status === "rejected");
      if (firstRejected) throw firstRejected.reason;
      const chunkResults = settledChunks.map((s) => s.value);
      const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
      recordAiUsage({
        kind: "tts",
        provider: "kokoro-tts",
        model: "hexgrad/kokoro-82m",
        userId: context.userId ?? null,
        courseId: context.courseId ?? null,
        lessonNumber: context.lessonNumber ?? null,
        characters: totalChars,
        estimatedTokens: estimateTokensFromChars(totalChars),
        // No costUsd passed — Kokoro's audio.speech API returns no usage/
        // cost data at all (see this function's own comment), so this
        // always falls back to the static per-character estimate.
      });

      // Raw PCM concatenates byte-for-byte with no framing/header ambiguity
      // (unlike MP3 — see generateChunkAudio's comment) — this is genuinely
      // one continuous stream of samples, not several independently-encoded
      // files stitched together. ONE WAV header wraps the whole thing so any
      // player gets one complete, self-consistent, independently-decodable
      // file with an accurate declared duration.
      const pcmBuffer = Buffer.concat(chunkResults.map((c) => c.buffer));
      const buffer = pcmToWav(pcmBuffer);
      // Computed directly from the combined PCM byte length — the same
      // source of truth the WAV header itself was built from, so the
      // reported duration and the file's actual content can never disagree.
      const durationSeconds = pcmBuffer.length / (PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * PCM_CHANNELS);
      const durationInFrames = Math.ceil(durationSeconds * FPS);

      const fileName = `${uuidv4()}.wav`;
      const audioFilePath = path.join(AUDIO_DIR, fileName);
      // ASYNC write, not writeFileSync — with every scene's audio now
      // starting concurrently (see generateAllSceneAudioPipelined below, no
      // longer gated behind a small scene-level batch), a sync write blocks
      // the ENTIRE event loop for its duration, serializing what should be
      // concurrent I/O and worsening exactly the contention this was meant
      // to avoid. The async version hands the actual write off to libuv's
      // thread pool instead of blocking Node's single JS thread.
      await fs.promises.writeFile(audioFilePath, buffer);

      // Verify the file actually landed on disk with the right size.
      // On constrained hosts (Starter, 0.5 CPU), concurrent writes can still
      // occasionally produce zero-byte or truncated files under I/O
      // contention — this catches that silently before it becomes a 404.
      const written = (await fs.promises.stat(audioFilePath)).size;
      if (written < buffer.length * 0.9) {
        await fs.promises.unlink(audioFilePath);
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

// Used to bound how many scenes could be actively generating audio at once,
// separate from TTS_CHUNK_MAX_CONCURRENT above (which bounds actual TTS API
// calls) — removed. Once a lesson's scene plan is ready, every scene now
// starts its audio immediately instead of queueing behind a small batch;
// TTS_CHUNK_MAX_CONCURRENT is still the real gate on outbound network
// concurrency to the TTS provider. This existed because fully parallel
// writeFileSync calls caused disk I/O contention on constrained hosts
// (zero-byte/truncated files) — generateSceneAudio now writes with the async
// fs.promises.writeFile instead of the blocking sync version, which was the
// actual cause of that contention (a sync write blocks the whole event loop
// for its duration; the async version hands it to libuv's thread pool), so
// removing this cap no longer reintroduces the bug it was added for.

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
function generateAllSceneAudioPipelined(scenes, onSceneAudioReady, context = {}) {
  const stageStart = Date.now();
  console.log(`  [tts] Generating ${scenes.length} audio clips, all scenes concurrent (max ${TTS_CHUNK_MAX_CONCURRENT} chunk requests concurrent)...`);

  const scenePromises = scenes.map((scene, index) =>
    generateSceneAudio(scene, 3, context).then((result) => {
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
  // Callers that pipeline scenePromises directly (buildLesson) never await
  // donePromise at all — it exists only for generateAllSceneAudio's
  // back-compat callers and its own logging side-effect above. A promise
  // nobody ever awaits or attaches a handler to is a THIRD instance of the
  // same crash this whole file just got fixed for: if even one scene's
  // audio permanently fails, this Promise.all rejects with no handler
  // anywhere, and Node kills the whole process. This no-op .catch() marks
  // donePromise as "handled" for that purpose without affecting the
  // rejection any real caller (generateAllSceneAudio) sees when THEY await
  // the same donePromise reference below.
  donePromise.catch(() => {});

  return { scenePromises, donePromise };
}

// Back-compat wrapper for callers that just want the final aggregate result
// and don't need per-scene pipelining (e.g. adController.js's ad-generation
// path, which builds one short component and has no equivalent to the
// lesson pipeline's per-scene code generation to overlap with).
async function generateAllSceneAudio(scenes, onSceneAudioReady, context = {}) {
  const { donePromise } = generateAllSceneAudioPipelined(scenes, onSceneAudioReady, context);
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
