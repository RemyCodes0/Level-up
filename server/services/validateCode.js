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
//      wrong interpolate() argument shape, forbidden imports, top-level names
//      that collide with the sandbox scope, and a durationInFrames sum that
//      doesn't match the audio-measured total. The duration-sum check can
//      auto-correct small arithmetic slips (the AI is consistently off by a
//      few frames sometimes) instead of rejecting and paying for a full
//      regeneration over a 1-2 frame typo.
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

// ── Reserved sandbox-scope names ────────────────────────────────────────────
// The browser sandbox (useCompilation.ts) makes every Remotion export (except
// staticFile) plus the three safe React hooks available to generated code as
// bare top-level identifiers, via a `const { ... } = __SCOPE__;` prelude, and
// injects `React` as a parameter. If a generated lesson declares ANY of these
// names at its own top level, one of two bad things happens:
//   - it shadows the real binding — e.g. a top-level `const Audio = ...`
//     replaces the buffered <Audio> wrapper, silently disabling the 404-storm
//     guard that prevents thousands of requests to a broken audio file; or
//   - it becomes a duplicate `const` in the same scope, a hard SyntaxError
//     that fails the ENTIRE compile (all scenes die with one cryptic message).
//
// The sandbox now dedupes to degrade gracefully, but the clean fix is to never
// ship such code: reject it here so it regenerates with a rename instead.
//
// This list MUST mirror the names injected in useCompilation.ts. It is
// deliberately limited to Remotion's stable, long-lived core exports (the ones
// a model would plausibly reuse as a helper/variable name) plus the injected
// React bindings. staticFile is intentionally absent — it is EXCLUDED from the
// sandbox scope, so a lesson declaring `const staticFile` does not collide.
// Anything not on this list that still collides is caught by the sandbox's
// runtime dedup, so an incomplete list degrades safely rather than crashing.
const RESERVED_SCOPE_NAMES = new Set([
  // Injected React bindings
  "React", "useMemo", "useCallback", "useRef",
  // Remotion components (stable core)
  "AbsoluteFill", "Audio", "Video", "OffthreadVideo", "Img", "IFrame",
  "Sequence", "Series", "Loop", "Freeze", "Still", "Composition", "Folder",
  // Remotion functions / hooks (stable core)
  "interpolate", "interpolateColors", "spring", "measureSpring",
  "useCurrentFrame", "useVideoConfig", "useCurrentScale", "useBufferState",
  "random", "delayRender", "continueRender", "cancelRender",
  "getInputProps", "registerRoot", "prefetch", "getRemotionEnvironment",
  // Remotion namespaces / constants
  "Easing", "Experimental", "VERSION",
]);

// Recursively collect identifier names bound by a declaration id, handling
// destructuring patterns (const { a, b } = ..., const [x] = ..., defaults,
// rest). Top-level destructuring is rare in generated lessons but cheap to
// handle correctly rather than miss.
function collectPatternNames(idNode, out) {
  if (!idNode) return;
  switch (idNode.type) {
    case "Identifier":
      out.push(idNode.name);
      break;
    case "ObjectPattern":
      for (const prop of idNode.properties) {
        if (prop.type === "ObjectProperty") collectPatternNames(prop.value, out);
        else if (prop.type === "RestElement") collectPatternNames(prop.argument, out);
      }
      break;
    case "ArrayPattern":
      for (const el of idNode.elements) {
        if (!el) continue;
        collectPatternNames(el.type === "RestElement" ? el.argument : el, out);
      }
      break;
    case "AssignmentPattern":
      collectPatternNames(idNode.left, out);
      break;
    case "RestElement":
      collectPatternNames(idNode.argument, out);
      break;
    default:
      break;
  }
}

// Names declared at the PROGRAM top level only. Nested declarations (inside a
// scene function, a .map callback, etc.) live in their own scope and never
// collide with the sandbox prelude, so they must not be collected here.
function collectTopLevelDeclaredNames(ast) {
  const names = [];
  for (const stmt of ast.program.body) {
    let decl = stmt;
    if (
      (stmt.type === "ExportNamedDeclaration" ||
        stmt.type === "ExportDefaultDeclaration") &&
      stmt.declaration
    ) {
      decl = stmt.declaration;
    }
    if (
      (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
      decl.id
    ) {
      names.push(decl.id.name);
    } else if (decl.type === "VariableDeclaration") {
      for (const d of decl.declarations) collectPatternNames(d.id, names);
    }
  }
  return names;
}

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

  // 3c. No top-level declaration may collide with a name the sandbox injects
  // into scope. A collision either shadows a real Remotion binding (e.g. a
  // top-level `const Audio` replaces the buffered wrapper and re-arms the
  // 404-request-storm) or produces a duplicate-`const` SyntaxError that kills
  // the whole compile. Reject here so it regenerates with a rename.
  const declaredNames = collectTopLevelDeclaredNames(ast);
  const collisions = [...new Set(declaredNames)].filter((n) =>
    RESERVED_SCOPE_NAMES.has(n)
  );
  if (collisions.length > 0) {
    throw new Error(
      `Generated code declares top-level identifier(s) that collide with Remotion/React ` +
        `names already provided in the sandbox scope: ${collisions.join(", ")}. ` +
        `Redeclaring these at the top level shadows the real export (which breaks things like ` +
        `<Audio> buffering) or crashes the entire compile. Rename each colliding helper/variable ` +
        `to something unique (e.g. "OrbitLoop" instead of "Loop", "ImageTile" instead of "Img", ` +
        `"NarrationAudio" instead of "Audio").`
    );
  }

  // 3d. Sum every <Series.Sequence durationInFrames={N}> and compare to the
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