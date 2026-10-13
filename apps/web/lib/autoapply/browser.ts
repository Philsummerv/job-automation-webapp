import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser, type Page } from "playwright-core";

// Cloud browser for "Apply for me". Server-only.
//
// One Browserbase session per application. It is created with keepAlive so it
// survives between our short API calls: /start creates it, /fill connects and
// fills, the person reviews and presses Submit in the embedded live view, and
// /status and /finish reconnect to check and close it.
//
// Ownership: the session carries userMetadata.userId. Every reconnect checks
// it, so one user can't drive or close another user's session by guessing an
// id.
//
// Deliberately plain: no stealth settings, no proxies, no CAPTCHA solving. A
// real person presses Submit in the live view, so any CAPTCHA is theirs to
// answer like on any website.

/** Hard cap on a session's life. Browserbase ends it (and the bill) after this. */
export const SESSION_TIMEOUT_SECONDS = 15 * 60;

export class AutoApplyNotConfiguredError extends Error {
  constructor() {
    super("Apply for me isn't set up on this server yet (missing BROWSERBASE_API_KEY).");
    this.name = "AutoApplyNotConfiguredError";
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("That application window has closed. Start again from the job.");
    this.name = "SessionNotFoundError";
  }
}

export function isAutoApplyConfigured(): boolean {
  return Boolean(process.env.BROWSERBASE_API_KEY);
}

function client(): Browserbase {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) throw new AutoApplyNotConfiguredError();
  return new Browserbase({ apiKey });
}

export interface NewSession {
  sessionId: string;
  /** Interactive live view, embeddable in an iframe. */
  liveViewUrl: string;
  /** When Browserbase created it (ISO). Used to pick the newest session. */
  createdAt: string;
}

export async function createSession(userId: string, jobId: string): Promise<NewSession> {
  const bb = client();
  const session = await bb.sessions.create({
    ...(process.env.BROWSERBASE_PROJECT_ID && { projectId: process.env.BROWSERBASE_PROJECT_ID }),
    keepAlive: true,
    api_timeout: SESSION_TIMEOUT_SECONDS,
    userMetadata: { userId, jobId: jobId.slice(0, 200), app: "jobassistui" },
    browserSettings: { viewport: { width: 1100, height: 900 } },
  });
  try {
    const urls = await bb.sessions.debug(session.id);
    return { sessionId: session.id, liveViewUrl: urls.debuggerFullscreenUrl, createdAt: session.createdAt };
  } catch (err) {
    await release(session.id).catch(() => {});
    throw err;
  }
}

export interface Connected {
  browser: Browser;
  page: Page;
  jobId: string;
  /** Disconnects without ending the session (keepAlive keeps it running). */
  disconnect(): Promise<void>;
}

/** Reconnects to a running session after checking it belongs to this user. */
export async function connect(sessionId: string, userId: string): Promise<Connected> {
  if (!/^[\w-]{8,100}$/.test(sessionId)) throw new SessionNotFoundError();
  const bb = client();
  let session;
  try {
    session = await bb.sessions.retrieve(sessionId);
  } catch {
    throw new SessionNotFoundError();
  }
  if (session.userMetadata?.userId !== userId) throw new SessionNotFoundError();
  if (session.status !== "RUNNING" || !session.connectUrl) throw new SessionNotFoundError();

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    browser,
    page,
    jobId: String(session.userMetadata?.jobId ?? ""),
    disconnect: async () => {
      await browser.close().catch(() => {});
    },
  };
}

/** Checks ownership and returns the session's job id, without connecting. */
export async function ownedSessionJobId(sessionId: string, userId: string): Promise<string> {
  if (!/^[\w-]{8,100}$/.test(sessionId)) throw new SessionNotFoundError();
  let session;
  try {
    session = await client().sessions.retrieve(sessionId);
  } catch {
    throw new SessionNotFoundError();
  }
  if (session.userMetadata?.userId !== userId) throw new SessionNotFoundError();
  return String(session.userMetadata?.jobId ?? "");
}

/** Ends the session so the meter stops. Safe to call twice. */
export async function release(sessionId: string): Promise<void> {
  const bb = client();
  const s = await bb.sessions.retrieve(sessionId);
  if (s.status !== "RUNNING" && s.status !== "PENDING") return;
  await bb.sessions.update(sessionId, { projectId: s.projectId, status: "REQUEST_RELEASE" });
}

/**
 * Keeps one live window per person. Releases this user's other running
 * sessions. With `keep`, only sessions created before it are released, so a
 * burst of parallel starts ends with just the newest one alive (each request
 * agrees on which one that is). Returns how many were released. Never throws.
 */
export async function releaseOtherSessions(
  userId: string,
  keep?: { id: string; createdAt: string },
): Promise<number> {
  let bb: Browserbase;
  try {
    bb = client();
  } catch {
    return 0;
  }
  const q = `user_metadata['userId']:'${userId.replace(/[^\w-]/g, "")}'`;
  const found = new Map<string, { id: string; createdAt: string; projectId: string }>();
  for (const status of ["RUNNING", "PENDING"] as const) {
    try {
      const list = await bb.sessions.list({ status, q });
      for (const s of list) {
        if (s.userMetadata?.userId !== userId) continue;
        found.set(s.id, { id: s.id, createdAt: s.createdAt, projectId: s.projectId });
      }
    } catch (err) {
      console.error("autoapply list sessions failed", err);
    }
  }
  const keepTime = keep ? Date.parse(keep.createdAt) : NaN;
  let released = 0;
  for (const s of found.values()) {
    if (keep) {
      if (s.id === keep.id) continue;
      const t = Date.parse(s.createdAt);
      // Only older ones. Ties go by id so both sides agree.
      if (Number.isFinite(t) && Number.isFinite(keepTime)) {
        if (t > keepTime || (t === keepTime && s.id > keep.id)) continue;
      }
    }
    try {
      await bb.sessions.update(s.id, { projectId: s.projectId, status: "REQUEST_RELEASE" });
      released++;
    } catch (err) {
      console.error("autoapply release other session failed", err);
    }
  }
  return released;
}
