// controllers/levelAssessmentController.js
//
// Exposes the adaptive level-check conversation to the frontend.
//
// Because the AI's question needs to stream in token-by-token (for the
// live "typing" effect), the /next-question endpoint uses Server-Sent
// Events (SSE) instead of a normal JSON response: it holds the connection
// open and pushes chunks as they arrive, then a final "done" event with the
// parsed question object.

const {
  streamNextQuestion,
  determineLevel,
  MAX_QUESTIONS,
} = require("../services/levelAssessmentService");
const { escapeStrayBackslashes } = require("../services/claudeService");

// Same defensive JSON parsing used elsewhere — the model occasionally wraps
// its JSON in stray text or markdown fences.
function safeParseJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) clean = clean.slice(first, last + 1);
  clean = clean.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(clean);
  } catch (err) {
    // Same shared repair the scene plan needs: a stray backslash (LaTeX in a
    // maths topic) is an invalid JSON escape and would kill the question.
    try {
      return JSON.parse(escapeStrayBackslashes(clean));
    } catch {
      throw err;
    }
  }
}

// POST /api/assessment/next-question  (SSE response)
// Body: { topic: string, turns: [{ intro, question, options, answer }] }
//
// Streams the next question's text as it generates, then emits a final
// "done" event containing the structured { intro, question, options } object
// plus whether this was the last question.
exports.nextQuestionHandler = async (req, res) => {
  const { topic, turns = [] } = req.body;

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "topic is required" });
  }

  // Set up SSE headers.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const rawText = await streamNextQuestion(topic, turns, (chunk) => {
      // Stream each text chunk to the client as it arrives.
      send("token", { text: chunk });
    }, 3, { userId: req.user._id });

    // Parse the completed JSON question and send it as the final structured
    // payload so the frontend can render tappable options.
    let parsed;
    try {
      parsed = safeParseJson(rawText);
    } catch (parseErr) {
      console.error("Failed to parse assessment question JSON:", rawText);
      send("error", { message: "Could not generate a valid question." });
      return res.end();
    }

    // After this answer, will we have reached the max? turns.length is how
    // many have ALREADY been answered; this new one makes it +1.
    const isLastQuestion = turns.length + 1 >= MAX_QUESTIONS;

    send("done", {
      intro: parsed.intro ?? "",
      question: parsed.question,
      options: parsed.options,
      isLastQuestion,
      questionNumber: turns.length + 1,
      totalQuestions: MAX_QUESTIONS,
    });
    res.end();
  } catch (err) {
    console.error("nextQuestionHandler error:", err);
    send("error", { message: "Assessment failed. You can skip and continue." });
    res.end();
  }
};

// POST /api/assessment/determine-level  (normal JSON response)
// Body: { topic: string, turns: [...] }
// Returns: { level: "beginner" | "intermediate" | "advanced" }
exports.determineLevelHandler = async (req, res) => {
  try {
    const { topic, turns = [] } = req.body;
    if (!topic) return res.status(400).json({ error: "topic is required" });

    const level = await determineLevel(topic, turns, { userId: req.user._id });
    res.json({ level });
  } catch (err) {
    console.error("determineLevelHandler error:", err);
    // Non-fatal — if this fails, the frontend should just proceed without a
    // level (course generates at default depth).
    res.status(500).json({ error: "Could not determine level", level: null });
  }
};