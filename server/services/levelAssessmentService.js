// services/levelAssessmentService.js
//
// Runs a short, adaptive multiple-choice conversation BEFORE a course is
// generated, to figure out whether the learner is a beginner, intermediate,
// or advanced on their chosen topic. The result ("level") is later fed into
// generateCoursePlan so the course is pitched at the right starting point.
//
// Two functions:
//   1. streamNextQuestion — given the topic and the conversation so far,
//      streams the AI's next MCQ question token-by-token (for the live
//      "typing" effect), then returns the structured question (text +
//      options) at the end.
//   2. determineLevel — after enough questions are answered, asks the model
//      to output a final beginner/intermediate/advanced verdict.
//
// The conversation is intentionally short: MAX_QUESTIONS keeps it to a quick
// 3-4 exchange check, not a full exam.

const OpenAI = require("openai");

// GPT-5.6 Luna via OpenRouter's OpenAI-compatible endpoint — same
// account/key as the rest of the app's AI calls (see claudeService.js,
// ttsService.js). maxRetries: the SDK auto-retries failed requests
// (including network timeouts like ETIMEDOUT) this many times with backoff
// before giving up — important for unstable connections. timeout: how long
// to wait per attempt.
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  maxRetries: 3,
  timeout: 60 * 1000,
});

const MODEL = "openai/gpt-5.6-luna"; // fast, fine for short MCQs (was DeepSeek V4 Flash)
const MAX_QUESTIONS = 3;

// Builds the system prompt that defines how the assessor behaves.
function buildSystemPrompt(topic) {
  return `You are a warm, welcoming tutor having a brief chat with someone BEFORE building them a course on "${topic}". Your goal is to understand THEIR BACKGROUND so the course can be pitched at the right level — you are NOT testing their knowledge.

Ask ONE friendly multiple-choice question at a time about who they are as a learner. Across the short conversation, cover these areas (one per question, in a natural order):
1. Their education level or background (e.g. high school, undergraduate, graduate, working professional, just curious).
2. How familiar they already are with "${topic}" specifically (e.g. brand new to it, seen it before, studied it, use it regularly).
3. Their goal for learning it (e.g. preparing for an exam, personal curiosity, work/career, deep mastery).

Rules for each question:
- These are SELF-REPORT questions about the person — never quiz them on facts about "${topic}".
- Keep it warm and conversational, like a tutor getting to know a new student.
- Adapt the wording naturally to "${topic}" so it feels personal, not generic.
- Always provide exactly 4 answer options that are realistic, distinct choices.
- Include a short, natural lead-in sentence before each question (e.g. "First, to get a sense of where you're coming from —" or "Great — and how familiar are you with this already?").
- Output ONLY a single JSON object in this exact shape, nothing else:
{
  "intro": "short conversational lead-in sentence",
  "question": "the question text",
  "options": ["option A", "option B", "option C", "option D"]
}`;
}

// Converts our stored conversation turns into OpenAI-style message format.
// `turns` is an array of { question, options, answer } objects representing
// what's already been asked and how the user replied.
function buildMessages(turns) {
  const messages = [];
  for (const turn of turns) {
    // The assistant's previous question (as JSON, matching what we asked for).
    messages.push({
      role: "assistant",
      content: JSON.stringify({
        intro: turn.intro ?? "",
        question: turn.question,
        options: turn.options,
      }),
    });
    // The user's selected answer.
    messages.push({
      role: "user",
      content: `I choose: "${turn.answer}". Ask the next question.`,
    });
  }
  // If no turns yet, kick off the very first question.
  if (turns.length === 0) {
    messages.push({ role: "user", content: "Ask me the first question." });
  }
  return messages;
}

// Streams the next question. `onToken` is called with each text chunk as it
// arrives (for SSE). Returns the fully-assembled raw text at the end so the
// caller can parse the final JSON.
//
// Wrapped in a small retry loop because streaming connections are more
// fragile than normal requests on unstable networks — if the stream fails
// before producing any text, we retry once or twice rather than failing the
// whole assessment. (We only retry if NO text was emitted yet, to avoid
// showing the user duplicated/partial question text.)
async function streamNextQuestion(topic, turns, onToken, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let fullText = "";
    let emittedAny = false;
    try {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 400,
        // Off: this is a live "typing" question generator — reasoning would
        // add latency to what should feel instant, and writing one simple
        // self-report MCQ doesn't need it.
        reasoning: { enabled: false },
        // Pin to OpenAI's own backend — mostly a formality for a closed
        // model (unlike GLM/DeepSeek's open weights, OpenRouter has nowhere
        // else to route this), kept for consistency with every other
        // provider in this codebase (see claudeService.js's
        // CODE_PROVIDERS.glm for why this matters much more for open-weight
        // models).
        provider: { only: ["openai"] },
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(topic) },
          ...buildMessages(turns),
        ],
      });

      for await (const chunk of stream) {
        const textChunk = chunk.choices?.[0]?.delta?.content;
        if (textChunk) {
          fullText += textChunk;
          emittedAny = true;
          onToken(textChunk);
        }
      }

      return fullText;
    } catch (err) {
      lastErr = err;
      console.warn(`[assessment] stream attempt ${attempt} failed:`, err.message);
      // If we already streamed visible text to the user, don't retry —
      // retrying would duplicate text. Fail out to the caller's handler.
      if (emittedAny) throw err;
      // Otherwise wait briefly and try again.
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw lastErr;
}

// After the conversation, ask the model for a final level verdict. Returns
// one of: "beginner" | "intermediate" | "advanced".
async function determineLevel(topic, turns) {
  const transcript = turns
    .map((t, i) => `Q${i + 1}: ${t.question}\nThey answered: "${t.answer}"`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 50,
    reasoning: { enabled: false }, // a one-word verdict needs no reasoning
    provider: { only: ["openai"] }, // pin to OpenAI's own backend — see streamNextQuestion's call above for why
    messages: [
      {
        role: "system",
        content: `You determine what level to pitch a course on "${topic}" at, based on a learner's SELF-REPORTED background (their education, prior familiarity with the topic, and goal). Weigh familiarity with the specific topic most heavily, then education/background, then goal. Respond with ONLY one lowercase word: "beginner", "intermediate", or "advanced". No punctuation, no explanation.`,
      },
      {
        role: "user",
        content: `Here's what they told me about themselves:\n\n${transcript}\n\nWhat level should their course be pitched at?`,
      },
    ],
  });

  const raw = (response.choices?.[0]?.message?.content || "").toLowerCase().trim();
  if (raw.includes("advanced")) return "advanced";
  if (raw.includes("intermediate")) return "intermediate";
  return "beginner"; // safe default
}

module.exports = { streamNextQuestion, determineLevel, MAX_QUESTIONS };