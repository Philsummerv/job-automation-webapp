import type { Locator, Page } from "playwright-core";
import { bestOption } from "./answers";
import type { ScannedField } from "./scan";

// Puts answers into the live form. Server-only, runs with playwright-core
// against the Browserbase page. Never clicks a submit or apply button: every
// click here targets an element we tagged (data-ja) or an option inside the
// menu that element opened.

const sel = (id: string) => `[data-ja="${id}"]`;

/** Ids of a radio/checkbox group's members, in order. */
function memberSel(id: string, i: number) {
  return `[data-ja="${id}.${i}"]`;
}

export async function currentValue(page: Page, f: ScannedField): Promise<string> {
  try {
    if (f.kind === "text" || f.kind === "textarea") {
      return (await page.locator(sel(f.id)).first().inputValue({ timeout: 2000 })).trim();
    }
    if (f.kind === "select") {
      return await page.locator(sel(f.id)).first().evaluate((e) => {
        const s = e as HTMLSelectElement;
        const o = s.options[s.selectedIndex];
        return o && o.value ? (o.textContent ?? "").trim() : "";
      });
    }
    if (f.kind === "combobox") {
      // react-select shows the chosen value in a sibling single-value element.
      return await page.locator(sel(f.id)).first().evaluate((e) => {
        const c = e.closest("[class*='control' i]") ?? e.parentElement?.parentElement;
        const v = c?.querySelector("[class*='single-value' i], [class*='singleValue' i]");
        return ((v?.textContent ?? "") || (e as HTMLInputElement).value || "").trim();
      });
    }
  } catch {
    /* fall through */
  }
  return "";
}

async function fillText(page: Page, f: ScannedField, value: string): Promise<boolean> {
  const loc = page.locator(sel(f.id)).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await loc.fill(value, { timeout: 5000 });
  // Location inputs with a suggestion list (Lever): pick the matching suggestion.
  if (/location-input/.test(f.hint)) await pickLeverLocation(page, loc, value);
  return (await loc.inputValue().catch(() => "")).trim().length > 0;
}

async function pickLeverLocation(page: Page, loc: Locator, value: string) {
  // Lever renders suggestions under .dropdown-results once you type.
  await loc.pressSequentially(" ", { delay: 30 }).catch(() => {});
  await loc.press("Backspace").catch(() => {});
  const results = page.locator(".dropdown-results .dropdown-location, .dropdown-results > div");
  for (let i = 0; i < 12; i++) {
    if ((await results.count().catch(() => 0)) > 0) break;
    await page.waitForTimeout(300);
  }
  const texts = (await results.allTextContents().catch(() => [])).map((t) => t.trim());
  const pick = bestOption(value, texts) ?? (texts.length ? texts[0] : null);
  if (pick) {
    const idx = texts.indexOf(pick);
    await results.nth(idx).click({ timeout: 3000 }).catch(() => {});
  }
}

async function fillSelect(page: Page, f: ScannedField, value: string): Promise<boolean> {
  const loc = page.locator(sel(f.id)).first();
  const labels = await loc.evaluate((e) =>
    Array.from((e as HTMLSelectElement).options).map((o) => (o.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  const pick = labels.find((l) => l === value) ?? bestOption(value, labels);
  if (!pick) return false;
  await loc.selectOption({ index: labels.indexOf(pick) }, { timeout: 5000 });
  return true;
}

async function clickMember(page: Page, f: ScannedField, value: string): Promise<boolean> {
  const idx = f.options[0] === "(check this box)" ? 0 : f.options.indexOf(value);
  if (idx < 0) return false;
  const m = page.locator(memberSel(f.id, idx)).first();
  await m.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const tag = await m.evaluate((e) => e.tagName.toLowerCase());
  if (tag === "button") {
    // Ashby yes/no buttons.
    if ((await m.getAttribute("aria-pressed")) !== "true") await m.click({ timeout: 5000 });
    return true;
  }
  if (await m.isChecked().catch(() => false)) return true;
  try {
    await m.check({ timeout: 4000 });
  } catch {
    // Custom-styled inputs: click the label instead.
    await m.evaluate((e) => {
      const input = e as HTMLInputElement;
      const label = (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest("label");
      (label as HTMLElement | null)?.click();
      if (!input.checked) input.click();
    });
  }
  return await m.isChecked().catch(() => true);
}

/** Visible options of the menu a combobox opened (scoped by aria-controls). */
async function comboOptions(page: Page, loc: Locator): Promise<{ menu: Locator; texts: string[] }> {
  const controls = await loc.getAttribute("aria-controls").catch(() => null);
  const owns = await loc.getAttribute("aria-owns").catch(() => null);
  const id = controls || owns;
  const menu = id
    ? page.locator(`[id="${id}"] [role="option"]`)
    : page.locator("[role='listbox']:visible [role='option']");
  const texts = (await menu.allTextContents().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
  return { menu, texts };
}

/** Opens a combobox and reads its options (without choosing). Long lists come back empty. */
export async function readComboOptions(page: Page, f: ScannedField): Promise<string[]> {
  const loc = page.locator(sel(f.id)).first();
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await loc.click({ timeout: 3000 });
    let texts: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200);
      texts = (await comboOptions(page, loc)).texts;
      if (texts.length) break;
    }
    await loc.press("Escape").catch(() => {});
    if (texts.length > 40 || texts.some((t) => /no options|type to search|loading/i.test(t))) return [];
    return texts.filter(Boolean);
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return [];
  }
}

async function fillCombobox(page: Page, f: ScannedField, value: string): Promise<boolean> {
  const loc = page.locator(sel(f.id)).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await loc.click({ timeout: 4000 });
  // Short lists: pick straight from the open menu. Otherwise type to search.
  let { menu, texts } = await comboOptions(page, loc);
  let pick = texts.length && texts.length <= 40 ? (texts.find((t) => t === value) ?? bestOption(value, texts)) : null;
  const isPlace = /location|city|working from|where|based/i.test(f.label);
  if (!pick) {
    // Async lists (city search) find nothing for "Syracuse, NY"; type the city only.
    const queries = isPlace ? placeQueries(value) : [{ query: value, match: value }];
    for (const { query, match } of queries) {
      await loc.fill("").catch(() => {});
      await loc.pressSequentially(query, { delay: 40, timeout: 10000 });
      let lastSeen = "";
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(300);
        ({ menu, texts } = await comboOptions(page, loc));
        const real = texts.filter((t) => t && !/no options|no results|loading|searching|type to/i.test(t));
        if (real.length) {
          pick = isPlace ? pickPlace(match, real) : (real.find((t) => t === match) ?? bestOption(match, real));
          if (pick) break;
          // The list has loaded and nothing in it fits: try the next query.
          const seen = real.join("|");
          if (seen === lastSeen) break;
          lastSeen = seen;
        }
      }
      if (pick) break;
    }
  }
  if (!pick) {
    await loc.press("Escape").catch(() => {});
    await loc.fill("").catch(() => {});
    return false;
  }
  const idx = texts.indexOf(pick);
  await menu.nth(idx).click({ timeout: 4000 });
  await page.waitForTimeout(150);
  return true;
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** NYC boroughs. City-search boxes (Greenhouse's) list them only as "New York". */
const NYC_BOROUGHS = /^(brooklyn|queens|bronx|the bronx|staten island|manhattan)$/i;

/** What to type into a city-search box, and what to match the suggestions against. */
export function placeQueries(value: string): { query: string; match: string }[] {
  const [city = "", state = ""] = value.split(",").map((x) => x.trim());
  const out = [{ query: city, match: value }];
  if (NYC_BOROUGHS.test(city) && (!state || /^(ny|new york)$/i.test(state))) {
    out.push({ query: "New York", match: "New York, NY" });
  }
  return out;
}

/** "Syracuse, NY" against suggestions like "Syracuse, New York, United States". */
export function pickPlace(value: string, options: string[]): string | null {
  const [cityRaw, stateRaw = ""] = value.split(",").map((x) => x.trim());
  const city = cityRaw.toLowerCase();
  if (!city) return null;
  const st = stateRaw.toUpperCase();
  const stateName = (STATES[st] ?? stateRaw).toLowerCase();
  const sameCity = options.filter((o) => o.toLowerCase().startsWith(city));
  if (!sameCity.length) return null;
  if (!stateRaw) return sameCity[0];
  const withState = sameCity.find((o) => {
    const lo = o.toLowerCase();
    return (stateName && lo.includes(stateName)) || (st.length === 2 && new RegExp(`\\b${st}\\b`).test(o));
  });
  return withState ?? null;
}

/** Fills one field. Returns false when the value couldn't be placed. */
export async function fillField(page: Page, f: ScannedField, value: string): Promise<boolean> {
  try {
    switch (f.kind) {
      case "text":
      case "textarea":
        return await fillText(page, f, value);
      case "select":
        return await fillSelect(page, f, value);
      case "radio":
      case "checkbox":
        return await clickMember(page, f, value);
      case "combobox":
        return await fillCombobox(page, f, value);
      default:
        return false;
    }
  } catch (err) {
    console.warn(`[autoapply] fill ${f.id} (${f.label.slice(0, 40)}) failed:`, err instanceof Error ? err.message.split("\n")[0] : err);
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

/** Attaches the resume. */
export async function uploadFile(
  page: Page,
  f: ScannedField,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<boolean> {
  try {
    await page.locator(sel(f.id)).first().setInputFiles(
      { name: file.name, mimeType: file.mimeType, buffer: file.buffer },
      { timeout: 10000 },
    );
    return true;
  } catch (err) {
    console.warn("[autoapply] upload failed:", err instanceof Error ? err.message.split("\n")[0] : err);
    return false;
  }
}

/** Orange outline around each field the person still has to look at. */
export async function highlight(page: Page, ids: string[]): Promise<void> {
  await page
    .evaluate((list: string[]) => {
      document.querySelectorAll("[data-ja-needs]").forEach((e) => {
        (e as HTMLElement).style.removeProperty("outline");
        e.removeAttribute("data-ja-needs");
      });
      const shown = (e: Element) => {
        const r = (e as HTMLElement).getBoundingClientRect();
        return r.width > 8 && r.height > 8 && getComputedStyle(e).visibility !== "hidden";
      };
      for (const id of list) {
        const els = Array.from(document.querySelectorAll(`[data-ja="${id}"], [data-ja^="${id}."]`));
        if (!els.length) continue;
        // Outline the smallest visible box that holds every part of the field.
        let target: Element | null = els[0];
        while (target && (!els.every((e) => target!.contains(e)) || !shown(target))) target = target.parentElement;
        // react-select: outline the whole control, not the tiny inner input.
        const control = els[0].closest("[class*='control' i]");
        if (control && control.contains(els[0]) && shown(control)) target = control;
        if (!target || target === document.body) continue;
        const h = target as HTMLElement;
        h.setAttribute("data-ja-needs", "1");
        // "important": react-select sets outline: 0 !important on its control.
        h.style.setProperty("outline", "3px solid #f97316", "important");
        h.style.setProperty("outline-offset", "3px", "important");
      }
      // Start the person at the top of the FORM, not the page: on Greenhouse
      // the page opens with a long job description and the form far below,
      // so the top of the page looks like nothing happened.
      const first = document.querySelector("[data-ja]");
      const form = first?.closest("form") ?? first;
      if (form) {
        const y = form.getBoundingClientRect().top + window.scrollY - 16;
        window.scrollTo(0, Math.max(0, y));
      } else {
        window.scrollTo(0, 0);
      }
    }, ids)
    .catch(() => {});
}
