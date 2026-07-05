// Contracts for the Guided automation core. Ported from the desktop app's
// implicit shapes (automation/scout.js) and made explicit for the web stack.

import type { GuidedActivityEvent } from "@applyassistui/shared";
import type { BrowserProvider } from "./providers/types.js";
import type { ScoutConfig } from "./config.js";

export type ScoutStatus =
  | "launching-browser"
  | "navigating"
  | "searching"
  | "closing";

export interface JobListing {
  title: string;
  company: string;
  location: string;
  snippet: string;
  link: string;
  isIndeedApply: boolean;
}

export interface FormFieldOption {
  label: string;
  value: string;
  id?: string;
}

export interface FormField {
  text: string;
  type: string;
  options: FormFieldOption[];
  inputId: string | null;
  inputName: string | null;
}

// meta shapes passed to onPrompt — drives richer UI in drivers that support
// it; plain text answers are always acceptable.
export type PromptMeta =
  | { field: FormField; suggestion: string | null }
  | { kind: "captcha" }
  | { kind: "job-decision"; job: JobListing };

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info: (...parts: unknown[]) => void;
  warn: (...parts: unknown[]) => void;
  error: (...parts: unknown[]) => void;
}

export type AskFn = (question: string, meta?: PromptMeta) => Promise<string>;

export interface RunScoutOptions {
  config?: Partial<ScoutConfig>;
  /** Required — scout never launches a browser itself. */
  provider: BrowserProvider;
  onLog?: (level: LogLevel, msg: string) => void;
  onStatus?: (status: ScoutStatus) => void;
  onPrompt?: (question: string, meta?: PromptMeta) => Promise<string> | string;
  onActivity?: (entry: GuidedActivityEvent) => Promise<void> | void;
  onSession?: (info: { sessionId?: string; liveViewUrl?: string }) => void;
}

export interface RunScoutResult {
  logged: number;
  applied: number;
  status: "done" | "no-results";
}

// Shared per-run context threaded through the form-fill helpers — mirrors the
// desktop app's `ctx` object exactly.
export interface RunContext {
  log: Logger;
  ask: AskFn;
  askLower: AskFn;
  getAutoFillAnswer: (questionText: string) => string | null;
  suggestFromResume: (questionText: string) => string | null;
  checkForCaptcha: (page: import("playwright-core").Page) => Promise<boolean>;
  config: ScoutConfig;
}
