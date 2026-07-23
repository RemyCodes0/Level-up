const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { createLimiter } = require("../utils/concurrencyLimiter");

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
// concurrency spike than the previous "1 request per scene" baseline ever
// produced (a 140-190 word scene needs ~4-6 chunks; 5 concurrent scenes x
// 5 chunks each is ~25 simultaneous requests). That spike produced the exact
// same kind of "Connection error" failures under load that GLM's own
// concurrency limiter (GLM_SCENE_MAX_CONCURRENT) was lowered to fix — this
// is the equivalent fix for the TTS side. Raised 6 -> 8 to match
// GLM_SCENE_MAX_CONCURRENT's own measured-clean ceiling (n<=8 tested 100%
// clean, failures start at n=10-12) as the best available evidence, since
// this limiter — unlike the scene-level BATCH_SIZE in generateAllSceneAudio
// below — is the ACTUAL throughput ceiling on audio generation (every active
// scene's chunks compete for this same global pool, regardless of how many
// scenes are "active" at once). Not independently load-tested at 8 the way
// GLM's ceiling was; watch for "Connection error" TTS failures after this
// change and drop back to 6 if they reappear.
const TTS_CHUNK_MAX_CONCURRENT = Number(process.env.TTS_CHUNK_MAX_CONCURRENT) || 8;
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
//
// Requests RAW PCM, not MP3. MP3 chunks each carry their own internal
// metadata (e.g. a Xing/VBR header describing THAT chunk's own frame count),
// and naively Buffer.concat-ing several independently-encoded MP3s produces
// a file where duration-estimating decoders (measured directly: this
// project's own re-parse of a concatenated file) read only the FIRST
// chunk's own declared length and ignore the rest — even though the actual
// audio bytes for every chunk are all still physically present in the file.
// That silently truncated PLAYBACK (not just measurement) for any narration
// needing more than one chunk, which is exactly what caused narration to go
// quiet mid-sentence while a scene's video kept running for its full
// (correctly-computed) duration. Raw PCM has no such per-chunk
// framing at all — chunks concatenate byte-for-byte with zero ambiguity —
// so this crosses that entire failure class off, not just patches around it.
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
// files) at once — separate from TTS_CHUNK_MAX_CONCURRENT above, which
// bounds actual TTS API calls. This one exists because fully parallel
// writeFileSync calls across 13+ scenes cause I/O contention on constrained
// hosts (truncated/zero-byte files). A real rolling semaphore, NOT a
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
  console.log(`  [tts] Generating ${scenes.length} audio clips (max ${SCENE_AUDIO_MAX_CONCURRENT} scenes concurrent, max ${TTS_CHUNK_MAX_CONCURRENT} chunk requests concurrent)...`);

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