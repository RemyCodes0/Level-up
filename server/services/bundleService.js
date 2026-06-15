const fs = require("fs");
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { validateGeneratedCode } = require("./validateCode");

const RENDERER_DIR = path.resolve(__dirname, "../../remotion-render");
const COMPOSITIONS_DIR = path.join(RENDERER_DIR, "src/compositions");

// Writes the AI-generated code to unique files, bundles it LOCALLY with webpack,
// and returns the path to the bundled site + a cleanup function.
// No AWS, no Lambda — bundling happens on this machine.
async function bundleLessonCode(
  componentName,
  tsxCode,
  renderId,
  durationInFrames = 9000
) {
  validateGeneratedCode(tsxCode, componentName);

  // 1. Write the AI-generated composition file
  const componentPath = path.join(COMPOSITIONS_DIR, `${componentName}.tsx`);
  fs.writeFileSync(componentPath, tsxCode, "utf-8");

  // 2. Write a unique Root file with the EXACT total duration
  const rootFileName = `Root_${renderId}.tsx`;
  const rootPath = path.join(RENDERER_DIR, "src", rootFileName);
  const rootCode = `
import { Composition } from "remotion";
import { ${componentName} } from "./compositions/${componentName}";

export const RemotionRoot = () => {
  return (
    <Composition
      id="${componentName}"
      component={${componentName}}
      durationInFrames={${durationInFrames}}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
`.trim();
  fs.writeFileSync(rootPath, rootCode, "utf-8");

  // 3. Write a unique entry point that registers this Root
  const entryFileName = `index_${renderId}.tsx`;
  const entryPath = path.join(RENDERER_DIR, "src", entryFileName);
  const entryCode = `
import { registerRoot } from "remotion";
import { RemotionRoot } from "./${rootFileName.replace(".tsx", "")}";

registerRoot(RemotionRoot);
`.trim();
  fs.writeFileSync(entryPath, entryCode, "utf-8");

  // 4. Bundle locally with webpack (this is the heavy step — needs RAM)
  console.log(`[${renderId}] Bundling locally...`);
  const serveUrl = await bundle({
    entryPoint: entryPath,
    // Cache speeds up repeat bundles
    webpackOverride: (config) => config,
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        console.log(`[${renderId}] Bundle: ${progress}%`);
      }
    },
  });

  console.log(`[${renderId}] Bundle ready: ${serveUrl}`);

  return {
    serveUrl, // local path to the bundled site
    componentName,
    cleanup: () =>
      cleanupBundle(renderId, [componentPath, rootPath, entryPath]),
  };
}

// Removes the generated source files after rendering
function cleanupBundle(renderId, filePaths) {
  try {
    filePaths.forEach((p) => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    console.log(`[${renderId}] Cleaned up generated files`);
  } catch (err) {
    console.error(`[${renderId}] Cleanup failed (non-fatal):`, err.message);
  }
}

module.exports = { bundleLessonCode };