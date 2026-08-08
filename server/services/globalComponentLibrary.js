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
// Direct leaf-module require (validateCode.js only depends on @babel/*,
// never on claudeService.js or this file) — NOT via claudeService.js, which
// itself requires this file, so requiring claudeService.js here would be a
// circular dependency.
const { validateHeaderFragment, CANONICAL_REMOTION_EXPORTS, CANONICAL_REACT_EXPORTS } = require("./validateCode");

// ── Marker parsing ──────────────────────────────────────────────────────────
// Deliberately TEXT-based, not AST-based — same reasoning as every other
// marker/splice utility in claudeService.js (locateSceneAtLine, spliceScene,
// etc.): must still work to extract candidate B even if candidate A's own
// declaration happens to be malformed, and must never depend on the WHOLE
// header parsing cleanly.
const REUSABLE_MARKER_RE = /\/\/\s*@reusable:\s*(\w+)\s*(?:—|-)\s*(.+?)\s*\r?\n\s*\/\/\s*@example:\s*(.+?)\s*\r?\n/g;

// Walks balanced delimiters (open/close char pair) from `start` (which must
// BE the opening char) to its match — shared by extractDeclaration's own
// param-list/body/implicit-return handling below.
function matchDelimiter(code, start, openChar, closeChar) {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === openChar) depth++;
    else if (code[i] === closeChar) {
      depth--;
      if (depth === 0) return i + 1; // exclusive end, right after the closer
    }
  }
  return -1;
}

// Finds the declaration named `name` starting at/after `searchFrom` in
// `code` and returns its full source text — robust to whatever's around it
// (other declarations before/after), and handles every shape a real
// component actually gets written in:
//   function Name(...) { ...block body... }
//   const Name = (...) => { ...block body... }
//   const Name = (...) => ( <JSX/> )         (implicit return, parenthesized)
//
// FIX HISTORY (both confirmed against real saved/rejected candidates, not
// hypothetical):
//   1. Originally took the FIRST "{" after the declaration as the body's
//      opening brace — for the near-universal `({ cx, cy }) => {...}` shape
//      (destructured props), that "{" is the PARAMETER's own brace, not the
//      body's, silently truncating the declaration mid-signature (Enzyme/
//      NucleotideBlock). Fixed by skipping the parameter list's own
//      balanced parens first.
//   2. That fix still assumed the body always starts with "{" — an arrow
//      function using an IMPLICIT RETURN (`=> (<span>...</span>)`, no block
//      body at all — a completely ordinary, common React pattern, not a
//      corner case) has no body "{" to find, so the old code kept
//      searching forward and latched onto some LATER, unrelated "{"
//      (e.g. a JSX prop's own `style={{...}}`, or even the next
//      declaration entirely), producing garbage (Label, ForkStrand,
//      SynthArrow, PolymeraseDot all corrupted this way in one real run).
//      Fixed: after the parameter list, look at what ACTUALLY follows the
//      "=>" — a "{" gets the existing brace-matching; a "(" (the implicit-
//      return-wrapped-in-parens shape) gets paren-matching instead. A bare
//      implicit return with no wrapping parens at all (`=> <JSX/>`) is left
//      unsupported — JSX can't be reliably bounded by simple text scanning
//      without parens as an anchor — and returns null (skipped, same "never
//      guess" rule this function has always followed) rather than risk
//      producing a THIRD kind of corrupted extraction.
function extractDeclaration(code, name, searchFrom) {
  const declRe = new RegExp(`(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=)`);
  const rel = code.slice(searchFrom).match(declRe);
  if (!rel) return null;
  const declStart = searchFrom + rel.index;
  const isFunctionForm = rel[0].trimStart().startsWith("function");

  // 1. Skip the parameter list's own "(...)" span, so its own "{" (a
  // destructured param) is never mistaken for the body's.
  let afterParams;
  if (isFunctionForm) {
    // The regex match itself already ends in the param list's opening "(".
    afterParams = matchDelimiter(code, declStart + rel[0].length - 1, "(", ")");
  } else {
    const parenStart = code.indexOf("(", declStart);
    const arrowIdx = code.indexOf("=>", declStart);
    // Only treat this "(" as the parameter list if it genuinely comes
    // before the "=>" — a bare single-identifier param (`props => ...`,
    // no parens at all) has no param-list "(" to skip.
    afterParams = parenStart !== -1 && (arrowIdx === -1 || parenStart < arrowIdx)
      ? matchDelimiter(code, parenStart, "(", ")")
      : arrowIdx;
  }
  if (afterParams === -1 || afterParams === undefined) return null;

  // 2. function declarations go straight into their block body; a
  // const-arrow form has an "=>" (possibly after a TS return-type
  // annotation — indexOf just skips past that text either way) before
  // its body/implicit-return starts.
  let bodyStart = afterParams;
  if (!isFunctionForm) {
    const arrowIdx = code.indexOf("=>", afterParams);
    if (arrowIdx === -1) return null;
    bodyStart = arrowIdx + 2;
  }

  let i = bodyStart;
  while (i < code.length && /\s/.test(code[i])) i++;

  let end;
  if (code[i] === "{") {
    end = matchDelimiter(code, i, "{", "}");
  } else if (code[i] === "(") {
    end = matchDelimiter(code, i, "(", ")");
  } else {
    return null; // bare implicit return with no "{" or "(" — see comment above
  }
  if (end === -1) return null; // unbalanced — never guess, just skip this one

  let codeEnd = end;
  if (code[codeEnd] === ";") codeEnd++; // declarations often end with one
  return code.slice(declStart, codeEnd).trim();
}

// Mechanically derives a human-readable propsDoc string (e.g.
// "{ cx, cy, radius, color, label }") straight from a component's OWN
// destructured parameter list — no model involvement, unlike the pre-seed
// script's hand-written propsDoc. This can never drift out of sync with the
// real code the way an LLM-written description could, and costs zero extra
// prompt/token budget (the ad-hoc @reusable/@example marker convention
// never asked the model for one at all — this is what backfills it).
// Deliberately conservative: only handles the destructured-object shape
// every real component here actually uses (`({ a, b, c })`); anything else
// (a bare `props` identifier, no params) returns "" — the SAME "no props
// shown" state as before this existed, not a guess. A missing propsDoc is
// harmless (buildLibraryCatalogBlock already renders fine without one); a
// WRONG one would actively mislead a future lesson into calling the
// component with the wrong prop names, which is worse than showing nothing.
function derivePropsDoc(code, name) {
  try {
    const declRe = new RegExp(`(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=\\s*)`);
    const m = code.match(declRe);
    if (!m) return "";
    const afterDecl = m.index + m[0].length;

    // function-form regex already consumed the opening "(" itself; the
    // const-arrow form stops right before it.
    const parenStart = code[afterDecl - 1] === "(" ? afterDecl - 1 : code.indexOf("(", afterDecl);
    if (parenStart === -1) return "";

    let depth = 0;
    let parenEnd = -1;
    for (let i = parenStart; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") { depth--; if (depth === 0) { parenEnd = i; break; } }
    }
    if (parenEnd === -1) return "";
    const params = code.slice(parenStart + 1, parenEnd);

    // Only the destructured-object shape has individual names to list — the
    // FIRST "{" inside the parameter list is that pattern (a TS type
    // annotation, if any, comes AFTER it and is ignored entirely, never
    // parsed for prop names).
    const objStart = params.indexOf("{");
    if (objStart === -1) return "";
    let braceDepth = 0;
    let objEnd = -1;
    for (let i = objStart; i < params.length; i++) {
      if (params[i] === "{") braceDepth++;
      else if (params[i] === "}") { braceDepth--; if (braceDepth === 0) { objEnd = i; break; } }
    }
    if (objEnd === -1) return "";
    const inner = params.slice(objStart + 1, objEnd);

    // Split on top-level commas only — depth-tracked so a default value
    // like `area = { x: 0, y: 0 }` doesn't get split apart mid-object.
    const segments = [];
    let current = "";
    let d = 0;
    for (const ch of inner) {
      if ("{[(".includes(ch)) d++;
      else if ("}])".includes(ch)) d--;
      if (ch === "," && d === 0) { segments.push(current); current = ""; }
      else current += ch;
    }
    if (current.trim()) segments.push(current);

    // Each segment is `name`, `name = default`, or `name: renamedLocal` —
    // the prop's PUBLIC name (what a caller passes) is always the part
    // before either "=" or ":".
    const propNames = segments
      .map((s) => s.split(":")[0].split("=")[0].trim())
      .filter(Boolean);

    return propNames.length ? `{ ${propNames.join(", ")} }` : "";
  } catch {
    return "";
  }
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
    results.push({ name, description: description.trim(), example: example.trim(), code, propsDoc: derivePropsDoc(code, name) });
  }
  return results;
}

// Compile-checks one component's code in isolation, the same way an admin's
// preview eventually will (see buildPreviewCode below) — PREVIEW_HEADER_
// CONTRACT supplies the CLAMP/SAFE/ZONES/clampPos/SVG_FRAME/PALETTE names
// every component is contractually allowed to assume exist, so this can
// validate ONE declaration on its own without the rest of its original
// lesson's header. Added after a real, confirmed incident: extractDeclaration
// had a brace-matching bug (now fixed) that silently truncated every
// candidate extracted from a destructured-props declaration — nothing caught
// it before this, so two broken candidates (Enzyme, NucleotideBlock) reached
// the admin page and only failed once a reviewer actually tried to preview
// them. This is the gate that should have existed from the start: a
// candidate that can't even compile in isolation must never be saved as
// something a human is asked to review, let alone something a future lesson
// could be offered.
// Returns the actual validation error (its first line — the rest is
// per-occurrence detail not needed for a log line) rather than a bare
// boolean, so a rejection is diagnosable straight from the server log
// instead of requiring an ad-hoc script to reproduce it, which is how the
// original version of this function's silent `catch {}` was actually
// debugged the first time this mattered.
function checkComponentCode(code) {
  try {
    validateHeaderFragment(`${PREVIEW_HEADER_CONTRACT}\n${code}`, {});
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err.message.split("\n")[0] };
  }
}

// ── Persistence ──────────────────────────────────────────────────────────
// Never throws into the caller — this is always a side effect riding along
// on a real lesson's header generation, same "a side-effect failure must
// never fail the actual generation" rule as every other non-fatal write in
// this codebase (progress tracking, email sending, etc.).
async function saveCandidates(candidates, { courseId = null, lessonNumber = null } = {}) {
  for (const c of candidates) {
    try {
      const check = checkComponentCode(c.code);
      if (!check.valid) {
        console.warn(`[globalComponentLibrary] Skipping candidate "${c.name}" — ${check.reason}`);
        continue;
      }

      // Name collision with an existing entry (any status) — skip rather
      // than overwrite. A duplicate proposal for a name that already exists
      // is far more likely the model reusing a good name it saw in the
      // catalog than a genuinely different component that deserves the
      // same identity; overwriting risks silently replacing an approved,
      // trusted component with an unreviewed one.
      const exists = await LibraryComponent.findOne({ name: c.name }).select("_id").lean();
      if (exists) {
        console.log(`[globalComponentLibrary] Skipping candidate "${c.name}" — a component with this name already exists.`);
        continue;
      }
      await LibraryComponent.create({
        name: c.name,
        description: c.description,
        propsDoc: c.propsDoc || "",
        code: c.code,
        example: c.example,
        status: "candidate",
        sourceCourseId: courseId,
        sourceLessonNumber: lessonNumber,
      });
      // Rejections were already logged above (console.warn) — without a
      // matching success log, the console only ever shows the negative
      // case, making a genuinely healthy save rate (often 30-50%) look
      // like a total failure. This is that missing other half.
      console.log(`[globalComponentLibrary] Saved candidate "${c.name}" for review.`);
    } catch (err) {
      console.warn(`[globalComponentLibrary] Failed to save candidate "${c.name}" (non-fatal): ${err.message}`);
    }
  }
}

// ── Catalog for prompt injection ────────────────────────────────────────
// Active PLUS this course's own not-yet-approved candidates (when courseId
// is given) — see generateCourseComponents in claudeService.js. The intent:
// a component proposed for THIS course should be immediately usable by
// every OTHER lesson in the SAME course without waiting on admin review —
// only being offered to a DIFFERENT course still requires promotion to
// "active". Every lesson's header/chunk generation already has its own
// courseId in scope, so this costs nothing extra to thread through.
// Name + description + props ONLY, never the code — this is what keeps the
// header prompt small regardless of how large the library grows; the
// actual code only gets pulled in by getActiveLibrarySource, server-side,
// never sent back through the model.
function catalogFilter(courseId) {
  return courseId
    ? { $or: [{ status: "active" }, { status: "candidate", sourceCourseId: courseId }] }
    : { status: "active" };
}

async function getActiveCatalog(courseId = null) {
  const docs = await LibraryComponent.find(catalogFilter(courseId))
    .select("name description propsDoc")
    .lean();
  return docs.map((d) => ({ name: d.name, description: d.description, propsDoc: d.propsDoc || "" }));
}

async function getActiveNames(courseId = null) {
  const docs = await LibraryComponent.find(catalogFilter(courseId)).select("name").lean();
  return docs.map((d) => d.name);
}

// Concatenated source for every active (+ this course's own candidate)
// component — appended onto the header exactly the way
// lessonComponentLibrary.js's hand-written LESSON_COMPONENT_LIBRARY_SOURCE
// already is (see generateLessonCode), which is what makes these callable
// at runtime with zero changes needed anywhere else in the compile/render
// pipeline.
async function getActiveLibrarySource(courseId = null) {
  const docs = await LibraryComponent.find(catalogFilter(courseId)).select("code").lean();
  if (docs.length === 0) return "";
  return "\n// ── Global reusable component library (grown from real lessons, admin-approved, plus this course's own pending candidates) ──\n" +
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
import { ${CANONICAL_REMOTION_EXPORTS.join(", ")} } from "remotion";
import { ${CANONICAL_REACT_EXPORTS.join(", ")} } from "react";
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
// bg/accent/text are the only THREE keys any component is contractually
// guaranteed (see lessonComponentLibrary.js's own "Contract" comment) — the
// rest below are generous extras purely so a REAL component that happens to
// reference a common extra semantic color (its own lesson's PALETTE.warn/
// .hero/.deep/etc, which passes static validation fine since PALETTE itself
// exists — undefined member access isn't a reference error) still renders
// with a real color in this standalone ADMIN PREVIEW instead of a missing/
// black fallback, rather than actually being part of what's promised
// elsewhere in the codebase.
const PALETTE = {
  bg: "#12131c", accent: "#5ec8f2", text: "#f5f7fa",
  support: "#f2b95e", support2: "#8f6bd9",
  hero: "#5ec8f2", warn: "#f2b95e", deep: "#0a0b12", muted: "#8a93a6", glow: "#5ec8f2",
};
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
  extractDeclaration,
  saveCandidates,
  getActiveCatalog,
  getActiveNames,
  getActiveLibrarySource,
  trackUsage,
  buildPreviewCode,
  PREVIEW_DURATION_FRAMES,
  // Exposed so claudeService.js's generateCourseComponents can prepend it
  // as a validation-only stub — the model's course-level component output
  // never redeclares CLAMP/PALETTE/etc itself (same contract every other
  // library component follows), but validateHeaderFragment needs SOMETHING
  // declaring those names in scope to not flag them as undefined refs.
  PREVIEW_HEADER_CONTRACT,
};
