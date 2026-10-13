import type { JobPosting } from "@jobassistui/shared";
import type { Page } from "playwright-core";
import { decideDeterministic, decideWithAi, type ApplicantInfo, type Decision } from "./answers";
import { currentValue, fillField, highlight, readComboOptions, uploadFile } from "./fill";
import { scanFormInPage, type ScannedField } from "./scan";
import { applicationUrl } from "./targets";

// "Apply for me": opens the real application form in the cloud browser, fills
// what we know, and marks what the person still has to do. Server-only.
//
// It NEVER presses Submit/Apply. The person reviews the live view, fixes
// anything, solves any CAPTCHA, and submits themselves.

export type { ApplicantInfo } from "./answers";

export interface ResumeFileData {
  name: string;
  mimeType: "application/pdf";
  buffer: Buffer;
}

export interface FillReport {
  applicationUrl: string;
  fieldCount: number;
  filled: { label: string; value: string }[];
  needsYou: { label: string; reason: string; required: boolean }[];
}

/** Whole run budget. The route allows 300s; stay well under 240s. */
const BUDGET_MS = 200_000;

const NAME_SHIM = "globalThis.__name = globalThis.__name || ((f) => f)";

async function scan(page: Page): Promise<ScannedField[]> {
  await page.evaluate(NAME_SHIM).catch(() => {});
  return page.evaluate(scanFormInPage);
}

/** Waits until the form has rendered (SPAs like Ashby load late). */
async function waitForForm(page: Page, deadline: number): Promise<ScannedField[]> {
  let last: ScannedField[] = [];
  let stableFor = 0;
  while (Date.now() < deadline) {
    try {
      const fields = await scan(page);
      const real = fields.filter((f) => f.kind !== "file");
      if (real.length >= 2 && fields.length === last.length) {
        if (++stableFor >= 1) return fields;
      } else stableFor = 0;
      last = fields;
    } catch {
      /* page still loading */
    }
    await page.waitForTimeout(1000);
  }
  return last;
}

/** Step timings in the server log. Set AUTOAPPLY_DEBUG=1 to see them. */
const debug = (started: number, msg: string) => {
  if (process.env.AUTOAPPLY_DEBUG) console.log(`[autoapply] +${((Date.now() - started) / 1000).toFixed(1)}s ${msg}`);
};

const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function fillApplication(
  page: Page,
  opts: { jobId: string; job: JobPosting | null; applicant: ApplicantInfo; resumeFile: ResumeFileData | null },
): Promise<FillReport> {
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const url = applicationUrl(opts.jobId);
  if (!url) throw new Error("This job can't be opened with Apply for me.");
  const report: FillReport = { applicationUrl: url, fieldCount: 0, filled: [], needsYou: [] };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch {
    // Slow pages still often render; keep going and see if a form shows up.
  }
  debug(started, `opened ${page.url()}`);
  let fields = await waitForForm(page, Math.min(deadline, Date.now() + 25_000));
  debug(started, `form: ${fields.length} fields`);
  if (!fields.length) {
    report.needsYou.push({
      label: "Application form",
      reason: "We couldn't find the form on this page. It may have closed. Check the window.",
      required: true,
    });
    return report;
  }

  const needs = new Map<string, { label: string; reason: string; required: boolean }>();
  /** Full labels (and kinds) of the fields in `needs`, to find them again after React re-renders. */
  const needsKeys = new Set<string>();
  const filledById = new Map<string, { label: string; value: string }>();
  const markNeeds = (f: ScannedField, reason: string) => {
    if (!reason && !f.required) return;
    needs.set(f.id, { label: short(f.label || "File upload"), reason: reason || "Please fill this in.", required: f.required });
    needsKeys.add(`${f.kind}|${f.label}`);
  };

  // 1. Resume first: Lever and Ashby read it and fill fields themselves.
  const fileFields = fields.filter((f) => f.kind === "file");
  const resumeTarget = fileFields.find((f) => decideDeterministic(f, opts.applicant, opts.job)?.type === "resume");
  let uploaded = false;
  if (resumeTarget && opts.resumeFile) {
    uploaded = await uploadFile(page, resumeTarget, opts.resumeFile);
    if (uploaded) {
      filledById.set("resume", { label: short(resumeTarget.label || "Resume"), value: opts.resumeFile.name });
      // Give the board's resume parser time to fill fields, then re-scan.
      await page.waitForTimeout(/lever\.co|ashbyhq/.test(page.url()) ? 6000 : 1500);
      fields = await scan(page).catch(() => fields);
    } else {
      markNeeds(resumeTarget, "We couldn't attach your resume. Please attach it here.");
    }
  } else if (resumeTarget) {
    markNeeds(resumeTarget, "Please attach your resume here.");
  }

  debug(started, `resume ${uploaded ? "attached" : "not attached"}; ${fields.length} fields`);

  // 2. Read short option lists of comboboxes so answers can be matched.
  for (const f of fields) {
    if (f.kind !== "combobox" || Date.now() > deadline - 120_000) continue;
    f.options = await readComboOptions(page, f);
  }

  debug(started, "read dropdown options");

  // 3. Decide.
  const decisions = new Map<string, Decision>();
  const forAi: ScannedField[] = [];
  for (const f of fields) {
    if (f.kind === "file") {
      if (filledById.has(f.id) || needs.has(f.id)) continue;
      // Re-scan renumbers fields; match the uploaded one by label.
      if (uploaded && resumeTarget && f.label === resumeTarget.label) continue;
      const d = decideDeterministic(f, opts.applicant, opts.job);
      if (d?.type === "resume") continue;
      markNeeds(f, d?.type === "skip" ? d.reason : "");
      continue;
    }
    const d = decideDeterministic(f, opts.applicant, opts.job);
    if (d) decisions.set(f.id, d);
    else forAi.push(f);
  }
  if (forAi.length) {
    const aiTime = Math.max(10_000, Math.min(110_000, deadline - Date.now() - 60_000));
    const ai = await decideWithAi(forAi, opts.applicant, opts.job, aiTime);
    for (const [id, d] of ai) decisions.set(id, d);
  }
  debug(started, `decided: ${decisions.size} answers, ${forAi.length} asked the AI`);

  // 4. Fill, top to bottom.
  for (const f of fields) {
    const d = decisions.get(f.id);
    if (!d) continue;
    if (d.type === "skip") {
      markNeeds(f, d.reason);
      continue;
    }
    if (d.type !== "answer") continue;
    if (Date.now() > deadline) {
      markNeeds(f, "We ran out of time here. Please fill this in.");
      continue;
    }
    const now = await currentValue(page, f);
    if (now && !d.overwrite && (f.kind === "text" || f.kind === "textarea" || f.kind === "select" || f.kind === "combobox")) {
      // Already filled (often by the board's resume reader). Keep it.
      filledById.set(f.id, { label: short(f.label), value: short(now, 200) });
      continue;
    }
    if (now && d.overwrite && now === d.value) {
      filledById.set(f.id, { label: short(f.label), value: short(now, 200) });
      continue;
    }
    const t0 = Date.now();
    const ok = await fillField(page, f, d.value);
    debug(started, `  ${f.kind} "${short(f.label, 40)}" ${ok ? "ok" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (ok) {
      // Report what the form actually shows (e.g. the city suggestion that was picked).
      const shown = f.kind === "combobox" || f.kind === "select" ? await currentValue(page, f) : "";
      const value = d.value === "(check this box)" ? "Checked" : shown && shown.length > 2 ? shown : d.value;
      filledById.set(f.id, { label: short(f.label), value: short(value, 200) });
      if (d.source === "ai" && f.kind === "textarea") {
        markNeeds(f, "We wrote this from your resume. Read it and change anything that isn't right.");
      }
    } else {
      markNeeds(f, `We couldn't put "${short(d.value, 40)}" here. Please fill it in.`);
    }
  }

  debug(started, `filled ${filledById.size}, ${needs.size} left for the person`);
  report.fieldCount = fields.length;
  report.filled = [...filledById.entries()].filter(([id]) => !needs.has(id) || /wrote this/.test(needs.get(id)!.reason)).map(([, v]) => v);
  report.needsYou = [...needs.values()].sort((a, b) => Number(b.required) - Number(a.required));

  // 5. Show the person what's left, and start them at the top.
  await page.evaluate(NAME_SHIM).catch(() => {});
  // React widgets (react-select) can re-render and lose our data-ja tags, so
  // scan once more and find the fields by label.
  const finalFields = await scan(page).catch(() => [] as ScannedField[]);
  const ids = finalFields.filter((f) => needsKeys.has(`${f.kind}|${f.label}`)).map((f) => f.id);
  await highlight(page, ids);
  await page.keyboard.press("Escape").catch(() => {});
  debug(started, "done");
  return report;
}

// ─── Did they submit? ──────────────────────────────────────────────────────

const DONE_URL = /greenhouse\.io\/.*confirmation|jobs\.lever\.co\/.+\/thanks|\/application\/?(success|submitted)|\/thank-?you/i;
const DONE_TEXT =
  /thank(s| you) for (applying|your application|submitting)|application (has been |was )?(successfully )?(submitted|received)|we('ve| have) received your application|your application (is|has been) (in|on its way|sent)|application submitted/i;

/** True once the board shows its "application sent" page. */
export async function detectSubmitted(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    if (DONE_URL.test(url)) return true;
    const { text, inputs } = await page.evaluate(() => {
      const visibleInputs = Array.from(document.querySelectorAll("input, textarea, select")).filter((e) => {
        const t = (e.getAttribute("type") || "").toLowerCase();
        if (["hidden", "submit", "button", "search"].includes(t)) return false;
        const r = (e as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length;
      return { text: (document.body?.innerText ?? "").slice(0, 20000), inputs: visibleInputs };
    });
    // The confirmation replaces the form; a page still full of inputs isn't done.
    if (DONE_TEXT.test(text) && inputs < 3) return true;
    if (/ashby-application-form-success|application-confirmation/i.test(await page.content().catch(() => ""))) return true;
    return false;
  } catch {
    return false;
  }
}
