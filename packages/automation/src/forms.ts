// Form scraping + filling — ported from automation/scout.js L342-691.
// Bodies verbatim except the two evaluate() calls noted inline (the original
// passed two args puppeteer-style; Playwright forwards only one, so `val`
// arrived undefined — ported using the single object-arg form instead).

import type { Frame, Page } from "playwright-core";
import { cssEscape } from "./utils.js";
import type { FormField, Logger } from "./types.js";

export type PageOrFrame = Page | Frame;

// Pure-DOM question collector. SELF-CONTAINED ON PURPOSE (no imports, no
// closures): Playwright serializes it into the page via evaluate(), and the
// browser-extension content script calls it directly — one implementation,
// two runtimes.
export function collectFormQuestions(): FormField[] {
  {
    const questions: {
      text: string;
      type: string;
      options: { label: string; value: string; id?: string }[];
      inputId: string | null;
      inputName: string | null;
    }[] = [];
    const labels = document.querySelectorAll("label");

    for (const label of labels) {
      const text = (label as HTMLElement).innerText?.trim();
      if (!text) continue;

      const forId = label.getAttribute("for");
      let input: Element | null = forId ? document.getElementById(forId) : null;
      if (!input) input = label.querySelector("input, select, textarea");

      const fieldset = label.closest("fieldset") || label.parentElement;
      const radios = fieldset ? fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]') : ([] as unknown as NodeListOf<HTMLInputElement>);
      const checkboxes = fieldset ? fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') : ([] as unknown as NodeListOf<HTMLInputElement>);

      let type = "unknown";
      let options: { label: string; value: string; id?: string }[] = [];
      let inputId: string | null = null;
      let inputName: string | null = null;

      if (radios.length > 0) {
        type = "radio";
        inputName = radios[0].name;
        options = Array.from(radios).map((r) => {
          const radioLabel = (r.labels?.[0] as HTMLElement | undefined)?.innerText?.trim()
            || (r.closest("label") as HTMLElement | null)?.innerText?.trim()
            || r.value;
          return { label: radioLabel, value: r.value, id: r.id };
        });
      } else if (checkboxes.length > 0) {
        type = "checkbox";
        inputName = checkboxes[0].name;
        options = Array.from(checkboxes).map((c) => {
          const cbLabel = (c.labels?.[0] as HTMLElement | undefined)?.innerText?.trim()
            || (c.closest("label") as HTMLElement | null)?.innerText?.trim()
            || c.value;
          return { label: cbLabel, value: c.value, id: c.id };
        });
      } else if (input) {
        if (input.tagName.toLowerCase() === "select") {
          type = "select";
          options = Array.from((input as HTMLSelectElement).options).map((o) => ({ label: o.text, value: o.value }));
        } else if (input.tagName.toLowerCase() === "textarea") {
          type = "textarea";
        } else {
          type = ((input as HTMLInputElement).type || "text").toLowerCase();
        }
        inputId = input.id || null;
        inputName = (input as HTMLInputElement).name || null;
      } else {
        continue;
      }

      // Dedupe by inputId/inputName/text
      const dupe = questions.find((q) =>
        (q.inputId && q.inputId === inputId)
        || (q.inputName && q.inputName === inputName)
        || (q.text === text)
      );
      if (dupe) continue;

      questions.push({ text, type, options, inputId, inputName });
    }

    return questions;
  }
}

export async function scrapeFormQuestions(target: PageOrFrame): Promise<FormField[]> {
  return target.evaluate(collectFormQuestions);
}

export async function fillFormField(
  target: PageOrFrame,
  field: FormField,
  answer: string,
  page: Page,
  log: Logger,
): Promise<void> {
  try {
    if (field.type === "number" || (field.text && /how many\s*(years|months)/i.test(field.text))) {
      const digitsOnly = answer.replace(/[^\d]/g, "");
      if (digitsOnly && digitsOnly !== answer) {
        log.info(`    -> Sanitized to digits: "${digitsOnly}"`);
        answer = digitsOnly;
      }
    }

    if (field.type === "radio") {
      let opt = null;

      if (answer.startsWith("__RADIO:")) {
        const keywords = answer.slice(8).split(",").map((k) => k.trim().toLowerCase());
        for (const kw of keywords) {
          opt = field.options.find((o) => o.label.toLowerCase().includes(kw));
          if (opt) break;
        }
        if (!opt) {
          const firstKw = keywords[0];
          opt = field.options.find((o) => o.label.toLowerCase().trim() === firstKw);
        }
      } else {
        const idx = parseInt(answer, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= field.options.length) {
          opt = field.options[idx - 1];
        }
      }

      if (opt) {
        if (opt.id) {
          await target.click(`#${cssEscape(opt.id)}`, { force: true });
        } else if (field.inputName) {
          await target.click(`input[name="${field.inputName}"][value="${opt.value}"]`, { force: true });
        }
        log.info(`    -> Clicked radio: "${opt.label}" (force)`);
      } else {
        log.info(`    -> No matching radio option found. Skipping.`);
      }
    } else if (field.type === "checkbox") {
      const nums = answer.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      for (const idx of nums) {
        if (idx >= 1 && idx <= field.options.length) {
          const opt = field.options[idx - 1];
          if (opt.id) {
            await target.click(`#${cssEscape(opt.id)}`);
          }
          log.info(`    -> Checked: "${opt.label}"`);
        }
      }
    } else if (field.type === "select") {
      let match = null;

      if (answer.startsWith("__RADIO:")) {
        const keywords = answer.slice(8).split(",").map((k) => k.trim().toLowerCase());
        for (const kw of keywords) {
          match = field.options.find((o) => o.label.toLowerCase().includes(kw));
          if (match) break;
        }
      } else {
        const idx = parseInt(answer, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= field.options.length) {
          match = field.options[idx - 1];
        } else {
          match = field.options.find((o) => o.label.toLowerCase().includes(answer.toLowerCase()));
        }
      }

      if (match && field.inputId) {
        await target.selectOption(`#${cssEscape(field.inputId)}`, match.value);
        log.info(`    -> Selected: "${match.label}"`);
      } else {
        log.info(`    -> No matching option found. Skipping.`);
      }
    } else if (["textarea", "text", "number", "tel", "email", "url"].includes(field.type)) {
      const lowerText = field.text.toLowerCase();
      const isZipField = lowerText.includes("zip") || lowerText.includes("postal") || lowerText.includes("location-fields");

      if (isZipField) {
        // Try the field's own inputId/inputName FIRST — this comes straight
        // from the page scrape so it's exact and instant. Falls through to
        // a short list of well-known selectors only if the scrape didn't
        // capture an id/name (rare).
        const candidates: string[] = [];
        if (field.inputId) candidates.push(`#${cssEscape(field.inputId)}`);
        if (field.inputName) candidates.push(`input[name="${field.inputName}"]`);
        candidates.push(
          'input[data-testid="location-fields-postal-code-input"]',
          'input[autocomplete="postal-code"]',
          'input[name*="postal" i]',
          'input[aria-label*="zip" i]',
        );

        let filled = false;
        for (const sel of candidates) {
          try {
            const loc = target.locator(sel).first();
            await loc.waitFor({ state: "visible", timeout: 600 });
            const currentVal = (await loc.inputValue().catch(() => "")).trim();
            if (currentVal === answer.trim()) {
              log.info(`    -> ZIP already matches config ("${currentVal}"), skipping.`);
              filled = true;
              break;
            }
            if (currentVal) {
              log.info(`    -> ZIP had stale value "${currentVal}" — overwriting with "${answer}".`);
              await loc.fill("");
            }
            await loc.fill(answer);
            if (page && page.keyboard) await page.keyboard.press("Tab");
            log.info(`    -> Filled ZIP: "${answer}" via ${sel}`);
            filled = true;
            break;
          } catch { /* try next */ }
        }
        if (!filled) log.warn(`    -> ZIP field not found via any selector. Please correct manually.`);
      } else {
        const isCityField = lowerText.includes("city") || lowerText.includes("locality");
        if (isCityField) {
          const citySel = 'input[data-testid="location-fields-locality-input"]';
          try {
            const loc = target.locator(citySel);
            await loc.waitFor({ state: "visible", timeout: 3000 });
            const currentVal = (await loc.inputValue().catch(() => "")).trim();
            if (currentVal === (answer || "").trim()) {
              log.info(`    -> City already matches config ("${currentVal}"), skipping.`);
              return;
            }
            if (currentVal) {
              log.info(`    -> City has stale value "${currentVal}" — overwriting with "${answer}".`);
              await loc.fill("");
            }
            await loc.fill(answer);
            if (page && page.keyboard) {
              await page.keyboard.press("Tab");
            }
            log.info(`    -> Filled city: "${answer}"`);
            return;
          } catch { /* fall through to general logic */ }
        }

        let sel: string | null = null;
        if (field.inputId) {
          sel = `#${cssEscape(field.inputId)}`;
        } else if (field.inputName) {
          sel = `input[name="${field.inputName}"], textarea[name="${field.inputName}"]`;
        }

        if (sel) {
          await target.waitForSelector(sel, { timeout: 5000 }).catch(() => {});
          const el = await target.$(sel);
          if (el) {
            const alreadyFilled = await target.evaluate((s) => {
              const inp = document.querySelector(s);
              return inp ? inp.getAttribute("data-already-filled") : null;
            }, sel).catch(() => null);
            if (alreadyFilled) {
              log.info(`    -> Skipped (already filled).`);
              return;
            }

            const isDigitAnswer = /^\d+$/.test(answer);
            if (isDigitAnswer || field.type === "number") {
              try {
                const loc = target.locator(sel);
                await loc.click();
                await loc.fill(answer);
                if (page && page.keyboard) {
                  await page.keyboard.press("Tab");
                }
                await target.evaluate((s) => {
                  const inp = document.querySelector(s);
                  if (inp) inp.setAttribute("data-already-filled", "true");
                }, sel).catch(() => {});
                log.info(`    -> Filled (fill+Tab): "${answer}"`);
              } catch {
                // Original passed (fn, sel, answer) puppeteer-style — Playwright
                // forwards only one arg, so `val` was undefined. Object form fixes it.
                await target.evaluate(({ s, val }) => {
                  const inp = document.querySelector<HTMLInputElement>(s);
                  if (inp) {
                    inp.focus();
                    inp.value = val;
                    inp.dispatchEvent(new Event("input", { bubbles: true }));
                    inp.dispatchEvent(new Event("change", { bubbles: true }));
                    inp.dispatchEvent(new Event("blur", { bubbles: true }));
                    inp.setAttribute("data-already-filled", "true");
                  }
                }, { s: sel, val: answer }).catch(() => {});
                log.info(`    -> Force-set fallback: "${answer}"`);
              }
            } else {
              // Same puppeteer-style arg fix as above.
              await target.evaluate(({ s, val }) => {
                const inp = document.querySelector<HTMLInputElement>(s);
                if (inp) {
                  inp.focus();
                  inp.value = val;
                  inp.dispatchEvent(new Event("input", { bubbles: true }));
                  inp.dispatchEvent(new Event("change", { bubbles: true }));
                  inp.dispatchEvent(new Event("blur", { bubbles: true }));
                  inp.setAttribute("data-already-filled", "true");
                }
              }, { s: sel, val: answer }).catch(() => {});
              log.info(`    -> Force-set: "${answer}"`);
            }
          }
        }
      }
    }
  } catch (err) {
    log.info(`    -> Could not fill "${field.text}": ${(err as Error).message}`);
  }
}

// Returns the first VISIBLE + enabled element matching any of `selectors`,
// searching each context (main frame + child frames) in order. Indeed often
// renders hidden duplicate buttons (e.g. a display:none "Continue"); grabbing
// the raw first match and force-clicking it throws "Element is not visible"
// during scroll-into-view. Filtering on isVisible() sidesteps that entirely.
export async function firstVisibleHandle(
  contexts: PageOrFrame[],
  selectors: string[],
) {
  for (const t of contexts) {
    for (const sel of selectors) {
      let handles;
      try { handles = await t.$$(sel); } catch { continue; }
      for (const h of handles) {
        let ok = false;
        try { ok = (await h.isVisible()) && (await h.isEnabled()); } catch { ok = false; }
        if (ok) return { handle: h, frame: t };
      }
    }
  }
  return null;
}

// Last-resort "advance" button finder. Used when the strict selector list
// misses a non-standard label (e.g. "Review your application", "Apply",
// "Continue to next step"). Scans every visible enabled button on the page
// and its frames, scores them by text match, and returns the highest scorer.
// Returns `{ handle, frame, text }` or null. Buttons matching cancel/back/
// skip-style labels are excluded so we never click a destructive control.
export async function findAdvanceButton(page: Page) {
  const POSITIVE_RE = /\b(review|continue|submit|next|apply|proceed|advance|finish|send|save and (continue|submit)|review (and|your) (application|submit|details))\b/i;
  const NEGATIVE_RE = /\b(back|cancel|withdraw|close|skip|dismiss|report|feedback|help|sign in|sign out|log in|log out|delete|remove|edit|undo)\b/i;

  let best: { score: number; text: string; frame: PageOrFrame; handle: Awaited<ReturnType<Page["$$"]>>[number] } | null = null;
  for (const frame of [page, ...page.frames()] as PageOrFrame[]) {
    let handles;
    try {
      handles = await frame.$$('button, [role="button"], a[href]');
    } catch { continue; }

    for (const handle of handles) {
      let info;
      try {
        info = await handle.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            !(el as HTMLButtonElement).disabled &&
            el.getAttribute("aria-disabled") !== "true";
          const text = ((el as HTMLElement).innerText || el.textContent || el.getAttribute("aria-label") || "").trim();
          return { text, area: rect.width * rect.height, visible };
        });
      } catch { continue; }
      if (!info.visible || !info.text || info.text.length >= 80) continue;
      if (NEGATIVE_RE.test(info.text)) continue;
      if (!POSITIVE_RE.test(info.text)) continue;
      const score = 1000 + Math.min(info.area, 50000) / 1000;
      if (!best || score > best.score) {
        best = { score, text: info.text, frame, handle };
      }
    }
  }
  return best ? { handle: best.handle, frame: best.frame, text: best.text } : null;
}
