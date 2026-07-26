// Runs scene-plan generation on SCENE_PLAN_PROVIDER (GLM 5.2, reasoning
// off, via Z.ai's own API directly — see claudeService.js) — a deliberate,
// separate model choice from whichever model LESSON_CODE_MODEL selects for
// the actual animation CODE, since this is lighter structured JSON
// generation (scene timing, narration text, visual descriptions), not code.
// No circular require risk: claudeService.js never requires this file (only
// courseController.js does), so a top-level require here is safe.
const {
  SCENE_PLAN_PROVIDER,
  streamCodeCompletion,
  limitZaiCall,
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
      "mechanism": {
        "before": "string — the exact visual state at the START of this scene, stated as something concretely drawable (e.g. 'twelve unsorted bars of visibly different heights in a row')",
        "after": "string — the exact visual state at the END of this scene (e.g. 'the same twelve bars in ascending height order, each snapping into place')",
        "driver": "string — the single visible action/process that transforms before into after, the thing the viewer literally watches happen (e.g. 'adjacent bars compare (both flash) and swap positions one pair at a time, largest bubbling right')"
      },
      "visualDescription": "string — the full staging of the mechanism above: the cast of specific elements (shapes, values, labels), their rough spatial arrangement, the color/emphasis logic, and how the driver plays out across the scene's timeline. Every specific thing you name must be something that actually moves or changes during the scene — a list of static shapes/labels with no transformation is NOT acceptable, even if it's detailed.",
      "onScreenText": "string — the short headline to display for this scene (max 8 words)"
    }
  ]
}

Rules:
- Create between 8 and 14 scenes for a roughly 5-minute lesson.
- Each scene's narration should take 15-35 seconds to speak naturally — roughly 40-90 words at this project's TTS voice's real speaking pace (~150-165 words/minute). EVERY scene needs this, including the intro and the summary — a narration that's just a restated headline (a handful of words) is too short and gets cut off mid-thought when the scene switches, regardless of how it feels while writing it.
- THE MECHANISM FIELD IS THE CONTRACT: before/after must describe two visibly DIFFERENT states (if they're the same picture, the scene is a slide, not an animation — rewrite it), and the driver must be an action a viewer can watch, not a conclusion ("the sorted order emerges" is a conclusion; "pairs compare and swap one at a time" is a watchable action). The code generator builds EXACTLY what this field says, so vagueness here becomes a boring scene downstream.
- The visualDescription MUST match what the narration is talking about at that exact moment, and MUST stage the mechanism — never contradict or ignore it.
- AVOID "THE STATIC LEGEND" — a diagram that just names/labels things with a checkmark or caption next to each, where nothing ever actually moves or transforms, is a slide, not an animation, no matter how many shapes/colors/labels it lists. If the concept is a process (an algorithm, a comparison, a growth, a flow), the visualDescription must describe that process actually happening on screen — not its conclusion stated in text.
- Even intro/summary scenes get a real mechanism: an intro can build the lesson's central object piece by piece; a summary can replay the key transformation compressed — never "title floats over background".
- Cover the lesson's title, description, and all key points across the scenes.
- The first scene is an intro, the last scene is a summary.
- All content specific to the topic, never generic.
- IMPORTANT: Output strictly valid JSON. No trailing commas. Escape any double quotes inside strings. No text before or after the JSON.
  `;
}

// A scene whose narration is this short (word count) reads as a restated
// title/label rather than the real spoken explanation every scene needs —
// the exact bug that made lessons feel like the narrator gets cut off
// mid-sentence when a scene switches to the next one (that scene's video
// duration is derived directly from its OWN measured audio length, so a
// too-short narration means a too-short scene, not a sync bug).
//
// Calibrated to this project's TTS voice AT THE TIME (Kokoro/af_nova via
// OpenRouter, chunked to work around a per-call truncation bug), measured
// directly: 22-36 word inputs played fully at a natural ~150-165 words/
// minute. 15 seconds at that rate needs ~38-41 words; this floor sits just
// under that so a legitimately terse-but-complete scene isn't rejected,
// while still catching anything that's really just a title in disguise.
// (NOT the ~330wpm figure from an earlier, mistaken measurement — that
// number came from measuring TTS audio that was being silently truncated by
// a since-fixed Kokoro bug, not the model's real speaking rate.)
// ttsService.js has since moved back to OpenAI's tts-1/"nova" directly (no
// more chunking — tts-1 has no per-call truncation limit) — this floor's
// wpm basis hasn't been re-measured against that voice's actual speaking
// rate, so treat it as a reasonable carryover estimate, not a verified one.
const MIN_NARRATION_WORDS = 40;

// Mechanical check, not a judgment call — see the comment above
// MIN_NARRATION_WORDS. Rejects the WHOLE plan (not just the short scenes)
// so the retry gets a fresh, hopefully-consistent generation rather than
// trying to patch individual scenes in isolation.
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
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate the full scene list from scratch and make absolutely sure this specific problem does not occur again — every scene needs at least 40 words of narration AND a real mechanism whose before/after states visibly differ.`
          : "");

      const { text, stopReason } = await streamCodeCompletion({
        // Z.ai's own 10-concurrent-request account cap, not the OpenRouter
        // header-call pool — this call goes straight to Z.ai.
        limiter: limitZaiCall,
        // GLM 5.2, reasoning off, via Z.ai directly — see
        // SCENE_PLAN_PROVIDER's definition in claudeService.js.
        provider: SCENE_PLAN_PROVIDER,
        systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
        userContent,
        // 40000 is generous headroom for a plain JSON scenes array — plenty
        // of margin over what 8-14 scenes of narration/visualDescription
        // actually need.
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
          `${shortScenes.length}/${parsed.scenes.length} scene(s) have under-length narration — need at least 40 words each: ${detail}`
        );
      }

      // Mechanism sanity: a degenerate mechanism (missing, or before === after,
      // meaning nothing visibly changes) is the plan-level root of every
      // static-slide scene downstream — reject the whole plan so the retry's
      // corrective feedback names exactly which scenes were degenerate.
      // Tolerant of formatting (whitespace/case) but not of absence.
      const degenerate = parsed.scenes
        .map((s, i) => {
          const m = s.mechanism;
          if (!m || typeof m !== "object" || !m.before || !m.after || !m.driver) {
            return { index: i, reason: "missing mechanism.before/after/driver" };
          }
          const norm = (str) => String(str).trim().toLowerCase();
          if (norm(m.before) === norm(m.after)) {
            return { index: i, reason: "mechanism.before and mechanism.after describe the same state — nothing visibly changes" };
          }
          return null;
        })
        .filter(Boolean);
      if (degenerate.length > 0) {
        const detail = degenerate
          .map((d) => `scene ${d.index + 1} ("${parsed.scenes[d.index].onScreenText}"): ${d.reason}`)
          .join("; ");
        throw new Error(
          `${degenerate.length}/${parsed.scenes.length} scene(s) have a degenerate mechanism: ${detail}`
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
        throw new Error(`Scene plan generation failed with a non-retryable error (check ${SCENE_PLAN_PROVIDER.keyEnv}): ${describeError(err)}`);
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
