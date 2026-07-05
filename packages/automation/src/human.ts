// Human emulation — ported verbatim from automation/scout.js L1153-1167.
// Random mouse movement + scroll noise between navigations. Intentional
// anti-detection behavior: DO NOT REMOVE.

import type { Page } from "playwright-core";

export async function humanEmulation(page: Page): Promise<void> {
  const vw = 1280;
  const vh = 720;
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(Math.random() * vw * 0.6) + vw * 0.2;
    const y = Math.floor(Math.random() * vh * 0.6) + vh * 0.2;
    await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 15) });
    await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
  }
  const scrollY = 200 + Math.floor(Math.random() * 400);
  await page.mouse.wheel(0, scrollY);
  await page.waitForTimeout(500 + Math.floor(Math.random() * 700));
  await page.mouse.wheel(0, -scrollY);
  await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
}
