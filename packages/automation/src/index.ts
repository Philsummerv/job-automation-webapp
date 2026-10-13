// @jobassistui/automation — the field-matching core shared by the Chrome
// extension.
//
// This package used to also host a Playwright/Browserbase "scout" that drove
// Indeed in a cloud browser. That path was removed on 2026-09-02 when the
// product pivoted away from automating Indeed: it was dead code, it carried a
// CAPTCHA solver and anti-detection mouse jitter that had no place in a tool
// for benefit claimants, and it is recoverable from git history if ever needed.
//
// What is left is pure, DOM-shaped logic with no browser driver: reading the
// fields of a form, deciding what to type in them, and building a search URL.
// The extension imports the subpaths directly; this barrel is for tests.

export { DEFAULT_CONFIG, type ScoutConfig, type ResumeFile } from "./config.js";
export { makeAutoFillAnswer, makeSuggestFromResume } from "./autofill.js";
export { collectFormQuestions } from "./forms.js";
export { buildIndeedSearchUrl, collectIndeedJobs } from "./indeed-search.js";
export type {
  AskFn,
  FormField,
  FormFieldOption,
  JobListing,
  Logger,
  LogLevel,
  PromptMeta,
} from "./types.js";
