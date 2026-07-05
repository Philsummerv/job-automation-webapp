// Cloudflare/Turnstile handling — ported verbatim from automation/scout.js
// L262-338 (2Captcha solver) and L1200-1252 (challenge detection + gate).
// Both paths kept: 2Captcha auto-solve when an API key is configured, human
// solve (via Browserbase live view) otherwise.

import type { Page } from "playwright-core";
import type { AskFn, Logger } from "./types.js";
import type { ScoutConfig } from "./config.js";

export async function solveTurnstileVia2Captcha(
  page: Page,
  apiKey: string,
  log: Logger,
): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const widget = await page.evaluate(() => {
      const cb = document.querySelector<HTMLIFrameElement>('iframe[src*="challenges.cloudflare.com"]');
      if (!cb) return null;
      const params = new URL(cb.src).searchParams;
      const sitekey = params.get("k") || params.get("sitekey");
      return sitekey ? { sitekey, pageurl: window.location.href } : null;
    }).catch(() => null);

    if (!widget) {
      log.warn("  Turnstile widget not found in DOM — falling back to manual.");
      return false;
    }

    log.info(`  2Captcha: submitting Turnstile (sitekey=${widget.sitekey})...`);

    const inRes = await fetch("https://2captcha.com/in.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        key: apiKey,
        method: "turnstile",
        sitekey: widget.sitekey,
        pageurl: widget.pageurl,
        json: "1",
      }),
    }).then((r) => r.json() as Promise<{ status: number; request: string }>);

    if (inRes.status !== 1) {
      log.error(`  2Captcha submit failed: ${inRes.request}`);
      return false;
    }

    const captchaId = inRes.request;
    log.info(`  2Captcha: polling for solution (id=${captchaId})...`);

    let token: string | null = null;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`)
        .then((r) => r.json() as Promise<{ status: number; request: string }>)
        .catch(() => null);
      if (!res) continue;
      if (res.status === 1) { token = res.request; break; }
      if (res.request !== "CAPCHA_NOT_READY") {
        log.error(`  2Captcha error: ${res.request}`);
        return false;
      }
    }

    if (!token) {
      log.warn("  2Captcha timed out — falling back to manual.");
      return false;
    }

    await page.evaluate((t) => {
      const inp = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
      if (inp) {
        inp.value = t;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const turnstile = (window as unknown as { turnstile?: { execute?: () => void } }).turnstile;
      if (typeof turnstile?.execute === "function") {
        try { turnstile.execute(); } catch { /* noop */ }
      }
    }, token);

    log.info("  2Captcha: token injected.");
    return true;
  } catch (err) {
    log.error(`  2Captcha exception: ${(err as Error).message}`);
    return false;
  }
}

export async function isCloudflareChallenge(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (document.querySelector("#challenge-running")) return true;
    if (document.querySelector("#challenge-stage")) return true;
    if (document.querySelector("#cf-vj-container")) return true;
    if (document.querySelector("#cf-challenge-running")) return true;
    if (document.querySelector(".cf-challenge")) return true;
    const iframes = document.querySelectorAll("iframe");
    for (const f of iframes) {
      if (f.src && f.src.includes("challenges.cloudflare.com")) return true;
    }
    return false;
  }).catch(() => false);
}

export function makeCheckForCaptcha(config: ScoutConfig, log: Logger, ask: AskFn) {
  return async function checkForCaptcha(page: Page): Promise<boolean> {
    await page.waitForTimeout(2000);

    const blocked = await isCloudflareChallenge(page);
    if (!blocked) return false;

    log.warn("\n!!! CAPTCHA DETECTED !!!");

    if (config.twoCaptchaApiKey) {
      log.info("  Attempting 2Captcha auto-solve...");
      const solved = await solveTurnstileVia2Captcha(page, config.twoCaptchaApiKey, log);
      if (solved) {
        await page.waitForTimeout(3000);
        if (!(await isCloudflareChallenge(page))) {
          log.info("  ✓ Captcha auto-solved.");
          return true;
        }
      }
    }

    log.warn("  Solve the captcha in the live view. The script is paused.");

    let cleared = false;
    while (!cleared) {
      await ask("Press Continue AFTER solving the captcha...", { kind: "captcha" });
      await page.waitForTimeout(2000);
      if (await isCloudflareChallenge(page)) {
        log.warn("Captcha STILL detected — solve it fully, then press Continue again.");
      } else {
        cleared = true;
      }
    }

    log.info("Captcha cleared — resuming.\n");
    return true;
  };
}
