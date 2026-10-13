const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");
const { createLimiter } = require("../utils/concurrencyLimiter");
const { recordAiUsage } = require("./aiUsageService");
const { estimateTokensFromChars, estimateGeminiAudioTokens } = require("../config/modelPricing");

// Kokoro's raw PCM output format via this OpenRouter hosting — measured
// directly: a 13-word sentence produced a PCM buffer whose length implies
// 4.67s at 24kHz/16-bit/mono, matching the ~150-165wpm natural speaking rate
// for that word count; a second check against the SAME text's MP3-reported
// duration (5.952s) came within 0.05s of the PCM-implied duration (5.900s)
// for a longer sentence — confirming this format.
//
// Gemini TTS (the TTS_MODEL=gemini option — see TTS_PROVIDERS above) is
// assumed to use this SAME 24kHz/16-bit/mono format, NOT independently
// measured the way Kokoro's was above. That assumption rests on convergent
// but secondary evidence: Google's own Gemini-API speech-generation docs'
// example code writes native TTS output as 24kHz/16-bit/mono, and the
// audio/L16;codec=pcm;rate=24000 MIME type Gemini's API itself returns names
// that exact rate — but neither was checked against THIS specific model via
// THIS specific OpenRouter hosting the way Kokoro's figures above were. If
// Gemini-generated narration ever sounds pitch-shifted or runs at the wrong
// speed, this mismatched assumption — not the chunking/concatenation logic
// below — is the first thing to re-measure.
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
// flight at once — not per-scene, not per-course, not per-user. Every scene
// of every lesson fires its chunk requests immediately and concurrently (see
// generateAllSceneAudioPipelined below), and every lesson of a course builds
// concurrently too (buildLessonsConcurrently in courseController.js).
//
// REVERTED: briefly raised 8 → 24 on the theory that a bigger pool would cut
// queue time. Wrong call, confirmed by real-world regression — generation
// got slower, not faster, after the change. The likely mechanism: unlike
// the general-purpose LLM endpoints the other limiters guard (GLM, DeepSeek,
// Gemini — all large multi-tenant services), Kokoro here is ONE small,
// single-purpose TTS model hosting on OpenRouter, almost certainly backed by
// far fewer replicas. 24 concurrent requests against that likely exceeded
// its real serving capacity — not a queueing problem but an overload one —
// and generateSceneAudio retries a FAILED chunk by redoing the WHOLE SCENE
// with 2s/4s/6s backoff, so a wave of timeouts/connection errors at 24-wide
// concurrency compounds into exactly the "way slower than before" the user
// reported, not the speedup the higher number was supposed to buy.
// Back to 8, the value this was actually fast at. The queue/call timing log
// below is left in (it's additive, changes nothing about behavior) — if this
// still needs tuning, that log is what to look at before changing the
// number again, not another guess.
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

// ═══════════════════════════════════════════════════════════════════════════
// TTS PROVIDER
// ═══════════════════════════════════════════════════════════════════════════
// Same resolveProvider(envVar, defaultKey) convention claudeService.js uses
// for LESSON_CODE_MODEL/QUIZ_MODEL — a validated allowlist, not a bare
// `process.env.TTS_MODEL` string, so a typo falls back to the default
// instead of hitting OpenRouter with a model id that doesn't exist.
//
// Default stays "kokoro" — NOT a decision to make silently. Per-second math
// (see modelPricing.js's GEMINI_TTS_AUDIO_TOKENS_PER_SECOND, verified live
// against OpenRouter's own pricing API): a typical ~3-minute lesson costs
// Kokoro a fraction of a cent (input-text-only billing, $0 for output audio)
// versus roughly $0.03 for Gemini (billed for the AUDIO it generates too,
// ~25 tokens/sec of output at $6/M) — on the order of 50-60x more expensive
// per course for this swap, not a rounding difference. Gemini's real
// upside is quality/naturalness (and a documented "instructions" param for
// delivery tone this integration doesn't use yet) — set TTS_MODEL=gemini to
// actually spend that tradeoff; nothing here makes it project-wide.
const TTS_PROVIDERS = {
  kokoro: {
    model: "hexgrad/kokoro-82m",
    voice: "af_nova", // Kokoro's American Female "Nova" — closest equivalent to the old OpenAI "nova" voice.
    // true/false, not omitted: generateChunkAudio reads this to decide
    // whether to send `speed` at all (see its own comment on why Gemini
    // omits it rather than risk a 400 on an unconfirmed parameter).
    supportsSpeed: true,
  },
  gemini: {
    model: "google/gemini-3.8-flash-lite-tts",
    // "Kore" — one of the two voice names OpenRouter's own TTS docs show in
    // a working example for this model family; no full voice list is
    // published, so this is a known-good pick, not an exhaustive one.
    voice: "Kore",
    supportsSpeed: false,
  },
};
const TTS_MODEL_KEY = TTS_PROVIDERS[process.env.TTS_MODEL] ? process.env.TTS_MODEL : "kokoro";
const TTS_PROVIDER = TTS_PROVIDERS[TTS_MODEL_KEY];
console.log(`[tts] voice provider → ${TTS_PROVIDER.model} (set TTS_MODEL=kokoro | gemini to switch)`);

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
// ── Strip LaTeX before it reaches the voice ─────────────────────────────────
// Scene plans now carry real LaTeX in visualDescription/mechanism so the code
// generator can typeset it (see sceneService.js + the Tex component), and the
// plan prompt tells the model to keep `narration` plain spoken English. It does
// not always comply, and when LaTeX leaks into narration the TTS voice reads it
// out literally — "dollar x", "backslash frac" — which is exactly as confusing
// as it sounds.
//
// Prompt wording alone can't guarantee this, so narration is sanitised here,
// at the one place where text becomes speech. Deterministic, applies to every
// scene, and independent of which model wrote the plan.
//
// Goal is SPEAKABLE, not mathematically complete: turn the common notation into
// the words a teacher would actually say, then drop any leftover markup rather
// than voicing it.
const SPOKEN_MATH = [
  // delimiters first — $x$, $$x$$, \(x\), \[x\]
  [/\$\$?/g, " "],
  [/\\[()[\]]/g, " "],
  // common commands → the words a person says
  [/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, " $1 over $2 "],
  [/\\d?frac\b/g, " over "],
  [/\\sqrt\s*\{([^{}]*)\}/g, " the square root of $1 "],
  [/\\sqrt\b/g, " square root "],
  [/\\int(?:_\{?([^{}\s^]+)\}?)?(?:\^\{?([^{}\s]+)\}?)?/g, (_m, a, b) =>
    a && b ? ` the integral from ${a} to ${b} of ` : " the integral of "],
  [/\\sum(?:_\{?([^{}\s^]+)\}?)?(?:\^\{?([^{}\s]+)\}?)?/g, (_m, a, b) =>
    a && b ? ` the sum from ${a} to ${b} of ` : " the sum of "],
  [/\\lim(?:_\{?([^{}]+)\}?)?/g, " the limit "],
  [/\\(?:left|right|,|;|:|!|quad|qquad|displaystyle|text|mathrm|mathbf)\b/g, " "],
  [/\\to\b/g, " approaches "],
  [/\\times\b/g, " times "],
  [/\\cdot\b/g, " times "],
  [/\\div\b/g, " divided by "],
  [/\\pm\b/g, " plus or minus "],
  [/\\leq\b|\\le\b/g, " less than or equal to "],
  [/\\geq\b|\\ge\b/g, " greater than or equal to "],
  [/\\neq\b|\\ne\b/g, " not equal to "],
  [/\\approx\b/g, " approximately "],
  [/\\infty\b/g, " infinity "],
  [/\\partial\b/g, " partial "],
  // Greek letters keep their names, which is what a teacher says anyway
  [/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega|Delta|Sigma|Omega|Phi|Theta)\b/gi, " $1 "],
  // exponents / subscripts
  [/\^\s*\{?2\}?/g, " squared"],
  [/\^\s*\{?3\}?/g, " cubed"],
  [/\^\s*\{?([^{}\s]+)\}?/g, " to the power of $1"],
  [/_\s*\{?([^{}\s]+)\}?/g, " sub $1"],
  // anything still wearing markup: drop the markup, keep the words
  [/\\[a-zA-Z]+/g, " "],
  [/[{}\\]/g, " "],
];

function stripLatexForSpeech(text) {
  if (!text || (!text.includes("\\") && !text.includes("$") && !/[\^_]/.test(text))) return text;
  let out = text;
  for (const [re, rep] of SPOKEN_MATH) out = out.replace(re, rep);
  // Collapse the whitespace all those substitutions introduce, and tidy the
  // spacing around punctuation so the voice doesn't pause oddly.
  out = out.replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  if (out !== text) {
    console.log(`  [tts] stripped LaTeX from narration for speech: ${JSON.stringify(text.slice(0, 70))} -> ${JSON.stringify(out.slice(0, 70))}`);
  }
  return out;
}

// Not every "." ends a sentence. The sentence split below treats one as a
// boundary unconditionally, which mangles decimals: "the speed is 5.4 metres"
// became the two "sentences" "the speed is 5." and "4 metres", and they were
// then rejoined WITH A SPACE ("5. 4") — so the voice read "five", stopped with
// full falling end-of-sentence intonation, and started again on "four". Real,
// reported, and it happened on every decimal, not only at chunk boundaries.
//
// So the non-sentence dots are swapped for a sentinel before splitting and
// restored afterwards. The sentinel contains no whitespace and no "."/"!"/"?",
// so it survives both the sentence regex and the word-level splitting intact.
const DOT_SENTINEL = "\u0000dot\u0000";
const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs.", "approx.", "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "St.", "No."];

function protectNonSentenceDots(text) {
  let out = text.replace(/(\d)\.(?=\d)/g, `$1${DOT_SENTINEL}`); // 5.4, 3.14159, 1.2.3
  for (const abbr of ABBREVIATIONS) {
    out = out.split(abbr).join(abbr.replace(/\./g, DOT_SENTINEL));
    const lower = abbr.toLowerCase();
    if (lower !== abbr) out = out.split(lower).join(lower.replace(/\./g, DOT_SENTINEL));
  }
  return out;
}

const restoreDots = (text) => text.split(DOT_SENTINEL).join(".");

function splitIntoTtsChunks(rawText, maxChars = TTS_CHUNK_MAX_CHARS) {
  const text = protectNonSentenceDots(rawText);
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

  // Put the real dots back before any of this reaches the TTS engine — a
  // sentinel that leaked through would be voiced as garbage.
  return chunks.map(restoreDots);
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
  // Queue time (waiting for a free slot on the pool above) vs. call time
  // (the provider actually responding) are reported separately, same split
  // as claudeService.js's generateJson — a slow course could be either "the
  // pool's too small" or "the provider's slow today," and only one of those
  // is this file's problem to fix. Logged only past a visible threshold so a
  // normal, fast chunk doesn't spam the log at the volume this fires.
  const queuedAt = Date.now();
  return limitTtsChunkCall(async () => {
    const startedAt = Date.now();
    const request = {
      model: TTS_PROVIDER.model,
      voice: TTS_PROVIDER.voice,
      input: chunkText,
      response_format: "pcm", // required either way — see the concatenation comment below
    };
    // `speed` is only sent when the active provider's support is confirmed.
    // OpenRouter's own TTS docs are explicit that they don't know whether
    // Gemini honors it, and that other providers can 400 on a non-default
    // value — sending 1.0 (the default) happens to be harmless either way
    // today, but omitting it for an unconfirmed provider is the version of
    // this that doesn't quietly break the day Gemini's behavior here does
    // turn out to differ.
    if (TTS_PROVIDER.supportsSpeed) request.speed = 1.0;
    const response = await openai.audio.speech.create(request);
    const buffer = Buffer.from(await response.arrayBuffer());
    const queuedMs = startedAt - queuedAt;
    const callMs = Date.now() - startedAt;
    if (queuedMs > 2000 || callMs > 8000) {
      console.log(
        `  [tts] chunk (${chunkText.length} chars): ${(callMs / 1000).toFixed(1)}s call` +
          (queuedMs > 2000 ? ` + ${(queuedMs / 1000).toFixed(1)}s queued` : "")
      );
    }
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

      const chunks = splitIntoTtsChunks(stripLatexForSpeech(scene.narration));
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
      const promptTokens = estimateTokensFromChars(totalChars);
      // Kokoro is billed $0 for output audio (see modelPricing.js), so
      // completionTokens staying 0 for it is a correct reflection of real
      // billing, not a gap. Gemini genuinely isn't free on output — it
      // tokenizes the audio it generates and bills for it — so its
      // completionTokens has to come from the actual clip length or its
      // real cost silently reports as $0 for the expensive half of the
      // call. Summed from each CHUNK's own durationSeconds (generateChunkAudio
      // computes that from raw PCM byte length, same source of truth the
      // final scene duration below uses) rather than waiting for the
      // concatenated buffer, which isn't built until after this call.
      const completionTokens =
        TTS_PROVIDER === TTS_PROVIDERS.gemini
          ? estimateGeminiAudioTokens(chunkResults.reduce((sum, c) => sum + c.durationSeconds, 0))
          : 0;
      recordAiUsage({
        kind: "tts",
        provider: TTS_MODEL_KEY === "gemini" ? "gemini-tts" : "kokoro-tts",
        model: TTS_PROVIDER.model,
        userId: context.userId ?? null,
        courseId: context.courseId ?? null,
        lessonNumber: context.lessonNumber ?? null,
        characters: totalChars,
        estimatedTokens: promptTokens,
        promptTokens,
        completionTokens,
        // No costUsd passed for either provider — neither TTS endpoint
        // returns real usage/cost data in its response (it's raw audio
        // bytes, not JSON), so this always falls back to the static
        // modelPricing.js estimate computed from promptTokens/
        // completionTokens above — $0 output for Kokoro (correctly, that's
        // how it's billed), real $/M-token output for Gemini.
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
