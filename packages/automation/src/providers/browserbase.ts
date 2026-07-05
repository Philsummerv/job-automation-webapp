import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import type { BrowserProvider, BrowserSession } from "./types.js";

export interface BrowserbaseProviderOptions {
  apiKey: string;
  /** Optional — the API key resolves the project automatically. */
  projectId?: string;
  /** Session hard timeout in seconds. Free tier caps sessions around 15 min. */
  timeoutSeconds?: number;
}

export class BrowserbaseProvider implements BrowserProvider {
  readonly name = "browserbase";

  constructor(private readonly opts: BrowserbaseProviderOptions) {}

  async connect(): Promise<BrowserSession> {
    const bb = new Browserbase({ apiKey: this.opts.apiKey });
    const session = await bb.sessions.create({
      // projectId is optional — the API key resolves the project.
      ...(this.opts.projectId && { projectId: this.opts.projectId }),
      timeout: this.opts.timeoutSeconds ?? 900,
      // keepAlive stays false: the session ends when we disconnect.
    });

    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    let liveViewUrl: string | undefined;
    try {
      const urls = await bb.sessions.debug(session.id);
      liveViewUrl = urls.debuggerFullscreenUrl;
    } catch {
      // Non-fatal — the Browserbase dashboard's session page also has a view.
    }

    let closed = false;
    return {
      browser,
      context,
      page,
      sessionId: session.id,
      liveViewUrl,
      close: async () => {
        if (closed) return;
        closed = true;
        await browser.close().catch(() => {});
        // Belt-and-braces: explicitly ask Browserbase to end the session so
        // the meter stops even if the CDP disconnect didn't register.
        await bb.sessions
          .update(session.id, {
            // The create response always carries the resolved projectId.
            projectId: session.projectId,
            status: "REQUEST_RELEASE",
          })
          .catch(() => {});
      },
    };
  }
}
