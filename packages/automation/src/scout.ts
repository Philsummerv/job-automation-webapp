// runScout orchestrator — ported from automation/scout.js L1258-1697.
// Changes from the desktop original (everything else is verbatim):
//   1. Browser comes from opts.provider.connect() (was launchPersistentContext);
//      session.close() runs in a finally so a metered cloud session can never
//      leak on any exit path.
//   2. No local profile: userDataDir / cache-size guard / browserWindow dropped.
//   3. Notion sink replaced by opts.onActivity + a confirmation screenshot.
//   4. Resume read also retains the raw buffer (config.resumeFile) so the
//      upload works against a remote browser.
//   5. Login-gate prompt points the human at the live view URL.

import fs from "node:fs";
import path from "node:path";
// pdf-parse's index.js runs a debug branch (reads a test fixture, throws
// ENOENT) when imported under ESM/tsx — import the lib entry directly.
import pdf from "pdf-parse/lib/pdf-parse.js";

import { DEFAULT_CONFIG, type ScoutConfig } from "./config.js";
import { makeAutoFillAnswer, makeSuggestFromResume } from "./autofill.js";
import { makeCheckForCaptcha } from "./captcha.js";
import { humanEmulation } from "./human.js";
import { getTodayDate, makeLogger } from "./utils.js";
import {
  buildIndeedSearchUrl,
  fillApplicationPages,
  findIndeedApplyButton,
  scrapeIndeedJobs,
} from "./indeed.js";
import type { RunContext, RunScoutOptions, RunScoutResult } from "./types.js";

export async function runScout(opts: RunScoutOptions): Promise<RunScoutResult> {
  const config: ScoutConfig = { ...DEFAULT_CONFIG, ...(opts.config || {}) };
  const log = makeLogger(opts.onLog);
  const onStatus = opts.onStatus || (() => {});
  const onActivity = opts.onActivity || (() => {});

  // onPrompt receives (question, meta). The driver can use meta to show a
  // richer UI (e.g. radio options) but plain text input is always acceptable.
  const onPrompt = opts.onPrompt || (() => Promise.resolve(""));
  const ask: RunContext["ask"] = (q, meta) =>
    Promise.resolve(onPrompt(q, meta)).then((a) => (a == null ? "" : String(a).trim()));
  const askLower: RunContext["askLower"] = (q, meta) => ask(q, meta).then((a) => a.toLowerCase());

  // Resume context — used for smart text-field suggestions. The buffer is
  // retained on config.resumeFile so one read serves both parsing and the
  // remote upload inside fillApplicationPages.
  let resumeContext = "";
  const resumePath = config.resumePath;
  if (resumePath) {
    try {
      const resumeBuffer = fs.readFileSync(resumePath);
      if (!config.resumeFile) {
        config.resumeFile = {
          name: path.basename(resumePath),
          mimeType: "application/pdf",
          buffer: resumeBuffer,
        };
      }
      const pdfData = await pdf(resumeBuffer);
      resumeContext = pdfData.text;
      log.info(`Resume loaded (${resumeContext.length} chars).`);
    } catch (err) {
      log.error(`Could not load resume: ${(err as Error).message}`);
    }
  } else if (config.resumeFile) {
    try {
      const pdfData = await pdf(config.resumeFile.buffer);
      resumeContext = pdfData.text;
      log.info(`Resume loaded from buffer (${resumeContext.length} chars).`);
    } catch (err) {
      log.error(`Could not parse resume buffer: ${(err as Error).message}`);
    }
  } else {
    log.warn("No resume configured — skipping resume context.");
  }

  const getAutoFillAnswer = makeAutoFillAnswer(config);
  const suggestFromResume = makeSuggestFromResume(() => resumeContext);
  const checkForCaptcha = makeCheckForCaptcha(config, log, ask);

  // Screenshot destination for verified-submit evidence.
  const artifactsDir = path.join(process.cwd(), "artifacts");
  try {
    fs.mkdirSync(artifactsDir, { recursive: true });
  } catch { /* non-fatal — screenshots become best-effort */ }

  onStatus("launching-browser");
  const session = await opts.provider.connect();
  opts.onSession?.({ sessionId: session.sessionId, liveViewUrl: session.liveViewUrl });
  if (session.liveViewUrl) {
    log.info(`Live view (open in your browser): ${session.liveViewUrl}`);
  }
  const { context, page } = session;

  // Everything below runs against a metered cloud session — the finally is
  // the single close point for every exit path (done, no-results, throw).
  try {
    log.info("Navigating to Indeed...");
    onStatus("navigating");
    await page.goto("https://www.indeed.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await humanEmulation(page);
    await checkForCaptcha(page);

    const loginMode = await askLower(
      "Do you need to log in or solve a captcha in the live view? (y/n): ",
      { kind: "captcha" },
    );
    if (loginMode === "y") {
      log.info("Open the live view URL above — log in or solve the captcha there now.");
      await ask("Press Continue when you're ready to proceed...", { kind: "captcha" });
      await checkForCaptcha(page);
    }

    const query = config.searchQuery;
    // Omit the &l= param entirely when nationwide. An empty `&l=` triggers
    // Indeed's "specify location" disambiguation page and the bot then sees
    // zero job beacons and bails out.
    const loc = (config.searchLocation || "").trim();
    const url = buildIndeedSearchUrl(query, loc);

    log.info(`Navigating to Indeed search (${config.searchLocation ? config.searchLocation : "nationwide"} — ${query})...`);
    onStatus("searching");
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // URL-based `&l=` is unreliable: Indeed sometimes drops it, and browser
    // autofill can stomp the field. Always reconcile the visible location box
    // with `searchLocation` after the page loads.
    try {
      const locInput = page.locator('input[name="l"]').first();
      if (await locInput.count() > 0) {
        await locInput.click();
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(200);
        if (loc) {
          await locInput.type(loc, { delay: 30 });
          await page.waitForTimeout(300);
          await page.keyboard.press("Enter");
          await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(800);
        }
      }
    } catch { /* location field may not exist */ }

    await humanEmulation(page);
    await checkForCaptcha(page);

    const currentUrl = page.url();
    if (!currentUrl.includes("indeed.com/jobs") && !currentUrl.includes("indeed.com/q-")) {
      log.warn("Not on an Indeed search results page.");
      log.info(`Current URL: ${currentUrl}`);
      log.info("You may need to log in or solve a captcha first.");
      await ask("Fix the issue in the live view, then press Continue to retry...", { kind: "captcha" });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await checkForCaptcha(page);
    }

    const exclusionRegex = new RegExp(config.exclusionTitleRegex, "i");
    let logged = 0;      // successful onActivity emissions
    let applied = 0;     // verified submissions — this drives the maxApplications cap
    let exitRequested = false;
    const ctx: RunContext = { log, ask, askLower, getAutoFillAnswer, suggestFromResume, checkForCaptcha, config };

    // ─── Paginated results loop ─────────────────────────────────────────────
    // Walk through results pages until we hit maxApplications, run out of
    // listings, or reach the page cap. Advancing to the next page (start += 10)
    // replaces the old behavior of quitting at the bottom of page 1.
    const MAX_SEARCH_PAGES = 20;

    for (let pageIndex = 0; pageIndex < MAX_SEARCH_PAGES && applied < config.maxApplications && !exitRequested; pageIndex++) {
      const start = pageIndex * 10;
      const resultsUrl = buildIndeedSearchUrl(query, loc, start);

      // Page 0 is already loaded (with the location reconciled above). Every
      // later page needs an explicit navigation to its &start= URL.
      if (pageIndex > 0) {
        log.info(`\n=== Loading results page ${pageIndex + 1} (start=${start}) ===`);
        onStatus("searching");
        try {
          await page.goto(resultsUrl, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          await checkForCaptcha(page);
        } catch {
          log.warn("  Could not load the next results page — stopping.");
          break;
        }
      }

      let jobs = [];
      try {
        await page.waitForSelector('[class*="job_seen_beacon"]', { timeout: 15000 });
        jobs = await scrapeIndeedJobs(page);
      } catch {
        if (pageIndex === 0) {
          log.info("No roles found right now.");
          return { logged: 0, applied: 0, status: "no-results" };
        }
        log.info("  Reached the end of the results — no more listings.");
        break;
      }

      if (jobs.length === 0) {
        if (pageIndex === 0) {
          log.info("No roles found right now.");
          return { logged: 0, applied: 0, status: "no-results" };
        }
        log.info("  Reached the end of the results — no more listings.");
        break;
      }

      log.info(`Found ${jobs.length} listings on page ${pageIndex + 1}. Filtering...\n`);

      const filtered = jobs.filter((job) => {
        if (!job.isIndeedApply) return false;
        if (exclusionRegex.test(job.title)) return false;
        return true;
      });

      const skipped = jobs.length - filtered.length;
      log.info(`${filtered.length} Indeed Apply listings found (${skipped} external/excluded skipped).\n`);

      if (filtered.length === 0) {
        log.info("  Nothing eligible on this page — trying the next page...");
        continue;
      }

      for (let i = 0; i < filtered.length && applied < config.maxApplications; i++) {
        const job = filtered[i];

        log.info(`\n--- Listing ${i + 1} of ${filtered.length} (page ${pageIndex + 1}) ---`);
        log.info(`  Title:    ${job.title}`);
        log.info(`  Company:  ${job.company}`);
        if (job.location && job.location !== "N/A") log.info(`  Location: ${job.location}`);
        if (job.link) log.info(`  Link:     ${job.link}`);
        log.info(`  Snippet:  ${job.snippet}`);

        const answer = await askLower("\nShould I apply and log this? (y/n): ", { kind: "job-decision", job });

        // "__EXIT__" (lowercased by askLower) — break out of both loops and
        // end the run cleanly.
        if (answer === "__exit__") {
          log.warn("Exit requested by user — stopping run.");
          exitRequested = true;
          break;
        }

        if (answer === "y") {
          let verified = false;

          try {
            await checkForCaptcha(page);

            await page.goto(job.link, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(5000);
            await checkForCaptcha(page);

            const pageText = await page.evaluate(() => document.body.innerText).catch(() => "");
            if (pageText.toLowerCase().includes("apply on company site")) {
              log.info("Skipping external redirect...");
              try {
                await page.goto(resultsUrl, { waitUntil: "domcontentloaded" });
                await page.waitForTimeout(2000);
                await checkForCaptcha(page);
              } catch {
                await page.goto(resultsUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
                await page.waitForTimeout(2000);
              }
              continue;
            }

            let { btn } = await findIndeedApplyButton(page);

            if (!btn) {
              log.info("No apply button yet — waiting up to 10s for late load...");
              await page.waitForTimeout(5000);
              ({ btn } = await findIndeedApplyButton(page));
            }

            if (!btn) {
              // One captcha-solve retry before giving up on this listing.
              const wasCaptcha = await checkForCaptcha(page);
              if (wasCaptcha) {
                ({ btn } = await findIndeedApplyButton(page));
                if (!btn) {
                  log.warn("Still no apply button after captcha — skipping listing.");
                }
              } else {
                log.warn("No apply button found after 10s — skipping listing.");
              }
            }

            if (btn) {
              await checkForCaptcha(page);

              const newPagePromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
              await btn.click();
              log.info("Apply button clicked.");

              const newPage = await newPagePromise;
              let externalRedirect = false;
              if (newPage) {
                await newPage.waitForLoadState("domcontentloaded").catch(() => {});
                const newUrl = newPage.url();
                if (!newUrl.includes("indeed.com")) {
                  log.info("Skipping external redirect...");
                  await newPage.close().catch(() => {});
                  externalRedirect = true;
                } else {
                  log.info(`Redirected to: ${newUrl}`);
                  job.link = newUrl;
                  await newPage.close().catch(() => {});
                }
              } else {
                await page.waitForTimeout(2000);
              }

              if (externalRedirect) {
                try {
                  await page.goto(resultsUrl, { waitUntil: "domcontentloaded" });
                  await page.waitForTimeout(2000);
                  await checkForCaptcha(page);
                } catch {
                  await page.goto(resultsUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
                  await page.waitForTimeout(2000);
                }
                continue;
              }

              log.info("\n  Starting form-fill...");
              const submitted = await fillApplicationPages(page, context, ctx);
              if (submitted === "verified") {
                verified = true;
              } else {
                log.warn("  FAILED TO VERIFY SUBMISSION — not logging this activity.");
              }
            }
          } catch (navErr) {
            log.error("Could not navigate/apply: " + (navErr as Error).message);
          }

          // A verified submission counts toward the maxApplications cap —
          // never gate the cap on logging success.
          if (verified) applied++;

          if (verified) {
            // Confirmation screenshot + activity emission (replaces the
            // desktop app's Notion sink).
            let screenshotPath: string | null = null;
            try {
              screenshotPath = path.join(artifactsDir, `applied-${Date.now()}.png`);
              await page.screenshot({ path: screenshotPath, fullPage: false });
              log.info(`  Confirmation screenshot: ${screenshotPath}`);
            } catch (err) {
              log.warn(`  Screenshot failed: ${(err as Error).message}`);
              screenshotPath = null;
            }
            try {
              await onActivity({
                employer_name: job.company,
                job_title: job.title === "N/A" ? null : job.title,
                url: job.link === "N/A" ? null : job.link,
                date: getTodayDate(),
                method: "online",
                result: "applied",
                source: "guided",
                notes: "Applied via guided form fill",
                screenshotPath,
              });
              logged++;
              log.info(`Activity logged! (${logged} logged, ${applied}/${config.maxApplications} applied)`);
            } catch (err) {
              log.error("onActivity failed: " + (err as Error).message);
            }
          }

          try {
            await page.goto(resultsUrl, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(2000);
            await checkForCaptcha(page);
          } catch {
            log.info("Trouble returning to results — retrying...");
            try {
              await page.goto(resultsUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
              await page.waitForTimeout(2000);
            } catch {
              // page may have closed
            }
          }
        } else {
          log.info("Skipped — moving to next listing.");
        }
      }
    }

    if (applied < 1) {
      log.info(`\nNo applications submitted — ran out of listings or you exited.`);
    } else {
      log.info(`\nDone — ${applied} application(s) submitted.`);
      await new Promise((r) => setTimeout(r, 3000));
    }

    return { logged, applied, status: "done" };
  } finally {
    onStatus("closing");
    await session.close();
  }
}
