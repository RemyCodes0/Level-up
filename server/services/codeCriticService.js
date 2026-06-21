// services/codeCriticService.js
//
// OPTIONAL second pass that asks Haiku to review already-validated lesson
// code for issues the deterministic AST checks in validateCode.js can't
// catch — things like a scene's visuals not actually matching its
// visualDescription, or animations that are too static/boring despite
// being syntactically and structurally correct.
//
// This is the lowest-priority, highest-cost lever of the error-reduction
// changes — it adds a real extra API call (cost + latency) per lesson, and
// only catches QUALITATIVE issues, not crash-causing bugs (those are
// already caught for free by validateCode.js's AST checks). Off by default;
// enable with ENABLE_CODE_CRITIC=true in your .env.

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Returns { ok: true } if the code looks fine, or { ok: false, issues: [...] }
// if the critic found something worth flagging. Never throws — a critic
// failure should never block a lesson that already passed real validation.
async function reviewGeneratedCode(code, lesson) {
  if (process.env.ENABLE_CODE_CRITIC !== "true") {
    return { ok: true, skipped: true };
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are reviewing AI-generated Remotion animation code for an educational video lesson titled "${lesson.title}".

The code has already passed syntax and structural validation — your job is ONLY to flag QUALITATIVE issues:
- Scenes that are visually static/boring (little to no movement across most of the scene)
- Animations that clearly don't match what the scene is supposed to be teaching

Return ONLY valid JSON, no markdown, in this exact structure:
{ "ok": true } or { "ok": false, "issues": ["short description", ...] }

If the code looks reasonable, return { "ok": true }. Don't nitpick minor style choices — only flag genuine problems.

CODE:
${code.slice(0, 8000)}
          `,
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.warn(`  [critic] Review failed, skipping: ${err.message}`);
    return { ok: true, skipped: true };
  }
}

module.exports = { reviewGeneratedCode };