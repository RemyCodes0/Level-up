import * as Babel from "@babel/standalone";
import React, { useMemo, useCallback, useRef } from "react";
import * as RemotionNS from "remotion";

interface CompilationResult {
  Component: React.ComponentType | null;
  error: string | null;
}

// Wraps Remotion's <Audio> so every usage defaults to pauseWhenBuffering={true}
// — without this, if a scene's audio hasn't finished loading over the network
// when its Sequence starts, the audio stutters/glitches. With
// pauseWhenBuffering, Remotion pauses the whole composition until that
// scene's audio is ready, then resumes in sync.
//
// CRITICAL SAFETY NET: pauseWhenBuffering is designed for "not ready yet",
// not "will never load". If the audio URL is genuinely broken (404, wrong
// domain, deleted file), the browser fires a hard 'error' event — but
// Remotion's buffering-wait logic doesn't automatically distinguish that
// from "still loading", so it can end up waiting/retrying indefinitely on a
// resource that will never succeed. This caused a real production incident:
// 20,000+ repeated requests to a single broken audio file in minutes.
//
// The fix: track whether THIS specific audio source has fired a hard error.
// Once it has, flip pauseWhenBuffering off for that instance so Remotion
// stops blocking/retrying on it and the video just plays silently for that
// scene instead of hanging forever.
const BufferedAudio: React.FC<any> = (props) => {
  const [hasErrored, setHasErrored] = React.useState(false);
  return React.createElement(RemotionNS.Audio, {
    pauseWhenBuffering: !hasErrored,
    onError: (e: any) => {
      console.warn("[BufferedAudio] Audio failed to load — disabling buffer-wait for this source to prevent infinite retry:", props.src, e);
      setHasErrored(true);
    },
    ...props,
  });
};

// ── Runtime crash shields ─────────────────────────────────────────────────────
// Server-side AST validation catches what's statically knowable, but two crash
// classes are only visible at runtime with real frame values flowing through:
//
//   1. interpolate() receiving an inputRange that EVALUATES to NaN/non-finite
//     or non-increasing numbers (a variable that was undefined at runtime,
//     a division that hit 0/0). Remotion throws, React unmounts the scene,
//     and the user gets a black error screen — a real production crash:
//     "inputRange must contain only finite numbers, but got [NaN,NaN]".
//   2. spring() called without fps — throws immediately.
//
// Instead of letting one bad frame value kill the whole lesson, these wrappers
// degrade gracefully: sanitize the input, warn once per unique failure, and
// keep rendering. A slightly-wrong animation curve on one element is strictly
// better than a dead video. These apply to EVERY lesson ever generated — no
// regeneration needed — because the sandbox scope is the single source of
// these bindings for all compiled lesson code.
const warnedRuntimeIssues = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warnedRuntimeIssues.has(key)) return;
  warnedRuntimeIssues.add(key);
  console.warn(`[lesson-runtime-shield] ${message}`);
}

function safeInterpolate(
  input: number,
  inputRange: number[],
  outputRange: number[],
  options?: any,
): number {
  let inR = inputRange;
  let outR = outputRange;

  // Missing/short outputRange (rule violation the model occasionally ships
  // despite validation of the LITERAL arg count — e.g. a variable that's
  // undefined at runtime).
  if (!Array.isArray(inR) || !Array.isArray(outR) || inR.length < 2 || outR.length < 2) {
    warnOnce("shape", `interpolate() called with malformed ranges (in=${JSON.stringify(inR)}, out=${JSON.stringify(outR)}) — returning first output or 0.`);
    return Array.isArray(outR) && Number.isFinite(outR[0]) ? outR[0] : 0;
  }

  // Length mismatch: truncate to the shorter, keeping a valid pairing.
  if (inR.length !== outR.length) {
    const n = Math.min(inR.length, outR.length);
    warnOnce("length", `interpolate() ranges have different lengths (${inR.length} vs ${outR.length}) — truncating to ${n}.`);
    inR = inR.slice(0, n);
    outR = outR.slice(0, n);
  }

  // Non-finite values anywhere: the exact "[NaN,NaN]" production crash.
  if (!inR.every(Number.isFinite) || !outR.every(Number.isFinite)) {
    warnOnce(
      `nan:${JSON.stringify(inputRange)}`,
      `interpolate() received non-finite range values (in=${JSON.stringify(inR)}, out=${JSON.stringify(outR)}) — holding at nearest finite output instead of crashing.`,
    );
    const firstFiniteOut = outR.find(Number.isFinite);
    return firstFiniteOut ?? 0;
  }

  // Non-increasing inputRange: bump duplicates/regressions minimally so
  // Remotion's strict-monotonic requirement passes. [0,30,60,60] → [0,30,60,60.001].
  let needsFix = false;
  for (let i = 1; i < inR.length; i++) {
    if (inR[i] <= inR[i - 1]) { needsFix = true; break; }
  }
  if (needsFix) {
    warnOnce(`mono:${JSON.stringify(inputRange)}`, `interpolate() inputRange not strictly increasing (${JSON.stringify(inR)}) — auto-bumping.`);
    const fixed = inR.slice();
    for (let i = 1; i < fixed.length; i++) {
      if (fixed[i] <= fixed[i - 1]) fixed[i] = fixed[i - 1] + 0.001;
    }
    inR = fixed;
  }

  const safeInput = Number.isFinite(input) ? input : inR[0];
  if (safeInput !== input) {
    warnOnce("input", `interpolate() received a non-finite input value — clamping to range start.`);
  }

  return RemotionNS.interpolate(safeInput, inR, outR, options);
}

function safeSpring(config: any): number {
  if (config && typeof config === "object" && !Number.isFinite(config.fps)) {
    warnOnce("spring-fps", `spring() called without a finite fps — defaulting to 30 instead of crashing.`);
    return RemotionNS.spring({ ...config, fps: 30 });
  }
  return RemotionNS.spring(config);
}

// Remotion's AbsoluteFill/Sequence/Loop are wrapped/memoized component objects,
// NOT plain callable functions — generated code that mistakenly calls one
// directly (AbsoluteFill({ style, children }) instead of JSX) throws
// "AbsoluteFill is not a function". Re-exposing them as plain function
// components makes both usages work: JSX renders normally, and a direct call
// returns a valid React element (calling a plain function component directly
// is legal React). Series needs its .Sequence static preserved.
function makeCallable(Component: any): React.FC<any> {
  const Wrapped: React.FC<any> = (props) => React.createElement(Component, props);
  return Wrapped;
}
const CallableSeries: any = makeCallable(RemotionNS.Series);
// IMPORTANT: Series.Sequence must stay the REAL Remotion component, not a
// makeCallable wrapper. Remotion's <Series> validates its children with a
// strict reference check (child.type !== the internal Series.Sequence),
// throwing "only accepts a list of <Series.Sequence /> components ... but
// got [object Object] instead" for anything else. A wrapped copy has a
// different identity, so it fails that check even when used correctly via
// JSX — breaking every lesson that uses <Series>. Direct-call misuse of
// Series.Sequence is comparatively rare; correctness of normal JSX usage
// takes priority here.
CallableSeries.Sequence = RemotionNS.Series.Sequence;

// ── Per-scene crash containment ───────────────────────────────────────────────
// The single biggest cause of the "This animation hit an error" red screen: ONE
// scene throwing during render takes down the WHOLE composition, because the
// only error boundary above it is Remotion's own Player-level one. A lesson is
// ~10 independent scenes stitched into a <Series>; one bad arithmetic edge in
// scene 7 should cost scene 7, not the other nine and the narration with them.
//
// So every top-level SceneN component is wrapped in its own boundary at compile
// time (see the rename+alias pass in useCompilation below). A scene that throws
// renders this calm fallback instead, the Series timeline keeps advancing, audio
// keeps playing, and the viewer never sees the red screen. Like the
// interpolate/spring shields above, this applies to EVERY lesson already
// generated — no regeneration needed.
//
// Deliberately NOT reset on frame change: Remotion re-renders constantly, and a
// boundary that retries every frame would spin on a deterministic error (and
// flood the console). Once a scene has thrown, it shows the fallback for the
// rest of that sequence's mount, which is exactly one scene's worth of time.
const sceneCrashLogged = new Set<string>();

// Containment alone would trade a LOUD failure for a SILENT one: with the red
// screen gone, nothing would ever tell the viewer (or the retry machinery) that
// a scene is broken, so it would quietly show the fallback forever and never get
// repaired. So a contained crash is still REPORTED here, and DynamicPlayer
// subscribes to surface a quiet, non-blocking "fix this scene" affordance that
// feeds the existing crashInfo → retryScene → patchSceneFromRuntimeError path.
export interface ContainedSceneCrash {
  sceneName: string;
  errorMessage: string;
}
type SceneCrashListener = (crash: ContainedSceneCrash) => void;
const sceneCrashListeners = new Set<SceneCrashListener>();

export function onContainedSceneCrash(listener: SceneCrashListener): () => void {
  sceneCrashListeners.add(listener);
  return () => sceneCrashListeners.delete(listener);
}

class SceneErrorBoundary extends React.Component<
  { sceneName: string; compileId: string; children?: React.ReactNode },
  { crashed: boolean }
> {
  constructor(props: { sceneName: string; compileId: string; children?: React.ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: Error) {
    // Once per scene per COMPILATION — Remotion's repeated renders would
    // otherwise log (and notify) for the same crash hundreds of times. Keyed by
    // compileId, not scene name alone: every lesson has a "Scene1", so a
    // session-wide key would silently suppress the report for every lesson
    // after the first one that crashed in the same slot.
    const key = `${this.props.compileId}:${this.props.sceneName}`;
    if (!sceneCrashLogged.has(key)) {
      sceneCrashLogged.add(key);
      console.error(
        `[scene-shield] ${this.props.sceneName} crashed at render time and was contained — the rest of the lesson keeps playing. Underlying error:`,
        error
      );
      const crash: ContainedSceneCrash = {
        sceneName: this.props.sceneName,
        errorMessage: error?.message ?? "Unknown render error",
      };
      sceneCrashListeners.forEach((l) => {
        try { l(crash); } catch { /* a bad listener must not re-break the scene */ }
      });
    }
  }
  render() {
    if (!this.state.crashed) return this.props.children;
    return React.createElement(
      RemotionNS.AbsoluteFill,
      {
        style: {
          backgroundColor: "#0A0B10",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            color: "rgba(255,255,255,0.28)",
            fontSize: 26,
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            letterSpacing: "0.01em",
          },
        },
        "This part of the lesson couldn't be drawn — the narration continues."
      )
    );
  }
}

function guardScene(Component: any, sceneName: string, compileId: string): React.FC<any> {
  const Guarded: React.FC<any> = (props) =>
    React.createElement(
      SceneErrorBoundary,
      { sceneName, compileId },
      React.createElement(Component, props)
    );
  return Guarded;
}

// ── Sandbox scope ─────────────────────────────────────────────────────────────
// Expose the ENTIRE Remotion module so any current or future Remotion export
// (interpolateColors, Easing, Loop, random, etc.) is automatically available
// in generated code without any manual wiring. No more "X is not defined"
// errors for legitimate Remotion exports — ever.
//
// staticFile is excluded: it resolves local asset paths that don't exist in
// this dynamic, no-build-step execution environment.
//
// useState is excluded: Remotion components must be pure functions of the
// current frame. Local state that persists across renders breaks that model
// and causes bugs when Remotion re-renders frames out of order during export.
const EXCLUDED_REMOTION_KEYS = new Set(["staticFile"]);

const SCOPE: Record<string, any> = {};
for (const [key, value] of Object.entries(RemotionNS)) {
  if (!EXCLUDED_REMOTION_KEYS.has(key)) SCOPE[key] = value;
}
Object.assign(SCOPE, { useMemo, useCallback, useRef });
SCOPE.Audio = BufferedAudio;            // buffered wrapper wins over raw Audio
SCOPE.interpolate = safeInterpolate;    // NaN/monotonicity shield (see above)
SCOPE.spring = safeSpring;              // missing-fps shield
SCOPE.AbsoluteFill = makeCallable(RemotionNS.AbsoluteFill); // survives direct-call misuse
SCOPE.Sequence = makeCallable(RemotionNS.Sequence);
SCOPE.Loop = makeCallable(RemotionNS.Loop);
SCOPE.Series = CallableSeries;
SCOPE.__guardScene = guardScene;        // per-scene crash containment (see above)

const SCOPE_KEYS = Object.keys(SCOPE);

// Collect the identifiers a chunk of generated code declares at the TOP LEVEL.
// Matching is anchored to the start of a line (multiline `^`), so only
// unindented, column-0 declarations count — which is exactly what collides
// with the scope-destructure prelude. A `const random = ...` nested inside a
// scene function lives in its own block scope and never clashes with the
// prelude, so it must NOT be matched here (matching it would wrongly strip a
// real Remotion binding that the rest of the lesson still needs).
//
// This is the fix for a whole-lesson-killing bug: the prelude emits
// `const { AbsoluteFill, Audio, Loop, Img, Video, random, ... } = __SCOPE__;`
// as top-level consts. If the generated lesson ALSO declares any of those
// names at the top level (a helper `function Loop()`, a `const Video = ...`),
// the two `const`s in the same scope throw
// `SyntaxError: Identifier 'X' has already been declared` — which fails the
// entire compile, taking all scenes down with one cryptic message. By letting
// the code's own declaration win (dropping the colliding name from the
// prelude), a collision degrades to at most one shadowed Remotion binding
// instead of a dead lesson.
function collectTopLevelDeclarations(source: string): Set<string> {
  const declared = new Set<string>();
  const pattern = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(source)) !== null) {
    declared.add(m[1]);
  }
  return declared;
}

export function useCompilation(
  code: string,
  // Optional Audio override. The Player passes nothing (uses BufferedAudio). The
  // client-side EXPORT passes @remotion/media's <Audio>, which the web renderer
  // requires. Must be a stable module-level ref so the memo stays valid.
  audioOverride?: React.ComponentType<any>,
): CompilationResult {
  return useMemo(() => {
    if (!code?.trim()) return { Component: null, error: null };

    try {
      // Step 1 — strip import lines (not valid inside a Function body).
      // We do NOT parse what was imported — the scope destructure makes every
      // name available unconditionally, so there's nothing to parse.
      const codeWithoutImports = code
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
        .trim();

      // Step 2 — find the exported component name.
      let exportedName: string | null = null;
      const patterns = [
        /export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=/,
        /export\s+function\s+(\w+)\s*\(/,
        /export\s+default\s+function\s+(\w+)\s*\(/,
      ];
      for (const pattern of patterns) {
        const match = codeWithoutImports.match(pattern);
        if (match) { exportedName = match[1]; break; }
      }

      console.log("[useCompilation] exportedName:", exportedName);
      console.log("[useCompilation] code preview:", codeWithoutImports.slice(0, 300));

      if (!exportedName) {
        return {
          Component: null,
          error: `Could not find exported component. Code starts with:\n${codeWithoutImports.slice(0, 200)}`,
        };
      }

      // Step 3 — strip export keywords so everything is plain consts/functions.
      const codeWithoutExportKeywords = codeWithoutImports
        .replace(/export\s+default\s+function\s+/g, "function ")
        .replace(/export\s+default\s+/g, "const __default__ = ")
        .replace(/export\s+const\s+/g, "const ")
        .replace(/export\s+function\s+/g, "function ");

      // Step 3b — wrap every top-level SceneN in its own error boundary, so one
      // scene throwing can't take the whole lesson down with it (see
      // SceneErrorBoundary / guardScene above for why this matters).
      //
      // Each declaration is renamed `SceneN` → `__raw_SceneN`, then a guarded
      // alias `const SceneN = __guardScene(__raw_SceneN, "SceneN")` is appended.
      // The stitched `<SceneN />` call sites in the Lesson component are left
      // untouched, so they now resolve to the guarded alias instead. Safe
      // because: the rename regex is anchored to column 0 (declaration lines
      // only, never JSX call sites, never nested helpers) and \b-terminated, so
      // `Scene1` can't match `Scene10`; and the aliases are appended at module
      // level BEFORE the factory's `return <Lesson>`, while `<SceneN />` is only
      // dereferenced later, at render time, when every alias is initialized.
      const sceneNames = [
        ...codeWithoutExportKeywords.matchAll(/^(?:function|const)\s+(Scene\d+)\b/gm),
      ].map((m) => m[1]);

      let codeWithoutExports = codeWithoutExportKeywords;
      for (const name of sceneNames) {
        codeWithoutExports = codeWithoutExports.replace(
          new RegExp(`^(function|const)(\\s+)${name}\\b`, "m"),
          `$1$2__raw_${name}`
        );
      }
      if (sceneNames.length > 0) {
        // Identifies THIS compilation, so the boundary's "report each crash
        // once" dedup can't leak across lessons (every lesson has a Scene1).
        const compileId = `c${Math.random().toString(36).slice(2, 10)}`;
        codeWithoutExports +=
          "\n" +
          sceneNames
            .map((n) => `const ${n} = __guardScene(__raw_${n}, "${n}", "${compileId}");`)
            .join("\n") +
          "\n";
      }

      // Step 4 — build the scope destructure prelude, EXCLUDING any name the
      // code already declares at the top level. Without this exclusion, a
      // single collision (e.g. the lesson defines its own top-level `Loop` or
      // `Video`) produces a duplicate-`const` SyntaxError that kills every
      // scene at once. Letting the lesson's declaration win keeps the rest of
      // the composition alive.
      const declaredTopLevel = collectTopLevelDeclarations(codeWithoutExports);
      const usableScopeKeys = SCOPE_KEYS.filter((k) => !declaredTopLevel.has(k));

      const droppedKeys = SCOPE_KEYS.filter((k) => declaredTopLevel.has(k));
      if (droppedKeys.length > 0) {
        console.warn(
          "[useCompilation] Generated code redeclares scope name(s) at top level; " +
          "letting the code's own declaration win to avoid a duplicate-const crash:",
          droppedKeys.join(", ")
        );
      }

      const scopeDestructure = `const { ${usableScopeKeys.join(", ")} } = __SCOPE__;\n`;

      // Prepend the (deduped) destructure so every Remotion export and safe
      // React hook is available as a bare identifier, regardless of how the
      // generated code's import statements were written (or whether they were
      // written at all — unused names in the destructure are harmless).
      const codeToTranspile = scopeDestructure + codeWithoutExports;

      // Step 5 — transpile with Babel (TSX → plain JS).
      let transpiled: string;
      try {
        const result = Babel.transform(codeToTranspile, {
          presets: ["react", "typescript"],
          filename: "dynamic.tsx",
          sourceType: "script",
        });
        if (!result.code) throw new Error("Babel produced no output");
        transpiled = result.code;
      } catch (babelErr) {
        console.error("[useCompilation] Babel error:", babelErr);
        console.error("[useCompilation] Code:\n", codeToTranspile.slice(0, 800));
        throw babelErr;
      }

      // Step 6 — execute. Only React and __SCOPE__ are injected — the
      // destructure prelude already spreads everything else into scope.
      const factory = new Function(
        "React",
        "__SCOPE__",
        `"use strict";\n${transpiled}\nreturn ${exportedName};`
      );

      const scope = audioOverride ? { ...SCOPE, Audio: audioOverride } : SCOPE;
      const Component = factory(React, scope);

      if (typeof Component !== "function") {
        return { Component: null, error: `Expected a function, got ${typeof Component}` };
      }

      return { Component, error: null };
    } catch (err) {
      return {
        Component: null,
        error: err instanceof Error ? err.message : "Unknown compilation error",
      };
    }
  }, [code, audioOverride]);
}