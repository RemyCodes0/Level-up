// Runs scene-plan generation on SCENE_PLAN_PROVIDER (GPT-5.6 Luna, see
// claudeService.js) — a deliberate, separate model choice from whichever
// model LESSON_CODE_MODEL selects for the actual animation CODE, since this
// is lighter structured JSON generation (scene timing, narration text,
// visual descriptions), not code. No circular require risk: claudeService.js
// never requires this file (only courseController.js does), so a top-level
// require here is safe.
const {
  SCENE_PLAN_PROVIDER,
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
- Each scene's narration should take 15-35 seconds to speak naturally.
- The visualDescription MUST match what the narration is talking about at that exact moment.
- Cover the lesson's title, description, and all key points across the scenes.
- The first scene is an intro, the last scene is a summary.
- All content specific to the topic, never generic.
- IMPORTANT: Output strictly valid JSON. No trailing commas. Escape any double quotes inside strings. No text before or after the JSON.
  `;
}

// Generates a scene-by-scene plan for ONE lesson.
// Each scene has: narration text (for TTS) + a visual description (for the animation).
async function generateScenePlan(lesson, maxAttempts = 3) {
  let lastError = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { text, stopReason } = await streamCodeCompletion({
        limiter: limitLessonHeaderCall,
        // GPT-5.6 Luna, reasoning off — see SCENE_PLAN_PROVIDER's
        // definition in claudeService.js.
        provider: SCENE_PLAN_PROVIDER,
        systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
        userContent: buildScenePlanUserContent(lesson),
        // 40000 is generous headroom for a plain JSON scenes array (no
        // reasoning tax to eat into it, reasoning is off) — plenty of margin
        // over what 8-14 scenes of narration/visualDescription actually need.
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

      const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `  [scenes] Generated ${parsed.scenes.length} scenes — took ${elapsedSec}s`
      );
      return parsed.scenes;
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) {
        throw new Error(`Scene plan generation failed with a non-retryable error (check ${SCENE_PLAN_PROVIDER.keyEnv}): ${describeError(err)}`);
      }
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
