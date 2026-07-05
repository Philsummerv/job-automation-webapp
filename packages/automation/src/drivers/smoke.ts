// Cheap pre-flight smoke test — burns ~1 minute of Browserbase time, not 15.
// Verifies, before the real Indeed go/no-go:
//   (a) session create + CDP connect + live view URL
//   (b) navigation + screenshot
//   (c) buffer-payload setInputFiles against a data: upload form (the remote
//       resume-upload seam)
//   (d) close() actually ends the session (check the dashboard after)
// Run with: npm run smoke -w packages/automation

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { BrowserbaseProvider } from "../providers/browserbase.js";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(pkgDir, ".env") });

const apiKey = process.env.BROWSERBASE_API_KEY;
if (!apiKey) {
  console.error("Set BROWSERBASE_API_KEY in packages/automation/.env first.");
  process.exit(1);
}

const provider = new BrowserbaseProvider({
  apiKey,
  projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
  timeoutSeconds: 120,
});

console.log("Connecting to Browserbase...");
const session = await provider.connect();

try {
  console.log(`✓ Connected. Session: ${session.sessionId}`);
  console.log(`✓ Live view: ${session.liveViewUrl ?? "(unavailable)"}`);

  console.log("Navigating to example.com...");
  await session.page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  const title = await session.page.title();
  console.log(`✓ Page title: "${title}"`);

  const artifactsDir = path.join(pkgDir, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const shot = path.join(artifactsDir, "smoke.png");
  await session.page.screenshot({ path: shot });
  console.log(`✓ Screenshot: ${shot}`);

  console.log("Testing buffer-payload setInputFiles (remote upload seam)...");
  await session.page.setContent('<input type="file" id="up"><div id="out"></div>');
  await session.page.setInputFiles("#up", {
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 smoke test"),
  });
  const uploadedName = await session.page.$eval(
    "#up",
    (el) => (el as HTMLInputElement).files?.[0]?.name ?? "NONE",
  );
  if (uploadedName !== "resume.pdf") throw new Error(`Upload seam failed: got "${uploadedName}"`);
  console.log(`✓ Buffer upload works (file name in DOM: ${uploadedName})`);

  console.log("\nAll smoke checks passed.");
} finally {
  console.log("Closing session...");
  await session.close();
  console.log("✓ close() returned — verify in the Browserbase dashboard that the session shows COMPLETED.");
}
