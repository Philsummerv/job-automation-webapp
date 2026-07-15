// Bundles the extension into dist/ (content scripts can't use ES modules, so
// everything is bundled to IIFE). Load dist/ unpacked in chrome://extensions.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

// Type-check FIRST. esbuild strips types without checking them, so a type-only
// break — e.g. an API change in packages/automation — would otherwise bundle
// clean and fail silently at runtime. Fail the build here instead.
console.log("Type-checking (tsc --noEmit)…");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
} catch {
  console.error("Type check failed — aborting build.");
  process.exit(1);
}

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/content.ts", "src/background.ts"],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  logLevel: "info",
});

cpSync("manifest.json", "dist/manifest.json");
console.log("Built. Load the dist/ folder via chrome://extensions → Load unpacked.");
