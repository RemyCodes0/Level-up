const { validateGeneratedCode } = require("./validateCode");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.log(`FAIL: ${name}: ${err.message}`);
  }
}

// ── Test 1: valid code should pass cleanly ──────────────────────────────
test("Valid code passes unmodified", () => {
  const code = `
import { AbsoluteFill, interpolate, Series } from "remotion";

export const LessonAbc123 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={90}>
        <AbsoluteFill style={{ opacity: interpolate(0, [0, 30], [0, 1]) }} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <AbsoluteFill />
      </Series.Sequence>
    </Series>
  );
};
`;
  const result = validateGeneratedCode(code, "LessonAbc123", 180);
  if (result !== code) throw new Error("Should not have modified valid code");
});

// ── Test 2: interpolate with 2 args should be rejected ──────────────────
test("interpolate() with 2 args is rejected", () => {
  const code = `
export const LessonAbc123 = () => {
  const x = interpolate(0, [0, 30]);
  return <div />;
};
`;
  let threw = false;
  try {
    validateGeneratedCode(code, "LessonAbc123");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have thrown but did not");
});

// ── Test 3: interpolate with variable ranges should be rejected ─────────
test("interpolate() with variable ranges is rejected", () => {
  const code = `
export const LessonAbc123 = () => {
  const a = [0, 30];
  const b = [0, 1];
  const x = interpolate(0, a, b);
  return <div />;
};
`;
  let threw = false;
  try {
    validateGeneratedCode(code, "LessonAbc123");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have thrown but did not");
});

// ── Test 4: mismatched array lengths should be rejected ──────────────────
test("interpolate() with mismatched array lengths is rejected", () => {
  const code = `
export const LessonAbc123 = () => {
  const x = interpolate(0, [0, 15, 30], [0, 1]);
  return <div />;
};
`;
  let threw = false;
  try {
    validateGeneratedCode(code, "LessonAbc123");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have thrown but did not");
});

// ── Test 5: forbidden import should be rejected ──────────────────────────
test("Forbidden import is rejected", () => {
  const code = `
import { motion } from "framer-motion";
export const LessonAbc123 = () => {
  return <div />;
};
`;
  let threw = false;
  try {
    validateGeneratedCode(code, "LessonAbc123");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have thrown but did not");
});

// ── Test 6: small duration drift gets auto-fixed ─────────────────────────
test("Small duration drift (3 frames) gets auto-corrected on last scene", () => {
  const code = `
export const LessonAbc123 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={90}>
        <div />
      </Series.Sequence>
      <Series.Sequence durationInFrames={87}>
        <div />
      </Series.Sequence>
    </Series>
  );
};
`;
  const result = validateGeneratedCode(code, "LessonAbc123", 180);
  if (result.includes("durationInFrames={87}")) {
    throw new Error("Last sequence's duration should have been corrected from 87 to 90");
  }
  if (!result.includes("durationInFrames={90}")) {
    throw new Error("Expected corrected value 90 to appear somewhere");
  }
});

// ── Test 7: large duration drift should be rejected, not auto-fixed ─────
test("Large duration drift (50 frames) is rejected, not silently fixed", () => {
  const code = `
export const LessonAbc123 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={90}>
        <div />
      </Series.Sequence>
      <Series.Sequence durationInFrames={40}>
        <div />
      </Series.Sequence>
    </Series>
  );
};
`;
  let threw = false;
  try {
    validateGeneratedCode(code, "LessonAbc123", 180);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have thrown but did not (drift too large to silently fix)");
});

console.log("\nAll tests complete.");