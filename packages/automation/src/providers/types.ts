// Browser acquisition seam. The scout never launches a browser itself — it
// asks a provider for a connected session. Implementations: BrowserbaseProvider
// (now), VpsProvider / LocalProvider (later) — swapping providers must never
// require touching scout logic.

import type { Browser, BrowserContext, Page } from "playwright-core";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId?: string;
  /** Interactive live-view URL the human opens to log in / solve captchas. */
  liveViewUrl?: string;
  /** Provider-persisted context id (future login-session reuse). */
  contextId?: string;
  /** Idempotent. MUST stop the provider's metering on every exit path. */
  close(): Promise<void>;
}

export interface BrowserProvider {
  readonly name: string;
  connect(): Promise<BrowserSession>;
}
