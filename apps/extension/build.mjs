// Bundles the extension into dist/ (content scripts can't use ES modules, so
// everything is bundled to IIFE). Load dist/ unpacked in chrome://extensions.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Stamp the build time into the bundle so the panel can show which build a tab
// is actually running. Reloading the extension does NOT re-inject content
// scripts into already-open tabs, so a page can keep running an old copy long
// after a rebuild — that cost two debugging rounds on 2026-08-29 before anyone
// noticed the tab was stale. Now it's visible in the panel header.
const BUILD_STAMP = new Date().toLocaleTimeString("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

await build({
  entryPoints: ["src/content.ts", "src/background.ts", "src/web-bridge.ts"],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  logLevel: "info",
  define: { __BUILD_TIME__: JSON.stringify(BUILD_STAMP) },
});

cpSync("icons", "dist/icons", { recursive: true });

// `node build.mjs --store` strips localhost from the manifest.
//
// http://localhost:3000 has to be in host_permissions and the web-bridge match
// list for local development, but a published extension asking for localhost
// access is a review flag — reviewers read it as leftover debug access, and it
// is one of the easier rejections to avoid. Dev builds keep it; the build you
// upload does not.
const store = process.argv.includes("--store");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

if (store) {
  const isLocal = (s) => s.includes("localhost");
  manifest.host_permissions = manifest.host_permissions.filter((h) => !isLocal(h));
  manifest.content_scripts = manifest.content_scripts
    .map((cs) => ({ ...cs, matches: cs.matches.filter((m) => !isLocal(m)) }))
    .filter((cs) => cs.matches.length > 0);
}

writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

console.log(
  store
    ? "Built for the Chrome Web Store (localhost stripped). Zip the CONTENTS of dist/ and upload that."
    : "Built for development. Load the dist/ folder via chrome://extensions → Load unpacked.",
);
