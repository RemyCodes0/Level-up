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

// ── Layer 3d dependency: known-valid identifiers ────────────────────────────
// Mirrors EXACTLY what the browser sandbox (useCompilation.ts's SCOPE)
// actually provides at runtime: the full Remotion module minus staticFile
// (deliberately excluded there), plus useMemo/useCallback/useRef (useState
// is deliberately excluded), plus React itself, plus real JS built-ins.
//
// If you ever change what useCompilation.ts exposes in SCOPE, update this
// list to match — otherwise this check will either miss real bugs (if SCOPE
// shrinks) or falsely reject valid code (if SCOPE grows and this doesn't).
const KNOWN_GLOBALS = new Set([
  // Remotion — every real export except staticFile
  "AbsoluteFill", "Sequence", "Series", "Loop", "Freeze",
  "Audio", "Video", "OffthreadVideo", "Img", "IFrame",
  "interpolate", "interpolateColors", "spring", "Easing", "random",
  "useCurrentFrame", "useVideoConfig", "useDelayRender",
  "delayRender", "continueRender", "cancelRender",
  "Composition", "Still", "Folder", "getInputProps", "registerRoot",
  // React hooks available in the sandbox (useState deliberately excluded)
  "useMemo", "useCallback", "useRef",
  // React itself
  "React",
  // Real JavaScript globals
  "Math", "Array", "Object", "String", "Number", "Boolean", "Date", "JSON",
  "console", "Infinity", "NaN", "undefined", "isNaN", "isFinite",
  "parseInt", "parseFloat", "Map", "Set", "WeakMap", "WeakSet", "Symbol",
  "Promise", "RegExp", "Error", "TypeError", "RangeError",
  "decodeURIComponent", "encodeURIComponent", "Function",
]);


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

      // interpolate() requires 3 args minimum, and Remotion supports a
      // legitimate optional 4th argument: an options object like
      // { extrapolateLeft: "clamp", extrapolateRight: "clamp" }. That object
      // can be written inline OR passed as a variable/constant (a very common
      // pattern when the same clamp options are reused many times, e.g.
      // `const clamp = {...}; interpolate(f, [0,1], [0,1], clamp)`). Accept
      // an inline object, an identifier, or a member expression (e.g.
      // OPTS.clamp). Only reject things that clearly can't be an options
      // object, like a number or string literal.
      if (node.arguments.length < 3 || node.arguments.length > 4) {
        interpolateErrors.push(
          `interpolate() called with ${node.arguments.length} argument(s) — expected 3, or 4 with an options object${loc}`
        );
        return;
      }
      if (node.arguments.length === 4) {
        const fourth = node.arguments[3];
        const okFourthArgTypes = ["ObjectExpression", "Identifier", "MemberExpression"];
        if (!okFourthArgTypes.includes(fourth.type)) {
          interpolateErrors.push(
            `interpolate()'s 4th argument must be an options object (e.g. { extrapolateLeft: "clamp" }) or a variable holding one${loc}`
          );
          return;
        }
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

  // 3d. Detect references to undeclared variables — the same bug class as
  // ESLint's "no-undef" rule. Catches the model using an arbitrary variable
  // name (e.g. "lx", "user") inside a helper component without ever
  // declaring it — these pass Babel's syntax check fine (it's valid JS
  // syntax) but crash at actual runtime in the browser with "X is not
  // defined". This has recurred multiple times with different variable
  // names, so rather than patching one name at a time in the prompt, this
  // catches the whole category deterministically before the code ever
  // reaches a user.
  const undefinedRefs = [];

  traverse(ast, {
    // ReferencedIdentifier is Babel's built-in alias for identifiers that
    // are genuinely USED (not being declared) — it already correctly
    // excludes the "x" in `const x = 5`, function parameter names, object
    // pattern keys, etc., so we don't have to hand-roll that distinction.
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (KNOWN_GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name)) return; // declared locally somewhere in scope
      const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
      undefinedRefs.push(`"${name}" is used but never declared${loc}`);
    },
    // JSX component references (e.g. <DoubleHelix />) are a different node
    // type (JSXIdentifier) and need their own check. Only capitalized names
    // are checked — lowercase JSX tags (<div>) are real HTML elements, not
    // variable references, and JSX attribute names (prop="value") aren't
    // variable references either.
    JSXIdentifier(path) {
      const name = path.node.name;
      if (!/^[A-Z]/.test(name)) return;
      if (path.parent.type === "JSXAttribute") return;
      if (KNOWN_GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name)) return;
      const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
      undefinedRefs.push(`Component "<${name}>" is used but never declared${loc}`);
    },
  });

  // De-duplicate — the same undefined name often shows up many times
  // across a file once it's used in a loop/map, which would otherwise
  // produce a wall of near-identical error lines.
  const uniqueRefs = [...new Set(undefinedRefs)];
  if (uniqueRefs.length > 0) {
    throw new Error(`Undefined variable reference(s):\n${uniqueRefs.join("\n")}`);
  }

  return correctedCode;
}

module.exports = { validateGeneratedCode };