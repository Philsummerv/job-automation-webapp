// Console readline driver — the M2 Stage A go/no-go entry point.
// Mirrors the desktop app's CLI shim (root scout.js) but honors prompt meta:
// job cards, numbered field options, and live-view URL reminders on captcha
// prompts. Run with: npm run driver -w packages/automation

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { config as loadEnv } from "dotenv";

import { DEFAULT_CONFIG, type ScoutConfig } from "../config.js";
import { runScout } from "../scout.js";
import { BrowserbaseProvider } from "../providers/browserbase.js";
import type { BrowserProvider, BrowserSession } from "../providers/types.js";
import type { PromptMeta } from "../types.js";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
loadEnv({ path: path.join(pkgDir, ".env") });

// ─── Config ─────────────────────────────────────────────────────────────────────

const configPath = path.join(pkgDir, "driver.config.json");
if (!fs.existsSync(configPath)) {
  console.error(
    `Missing ${configPath}\n` +
    `Copy driver.config.example.json to driver.config.json and fill in your details.`,
  );
  process.exit(1);
}
const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<ScoutConfig>;

const apiKey = process.env.BROWSERBASE_API_KEY;
if (!apiKey) {
  console.error(
    "Missing BROWSERBASE_API_KEY.\n" +
    "Sign up at https://www.browserbase.com (free tier), then copy\n" +
    `${path.join(pkgDir, ".env.example")} to .env and paste your key.`,
  );
  process.exit(1);
}
// Optional — the API key resolves the project automatically.
const projectId = process.env.BROWSERBASE_PROJECT_ID || undefined;

// Persistent context: cookies/logins survive across sessions, so the user
// logs into Indeed ONCE. Auto-created on first run and appended to .env.
let contextId = process.env.BROWSERBASE_CONTEXT_ID || undefined;
if (!contextId) {
  console.log("No persistent context yet — creating one (your logins will be saved across runs)...");
  contextId = await BrowserbaseProvider.createContext(apiKey, projectId);
  fs.appendFileSync(path.join(pkgDir, ".env"), `\nBROWSERBASE_CONTEXT_ID=${contextId}\n`);
  console.log(`Created context ${contextId} (saved to .env).`);
}

const config: Partial<ScoutConfig> = {
  ...DEFAULT_CONFIG,
  ...fileConfig,
  twoCaptchaApiKey: process.env.TWOCAPTCHA_KEY || null,
};
if (config.resumePath && !path.isAbsolute(config.resumePath)) {
  config.resumePath = path.resolve(pkgDir, config.resumePath);
}

// ─── Provider (wrapped so SIGINT can close the active session) ─────────────────

const timeoutSeconds = Number(process.env.BROWSERBASE_SESSION_TIMEOUT_SECONDS) || undefined;
let activeSession: BrowserSession | null = null;

const base = new BrowserbaseProvider({ apiKey, projectId, timeoutSeconds, contextId });
const provider: BrowserProvider = {
  name: base.name,
  connect: async () => {
    const session = await base.connect();
    activeSession = session;
    return session;
  },
};

process.on("SIGINT", () => {
  console.log("\nInterrupted — closing the Browserbase session...");
  const done = activeSession ? activeSession.close() : Promise.resolve();
  done.finally(() => process.exit(130));
});

// ─── Prompt rendering ───────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let liveViewUrl: string | undefined;

function printLiveView() {
  if (!liveViewUrl) return;
  console.log("\n  ┌─ LIVE VIEW ─ open this in your browser to see/control the session:");
  console.log(`  │  ${liveViewUrl}`);
  console.log("  └──────────────");
}

async function onPrompt(question: string, meta?: PromptMeta): Promise<string> {
  if (meta && "kind" in meta && meta.kind === "captcha") {
    printLiveView();
  }
  if (meta && "kind" in meta && meta.kind === "job-decision") {
    console.log("  (answer y / n, or __EXIT__ to end the run)");
  }
  if (meta && "field" in meta && meta.suggestion) {
    // Suggestion already printed by the scout's log; nothing extra needed.
  }
  return rl.question(question.endsWith(" ") ? question : `${question} `);
}

// ─── Run ────────────────────────────────────────────────────────────────────────

console.log("ApplyAssistUI Guided — console driver (M2 Stage A go/no-go)");
console.log(`Search: ${config.searchQuery} ${config.searchLocation ? `in ${config.searchLocation}` : "(nationwide)"}; cap: ${config.maxApplications}`);
console.log("Free-tier sessions cap out around 15 minutes — have your Indeed login ready.\n");

try {
  const result = await runScout({
    config,
    provider,
    onPrompt,
    onLog: (level, msg) => (level === "error" ? console.error(msg) : console.log(msg)),
    onStatus: (status) => console.log(`\n[status] ${status}`),
    onSession: (info) => {
      liveViewUrl = info.liveViewUrl;
      console.log(`\n[session] id: ${info.sessionId ?? "unknown"}`);
      printLiveView();
    },
    onActivity: (entry) => {
      console.log(
        `\n[ACTIVITY] ${entry.result} — ${entry.job_title ?? "?"} @ ${entry.employer_name}` +
        (entry.screenshotPath ? `\n           screenshot: ${entry.screenshotPath}` : ""),
      );
    },
  });

  console.log(`\nRun finished: ${JSON.stringify(result)}`);
  console.log("Check the Browserbase dashboard: the session should show as ended, note minutes used.");
} catch (err) {
  console.error(`\nRun failed: ${(err as Error).stack ?? err}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
