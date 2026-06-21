// Standalone validator — no dependencies on other services, so it can be
// safely imported by both claudeService and bundleService without creating
// a circular dependency.
//
// Three layers of checking:
//   1. Fast heuristics (export present, balanced braces/parens, has a
//      return) — cheap, catches obvious truncation instantly.
//   2. A real Babel AST parse of the TSX — catches malformed syntax (e.g.
//      JSX attribute syntax leaking into a plain object literal, mismatched
//      tags, stray tokens) that heuristics structurally cannot detect.
//   3. Semantic checks on the parsed AST — catches code that is VALID
//      JavaScript but still violates the actual rules the AI was given:
//      wrong interpolate() argument shape, forbidden imports, and a
//      durationInFrames sum that doesn't match the audio-measured total.
//      The duration-sum check can auto-correct small arithmetic slips
//      (the AI is consistently off by a few frames sometimes) instead of
//      rejecting and paying for a full regeneration over a 1-2 frame typo.
//
// Requires @babel/parser and @babel/traverse — install with:
//   npm install @babel/parser @babel/traverse

const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// How far the AI's durationInFrames sum is allowed to drift from the real
// audio-measured total before we give up auto-fixing and just reject the
// code outright. A small drift (1-10 frames, ~0.03-0.3s) is almost always
// a harmless rounding slip on the AI's part. A large drift usually means
// it miscounted or omitted a whole scene — auto-fixing that would mask a
// real structural bug rather than fix a typo.
const MAX_AUTOFIX_FRAME_DRIFT = 10;

function validateGeneratedCode(tsxCode, componentName, expectedTotalFrames) {
  // ── Layer 1: fast heuristics (catches truncation cheaply) ──────────────
  const hasExport =
    tsxCode.includes(`export const ${componentName}`) ||
    tsxCode.includes(`export function ${componentName}`);
  if (!hasExport) {
    throw new Error(
      "Generated code is incomplete — missing component export (likely truncated)"
    );
  }

  const openBraces = (tsxCode.match(/{/g) || []).length;
  const closeBraces = (tsxCode.match(/}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    throw new Error(
      `Generated code has unbalanced braces (${openBraces} open, ${closeBraces} close) — likely truncated`
    );
  }

  const openParens = (tsxCode.match(/\(/g) || []).length;
  const closeParens = (tsxCode.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 2) {
    throw new Error(
      `Generated code has unbalanced parentheses (${openParens} open, ${closeParens} close) — likely truncated`
    );
  }

  if (!tsxCode.includes("return")) {
    throw new Error("Generated code has no return statement — likely incomplete");
  }

  // ── Layer 2: real syntax validation via Babel AST parse ────────────────
  let ast;
  try {
    ast = parse(tsxCode, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });
  } catch (err) {
    const loc = err.loc ? ` at line ${err.loc.line}, column ${err.loc.column}` : "";
    throw new Error(`Generated code has a syntax error${loc}: ${err.message}`);
  }

  // ── Layer 3: semantic checks on the parsed AST ──────────────────────────
  // 3a. interpolate() must always be called with exactly 3 arguments, and
  // the input/output ranges must be literal arrays of matching length —
  // this is the exact failure pattern that has crashed videos at runtime
  // before (the rule already exists in the prompt; this enforces it).
  const interpolateErrors = [];
  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      if (node.callee.type !== "Identifier" || node.callee.name !== "interpolate") return;

      const loc = node.loc ? ` (line ${node.loc.start.line})` : "";

      if (node.arguments.length !== 3) {
        interpolateErrors.push(
          `interpolate() called with ${node.arguments.length} argument(s) instead of 3${loc}`
        );
        return;
      }

      const [, inputRange, outputRange] = node.arguments;
      if (inputRange.type !== "ArrayExpression" || outputRange.type !== "ArrayExpression") {
        interpolateErrors.push(
          `interpolate()'s 2nd/3rd arguments must be literal arrays, not variables${loc}`
        );
        return;
      }
      if (inputRange.elements.length !== outputRange.elements.length) {
        interpolateErrors.push(
          `interpolate()'s inputRange and outputRange have different lengths (${inputRange.elements.length} vs ${outputRange.elements.length})${loc}`
        );
      }
    },
  });

  if (interpolateErrors.length > 0) {
    throw new Error(`Invalid interpolate() usage:\n${interpolateErrors.join("\n")}`);
  }

  // 3b. Only "react" and "remotion" may be imported — catches an
  // accidental staticFile import, a forgotten external library, etc.
  const importErrors = [];
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (source !== "react" && source !== "remotion") {
        importErrors.push(`Forbidden import from "${source}" — only "react" and "remotion" are allowed`);
      }
    },
  });

  if (importErrors.length > 0) {
    throw new Error(importErrors.join("\n"));
  }

  // 3c. Sum every <Series.Sequence durationInFrames={N}> and compare to the
  // real audio-measured total. Small drift gets auto-corrected on the LAST
  // sequence (absorbing rounding slop there is harmless); large drift means
  // something structural is wrong and gets rejected instead of papered over.
  let correctedCode = tsxCode;

  if (typeof expectedTotalFrames === "number") {
    const sequenceDurations = []; // { value, node }

    traverse(ast, {
      JSXOpeningElement(path) {
        const { name } = path.node;
        const isSeriesSequence =
          name.type === "JSXMemberExpression" &&
          name.object.name === "Series" &&
          name.property.name === "Sequence";
        if (!isSeriesSequence) return;

        const durationAttr = path.node.attributes.find(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "durationInFrames"
        );
        if (!durationAttr || durationAttr.value?.type !== "JSXExpressionContainer") return;

        const expr = durationAttr.value.expression;
        if (expr.type !== "NumericLiteral") return; // not a plain literal — skip, can't safely sum/fix

        sequenceDurations.push({ value: expr.value, node: expr });
      },
    });

    // Only run the check if EVERY sequence had a plain numeric literal —
    // if any used an expression we couldn't evaluate, skip silently rather
    // than risk a false rejection on code that's actually fine.
    const allLiteral = sequenceDurations.length > 0;
    if (allLiteral) {
      const actualTotal = sequenceDurations.reduce((sum, s) => sum + s.value, 0);
      const drift = expectedTotalFrames - actualTotal;

      if (drift !== 0) {
        if (Math.abs(drift) <= MAX_AUTOFIX_FRAME_DRIFT) {
          // Absorb the drift into the LAST sequence's duration.
          const last = sequenceDurations[sequenceDurations.length - 1];
          const correctedValue = last.value + drift;
          correctedCode =
            tsxCode.slice(0, last.node.start) +
            String(correctedValue) +
            tsxCode.slice(last.node.end);
          console.warn(
            `  [validate] Auto-corrected duration drift of ${drift} frame(s) on the last scene (${last.value} → ${correctedValue})`
          );
        } else {
          throw new Error(
            `durationInFrames sum (${actualTotal}) doesn't match the expected total (${expectedTotalFrames}) — ` +
              `drift of ${drift} frames is too large to auto-fix safely, likely a missing or miscounted scene`
          );
        }
      }
    }
  }

  return correctedCode;
}

module.exports = { validateGeneratedCode };