const mongoose = require("mongoose");

// One reusable Remotion visual component, grown organically from real
// lesson generation instead of hand-written or bulk-pre-generated — see
// services/globalComponentLibrary.js for the full mechanism. A lesson
// header can flag one of its own shared helpers as broadly reusable (a
// `// @reusable:` / `// @example:` comment pair — see
// extractReusableCandidates); if it is, it lands here as a "candidate"
// instead of being thrown away once that one lesson finishes generating.
//
// Candidates are NOT surfaced to other lessons (see getActiveCatalog/
// getActiveLibrarySource, both filtered to status "active") until an admin
// approves them on the Component Library admin page — a bad component
// reused by every future lesson on its topic is a much bigger problem than
// a bad one-off scene, so promotion is a deliberate human step, not
// automatic. This is the same "don't trust an AI generation forever without
// a gate" caution the runtime-patch feature already applies elsewhere,
// just at the front door instead of after the fact.
const libraryComponentSchema = new mongoose.Schema(
  {
    // Must be globally unique — this is also the identifier scenes/headers
    // reference it by (<Gear .../>) and what gets reserved against a fresh
    // header accidentally redeclaring the same name (see
    // getActiveNames/LESSON_COMPONENT_NAMES's own reservedNames usage).
    name: { type: String, required: true, unique: true, trim: true },
    // One line — this, NOT the code, is what gets shown to the model at
    // generation time (see getActiveCatalog) so the catalog stays small
    // even as the library grows into hundreds of entries.
    description: { type: String, required: true },
    // Short human-readable prop signature, e.g. "{ radius, teeth, color,
    // cx, cy, rotationSpeed }" — shown alongside the description in the
    // catalog so the model knows how to call it without needing the code.
    propsDoc: { type: String, default: "" },
    // The actual TSX source — a single self-contained function/const
    // declaration, same contract as lessonComponentLibrary.js's hand-written
    // components (only consumes PALETTE.bg/.accent/.text, CLAMP/SAFE/ZONES/
    // clampPos/SVG_FRAME, useCurrentFrame/interpolate/useMemo — nothing else
    // guaranteed to exist).
    code: { type: String, required: true },
    // A working example usage the model itself proposed (e.g.
    // `<Gear radius={80} teeth={12} rotationSpeed={2} color={PALETTE.accent}
    // cx={960} cy={540} />`) — used verbatim to render the live preview on
    // the admin page (see globalComponentLibrary.buildPreviewCode), so a
    // reviewer sees the actual animated component, not just source text.
    example: { type: String, required: true },
    domainTags: { type: [String], default: [] },
    status: { type: String, enum: ["candidate", "active", "rejected"], default: "candidate" },
    // Bumped once per lesson whose FINAL generated code actually calls this
    // component (a cheap regex check against the finished code, done once
    // per lesson — see trackUsage) — not once per lesson it was merely
    // offered to, so this reflects real reuse, not just availability.
    usageCount: { type: Number, default: 0 },
    // Where it came from. sourceCourseId is NOT purely informational for a
    // "candidate" — getActiveCatalog/getActiveNames/getActiveLibrarySource
    // (globalComponentLibrary.js) treat a candidate tagged with the CURRENT
    // course as usable immediately by every lesson in THAT course, before
    // any admin approval — only a DIFFERENT course still requires the
    // approval gate. sourceLessonNumber is null for both the hand-seeded
    // starter set (scripts/seedLibraryComponents.js) AND course-level
    // candidates proposed by generateCourseComponents (claudeService.js) —
    // the latter belong to the whole course, not one specific lesson.
    sourceCourseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    sourceLessonNumber: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LibraryComponent", libraryComponentSchema);
