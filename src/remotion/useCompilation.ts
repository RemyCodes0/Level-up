import * as Babel from "@babel/standalone";
import React, { useMemo, useCallback, useRef } from "react";
import * as RemotionNS from "remotion";

interface CompilationResult {
  Component: React.ComponentType | null;
  error: string | null;
}

// Wraps Remotion's <Audio> so every usage defaults to pauseWhenBuffering={true}.
const BufferedAudio: React.FC<any> = (props) =>
  React.createElement(RemotionNS.Audio, { pauseWhenBuffering: true, ...props });

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
SCOPE.Audio = BufferedAudio; // buffered wrapper wins over raw Audio

// Pre-build the destructure string once — all SCOPE keys made available as
// bare identifiers in every generated lesson, unconditionally.
const SCOPE_DESTRUCTURE = `const { ${Object.keys(SCOPE).join(", ")} } = __SCOPE__;\n`;

export function useCompilation(code: string): CompilationResult {
  return useMemo(() => {
    if (!code?.trim()) return { Component: null, error: null };

    try {
      // Step 1 — strip import lines (not valid inside a Function body).
      // We do NOT parse what was imported — SCOPE_DESTRUCTURE makes every
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
      const codeWithoutExports = codeWithoutImports
        .replace(/export\s+default\s+function\s+/g, "function ")
        .replace(/export\s+default\s+/g, "const __default__ = ")
        .replace(/export\s+const\s+/g, "const ")
        .replace(/export\s+function\s+/g, "function ");

      // Step 4 — prepend the unconditional SCOPE destructure so every Remotion
      // export and safe React hook is available as a bare identifier, regardless
      // of how the generated code's import statements were written (or whether
      // they were written at all — unused names in the destructure are harmless).
      const codeToTranspile = SCOPE_DESTRUCTURE + codeWithoutExports;

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
      // SCOPE_DESTRUCTURE prelude already spreads everything else into scope.
      const factory = new Function(
        "React",
        "__SCOPE__",
        `"use strict";\n${transpiled}\nreturn ${exportedName};`
      );

      const Component = factory(React, SCOPE);

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
  }, [code]);
}