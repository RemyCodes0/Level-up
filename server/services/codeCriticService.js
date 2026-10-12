// services/codeCriticService.js
//
// OPTIONAL second pass that asks the model to review already-validated
// lesson code for issues the deterministic AST checks in validateCode.js
// can't catch — things like a scene's visuals not actually matching its
// visualDescription, or animations that are too static/boring despite
// being syntactically and structurally correct.
//
// Runs on whichever model is configured for lesson code
// (LESSON_CODE_MODEL=glm|fable, see claudeService.js) instead of a
// separately hardcoded Claude Haiku call. NOTE: claudeService.js requires
// THIS file (for reviewGeneratedCode), so requiring claudeService.js back at
// our own top level would be circular — Node would hand us claudeService's
// module.exports mid-load, before it's populated, and everything we
// destructure from it would be undefined. Requiring it lazily INSIDE the
// function avoids that: by the time this function actually runs,
// claudeService.js has always finished loading.
//
// This is the lowest-priority, highest-cost lever of the error-reduction
// changes — it adds a real extra API call (cost + latency) per lesson, and
// only catches QUALITATIVE issues, not crash-causing bugs (those are
// already caught for free by validateCode.js's AST checks). Off by default;
// enable with ENABLE_CODE_CRITIC=true in your .env.

// How much of the code to actually show the critic. Raised from 8000 —
// at 200-300 lines/scene x 13 scenes, lessons commonly run 40k-80k+ chars,
// so the old 8000-char slice only ever showed the critic the first scene or
// two. That meant the critic could NEVER actually judge "is most of this
// lesson static" — it literally never saw most of the lesson. 24000 chars
// covers roughly the first third to half of a typical lesson, which is
// enough to catch a systemically boring/static pattern (if scenes 1-4 are
// static, scenes 5-13 usually are too — the model doesn't suddenly change
// style mid-lesson) without ballooning the cost of every single review call.
const CODE_PREVIEW_CHARS = 24000;

const CRITIC_SYSTEM_PROMPT =
  "You are reviewing AI-generated Remotion animation code for an educational video lesson. Output ONLY valid JSON, no markdown, no prose before or after it.";

function buildCriticUserContent(code, lesson) {
  return `Lesson title: "${lesson.title}".

The code has already passed syntax and structural validation — your job is ONLY to flag QUALITATIVE issues:
- Scenes that are visually static/boring (little to no movement across most of the scene, few animated elements, no particle field/background motion)
- Scenes that STOP moving partway through — an element that plays an entrance animation and then holds a fixed value for the rest of the scene, leaving a frozen frame
- REPETITION BETWEEN SCENES: two or more scenes that are essentially the same animation with different labels/colors (e.g. every scene is "shapes fade in then gently bob on a sine"). Each scene should use a visibly different motion technique — this is the difference between a lesson that holds attention and one that bores the learner
- Animations that clearly don't match what the scene is supposed to be teaching
- A lesson that leans heavily on text/labels with little to no actual diagram or moving visual illustrating the concept

Return ONLY valid JSON, no markdown, in this exact structure:
{ "ok": true } or { "ok": false, "issues": ["short description", ...] }

If the code looks reasonable, return { "ok": true }. Don't nitpick minor style choices — only flag genuine problems. Note: you are only seeing the first part of the file (it may be truncated) — judge based on what you can see; if the visible portion is clearly static/boring, that's a real, actionable signal even without seeing the rest.

CODE:
${code.slice(0, CODE_PREVIEW_CHARS)}
  `;
}

// Returns { ok: true } if the code looks fine, or { ok: false, issues: [...] }
// if the critic found something worth flagging. Never throws — a critic
// failure should never block a lesson that already passed real validation;
// it fails open (treats a broken critic call as "ok") rather than blocking
// legitimate lessons because of a critic-side bug.
async function reviewGeneratedCode(code, lesson) {
  if (process.env.ENABLE_CODE_CRITIC !== "true") {
    return { ok: true, skipped: true };
  }

  const { LESSON_CODE_PROVIDER, streamCodeCompletion, limitZaiCall, escapeStrayBackslashes } = require("./claudeService");

  try {
    const { text, stopReason } = await streamCodeCompletion({
      limiter: limitZaiCall,
      provider: LESSON_CODE_PROVIDER,
      systemPrompt: CRITIC_SYSTEM_PROMPT,
      userContent: buildCriticUserContent(code, lesson),
      maxOutputTokens: 500,
    });

    if (stopReason === "length") {
      console.warn(`  [critic] Response hit max_tokens, treating as skipped.`);
      return { ok: true, skipped: true };
    }

    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (pristineErr) {
      // Retry with the shared backslash repair before giving up: the critic
      // quotes generated code back at us, and a stray `\int`/`\n` in a JSON
      // string is an invalid escape that would otherwise skip the review.
      try {
        parsed = JSON.parse(escapeStrayBackslashes(clean));
      } catch {
        // The critic's OWN output was malformed — this is a critic bug, not a
        // code-quality signal. Log it distinctly from a real "ok: true" result
        // so you can actually tell, from the logs, whether the critic is
        // silently failing at scale vs genuinely approving lessons.
        console.warn(`  [critic] Response wasn't valid JSON, treating as skipped: ${pristineErr.message}. Raw response: ${text.slice(0, 200)}`);
        return { ok: true, skipped: true, parseFailed: true };
      }
    }

    // Basic shape validation — if the model returned valid JSON but not in
    // the expected shape (e.g. missing "ok" entirely), treat it the same
    // way: log distinctly, fail open.
    if (typeof parsed.ok !== "boolean") {
      console.warn(`  [critic] Response was valid JSON but missing/invalid "ok" field, treating as skipped. Raw: ${clean.slice(0, 200)}`);
      return { ok: true, skipped: true, parseFailed: true };
    }

    if (parsed.ok === false) {
      console.warn(`  [critic] Flagged "${lesson.title}": ${(parsed.issues || []).join("; ")}`);
    } else {
      console.log(`  [critic] Approved "${lesson.title}"`);
    }

    return parsed;
  } catch (err) {
    console.warn(`  [critic] Review call failed, skipping: ${err.message}`);
    return { ok: true, skipped: true };
  }
}

module.exports = { reviewGeneratedCode };
