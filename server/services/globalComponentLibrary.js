// services/globalComponentLibrary.js
//
// The "as we go" reusable-component library — grown from real lesson
// generation instead of hand-written (lessonComponentLibrary.js) or bulk
// pre-generated offline. Mechanism, end to end:
//
//   1. Every header-generation prompt is shown the CATALOG of already-
//      APPROVED components (name + description + props — never the code
//      itself, so the prompt stays small as the library grows) and told to
//      call one directly instead of reinventing it if it fits.
//   2. If the model genuinely needs something new and generic (not tied to
//      this one lesson's specific facts), it marks it inline with a
//      `// @reusable:` / `// @example:` comment pair right above the
//      declaration — in the header (a shared helper) OR nested inside a
//      scene's own function (a scene-local helper, per LESSON_CHUNK_RULES'
//      declaration rules) — same marker pair, no separate call either way.
//      Most of a lesson's actual visual work happens in scenes, not the
//      header, so this is the path that catches most real candidates.
//   3. After a header OR a scene chunk validates (same checks as every
//      other one — nothing new there), extractReusableCandidates pulls out
//      anything marked and persists it as a "candidate" — NOT yet visible
//      to other lessons' catalogs. extractDeclaration brace-counts from the
//      marked declaration regardless of nesting depth, so a scene-nested
//      helper extracts the same way a top-level header one does.
//   4. A human approves candidates on the admin Component Library page
//      (with a live animated preview, built from the model's own
//      `@example` usage) before they become "active" and start being
//      offered to future lessons. See LibraryComponent.js's own comment for
//      why this gate exists.
//   5. Once a lesson's code is fully generated, trackUsage does one cheap
//      regex pass over the final code and bumps usageCount for every active
//      component actually called — not just offered.
const LibraryComponent = require("../models/LibraryComponent");

// ── Marker parsing ──────────────────────────────────────────────────────────
// Deliberately TEXT-based, not AST-based — same reasoning as every other
// marker/splice utility in claudeService.js (locateSceneAtLine, spliceScene,
// etc.): must still work to extract candidate B even if candidate A's own
// declaration happens to be malformed, and must never depend on the WHOLE
// header parsing cleanly.
const REUSABLE_MARKER_RE = /\/\/\s*@reusable:\s*(\w+)\s*(?:—|-)\s*(.+?)\s*\r?\n\s*\/\/\s*@example:\s*(.+?)\s*\r?\n/g;

// Finds the declaration named `name` starting at/after `searchFrom` in
// `code`, then walks brace depth from its first `{` to the matching `}` —
// robust to whatever's around it (other declarations before/after), and
// works identically for `function Name(...) {...}` and
// `const Name = (...) => {...}` shapes, since both start their body at the
// first `{`.
function extractDeclaration(code, name, searchFrom) {
  const declRe = new RegExp(`(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`);
  const rel = code.slice(searchFrom).match(declRe);
  if (!rel) return null;
  const declStart = searchFrom + rel.index;
  const braceStart = code.indexOf("{", declStart);
  if (braceStart === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null; // unbalanced — never guess, just skip this one

  let codeEnd = end;
  if (code[codeEnd] === ";") codeEnd++; // const-arrow declarations often end with one
  return code.slice(declStart, codeEnd).trim();
}

// Pulls every `// @reusable: Name — description` / `// @example: <JSX/>`
// pair out of a validated header, paired with the actual declaration that
// follows each one. A marker with no matching declaration right after it
// (malformed output) is silently skipped, not thrown — this runs AFTER the
// header already validated and is generating code, so a candidate-
// extraction hiccup must never fail the lesson it's piggybacking on.
function extractReusableCandidates(headerCode) {
  const results = [];
  let m;
  REUSABLE_MARKER_RE.lastIndex = 0;
  while ((m = REUSABLE_MARKER_RE.exec(headerCode)) !== null) {
    const [, name, description, example] = m;
    const code = extractDeclaration(headerCode, name, REUSABLE_MARKER_RE.lastIndex);
    if (!code) continue;
    results.push({ name, description: description.trim(), example: example.trim(), code });
  }
  return results;
}

// ── Persistence ──────────────────────────────────────────────────────────
// Never throws into the caller — this is always a side effect riding along
// on a real lesson's header generation, same "a side-effect failure must
// never fail the actual generation" rule as every other non-fatal write in
// this codebase (progress tracking, email sending, etc.).
async function saveCandidates(candidates, { courseId = null, lessonNumber = null } = {}) {
  for (const c of candidates) {
    try {
      // Name collision with an existing entry (any status) — skip rather
      // than overwrite. A duplicate proposal for a name that already exists
      // is far more likely the model reusing a good name it saw in the
      // catalog than a genuinely different component that deserves the
      // same identity; overwriting risks silently replacing an approved,
      // trusted component with an unreviewed one.
      const exists = await LibraryComponent.findOne({ name: c.name }).select("_id").lean();
      if (exists) continue;
      await LibraryComponent.create({
        name: c.name,
        description: c.description,
        code: c.code,
        example: c.example,
        status: "candidate",
        sourceCourseId: courseId,
        sourceLessonNumber: lessonNumber,
      });
    } catch (err) {
      console.warn(`[globalComponentLibrary] Failed to save candidate "${c.name}" (non-fatal): ${err.message}`);
    }
  }
}

// ── Catalog for prompt injection ────────────────────────────────────────
// Active only — a candidate hasn't been reviewed yet, so it's never offered
// to another lesson. Name + description + props ONLY, never the code — this
// is what keeps the header prompt small regardless of how large the library
// grows; the actual code only gets pulled in by getActiveLibrarySource,
// server-side, never sent back through the model.
async function getActiveCatalog() {
  const docs = await LibraryComponent.find({ status: "active" })
    .select("name description propsDoc")
    .lean();
  return docs.map((d) => ({ name: d.name, description: d.description, propsDoc: d.propsDoc || "" }));
}

async function getActiveNames() {
  const docs = await LibraryComponent.find({ status: "active" }).select("name").lean();
  return docs.map((d) => d.name);
}

// Concatenated source for every active component — appended onto the
// header exactly the way lessonComponentLibrary.js's hand-written
// LESSON_COMPONENT_LIBRARY_SOURCE already is (see generateLessonCode),
// which is what makes these callable at runtime with zero changes needed
// anywhere else in the compile/render pipeline.
async function getActiveLibrarySource() {
  const docs = await LibraryComponent.find({ status: "active" }).select("code").lean();
  if (docs.length === 0) return "";
  return "\n// ── Global reusable component library (grown from real lessons, admin-approved) ──\n" +
    docs.map((d) => d.code).join("\n\n");
}

// One cheap regex pass over a lesson's FINAL stitched code, once, after
// generation — not one check per chunk — bumping usageCount only for
// components actually CALLED (`<Name` appearing in the code), not just
// available in that lesson's catalog. Never throws; a tracking miss should
// never surface as a generation problem.
async function trackUsage(finalCode, activeNames) {
  if (!finalCode || !activeNames?.length) return;
  const used = activeNames.filter((name) => new RegExp(`<${name}\\b`).test(finalCode));
  if (used.length === 0) return;
  try {
    await LibraryComponent.updateMany({ name: { $in: used } }, { $inc: { usageCount: 1 } });
  } catch (err) {
    console.warn(`[globalComponentLibrary] Failed to record usage (non-fatal): ${err.message}`);
  }
}

// ── Admin preview ────────────────────────────────────────────────────────
// Synthesizes a complete, self-contained "lesson code" string — the same
// shape DynamicPlayer already knows how to compile and play — from just
// this ONE component's own code plus its own `@example` usage. Reuses the
// EXISTING player/compiler with zero changes: the admin page just points a
// <DynamicPlayer> at this string like it was a real lesson. The header
// contract below (PALETTE/CLAMP/FRAME/SAFE/clampPos/SVG_FRAME/ZONES) is
// copied verbatim from LESSON_HEADER_RULES in claudeService.js — it doesn't
// need to match any REAL lesson's palette, just needs to provide every name
// a component is contractually allowed to assume exists (see
// lessonComponentLibrary.js's own "Contract" comment).
const PREVIEW_HEADER_CONTRACT = `
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
const clampPos = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SVG_FRAME = { position: "absolute", left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none", overflow: "visible" };
const ZONES = {
  title:   { x: 120, y: 120, w: 1680, h: 130, cx: 960 },
  stage:   { x: 120, y: 270, w: 1680, h: 580, cx: 960, cy: 560 },
  caption: { x: 120, y: 870, w: 1680, h: 90,  cx: 960 },
};
const PALETTE = { bg: "#12131c", accent: "#5ec8f2", text: "#f5f7fa", support: "#f2b95e", support2: "#8f6bd9" };
`;

const PREVIEW_DURATION_FRAMES = 180; // 6s at 30fps — long enough to see a full motion cycle, short enough to loop fast

function buildPreviewCode(component) {
  return `${PREVIEW_HEADER_CONTRACT}
${component.code}

export const PreviewComponent = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg }}>
      ${component.example}
    </AbsoluteFill>
  );
};
`;
}

module.exports = {
  extractReusableCandidates,
  saveCandidates,
  getActiveCatalog,
  getActiveNames,
  getActiveLibrarySource,
  trackUsage,
  buildPreviewCode,
  PREVIEW_DURATION_FRAMES,
};
