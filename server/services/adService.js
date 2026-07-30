const Anthropic = require("@anthropic-ai/sdk");
const { recordAiUsage } = require("./aiUsageService");

const AD_PLAN_MODEL = "claude-haiku-4-5-20251001";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Best-effort fetch of a product website's visible text to ground the script.
// Never throws — a failed/blocked fetch just means we plan from the description
// alone. Strips tags crudely and caps length.
async function fetchWebsiteText(url) {
  if (!url) return "";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "LevelUpBot/1.0" } });
    clearTimeout(t);
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

// How many scenes for the target length. Ads move fast — short beats.
function sceneCountFor(durationTarget) {
  return durationTarget >= 60 ? "10 to 13" : "6 to 8";
}

// Produce the ad script as ordered scenes. Returns [{ role, script, onScreenText, visualDescription }].
async function generateAdPlan(ad, { userId = null, adId = null } = {}) {
  const websiteText = await fetchWebsiteText(ad.websiteUrl);
  const count = sceneCountFor(ad.durationTarget || 30);

  const schema = `{
  "scenes": [
    { "role": "hook|problem|solution|feature|proof|cta",
      "script": "one punchy voiceover line (max ~18 words)",
      "onScreenText": "the few big words shown on screen for this beat",
      "visualDescription": "what animates in this scene, product-forward and specific" }
  ]
}`;

  const prompt = `You are an award-winning advertising creative director. Write the script for a ${ad.durationTarget || 30}-second product ad.

PRODUCT: ${ad.productName}
WHAT IT IS: ${ad.description}
CALL TO ACTION: ${ad.cta || "Get started today"}
${websiteText ? `\nFROM THEIR WEBSITE (use for accurate detail):\n${websiteText}\n` : ""}

Structure it as a real ad arc: a scroll-stopping HOOK, a relatable PROBLEM, the SOLUTION/product reveal, 2–4 rapid FEATURE/benefit beats, optional PROOF, and a CTA end card using the call to action.

Return ${count} scenes. Rules:
- Voiceover lines are SHORT and punchy — this is a commercial, not a lecture.
- onScreenText is a few big words, not full sentences.
- Everything specific to THIS product — never generic filler.
- The last scene MUST be role "cta" and end on the call to action.
- Respond with ONLY valid JSON, no markdown, exactly this shape:
${schema}`;

  const message = await client.messages.create({
    model: AD_PLAN_MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  if (message.usage) {
    recordAiUsage({
      kind: "ad-plan",
      provider: "claude",
      model: AD_PLAN_MODEL,
      userId,
      adId,
      promptTokens: message.usage.input_tokens || 0,
      completionTokens: message.usage.output_tokens || 0,
      cachedTokens: message.usage.cache_read_input_tokens || 0,
    });
  }

  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");

  // Reuse simple brace extraction (self-contained here to avoid cross-imports).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Ad planner returned no JSON");
  const parsed = JSON.parse(text.slice(start, end + 1));

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Ad planner returned no scenes");
  }
  // Ensure the last scene is a CTA.
  const last = parsed.scenes[parsed.scenes.length - 1];
  if (last && last.role !== "cta") last.role = "cta";

  return parsed.scenes;
}

module.exports = { generateAdPlan };