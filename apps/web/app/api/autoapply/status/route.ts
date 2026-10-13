// "Apply for me": is the application sent yet?
// POST JSON { sessionId }
// Returns { ok: true, submitted, alive } or { ok: false, error, code }.
//
// The page polls this while the person reviews the form. alive = the cloud
// browser is still running. submitted = the board's "thanks, we got it" page
// is showing. A closed or timed-out session is { submitted: false, alive: false },
// not an error, so polling can just stop.

import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai/guard";
import {
  AutoApplyNotConfiguredError,
  SessionNotFoundError,
  connect,
  type Connected,
} from "@/lib/autoapply/browser";
import { detectSubmitted } from "@/lib/autoapply/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export async function POST(req: Request) {
  const access = await requireAiAccess();
  if (!access.ok) return fail(access.status, access.code, access.error);
  const { user } = access;

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
      return fail(503, "not_configured", "Apply for me isn't set up yet.");
    }
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ ok: true, submitted: false, alive: false });
    }
    console.error("autoapply status connect failed", err);
    return fail(502, "browser_error", "We couldn't check the application window. Try again.");
  }

  try {
    const submitted = await detectSubmitted(conn.page).catch(() => false);
    return NextResponse.json({ ok: true, submitted, alive: true });
  } finally {
    await conn.disconnect();
  }
}
