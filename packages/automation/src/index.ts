// @applyassistui/automation — Guided-mode automation core (ported from the
// desktop app's automation/scout.js). Consumed by the Stage A console driver
// now and the worker service (Stage B) later.

export { runScout } from "./scout.js";
export { DEFAULT_CONFIG, type ScoutConfig, type ResumeFile } from "./config.js";
// Exported for unit testing of the field-matching rules.
export { makeAutoFillAnswer, makeSuggestFromResume } from "./autofill.js";
export { BrowserbaseProvider, type BrowserbaseProviderOptions } from "./providers/browserbase.js";
export type { BrowserProvider, BrowserSession } from "./providers/types.js";
export type {
  AskFn,
  FormField,
  FormFieldOption,
  JobListing,
  Logger,
  LogLevel,
  PromptMeta,
  RunScoutOptions,
  RunScoutResult,
  ScoutStatus,
} from "./types.js";
