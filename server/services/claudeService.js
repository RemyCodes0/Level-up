// const Anthropic = require("@anthropic-ai/sdk");
// const OpenAI = require("openai");
// const { validateGeneratedCode } = require("./validateCode");
// const { reviewGeneratedCode } = require("./codeCriticService");

// const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// // GLM-5.2 client for lesson code generation — OpenAI-compatible
// const glmClient = new OpenAI({
//   apiKey: process.env.ZAI_API_KEY,
//   baseURL: "https://api.z.ai/api/paas/v4/",
//   timeout: 300 * 1000, // 5 minute timeout — if GLM takes longer, fail fast and retry
//   maxRetries: 0,       // handle retries manually
// });

// // DeepSeek client for lesson code generation — also OpenAI-compatible, so the
// // same SDK works with just a different baseURL/key. DeepSeek V4 Pro
// // (deepseek-v4-pro) is strong at math/reasoning-heavy generation.
// const deepseekClient = new OpenAI({
//   apiKey: process.env.DEEPSEEK_API_KEY,
//   baseURL: "https://api.deepseek.com",
//   timeout: 300 * 1000,
//   maxRetries: 0,
// });

// // ── Code-gen provider switch (A/B without touching code) ─────────────────────
// // Set CODE_MODEL=deepseek to route lesson code generation through DeepSeek
// // V4 Pro; anything else (or unset) keeps the existing GLM-5.2 path. This lets
// // you flip providers per-deploy and revert instantly if quality/latency/cost
// // regress. Each entry bundles everything that differs between providers so the
// // generation code below stays provider-agnostic.
// const CODE_PROVIDERS = {
//   glm: {
//     client: glmClient,
//     model: "glm-5.2",
//     // GLM-specific request extras. thinking disabled = faster, cheaper; the
//     // long crash-safety prompt does the heavy lifting, not model reasoning.
//     extraParams: { thinking: { type: "disabled" } },
//     keyEnv: "ZAI_API_KEY",
//   },
//   deepseek: {
//     client: deepseekClient,
//     model: "deepseek-v4-pro",
//     // DeepSeek V4 Pro tuning for RICH, creative animation code:
//     //  - temperature 1.0 / top_p 1.0 = DeepSeek's own recommended settings for
//     //    V4 Pro, and the key lever for variety/ambition. Low temperature (its
//     //    code default) produces safe, repetitive, BASIC scenes — exactly the
//     //    failure we're fixing. The autofix/validate/critic/retry net catches any
//     //    crash-safety slips this introduces, so we can afford the creativity.
//     //  - reasoning_effort "high" = use DeepSeek's core strength (chain-of-thought)
//     //    to DESIGN each scene before coding it (the prompt's HOW TO WORK block
//     //    directs that reasoning at richness). "high" is DeepSeek's default depth;
//     //    bump to "max" for even more planning at higher latency/cost.
//     extraParams: {
//       reasoning_effort: "high",
//       thinking: { type: "enabled" },
//       temperature: 1.0,
//       top_p: 1.0,
//     },
//     keyEnv: "DEEPSEEK_API_KEY",
//   },
// };

// const CODE_PROVIDER = CODE_PROVIDERS[process.env.CODE_MODEL === "deepseek" ? "deepseek" : "glm"];
// console.log(
//   `[codegen] Using provider: ${process.env.CODE_MODEL === "deepseek" ? "deepseek" : "glm"} ` +
//   `(model: ${CODE_PROVIDER.model}). Set CODE_MODEL=deepseek or CODE_MODEL=glm to switch.`
// );
// if (!process.env[CODE_PROVIDER.keyEnv]) {
//   console.warn(`[codegen] WARNING: ${CODE_PROVIDER.keyEnv} is not set — code generation will fail with an auth error.`);
// }

// // ── Error classification ─────────────────────────────────────────────────────
// // Two kinds of failure need different handling:
// //   - Transport errors (connection reset, rate limit, 5xx): retry as-is,
// //     the same prompt may well succeed next time.
// //   - Content errors (bad JSON, failed validation, critic rejection): the
// //     model produced wrong OUTPUT. Retrying with the identical prompt often
// //     reproduces the identical mistake — so content errors are fed back into
// //     the retry prompt (see generateLessonCode).
// //   - Non-retryable errors (401/403 auth): retrying is pure wasted time and
// //     log noise. Fail immediately.
// function contentError(message) {
//   const err = new Error(message);
//   err.isContentError = true;
//   return err;
// }

// function isNonRetryable(err) {
//   const status = err?.status ?? err?.response?.status;
//   return status === 401 || status === 403;
// }

// // ── Retry helper with exponential backoff + jitter ──────────────────────────
// // Hammering a rate-limited or momentarily-overloaded API with zero delay
// // makes correlated failures across all attempts more likely, not less.
// function sleep(ms) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

// async function backoffDelay(attempt, baseMs = 500, capMs = 8000) {
//   const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
//   const jitter = Math.random() * exp * 0.3;
//   await sleep(exp + jitter);
// }

// // ── Tiny concurrency limiter (no new dependency) ────────────────────────────
// // If multiple lessons generate code in parallel, each one calls
// // generateLessonCode independently with no awareness of the others. If the
// // GLM endpoint enforces a max-simultaneous-connections limit, firing 5-6
// // requests at once can produce instant "Connection error." failures that
// // look like network flakiness but are actually a self-inflicted concurrency
// // spike. This wraps the actual API call so no matter how many lessons are
// // kicked off concurrently by the caller, only N requests to GLM are ever
// // in flight at once — everything else queues.
// //
// // IMPORTANT: the limited function must cover the ENTIRE lifetime of the
// // request, including consuming the response stream. With streaming, the
// // create() promise resolves as soon as response headers arrive — the HTTP
// // connection then stays open for the whole (potentially minutes-long)
// // stream. If the limiter releases its slot at create()-resolution time,
// // you can end up with far more than N sockets actually open at once,
// // which defeats the entire point. generateLessonCode therefore passes the
// // full "open stream + consume every chunk" operation into limit().
// function createLimiter(maxConcurrent) {
//   let active = 0;
//   const queue = [];

//   const next = () => {
//     if (active >= maxConcurrent || queue.length === 0) return;
//     active++;
//     const { fn, resolve, reject } = queue.shift();
//     fn()
//       .then(resolve, reject)
//       .finally(() => {
//         active--;
//         next();
//       });
//   };

//   return function limit(fn) {
//     return new Promise((resolve, reject) => {
//       queue.push({ fn, resolve, reject });
//       next();
//     });
//   };
// }

// // Cap simultaneous in-flight requests to GLM. Adjust via env var if the
// // provider's actual limit turns out to be higher or lower than this default.
// // Raised default from 3 to 6 — GLM-5.2 is a sparse MoE model (~40B active of
// // 743B total params per token), which is specifically designed to handle
// // concurrent requests efficiently since serving infra (vLLM/SGLang) routes
// // experts per-request rather than one request blocking the whole model.
// // A 6-lesson course was being artificially serialized into two waves of 3;
// // this lets all 6 lessons reason + generate in parallel. If this trips rate
// // limits on Z.AI's shared endpoint, lower via the GLM_MAX_CONCURRENT env var.
// const GLM_MAX_CONCURRENT = Number(process.env.GLM_MAX_CONCURRENT) || 6;
// const limitGlmCall = createLimiter(GLM_MAX_CONCURRENT);

// // Pull the useful bits out of a connection-level failure. The OpenAI SDK
// // collapses network errors (DNS, TLS, ECONNRESET, connection refused, etc.)
// // into a generic "Connection error." message and stashes the actual cause
// // on err.cause — which the old code never logged, making these failures
// // indistinguishable from each other.
// function describeError(err) {
//   const cause = err?.cause;
//   if (!cause) return err.message;
//   const causeCode = cause.code || cause.errno || cause.name;
//   const causeMsg = cause.message || String(cause);
//   return `${err.message} [cause: ${causeCode ? `${causeCode} — ` : ""}${causeMsg}]`;
// }

// // ── Safer JSON extraction ────────────────────────────────────────────────────
// // Walks the text from a given "{" tracking bracket depth and string state,
// // so it finds the actual matching close brace for that object — immune to
// // stray braces inside string values or trailing commentary.
// //
// // Returns the balanced slice, or null if that "{" is never closed
// // (truncated response, or a prose brace with no matching close).
// function extractJsonObjectFrom(text, start) {
//   let depth = 0;
//   let inString = false;
//   let stringChar = null;
//   let escaped = false;

//   for (let i = start; i < text.length; i++) {
//     const ch = text[i];

//     if (inString) {
//       if (escaped) {
//         escaped = false;
//       } else if (ch === "\\") {
//         escaped = true;
//       } else if (ch === stringChar) {
//         inString = false;
//       }
//       continue;
//     }

//     if (ch === '"' || ch === "'") {
//       inString = true;
//       stringChar = ch;
//       continue;
//     }

//     if (ch === "{") depth++;
//     if (ch === "}") {
//       depth--;
//       if (depth === 0) {
//         return text.slice(start, i + 1);
//       }
//     }
//   }

//   return null; // Never closed
// }

// // Parsing strategy, in order of preference:
// //   1. Extract a balanced object and JSON.parse it untouched. No text-level
// //      mutation happens on output that was already valid — the old version
// //      globally stripped ``` sequences BEFORE extraction, which could corrupt
// //      backticks living inside JSON string values. Extraction starts at the
// //      first "{", so markdown fences around the object are irrelevant anyway.
// //   2. Only if the pristine parse fails, apply the trailing-comma repair and
// //      try once more.
// //   3. Only if THAT fails, advance past this "{" and try the next candidate.
// //      This recovers the case where the model prefixed the JSON with prose
// //      that itself contains braces (e.g. "Here is {your plan}: {...}") —
// //      which the old first-brace-only approach could never recover from.
// function safeParseJson(text) {
//   let searchFrom = 0;
//   let lastErr = null;

//   for (let attempts = 0; attempts < 8; attempts++) {
//     const braceAt = text.indexOf("{", searchFrom);
//     if (braceAt === -1) break;

//     const candidate = extractJsonObjectFrom(text, braceAt);
//     if (candidate === null) {
//       // This "{" never balances (prose brace or truncation) — try the next one.
//       searchFrom = braceAt + 1;
//       continue;
//     }

//     try {
//       return JSON.parse(candidate);
//     } catch (pristineErr) {
//       try {
//         // Trailing-comma cleanup, scoped to a structurally balanced object
//         // and only attempted after a clean parse already failed.
//         return JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1"));
//       } catch (repairedErr) {
//         lastErr = repairedErr;
//         searchFrom = braceAt + 1;
//       }
//     }
//   }

//   throw contentError(
//     `Could not parse a complete JSON object from model output${lastErr ? ` (last parse error: ${lastErr.message})` : ""}`
//   );
// }

// // ── Course plan shape validation ────────────────────────────────────────────
// // Parsing succeeds != the plan is usable. The prompt promises 6 lessons with
// // exactly 4 keyPoints each and 20 questions with valid option/answer shapes;
// // nothing previously checked that promise was kept before handing the plan
// // downstream to code generation, which assumes it.
// function validateCoursePlan(plan) {
//   const errors = [];

//   if (!plan || typeof plan !== "object") {
//     errors.push("Plan is not an object");
//     return { ok: false, errors };
//   }

//   if (!Array.isArray(plan.lessons) || plan.lessons.length !== 6) {
//     errors.push(`Expected 6 lessons, got ${plan.lessons?.length ?? "none"}`);
//   } else {
//     plan.lessons.forEach((lesson, i) => {
//       if (!lesson.title || typeof lesson.title !== "string") {
//         errors.push(`Lesson ${i + 1}: missing/invalid title`);
//       }
//       if (!lesson.description || typeof lesson.description !== "string") {
//         errors.push(`Lesson ${i + 1}: missing/invalid description`);
//       }
//       if (!Array.isArray(lesson.keyPoints) || lesson.keyPoints.length !== 4) {
//         errors.push(
//           `Lesson ${i + 1}: expected 4 keyPoints, got ${lesson.keyPoints?.length ?? "none"}`
//         );
//       } else if (lesson.keyPoints.some((kp) => typeof kp !== "string" || !kp.trim())) {
//         errors.push(`Lesson ${i + 1}: keyPoints must all be non-empty strings`);
//       }
//     });
//   }

//   if (!Array.isArray(plan.questions) || plan.questions.length !== 20) {
//     errors.push(`Expected 20 questions, got ${plan.questions?.length ?? "none"}`);
//   } else {
//     plan.questions.forEach((q, i) => {
//       if (!q.question || typeof q.question !== "string") {
//         errors.push(`Question ${i + 1}: missing/invalid question text`);
//       }
//       if (!Array.isArray(q.options) || q.options.length !== 4) {
//         errors.push(`Question ${i + 1}: expected 4 options`);
//       } else if (q.options.some((o) => typeof o !== "string" || !o.trim())) {
//         errors.push(`Question ${i + 1}: options must all be non-empty strings`);
//       }
//       if (
//         typeof q.correct !== "number" ||
//         q.correct < 0 ||
//         q.correct > 3 ||
//         !Number.isInteger(q.correct)
//       ) {
//         errors.push(`Question ${i + 1}: "correct" must be an integer 0-3`);
//       }
//     });
//   }

//   return { ok: errors.length === 0, errors };
// }

// function buildLevelGuidance(level) {
//   switch (level) {
//     case "beginner":
//       return `\nLEARNER LEVEL: BEGINNER. Assume no prior knowledge. Start from first principles, define every term plainly, use simple everyday analogies, and keep math/jargon to a minimum. Build confidence gradually.`;
//     case "intermediate":
//       return `\nLEARNER LEVEL: INTERMEDIATE. Assume the learner knows the basics. Briefly recap fundamentals, then focus on deeper mechanisms, connections between ideas, and worked examples with moderate technical depth.`;
//     case "advanced":
//       return `\nLEARNER LEVEL: ADVANCED. Assume strong existing knowledge. Skip the basics, move quickly, and focus on nuance, edge cases, rigorous detail, and higher-level synthesis. Use precise technical language freely.`;
//     default:
//       return "";
//   }
// }

// const MAX_PDF_TEXT_CHARS = 6000;

// async function generateCoursePlan(topic, pdfText, pdfBuffer, level = null, maxAttempts = 3) {
//   const jsonSchema = `
// {
//   "lessons": [
//     {
//       "lessonNumber": 1,
//       "title": "string (specific to the topic)",
//       "description": "string (2-3 sentences)",
//       "keyPoints": ["string", "string", "string", "string"]
//     }
//   ],
//   "questions": [
//     {
//       "id": 1,
//       "question": "string",
//       "options": ["string", "string", "string", "string"],
//       "correct": 0,
//       "topic": "string"
//     }
//   ]
// }`;

//   const levelGuidance = buildLevelGuidance(level);

//   const rules = `
// Rules:
// - All content specific to the topic, never generic
// - Exactly 4 keyPoints per lesson
// - 20 questions distributed across the 6 lessons
// - "correct" is the 0-based index
// - Pure JSON only, no backticks${levelGuidance}
// - CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment, no clarifying questions — even if the input is unusually long, looks like a document rather than a short topic, or seems ambiguous. If the input is long or document-like, identify its single most central subject and build the course plan around that. Never refuse and never ask a follow-up question — always produce the JSON.`;

//   let messages;
//   let truncated = false;

//   if (pdfBuffer) {
//     messages = [
//       {
//         role: "user",
//         content: [
//           {
//             type: "document",
//             source: {
//               type: "base64",
//               media_type: "application/pdf",
//               data: pdfBuffer.toString("base64"),
//             },
//           },
//           {
//             type: "text",
//             text: `You are an expert educational content designer.

// The student uploaded the course material above. Generate a 6-lesson course plan and a 20-question assessment based on its content.

// Return ONLY valid JSON, no markdown, exactly this structure:
// ${jsonSchema}
// ${rules}`,
//           },
//         ],
//       },
//     ];
//   } else {
//     truncated = Boolean(pdfText && pdfText.length > MAX_PDF_TEXT_CHARS);
//     const context = pdfText
//       ? `The student uploaded course material:\n\n${pdfText.slice(0, MAX_PDF_TEXT_CHARS)}`
//       : `The student wants to learn about: ${topic}`;

//     messages = [
//       {
//         role: "user",
//         content: `
// You are an expert educational content designer.

// ${context}

// Generate a 6-lesson course plan and a 20-question assessment.

// Return ONLY valid JSON, no markdown, exactly this structure:
// ${jsonSchema}
// ${rules}
//         `,
//       },
//     ];
//   }

//   if (truncated) {
//     console.warn(
//       `  [plan] pdfText truncated from ${pdfText.length} to ${MAX_PDF_TEXT_CHARS} chars — course plan may miss later sections.`
//     );
//   }

//   let lastError = null;

//   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//     try {
//       const message = await client.messages.create({
//         model: "claude-haiku-4-5-20251001",
//         // Bumped from 6000: 6 lessons + 20 four-option questions sits close
//         // enough to 6k output tokens on verbose topics that truncation was
//         // a realistic (and previously invisible) failure mode.
//         max_tokens: 8000,
//         messages,
//       });

//       // A truncated response was previously indistinguishable from a
//       // malformed one: safeParseJson would throw "could not parse" and the
//       // retry loop would burn 2 more attempts on the exact same truncation.
//       // Surfacing the real cause makes the log actionable.
//       if (message.stop_reason === "max_tokens") {
//         throw contentError(
//           "Course plan response hit max_tokens and was truncated — the JSON is incomplete"
//         );
//       }

//       const text = message.content
//         .filter((b) => b.type === "text")
//         .map((b) => b.text)
//         .join("");

//       const plan = safeParseJson(text);

//       const { ok, errors } = validateCoursePlan(plan);
//       if (!ok) {
//         throw contentError(`Course plan failed shape validation: ${errors.join("; ")}`);
//       }

//       // Keep the return shape identical to the original function (the plan
//       // object itself, with lessons/questions at the top level) so existing
//       // callers like courseController.js don't break. The truncation flag
//       // is attached directly to the plan instead of wrapping it, so
//       // `plan.lessons` / `plan.questions` still work exactly as before.
//       if (truncated) {
//         plan.__truncatedInput = true;
//       }
//       return plan;
//     } catch (err) {
//       lastError = err;

//       if (isNonRetryable(err)) {
//         throw new Error(
//           `Course plan generation failed with a non-retryable error (check ANTHROPIC_API_KEY): ${describeError(err)}`
//         );
//       }

//       console.warn(
//         `  [plan] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`
//       );
//       if (attempt < maxAttempts) await backoffDelay(attempt);
//     }
//   }

//   throw new Error(
//     `Failed to generate a valid course plan after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
//   );
// }

// // Prompt rewritten for Sonnet 5. Key differences from the 4.6 version:
// //
// // 1. WORKED EXAMPLE is now richly animated — two scenes showing real
// //    continuous motion (orbiting particle, pulsing core, sine-wave drift),
// //    not a static black rectangle. The model imitates the example more than
// //    any written rule, so the example must demonstrate ambition, not caution.
// //
// // 2. EASING is now available — Sonnet 5 handles it correctly and shouldn't
// //    be told to avoid it. Removed the "NEVER use Easing" prohibition.
// //
// // 3. PERFORMANCE limits relaxed — the 50-element cap and "keep frame cheap"
// //    warnings were calibrated for 4.6's tendency to over-engineer loops.
// //    Sonnet 5 is more disciplined; these limits were cutting off legitimate
// //    visual richness.
// //
// // 4. LINE LIMIT raised from 800 to 1200 — Sonnet 5 writes more structured,
// //    readable code with proper helper components. The old limit was forcing
// //    it to compress scenes in ways that reduced animation quality.
// //
// // Crash-safety rules (interpolate shape, clamping, forbidden imports,
// // duration sum) are kept — those reflect real runtime constraints of this
// // environment, not compensations for model weakness.
// //
// // ACCURACY PASS (visual-correctness additions — targets scenes that run
// // without crashing but LOOK wrong: misplaced arrows, spilled particles,
// // mistimed reveals, unreadable text):
// //   4b  — frame numbers are per-scene (Series.Sequence resets frame to 0);
// //         global-timeline offsets silently never fire.
// //   7b  — pace reveals across the FULL scene duration; entrance-then-idle
// //         scenes fail even though they satisfy the continuous-motion rule.
// //   8   — visualDescription is a binding spec; onScreenText renders verbatim.
// //   9   — Layer 3 expanded: reserved text zones, zIndex, contrast, minimum
// //         sizes, no two texts in the same spot simultaneously.
// //   10c — spatial anchoring: related elements share ONE position source
// //         (connectors, moving targets, containment). Worked example's
// //         WaveScene refactored to model compute-once/reference-everywhere.
// //   10d — proportion sanity: element sizes relative to their role.
// //   12b — spring() requires fps from useVideoConfig() (runtime throw).
// //   FINAL SELF-CHECK — one-pass verification checklist before returning.
// const CODE_GEN_STATIC_RULES = `
// ⚠️ OUTPUT FORMAT: You MUST respond with ONLY raw TypeScript/TSX code. No explanations, no descriptions, no topic summaries, no markdown. The FIRST character of your response must be "i" (from "import"). If you output anything other than TSX code, the entire system fails and the user loses their course. CODE ONLY.

// You are a world-class Remotion motion-graphics developer creating visually astonishing educational animations. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught.

// Generate a complete, self-contained Remotion composition for a lesson. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration.

// STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
// 1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
// 2. Import ONLY from "remotion" and "react".
//    From "remotion": ANY named export works (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop) — EXCEPT staticFile, which is not available.
//    From "react": ONLY useMemo, useCallback, useRef. DO NOT use useState — it DOES NOT EXIST in this sandbox. Using useState will crash the video.
//    Do NOT import from any other library.
// 3. The component takes NO props — all data is hardcoded. This means variables like user, currentUser, session, props, context, or anything implying external/dynamic data DO NOT EXIST and referencing them crashes with "X is not defined". Every variable you use must be either: (a) declared locally with const/let inside your own code, (b) a real Remotion or React export from the allowed list, or (c) a parameter of a function you wrote yourself. Nothing else is available — there is no login state, no user data, no external context of any kind.
//    NEVER use a JavaScript built-in name (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) as a variable, function parameter, or destructured prop name. Doing so shadows the real built-in inside that scope and crashes with "X.method is not a function" — for example, naming a helper component's parameter Math means Math.sin inside that component no longer refers to the real Math object at all, it refers to whatever value was actually passed in for that parameter.
// 4. Structure: a single <Series> with one <Series.Sequence> per scene, IN ORDER. Do NOT use a bare <Sequence> anywhere, including inside a scene component. A <Sequence from={...} durationInFrames={...}> nested inside a scene will UNMOUNT its children once its own duration elapses — even if that's shorter than the scene's real duration — which makes the visual disappear while the audio (in the parent Series.Sequence) keeps playing. If part of a scene should only show for a portion of the scene, control that with interpolate()-driven opacity/scale on an always-mounted element, never by wrapping it in a shorter-lived Sequence.
// 4b. FRAME NUMBERS ARE PER-SCENE, NOT GLOBAL. useCurrentFrame() inside a <Series.Sequence> is RELATIVE to that scene's own start — it reads 0 on the scene's first frame, in EVERY scene. NEVER offset animation timings by the durations of earlier scenes. A scene-5 entrance written as interpolate(frame, [1240, 1270], [0, 1]) will NEVER fire — frame inside that scene only ever runs from 0 to that scene's own duration, so the element stays invisible for the whole scene. Every inputRange number is local to its scene: entrances near [0, 30], exits near [sceneDuration - 30, sceneDuration] written as plain literals of THAT scene's duration.
// 5. Each <Series.Sequence durationInFrames={EXACT_NUMBER}> — copy the number EXACTLY. Never compute or round it.
// 6. Inside each sequence: <Audio src={"EXACT_URL"} /> — copy URLs exactly, NO staticFile() wrapper.

// ANIMATION QUALITY — THIS IS THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
// The user is paying for animated video lessons. If the animations are generic, static, or visually uninteresting, the product fails entirely. Every scene must feel like a professional motion graphics studio made it.

// ⛔ THE #1 FAILURE MODE IS SCENES THAT ARE TOO BASIC. A scene with a couple of shapes, a label, and a plain background is a REJECTED scene, even if it runs perfectly and stays on screen. "Runs without crashing" and "stays in bounds" are the MINIMUM to not fail — they are NOT the goal. The goal is a dense, layered, constantly-moving illustration. Do not trade richness for safety: you must deliver BOTH. When in doubt, add more — more animated elements, more motion, more depth, more stages of the process unfolding.

//     Concretely, here is the difference:
//     BASIC (REJECTED): a blue circle labeled "Atom" that gently pulses, on a dark background, with the title fading in. ~3 elements, one kind of motion.
//     REQUIRED (SHIPPABLE): a glowing pulsing nucleus + 3 electrons orbiting at different radii/speeds/phases + faint orbital rings + 30-40 drifting background particles with independent timing + a shifting gradient backdrop + the concept name springing in staggered after a supporting label — with the whole structure ASSEMBLING over the scene, not appearing all at once. 10+ moving elements, several independent motion sources.
//     Every scene you output must look like the REQUIRED example, never the BASIC one. If you can count fewer than ~10 independently-moving things on screen at once, the scene is under-built — add more before returning it.


// 7. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At frame 100, things move. At frame 200, things move. If anything stops moving after its entrance animation, the scene is wrong. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.

// 7b. PACE THE SCENE ACROSS ITS FULL DURATION. Each scene's durationInFrames matches its narration audio — the visuals must UNFOLD across ALL of it, tracking the story being narrated, not finish building in the first 2 seconds and then idle. Break the scene's content into 3-5 stages and spread their entrances across the timeline: for a 450-frame scene, stagger stage reveals at roughly frames 0, 90, 200, 320 (as plain literals scaled to the actual duration), with the illustrated process (rule 10b) visibly progressing between reveals. Ambient motion (rule 7) is NOT a substitute for narrative progress — a scene where every element has fully appeared by frame 60 and merely wobbles in place for the remaining 390 frames FAILS this rule, because the viewer watches nothing new happen while the narrator keeps explaining.

// 8. ILLUSTRATE THE EXACT CONCEPT — not generic particles. If the topic is DNA replication, show the double helix unwinding with individual base pairs. If it's photosynthesis, show photons hitting chlorophyll and electrons jumping energy levels. If it's sorting algorithms, show actual elements moving into order. If it's electromagnetism, show field lines rotating. The animation must make the concept VISIBLE — a viewer with no prior knowledge should understand the concept from the visuals alone, without reading the text.
//    THE SCENE SPEC IS BINDING: each scene below comes with a visualDescription and onScreenText. The visualDescription is the SPEC — implement the specific elements and actions it names, not a different visual you'd prefer. The onScreenText is the EXACT text to display on screen — render it verbatim as the scene's primary text (plus at most brief supporting labels); do not invent replacement headline text or paraphrase it.

// 9. THREE MANDATORY LAYERS — all three must exist in every scene:
//    - Layer 1 (background): Continuously moving gradient, rotating color field, or drifting particle system. Never static.
//    - Layer 2 (concept): The main animated diagram — the thing that illustrates what the scene teaches. This is the star of the scene.
//    - Layer 3 (text): Text that springs or fades in. Text must be LEGIBLE and NON-OVERLAPPING at all times:
//      · Reserve a clear zone for text (typically a bottom band around y 860-960, or a top band around y 120-220) and keep the Layer 2 diagram OUT of that zone — including its motion range, not just its resting position.
//      · Give text a zIndex above the diagram, plus a textShadow (or a subtle dark backing panel) so it stays readable over any background color.
//      · Body text >= 28px, titles >= 36px. Never let two text blocks occupy the same position at the same time — if new text replaces old text, fade the old one fully OUT before the new one reaches full opacity.

// 10. RICHNESS REQUIREMENTS — every scene must have at least:
//     - 5+ animated elements (not counting background particles) — richer than a minimal diagram, build a genuinely layered scene
//     - At least 2 elements using spring() for staggered, natural entrances (not just one)
//     - At least 2 elements using Math.sin/Math.cos with DIFFERENT periods/phases for continuous motion that doesn't look synchronized/robotic
//     - A background particle field or ambient motion layer with 30-40 elements, each with independent timing (via index-based delay/phase offsets) — never all moving in lockstep
//     - Colors chosen to match the concept (biology = greens, physics = blues/purples, chemistry = warm colors), with a gradient or multi-color palette per scene, not a single flat color
//     - Glow effects (boxShadow with color) on EVERY primary element, not just one — layer glows of different intensities to create visual depth
//     - At least one element with a secondary/orbiting motion (something moving around another moving thing, not just independent motions)
//     - The concept name or key formula as text, appearing with a stagger after the visual is established, plus a secondary supporting text label revealing shortly after

//     THIS IS ENFORCED, NOT A SUGGESTION: a scene consisting of only a title fading in over a plain background, with no shape/diagram illustrating the concept, WILL be rejected and regenerated. Every scene needs a real Layer 2 diagram — text alone is never sufficient, no matter how well-animated the text itself is. A scene with only 1-2 simple animated elements and no particle field is UNDER the bar — push for maximum visual density and motion complexity within the line budget.

// 10b. ILLUSTRATE THE MECHANISM, NOT JUST A LABELED DIAGRAM. This is the single most common way scenes fail even when technically "animated": showing a static shape with a label naming it, instead of showing the actual process happening. A rotating wheel with phase names on it (G1, S, G2, M) is NOT illustrating cell division — it's a spinning label. A straight line representing "DNA unwinding" with no separating motion is NOT illustrating unwinding.
//     For ANY process/mechanism concept (something happens, something moves, something transforms, something builds), the animation must show the BEFORE state transforming into the AFTER state over the scene's duration, not just display both states as static labels:
//     - "DNA replication" → don't just show two parallel lines labeled 5'/3'. Show individual base pairs (small colored rectangles) actually SEPARATING from each other one at a time (staggered by index/position), with NEW matching bases animating in to pair with each newly-exposed strand.
//     - "Cell division phases" → don't just rotate a wheel with phase names. For EACH phase, show the actual cellular structures relevant to that phase appearing/moving — chromosomes condensing and lining up, spindle fibers extending, the cell membrane pinching inward.
//     - "Enzyme activity" → don't show a static shape labeled "enzyme." Show the enzyme (a distinct shape) physically moving ALONG a track/strand, with something visibly changing at the point of contact (a base flipping, a bond forming — represented by a small color change or shape change at that exact position, synced to the enzyme's position).
//     - "Chemical reaction" → show the actual reactant shapes moving toward each other, colliding/merging, and becoming product shapes — not just displaying reactant and product labels side by side.
//     Ask yourself: if I paused this scene at 3 different frames (start, middle, end), would the visual actually look meaningfully different at each point, reflecting real progress in the process? If the answer is no — if it's the same static picture with the same labels the whole time, just with a title fading in — the scene has failed this requirement regardless of how many decorative particles are in the background.

// 10c. SPATIAL ANCHORING — elements that RELATE to each other must share ONE source of truth for their position. This is the #1 cause of a scene that runs without crashing but still looks WRONG: an arrow pointing at empty space, a label floating away from the thing it names, particles spilling outside the cup that's supposed to hold them, a pointer landing next to its target instead of on it. It happens when you type a coordinate for element A, then SEPARATELY type another coordinate for the arrow/label/particle meant to attach to A — and the two numbers don't actually match, or A moves and its attachment stays put.
//     The fix is always the same: compute each position ONCE into a named constant, then have EVERY element that depends on it reference that same constant. Never type the same conceptual position twice — if two elements must line up, they must read from the same variable.

//     (a) CONNECTORS (arrows, lines, pointers, brackets) must start and end at the ACTUAL anchor of the things they connect — never at a separately-guessed coordinate.
//         const enzymePos = { x: 700, y: 540 };
//         const targetPos = { x: 1150, y: 540 };
//         - Render the enzyme AT enzymePos and the target AT targetPos (via transform/left/top or cx/cy).
//         - Draw the arrow FROM enzymePos TO targetPos by reusing those SAME constants:
//           <line x1={enzymePos.x} y1={enzymePos.y} x2={targetPos.x} y2={targetPos.y} ... />
//         BAD: enzyme positioned at (700,540) but the arrow hardcoded as x1={720} y1={560} x2={1100} — typed independently, so it drifts off the enzyme and misses the target. That is exactly the "arrow in the wrong place" bug.

//     (b) A MOVING target: the connector or label must MOVE WITH it. Compute the live (animated) position ONCE and reference that one value in both the element and whatever attaches to it.
//         const targetY = clampPos(540 + Math.sin(frame / 10) * 60, SAFE.yMin, SAFE.yMax);
//         // use targetY for BOTH the bobbing element AND the arrow endpoint / label that tracks it
//         BAD: the element bobs with Math.sin(frame/…) but the arrow points at a static y=540 — it only lines up on one frame and is visibly wrong for every other frame.

//     (c) CONTAINMENT — anything meant to be INSIDE a container (liquid, particles, items in a cup / beaker / box / circle / flask) must be positioned FROM the container's OWN geometry, inset by a margin, and clamped to that inner region. Define the container's bounds once, derive the contents' allowed region from them, and never guess "inside" coordinates independently of where you actually drew the container.
//         const cup = { x: 860, y: 500, w: 200, h: 260 }; // the exact box you draw the cup at
//         const inner = { xMin: cup.x + 24, xMax: cup.x + cup.w - 24, yMin: cup.y + 44, yMax: cup.y + cup.h - 20 };
//         // spawn EVERY particle inside the inner region, and clamp its animated position back into it:
//         const px = clampPos(rawX, inner.xMin, inner.xMax);
//         const py = clampPos(rawY, inner.yMin, inner.yMax);
//         For a ROUND container, keep each particle within (radius − margin) of the container's center — compute dx,dy from the center and, if dx*dx+dy*dy exceeds (R−margin)², pull it back — or just clamp to an inscribed box.
//         BAD: cup drawn spanning x=860…1060, but particles spawned at random x across 700…1200 — half of them render outside the cup. That is exactly the "particles out of the cup" bug.

//     (d) SELF-CHECK before finishing each scene: for EVERY arrow, label, pointer, and contained element, ask — does its position literally reference the same constant/variable as the thing it attaches to (or derive from that thing's container geometry)? If it uses an independently-typed number, it WILL be misaligned — rewrite it to read from the shared anchor. (These anchor constants belong in positions / transforms / SVG attributes ONLY — they must still never appear inside interpolate()'s input or output arrays per rule 11, and every final position still gets clamped to SAFE or the inner region per rule 14.)

// 10d. PROPORTION SANITY — size elements according to their ROLE, relative to each other:
//     - The main Layer 2 diagram dominates the frame: roughly 40-60% of frame width, centered in the non-text zone.
//     - Decorative/background particles stay small (4-16px). Contents are much smaller than their container (a particle inside a 200px-wide cup must be a small fraction of 200px, never comparable to it).
//     - Labels are visually subordinate to the thing they label — a label's font size should not exceed the labeled element's own size.
//     - If an element's size is a computed/animated value, clamp it to a sane range exactly like positions are clamped — a pulsing circle whose radius formula can hit 0 or 900 is a bug even if it never crashes.

// INTERPOLATE SAFETY — these violations CRASH the video at runtime, no exceptions:
// 11. interpolate() ALWAYS needs exactly 3 arguments: interpolate(value, [in...], [out...]).
//     - The 2nd and 3rd arguments (inputRange, outputRange) MUST be array literals written directly in the call — [0, 20] — containing ONLY plain number literals. NEVER a variable holding an array, and NEVER an expression inside the array (no "end - 30", no "i * 8", no "startFrame + 20"). If a value needs to vary, shift the FIRST argument instead — see the staggering technique below — never the array contents.
//     - CRASH: interpolate(frame, [startFrame, startFrame + 20], [...]) — startFrame may be undefined = NaN, and this is a variable/expression inside the array either way.
//     - CRASH: interpolate(frame, [durationInFrames - 30, durationInFrames], [...]) — durationInFrames is not in scope inside scene components, and it's an expression inside the array regardless.
//     - CRASH: interpolate(frame, [end - 30, end], [...]) — even if "end" was itself declared as "const end = 210", referencing it inside the array is still banned. The array must contain the literal numbers themselves: [180, 210].
//     - GOOD: interpolate(frame, [0, 20], [0, 1], CLAMP) — plain number literals only, nothing else.
//     - If a boundary depends on scene duration, you already know that duration as a plain number (it's given to you per-scene) — write it directly as a literal: interpolate(frame, [180, 210], [1, 0], CLAMP), not a variable reference to it.
//     - CRASH: interpolate(frame, [0, 30, 60, 60], [...]) — duplicate 60. Fix: [0, 30, 60, 91]
//     - CRASH: interpolate(frame, [300, 320, 466, 466], [...]) — duplicate 466. Fix: [300, 320, 466, 467]
//     - CRASH: interpolate(frame, [0, 30]) — missing outputRange. Fix: interpolate(frame, [0, 30], [0, 1])
//     - For hold-at-final-value: use 2 values + CLAMP. interpolate(frame, [0, 30], [0, 1], CLAMP) — NOT [0, 30, 30].
//     - For staggered elements (e.g. inside a .map over an index i): do NOT put i inside the array — that's banned. Instead shift the VALUE argument: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP). This gives each element its own staggered start time while keeping the inputRange a plain literal array, exactly as required.
// 12. NEVER produce NaN in any SVG attribute (cx, cy, r, x, y, width, height, points, d):
//     - Guard ALL division: write (value / (denominator || 1)) — never divide without this guard.
//     - Guard ALL array access: check i < arr.length before arr[i]. Out-of-bounds = NaN.
//     - Math.sin/cos ALWAYS receive a plain number — never undefined, null, or a string.
//     - Polygon/polyline points: filter out any NaN before joining: points.filter(p => !isNaN(p.x) && !isNaN(p.y))
//     - When using random() or useMemo for positions, ALWAYS validate the result is finite before using it.
// 12b. spring() MUST be called with BOTH frame AND fps: spring({ frame, fps, config: { ... } }), where fps comes from useVideoConfig() inside the component (const { fps } = useVideoConfig()). Calling spring() without fps throws at runtime and kills the scene. Never hardcode an fps number and never pass undefined — every component that uses spring() must call useVideoConfig() itself (or receive fps as an explicit parameter from a component that did).
// 12c. NEVER read a property off a value that can be undefined — "Cannot read properties of undefined (reading 'x')" is a real crash that has killed scenes in production. The two patterns that cause it:
//     - CONSECUTIVE-ELEMENT ACCESS: connecting point i to point i+1 (lines between anchor points, segment chains, paired elements). points[i + 1] is undefined on the LAST iteration if the loop runs to points.length. Fix: iterate only to length - 1 when the body reads [i + 1] — points.slice(0, -1).map((p, i) => { const next = points[i + 1]; ... }) — or guard explicitly: if (!next) return null; before touching next.x.
//     - LOOKUPS THAT CAN MISS: anchors.find(...), anchorMap[key], scenePositions[idx] — any lookup where the key/index might not exist returns undefined, and .x on it crashes. Fix: guard every lookup result before property access (const a = anchors.find(...); if (!a) return null;) or use a guaranteed-complete structure (build the array/object so every index/key you will read is definitely present).
//     This applies to EVERY .x / .y / .length / any property read on the result of indexing, find, filter()[0], or object lookup — if the value isn't provably defined, guard it first. A guard that renders nothing (return null) is always better than a crash that kills the whole video.
// 13. CLAMP entrance animations so elements don't fly off-screen after settling:
//     const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
//     Use CLAMP for interpolate() entrance animations. For Math.sin/cos continuous motion, CLAMP is NOT needed.
// 14. THE 1920x1080 FRAME IS A HARD BOUNDARY. Elements that drift to the edges or off-screen are a FAILED scene even if they don't crash — the user simply cannot see them, which is just as bad as a crash. This is a frequent, unacceptable failure: DO NOT let it happen.

//     ABSOLUTE RULE: EVERY single x / y / cx / cy / top / left / transform-translate value that positions ANY element — main diagram, label, particle, orbiting dot, everything — MUST pass through clamp() to SAFE as its final step before use. If you write a position value that is NOT wrapped in clamp() (or derived from an already-clamped value), that is a BUG. There are no exceptions and no elements that are "obviously fine" — clamp them all.

//     Do NOT compute safe positions by hand for each element. Instead, define these constants ONCE at the top of the file and route every position through them:

//     const FRAME = { w: 1920, h: 1080 };
//     const SAFE = { xMin: 160, xMax: 1760, yMin: 140, yMax: 940 }; // keep all element CENTERS inside this box
//     const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

//     Apply this pattern to EVERY positioned element, with no exceptions:
//     - Static/random position: const x = clamp(rawX, SAFE.xMin, SAFE.xMax); const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
//     - Oscillating (base ± amplitude*sin/cos): compute the raw value, THEN clamp it — never trust that base±amplitude "should" stay in range:
//       const rawY = baseY + Math.sin(frame / 10) * amplitude;
//       const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
//     - Orbiting: radius must satisfy centerX ± radius and centerY ± radius both land within SAFE — i.e. radius ≤ min(centerX - SAFE.xMin, SAFE.xMax - centerX, centerY - SAFE.yMin, SAFE.yMax - centerY). For a center at (960, 540), radius ≤ 420 is always safe.
//     - Text: position from SAFE bounds too, and additionally leave ≥80px margin from SAFE's own edges since text has width/height beyond its anchor point.
//     - Particles/background elements: also clamp, even though they're decorative — an off-screen particle wastes a draw call and a few stray ones drifting to the edge look like a bug to the viewer.

//     This clamp MUST be the last operation applied to any x/y/cx/cy/top/left value before it's used in a style or SVG attribute — clamping the raw input to a formula and then adding more offsets afterward defeats the purpose.

// CODE QUALITY:
// 15. Sum of all durationInFrames MUST equal the total given. Verify before finishing.
// 16. Inline styles ONLY. No Tailwind, no external CSS, no className for styling.
// 17. No registerRoot, no Composition.
// 18. Each scene component should be 200-300 lines — use the full budget to create rich, detailed animations. Extract shared helper components (ParticleBg, OrbitRing, Label) at the top to avoid repetition across scenes.
// 19. Every <Series.Sequence> must have a positive integer durationInFrames ≥ 1.
// 20. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX. Use separate expressions, or wrap in parens: {(a, b)} — but better to split into separate JSX attributes or elements.
// 21. NEVER write a literal { or } character directly as JSX text content — JSX treats every { as opening a JS expression, so a bare } with no matching opener is a parse error.
//     - CRASH: <div>f(x) = {x²}</div> — the { here isn't a JS expression, it's meant to be literal text, so JSX chokes on it.
//     - CRASH: <div>Set notation: {1, 2, 3}</div> — same problem, bare braces in text.
//     - CRASH: <div>Config: {{ key: value }}</div> as plain display text (not an actual style object) — same problem.
//     - GOOD: if you need to DISPLAY a literal brace character, wrap it as a string expression: <div>f(x) = {"{"}x²{"}"}</div>
//     - BETTER: avoid literal braces in on-screen text entirely. Rewrite math/set notation in words or with different symbols: "f of x equals x squared" or use parentheses/brackets instead of braces where the concept allows it.
// 22. NEVER SHIP A BLANK SCENE — if you build a reusable wrapper component (a shared background, gradient, or container that you place scene content inside, e.g. <SceneBg>...content...</SceneBg>), that wrapper MUST accept children in its props ({ children }: { children?: React.ReactNode }) AND render {children} in its JSX. A wrapper that forgets {children} makes React silently drop everything inside it — the scene renders as just the background with no diagram, no text, no error, and no warning. This is the #1 cause of empty/blank lessons. After writing any wrapper you nest content inside, verify its body actually contains {children}. If in doubt, don't use a content-wrapping component at all — put the background as a sibling <AbsoluteFill> behind the content instead of wrapping the content in it.

// WORKED EXAMPLE — two richly animated scenes. Study how EVERY frame has motion, how the concept is illustrated, how layers work together:

// \`\`\`tsx
// import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, Easing } from "remotion";

// const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// // Frame-boundary safety — defined ONCE, used by every positioned element.
// // See rule 14: never hand-compute a "should stay in bounds" position —
// // always clamp the final value instead.
// const FRAME = { w: 1920, h: 1080 };
// const SAFE = { xMin: 160, xMax: 1760, yMin: 140, yMax: 940 };
// const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// // A particle that orbits a central nucleus — illustrates atomic structure.
// // Motion is CONTINUOUS: orbit never stops, pulse never stops. The orbit
// // radius is chosen so centerX/centerY ± radius stays inside SAFE, and the
// // final position is still clamped as a last line of defense.
// function OrbitingParticle({ radius, speed, size, color, orbitColor, centerX = 960, centerY = 540 }: {
//   radius: number; speed: number; size: number; color: string; orbitColor: string; centerX?: number; centerY?: number;
// }) {
//   const frame = useCurrentFrame();
//   const angle = (frame * speed * Math.PI) / 180;
//   const rawX = centerX + Math.cos(angle) * radius;
//   const rawY = centerY + Math.sin(angle) * radius;
//   const x = clampPos(rawX, SAFE.xMin, SAFE.xMax);
//   const y = clampPos(rawY, SAFE.yMin, SAFE.yMax);
//   return (
//     <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
//       <div style={{
//         position: "absolute",
//         width: size, height: size,
//         borderRadius: "50%",
//         backgroundColor: color,
//         transform: \`translate(\${x - size / 2}px, \${y - size / 2}px)\`,
//         boxShadow: \`0 0 \${size * 1.5}px \${orbitColor}\`,
//       }} />
//     </div>
//   );
// }

// function AtomScene({ label }: { label: string }) {
//   const frame = useCurrentFrame();
//   const { fps } = useVideoConfig();
//   // Entrance: nucleus springs in
//   const nucleusScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
//   // Continuous: nucleus pulses with sine wave
//   const pulse = 1 + Math.sin(frame / 12) * 0.08;
//   // Label fades in with custom easing
//   const labelOpacity = interpolate(frame, [20, 50], [0, 1], {
//     ...CLAMP,
//     easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
//   });
//   // Background hue slowly rotates
//   const hue = (frame * 0.3) % 360;

//   return (
//     <AbsoluteFill style={{
//       background: \`radial-gradient(circle at 50% 50%, hsl(\${hue}, 30%, 15%), #0a0a1a)\`,
//       justifyContent: "center", alignItems: "center",
//     }}>
//       {/* Nucleus */}
//       <div style={{
//         width: 80, height: 80, borderRadius: "50%",
//         backgroundColor: "#f59e0b",
//         transform: \`scale(\${nucleusScale * pulse})\`,
//         boxShadow: "0 0 40px #f59e0b, 0 0 80px #f59e0b55",
//         position: "relative", zIndex: 2,
//       }} />
//       {/* Orbiting electrons at different radii and speeds */}
//       <OrbitingParticle radius={120} speed={2.4} size={20} color="#60a5fa" orbitColor="#3b82f6" />
//       <OrbitingParticle radius={180} speed={1.6} size={16} color="#a78bfa" orbitColor="#7c3aed" />
//       <OrbitingParticle radius={240} speed={1.0} size={14} color="#34d399" orbitColor="#059669" />
//       {/* Label */}
//       <div style={{
//         position: "absolute", bottom: 180,
//         color: "white", fontSize: 36, fontWeight: 700,
//         opacity: labelOpacity, letterSpacing: 2,
//         textShadow: "0 2px 20px rgba(0,0,0,0.8)",
//       }}>{label}</div>
//     </AbsoluteFill>
//   );
// }

// // A wave propagation scene — illustrates how waves travel through a medium.
// // Every point on the wave oscillates continuously with a phase offset.
// function WaveScene({ label }: { label: string }) {
//   const frame = useCurrentFrame();
//   const points = 32;
//   const labelOpacity = interpolate(frame, [10, 40], [0, 1], CLAMP);

//   // SPATIAL ANCHORING (rule 10c): compute each point's position ONCE, then let
//   // BOTH the circles AND the connecting line read from it. It's tempting to
//   // type the same y = 200 + Math.sin(...) formula separately in each place —
//   // don't. Any drift between the two copies makes the line peel away from the
//   // dots. One shared source of truth guarantees they always coincide.
//   const wavePoints = Array.from({ length: points }, (_, i) => {
//     const x = (i / (points - 1)) * 1920;
//     const phase = (i / points) * Math.PI * 4;
//     const y = 200 + Math.sin(frame / 10 + phase) * 80;
//     const brightness = (Math.sin(frame / 10 + phase) + 1) / 2;
//     return { x, y, brightness };
//   });

//   return (
//     <AbsoluteFill style={{ backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
//       <svg width={1920} height={400} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)" }}>
//         {/* Wave made of individually oscillating circles for a particle-wave look */}
//         {wavePoints.map((p, i) => (
//           <circle
//             key={i}
//             cx={p.x} cy={p.y} r={8}
//             fill={"hsl(" + (200 + p.brightness * 60) + ", 80%, " + (40 + p.brightness * 40) + "%)"}
//             opacity={0.6 + p.brightness * 0.4}
//           />
//         ))}
//         {/* Connecting line — reuses the SAME wavePoints, so it can never drift off the dots */}
//         <polyline
//           points={wavePoints.map((p) => \`\${p.x},\${p.y}\`).join(" ")}
//           fill="none"
//           stroke="rgba(96,165,250,0.4)"
//           strokeWidth={2}
//         />
//       </svg>
//       <div style={{
//         position: "absolute", bottom: 160,
//         color: "white", fontSize: 36, fontWeight: 700,
//         opacity: labelOpacity, textShadow: "0 2px 20px rgba(0,0,0,0.9)",
//       }}>{label}</div>
//     </AbsoluteFill>
//   );
// }

// export const LessonExample = () => {
//   return (
//     <Series>
//       <Series.Sequence durationInFrames={210}>
//         <Audio src={"https://example.com/audio/scene1.mp3"} />
//         <AtomScene label="Electrons orbit the nucleus" />
//       </Series.Sequence>
//       <Series.Sequence durationInFrames={240}>
//         <Audio src={"https://example.com/audio/scene2.mp3"} />
//         <WaveScene label="Waves propagate through a medium" />
//       </Series.Sequence>
//     </Series>
//   );
// };
// \`\`\`

// Every scene above has motion on EVERY frame. The atom's nucleus pulses, electrons orbit, background hue shifts. The wave's particles oscillate continuously. There is no static frame. Build every scene in your lesson to this standard.

// FINAL SELF-CHECK — before finishing, make ONE verification pass over your code and confirm ALL of these:
// 1. Exactly one <Series.Sequence> per scene, in the given order, each durationInFrames copied EXACTLY, and their sum equals the given TOTAL FRAMES.
// 2. Every scene contains its <Audio src={"..."} /> with the URL copied character-for-character from the scene table.
// 3. No useState, no bare <Sequence>, no staticFile, no imports from anything except "react" and "remotion".
// 4. Every interpolate() call: exactly 3 arguments (plus optional options object), input/output ranges are literal number arrays of equal length, inputRange strictly increasing, no variables or expressions inside the arrays.
// 5. Every spring() call receives both frame and fps from useVideoConfig() (rule 12b).
// 6. Every positioned element's FINAL x/y is wrapped in clamp() to SAFE — or to its container's inner region (rules 10c, 14). If ANY position value is not clamped, fix it. No exceptions.
// 7. Every arrow, pointer, label, and contained element reads its position from the SAME constant/variable as the thing it attaches to or lives inside (rule 10c) — no independently-typed coordinates for related elements.
// 8. Every wrapper component that content is nested inside actually renders {children} in its body (rule 22).
// 9. Each scene: motion on every frame (rule 7), the illustrated process visibly progresses across the FULL scene duration (rules 7b, 10b), text is verbatim onScreenText, legible, in its reserved zone, never overlapping the diagram or other text (rules 8, 9).
// 9b. RICHNESS GATE: can you count ~10 or more independently-moving elements on screen at once (main diagram parts + orbiting/secondary motion + 30-40 background particles), with several DIFFERENT motion sources? If it's fewer than that, or the scene is a few shapes with a label, it is TOO BASIC — add more elements, more motion, and more staged reveals before returning it (see the BASIC-vs-REQUIRED contrast under ANIMATION QUALITY).
// 10. All animation timings use scene-LOCAL frame numbers starting at 0 — no offsets from earlier scenes' durations (rule 4b).
// 11. No property read (.x, .y, etc.) on the result of arr[i + 1], find(), filter()[0], or a keyed lookup without a bounds/existence guard (rule 12c) — every loop whose body reads [i + 1] iterates only to length - 1.
// If any check fails, fix the code before returning it. Do not return code that fails a check.

// Begin with imports, then the CLAMP constant and the FRAME / SAFE / clamp position constants (rule 14), then shared helper components, then the main component.
// `;

// function buildPerLessonContent(lesson, componentName, scenes, totalFrames) {
//   const sceneTable = scenes
//     .map(
//       (s, i) =>
//         `Scene ${i + 1}: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}", targetLines=200-300
//    visualType: ${s.visualType}
//    onScreenText: ${s.onScreenText}
//    visualDescription: ${s.visualDescription}`
//     )
//     .join("\n\n");

//   return `
// LESSON: ${lesson.title}
// COMPONENT NAME: ${componentName}
// TOTAL FRAMES: ${totalFrames}
// TOTAL SCENES: ${scenes.length}
// LINE BUDGET: 200-300 lines per scene — use the full budget to create rich, detailed animations. Shared helper components don't count toward per-scene budget.

// SCENES (in order) — build one <Series.Sequence> per scene, in this exact order, with these EXACT durations:

// ${sceneTable}
// `;
// }

// // ── Auto-fix common GLM-5.2 code generation errors ───────────────────────────
// // These are systematic mistakes GLM-5.2 makes even with strict prompt rules.
// // IMPORTANT: every fix here is text-level, not AST-level, which means each
// // one carries some risk of mutating already-correct code. To keep that risk
// // low:
// //   - Only fixes with a very low false-positive surface are kept.
// //   - Anything ambiguous now THROWS instead of guessing, so it triggers a
// //     regeneration attempt rather than silently shipping mangled code.
// //   - Every fix that fires logs what it changed, so corruption introduced by
// //     this function is visible in logs instead of indistinguishable from a
// //     model mistake.
// function autoFixCode(code, { totalFrames } = {}) {
//   let fixed = code;
//   const notes = [];

//   // Fix 1: kebab-case CSS property names → camelCase JSX equivalents.
//   // Low risk: these patterns only match inside object-literal-style
//   // `property:` positions and camelCase is unambiguous.
//   const cssPropertyMap = {
//     "transform-origin": "transformOrigin",
//     "background-color": "backgroundColor",
//     "font-size": "fontSize",
//     "font-weight": "fontWeight",
//     "font-family": "fontFamily",
//     "border-radius": "borderRadius",
//     "box-shadow": "boxShadow",
//     "text-shadow": "textShadow",
//     "letter-spacing": "letterSpacing",
//     "line-height": "lineHeight",
//     "text-align": "textAlign",
//     "z-index": "zIndex",
//     "flex-direction": "flexDirection",
//     "justify-content": "justifyContent",
//     "align-items": "alignItems",
//     "pointer-events": "pointerEvents",
//   };
//   for (const [kebab, camel] of Object.entries(cssPropertyMap)) {
//     const pattern = new RegExp(`["']?${kebab}["']?\\s*:`, "g");
//     let count = 0;
//     fixed = fixed.replace(pattern, () => {
//       count++;
//       return `${camel}:`;
//     });
//     if (count) notes.push(`renamed CSS property ${kebab} -> ${camel} (x${count})`);
//   }

//   // Fix 1b: kebab-case SVG *attributes* in JSX (stroke-width={2} crashes
//   // just like kebab style keys do). Pattern anchors on the "=" so it can't
//   // touch style-object keys (those use ":") or prose in strings (which
//   // almost never contains kebab-word= sequences).
//   const svgAttrMap = {
//     "stroke-width": "strokeWidth",
//     "stroke-linecap": "strokeLinecap",
//     "stroke-linejoin": "strokeLinejoin",
//     "stroke-dasharray": "strokeDasharray",
//     "stroke-dashoffset": "strokeDashoffset",
//     "stroke-opacity": "strokeOpacity",
//     "fill-opacity": "fillOpacity",
//     "text-anchor": "textAnchor",
//     "dominant-baseline": "dominantBaseline",
//     "clip-path": "clipPath",
//   };
//   for (const [kebab, camel] of Object.entries(svgAttrMap)) {
//     const pattern = new RegExp(`\\b${kebab}=`, "g");
//     let count = 0;
//     fixed = fixed.replace(pattern, () => {
//       count++;
//       return `${camel}=`;
//     });
//     if (count) notes.push(`renamed SVG attribute ${kebab} -> ${camel} (x${count})`);
//   }

//   // Fix 2: Duplicate/non-increasing inputRange values in interpolate() calls.
//   // Only touches interpolate() calls whose entire inputRange is plain
//   // numeric literals — anything containing a variable/expression is left
//   // untouched, since we can't safely reason about its runtime value.
//   fixed = fixed.replace(
//     /interpolate\s*\(\s*([^,]+),\s*\[([^\]]+)\]/g,
//     (match, value, rangeStr) => {
//       const parts = rangeStr.split(",").map((s) => s.trim());
//       const nums = parts.map(Number);
//       if (nums.some((n) => Number.isNaN(n))) return match; // has a variable — skip
//       let changed = false;
//       for (let i = 1; i < nums.length; i++) {
//         if (nums[i] <= nums[i - 1]) {
//           nums[i] = nums[i - 1] + 1;
//           changed = true;
//         }
//       }
//       if (changed) notes.push(`fixed non-increasing interpolate inputRange near "${value.trim()}"`);
//       return `interpolate(${value}, [${nums.join(", ")}]`;
//     }
//   );

//   // Fix 2b: unbounded Math.random() * 1920 / * 1080 used directly as a
//   // position. This is the single most common cause of elements drifting
//   // off-screen — the prompt rule asks for an inset SAFE range, but the
//   // model sometimes reaches for the raw canvas dimensions anyway. Rewrite
//   // to a safely-inset range (100px margin on each side) rather than relying
//   // solely on the model following the SAFE-constant pattern correctly.
//   let widthFixCount = 0;
//   fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1920(?!\d)/g, () => {
//     widthFixCount++;
//     return "(100 + Math.random() * 1720)";
//   });
//   if (widthFixCount) {
//     notes.push(`clamped unbounded Math.random() * 1920 position to a safe inset range (x${widthFixCount})`);
//   }
//   let heightFixCount = 0;
//   fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1080(?!\d)/g, () => {
//     heightFixCount++;
//     return "(100 + Math.random() * 880)";
//   });
//   if (heightFixCount) {
//     notes.push(`clamped unbounded Math.random() * 1080 position to a safe inset range (x${heightFixCount})`);
//   }

//   // Fix 3: bare `durationInFrames` used where it isn't in scope.
//   //
//   // Critical nuance the old version missed: `durationInFrames` is sometimes
//   // a PERFECTLY LEGITIMATE identifier —
//   //   const { durationInFrames } = useVideoConfig();
//   //   function Scene({ durationInFrames }: { durationInFrames: number }) { ... }
//   // The old blanket substitution turned the destructuring itself into
//   // `const { fps, 450 } = useVideoConfig()` — a syntax error we introduced
//   // ourselves. So: if the code DECLARES the identifier anywhere (const/let/
//   // var, destructuring, or a destructured function parameter), leave every
//   // occurrence alone — it's in scope. Only when it's used with NO
//   // declaration anywhere do we substitute the known totalFrames.
//   //
//   // The substitution pattern also now excludes property access
//   // (`scene.durationInFrames` must not become `scene.450`) via a negative
//   // lookbehind, in addition to the existing exclusions for JSX props
//   // (`durationInFrames={...}`) and object keys (`durationInFrames: ...`).
//   const declaresDurationInFrames =
//     /(?:const|let|var)\s+durationInFrames\b/.test(fixed) ||
//     /(?:const|let|var)\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}\s*=/.test(fixed) ||
//     /\(\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}/.test(fixed);

//   const bareUsePattern = /(?<!\.)\bdurationInFrames\b(?!\s*[=:])/;
//   if (!declaresDurationInFrames && bareUsePattern.test(fixed)) {
//     const fallback = Number.isFinite(totalFrames) ? totalFrames : null;
//     if (fallback === null) {
//       throw contentError(
//         "Code references out-of-scope `durationInFrames` and no totalFrames was provided to safely substitute — regenerating."
//       );
//     }
//     notes.push(`substituted out-of-scope durationInFrames -> ${fallback}`);
//     fixed = fixed.replace(/(?<!\.)\bdurationInFrames\b(?!\s*[=:])/g, `${fallback}`);
//   }

//   // Fix 4: common HTML-attribute-in-JSX slips. (`\bfor=` cannot touch
//   // `htmlFor=` — the pattern is case-sensitive and "htmlFor" contains "For",
//   // not "for". `for (` loops have no "=" and are also untouched.)
//   fixed = fixed.replace(/\bclass=/g, "className=");
//   fixed = fixed.replace(/\bfor=/g, "htmlFor=");

//   // Fix 5: unterminated template literal — trailing corruption at end of file.
//   // Previously this guessed a closing wrapper (`);\n}`) that may not match
//   // the actual function shape, which can produce code that's still invalid
//   // in a new way. That's a worse outcome than failing loudly, so this now
//   // throws to force a regeneration attempt instead of guessing.
//   const backtickCount = (fixed.match(/`/g) || []).length;
//   if (backtickCount % 2 !== 0) {
//     throw contentError("Unterminated template literal detected — regenerating instead of guessing a fix.");
//   }

//   // (The old Fix 6 — stripping `;;` and trailing commas — has been removed
//   // on purpose. Both are VALID JavaScript/TypeScript that compile fine, so
//   // the fix repaired nothing, while the text-level regexes could mutate
//   // those character sequences inside string literals shown on screen. A
//   // "fix" whose only possible effect is a false positive shouldn't exist.)

//   if (notes.length) {
//     console.log(`  [autofix] Applied: ${notes.join(" | ")}`);
//   }

//   return fixed;
// }

// // ── Enforce correct audio URLs — don't trust the model to copy them right ───
// // GLM-5.2 (and any LLM) can occasionally mistype a single character when
// // transcribing a long, random UUID into generated code — e.g. writing
// // "...ba3e-..." as "...be3e-..." in an <Audio src="..."> tag. The rest of the
// // URL matches perfectly, but that one scene's audio silently 404s forever,
// // since the file that URL points to was never actually created.
// //
// // Rather than hoping the model copies a 36-character random string
// // perfectly every time, we enforce it deterministically: scenes are always
// // wired into <Series.Sequence> tags IN ORDER, so we can match each
// // <Audio src="..."> occurrence (in the order it appears) to the
// // corresponding scene in our own `scenes` array — which has the guaranteed-
// // correct, actually-existing-on-disk URL — and force-replace it if it
// // doesn't match exactly.
// //
// // Matches BOTH forms the model actually emits — src={"url"} (the form the
// // prompt asks for) and the plain-attribute slip src="url" — and tolerates
// // other attributes appearing before src. The old single-pattern version
// // silently skipped any <Audio> tag not written in the exact braced style,
// // which meant a mistyped URL in the plain form shipped uncorrected.
// function enforceCorrectAudioUrls(code, scenes) {
//   let sceneIndex = 0;
//   let mismatchCount = 0;
//   let audioTagCount = 0;

//   const audioSrcPattern = /<Audio\b[^>]*?src=(?:\{\s*"([^"}]+)"\s*\}|"([^">]+)")/g;

//   const fixed = code.replace(audioSrcPattern, (match, bracedUrl, plainUrl) => {
//     audioTagCount++;
//     if (sceneIndex >= scenes.length) return match; // more Audio tags than scenes — leave as-is, structural mismatch is reported below
//     const foundUrl = bracedUrl ?? plainUrl;
//     const correctUrl = scenes[sceneIndex].audioUrl;
//     sceneIndex++;

//     if (foundUrl !== correctUrl) {
//       mismatchCount++;
//       console.warn(
//         `  [audio-url-fix] Scene ${sceneIndex}: model wrote a URL that doesn't match the real file — correcting it.\n` +
//         `    Model wrote:  ${foundUrl}\n` +
//         `    Correct URL:  ${correctUrl}`
//       );
//       return match.replace(foundUrl, correctUrl);
//     }
//     return match;
//   });

//   if (audioTagCount !== scenes.length) {
//     console.warn(
//       `  [audio-url-fix] Structural mismatch: expected ${scenes.length} <Audio> tags (one per scene), found ${audioTagCount}. Leaving for validateGeneratedCode to reject if invalid.`
//     );
//   }
//   if (mismatchCount > 0) {
//     console.warn(`  [audio-url-fix] Corrected ${mismatchCount} mismatched audio URL(s) out of ${scenes.length} scenes.`);
//   }

//   return fixed;
// }

// async function generateLessonCode(
//   lesson,
//   componentName,
//   scenes,
//   totalFrames,
//   maxAttempts = 3
// ) {
//   let lastError = null;
//   // When an attempt fails on CONTENT (validation, critic, truncation), the
//   // next attempt tells the model exactly what was wrong. Retrying blind with
//   // the identical prompt — as the old version did — frequently reproduces
//   // the identical mistake, since the model's failure was deterministic-ish,
//   // not random. Transport failures (connection errors, rate limits) don't
//   // set this, since the prompt wasn't the problem.
//   let contentFeedback = null;
//   const lessonStart = Date.now();

//   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//     // Reset per attempt: only errors thrown AFTER the stream was fully
//     // received count as content errors worth feeding back to the model.
//     let receivedFullOutput = false;

//     try {
//       console.log(
//         `  [code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`
//       );

//       const userContent =
//         buildPerLessonContent(lesson, componentName, scenes, totalFrames) +
//         (contentFeedback
//           ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate the code from scratch and make absolutely sure this specific problem does not occur again.`
//           : "");

//       // The ENTIRE request lifetime — opening the stream AND consuming every
//       // chunk — runs inside the limiter, so the concurrency slot is held for
//       // as long as the HTTP connection is actually open. Releasing the slot
//       // at create()-resolution (as before) allowed unbounded overlapping
//       // streams, which is exactly the connection-spike problem the limiter
//       // exists to prevent.
//       const { text, stopReason } = await limitGlmCall(async () => {
//         const stream = await CODE_PROVIDER.client.chat.completions.create({
//           model: CODE_PROVIDER.model,
//           ...CODE_PROVIDER.extraParams,
//           max_tokens: 100000,
//           stream: true,
//           messages: [
//             {
//               role: "system",
//               content: CODE_GEN_STATIC_RULES,
//             },
//             {
//               role: "user",
//               content: userContent,
//             },
//           ],
//         });

//         let streamedText = "";
//         let finishReason = null;

//         for await (const chunk of stream) {
//           const delta = chunk.choices?.[0]?.delta;
//           // Only collect actual content, not reasoning_content tokens
//           if (delta?.content) streamedText += delta.content;
//           if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
//         }

//         return { text: streamedText, stopReason: finishReason };
//       });

//       receivedFullOutput = true;

//       if (stopReason === "length") {
//         throw contentError("Hit max_tokens — code was truncated. Generate more compact code.");
//       }

//       // Strip markdown fences ONLY at the very start and very end of the
//       // output. The old global strip (/```/g anywhere) could eat backtick
//       // sequences living inside the generated code's own template literals,
//       // corrupting valid code.
//       let code = text.trim();
//       code = code
//         .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
//         .replace(/\s*```\s*$/, "")
//         .trim();

//       // Detect plain text output — GLM-5.2 sometimes ignores the prompt and
//       // outputs topic descriptions instead of TSX code. Catch this early.
//       if (
//         !code.startsWith("import") &&
//         !code.startsWith("const") &&
//         !code.startsWith("//") &&
//         !code.startsWith("/*") &&
//         !code.startsWith("export")
//       ) {
//         throw contentError("Model output plain text instead of TSX code — you MUST output only TSX code starting with `import`.");
//       }

//       // ── Auto-fix common GLM-5.2 output errors ─────────────────────────────
//       const fixedCode = autoFixCode(code, { totalFrames });

//       // ── Force-correct any mistyped audio URLs — don't trust the model's
//       // ability to transcribe long UUID strings perfectly. This is what
//       // actually fixes the "one random scene has no audio" bug.
//       const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);

//       const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

//       const review = await reviewGeneratedCode(validatedCode, lesson);
//       if (!review.skipped && review.ok === false) {
//         // A failed review counts as a failed attempt and triggers a
//         // regeneration — and the critic's specific findings become the
//         // feedback for the next attempt, so it isn't just a blind reroll.
//         throw contentError(
//           `Code critic flagged issues: ${review.issues?.join("; ") || "unspecified"}`
//         );
//       }

//       const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
//       console.log(
//         `  [code] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`
//       );
//       return validatedCode;
//     } catch (err) {
//       lastError = err;

//       if (isNonRetryable(err)) {
//         throw new Error(
//           `Lesson code generation failed with a non-retryable error (check ${CODE_PROVIDER.keyEnv}): ${describeError(err)}`
//         );
//       }

//       // Content errors (anything thrown after the full stream arrived, or
//       // explicitly tagged) get fed back to the model on the next attempt.
//       if (err.isContentError || receivedFullOutput) {
//         contentFeedback = err.message;
//       }

//       console.warn(
//         `  [code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`
//       );
//       if (attempt < maxAttempts) await backoffDelay(attempt);
//     }
//   }

//   const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
//   throw new Error(
//     `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
//   );
// }

// module.exports = { generateCoursePlan, generateLessonCode };
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { validateGeneratedCode } = require("./validateCode");
const { reviewGeneratedCode } = require("./codeCriticService");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GLM-5.2 client for lesson code generation — OpenAI-compatible
const glmClient = new OpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4/",
  timeout: 300 * 1000, // 5 minute timeout — if GLM takes longer, fail fast and retry
  maxRetries: 0,       // handle retries manually
});

// ── Error classification ─────────────────────────────────────────────────────
// Two kinds of failure need different handling:
//   - Transport errors (connection reset, rate limit, 5xx): retry as-is,
//     the same prompt may well succeed next time.
//   - Content errors (bad JSON, failed validation, critic rejection): the
//     model produced wrong OUTPUT. Retrying with the identical prompt often
//     reproduces the identical mistake — so content errors are fed back into
//     the retry prompt (see generateLessonCode).
//   - Non-retryable errors (401/403 auth): retrying is pure wasted time and
//     log noise. Fail immediately.
function contentError(message) {
  const err = new Error(message);
  err.isContentError = true;
  return err;
}

function isNonRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 401 || status === 403;
}

// ── Retry helper with exponential backoff + jitter ──────────────────────────
// Hammering a rate-limited or momentarily-overloaded API with zero delay
// makes correlated failures across all attempts more likely, not less.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoffDelay(attempt, baseMs = 500, capMs = 8000) {
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  const jitter = Math.random() * exp * 0.3;
  await sleep(exp + jitter);
}

// ── Tiny concurrency limiter (no new dependency) ────────────────────────────
// If multiple lessons generate code in parallel, each one calls
// generateLessonCode independently with no awareness of the others. If the
// GLM endpoint enforces a max-simultaneous-connections limit, firing 5-6
// requests at once can produce instant "Connection error." failures that
// look like network flakiness but are actually a self-inflicted concurrency
// spike. This wraps the actual API call so no matter how many lessons are
// kicked off concurrently by the caller, only N requests to GLM are ever
// in flight at once — everything else queues.
//
// IMPORTANT: the limited function must cover the ENTIRE lifetime of the
// request, including consuming the response stream. With streaming, the
// create() promise resolves as soon as response headers arrive — the HTTP
// connection then stays open for the whole (potentially minutes-long)
// stream. If the limiter releases its slot at create()-resolution time,
// you can end up with far more than N sockets actually open at once,
// which defeats the entire point. generateLessonCode therefore passes the
// full "open stream + consume every chunk" operation into limit().
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

// Cap simultaneous in-flight requests to GLM. Adjust via env var if the
// provider's actual limit turns out to be higher or lower than this default.
// Raised default from 3 to 6 — GLM-5.2 is a sparse MoE model (~40B active of
// 743B total params per token), which is specifically designed to handle
// concurrent requests efficiently since serving infra (vLLM/SGLang) routes
// experts per-request rather than one request blocking the whole model.
// A 6-lesson course was being artificially serialized into two waves of 3;
// this lets all 6 lessons reason + generate in parallel. If this trips rate
// limits on Z.AI's shared endpoint, lower via the GLM_MAX_CONCURRENT env var.
const GLM_MAX_CONCURRENT = Number(process.env.GLM_MAX_CONCURRENT) || 6;
const limitGlmCall = createLimiter(GLM_MAX_CONCURRENT);

// Pull the useful bits out of a connection-level failure. The OpenAI SDK
// collapses network errors (DNS, TLS, ECONNRESET, connection refused, etc.)
// into a generic "Connection error." message and stashes the actual cause
// on err.cause — which the old code never logged, making these failures
// indistinguishable from each other.
function describeError(err) {
  const cause = err?.cause;
  if (!cause) return err.message;
  const causeCode = cause.code || cause.errno || cause.name;
  const causeMsg = cause.message || String(cause);
  return `${err.message} [cause: ${causeCode ? `${causeCode} — ` : ""}${causeMsg}]`;
}

// ── Safer JSON extraction ────────────────────────────────────────────────────
// Walks the text from a given "{" tracking bracket depth and string state,
// so it finds the actual matching close brace for that object — immune to
// stray braces inside string values or trailing commentary.
//
// Returns the balanced slice, or null if that "{" is never closed
// (truncated response, or a prose brace with no matching close).
function extractJsonObjectFrom(text, start) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null; // Never closed
}

// Parsing strategy, in order of preference:
//   1. Extract a balanced object and JSON.parse it untouched. No text-level
//      mutation happens on output that was already valid — the old version
//      globally stripped ``` sequences BEFORE extraction, which could corrupt
//      backticks living inside JSON string values. Extraction starts at the
//      first "{", so markdown fences around the object are irrelevant anyway.
//   2. Only if the pristine parse fails, apply the trailing-comma repair and
//      try once more.
//   3. Only if THAT fails, advance past this "{" and try the next candidate.
//      This recovers the case where the model prefixed the JSON with prose
//      that itself contains braces (e.g. "Here is {your plan}: {...}") —
//      which the old first-brace-only approach could never recover from.
function safeParseJson(text) {
  let searchFrom = 0;
  let lastErr = null;

  for (let attempts = 0; attempts < 8; attempts++) {
    const braceAt = text.indexOf("{", searchFrom);
    if (braceAt === -1) break;

    const candidate = extractJsonObjectFrom(text, braceAt);
    if (candidate === null) {
      // This "{" never balances (prose brace or truncation) — try the next one.
      searchFrom = braceAt + 1;
      continue;
    }

    try {
      return JSON.parse(candidate);
    } catch (pristineErr) {
      try {
        // Trailing-comma cleanup, scoped to a structurally balanced object
        // and only attempted after a clean parse already failed.
        return JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1"));
      } catch (repairedErr) {
        lastErr = repairedErr;
        searchFrom = braceAt + 1;
      }
    }
  }

  throw contentError(
    `Could not parse a complete JSON object from model output${lastErr ? ` (last parse error: ${lastErr.message})` : ""}`
  );
}

// ── Course plan shape validation ────────────────────────────────────────────
// Parsing succeeds != the plan is usable. The prompt promises 6 lessons with
// exactly 4 keyPoints each and 20 questions with valid option/answer shapes;
// nothing previously checked that promise was kept before handing the plan
// downstream to code generation, which assumes it.
function validateCoursePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== "object") {
    errors.push("Plan is not an object");
    return { ok: false, errors };
  }

  if (!Array.isArray(plan.lessons) || plan.lessons.length !== 6) {
    errors.push(`Expected 6 lessons, got ${plan.lessons?.length ?? "none"}`);
  } else {
    plan.lessons.forEach((lesson, i) => {
      if (!lesson.title || typeof lesson.title !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid title`);
      }
      if (!lesson.description || typeof lesson.description !== "string") {
        errors.push(`Lesson ${i + 1}: missing/invalid description`);
      }
      if (!Array.isArray(lesson.keyPoints) || lesson.keyPoints.length !== 4) {
        errors.push(
          `Lesson ${i + 1}: expected 4 keyPoints, got ${lesson.keyPoints?.length ?? "none"}`
        );
      } else if (lesson.keyPoints.some((kp) => typeof kp !== "string" || !kp.trim())) {
        errors.push(`Lesson ${i + 1}: keyPoints must all be non-empty strings`);
      }
    });
  }

  if (!Array.isArray(plan.questions) || plan.questions.length !== 20) {
    errors.push(`Expected 20 questions, got ${plan.questions?.length ?? "none"}`);
  } else {
    plan.questions.forEach((q, i) => {
      if (!q.question || typeof q.question !== "string") {
        errors.push(`Question ${i + 1}: missing/invalid question text`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question ${i + 1}: expected 4 options`);
      } else if (q.options.some((o) => typeof o !== "string" || !o.trim())) {
        errors.push(`Question ${i + 1}: options must all be non-empty strings`);
      }
      if (
        typeof q.correct !== "number" ||
        q.correct < 0 ||
        q.correct > 3 ||
        !Number.isInteger(q.correct)
      ) {
        errors.push(`Question ${i + 1}: "correct" must be an integer 0-3`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

function buildLevelGuidance(level) {
  switch (level) {
    case "beginner":
      return `\nLEARNER LEVEL: BEGINNER. Assume no prior knowledge. Start from first principles, define every term plainly, use simple everyday analogies, and keep math/jargon to a minimum. Build confidence gradually.`;
    case "intermediate":
      return `\nLEARNER LEVEL: INTERMEDIATE. Assume the learner knows the basics. Briefly recap fundamentals, then focus on deeper mechanisms, connections between ideas, and worked examples with moderate technical depth.`;
    case "advanced":
      return `\nLEARNER LEVEL: ADVANCED. Assume strong existing knowledge. Skip the basics, move quickly, and focus on nuance, edge cases, rigorous detail, and higher-level synthesis. Use precise technical language freely.`;
    default:
      return "";
  }
}

const MAX_PDF_TEXT_CHARS = 6000;

async function generateCoursePlan(topic, pdfText, pdfBuffer, level = null, maxAttempts = 3) {
  const jsonSchema = `
{
  "lessons": [
    {
      "lessonNumber": 1,
      "title": "string (specific to the topic)",
      "description": "string (2-3 sentences)",
      "keyPoints": ["string", "string", "string", "string"]
    }
  ],
  "questions": [
    {
      "id": 1,
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct": 0,
      "topic": "string"
    }
  ]
}`;

  const levelGuidance = buildLevelGuidance(level);

  const rules = `
Rules:
- All content specific to the topic, never generic
- Exactly 4 keyPoints per lesson
- 20 questions distributed across the 6 lessons
- "correct" is the 0-based index
- Pure JSON only, no backticks${levelGuidance}
- CRITICAL: Respond with ONLY the JSON object. No commentary, no acknowledgment, no clarifying questions — even if the input is unusually long, looks like a document rather than a short topic, or seems ambiguous. If the input is long or document-like, identify its single most central subject and build the course plan around that. Never refuse and never ask a follow-up question — always produce the JSON.`;

  let messages;
  let truncated = false;

  if (pdfBuffer) {
    messages = [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `You are an expert educational content designer.

The student uploaded the course material above. Generate a 6-lesson course plan and a 20-question assessment based on its content.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}`,
          },
        ],
      },
    ];
  } else {
    truncated = Boolean(pdfText && pdfText.length > MAX_PDF_TEXT_CHARS);
    const context = pdfText
      ? `The student uploaded course material:\n\n${pdfText.slice(0, MAX_PDF_TEXT_CHARS)}`
      : `The student wants to learn about: ${topic}`;

    messages = [
      {
        role: "user",
        content: `
You are an expert educational content designer.

${context}

Generate a 6-lesson course plan and a 20-question assessment.

Return ONLY valid JSON, no markdown, exactly this structure:
${jsonSchema}
${rules}
        `,
      },
    ];
  }

  if (truncated) {
    console.warn(
      `  [plan] pdfText truncated from ${pdfText.length} to ${MAX_PDF_TEXT_CHARS} chars — course plan may miss later sections.`
    );
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        // Bumped from 6000: 6 lessons + 20 four-option questions sits close
        // enough to 6k output tokens on verbose topics that truncation was
        // a realistic (and previously invisible) failure mode.
        max_tokens: 8000,
        messages,
      });

      // A truncated response was previously indistinguishable from a
      // malformed one: safeParseJson would throw "could not parse" and the
      // retry loop would burn 2 more attempts on the exact same truncation.
      // Surfacing the real cause makes the log actionable.
      if (message.stop_reason === "max_tokens") {
        throw contentError(
          "Course plan response hit max_tokens and was truncated — the JSON is incomplete"
        );
      }

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const plan = safeParseJson(text);

      const { ok, errors } = validateCoursePlan(plan);
      if (!ok) {
        throw contentError(`Course plan failed shape validation: ${errors.join("; ")}`);
      }

      // Keep the return shape identical to the original function (the plan
      // object itself, with lessons/questions at the top level) so existing
      // callers like courseController.js don't break. The truncation flag
      // is attached directly to the plan instead of wrapping it, so
      // `plan.lessons` / `plan.questions` still work exactly as before.
      if (truncated) {
        plan.__truncatedInput = true;
      }
      return plan;
    } catch (err) {
      lastError = err;

      if (isNonRetryable(err)) {
        throw new Error(
          `Course plan generation failed with a non-retryable error (check ANTHROPIC_API_KEY): ${describeError(err)}`
        );
      }

      console.warn(
        `  [plan] Attempt ${attempt}/${maxAttempts} failed: ${describeError(err)}. Retrying...`
      );
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  throw new Error(
    `Failed to generate a valid course plan after ${maxAttempts} attempts: ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

// Prompt rewritten for Sonnet 5. Key differences from the 4.6 version:
//
// 1. WORKED EXAMPLE is now richly animated — two scenes showing real
//    continuous motion (orbiting particle, pulsing core, sine-wave drift),
//    not a static black rectangle. The model imitates the example more than
//    any written rule, so the example must demonstrate ambition, not caution.
//
// 2. EASING is now available — Sonnet 5 handles it correctly and shouldn't
//    be told to avoid it. Removed the "NEVER use Easing" prohibition.
//
// 3. PERFORMANCE limits relaxed — the 50-element cap and "keep frame cheap"
//    warnings were calibrated for 4.6's tendency to over-engineer loops.
//    Sonnet 5 is more disciplined; these limits were cutting off legitimate
//    visual richness.
//
// 4. LINE LIMIT raised from 800 to 1200 — Sonnet 5 writes more structured,
//    readable code with proper helper components. The old limit was forcing
//    it to compress scenes in ways that reduced animation quality.
//
// Crash-safety rules (interpolate shape, clamping, forbidden imports,
// duration sum) are kept — those reflect real runtime constraints of this
// environment, not compensations for model weakness.
//
// ACCURACY PASS (visual-correctness additions — targets scenes that run
// without crashing but LOOK wrong: misplaced arrows, spilled particles,
// mistimed reveals, unreadable text):
//   4b  — frame numbers are per-scene (Series.Sequence resets frame to 0);
//         global-timeline offsets silently never fire.
//   7b  — pace reveals across the FULL scene duration; entrance-then-idle
//         scenes fail even though they satisfy the continuous-motion rule.
//   8   — visualDescription is a binding spec; onScreenText renders verbatim.
//   9   — Layer 3 expanded: reserved text zones, zIndex, contrast, minimum
//         sizes, no two texts in the same spot simultaneously.
//   10c — spatial anchoring: related elements share ONE position source
//         (connectors, moving targets, containment). Worked example's
//         WaveScene refactored to model compute-once/reference-everywhere.
//   10d — proportion sanity: element sizes relative to their role.
//   12b — spring() requires fps from useVideoConfig() (runtime throw).
//   FINAL SELF-CHECK — one-pass verification checklist before returning.
const CODE_GEN_STATIC_RULES = `
⚠️ OUTPUT FORMAT: You MUST respond with ONLY raw TypeScript/TSX code. No explanations, no descriptions, no topic summaries, no markdown. The FIRST character of your response must be "i" (from "import"). If you output anything other than TSX code, the entire system fails and the user loses their course. CODE ONLY.

You are a world-class Remotion motion-graphics developer creating visually astonishing educational animations. This is a premium learning product — every scene must feel alive, dynamic, and visually connected to the concept being taught.

Generate a complete, self-contained Remotion composition for a lesson. Each scene has an EXACT frame duration (measured from its voiceover audio) and you MUST build each scene to that exact duration.

STRICT REQUIREMENTS — follow exactly or the browser compilation will fail:
1. The component MUST be named exactly as given below and exported as a named export: export const ComponentName = () => { ... }
2. Import ONLY from "remotion" and "react".
   From "remotion": ANY named export works (AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Sequence, Audio, Easing, interpolateColors, random, Loop) — EXCEPT staticFile, which is not available.
   From "react": ONLY useMemo, useCallback, useRef. DO NOT use useState — it DOES NOT EXIST in this sandbox. Using useState will crash the video.
   Do NOT import from any other library.
3. The component takes NO props — all data is hardcoded. This means variables like user, currentUser, session, props, context, or anything implying external/dynamic data DO NOT EXIST and referencing them crashes with "X is not defined". Every variable you use must be either: (a) declared locally with const/let inside your own code, (b) a real Remotion or React export from the allowed list, or (c) a parameter of a function you wrote yourself. Nothing else is available — there is no login state, no user data, no external context of any kind.
   NEVER use a JavaScript built-in name (Math, Array, Object, String, Number, Date, JSON, Boolean, Map, Set) as a variable, function parameter, or destructured prop name. Doing so shadows the real built-in inside that scope and crashes with "X.method is not a function" — for example, naming a helper component's parameter Math means Math.sin inside that component no longer refers to the real Math object at all, it refers to whatever value was actually passed in for that parameter.
4. Structure: a single <Series> with one <Series.Sequence> per scene, IN ORDER. Do NOT use a bare <Sequence> anywhere, including inside a scene component. A <Sequence from={...} durationInFrames={...}> nested inside a scene will UNMOUNT its children once its own duration elapses — even if that's shorter than the scene's real duration — which makes the visual disappear while the audio (in the parent Series.Sequence) keeps playing. If part of a scene should only show for a portion of the scene, control that with interpolate()-driven opacity/scale on an always-mounted element, never by wrapping it in a shorter-lived Sequence.
4b. FRAME NUMBERS ARE PER-SCENE, NOT GLOBAL. useCurrentFrame() inside a <Series.Sequence> is RELATIVE to that scene's own start — it reads 0 on the scene's first frame, in EVERY scene. NEVER offset animation timings by the durations of earlier scenes. A scene-5 entrance written as interpolate(frame, [1240, 1270], [0, 1]) will NEVER fire — frame inside that scene only ever runs from 0 to that scene's own duration, so the element stays invisible for the whole scene. Every inputRange number is local to its scene: entrances near [0, 30], exits near [sceneDuration - 30, sceneDuration] written as plain literals of THAT scene's duration.
5. Each <Series.Sequence durationInFrames={EXACT_NUMBER}> — copy the number EXACTLY. Never compute or round it.
6. Inside each sequence: <Audio src={"EXACT_URL"} /> — copy URLs exactly, NO staticFile() wrapper.

ANIMATION QUALITY — THIS IS THE MOST CRITICAL REQUIREMENT. A boring animation is a failed animation.
The user is paying for animated video lessons. If the animations are generic, static, or visually uninteresting, the product fails entirely. Every scene must feel like a professional motion graphics studio made it.

7. CONTINUOUS MOTION IS NON-NEGOTIABLE. At frame 0, things move. At frame 100, things move. At frame 200, things move. If anything stops moving after its entrance animation, the scene is wrong. Use Math.sin(frame/k), Math.cos(frame/k), and (frame*speed)%360 to guarantee perpetual motion on every element.

7b. PACE THE SCENE ACROSS ITS FULL DURATION. Each scene's durationInFrames matches its narration audio — the visuals must UNFOLD across ALL of it, tracking the story being narrated, not finish building in the first 2 seconds and then idle. Break the scene's content into 3-5 stages and spread their entrances across the timeline: for a 450-frame scene, stagger stage reveals at roughly frames 0, 90, 200, 320 (as plain literals scaled to the actual duration), with the illustrated process (rule 10b) visibly progressing between reveals. Ambient motion (rule 7) is NOT a substitute for narrative progress — a scene where every element has fully appeared by frame 60 and merely wobbles in place for the remaining 390 frames FAILS this rule, because the viewer watches nothing new happen while the narrator keeps explaining.

8. ILLUSTRATE THE EXACT CONCEPT — not generic particles. If the topic is DNA replication, show the double helix unwinding with individual base pairs. If it's photosynthesis, show photons hitting chlorophyll and electrons jumping energy levels. If it's sorting algorithms, show actual elements moving into order. If it's electromagnetism, show field lines rotating. The animation must make the concept VISIBLE — a viewer with no prior knowledge should understand the concept from the visuals alone, without reading the text.
   THE SCENE SPEC IS BINDING: each scene below comes with a visualDescription and onScreenText. The visualDescription is the SPEC — implement the specific elements and actions it names, not a different visual you'd prefer. The onScreenText is the EXACT text to display on screen — render it verbatim as the scene's primary text (plus at most brief supporting labels); do not invent replacement headline text or paraphrase it.

9. THREE MANDATORY LAYERS — all three must exist in every scene:
   - Layer 1 (background): Continuously moving gradient, rotating color field, or drifting particle system. Never static.
   - Layer 2 (concept): The main animated diagram — the thing that illustrates what the scene teaches. This is the star of the scene.
   - Layer 3 (text): Text that springs or fades in. Text must be LEGIBLE and NON-OVERLAPPING at all times:
     · Reserve a clear zone for text (typically a bottom band around y 860-960, or a top band around y 120-220) and keep the Layer 2 diagram OUT of that zone — including its motion range, not just its resting position.
     · Give text a zIndex above the diagram, plus a textShadow (or a subtle dark backing panel) so it stays readable over any background color.
     · Body text >= 28px, titles >= 36px. Never let two text blocks occupy the same position at the same time — if new text replaces old text, fade the old one fully OUT before the new one reaches full opacity.

10. RICHNESS REQUIREMENTS — every scene must have at least:
    - 5+ animated elements (not counting background particles) — richer than a minimal diagram, build a genuinely layered scene
    - At least 2 elements using spring() for staggered, natural entrances (not just one)
    - At least 2 elements using Math.sin/Math.cos with DIFFERENT periods/phases for continuous motion that doesn't look synchronized/robotic
    - A background particle field or ambient motion layer with 30-40 elements, each with independent timing (via index-based delay/phase offsets) — never all moving in lockstep
    - Colors chosen to match the concept (biology = greens, physics = blues/purples, chemistry = warm colors), with a gradient or multi-color palette per scene, not a single flat color
    - Glow effects (boxShadow with color) on EVERY primary element, not just one — layer glows of different intensities to create visual depth
    - At least one element with a secondary/orbiting motion (something moving around another moving thing, not just independent motions)
    - The concept name or key formula as text, appearing with a stagger after the visual is established, plus a secondary supporting text label revealing shortly after

    THIS IS ENFORCED, NOT A SUGGESTION: a scene consisting of only a title fading in over a plain background, with no shape/diagram illustrating the concept, WILL be rejected and regenerated. Every scene needs a real Layer 2 diagram — text alone is never sufficient, no matter how well-animated the text itself is. A scene with only 1-2 simple animated elements and no particle field is UNDER the bar — push for maximum visual density and motion complexity within the line budget.

10b. ILLUSTRATE THE MECHANISM, NOT JUST A LABELED DIAGRAM. This is the single most common way scenes fail even when technically "animated": showing a static shape with a label naming it, instead of showing the actual process happening. A rotating wheel with phase names on it (G1, S, G2, M) is NOT illustrating cell division — it's a spinning label. A straight line representing "DNA unwinding" with no separating motion is NOT illustrating unwinding.
    For ANY process/mechanism concept (something happens, something moves, something transforms, something builds), the animation must show the BEFORE state transforming into the AFTER state over the scene's duration, not just display both states as static labels:
    - "DNA replication" → don't just show two parallel lines labeled 5'/3'. Show individual base pairs (small colored rectangles) actually SEPARATING from each other one at a time (staggered by index/position), with NEW matching bases animating in to pair with each newly-exposed strand.
    - "Cell division phases" → don't just rotate a wheel with phase names. For EACH phase, show the actual cellular structures relevant to that phase appearing/moving — chromosomes condensing and lining up, spindle fibers extending, the cell membrane pinching inward.
    - "Enzyme activity" → don't show a static shape labeled "enzyme." Show the enzyme (a distinct shape) physically moving ALONG a track/strand, with something visibly changing at the point of contact (a base flipping, a bond forming — represented by a small color change or shape change at that exact position, synced to the enzyme's position).
    - "Chemical reaction" → show the actual reactant shapes moving toward each other, colliding/merging, and becoming product shapes — not just displaying reactant and product labels side by side.
    Ask yourself: if I paused this scene at 3 different frames (start, middle, end), would the visual actually look meaningfully different at each point, reflecting real progress in the process? If the answer is no — if it's the same static picture with the same labels the whole time, just with a title fading in — the scene has failed this requirement regardless of how many decorative particles are in the background.

10c. SPATIAL ANCHORING — elements that RELATE to each other must share ONE source of truth for their position. This is the #1 cause of a scene that runs without crashing but still looks WRONG: an arrow pointing at empty space, a label floating away from the thing it names, particles spilling outside the cup that's supposed to hold them, a pointer landing next to its target instead of on it. It happens when you type a coordinate for element A, then SEPARATELY type another coordinate for the arrow/label/particle meant to attach to A — and the two numbers don't actually match, or A moves and its attachment stays put.
    The fix is always the same: compute each position ONCE into a named constant, then have EVERY element that depends on it reference that same constant. Never type the same conceptual position twice — if two elements must line up, they must read from the same variable.

    (a) CONNECTORS (arrows, lines, pointers, brackets) must start and end at the ACTUAL anchor of the things they connect — never at a separately-guessed coordinate.
        const enzymePos = { x: 700, y: 540 };
        const targetPos = { x: 1150, y: 540 };
        - Render the enzyme AT enzymePos and the target AT targetPos (via transform/left/top or cx/cy).
        - Draw the arrow FROM enzymePos TO targetPos by reusing those SAME constants:
          <line x1={enzymePos.x} y1={enzymePos.y} x2={targetPos.x} y2={targetPos.y} ... />
        BAD: enzyme positioned at (700,540) but the arrow hardcoded as x1={720} y1={560} x2={1100} — typed independently, so it drifts off the enzyme and misses the target. That is exactly the "arrow in the wrong place" bug.

    (b) A MOVING target: the connector or label must MOVE WITH it. Compute the live (animated) position ONCE and reference that one value in both the element and whatever attaches to it.
        const targetY = clampPos(540 + Math.sin(frame / 10) * 60, SAFE.yMin, SAFE.yMax);
        // use targetY for BOTH the bobbing element AND the arrow endpoint / label that tracks it
        BAD: the element bobs with Math.sin(frame/…) but the arrow points at a static y=540 — it only lines up on one frame and is visibly wrong for every other frame.

    (c) CONTAINMENT — anything meant to be INSIDE a container (liquid, particles, items in a cup / beaker / box / circle / flask) must be positioned FROM the container's OWN geometry, inset by a margin, and clamped to that inner region. Define the container's bounds once, derive the contents' allowed region from them, and never guess "inside" coordinates independently of where you actually drew the container.
        const cup = { x: 860, y: 500, w: 200, h: 260 }; // the exact box you draw the cup at
        const inner = { xMin: cup.x + 24, xMax: cup.x + cup.w - 24, yMin: cup.y + 44, yMax: cup.y + cup.h - 20 };
        // spawn EVERY particle inside the inner region, and clamp its animated position back into it:
        const px = clampPos(rawX, inner.xMin, inner.xMax);
        const py = clampPos(rawY, inner.yMin, inner.yMax);
        For a ROUND container, keep each particle within (radius − margin) of the container's center — compute dx,dy from the center and, if dx*dx+dy*dy exceeds (R−margin)², pull it back — or just clamp to an inscribed box.
        BAD: cup drawn spanning x=860…1060, but particles spawned at random x across 700…1200 — half of them render outside the cup. That is exactly the "particles out of the cup" bug.

    (d) SELF-CHECK before finishing each scene: for EVERY arrow, label, pointer, and contained element, ask — does its position literally reference the same constant/variable as the thing it attaches to (or derive from that thing's container geometry)? If it uses an independently-typed number, it WILL be misaligned — rewrite it to read from the shared anchor. (These anchor constants belong in positions / transforms / SVG attributes ONLY — they must still never appear inside interpolate()'s input or output arrays per rule 11, and every final position still gets clamped to SAFE or the inner region per rule 14.)

10d. PROPORTION SANITY — size elements according to their ROLE, relative to each other:
    - The main Layer 2 diagram dominates the frame: roughly 40-60% of frame width, centered in the non-text zone.
    - Decorative/background particles stay small (4-16px). Contents are much smaller than their container (a particle inside a 200px-wide cup must be a small fraction of 200px, never comparable to it).
    - Labels are visually subordinate to the thing they label — a label's font size should not exceed the labeled element's own size.
    - If an element's size is a computed/animated value, clamp it to a sane range exactly like positions are clamped — a pulsing circle whose radius formula can hit 0 or 900 is a bug even if it never crashes.

INTERPOLATE SAFETY — these violations CRASH the video at runtime, no exceptions:
11. interpolate() ALWAYS needs exactly 3 arguments: interpolate(value, [in...], [out...]).
    - The 2nd and 3rd arguments (inputRange, outputRange) MUST be array literals written directly in the call — [0, 20] — containing ONLY plain number literals. NEVER a variable holding an array, and NEVER an expression inside the array (no "end - 30", no "i * 8", no "startFrame + 20"). If a value needs to vary, shift the FIRST argument instead — see the staggering technique below — never the array contents.
    - CRASH: interpolate(frame, [startFrame, startFrame + 20], [...]) — startFrame may be undefined = NaN, and this is a variable/expression inside the array either way.
    - CRASH: interpolate(frame, [durationInFrames - 30, durationInFrames], [...]) — durationInFrames is not in scope inside scene components, and it's an expression inside the array regardless.
    - CRASH: interpolate(frame, [end - 30, end], [...]) — even if "end" was itself declared as "const end = 210", referencing it inside the array is still banned. The array must contain the literal numbers themselves: [180, 210].
    - GOOD: interpolate(frame, [0, 20], [0, 1], CLAMP) — plain number literals only, nothing else.
    - If a boundary depends on scene duration, you already know that duration as a plain number (it's given to you per-scene) — write it directly as a literal: interpolate(frame, [180, 210], [1, 0], CLAMP), not a variable reference to it.
    - CRASH: interpolate(frame, [0, 30, 60, 60], [...]) — duplicate 60. Fix: [0, 30, 60, 91]
    - CRASH: interpolate(frame, [300, 320, 466, 466], [...]) — duplicate 466. Fix: [300, 320, 466, 467]
    - CRASH: interpolate(frame, [0, 30]) — missing outputRange. Fix: interpolate(frame, [0, 30], [0, 1])
    - For hold-at-final-value: use 2 values + CLAMP. interpolate(frame, [0, 30], [0, 1], CLAMP) — NOT [0, 30, 30].
    - For staggered elements (e.g. inside a .map over an index i): do NOT put i inside the array — that's banned. Instead shift the VALUE argument: interpolate(frame - i * 8, [0, 20], [0, 1], CLAMP). This gives each element its own staggered start time while keeping the inputRange a plain literal array, exactly as required.
12. NEVER produce NaN in any SVG attribute (cx, cy, r, x, y, width, height, points, d):
    - Guard ALL division: write (value / (denominator || 1)) — never divide without this guard.
    - Guard ALL array access: check i < arr.length before arr[i]. Out-of-bounds = NaN.
    - Math.sin/cos ALWAYS receive a plain number — never undefined, null, or a string.
    - Polygon/polyline points: filter out any NaN before joining: points.filter(p => !isNaN(p.x) && !isNaN(p.y))
    - When using random() or useMemo for positions, ALWAYS validate the result is finite before using it.
12b. spring() MUST be called with BOTH frame AND fps: spring({ frame, fps, config: { ... } }), where fps comes from useVideoConfig() inside the component (const { fps } = useVideoConfig()). Calling spring() without fps throws at runtime and kills the scene. Never hardcode an fps number and never pass undefined — every component that uses spring() must call useVideoConfig() itself (or receive fps as an explicit parameter from a component that did).
12c. NEVER read a property off a value that can be undefined — "Cannot read properties of undefined (reading 'x')" is a real crash that has killed scenes in production. The two patterns that cause it:
    - CONSECUTIVE-ELEMENT ACCESS: connecting point i to point i+1 (lines between anchor points, segment chains, paired elements). points[i + 1] is undefined on the LAST iteration if the loop runs to points.length. Fix: iterate only to length - 1 when the body reads [i + 1] — points.slice(0, -1).map((p, i) => { const next = points[i + 1]; ... }) — or guard explicitly: if (!next) return null; before touching next.x.
    - LOOKUPS THAT CAN MISS: anchors.find(...), anchorMap[key], scenePositions[idx] — any lookup where the key/index might not exist returns undefined, and .x on it crashes. Fix: guard every lookup result before property access (const a = anchors.find(...); if (!a) return null;) or use a guaranteed-complete structure (build the array/object so every index/key you will read is definitely present).
    This applies to EVERY .x / .y / .length / any property read on the result of indexing, find, filter()[0], or object lookup — if the value isn't provably defined, guard it first. A guard that renders nothing (return null) is always better than a crash that kills the whole video.
13. CLAMP entrance animations so elements don't fly off-screen after settling:
    const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
    Use CLAMP for interpolate() entrance animations. For Math.sin/cos continuous motion, CLAMP is NOT needed.
14. THE 1920x1080 FRAME IS A HARD BOUNDARY. Elements that drift to the edges or off-screen are a FAILED scene even if they don't crash — the user simply cannot see them, which is just as bad as a crash. Do NOT compute safe positions by hand for each element. Instead, define these constants ONCE at the top of the file and route every position through them:

    const FRAME = { w: 1920, h: 1080 };
    const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 }; // keep all element CENTERS inside this box
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    Apply this pattern to EVERY positioned element, with no exceptions:
    - Static/random position: const x = clamp(rawX, SAFE.xMin, SAFE.xMax); const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
    - Oscillating (base ± amplitude*sin/cos): compute the raw value, THEN clamp it — never trust that base±amplitude "should" stay in range:
      const rawY = baseY + Math.sin(frame / 10) * amplitude;
      const y = clamp(rawY, SAFE.yMin, SAFE.yMax);
    - Orbiting: radius must satisfy centerX ± radius and centerY ± radius both land within SAFE — i.e. radius ≤ min(centerX - SAFE.xMin, SAFE.xMax - centerX, centerY - SAFE.yMin, SAFE.yMax - centerY). For a center at (960, 540), radius ≤ 420 is always safe.
    - Text: position from SAFE bounds too, and additionally leave ≥80px margin from SAFE's own edges since text has width/height beyond its anchor point.
    - Particles/background elements: also clamp, even though they're decorative — an off-screen particle wastes a draw call and a few stray ones drifting to the edge look like a bug to the viewer.

    This clamp MUST be the last operation applied to any x/y/cx/cy/top/left value before it's used in a style or SVG attribute — clamping the raw input to a formula and then adding more offsets afterward defeats the purpose.

CODE QUALITY:
15. Sum of all durationInFrames MUST equal the total given. Verify before finishing.
16. Inline styles ONLY. No Tailwind, no external CSS, no className for styling.
17. No registerRoot, no Composition.
18. Each scene component should be 200-300 lines — use the full budget to create rich, detailed animations. Extract shared helper components (ParticleBg, OrbitRing, Label) at the top to avoid repetition across scenes.
19. Every <Series.Sequence> must have a positive integer durationInFrames ≥ 1.
20. NEVER write comma-separated expressions directly inside JSX curly braces: {a, b} is invalid JSX. Use separate expressions, or wrap in parens: {(a, b)} — but better to split into separate JSX attributes or elements.
21. NEVER write a literal { or } character directly as JSX text content — JSX treats every { as opening a JS expression, so a bare } with no matching opener is a parse error.
    - CRASH: <div>f(x) = {x²}</div> — the { here isn't a JS expression, it's meant to be literal text, so JSX chokes on it.
    - CRASH: <div>Set notation: {1, 2, 3}</div> — same problem, bare braces in text.
    - CRASH: <div>Config: {{ key: value }}</div> as plain display text (not an actual style object) — same problem.
    - GOOD: if you need to DISPLAY a literal brace character, wrap it as a string expression: <div>f(x) = {"{"}x²{"}"}</div>
    - BETTER: avoid literal braces in on-screen text entirely. Rewrite math/set notation in words or with different symbols: "f of x equals x squared" or use parentheses/brackets instead of braces where the concept allows it.
22. NEVER SHIP A BLANK SCENE — if you build a reusable wrapper component (a shared background, gradient, or container that you place scene content inside, e.g. <SceneBg>...content...</SceneBg>), that wrapper MUST accept children in its props ({ children }: { children?: React.ReactNode }) AND render {children} in its JSX. A wrapper that forgets {children} makes React silently drop everything inside it — the scene renders as just the background with no diagram, no text, no error, and no warning. This is the #1 cause of empty/blank lessons. After writing any wrapper you nest content inside, verify its body actually contains {children}. If in doubt, don't use a content-wrapping component at all — put the background as a sibling <AbsoluteFill> behind the content instead of wrapping the content in it.

WORKED EXAMPLE — two richly animated scenes. Study how EVERY frame has motion, how the concept is illustrated, how layers work together:

\`\`\`tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Series, Audio, Easing } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Frame-boundary safety — defined ONCE, used by every positioned element.
// See rule 14: never hand-compute a "should stay in bounds" position —
// always clamp the final value instead.
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
const clampPos = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A particle that orbits a central nucleus — illustrates atomic structure.
// Motion is CONTINUOUS: orbit never stops, pulse never stops. The orbit
// radius is chosen so centerX/centerY ± radius stays inside SAFE, and the
// final position is still clamped as a last line of defense.
function OrbitingParticle({ radius, speed, size, color, orbitColor, centerX = 960, centerY = 540 }: {
  radius: number; speed: number; size: number; color: string; orbitColor: string; centerX?: number; centerY?: number;
}) {
  const frame = useCurrentFrame();
  const angle = (frame * speed * Math.PI) / 180;
  const rawX = centerX + Math.cos(angle) * radius;
  const rawY = centerY + Math.sin(angle) * radius;
  const x = clampPos(rawX, SAFE.xMin, SAFE.xMax);
  const y = clampPos(rawY, SAFE.yMin, SAFE.yMax);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}>
      <div style={{
        position: "absolute",
        width: size, height: size,
        borderRadius: "50%",
        backgroundColor: color,
        transform: \`translate(\${x - size / 2}px, \${y - size / 2}px)\`,
        boxShadow: \`0 0 \${size * 1.5}px \${orbitColor}\`,
      }} />
    </div>
  );
}

function AtomScene({ label }: { label: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Entrance: nucleus springs in
  const nucleusScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  // Continuous: nucleus pulses with sine wave
  const pulse = 1 + Math.sin(frame / 12) * 0.08;
  // Label fades in with custom easing
  const labelOpacity = interpolate(frame, [20, 50], [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
  });
  // Background hue slowly rotates
  const hue = (frame * 0.3) % 360;

  return (
    <AbsoluteFill style={{
      background: \`radial-gradient(circle at 50% 50%, hsl(\${hue}, 30%, 15%), #0a0a1a)\`,
      justifyContent: "center", alignItems: "center",
    }}>
      {/* Nucleus */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        backgroundColor: "#f59e0b",
        transform: \`scale(\${nucleusScale * pulse})\`,
        boxShadow: "0 0 40px #f59e0b, 0 0 80px #f59e0b55",
        position: "relative", zIndex: 2,
      }} />
      {/* Orbiting electrons at different radii and speeds */}
      <OrbitingParticle radius={120} speed={2.4} size={20} color="#60a5fa" orbitColor="#3b82f6" />
      <OrbitingParticle radius={180} speed={1.6} size={16} color="#a78bfa" orbitColor="#7c3aed" />
      <OrbitingParticle radius={240} speed={1.0} size={14} color="#34d399" orbitColor="#059669" />
      {/* Label */}
      <div style={{
        position: "absolute", bottom: 180,
        color: "white", fontSize: 36, fontWeight: 700,
        opacity: labelOpacity, letterSpacing: 2,
        textShadow: "0 2px 20px rgba(0,0,0,0.8)",
      }}>{label}</div>
    </AbsoluteFill>
  );
}

// A wave propagation scene — illustrates how waves travel through a medium.
// Every point on the wave oscillates continuously with a phase offset.
function WaveScene({ label }: { label: string }) {
  const frame = useCurrentFrame();
  const points = 32;
  const labelOpacity = interpolate(frame, [10, 40], [0, 1], CLAMP);

  // SPATIAL ANCHORING (rule 10c): compute each point's position ONCE, then let
  // BOTH the circles AND the connecting line read from it. It's tempting to
  // type the same y = 200 + Math.sin(...) formula separately in each place —
  // don't. Any drift between the two copies makes the line peel away from the
  // dots. One shared source of truth guarantees they always coincide.
  const wavePoints = Array.from({ length: points }, (_, i) => {
    const x = (i / (points - 1)) * 1920;
    const phase = (i / points) * Math.PI * 4;
    const y = 200 + Math.sin(frame / 10 + phase) * 80;
    const brightness = (Math.sin(frame / 10 + phase) + 1) / 2;
    return { x, y, brightness };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
      <svg width={1920} height={400} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)" }}>
        {/* Wave made of individually oscillating circles for a particle-wave look */}
        {wavePoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={8}
            fill={"hsl(" + (200 + p.brightness * 60) + ", 80%, " + (40 + p.brightness * 40) + "%)"}
            opacity={0.6 + p.brightness * 0.4}
          />
        ))}
        {/* Connecting line — reuses the SAME wavePoints, so it can never drift off the dots */}
        <polyline
          points={wavePoints.map((p) => \`\${p.x},\${p.y}\`).join(" ")}
          fill="none"
          stroke="rgba(96,165,250,0.4)"
          strokeWidth={2}
        />
      </svg>
      <div style={{
        position: "absolute", bottom: 160,
        color: "white", fontSize: 36, fontWeight: 700,
        opacity: labelOpacity, textShadow: "0 2px 20px rgba(0,0,0,0.9)",
      }}>{label}</div>
    </AbsoluteFill>
  );
}

export const LessonExample = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={210}>
        <Audio src={"https://example.com/audio/scene1.mp3"} />
        <AtomScene label="Electrons orbit the nucleus" />
      </Series.Sequence>
      <Series.Sequence durationInFrames={240}>
        <Audio src={"https://example.com/audio/scene2.mp3"} />
        <WaveScene label="Waves propagate through a medium" />
      </Series.Sequence>
    </Series>
  );
};
\`\`\`

Every scene above has motion on EVERY frame. The atom's nucleus pulses, electrons orbit, background hue shifts. The wave's particles oscillate continuously. There is no static frame. Build every scene in your lesson to this standard.

FINAL SELF-CHECK — before finishing, make ONE verification pass over your code and confirm ALL of these:
1. Exactly one <Series.Sequence> per scene, in the given order, each durationInFrames copied EXACTLY, and their sum equals the given TOTAL FRAMES.
2. Every scene contains its <Audio src={"..."} /> with the URL copied character-for-character from the scene table.
3. No useState, no bare <Sequence>, no staticFile, no imports from anything except "react" and "remotion".
4. Every interpolate() call: exactly 3 arguments (plus optional options object), input/output ranges are literal number arrays of equal length, inputRange strictly increasing, no variables or expressions inside the arrays.
5. Every spring() call receives both frame and fps from useVideoConfig() (rule 12b).
6. Every positioned element's FINAL x/y passes through clamp to SAFE — or to its container's inner region (rules 10c, 14).
7. Every arrow, pointer, label, and contained element reads its position from the SAME constant/variable as the thing it attaches to or lives inside (rule 10c) — no independently-typed coordinates for related elements.
8. Every wrapper component that content is nested inside actually renders {children} in its body (rule 22).
9. Each scene: motion on every frame (rule 7), the illustrated process visibly progresses across the FULL scene duration (rules 7b, 10b), text is verbatim onScreenText, legible, in its reserved zone, never overlapping the diagram or other text (rules 8, 9).
10. All animation timings use scene-LOCAL frame numbers starting at 0 — no offsets from earlier scenes' durations (rule 4b).
11. No property read (.x, .y, etc.) on the result of arr[i + 1], find(), filter()[0], or a keyed lookup without a bounds/existence guard (rule 12c) — every loop whose body reads [i + 1] iterates only to length - 1.
If any check fails, fix the code before returning it. Do not return code that fails a check.

Begin with imports, then the CLAMP constant and the FRAME / SAFE / clamp position constants (rule 14), then shared helper components, then the main component.
`;

function buildPerLessonContent(lesson, componentName, scenes, totalFrames) {
  const sceneTable = scenes
    .map(
      (s, i) =>
        `Scene ${i + 1}: durationInFrames=${s.durationInFrames}, audioUrl="${s.audioUrl}", targetLines=200-300
   visualType: ${s.visualType}
   onScreenText: ${s.onScreenText}
   visualDescription: ${s.visualDescription}`
    )
    .join("\n\n");

  return `
LESSON: ${lesson.title}
COMPONENT NAME: ${componentName}
TOTAL FRAMES: ${totalFrames}
TOTAL SCENES: ${scenes.length}
LINE BUDGET: 200-300 lines per scene — use the full budget to create rich, detailed animations. Shared helper components don't count toward per-scene budget.

SCENES (in order) — build one <Series.Sequence> per scene, in this exact order, with these EXACT durations:

${sceneTable}
`;
}

// ── Auto-fix common GLM-5.2 code generation errors ───────────────────────────
// These are systematic mistakes GLM-5.2 makes even with strict prompt rules.
// IMPORTANT: every fix here is text-level, not AST-level, which means each
// one carries some risk of mutating already-correct code. To keep that risk
// low:
//   - Only fixes with a very low false-positive surface are kept.
//   - Anything ambiguous now THROWS instead of guessing, so it triggers a
//     regeneration attempt rather than silently shipping mangled code.
//   - Every fix that fires logs what it changed, so corruption introduced by
//     this function is visible in logs instead of indistinguishable from a
//     model mistake.
function autoFixCode(code, { totalFrames } = {}) {
  let fixed = code;
  const notes = [];

  // Fix 1: kebab-case CSS property names → camelCase JSX equivalents.
  // Low risk: these patterns only match inside object-literal-style
  // `property:` positions and camelCase is unambiguous.
  const cssPropertyMap = {
    "transform-origin": "transformOrigin",
    "background-color": "backgroundColor",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "font-family": "fontFamily",
    "border-radius": "borderRadius",
    "box-shadow": "boxShadow",
    "text-shadow": "textShadow",
    "letter-spacing": "letterSpacing",
    "line-height": "lineHeight",
    "text-align": "textAlign",
    "z-index": "zIndex",
    "flex-direction": "flexDirection",
    "justify-content": "justifyContent",
    "align-items": "alignItems",
    "pointer-events": "pointerEvents",
  };
  for (const [kebab, camel] of Object.entries(cssPropertyMap)) {
    const pattern = new RegExp(`["']?${kebab}["']?\\s*:`, "g");
    let count = 0;
    fixed = fixed.replace(pattern, () => {
      count++;
      return `${camel}:`;
    });
    if (count) notes.push(`renamed CSS property ${kebab} -> ${camel} (x${count})`);
  }

  // Fix 1b: kebab-case SVG *attributes* in JSX (stroke-width={2} crashes
  // just like kebab style keys do). Pattern anchors on the "=" so it can't
  // touch style-object keys (those use ":") or prose in strings (which
  // almost never contains kebab-word= sequences).
  const svgAttrMap = {
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-opacity": "strokeOpacity",
    "fill-opacity": "fillOpacity",
    "text-anchor": "textAnchor",
    "dominant-baseline": "dominantBaseline",
    "clip-path": "clipPath",
  };
  for (const [kebab, camel] of Object.entries(svgAttrMap)) {
    const pattern = new RegExp(`\\b${kebab}=`, "g");
    let count = 0;
    fixed = fixed.replace(pattern, () => {
      count++;
      return `${camel}=`;
    });
    if (count) notes.push(`renamed SVG attribute ${kebab} -> ${camel} (x${count})`);
  }

  // Fix 2: Duplicate/non-increasing inputRange values in interpolate() calls.
  // Only touches interpolate() calls whose entire inputRange is plain
  // numeric literals — anything containing a variable/expression is left
  // untouched, since we can't safely reason about its runtime value.
  fixed = fixed.replace(
    /interpolate\s*\(\s*([^,]+),\s*\[([^\]]+)\]/g,
    (match, value, rangeStr) => {
      const parts = rangeStr.split(",").map((s) => s.trim());
      const nums = parts.map(Number);
      if (nums.some((n) => Number.isNaN(n))) return match; // has a variable — skip
      let changed = false;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i - 1]) {
          nums[i] = nums[i - 1] + 1;
          changed = true;
        }
      }
      if (changed) notes.push(`fixed non-increasing interpolate inputRange near "${value.trim()}"`);
      return `interpolate(${value}, [${nums.join(", ")}]`;
    }
  );

  // Fix 2b: unbounded Math.random() * 1920 / * 1080 used directly as a
  // position. This is the single most common cause of elements drifting
  // off-screen — the prompt rule asks for an inset SAFE range, but the
  // model sometimes reaches for the raw canvas dimensions anyway. Rewrite
  // to a safely-inset range (100px margin on each side) rather than relying
  // solely on the model following the SAFE-constant pattern correctly.
  let widthFixCount = 0;
  fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1920(?!\d)/g, () => {
    widthFixCount++;
    return "(100 + Math.random() * 1720)";
  });
  if (widthFixCount) {
    notes.push(`clamped unbounded Math.random() * 1920 position to a safe inset range (x${widthFixCount})`);
  }
  let heightFixCount = 0;
  fixed = fixed.replace(/Math\.random\(\)\s*\*\s*1080(?!\d)/g, () => {
    heightFixCount++;
    return "(100 + Math.random() * 880)";
  });
  if (heightFixCount) {
    notes.push(`clamped unbounded Math.random() * 1080 position to a safe inset range (x${heightFixCount})`);
  }

  // Fix 3: bare `durationInFrames` used where it isn't in scope.
  //
  // Critical nuance the old version missed: `durationInFrames` is sometimes
  // a PERFECTLY LEGITIMATE identifier —
  //   const { durationInFrames } = useVideoConfig();
  //   function Scene({ durationInFrames }: { durationInFrames: number }) { ... }
  // The old blanket substitution turned the destructuring itself into
  // `const { fps, 450 } = useVideoConfig()` — a syntax error we introduced
  // ourselves. So: if the code DECLARES the identifier anywhere (const/let/
  // var, destructuring, or a destructured function parameter), leave every
  // occurrence alone — it's in scope. Only when it's used with NO
  // declaration anywhere do we substitute the known totalFrames.
  //
  // The substitution pattern also now excludes property access
  // (`scene.durationInFrames` must not become `scene.450`) via a negative
  // lookbehind, in addition to the existing exclusions for JSX props
  // (`durationInFrames={...}`) and object keys (`durationInFrames: ...`).
  const declaresDurationInFrames =
    /(?:const|let|var)\s+durationInFrames\b/.test(fixed) ||
    /(?:const|let|var)\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}\s*=/.test(fixed) ||
    /\(\s*\{[^{}]*\bdurationInFrames\b[^{}]*\}/.test(fixed);

  const bareUsePattern = /(?<!\.)\bdurationInFrames\b(?!\s*[=:])/;
  if (!declaresDurationInFrames && bareUsePattern.test(fixed)) {
    const fallback = Number.isFinite(totalFrames) ? totalFrames : null;
    if (fallback === null) {
      throw contentError(
        "Code references out-of-scope `durationInFrames` and no totalFrames was provided to safely substitute — regenerating."
      );
    }
    notes.push(`substituted out-of-scope durationInFrames -> ${fallback}`);
    fixed = fixed.replace(/(?<!\.)\bdurationInFrames\b(?!\s*[=:])/g, `${fallback}`);
  }

  // Fix 4: common HTML-attribute-in-JSX slips. (`\bfor=` cannot touch
  // `htmlFor=` — the pattern is case-sensitive and "htmlFor" contains "For",
  // not "for". `for (` loops have no "=" and are also untouched.)
  fixed = fixed.replace(/\bclass=/g, "className=");
  fixed = fixed.replace(/\bfor=/g, "htmlFor=");

  // Fix 5: unterminated template literal — trailing corruption at end of file.
  // Previously this guessed a closing wrapper (`);\n}`) that may not match
  // the actual function shape, which can produce code that's still invalid
  // in a new way. That's a worse outcome than failing loudly, so this now
  // throws to force a regeneration attempt instead of guessing.
  const backtickCount = (fixed.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    throw contentError("Unterminated template literal detected — regenerating instead of guessing a fix.");
  }

  // (The old Fix 6 — stripping `;;` and trailing commas — has been removed
  // on purpose. Both are VALID JavaScript/TypeScript that compile fine, so
  // the fix repaired nothing, while the text-level regexes could mutate
  // those character sequences inside string literals shown on screen. A
  // "fix" whose only possible effect is a false positive shouldn't exist.)

  if (notes.length) {
    console.log(`  [autofix] Applied: ${notes.join(" | ")}`);
  }

  return fixed;
}

// ── Enforce correct audio URLs — don't trust the model to copy them right ───
// GLM-5.2 (and any LLM) can occasionally mistype a single character when
// transcribing a long, random UUID into generated code — e.g. writing
// "...ba3e-..." as "...be3e-..." in an <Audio src="..."> tag. The rest of the
// URL matches perfectly, but that one scene's audio silently 404s forever,
// since the file that URL points to was never actually created.
//
// Rather than hoping the model copies a 36-character random string
// perfectly every time, we enforce it deterministically: scenes are always
// wired into <Series.Sequence> tags IN ORDER, so we can match each
// <Audio src="..."> occurrence (in the order it appears) to the
// corresponding scene in our own `scenes` array — which has the guaranteed-
// correct, actually-existing-on-disk URL — and force-replace it if it
// doesn't match exactly.
//
// Matches BOTH forms the model actually emits — src={"url"} (the form the
// prompt asks for) and the plain-attribute slip src="url" — and tolerates
// other attributes appearing before src. The old single-pattern version
// silently skipped any <Audio> tag not written in the exact braced style,
// which meant a mistyped URL in the plain form shipped uncorrected.
function enforceCorrectAudioUrls(code, scenes) {
  let sceneIndex = 0;
  let mismatchCount = 0;
  let audioTagCount = 0;

  const audioSrcPattern = /<Audio\b[^>]*?src=(?:\{\s*"([^"}]+)"\s*\}|"([^">]+)")/g;

  const fixed = code.replace(audioSrcPattern, (match, bracedUrl, plainUrl) => {
    audioTagCount++;
    if (sceneIndex >= scenes.length) return match; // more Audio tags than scenes — leave as-is, structural mismatch is reported below
    const foundUrl = bracedUrl ?? plainUrl;
    const correctUrl = scenes[sceneIndex].audioUrl;
    sceneIndex++;

    if (foundUrl !== correctUrl) {
      mismatchCount++;
      console.warn(
        `  [audio-url-fix] Scene ${sceneIndex}: model wrote a URL that doesn't match the real file — correcting it.\n` +
        `    Model wrote:  ${foundUrl}\n` +
        `    Correct URL:  ${correctUrl}`
      );
      return match.replace(foundUrl, correctUrl);
    }
    return match;
  });

  if (audioTagCount !== scenes.length) {
    console.warn(
      `  [audio-url-fix] Structural mismatch: expected ${scenes.length} <Audio> tags (one per scene), found ${audioTagCount}. Leaving for validateGeneratedCode to reject if invalid.`
    );
  }
  if (mismatchCount > 0) {
    console.warn(`  [audio-url-fix] Corrected ${mismatchCount} mismatched audio URL(s) out of ${scenes.length} scenes.`);
  }

  return fixed;
}

async function generateLessonCode(
  lesson,
  componentName,
  scenes,
  totalFrames,
  maxAttempts = 3
) {
  let lastError = null;
  // When an attempt fails on CONTENT (validation, critic, truncation), the
  // next attempt tells the model exactly what was wrong. Retrying blind with
  // the identical prompt — as the old version did — frequently reproduces
  // the identical mistake, since the model's failure was deterministic-ish,
  // not random. Transport failures (connection errors, rate limits) don't
  // set this, since the prompt wasn't the problem.
  let contentFeedback = null;
  const lessonStart = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Reset per attempt: only errors thrown AFTER the stream was fully
    // received count as content errors worth feeding back to the model.
    let receivedFullOutput = false;

    try {
      console.log(
        `  [code] Attempt ${attempt}/${maxAttempts} for ${componentName}...`
      );

      const userContent =
        buildPerLessonContent(lesson, componentName, scenes, totalFrames) +
        (contentFeedback
          ? `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED for this exact reason:\n"${contentFeedback}"\nRegenerate the code from scratch and make absolutely sure this specific problem does not occur again.`
          : "");

      // The ENTIRE request lifetime — opening the stream AND consuming every
      // chunk — runs inside the limiter, so the concurrency slot is held for
      // as long as the HTTP connection is actually open. Releasing the slot
      // at create()-resolution (as before) allowed unbounded overlapping
      // streams, which is exactly the connection-spike problem the limiter
      // exists to prevent.
      const { text, stopReason } = await limitGlmCall(async () => {
        const stream = await glmClient.chat.completions.create({
          model: "glm-5.2",
          thinking: { type: "disabled" },
          max_tokens: 100000,
          stream: true,
          messages: [
            {
              role: "system",
              content: CODE_GEN_STATIC_RULES,
            },
            {
              role: "user",
              content: userContent,
            },
          ],
        });

        let streamedText = "";
        let finishReason = null;

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          // Only collect actual content, not reasoning_content tokens
          if (delta?.content) streamedText += delta.content;
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        }

        return { text: streamedText, stopReason: finishReason };
      });

      receivedFullOutput = true;

      if (stopReason === "length") {
        throw contentError("Hit max_tokens — code was truncated. Generate more compact code.");
      }

      // Strip markdown fences ONLY at the very start and very end of the
      // output. The old global strip (/```/g anywhere) could eat backtick
      // sequences living inside the generated code's own template literals,
      // corrupting valid code.
      let code = text.trim();
      code = code
        .replace(/^```(?:tsx|typescript|ts|jsx|js)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      // Detect plain text output — GLM-5.2 sometimes ignores the prompt and
      // outputs topic descriptions instead of TSX code. Catch this early.
      if (
        !code.startsWith("import") &&
        !code.startsWith("const") &&
        !code.startsWith("//") &&
        !code.startsWith("/*") &&
        !code.startsWith("export")
      ) {
        throw contentError("Model output plain text instead of TSX code — you MUST output only TSX code starting with `import`.");
      }

      // ── Auto-fix common GLM-5.2 output errors ─────────────────────────────
      const fixedCode = autoFixCode(code, { totalFrames });

      // ── Force-correct any mistyped audio URLs — don't trust the model's
      // ability to transcribe long UUID strings perfectly. This is what
      // actually fixes the "one random scene has no audio" bug.
      const audioFixedCode = enforceCorrectAudioUrls(fixedCode, scenes);

      const validatedCode = validateGeneratedCode(audioFixedCode, componentName, totalFrames);

      const review = await reviewGeneratedCode(validatedCode, lesson);
      if (!review.skipped && review.ok === false) {
        // A failed review counts as a failed attempt and triggers a
        // regeneration — and the critic's specific findings become the
        // feedback for the next attempt, so it isn't just a blind reroll.
        throw contentError(
          `Code critic flagged issues: ${review.issues?.join("; ") || "unspecified"}`
        );
      }

      const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
      console.log(
        `  [code] Valid code generated (${validatedCode.length} chars) — took ${elapsedSec}s for ${componentName}`
      );
      return validatedCode;
    } catch (err) {
      lastError = err;

      if (isNonRetryable(err)) {
        throw new Error(
          `Lesson code generation failed with a non-retryable error (check ZAI_API_KEY): ${describeError(err)}`
        );
      }

      // Content errors (anything thrown after the full stream arrived, or
      // explicitly tagged) get fed back to the model on the next attempt.
      if (err.isContentError || receivedFullOutput) {
        contentFeedback = err.message;
      }

      console.warn(
        `  [code] Attempt ${attempt} failed: ${describeError(err)}. Retrying...`
      );
      if (attempt < maxAttempts) await backoffDelay(attempt);
    }
  }

  const elapsedSec = ((Date.now() - lessonStart) / 1000).toFixed(1);
  throw new Error(
    `Failed to generate valid lesson code after ${maxAttempts} attempts (${elapsedSec}s elapsed): ${lastError ? describeError(lastError) : "unknown error"}`
  );
}

module.exports = { generateCoursePlan, generateLessonCode };