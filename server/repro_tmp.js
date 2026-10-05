require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");
const client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });

const src = fs.readFileSync("services/claudeService.js", "utf8");
const re = /^const LESSON_CHUNK_RULES = `/m;
const m = re.exec(src);
const start = m.index + m[0].length;
const end = src.indexOf("\n`;", start);
const systemPrompt = src.slice(start, end);

const fakeHeader = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing, random } from "remotion";
import { useMemo, useCallback, useRef } from "react";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
const clampPos = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SVG_FRAME = { position: "absolute", left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none", overflow: "visible" };
const ZONES = { stage: { x: 120, y: 120, w: 1680, h: 840, cx: 960, cy: 540 } };
const PALETTE = { base: "#0A0E1A", accent: "#39D2C0", support: "#F5A623", text: "#F4F6FC" };
const Backdrop = () => { const frame = useCurrentFrame(); return <div style={{position:"absolute",left:0,top:0,width:FRAME.w,height:FRAME.h,zIndex:0,pointerEvents:"none",backgroundColor:PALETTE.base}} />; };
const Label = ({ children, size = 28 }) => <span style={{ color: PALETTE.text, fontSize: size, fontWeight: 600 }}>{children}</span>;
const Panel = ({ children, width = 480 }) => <div style={{ width, backgroundColor: "rgba(12,17,32,0.72)", borderRadius: 14, padding: 24 }}>{children}</div>;
const Glow = ({ color = PALETTE.support, size = 180 }) => <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%" }} />;
`;

function buildUserContent(startIndex, count) {
  const sceneTable = Array.from({ length: count }).map((_, i) => {
    const n = startIndex + i;
    return `Scene ${n}: visualType: concept, domainSkill: none
   onScreenText: Step ${n}
   mechanism: starts at "state A for step ${n}", ends at "state B for step ${n}", driven by "a concrete animated transformation"
   visualDescription: A detailed staged animation of step ${n} of how a hash table resolves collisions, with 3+ moving elements, glow emphasis, and staggered text.`;
  }).join("\n\n");
  return `HEADER CODE (already imported/declared — reference these exact names, do not redeclare or reimport):
\`\`\`tsx
${fakeHeader}
\`\`\`

Write ONLY these ${count} scene(s), in order:

${sceneTable}
`;
}

async function run(label, effort) {
  const userContent = buildUserContent(1, 6);
  const r = await client.chat.completions.create({
    model: "z-ai/glm-5.3-flashx",
    max_tokens: 60000,
    reasoning: { effort },
    usage: { include: true },
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
  });
  console.log(`${label} -> reasoning_tokens:`, r.usage?.completion_tokens_details?.reasoning_tokens, "| completion_tokens:", r.usage?.completion_tokens, "| cost:", r.usage?.cost, "| finish:", r.choices[0].finish_reason);
}

(async () => {
  await run("minimal", "minimal");
  await run("low", "low");
  await run("medium", "medium");
  await run("high", "high");
})().catch((e) => console.error("ERROR", e.status, e.message));
