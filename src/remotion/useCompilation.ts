import * as Babel from "@babel/standalone";
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
  Series,
  Audio,
  Easing,
} from "remotion";

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
//
// Defined once at module level (not inside useMemo) since it doesn't depend
// on the compiled code — no need to recreate it on every recompilation.
// Props spread AFTER the default so an AI-generated lesson could still
// explicitly override it if it ever needed to (none currently do).
const BufferedAudio: React.FC<any> = (props) =>
  React.createElement(Audio, { pauseWhenBuffering: true, ...props });

export function useCompilation(code: string): CompilationResult {
  return useMemo(() => {
    if (!code?.trim()) return { Component: null, error: null };

    try {
      // Step 1 — strip all import lines
      const codeWithoutImports = code
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
        .trim();

      // Step 2 — find the exported component name.
      // Handle multiple export patterns Claude might generate:
      //   export const Foo = () => {
      //   export const Foo: React.FC = () => {
      //   export function Foo() {
      //   export default function Foo() {
      let exportedName: string | null = null;

      const patterns = [
        /export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=/,   // export const Foo = / export const Foo: FC =
        /export\s+function\s+(\w+)\s*\(/,                  // export function Foo(
        /export\s+default\s+function\s+(\w+)\s*\(/,        // export default function Foo(
      ];

      for (const pattern of patterns) {
        const match = codeWithoutImports.match(pattern);
        if (match) {
          exportedName = match[1];
          break;
        }
      }

      // Log what we found to help debug
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

      // Step 4 — transpile with Babel
      let transpiled: string;
      try {
        const result = Babel.transform(codeWithoutExports, {
          presets: ["react", "typescript"],
          filename: "dynamic.tsx",
          sourceType: "script",
        });
        if (!result.code) throw new Error("Babel produced no output");
        transpiled = result.code;
      } catch (babelErr) {
        console.error("[useCompilation] Babel error:", babelErr);
        console.error("[useCompilation] Code:\n", codeWithoutExports.slice(0, 800));
        throw babelErr;
      }

      // Step 5 — execute inside new Function with Remotion APIs injected.
      // NOTE: "Audio" here is BufferedAudio (see above), not the raw import —
      // every <Audio> tag in the generated code resolves to our wrapper.
      const factory = new Function(
        "React",
        "AbsoluteFill",
        "useCurrentFrame",
        "useVideoConfig",
        "spring",
        "interpolate",
        "Sequence",
        "Series",
        "Audio",
        "Easing",
        `
        "use strict";
        ${transpiled}
        return ${exportedName};
        `
      );

      const Component = factory(
        React,
        AbsoluteFill,
        useCurrentFrame,
        useVideoConfig,
        spring,
        interpolate,
        Sequence,
        Series,
        BufferedAudio,
        Easing
      );

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