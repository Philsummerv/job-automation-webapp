// "Apply for me", step 2: fill the form in the cloud browser.
// POST JSON { sessionId }
// Returns { ok: true, report: FillReport } or { ok: false, error, code, applicationUrl? }.
//
// Connects to the session /start opened, loads the person's resume, answer
// template and resume PDF, and lets the engine fill the form. It never presses
// Submit: the person reviews the form in the live view and submits it there.
//
// If the fill itself fails or runs out of time, the session stays open: the
// form is already loaded in the live view, so the person can finish it by
// hand (the session still ends by itself after 15 minutes). Any other failure
// (can't load the resume, can't connect) releases the session so the meter
// stops. Error replies carry applicationUrl when we know it, so the page can
// say "open the job yourself" with a working link.
//
// Fill runs once per session. A second call would reload the form, wipe the
// person's edits and make another AI call, so it is refused with 409
// "already_filled". The "already filled" mark lives in the cloud browser
// itself (see claimFill), not in the page's address, so parallel calls and
// calls after the person clicks to another site are refused too.

import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai/guard";
import { getJobById } from "@/lib/jobs/lookup";
import { loadApplicant } from "@/lib/autoapply/applicant";
import { applicationUrl } from "@/lib/autoapply/targets";
import {
  AutoApplyNotConfiguredError,
  SessionNotFoundError,
  connect,
  release,
  type Connected,
} from "@/lib/autoapply/browser";
import { fillApplication } from "@/lib/autoapply/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The engine aims for well under 240s. This leaves room to connect and load.
export const maxDuration = 300;

/** Our own stop, ahead of the platform's hard kill, so we can still clean up. */
const FILL_DEADLINE_MS = 270_000;

function fail(status: number, code: string, error: string, formUrl?: string | null) {
  return NextResponse.json(
    { ok: false, code, error, ...(formUrl ? { applicationUrl: formUrl } : {}) },
    { status },
  );
}

class FillTimeoutError extends Error {}

/** A cookie in the cloud browser marks a session as filled. It outlives page loads. */
const MARK_URL = "https://autoapply.jobassistui.com/";
const MARK_NAME = "ja_fill_claimed";

/**
 * Claims the one fill this session gets. Returns false if it was already
 * claimed.
 *
 * Two steps, so neither parallel calls nor later calls get through:
 *  1. One page.evaluate that checks and sets a flag on the open page. Page
 *     scripts run one at a time, so only one parallel call can set it. It
 *     also refuses when the page is already on the form's site.
 *  2. A cookie, checked and set after step 1. The fill sets it before it
 *     leaves the page, so a later call (after the page has moved on and the
 *     flag is gone) still finds it.
 */
async function claimFill(conn: Connected, formUrl: string | null): Promise<boolean> {
  let formHost = "";
  try {
    formHost = formUrl ? new URL(formUrl).host : "";
  } catch {
    formHost = "";
  }
  const won = await conn.page
    .evaluate((host) => {
      const g = globalThis as { __jaFillClaimed?: boolean };
      if (host && location.host === host) return false;
      if (g.__jaFillClaimed) return false;
      g.__jaFillClaimed = true;
      return true;
    }, formHost)
    .catch(() => false);
  if (!won) return false;
  const ctx = conn.page.context();
  const marks = await ctx.cookies(MARK_URL);
  if (marks.some((c) => c.name === MARK_NAME)) return false;
  await ctx.addCookies([{ name: MARK_NAME, value: "1", url: MARK_URL }]);
  return true;
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const access = await requireAiAccess();
  if (!access.ok) return fail(access.status, access.code, access.error);
  const { user, supabase } = access;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "We couldn't read that request.");
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return fail(400, "bad_request", "Start the application first.");

  let conn: Connected;
  try {
    conn = await connect(sessionId, user.id);
  } catch (err) {
    if (err instanceof AutoApplyNotConfiguredError) {
      return fail(503, "not_configured", "Apply for me isn't set up yet. Open the job and apply there.");
    }
    if (err instanceof SessionNotFoundError) return fail(410, "session_gone", err.message);
    console.error("autoapply fill connect failed", err);
    await release(sessionId).catch(() => {});
    return fail(502, "browser_error", "We couldn't reach the application window. Start again from the job.");
  }

  const formUrl = applicationUrl(conn.jobId);
  let released = false;
  const releaseNow = async () => {
    if (released) return;
    released = true;
    await release(sessionId).catch(() => {});
  };

  // Already filled (or filling). Don't reload it.
  let claimed = false;
  try {
    claimed = !(formUrl && sameHost(conn.page.url(), formUrl)) && (await claimFill(conn, formUrl));
  } catch (err) {
    console.error("autoapply fill claim failed", err);
  }
  if (!claimed) {
    await conn.disconnect();
    return fail(409, "already_filled", "This form is already filled in. Check it in the window.", formUrl);
  }

  try {
    const loaded = await loadApplicant(supabase, user);
    if (!loaded.ok) {
      await releaseNow();
      return fail(loaded.status, loaded.code, loaded.error, formUrl);
    }

    const job = await getJobById(conn.jobId);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new FillTimeoutError()), FILL_DEADLINE_MS);
    });
    try {
      const report = await Promise.race([
        fillApplication(conn.page, {
          jobId: conn.jobId,
          job,
          applicant: loaded.applicant,
          resumeFile: loaded.resumeFile,
        }),
        deadline,
      ]);
      return NextResponse.json({ ok: true, report });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Keep the session: the form is open in the live view and the person can
    // finish it by hand. The page closes it via /finish (or it times out).
    if (err instanceof FillTimeoutError) {
      return fail(504, "fill_timeout", "Filling in this form took too long.", formUrl);
    }
    console.error("autoapply fill failed", err);
    return fail(502, "fill_failed", "We couldn't fill in all of this form.", formUrl);
  } finally {
    await conn.disconnect();
  }
}
