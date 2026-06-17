// Standalone validator — no dependencies on other services, so it can be
// safely imported by both claudeService and bundleService without creating
// a circular dependency.
//
// Two layers of checking:
//   1. Fast heuristics (export present, balanced braces/parens, has a
//      return) — cheap, catches obvious truncation instantly.
//   2. A real Babel AST parse of the TSX — this is the layer that actually
//      catches malformed syntax (e.g. JSX attribute syntax leaking into a
//      plain object literal, mismatched tags, stray tokens) that the
//      heuristics above structurally cannot detect, since brace/paren counts
//      and keyword presence can all look "balanced" on code that is not
//      valid JavaScript.
//
// Requires @babel/parser — install with:
//   npm install @babel/parser
const { parse } = require("@babel/parser");

function validateGeneratedCode(tsxCode, componentName) {
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
  // This is what actually catches malformed JS/TSX — e.g. JSX attribute
  // syntax (`prop={value}`) mistakenly used inside a plain object literal
  // like `style={{ fontSize={18} as any }}`. The heuristics above cannot
  // see this kind of error: braces and parens are still individually
  // well-formed, "return" and the export are both still present. Only an
  // actual parse of the code as JavaScript reveals that it isn't valid.
  try {
    parse(tsxCode, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });
  } catch (err) {
    // Babel's parse errors include a loc (line/column) — surface it so the
    // failure is actually debuggable instead of a bare "syntax error".
    const loc = err.loc ? ` at line ${err.loc.line}, column ${err.loc.column}` : "";
    throw new Error(`Generated code has a syntax error${loc}: ${err.message}`);
  }
}

module.exports = { validateGeneratedCode };