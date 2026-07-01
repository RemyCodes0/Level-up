import * as Babel from "@babel/standalone";
import React, { useMemo, useCallback, useRef } from "react";
import * as RemotionNS from "remotion";

interface CompilationResult {
  Component: React.ComponentType | null;
  error: string | null;
}

// Wraps Remotion's <Audio> so EVERY usage across EVERY AI-generated lesson
// defaults to pauseWhenBuffering={true} — without this, if a scene's audio
// file hasn't finished loading over the network when its Sequence starts,
// the audio stutters/glitches as it plays through underbuffered data.
// With pauseWhenBuffering, Remotion instead pauses the whole composition
// (video + audio together) until that scene's audio is ready, then resumes
// in sync — no glitching, just a brief clean pause on a slow connection.
const BufferedAudio: React.FC<any> = (props) =>
  React.createElement(RemotionNS.Audio, { pauseWhenBuffering: true, ...props });

// ── The sandbox scope AI-generated lesson code runs against ────────────────
// Rather than manually re-listing individual Remotion exports one at a time
// (which breaks every time the model legitimately uses a Remotion export we
// hadn't explicitly wired up yet — this has happened repeatedly: Easing,
// useMemo, and it will keep happening with anything else the model reaches
// for), we expose the ENTIRE Remotion module automatically. Any current or
// future named export from "remotion" now just works, with no code changes
// needed here ever again for that class of bug.
//
// A small, deliberately curated set of React hooks is added on top — NOT
// the whole React module, since arbitrary React internals aren't needed and
// some (useState) would actively break Remotion's rendering model.
//
// EXCLUDED_KEYS are real exports that DO exist but are deliberately kept out
// of scope, because using them causes real bugs (not just a clean crash):
//   - staticFile: resolves local asset paths that don't exist in this
//     dynamic, no-build-step execution context.
const EXCLUDED_REMOTION_KEYS = new Set(["staticFile"]);

const SCOPE: Record<string, any> = {};
for (const [key, value] of Object.entries(RemotionNS)) {
  if (!EXCLUDED_REMOTION_KEYS.has(key)) SCOPE[key] = value;
}
// Safe, deterministic React hooks only. useState is deliberately NOT
// included — Remotion components must be pure functions of the current
// frame; local state that persists across renders breaks that model and
// can cause bugs when Remotion re-renders frames out of order during export.
Object.assign(SCOPE, { useMemo, useCallback, useRef });
// Applied LAST so our buffered wrapper always wins over the raw Audio export.
SCOPE.Audio = BufferedAudio;

export function useCompilation(code: string): CompilationResult {
  return useMemo(() => {
    if (!code?.trim()) return { Component: null, error: null };

    try {
      // Step 1 — capture every named import across ALL import statements
      // (regardless of source — we don't need to track which package each
      // name came from, since everything destructures from one merged SCOPE
      // object built above from the full Remotion module + curated hooks).
      const importedNames: string[] = [];
      const importLineRegex =
        /^import\s+(?:\{([^}]+)\}|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm;
      let importMatch: RegExpExecArray | null;
      while ((importMatch = importLineRegex.exec(code)) !== null) {
        const named = importMatch[1] || importMatch[3] || "";
        named
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .forEach((n) => importedNames.push(n));
      }

      // Strip all import lines from the code — they aren't valid inside a
      // Function body, and we've already captured what we need from them.
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
        if (match) {
          exportedName = match[1];
          break;
        }
      }

      console.log("[useCompilation] exportedName:", exportedName);
      console.log("[useCompilation] code preview:", codeWithoutImports.slice(0, 300));

      if (!exportedName) {
        return {
          Component: null,
          error: `Could not find exported component. Code starts with:\n${codeWithoutImports.slice(0, 200)}`,
        };
      }

      // Step 3 — remove ALL export keywords so everything is plain consts/functions
      const codeWithoutExports = codeWithoutImports
        .replace(/export\s+default\s+function\s+/g, "function ")
        .replace(/export\s+default\s+/g, "const __default__ = ")
        .replace(/export\s+const\s+/g, "const ")
        .replace(/export\s+function\s+/g, "function ");

      // Step 4 — prepend a destructure line pulling every name the model
      // imported out of SCOPE. If the model imported `Easing`, `spring`,
      // `useMemo`, or literally any other real Remotion export, it now
      // resolves automatically — no manual wiring required.
      const uniqueNames = [...new Set(importedNames)];
      const destructurePrelude = uniqueNames.length
        ? `const { ${uniqueNames.join(", ")} } = __SCOPE__;\n`
        : "";

      const codeToTranspile = destructurePrelude + codeWithoutExports;

      // Step 5 — transpile with Babel
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

      // Step 6 — execute inside new Function. Only two things are injected:
      // React itself (for React.createElement etc. if used directly), and
      // __SCOPE__ (the merged Remotion + safe-hooks namespace the destructure
      // prelude above pulls from). This is the whole point of the rewrite —
      // no more one-by-one parameter lists to maintain.
      const factory = new Function(
        "React",
        "__SCOPE__",
        `
        "use strict";
        ${transpiled}
        return ${exportedName};
        `
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