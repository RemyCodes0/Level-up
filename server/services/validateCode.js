// Standalone validator — no dependencies on other services, so it can be
// safely imported by both claudeService and bundleService without creating
// a circular dependency.
function validateGeneratedCode(tsxCode, componentName) {
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
      `Generated code has unbalanced parentheses — likely truncated`
    );
  }

  if (!tsxCode.includes("return")) {
    throw new Error("Generated code has no return statement — likely incomplete");
  }
}

module.exports = { validateGeneratedCode };