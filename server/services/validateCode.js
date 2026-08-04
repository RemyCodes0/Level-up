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
// Extracts the actual numeric value of a plain number literal — including a
// negative one, which Babel parses as UnaryExpression{operator:"-",
// argument:NumericLiteral} rather than a single literal node. Returns null
// for anything else (an Identifier, a BinaryExpression like `start + 20`,
// a CallExpression, etc.) — i.e. anything that ISN'T a literal the model was
// told to write ("inputRange and outputRange are ARRAY LITERALS of plain
// number literals... NEVER an expression inside the array").
function literalNumericValue(node) {
  if (!node) return null;
  if (node.type === "NumericLiteral") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") {
    return -node.argument.value;
  }
  return null;
}

// Constant-folding evaluator for interpolate-range elements. Where
// literalNumericValue only reads a directly-written literal, this also
// RESOLVES the two shapes the model actually writes in practice when it
// deviates from pure literals:
//   - an Identifier bound to a `const x = <numeric literal>` in an enclosing
//     scope (`const end = 210; ... [180, end]`)
//   - simple arithmetic over resolvable operands (`[start, start + 20]`,
//     `[end - 30, end]`)
// This converts a whole class of previously-uncheckable ranges into
// fully-checked ones (finite? strictly increasing?) with ZERO new false
// positives: anything that doesn't resolve (a function parameter, a loop
// index, a call result) returns null and is skipped exactly as before —
// unresolvable is still "can't verify", never "reject".
function resolveNumericExpression(node, path, depth = 0) {
  if (!node || depth > 6) return null; // depth cap: real expressions are 1-3 deep

  const direct = literalNumericValue(node);
  if (direct !== null) return direct;

  if (node.type === "Identifier") {
    const binding = path.scope.getBinding(node.name);
    if (!binding || binding.kind !== "const") return null;
    // A reassigned or destructured binding can't be trusted to hold its init.
    if (!binding.constant) return null;
    const decl = binding.path.node;
    if (decl.type !== "VariableDeclarator" || !decl.init) return null;
    return resolveNumericExpression(decl.init, binding.path, depth + 1);
  }

  if (node.type === "BinaryExpression") {
    const left = resolveNumericExpression(node.left, path, depth + 1);
    const right = resolveNumericExpression(node.right, path, depth + 1);
    if (left === null || right === null) return null;
    switch (node.operator) {
      case "+": return left + right;
      case "-": return left - right;
      case "*": return left * right;
      case "/": return right === 0 ? null : left / right; // 0-division: unresolvable, not a verdict
      default: return null;
    }
  }

  if (node.type === "UnaryExpression" && node.operator === "-") {
    const inner = resolveNumericExpression(node.argument, path, depth + 1);
    return inner === null ? null : -inner;
  }

  return null;
}

function checkInterpolateCalls(ast) {
  const errors = [];
  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      // interpolateColors() shares interpolate()'s exact argument shape
      // (frame, inputRange, outputRange, options?) and the exact same crash
      // class — a real production crash ("outputRange can not be undefined")
      // came from an interpolateColors() call this function used to skip
      // entirely, since it only ever matched the name "interpolate". Every
      // check below is name-agnostic (uses fnName in messages) so this one
      // addition covers both.
      const fnName = node.callee.type === "Identifier" ? node.callee.name : null;
      if (fnName !== "interpolate" && fnName !== "interpolateColors") return;

      const loc = node.loc ? ` (line ${node.loc.start.line})` : "";

      // interpolate()/interpolateColors() require 3 args minimum, and
      // Remotion supports a legitimate optional 4th argument: an options
      // object like { extrapolateLeft: "clamp", extrapolateRight: "clamp" }.
      // That object can be written inline OR passed as a variable/constant
      // (a very common pattern when the same clamp options are reused many
      // times, e.g. `const clamp = {...}; interpolate(f, [0,1], [0,1],
      // clamp)`). Accept an inline object, an identifier, or a member
      // expression (e.g. OPTS.clamp). Only reject things that clearly can't
      // be an options object, like a number or string literal.
      if (node.arguments.length < 3 || node.arguments.length > 4) {
        errors.push(
          `${fnName}() called with ${node.arguments.length} argument(s) — expected 3, or 4 with an options object${loc}`
        );
        return;
      }
      if (node.arguments.length === 4) {
        const fourth = node.arguments[3];
        const okFourthArgTypes = ["ObjectExpression", "Identifier", "MemberExpression"];
        if (!okFourthArgTypes.includes(fourth.type)) {
          errors.push(
            `${fnName}()'s 4th argument must be an options object (e.g. { extrapolateLeft: "clamp" }) or a variable holding one${loc}`
          );
          return;
        }
      }

      const [, inputRange, outputRange] = node.arguments;
      if (inputRange.type !== "ArrayExpression" || outputRange.type !== "ArrayExpression") {
        errors.push(
          `${fnName}()'s 2nd/3rd arguments must be literal arrays, not variables${loc}`
        );
        return;
      }
      if (inputRange.elements.length !== outputRange.elements.length) {
        errors.push(
          `${fnName}()'s inputRange and outputRange have different lengths (${inputRange.elements.length} vs ${outputRange.elements.length})${loc}`
        );
      }

      // Remotion's OWN runtime requirement (unlike outputRange, which has no
      // such constraint — a fade-out [1, 0] is valid) is that inputRange is
      // STRICTLY increasing, and every element finite. Checked via
      // resolveNumericExpression, which constant-folds the expression shapes
      // the model actually writes (`[start, start + 20]` where start is a
      // const literal, `[end - 30, end]`) instead of only accepting
      // directly-written literals — an earlier literal-only version silently
      // skipped exactly the ranges that later crashed live with
      // "inputRange must contain only finite numbers, but got [NaN,NaN]".
      // Anything genuinely unresolvable (loop index math, function params)
      // still passes through unchecked — "can't verify" is never a verdict.
      const inputValues = inputRange.elements.map((el) => resolveNumericExpression(el, path));
      if (inputValues.every((v) => v !== null)) {
        if (inputValues.some((v) => !Number.isFinite(v))) {
          errors.push(
            `${fnName}()'s inputRange resolves to a non-finite value ([${inputValues.join(", ")}])${loc} — this throws "inputRange must contain only finite numbers" at runtime`
          );
        } else {
          for (let i = 1; i < inputValues.length; i++) {
            if (inputValues[i] <= inputValues[i - 1]) {
              errors.push(
                `${fnName}()'s inputRange must be strictly increasing but resolves to [${inputValues.join(", ")}]${loc} — this throws "inputRange must be strictly monotonically increasing" at runtime`
              );
              break;
            }
          }
        }
      }
    },
  });
  return errors;
}

// spring() without fps throws "fps must be provided" at runtime — one of the
// oldest crash classes in this pipeline (crash-safety rule S2 in both code-gen
// prompts). Only flags the provably-wrong shape: an INLINE object literal with
// no `fps` property and no spread (a spread could inject fps invisibly, and an
// options object passed as a variable can't be inspected here) — same
// zero-false-positive philosophy as every other check in this file.
function checkSpringFpsCalls(ast) {
  const errors = [];
  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      if (node.callee.type !== "Identifier" || node.callee.name !== "spring") return;
      // Respect local shadowing — a scene-defined helper named spring isn't Remotion's.
      const binding = path.scope.getBinding("spring");
      if (binding && binding.kind !== "module") return;

      const arg = node.arguments[0];
      if (!arg || arg.type !== "ObjectExpression") return;
      if (arg.properties.some((p) => p.type === "SpreadElement")) return;

      const hasFps = arg.properties.some(
        (p) =>
          p.type === "ObjectProperty" &&
          ((p.key.type === "Identifier" && p.key.name === "fps") ||
            (p.key.type === "StringLiteral" && p.key.value === "fps"))
      );
      if (!hasFps) {
        const loc = node.loc ? ` (line ${node.loc.start.line})` : "";
        errors.push(
          `spring() called without fps${loc} — throws "fps must be provided" at runtime. Use spring({ frame, fps, config }) with const { fps } = useVideoConfig().`
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

// Remotion's AbsoluteFill/Series/Sequence/Audio/Loop are COMPONENTS — they
// must be used as JSX (<AbsoluteFill>...</AbsoluteFill>), never invoked
// directly as a plain function call. A real production crash: a header
// invented a fictional "call the component with a props object" convention
// instead of writing real JSX — every helper in it did
//   return AbsoluteFill({ style: {...}, children: [ { type: "rect", ... }, ... ] })
// instead of
//   return <AbsoluteFill style={{...}}><rect .../></AbsoluteFill>
// which throws "AbsoluteFill is not a function" the instant Remotion tries
// to render it (Remotion's components aren't plain callable functions —
// they're wrapped/memoized objects, so calling one directly isn't just
// unconventional, it's a guaranteed TypeError). Scoped to just these five
// names, not every remotion import: interpolate, spring, useCurrentFrame,
// useVideoConfig, Easing.*, interpolateColors, and random are ALL
// genuinely meant to be called as plain functions — only component-shaped
// exports are ever JSX-only.
const REMOTION_COMPONENT_ONLY_NAMES = new Set(["AbsoluteFill", "Series", "Sequence", "Audio", "Loop"]);

function checkCalledRemotionComponent(ast) {
  const errors = [];
  traverse(ast, {
    CallExpression(path) {
      const { callee } = path.node;
      if (callee.type !== "Identifier" || !REMOTION_COMPONENT_ONLY_NAMES.has(callee.name)) return;

      // Respect real shadowing (same philosophy as isUncalledRemotionRandomBinding
      // above): if this name resolves to a genuine LOCAL declaration (not an
      // import), we have no idea what it actually is here, so stay silent
      // rather than risk a false positive. No binding at all, or a binding
      // that IS an import ("module" kind), both mean this call will resolve
      // to Remotion's real component at runtime — a guaranteed crash either way
      // (headers always end up importing the full canonical set — see
      // canonicalizeHeaderImports — even if this fragment didn't write the
      // import itself).
      const binding = path.scope.getBinding(callee.name);
      if (binding && binding.kind !== "module") return;

      const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
      errors.push(
        `"${callee.name}" is a Remotion component and must be used as JSX (<${callee.name}>...</${callee.name}>), never called directly like "${callee.name}(...)" — this throws "${callee.name} is not a function" at render time${loc}`
      );
    },
  });
  return errors;
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

// A real production crash: a scene declared `const topPoints = data.map(d =>
// scaleTopX(d.x))` textually BEFORE `const scaleTopX = ...` further down the
// same function — throws "Cannot access 'scaleTopX' before initialization" at
// render time (a `const`/`let` TDZ violation), since JS doesn't hoist the
// INITIALIZATION, only the binding itself.
//
// Deliberately narrow, same philosophy as checkCalledNonFunctionConst: only
// flags a reference whose source position is BEFORE its own declaration's
// position AND that isn't reached by walking through a nested named
// `function helper() {}` — a helper declared early but not CALLED until
// after the real declaration executes is legitimate (function declarations
// are fully hoisted, so calling it later is safe even though its BODY
// textually references the not-yet-declared name). Catching that specific
// safe pattern would need real call-order data-flow analysis; skipping it
// keeps this check zero-false-positive at the cost of missing that one rare
// safe-looking-risky shape. Everything else this fires on (the identifier
// used directly, or inside an immediately-invoked callback like
// `.map()`/`.filter()`/`.reduce()`) is a guaranteed crash in this sandbox,
// since every top-level statement in a scene/header function runs
// synchronously in source order every render — there's no setTimeout/event
// handler here for a callback to genuinely defer into.
function checkUsedBeforeDeclared(ast) {
  const errors = [];
  traverse(ast, {
    VariableDeclarator(declPath) {
      const parent = declPath.parentPath.node;
      if (parent.type !== "VariableDeclaration" || (parent.kind !== "const" && parent.kind !== "let")) return;
      const id = declPath.node.id;
      if (id.type !== "Identifier") return;

      const name = id.name;
      const declStart = declPath.node.start;
      const declaringScope = declPath.scope;
      const binding = declaringScope.getBinding(name);
      if (!binding) return;

      for (const refPath of binding.referencePaths) {
        // `export const X = ...` makes Babel register the wrapping
        // ExportNamedDeclaration itself as one of X's "references" (an
        // internal bookkeeping artifact, not a real value read) — its
        // position is naturally before the declarator's (the `export`
        // keyword precedes `const`), which would otherwise false-positive on
        // every single exported component. Real references are always
        // Identifier nodes; this wrapper isn't, so filtering to Identifier
        // excludes it without needing an export-specific special case.
        if (refPath.node.type !== "Identifier") continue;
        if (refPath.node.start == null || declStart == null || refPath.node.start >= declStart) continue;

        let hopsThroughNamedFunction = false;
        let current = refPath.scope;
        while (current && current.block !== declaringScope.block) {
          if (current.block.type === "FunctionDeclaration") {
            hopsThroughNamedFunction = true;
            break;
          }
          current = current.parent;
        }
        if (hopsThroughNamedFunction) continue;

        const loc = refPath.node.loc ? ` (line ${refPath.node.loc.start.line})` : "";
        errors.push(
          `"${name}" is used${loc} before its own "${parent.kind} ${name} = ..." declaration — throws "Cannot access '${name}' before initialization" at runtime; move the declaration earlier`
        );
      }
    },
  });
  return errors;
}

// The only React hooks exposed to generated code at all (see the sandbox's
// SCOPE in useCompilation.ts — useState is deliberately NOT in scope, so
// calling it there already fails as a separate, already-caught "X is not
// defined" error; these three are the ones that actually need this check).
const REACT_HOOK_NAMES = new Set(["useMemo", "useCallback", "useRef"]);

// A real production crash: generated code called useMemo(...) (or
// useCallback/useRef) directly at the TOP LEVEL of the header/scene script —
// e.g. `const PALETTE = useMemo(() => ({...}), []);` sitting outside any
// function — instead of inside the header/scene's own component function.
// The sandbox executes this script by calling it as a plain function
// (useCompilation.ts's `factory(React, scope)`), itself invoked from INSIDE
// that hook's OWN useMemo() call — so a top-level hook call in the
// generated code executes WHILE REACT is mid-processing a DIFFERENT
// component's hooks, corrupting that component's hook accounting. This
// produces the exact pair of errors seen live: "Do not call Hooks inside
// useEffect(...), useMemo(...)..." followed immediately by "Should have a
// queue. You are likely calling Hooks conditionally" — often attributed to
// whatever component happens to own the corrupted hook list, not to the
// generated code that actually caused it, which is what made this hard to
// place from the browser console alone. Uses Babel's own
// `path.getFunctionParent()` — the direct, built-in way to ask "is this
// node inside ANY function" — rather than reimplementing that walk.
function checkHooksCalledOutsideFunction(ast) {
  const errors = [];
  traverse(ast, {
    CallExpression(path) {
      const { callee } = path.node;
      if (callee.type !== "Identifier" || !REACT_HOOK_NAMES.has(callee.name)) return;
      if (!path.getFunctionParent()) {
        const loc = path.node.loc ? ` (line ${path.node.loc.start.line})` : "";
        errors.push(
          `"${callee.name}(...)" is called at the top level${loc}, not inside a function — this throws a "Should have a queue" / invalid-hook-call crash at runtime; every hook call must be inside the scene's (or header's) own component function`
        );
      }
    },
  });
  return errors;
}

// A real reported failure: a scene renders <Arrow to={someAnchor} .../> where
// someAnchor never positions anything else — the arrow points at a spot
// nothing was ever drawn at, because whatever the model meant to place there
// got dropped somewhere between planning and JSX. A real anchor that
// positions an actual on-screen element is, by construction, referenced at
// LEAST twice: once by the Arrow's own to/from, and once by whatever
// <div>/<circle>/etc. it points at (see CRAFT §C: "every dependent element
// READS that same const"). An anchor identifier referenced EXACTLY once
// (only inside the Arrow call itself) can only mean nothing else in the
// scene reads that position — i.e. nothing is actually drawn there. This is
// provable from reference counts alone, not a style heuristic, so it stays
// zero-false-positive like the other checks in this file. Deliberately
// narrow: only fires on a named identifier/member-expression target with a
// resolvable binding — a bare inline literal (to={{x: 700, y: 540}}) is left
// alone, since there's no named binding to prove is unused elsewhere (and
// the existing anchor-reuse convention is itself only a style preference for
// that shape, not a provable bug).
function rootBindingName(expr) {
  let node = expr;
  while (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    node = node.object;
  }
  return node.type === "Identifier" ? node.name : null;
}

function checkArrowTargetsAreReferenced(ast) {
  const errors = [];
  traverse(ast, {
    JSXOpeningElement(path) {
      const { name, attributes } = path.node;
      if (name.type !== "JSXIdentifier" || name.name !== "Arrow") return;

      for (const attrName of ["to", "from"]) {
        const attr = attributes.find(
          (a) => a.type === "JSXAttribute" && a.name.name === attrName
        );
        if (!attr || attr.value?.type !== "JSXExpressionContainer") continue;
        const expr = attr.value.expression;

        const rootName = rootBindingName(expr);
        if (!rootName) continue; // inline literal or other shape — not checkable here

        const binding = path.scope.getBinding(rootName);
        if (!binding) continue; // not a locally-resolvable binding — stay silent

        // Count references OUTSIDE this specific attribute's own expression.
        const attrStart = attr.value.start;
        const attrEnd = attr.value.end;
        const otherRefs = binding.referencePaths.filter((refPath) => {
          const n = refPath.node;
          return !(n.start >= attrStart && n.end <= attrEnd);
        });

        if (otherRefs.length === 0) {
          const loc = attr.loc ? ` (line ${attr.loc.start.line})` : "";
          errors.push(
            `Arrow's "${attrName}" target "${rootName}" is referenced nowhere else in the scene${loc} — nothing is actually drawn at that position, so this arrow points at nothing. Either render a real element there using "${rootName}", or remove the arrow.`
          );
        }
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

  const springErrors = checkSpringFpsCalls(ast);
  if (springErrors.length > 0) {
    throw new Error(`Invalid spring() usage:\n${springErrors.join("\n")}`);
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

  const calledComponents = checkCalledRemotionComponent(ast);
  if (calledComponents.length > 0) {
    throw new Error(`Generated code calls a Remotion component as a function:\n${calledComponents.join("\n")}`);
  }

  const usedBeforeDeclared = checkUsedBeforeDeclared(ast);
  if (usedBeforeDeclared.length > 0) {
    throw new Error(`Generated code has a temporal-dead-zone violation:\n${usedBeforeDeclared.join("\n")}`);
  }

  const badHookCalls = checkHooksCalledOutsideFunction(ast);
  if (badHookCalls.length > 0) {
    throw new Error(`Generated code calls a hook outside a function:\n${badHookCalls.join("\n")}`);
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
// ── SVG-fragment containment ─────────────────────────────────────────────────
// Root cause of a whole class of "half the scene is invisible" lessons: the
// header defines shared components that RETURN bare SVG fragments (<g>,
// <circle>, <rect>...), and scenes then render them inside plain <div>s /
// <AbsoluteFill>. SVG elements outside an <svg> ancestor are created as
// HTMLUnknownElements and render NOTHING — no crash, no warning, the shapes
// just silently don't exist. Observed live in a Dijkstra lesson where every
// GraphNode/Panel/NodeTile was invisible in most scenes. Two checks:
//   1. checkNoSvgFragmentComponents — a component whose return ROOT is an SVG
//      fragment tag is a landmine: it only works if every future call site
//      remembers to wrap it in <svg>, which the scene model reliably forgets.
//      Self-contained components (own <svg> root, or plain divs) work anywhere.
//   2. checkSvgPrimitivesInHtmlContext — a literal SVG primitive nested under
//      a literal HTML container (div/span/...) or AbsoluteFill (always a div)
//      with no <svg> in between, in the same JSX tree. A definite render-miss.
const SVG_FRAGMENT_TAGS = new Set([
  "g", "circle", "rect", "line", "path", "text", "polygon", "polyline",
  "ellipse", "defs", "pattern", "mask", "tspan", "linearGradient",
  "radialGradient", "stop", "use", "marker", "clipPath",
]);
const HTML_CONTAINER_TAGS = new Set([
  "div", "span", "p", "section", "main", "article", "aside", "header",
  "footer", "nav", "ul", "ol", "li", "button", "a", "table", "tbody", "tr",
  "td", "th", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  // Not an HTML tag, but Remotion's AbsoluteFill always renders a <div>, so
  // as an ancestor it's just as fatal for a bare SVG fragment.
  "AbsoluteFill",
]);

function jsxTagName(node) {
  const nameNode = node.openingElement && node.openingElement.name;
  if (nameNode && nameNode.type === "JSXIdentifier") return nameNode.name;
  return null; // JSXMemberExpression (Series.Sequence etc.) — not relevant here
}

// Returns the root JSX element tag names a function can return (follows
// fragments and conditional expressions one level deep — enough for how
// generated components are actually written).
function collectReturnRootTags(fnNode) {
  const tags = [];
  const visit = (expr) => {
    if (!expr) return;
    if (expr.type === "JSXElement") {
      const t = jsxTagName(expr);
      if (t) tags.push(t);
    } else if (expr.type === "JSXFragment") {
      expr.children.forEach((c) => { if (c.type === "JSXElement") visit(c); });
    } else if (expr.type === "ConditionalExpression") {
      visit(expr.consequent);
      visit(expr.alternate);
    } else if (expr.type === "LogicalExpression") {
      visit(expr.right);
    }
  };
  if (fnNode.body && fnNode.body.type === "JSXElement") {
    visit(fnNode.body); // arrow with implicit return
  } else if (fnNode.body && fnNode.body.type === "BlockStatement") {
    for (const stmt of fnNode.body.body) {
      if (stmt.type === "ReturnStatement") visit(stmt.argument);
    }
  }
  return tags;
}

// Check 1 — components that return bare SVG fragments at their root.
function checkNoSvgFragmentComponents(ast) {
  const errors = [];
  const report = (name, tag) => {
    errors.push(
      `Component "${name}" returns a bare <${tag}> SVG fragment as its root. SVG elements only render inside an <svg> tag — a component like this becomes INVISIBLE the moment a scene renders it inside a <div> or <AbsoluteFill> (which scenes constantly do). Make it SELF-CONTAINED instead: return its own absolutely-positioned <svg> root (e.g. <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}>...your <${tag}>...</svg>), or build it from plain <div>s.`
    );
  };
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id && path.node.id.name;
      if (!name || !/^[A-Z]/.test(name)) return;
      for (const tag of collectReturnRootTags(path.node)) {
        if (SVG_FRAGMENT_TAGS.has(tag)) { report(name, tag); break; }
      }
    },
    VariableDeclarator(path) {
      const name = path.node.id && path.node.id.name;
      const init = path.node.init;
      if (!name || !/^[A-Z]/.test(name)) return;
      if (!init || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) return;
      for (const tag of collectReturnRootTags(init)) {
        if (SVG_FRAGMENT_TAGS.has(tag)) { report(name, tag); break; }
      }
    },
  });
  return errors;
}

// Check 2 — SVG primitives nested under an HTML container with no <svg>
// between them, within one JSX tree. Also treats locally-declared
// fragment-root components (found by the same root-tag scan) as primitives
// at their usage sites, so `<MyG/>` under a <div> is caught too.
function checkSvgPrimitivesInHtmlContext(ast) {
  const errors = [];
  const seen = new Set();

  // Names of local components whose return root is an SVG fragment.
  const fragmentComponents = new Set();
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id && path.node.id.name;
      if (name && /^[A-Z]/.test(name) && collectReturnRootTags(path.node).some((t) => SVG_FRAGMENT_TAGS.has(t))) {
        fragmentComponents.add(name);
      }
    },
    VariableDeclarator(path) {
      const name = path.node.id && path.node.id.name;
      const init = path.node.init;
      if (name && /^[A-Z]/.test(name) && init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") && collectReturnRootTags(init).some((t) => SVG_FRAGMENT_TAGS.has(t))) {
        fragmentComponents.add(name);
      }
    },
  });

  traverse(ast, {
    JSXElement(path) {
      const tag = jsxTagName(path.node);
      if (!tag) return;
      const isPrimitive = SVG_FRAGMENT_TAGS.has(tag);
      const isFragmentComponent = fragmentComponents.has(tag);
      if (!isPrimitive && !isFragmentComponent) return;

      let p = path.parentPath;
      while (p) {
        const n = p.node;
        if (n.type === "JSXElement") {
          const ancestorTag = jsxTagName(n);
          if (ancestorTag === "svg") return; // properly contained
          if (ancestorTag && HTML_CONTAINER_TAGS.has(ancestorTag)) {
            const key = `${tag}@${path.node.loc ? path.node.loc.start.line : "?"}`;
            if (!seen.has(key)) {
              seen.add(key);
              errors.push(
                `<${tag}> is rendered inside <${ancestorTag}> with no <svg> wrapper between them (line ${path.node.loc ? path.node.loc.start.line : "?"}). SVG elements outside an <svg> tag silently render NOTHING — wrap this subtree in <svg style={{position:"absolute",left:0,top:0,width:1920,height:1080,pointerEvents:"none",overflow:"visible"}}>...</svg>, or rebuild it with plain <div>s.`
              );
            }
            return;
          }
          // Other component / other svg-fragment ancestor: keep walking up.
        } else if (
          n.type === "FunctionDeclaration" ||
          n.type === "ArrowFunctionExpression" ||
          n.type === "FunctionExpression"
        ) {
          return; // reached the component root — fragment-root case, handled by check 1
        }
        p = p.parentPath;
      }
    },
  });
  return errors.slice(0, 6); // enough to correct on retry without flooding the prompt
}

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

  const springErrors = checkSpringFpsCalls(ast);
  if (springErrors.length > 0) {
    throw new Error(`Invalid spring() usage in header:\n${springErrors.join("\n")}`);
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

  const calledComponents = checkCalledRemotionComponent(ast);
  if (calledComponents.length > 0) {
    throw new Error(`Header calls a Remotion component as a function:\n${calledComponents.join("\n")}`);
  }

  const usedBeforeDeclared = checkUsedBeforeDeclared(ast);
  if (usedBeforeDeclared.length > 0) {
    throw new Error(`Header has a temporal-dead-zone violation:\n${usedBeforeDeclared.join("\n")}`);
  }

  const badHookCalls = checkHooksCalledOutsideFunction(ast);
  if (badHookCalls.length > 0) {
    throw new Error(`Header calls a hook outside a function:\n${badHookCalls.join("\n")}`);
  }

  // Shared components MUST be self-contained (own <svg> root or plain divs) —
  // a bare-<g>-returning component silently renders nothing whenever a scene
  // uses it outside an <svg>, which scenes do constantly. See the comment on
  // checkNoSvgFragmentComponents for the observed production failure.
  const svgFragmentErrors = checkNoSvgFragmentComponents(ast);
  if (svgFragmentErrors.length > 0) {
    throw new Error(`Header defines SVG-fragment component(s) that will be invisible outside <svg>:\n${svgFragmentErrors.join("\n")}`);
  }

  const svgContextErrors = checkSvgPrimitivesInHtmlContext(ast);
  if (svgContextErrors.length > 0) {
    throw new Error(`Header renders SVG element(s) where they cannot display:\n${svgContextErrors.join("\n")}`);
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

// Builds a compact version of the header for embedding in EVERY one of a
// lesson's 8-14 per-scene prompts, instead of resending the header's full
// implementation on each call. A scene never needs to know HOW a shared
// component like Backdrop/Arrow animates internally — only that it exists
// and what to pass it — so every top-level function/component's BODY is
// collapsed to a one-line placeholder while its exact name + parameters
// (the part a scene actually needs to call it correctly) are kept verbatim.
// Plain value declarations (PALETTE, SAFE, ZONES, CLAMP, clampPos, etc.) are
// left completely untouched: they're already small, and a scene needs their
// EXACT values (a hex color, a bound number), not just their existence.
//
// Pure string-slicing off @babel/parser's own node start/end offsets — no
// @babel/generator involved (not a declared project dependency, and slicing
// the original source text is both simpler and can't introduce a
// re-serialization bug). Only ever used to build what gets SENT to the
// model for scene generation; the real, full header is still what gets
// stitched into the final video and what getHeaderExposedNames validates
// against — this function must never be used for either of those.
function compactHeaderForPrompt(headerCode) {
  const ast = parseTsx(headerCode, "Header code");
  const PLACEHOLDER = "{ /* implementation already declared above in this header — do not redeclare, just call it */ }";

  // (start, end) of the body to blank out, collected then applied
  // back-to-front so earlier replacements don't shift later offsets.
  const edits = [];

  function collapseIfFunctionBody(node) {
    if (!node || node.body?.type !== "BlockStatement") return;
    edits.push({ start: node.body.start, end: node.body.end, text: PLACEHOLDER });
  }

  for (const stmt of ast.program.body) {
    if (stmt.type === "FunctionDeclaration") {
      collapseIfFunctionBody(stmt);
    } else if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) {
        const init = decl.init;
        if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          collapseIfFunctionBody(init);
          // Expression-bodied arrows (e.g. `const clampPos = (v,lo,hi) =>
          // Math.min(hi, Math.max(lo, v));`) are deliberately left alone —
          // no braces to collapse, already one line, and exactly the kind
          // of small pure-math helper a scene benefits from seeing in full.
        }
      }
    }
  }

  edits.sort((a, b) => b.start - a.start);
  let result = headerCode;
  for (const e of edits) {
    result = result.slice(0, e.start) + e.text + result.slice(e.end);
  }
  return result;
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

  const springErrors = checkSpringFpsCalls(ast);
  if (springErrors.length > 0) {
    throw new Error(`Invalid spring() usage in ${sceneName}:\n${springErrors.join("\n")}`);
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

  const calledComponents = checkCalledRemotionComponent(ast);
  if (calledComponents.length > 0) {
    throw new Error(`${sceneName} calls a Remotion component as a function:\n${calledComponents.join("\n")}`);
  }

  const usedBeforeDeclared = checkUsedBeforeDeclared(ast);
  if (usedBeforeDeclared.length > 0) {
    throw new Error(`${sceneName} has a temporal-dead-zone violation:\n${usedBeforeDeclared.join("\n")}`);
  }

  const badHookCalls = checkHooksCalledOutsideFunction(ast);
  if (badHookCalls.length > 0) {
    throw new Error(`${sceneName} calls a hook outside a function:\n${badHookCalls.join("\n")}`);
  }

  const arrowTargetErrors = checkArrowTargetsAreReferenced(ast);
  if (arrowTargetErrors.length > 0) {
    throw new Error(`${sceneName} has arrow(s) pointing at nothing:\n${arrowTargetErrors.join("\n")}`);
  }

  // Same invisible-SVG guard as the header: raw <circle>/<g>/... under a
  // <div>/<AbsoluteFill> with no <svg> between them renders nothing, and a
  // scene-local helper returning a bare fragment is caught at its call sites.
  // (Header components are already guaranteed self-contained by
  // validateHeaderFragment, so scenes can place them anywhere.)
  const svgContextErrors = checkSvgPrimitivesInHtmlContext(ast);
  if (svgContextErrors.length > 0) {
    throw new Error(`${sceneName} renders SVG element(s) where they cannot display:\n${svgContextErrors.join("\n")}`);
  }

  return code;
}

// Validates a CHUNK of several scenes generated in one call — identical to
// validateSceneFragment in every check except the declared-name assertion,
// which requires all of expectedSceneNames to be present (extra top-level
// declarations, e.g. a shared data object a later chunk needs to see, are
// allowed — see the check itself for why) instead of exactly one single
// name. Every other check below already operates over the whole AST
// regardless of how many top-level declarations exist, so nothing else
// changes. `availableNames` should already include the header's exposed
// names AND every prior chunk's declared names (getHeaderExposedNames is
// generic — it just parses code and returns its imports + top-level
// declarations, despite the name — so it works for prior chunk code too).
function validateChunkFragment(code, expectedSceneNames, { availableNames = [] } = {}) {
  checkBalancedBraces(code);
  checkBalancedParens(code);
  checkHasReturn(code);

  for (const name of expectedSceneNames) {
    if (!code.includes(`function ${name}`) && !code.includes(`const ${name}`)) {
      throw new Error(
        `Chunk is missing scene "${name}" — likely truncated, wrong name, or scenes out of order`
      );
    }
  }

  const ast = parseTsx(code, `Chunk (${expectedSceneNames.join(", ")}) code`);

  checkNoExport(ast);
  checkNoSeriesOrAudioUsage(ast);

  const importErrors = checkImportRestriction(ast, []);
  if (importErrors.length > 0) {
    throw new Error(importErrors.join("\n"));
  }

  const interpolateErrors = checkInterpolateCalls(ast);
  if (interpolateErrors.length > 0) {
    throw new Error(`Invalid interpolate() usage in chunk:\n${interpolateErrors.join("\n")}`);
  }

  const springErrors = checkSpringFpsCalls(ast);
  if (springErrors.length > 0) {
    throw new Error(`Invalid spring() usage in chunk:\n${springErrors.join("\n")}`);
  }

  // Every requested scene must be declared. Extra top-level declarations ARE
  // allowed (unlike validateSceneFragment's single-scene case) — a chunk may
  // legitimately need to declare a shared data object (a graph, an array) as
  // its own top-level const so LATER chunks can see it too (anything nested
  // inside a scene's function body is local to that function and invisible
  // outside it). The only thing NOT allowed is a stray Scene-numbered
  // declaration that wasn't actually requested — that's a hallucinated or
  // mislabeled scene, not shared data.
  const declared = checkTopLevelDeclarationNames(ast);
  const declaredNames = declared.map((d) => d.name);
  const expectedSet = new Set(expectedSceneNames);

  const missing = expectedSceneNames.filter((n) => !declaredNames.includes(n));
  if (missing.length > 0) {
    throw new Error(
      `Chunk is missing scene(s) ${missing.join(", ")} (found top-level declarations: ${declaredNames.join(", ") || "none"})`
    );
  }

  const strayScene = declaredNames.find((n) => /^Scene\d+$/.test(n) && !expectedSet.has(n));
  if (strayScene) {
    throw new Error(
      `Chunk declares "${strayScene}", which was not one of the requested scenes (${expectedSceneNames.join(", ")}) — only write the exact scenes asked for.`
    );
  }

  const undefinedRefs = checkNoUndefinedReferences(ast, new Set([...availableNames, ...JS_GLOBALS]));
  if (undefinedRefs.length > 0) {
    throw new Error(`Chunk references undefined identifier(s):\n${undefinedRefs.join("\n")}`);
  }

  const nonFunctionCalls = checkCalledNonFunctionConst(ast);
  if (nonFunctionCalls.length > 0) {
    throw new Error(`Chunk calls a non-function value:\n${nonFunctionCalls.join("\n")}`);
  }

  const calledComponents = checkCalledRemotionComponent(ast);
  if (calledComponents.length > 0) {
    throw new Error(`Chunk calls a Remotion component as a function:\n${calledComponents.join("\n")}`);
  }

  const usedBeforeDeclared = checkUsedBeforeDeclared(ast);
  if (usedBeforeDeclared.length > 0) {
    throw new Error(`Chunk has a temporal-dead-zone violation:\n${usedBeforeDeclared.join("\n")}`);
  }

  const badHookCalls = checkHooksCalledOutsideFunction(ast);
  if (badHookCalls.length > 0) {
    throw new Error(`Chunk calls a hook outside a function:\n${badHookCalls.join("\n")}`);
  }

  const arrowTargetErrors = checkArrowTargetsAreReferenced(ast);
  if (arrowTargetErrors.length > 0) {
    throw new Error(`Chunk has arrow(s) pointing at nothing:\n${arrowTargetErrors.join("\n")}`);
  }

  const svgContextErrors = checkSvgPrimitivesInHtmlContext(ast);
  if (svgContextErrors.length > 0) {
    throw new Error(`Chunk renders SVG element(s) where they cannot display:\n${svgContextErrors.join("\n")}`);
  }

  return code;
}

module.exports = {
  validateGeneratedCode,
  validateHeaderFragment,
  validateSceneFragment,
  validateChunkFragment,
  getHeaderExposedNames,
  compactHeaderForPrompt,
};
