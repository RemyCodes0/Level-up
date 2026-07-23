// Standalone validator — no dependencies on other services, so it can be
// safely imported by both claudeService and bundleService without creating
// a circular dependency.
//
// Three entry points:
//   - validateGeneratedCode(tsxCode, componentName, expectedTotalFrames) — the
//     FINAL, fully-stitched lesson/ad file: has the component export, a
//     <Series> of <Series.Sequence>s, and (if expectedTotalFrames is given) a
//     durationInFrames sum check with small-drift auto-correction. Signature
//     and behavior are unchanged from before the header/scene split — this is
//     still what bundleService.js and generateAdCode validate against.
//   - validateHeaderFragment(code, opts) — the shared header fragment (
//     imports, palette/motif consts, shared helper components) generated
//     BEFORE any scene: no export, no <Series>/<Series.Sequence>/<Audio>.
//   - validateSceneFragment(code, sceneName, opts) — ONE scene's fragment: no
//     imports, no export, no <Series>/<Series.Sequence>/<Audio>, and exactly
//     one top-level declaration (the scene's own function).
//
// Each entry point composes the same small set of checks below:
//   1. Fast heuristics (balanced braces/parens, has a return) — cheap, catches
//      obvious truncation instantly.
//   2. A real Babel AST parse of the TSX — catches malformed syntax (e.g.
//      JSX attribute syntax leaking into a plain object literal, mismatched
//      tags, stray tokens) that heuristics structurally cannot detect.
//   3. Semantic checks on the parsed AST, scoped to what each entry point
//      actually allows (import sources, export presence, <Series>/<Audio>
//      usage, top-level declaration count/name, interpolate() argument shape,
//      and — full-file only — a durationInFrames sum vs. the real
//      audio-measured total, auto-correcting a small arithmetic slip (the AI
//      is consistently off by a few frames sometimes) instead of rejecting
//      and paying for a full regeneration over a 1-2 frame typo.
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

// ── Shared low-level checks ──────────────────────────────────────────────────

function parseTsx(code, label = "Generated code") {
  try {
    return parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });
  } catch (err) {
    const loc = err.loc ? ` at line ${err.loc.line}, column ${err.loc.column}` : "";
    throw new Error(`${label} has a syntax error${loc}: ${err.message}`);
  }
}

function checkBalancedBraces(code) {
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    throw new Error(
      `Generated code has unbalanced braces (${openBraces} open, ${closeBraces} close) — likely truncated`
    );
  }
}

function checkBalancedParens(code) {
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 2) {
    throw new Error(
      `Generated code has unbalanced parentheses (${openParens} open, ${closeParens} close) — likely truncated`
    );
  }
}

function checkHasReturn(code) {
  if (!code.includes("return")) {
    throw new Error("Generated code has no return statement — likely incomplete");
  }
}

// interpolate() must always be called with exactly 3 arguments (or 4 with an
// options object), and the input/output ranges must be literal arrays of
// matching length — this is the exact failure pattern that has crashed videos
// at runtime before (the rule already exists in the prompt; this enforces it).
function checkInterpolateCalls(ast) {
  const errors = [];
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
        errors.push(
          `interpolate() called with ${node.arguments.length} argument(s) — expected 3, or 4 with an options object${loc}`
        );
        return;
      }
      if (node.arguments.length === 4) {
        const fourth = node.arguments[3];
        const okFourthArgTypes = ["ObjectExpression", "Identifier", "MemberExpression"];
        if (!okFourthArgTypes.includes(fourth.type)) {
          errors.push(
            `interpolate()'s 4th argument must be an options object (e.g. { extrapolateLeft: "clamp" }) or a variable holding one${loc}`
          );
          return;
        }
      }

      const [, inputRange, outputRange] = node.arguments;
      if (inputRange.type !== "ArrayExpression" || outputRange.type !== "ArrayExpression") {
        errors.push(
          `interpolate()'s 2nd/3rd arguments must be literal arrays, not variables${loc}`
        );
        return;
      }
      if (inputRange.elements.length !== outputRange.elements.length) {
        errors.push(
          `interpolate()'s inputRange and outputRange have different lengths (${inputRange.elements.length} vs ${outputRange.elements.length})${loc}`
        );
      }
    },
  });
  return errors;
}

// Only imports from `allowedSources` are permitted. An empty array means NO
// imports are allowed at all (used for scene fragments — everything they
// need is already in scope from the header).
function checkImportRestriction(ast, allowedSources) {
  const errors = [];
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (!allowedSources.includes(source)) {
        errors.push(
          allowedSources.length === 0
            ? `Forbidden import from "${source}" — scene fragments must not import anything, everything needed is already in scope from the header`
            : `Forbidden import from "${source}" — only ${allowedSources.map((s) => `"${s}"`).join(" and ")} are allowed`
        );
      }
    },
  });
  return errors;
}

function checkNoExport(ast) {
  let found = false;
  traverse(ast, {
    ExportNamedDeclaration() {
      found = true;
    },
    ExportDefaultDeclaration() {
      found = true;
    },
  });
  if (found) {
    throw new Error("Fragment must not contain an export — exports are added later during stitching");
  }
}

// A header/scene fragment must never render <Series>, <Series.Sequence>, or
// <Audio> itself — those are assembled deterministically by the stitcher from
// known scene metadata (durationInFrames, audioUrl), not authored by the model.
function checkNoSeriesOrAudioUsage(ast) {
  const found = [];
  traverse(ast, {
    JSXOpeningElement(path) {
      const { name } = path.node;
      let label = null;
      if (name.type === "JSXIdentifier" && (name.name === "Audio" || name.name === "Series")) {
        label = name.name;
      } else if (
        name.type === "JSXMemberExpression" &&
        name.object.name === "Series" &&
        name.property.name === "Sequence"
      ) {
        label = "Series.Sequence";
      }
      if (label) {
        const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
        found.push(`${label}${loc}`);
      }
    },
  });
  if (found.length) {
    throw new Error(
      `Fragment must not render <Series>/<Series.Sequence>/<Audio> — these are added later during stitching. Found: ${found.join(", ")}`
    );
  }
}

// Every top-level (Program-body) function/const/let/var/class declaration —
// used to enforce reserved names in the header and "exactly one declaration"
// in a scene fragment, so two independently-generated fragments can never
// collide when concatenated by the stitcher.
function checkTopLevelDeclarationNames(ast) {
  const declared = [];
  for (const node of ast.program.body) {
    if (node.type === "FunctionDeclaration" && node.id) {
      declared.push({ name: node.id.name, node });
    } else if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (decl.id && decl.id.type === "Identifier") {
          declared.push({ name: decl.id.name, node: decl });
        }
      }
    } else if (node.type === "ClassDeclaration" && node.id) {
      declared.push({ name: node.id.name, node });
    }
  }
  return declared;
}

// Identifiers that are always available without an import — real JS globals
// plus a few DOM/runtime globals that show up harmlessly in generated code
// (e.g. console.log left in during iteration). Everything else a scene or
// header references must either be imported or declared in scope.
const JS_GLOBALS = new Set([
  "Math", "Array", "Object", "JSON", "Date", "Number", "String", "Boolean",
  "Map", "Set", "Symbol", "RegExp", "Error", "Promise",
  "console", "undefined", "NaN", "Infinity",
  "isNaN", "isFinite", "parseInt", "parseFloat",
]);

// Walks every import in the file and returns the set of LOCAL names it binds
// (handles default/named/aliased specifiers — e.g. `import { Series as S }`
// binds "S", not "Series"). Used to build the "what's actually in scope"
// allowlist for the undefined-reference check below.
function collectImportedNames(ast) {
  const names = new Set();
  traverse(ast, {
    ImportDeclaration(path) {
      for (const spec of path.node.specifiers) {
        names.add(spec.local.name);
      }
    },
  });
  return names;
}

// TypeScript type-space identifiers (interface/type names, `React.ReactNode`
// style qualified names, `Record<...>` and other generic type arguments,
// generic type PARAMETERS like the `T` in `function f<T>(x: T)`) share the
// same Identifier node shape as real value references, but Babel's
// "ReferencedIdentifier" visitor does NOT distinguish them from actual runtime
// reads — confirmed the hard way: this false-positived on a live header that
// declared an `interface`, used `React.ReactNode`, and called
// `useMemo<TrieNodeData>(...)`, rejecting a perfectly valid header 6 times in
// a row. Anything nested under one of these TS-only node types is type-level
// and must be skipped.
function isTypeSpaceReference(path) {
  return !!path.findParent(
    (p) =>
      p.isTSTypeAnnotation() ||
      p.isTSTypeReference() ||
      p.isTSInterfaceDeclaration() ||
      p.isTSTypeAliasDeclaration() ||
      p.isTSTypeParameterInstantiation() ||
      p.isTSTypeParameterDeclaration() ||
      p.isTSQualifiedName()
  );
}

// Catches a real, common runtime crash class that pure syntax checks can't
// see: code that PARSES fine but reads an identifier that was never bound —
// e.g. a typo'd/dropped variable ("n is not defined"). JS doesn't error on
// this until the exact frame that executes the read, so it slips past every
// syntactic check and ships straight to a user's browser. Babel's
// "ReferencedIdentifier" visitor is the standard way to iterate only
// identifiers being READ (JSX tag names included, JSX attribute names and
// object-literal keys correctly excluded) — paired with path.scope.hasBinding
// for real (non-allowlisted) declarations, and isTypeSpaceReference to skip
// TypeScript type-only identifiers.
function checkNoUndefinedReferences(ast, allowedNames) {
  const seen = new Map(); // name -> first line seen, deduped for a clean error message
  traverse(ast, {
    ReferencedIdentifier(path) {
      if (isTypeSpaceReference(path)) return;
      const name = path.node.name;
      if (allowedNames.has(name)) return;
      if (path.scope.hasBinding(name)) return;
      if (!seen.has(name)) seen.set(name, path.node.loc?.start.line);
    },
  });
  return Array.from(seen, ([name, line]) => `"${name}" is referenced but never declared or imported${line ? ` (line ${line})` : ""}`);
}

// Node types whose evaluated VALUE can never be a function — if a `const` is
// initialized to one of these and later called as `foo(...)`, that call is
// guaranteed to throw "foo is not a function" at runtime (a real crash
// reported in production: a helper like `cellCY` written as a plain
// expression instead of an arrow function, e.g. `const cellCY = startY + i *
// rowGap` instead of `const cellCY = (i) => startY + i * rowGap`, then called
// as `cellCY(idx)` inside a .map()). `let`/`var` are deliberately excluded —
// a later reassignment could make them callable, and proving that statically
// would need real data-flow analysis, so this stays as narrow and
// zero-false-positive as the rest of these checks.
const NEVER_CALLABLE_INIT_TYPES = new Set([
  "NumericLiteral", "StringLiteral", "BooleanLiteral", "NullLiteral",
  "ObjectExpression", "ArrayExpression", "BinaryExpression", "UnaryExpression",
  "LogicalExpression", "TemplateLiteral", "RegExpLiteral",
]);

// Remotion's `random(seed)` — unlike the seeded-RNG-generator pattern common
// in other libraries (call once to get a function, call THAT repeatedly) —
// returns the number itself on every call. A real production crash: `const
// rng = random(sceneSeed); ... rng()` inside a .map(), throwing "rng is not a
// function" at render time. The init here is a CallExpression (not a literal
// type in NEVER_CALLABLE_INIT_TYPES above), so this needs its own check
// rather than fitting the generic list — we specifically know THIS callee's
// return type because it's Remotion's own documented API, not because we can
// infer arbitrary call-expression return types in general.
function isUncalledRemotionRandomBinding(declaratorInit, path) {
  if (declaratorInit.type !== "CallExpression") return false;
  const { callee } = declaratorInit;
  if (callee.type !== "Identifier" || callee.name !== "random") return false;
  // Only trust this if "random" itself isn't locally shadowed by something
  // else in scope — if it is, we have no idea what it returns, so stay silent
  // rather than risk a false positive.
  const randomBinding = path.scope.getBinding("random");
  return !randomBinding;
}

function checkCalledNonFunctionConst(ast) {
  const errors = [];
  traverse(ast, {
    CallExpression(path) {
      const { callee } = path.node;
      if (callee.type !== "Identifier") return;

      // Uses Babel's real scope resolution (same mechanism as
      // checkNoUndefinedReferences) so this correctly follows shadowing —
      // e.g. an outer non-function const named the same as an inner
      // function const never false-positives.
      const binding = path.scope.getBinding(callee.name);
      if (!binding || binding.kind !== "const") return;

      const declarator = binding.path.node;
      if (declarator.type !== "VariableDeclarator" || !declarator.init) return;

      if (
        NEVER_CALLABLE_INIT_TYPES.has(declarator.init.type) ||
        isUncalledRemotionRandomBinding(declarator.init, binding.path)
      ) {
        const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
        errors.push(`"${callee.name}" is called as a function but is declared as a non-function value${loc}`);
      }
    },
  });
  return errors;
}

// Sum every <Series.Sequence durationInFrames={N}> and compare to the real
// audio-measured total. Small drift gets auto-corrected on the LAST sequence
// (absorbing rounding slop there is harmless); large drift means something
// structural is wrong and gets rejected instead of papered over. Only used by
// the full-file validator — fragments have no <Series.Sequence> of their own.
function checkDurationSum(tsxCode, ast, expectedTotalFrames) {
  if (typeof expectedTotalFrames !== "number") return tsxCode;

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
  if (!allLiteral) return tsxCode;

  const actualTotal = sequenceDurations.reduce((sum, s) => sum + s.value, 0);
  const drift = expectedTotalFrames - actualTotal;
  if (drift === 0) return tsxCode;

  if (Math.abs(drift) > MAX_AUTOFIX_FRAME_DRIFT) {
    throw new Error(
      `durationInFrames sum (${actualTotal}) doesn't match the expected total (${expectedTotalFrames}) — ` +
        `drift of ${drift} frames is too large to auto-fix safely, likely a missing or miscounted scene`
    );
  }

  // Absorb the drift into the LAST sequence's duration.
  const last = sequenceDurations[sequenceDurations.length - 1];
  const correctedValue = last.value + drift;
  const correctedCode =
    tsxCode.slice(0, last.node.start) + String(correctedValue) + tsxCode.slice(last.node.end);
  console.warn(
    `  [validate] Auto-corrected duration drift of ${drift} frame(s) on the last scene (${last.value} → ${correctedValue})`
  );
  return correctedCode;
}

// ── Public entry points ──────────────────────────────────────────────────────

function validateGeneratedCode(tsxCode, componentName, expectedTotalFrames) {
  const hasExport =
    tsxCode.includes(`export const ${componentName}`) ||
    tsxCode.includes(`export function ${componentName}`);
  if (!hasExport) {
    throw new Error(
      "Generated code is incomplete — missing component export (likely truncated)"
    );
  }

  checkBalancedBraces(tsxCode);
  checkBalancedParens(tsxCode);
  checkHasReturn(tsxCode);

  const ast = parseTsx(tsxCode);

  const interpolateErrors = checkInterpolateCalls(ast);
  if (interpolateErrors.length > 0) {
    throw new Error(`Invalid interpolate() usage:\n${interpolateErrors.join("\n")}`);
  }

  const importErrors = checkImportRestriction(ast, ["react", "remotion"]);
  if (importErrors.length > 0) {
    throw new Error(importErrors.join("\n"));
  }

  const undefinedRefs = checkNoUndefinedReferences(ast, new Set([...collectImportedNames(ast), ...JS_GLOBALS]));
  if (undefinedRefs.length > 0) {
    throw new Error(`Generated code references undefined identifier(s):\n${undefinedRefs.join("\n")}`);
  }

  const nonFunctionCalls = checkCalledNonFunctionConst(ast);
  if (nonFunctionCalls.length > 0) {
    throw new Error(`Generated code calls a non-function value:\n${nonFunctionCalls.join("\n")}`);
  }

  return checkDurationSum(tsxCode, ast, expectedTotalFrames);
}

// The FULL set of remotion/react names the sandbox allows (rule 2 in both
// HEADER_CODE_GEN_RULES and SCENE_CODE_GEN_RULES). The header is the ONLY
// place imports are written for a whole lesson, but the model only imports
// whatever ITS OWN helper code happens to use — e.g. a header whose only
// helper needs AbsoluteFill+useCurrentFrame has no reason to also import
// interpolate/spring/Series/Audio for itself. Every SCENE then assumes those
// names are already in scope ("everything you need is already imported by
// the header"), and the stitcher's own wrapper always renders <Series>/
// <Audio> — so a header that imports only a subset is a real "X is not
// defined" crash waiting to happen the moment a scene (or the wrapper) uses
// a name the header didn't personally need. canonicalizeHeaderImports below
// closes this structurally: replace whatever the header imported with this
// fixed superset, unconditionally, every time.
const CANONICAL_REMOTION_EXPORTS = [
  "AbsoluteFill", "interpolate", "spring", "useCurrentFrame", "useVideoConfig",
  "Series", "Sequence", "Audio", "Easing", "interpolateColors", "random", "Loop",
];
const CANONICAL_REACT_EXPORTS = ["useMemo", "useCallback", "useRef"];

// Strips whatever import statement(s) the header actually wrote and prepends
// the full canonical set instead — always a superset of what rule 2 permits,
// so this can never reject valid code, it only guarantees completeness.
// Call this AFTER validateHeaderFragment succeeds (so the header's own code
// is already confirmed to only use react/remotion imports in the first
// place); the returned string is what should flow into every scene's prompt
// and into the final stitched file, not the model's original header text.
function canonicalizeHeaderImports(headerCode) {
  const ast = parseTsx(headerCode, "Header code");

  // Remove each ImportDeclaration's exact text span, working from the END of
  // the file backwards so earlier removals don't shift not-yet-processed
  // offsets.
  const importNodes = ast.program.body
    .filter((n) => n.type === "ImportDeclaration")
    .sort((a, b) => b.start - a.start);

  let stripped = headerCode;
  for (const node of importNodes) {
    stripped = stripped.slice(0, node.start) + stripped.slice(node.end);
  }

  const canonicalImports =
    `import { ${CANONICAL_REMOTION_EXPORTS.join(", ")} } from "remotion";\n` +
    `import { ${CANONICAL_REACT_EXPORTS.join(", ")} } from "react";\n`;

  return (canonicalImports + stripped).trim() + "\n";
}

// Validates the shared header fragment: imports, palette/motif consts, shared
// helper components. No export, no <Series>/<Series.Sequence>/<Audio>, imports
// limited to react/remotion, valid interpolate() shape, and no top-level
// declaration reserved for the stitcher (Scene1..N, the lesson's componentName).
function validateHeaderFragment(code, { reservedNames = [] } = {}) {
  checkBalancedBraces(code);
  checkBalancedParens(code);

  const ast = parseTsx(code, "Header code");

  checkNoExport(ast);
  checkNoSeriesOrAudioUsage(ast);

  const importErrors = checkImportRestriction(ast, ["react", "remotion"]);
  if (importErrors.length > 0) {
    throw new Error(importErrors.join("\n"));
  }

  const interpolateErrors = checkInterpolateCalls(ast);
  if (interpolateErrors.length > 0) {
    throw new Error(`Invalid interpolate() usage in header:\n${interpolateErrors.join("\n")}`);
  }

  const declared = checkTopLevelDeclarationNames(ast);
  const collision = declared.find(
    (d) => /^Scene\d+$/.test(d.name) || reservedNames.includes(d.name)
  );
  if (collision) {
    throw new Error(
      `Header declares a reserved name "${collision.name}" — Scene1..N and the lesson component name are reserved for later stitching.`
    );
  }

  const undefinedRefs = checkNoUndefinedReferences(ast, new Set([...collectImportedNames(ast), ...JS_GLOBALS]));
  if (undefinedRefs.length > 0) {
    throw new Error(`Header references undefined identifier(s):\n${undefinedRefs.join("\n")}`);
  }

  const nonFunctionCalls = checkCalledNonFunctionConst(ast);
  if (nonFunctionCalls.length > 0) {
    throw new Error(`Header calls a non-function value:\n${nonFunctionCalls.join("\n")}`);
  }

  // Everything above validated the header AS WRITTEN (its own imports were
  // enough for ITS OWN code). What's returned, though, is import-canonicalized
  // — see canonicalizeHeaderImports — so every scene generated against this
  // header, and the stitcher's own <Series>/<Audio> wrapper, can rely on the
  // FULL sandbox surface being in scope, not just whatever this header
  // personally needed.
  return canonicalizeHeaderImports(code);
}

// Parses an already-validated (and import-canonicalized) header's code and
// returns everything a scene generated against it is allowed to reference:
// the header's imports (now always the full canonical set) plus every
// top-level const/function it declares (e.g. PALETTE, Backdrop). Call this
// once per lesson, right after the header validates, and pass the result to
// every validateSceneFragment call for that lesson — this is what lets the
// undefined-reference check below distinguish "a real header identifier"
// from "a hallucinated one."
function getHeaderExposedNames(headerCode) {
  const ast = parseTsx(headerCode, "Header code");
  const declared = checkTopLevelDeclarationNames(ast).map((d) => d.name);
  return new Set([...collectImportedNames(ast), ...declared]);
}

// Validates ONE scene fragment: exactly one top-level declaration named
// sceneName, no imports/export/<Series>/<Series.Sequence>/<Audio>, valid
// interpolate() shape, and no reference to an identifier that isn't either a
// JS global or something the header actually exposes (see
// getHeaderExposedNames) — catches a scene hallucinating a variable/component
// name that doesn't exist, which is otherwise invisible until it crashes a
// user's browser at playback (a bare "X is not defined" ReferenceError).
function validateSceneFragment(code, sceneName, { headerAvailableNames = [] } = {}) {
  checkBalancedBraces(code);
  checkBalancedParens(code);
  checkHasReturn(code);

  if (!code.includes(`function ${sceneName}`) && !code.includes(`const ${sceneName}`)) {
    throw new Error(
      `Scene fragment is missing its component "${sceneName}" — likely truncated or wrong name`
    );
  }

  const ast = parseTsx(code, `Scene ${sceneName} code`);

  checkNoExport(ast);
  checkNoSeriesOrAudioUsage(ast);

  const importErrors = checkImportRestriction(ast, []);
  if (importErrors.length > 0) {
    throw new Error(importErrors.join("\n"));
  }

  const interpolateErrors = checkInterpolateCalls(ast);
  if (interpolateErrors.length > 0) {
    throw new Error(`Invalid interpolate() usage in ${sceneName}:\n${interpolateErrors.join("\n")}`);
  }

  const declared = checkTopLevelDeclarationNames(ast);
  if (declared.length !== 1 || declared[0].name !== sceneName) {
    throw new Error(
      `Scene fragment must contain EXACTLY one top-level declaration named "${sceneName}" ` +
        `(found: ${declared.map((d) => d.name).join(", ") || "none"}) — nest any local helpers inside the function body instead`
    );
  }

  const undefinedRefs = checkNoUndefinedReferences(ast, new Set([...headerAvailableNames, ...JS_GLOBALS]));
  if (undefinedRefs.length > 0) {
    throw new Error(`${sceneName} references undefined identifier(s):\n${undefinedRefs.join("\n")}`);
  }

  const nonFunctionCalls = checkCalledNonFunctionConst(ast);
  if (nonFunctionCalls.length > 0) {
    throw new Error(`${sceneName} calls a non-function value:\n${nonFunctionCalls.join("\n")}`);
  }

  return code;
}

module.exports = {
  validateGeneratedCode,
  validateHeaderFragment,
  validateSceneFragment,
  getHeaderExposedNames,
};
