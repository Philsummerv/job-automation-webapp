// Indeed-specific flows — ported from automation/scout.js. Grouped here so a
// future PlatformAdapter extraction (other job boards) is mechanical: these
// four functions are the adapter surface (search URL, results scrape, apply
// button, application flow).
//
// fillApplicationPages is verbatim from L695-1132 except the resume-upload
// seam (was setInputFiles(localPath); now uploads an in-memory buffer so it
// works against a REMOTE CDP browser).

import type { BrowserContext, Page } from "playwright-core";
import {
  findAdvanceButton,
  firstVisibleHandle,
  scrapeFormQuestions,
  fillFormField,
  type PageOrFrame,
} from "./forms.js";
import type { FormField, JobListing, RunContext } from "./types.js";

// ─── Search URL (source L1349-1356, L1400-1405) ────────────────────────────────
// Omit the &l= param entirely when nationwide: an empty `&l=` triggers
// Indeed's "specify location" disambiguation page and the bot then sees zero
// job beacons and bails out. Indeed paginates in steps of 10 via &start=;
// page 0 omits the param. Reconstructing the URL per page is more reliable
// than clicking "Next", because we navigate away to apply and would
// otherwise lose our place in the results.
export function buildIndeedSearchUrl(query: string, loc: string, start = 0): string {
  const base = loc
    ? `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(loc)}`
    : `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}`;
  return start > 0 ? `${base}&start=${start}` : base;
}

// ─── Results scrape (source L1407-1425) ────────────────────────────────────────
export function scrapeIndeedJobs(page: Page): Promise<JobListing[]> {
  return page.$$eval('[class*="job_seen_beacon"]', (cards) =>
    cards.map((card) => {
      const title =
        (card.querySelector('[class*="jobTitle"] a, [class*="jobTitle"] span') as HTMLElement | null)?.innerText?.trim() || "N/A";
      const company =
        (card.querySelector('[data-testid="company-name"], [class*="company"]') as HTMLElement | null)?.innerText?.trim() || "N/A";
      const location =
        (card.querySelector('[data-testid="text-location"], [class*="companyLocation"]') as HTMLElement | null)?.innerText?.trim() || "N/A";
      const snippet =
        (card.querySelector('[class*="snippet"], .job-snippet') as HTMLElement | null)?.innerText?.trim() || "N/A";
      const linkEl = card.querySelector('[class*="jobTitle"] a');
      const link = linkEl ? `https://www.indeed.com${linkEl.getAttribute("href")}` : "N/A";
      const cardText = (card as HTMLElement).innerText.toLowerCase();
      const isIndeedApply =
        cardText.includes("easily apply") || cardText.includes("indeed apply");
      return { title, company, location, snippet, link, isIndeedApply };
    })
  );
}

// ─── Apply button (source L1169-1198) ──────────────────────────────────────────
export async function findIndeedApplyButton(page: Page) {
  const selectors = [
    'button[id*="indeedApplyButton"]',
    'button[class*="apply"]',
    'a[class*="apply"]',
    'button:has-text("Apply now")',
    'button:has-text("Apply")',
    'a:has-text("Apply now")',
    'a:has-text("Continue")',
    'button:has-text("Continue")',
  ];

  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) return { btn, frame: null };
  }

  for (const frame of page.frames()) {
    for (const sel of selectors) {
      try {
        const btn = await frame.$(sel);
        if (btn) return { btn, frame };
      } catch {
        // frame may have detached
      }
    }
  }

  return { btn: null, frame: null };
}

// ─── Application page loop (source L695-1132) ──────────────────────────────────

export async function fillApplicationPages(
  page: Page,
  context: BrowserContext,
  ctx: RunContext,
): Promise<"verified" | false> {
  const { log, ask, askLower, getAutoFillAnswer, suggestFromResume, checkForCaptcha, config } = ctx;
  const MAX_PAGES = 15;
  let lastUrl = "";
  let sameUrlCount = 0;

  for (let step = 1; step <= MAX_PAGES; step++) {
    // Wait for the page to settle (network idle) instead of a fixed 2s sleep.
    // Caps at 1.5s so slow 3rd-party trackers don't stall the loop.
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    await checkForCaptcha(page);

    const currentStepUrl = page.url();
    if (currentStepUrl === lastUrl) {
      sameUrlCount++;
      if (sameUrlCount >= 3) {
        log.warn(`  Same URL detected for ${sameUrlCount} iterations — forcing Continue to break loop.`);
        let forceClicked = false;
        for (const t of [page, ...page.frames()] as PageOrFrame[]) {
          try {
            await t.click('button[data-testid="continue-button"]:visible', { force: true, timeout: 5000 });
            forceClicked = true;
            log.info("  Force-clicked Continue (loop breaker).");
            break;
          } catch { /* try next */ }
        }
        if (!forceClicked) {
          log.warn("  Could not force-click Continue. Asking for manual help.");
          await ask("  Press Continue after manually advancing the page...");
        }
        sameUrlCount = 0;
        await page.waitForTimeout(2000);
        continue;
      }
    } else {
      sameUrlCount = 0;
      lastUrl = currentStepUrl;
    }

    let target: PageOrFrame = page;
    for (const frame of page.frames()) {
      const hasForm = await frame.$("form, fieldset, [class*='application']").catch(() => null);
      if (hasForm) {
        target = frame;
        break;
      }
    }

    log.info(`\n  ╔══════════════════════════════════════╗`);
    log.info(`  ║   APPLICATION STEP ${String(step).padStart(2)}               ║`);
    log.info(`  ╚══════════════════════════════════════╝`);

    const questions = await scrapeFormQuestions(target);

    const bodyText = await target.evaluate(() => document.body.innerText).catch(() => "");
    const bodyLower = bodyText.toLowerCase();

    const isQuestionnairePage = bodyLower.includes("key qualifications")
      || bodyLower.includes("answer these questions")
      || bodyLower.includes("qualifications")
      || bodyLower.includes("do you have experience");

    const isResumePage = !isQuestionnairePage
      && (bodyLower.includes("select a resume") || bodyLower.includes("add a resume") || bodyLower.includes("upload a resume") || bodyLower.includes("your resume"))
      && !bodyLower.includes("submit");

    // Take the resume-page path whenever we detect resume-page text — even if
    // form fields ("questions") are also present. Otherwise the bot drops into
    // the generic per-question prompt loop and surfaces a "YOUR ANSWER" custom
    // text box on top of the resume confirmation, which the user doesn't want.
    if (isResumePage) {
      log.info(`  Resume/selection page detected (${questions.length} field${questions.length === 1 ? "" : "s"} ignored — using resume handler)...`);

      await page.bringToFront().catch(() => {});

      let resumeClicked = false;
      for (const t of [target, ...page.frames()] as PageOrFrame[]) {
        try {
          const resumeCard = t.locator('div[data-testid="resume-selection-file-resume-radio-card"]');
          const count = await resumeCard.count();
          if (count > 0) {
            const isChecked = await resumeCard.getAttribute("data-checked").catch(() => null);
            if (isChecked === "true") {
              log.info("  Resume card already checked — skipping click.");
            } else {
              await resumeCard.click({ force: true });
              log.info("  Clicked resume radio card (force).");
            }
            resumeClicked = true;
            break;
          }
        } catch { /* try next frame */ }
      }
      if (!resumeClicked) {
        log.info("  Resume card not found — checking for upload input.");
        // Fallback: if the page exposes a file input and we have resume bytes,
        // upload them directly so the user doesn't have to do it manually.
        // REMOTE-BROWSER SEAM: payload form (name/mimeType/buffer) serializes
        // the file over CDP; a local path would resolve on the wrong machine.
        if (config.resumeFile) {
          for (const t of [target, ...page.frames()] as PageOrFrame[]) {
            try {
              const fileInput = t.locator('input[type="file"]').first();
              const count = await fileInput.count();
              if (count > 0) {
                await fileInput.setInputFiles({
                  name: config.resumeFile.name,
                  mimeType: config.resumeFile.mimeType,
                  buffer: config.resumeFile.buffer,
                });
                log.info(`  Uploaded resume: ${config.resumeFile.name}`);
                resumeClicked = true;
                await page.waitForTimeout(2500);
                break;
              }
            } catch { /* try next frame */ }
          }
        }
        if (!resumeClicked) {
          log.info("  No upload input found either — may already be selected.");
        }
      }
      await page.waitForTimeout(500);

      let clicked = false;
      for (const t of [target, ...page.frames()] as PageOrFrame[]) {
        try {
          await t.click('button[data-testid="continue-button"]:visible', { timeout: 5000 });
          clicked = true;
          log.info("  Clicked Continue (data-testid).");
          break;
        } catch { /* try next context */ }
      }

      if (!clicked) {
        for (const t of [target, ...page.frames()] as PageOrFrame[]) {
          clicked = await t.evaluate(() => {
            let btn = document.querySelector<HTMLElement>('div#mosaic-resumeSelectionModule button');
            if (!btn) btn = document.querySelector<HTMLElement>('[aria-label*="Continue"], [aria-label*="continue"]');
            if (!btn) {
              btn = (Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))
                .find((b) => /continue|next/i.test(b.innerText)) ?? null);
            }
            if (btn) { btn.scrollIntoView(); btn.click(); return true; }
            return false;
          }).catch(() => false);
          if (clicked) {
            log.info("  Clicked Continue (JS fallback).");
            break;
          }
        }
      }

      if (clicked) {
        await page.waitForTimeout(2000);
        continue;
      } else {
        log.warn("  Could not find Continue button. Handle manually.");
        await ask("  Press Continue after you've clicked Continue in the browser...");
        // Reset URL tracking so the loop-breaker doesn't fire a duplicate
        // "Press Continue after manually advancing..." right after this one.
        lastUrl = page.url();
        sameUrlCount = 0;
        continue;
      }
    }

    if (questions.length === 0) {
      log.info("  No questions found on this page.");
    } else {
      log.info(`  Found ${questions.length} question(s):\n`);
    }

    const filledIds = new Set<string>();
    const filledTexts = new Set<string>();

    const handleField = async (field: FormField) => {
      if ((field.inputId && filledIds.has(field.inputId)) || (field.inputName && filledIds.has(field.inputName)) || filledTexts.has(field.text)) {
        log.info(`  (Skipping already-answered field: "${field.text}")`);
        return;
      }

      log.info(`  ────────────────────────────────────`);
      log.info(`  QUESTION FOUND: ${field.text}`);
      log.info(`  TYPE: ${field.type}`);

      if (field.options.length > 0) {
        log.info(`  OPTIONS:`);
        field.options.forEach((opt, i) => {
          log.info(`    ${i + 1}) ${opt.label}`);
        });
      }

      const autoAnswer = getAutoFillAnswer(field.text);
      if (autoAnswer === "__SKIP__") {
        log.info(`    -> Auto-skipped (Address field).`);
        return;
      }
      if (autoAnswer) {
        let displayAnswer = autoAnswer;
        if (autoAnswer.startsWith("__RADIO:")) displayAnswer = `Auto-select: ${autoAnswer.slice(8).split(",")[0]}`;
        log.info(`    -> Auto-filling: "${displayAnswer}"`);
        await fillFormField(target, field, autoAnswer, page, log);
        if (field.inputId) filledIds.add(field.inputId);
        if (field.inputName) filledIds.add(field.inputName);
        filledTexts.add(field.text);
        await page.waitForTimeout(500);
        return;
      }

      let suggestion: string | null = null;
      if (["text", "textarea", "number", "tel", "email", "url"].includes(field.type)) {
        suggestion = suggestFromResume(field.text);
        if (suggestion) {
          log.info(`  SUGGESTED ANSWER: "${suggestion}"`);
          log.info(`  (Press Enter to accept, or type your own)`);
        }
      }

      const promptMsg = field.options.length > 0
        ? "  YOUR ANSWER (# for option, or 'skip'): "
        : suggestion
          ? "  YOUR ANSWER (Enter=accept suggestion, or 'skip'): "
          : "  YOUR ANSWER (type text, or 'skip'): ";
      const userAnswer = await ask(promptMsg, { field, suggestion });

      if (userAnswer === "" && suggestion) {
        log.info(`    -> Accepted suggestion: "${suggestion}"`);
        await fillFormField(target, field, suggestion, page, log);
        if (field.inputId) filledIds.add(field.inputId);
        if (field.inputName) filledIds.add(field.inputName);
        filledTexts.add(field.text);
        await page.waitForTimeout(500);
        return;
      }

      if (userAnswer.toLowerCase() === "skip" || userAnswer === "") {
        log.info("    -> Skipped.");
        filledTexts.add(field.text);
        return;
      }

      await fillFormField(target, field, userAnswer, page, log);
      if (field.inputId) filledIds.add(field.inputId);
      if (field.inputName) filledIds.add(field.inputName);
      filledTexts.add(field.text);
      await page.waitForTimeout(500);
    };

    for (const field of questions) {
      await handleField(field);
    }

    const newQuestions = await scrapeFormQuestions(target);
    const freshFields = newQuestions.filter((q) => {
      if (q.inputId && filledIds.has(q.inputId)) return false;
      if (q.inputName && filledIds.has(q.inputName)) return false;
      if (filledTexts.has(q.text)) return false;
      return true;
    });
    if (freshFields.length > 0) {
      log.info(`\n  ${freshFields.length} new question(s) appeared:\n`);
      for (const field of freshFields) {
        await handleField(field);
      }
    }

    await page.waitForSelector(".ia-BasePage-component", { state: "visible", timeout: 10000 }).catch(() => {});

    const reviewCheckText = await target.evaluate(() => document.body.innerText).catch(() => "");
    if (reviewCheckText.includes("Preparing review") || reviewCheckText.includes("Review your application") || reviewCheckText.includes("Please review your application")) {
      // Poll for the submit button instead of a blanket 10s sleep — usually
      // attaches in <1s. Cap at 8s for slow connections.
      const reviewSelectors = [
        'button:has-text("Submit your application")',
        'button:has-text("Submit application")',
        'button:has-text("Submit")',
        'button[data-testid="continue-button"]',
      ];
      const start = Date.now();
      let attached = false;
      for (const sel of reviewSelectors) {
        try {
          await target.locator(sel).first().waitFor({ state: "attached", timeout: 8000 });
          attached = true;
          break;
        } catch { /* try next selector */ }
      }
      const ms = Date.now() - start;
      log.info(`  Review/loading page — submit button ${attached ? "attached" : "did NOT attach"} after ${ms}ms.`);
    }

    for (const t of [target, ...page.frames()] as PageOrFrame[]) {
      await t.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    }
    await page.waitForTimeout(500);

    let submitBtn = null;
    const submitSelectors = [
      'button[data-testid="continue-button"]',
      'button:has-text("Submit your application")',
      'button:has-text("Submit application")',
      'button:has-text("Submit")',
      'button:has-text("Review your application")',
      'button:has-text("Review application")',
      'button:has-text("Review and submit")',
      'button:has-text("Review details")',
      'button:has-text("Save and continue")',
      'button:has-text("Save and submit")',
      'button.ia-continueButton',
    ];
    {
      const found = await firstVisibleHandle([target, ...page.frames()] as PageOrFrame[], submitSelectors);
      if (found) { submitBtn = found.handle; target = found.frame; }
    }

    if (submitBtn) {
      const btnText = await submitBtn.innerText().catch(() => "Submit");
      const confirm = await askLower(`\n  Ready to click "${btnText.trim()}"? (y/n): `);
      if (confirm === "y") {
        const isSubmitButton = /submit your application/i.test(btnText);

        // submitBtn is already the visible/enabled handle from firstVisibleHandle,
        // so click it directly rather than re-querying (which could hit a hidden
        // duplicate and throw "Element is not visible").
        await submitBtn.click({ force: true });
        log.info("  Submit button clicked (force: true).");

        if (isSubmitButton) {
          await page.waitForTimeout(3000);
          const successConfirm = await askLower("\n  Did the success screen load? (y/n): ");
          if (successConfirm === "y") {
            log.info("  ✓ Application submitted — confirmed by user!");
            return "verified";
          } else {
            log.warn("  ⚠ SUBMISSION NOT CONFIRMED — investigate manually in the browser.");
            await ask("  Press Continue after investigating...");
            const retryConfirm = await askLower("  Did the application actually submit? (y/n): ");
            if (retryConfirm === "y") {
              return "verified";
            }
            return false;
          }
        } else {
          let verified = false;
          try {
            await page.waitForSelector("text=Your application has been submitted", { timeout: 20000 }).catch(() => null);
            const bodyText2 = (await page.evaluate(() => document.body.innerText).catch(() => "")).toLowerCase();
            if (bodyText2.includes("your application has been submitted") || bodyText2.includes("your application is on its way")) {
              verified = true;
            }
          } catch { /* timeout */ }

          if (!verified) {
            for (const f of page.frames()) {
              const frameText = (await f.evaluate(() => document.body.innerText).catch(() => "")).toLowerCase();
              if (frameText.includes("your application has been submitted") || frameText.includes("your application is on its way")) {
                verified = true;
                break;
              }
            }
          }

          if (verified) {
            log.info("  ✓ Application submitted and VERIFIED!");
            return "verified";
          } else {
            log.info("  Clicked intermediate button — continuing to next step...");
            await page.waitForTimeout(2000);
            continue;
          }
        }
      } else {
        log.info("  Submit skipped. Handle manually if needed.");
        return false;
      }
    }

    // Brief settle wait — was 1000ms + 500ms = 1.5s, now ~300ms total. The
    // qualifier-questions check still has its own 3s timeout below.
    await page.waitForTimeout(300);

    for (const t of [target, ...page.frames()] as PageOrFrame[]) {
      await t.waitForSelector('#mosaic-qualifier-questions-module, [id*="qualification-questions"]', { state: "visible", timeout: 1500 }).catch(() => {});
    }

    let continueBtn = null;
    {
      // Visible-first search: skips Indeed's hidden duplicate Continue buttons
      // that previously caused "Element is not visible" on force-click.
      const found = await firstVisibleHandle([target, ...page.frames()] as PageOrFrame[], [
        'button[data-testid="continue-button"]',
        'button:has-text("Continue")',
        'button:has-text("Save and continue")',
        'button:has-text("Review your application")',
        'button:has-text("Review application")',
        'button:has-text("Review and submit")',
        'button:has-text("Review details")',
        'button:has-text("Next")',
        'button:has-text("Proceed")',
        'button:has-text("Apply")',
      ]);
      if (found) { continueBtn = found.handle; target = found.frame; }
    }
    if (continueBtn) {
      const btnText = await continueBtn.innerText().catch(() => "Continue");
      log.info(`  Clicking "${btnText.trim()}" to go to next page...`);
      await continueBtn.click({ force: true });
      // Wait for the navigation/transition to settle — often <500ms,
      // capped at 1.5s instead of a flat 2s sleep.
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
      continue;
    }

    const doneCheckText = (await target.evaluate(() => document.body.innerText).catch(() => "")).toLowerCase();
    if (doneCheckText.includes("your application has been submitted")) {
      log.info("  Application submitted and VERIFIED!");
      return "verified";
    }

    // Last-resort fallback: scan every visible button across all frames for
    // any with positive "advance" text we haven't explicitly listed
    // (e.g. "Review your application" variants on review-application pages).
    const fallback = await findAdvanceButton(page);
    if (fallback) {
      log.info(`  Fallback advance button found: "${fallback.text.trim()}" — clicking.`);
      await fallback.handle.click({ force: true }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
      continue;
    }

    log.info("  No Continue/Submit button found.");
    const manual = await askLower("  Want to handle this page manually and retry? (y/n): ");
    if (manual === "y") {
      await ask("  Press Continue after you've handled it in the browser...");
      continue;
    }
    return false;
  }

  log.info("  Reached max application pages — stopping.");
  return false;
}
