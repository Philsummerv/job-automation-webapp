// Bundles the extension into dist/ (content scripts can't use ES modules, so
// everything is bundled to IIFE). Load dist/ unpacked in chrome://extensions.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

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
