// Runs scene-plan generation on whichever model is configured for lesson
// code (LESSON_CODE_MODEL=glm|deepseek|fable, see claudeService.js) instead
// of a separately hardcoded Claude Haiku call — one provider choice, reused
// here since this is structured JSON generation (scene timing, narration
// text, visual descriptions), a lighter task than the animation CODE itself.
// No circular require risk: claudeService.js never requires this file (only
// courseController.js does), so a top-level require here is safe.
const {
  LESSON_CODE_PROVIDER,
  HEADER_PROVIDER,
  streamCodeCompletion,
  limitLessonHeaderCall,
  describeError,
  isNonRetryable,
  backoffDelay,
} = require("./claudeService");

// Safely extracts and parses a JSON object from a model response that may
// contain stray text, markdown fences, or minor formatting issues.
function safeParseJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();

  // Grab everything from the first { to the last } — drops any stray prose
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    clean = clean.slice(first, last + 1);
  }

  // Remove trailing commas before } or ] which break JSON.parse
  clean = clean.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(clean);
}

const SCENE_PLAN_SYSTEM_PROMPT =
  "You are an expert educational video director. Output ONLY valid JSON, no markdown, no prose before or after it.";

function buildScenePlanUserContent(lesson) {
  return `
Break this lesson into a sequence of short scenes. Each scene pairs a piece of spoken narration with a specific visual that illustrates exactly what is being said at that moment.

LESSON:
Title: ${lesson.title}
Description: ${lesson.description}
Key Points: ${JSON.stringify(lesson.keyPoints)}
Lesson Number: ${lesson.lessonNumber}

Return ONLY valid JSON, no markdown, exactly this structure:
{
  "scenes": [
    {
      "id": 1,
      "narration": "string — the exact words spoken during this scene. One or two sentences. Natural spoken language for text-to-speech, no markdown, no lists.",
      "visualType": "one of: intro | concept | diagram | steps | comparison | example | summary",
      "visualDescription": "string — precisely what should be on screen DURING this narration. Describe specific shapes, text, labels, colors, and motion. Be concrete.",
      "onScreenText": "string — the short headline to display for this scene (max 8 words)"
    }
  ]
}

Rules:
- Create between 8 and 14 scenes for a roughly 5-minute lesson.
- EVERY scene's narration — not just some of them — must be 15-35 seconds to speak naturally, which is roughly 40-90 words. This applies EQUALLY to the intro, the summary, and every scene in between: none of them are exceptions.
- A narration that just reads out the onScreenText/title (a short label or phrase) is WRONG for every scene, including the first and last — narration is always a full 1-2 SENTENCES of substantive spoken explanation, never a restated headline.
- The visualDescription MUST match what the narration is talking about at that exact moment.
- Cover the lesson's title, description, and all key points across the scenes.
- The first scene is an intro, the last scene is a summary — both still need full 40-90 word narration, exactly like every other scene.
- All content specific to the topic, never generic.
- IMPORTANT: Output strictly valid JSON. No trailing commas. Escape any double quotes inside strings. No text before or after the JSON.
  `;
}

// A scene whose narration is this short (word count) reads as a restated
// title/label, not the "15-35 seconds, 1-2 sentences" of real spoken
// explanation every scene is supposed to have — e.g. "Unzipping the Code:
// Initiation and Enzymes" is ~6 words and would only run ~2-3s of audio,
// nowhere near the 15s floor. Set comfortably below what even a terse-but-
// legitimate 15s scene needs (~40 words at natural speaking pace), so this
// only catches scenes that are actually just a title in disguise.
const MIN_NARRATION_WORDS = 25;

// Mechanical check, not a judgment call: catches the exact failure mode a
// real run produced — about half a lesson's scenes coming back with
// title-length narration despite the prompt asking for 15-35s on every
// scene, dragging the whole lesson's runtime down to a fraction of its
// target (a 10-scene lesson landed at ~114s instead of ~250-300s). Rejects
// the WHOLE plan (not just the short scenes) so the retry gets a fresh,
// hopefully-consistent generation rather than trying to patch individual
// scenes in isolation.
function findShortNarrationScenes(scenes) {
  return scenes
    .map((s, i) => ({ index: i, words: (s.narration || "").trim().split(/\s+/).filter(Boolean).length }))
    .filter((s) => s.words < MIN_NARRATION_WORDS);
}

// Generates a scene-by-scene plan for ONE lesson.
// Each scene has: narration text (for TTS) + a visual description (for the animation).
async function generateScenePlan(lesson, maxAttempts = 3) {
  let lastError = null;
  let contentFeedback = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const userContent =
        buildScenePlanUserContent(lesson) +
        (contentFeedback
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate the full scene list from scratch and make absolutely sure every single scene has full 15-35 second narration this time.`
          : "");

      const { text, stopReason } = await streamCodeCompletion({
        limiter: limitLessonHeaderCall,
        // "high"-reasoning variant — this is ONE call per lesson (not per
        // scene), so the extra reasoning cost is cheap here even though it's
        // deliberately kept off for the fast, parallel per-scene code calls.
        provider: HEADER_PROVIDER,
        systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
        userContent,
        // Bumped from 8000: reasoning tokens now draw from this SAME budget
        // (HEADER_PROVIDER runs "high" reasoning), capped at
        // min(maxOutputTokens * 0.8, 32000) — at 8000 that left almost
        // nothing for the actual scenes JSON. At 40000, reasoning caps at
        // 32000, leaving ~8000 for the JSON — back to the original
        // no-reasoning budget instead of being silently squeezed out.
        maxOutputTokens: 40000,
      });

      if (stopReason === "length") {
        throw new Error("Hit max_tokens — scene plan was truncated.");
      }

      const parsed = safeParseJson(text);

      if (
        !parsed.scenes ||
        !Array.isArray(parsed.scenes) ||
        parsed.scenes.length === 0
      ) {
        throw new Error("Scene plan returned no scenes");
      }

      const shortScenes = findShortNarrationScenes(parsed.scenes);
      if (shortScenes.length > 0) {
        const detail = shortScenes
          .map((s) => `scene ${s.index + 1} ("${parsed.scenes[s.index].onScreenText}") has only ${s.words} words`)
          .join("; ");
        throw new Error(
          `${shortScenes.length}/${parsed.scenes.length} scene(s) have title-length narration instead of the required 15-35s (~40-90 words): ${detail}`
        );
      }

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `  [scenes] Generated ${parsed.scenes.length} scenes — took ${elapsedSec}s`
      );
      return parsed.scenes;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Scene plan generation failed with a non-retryable error (check ${LESSON_CODE_PROVIDER.keyEnv}): ${describeError(err)}`);
      }
      contentFeedback = err.message;
      console.warn(
        `  [scenes] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`
      );
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate a valid scene plan after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

module.exports = { generateScenePlan };
