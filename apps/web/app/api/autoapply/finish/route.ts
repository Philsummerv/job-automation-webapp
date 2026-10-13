// "Apply for me", last step: close the cloud browser and log the application.
// POST JSON { sessionId, submitted: true | false | "check", date?: "YYYY-MM-DD" }
// Returns { ok: true, logged } or { ok: false, error, code }.
//
// submitted:
//   true    the person says they sent it -> log it.
//   false   they gave up -> just close.
//   "check" we look at the page ourselves (the "thanks, we got it" screen)
//           and log only if it's there. Used when the page is being left.
//
// true and false always release the session, even when something else fails,
// so the meter stops. "check" releases it only when the form was sent: the
// page also sends "check" when it reloads, and closing the window then would
// throw away a filled form the person can still come back to. An abandoned
// window ends by itself after 15 minutes, or when the person starts another
// one (one window per person, see /api/autoapply/start). Logging skips a row that is already there (same day, employer
// and link), so a double call never logs twice.
//
// Also accepts navigator.sendBeacon bodies, which arrive as text/plain.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { parseISODate, reportingPeriodKey, toISODate } from "@jobassistui/shared";
import { requireAiAccess } from "@/lib/ai/guard";
import { getJobById, parseJobId } from "@/lib/jobs/lookup";
import { applicationUrl } from "@/lib/autoapply/targets";
import {
  AutoApplyNotConfiguredError,
  SessionNotFoundError,
  connect,
  ownedSessionJobId,
  release,
} from "@/lib/autoapply/browser";
import { detectSubmitted } from "@/lib/autoapply/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

const NOTES = "Applied with Apply for me.";

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  if (toISODate(d) !== s) return false;
  // Allow the browser's "today" to be a day ahead of the server's.
  const max = new Date();
  max.setDate(max.getDate() + 1);
  return d.getTime() <= max.getTime() && d.getFullYear() >= 2000;
}

/** "acme-corp" -> "Acme Corp". Only used when the posting is gone. */
function nameFromSlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function POST(req: Request) {
  const access = await requireAiAccess();
  if (!access.ok) return fail(access.status, access.code, access.error);
  const { user, supabase, profile } = access;

  // Read as text and parse: sendBeacon sends JSON as text/plain.
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await req.text());
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "We couldn't read that request.");
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return fail(400, "bad_request", "Missing the application window id.");
  const mode = body.submitted === true ? "yes" : body.submitted === "check" ? "check" : body.submitted === false ? "no" : null;
  if (!mode) return fail(400, "bad_request", "Say whether the application was sent.");
  const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
  const date = isValidDate(dateRaw) ? dateRaw : toISODate(new Date());

  // Ownership first. This also gives us the job id.
  let jobId: string;
  try {
    jobId = await ownedSessionJobId(sessionId, user.id);
  } catch (err) {
    if (err instanceof AutoApplyNotConfiguredError) return fail(503, "not_configured", "Apply for me isn't set up yet.");
    if (err instanceof SessionNotFoundError) return fail(410, "session_gone", err.message);
    console.error("autoapply finish lookup failed", err);
    return fail(502, "browser_error", "We couldn't reach the application window. Try again.");
  }

  let submitted = mode === "yes";
  try {
    if (mode === "check") {
      try {
        const conn = await connect(sessionId, user.id);
        try {
          submitted = await detectSubmitted(conn.page);
        } finally {
          await conn.disconnect();
        }
      } catch {
        // Session already closed, or the page can't be read. We can't tell,
        // so we don't log.
        submitted = false;
      }
    }
  } finally {
    if (mode !== "check" || submitted) {
      await release(sessionId).catch((err) => console.error("autoapply release failed", err));
    }
  }

  if (!submitted || !jobId) return NextResponse.json({ ok: true, logged: false });

  // Log it, like "I applied — log it" on the apply page.
  const posting = await getJobById(jobId);
  const parsed = parseJobId(jobId);
  const employer_name = (posting?.company || (parsed ? nameFromSlug(parsed.slug) : "")).trim().slice(0, 200);
  if (!employer_name) return NextResponse.json({ ok: true, logged: false });
  const job_title = posting?.title?.trim().slice(0, 200) || null;
  const url = (posting?.url || applicationUrl(jobId) || "").slice(0, 2000) || null;

  // Skip if this exact application is already logged.
  let dupe = supabase
    .from("activity_log")
    .select("id")
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("employer_name", employer_name);
  dupe = url ? dupe.eq("url", url) : dupe.is("url", null);
  const { data: existing, error: dupeErr } = await dupe.limit(1);
  if (dupeErr) return fail(500, "db_error", "We couldn't save that to your log. Add it by hand.");
  if (existing && existing.length > 0) return NextResponse.json({ ok: true, logged: true });

  const reporting_period = reportingPeriodKey(
    parseISODate(date),
    profile?.reporting_period_start_day ?? 0,
  );
  const { error } = await supabase.from("activity_log").insert({
    user_id: user.id,
    date,
    employer_name,
    job_title,
    method: "online",
    url,
    result: "applied",
    notes: NOTES,
    source: "guided",
    evidence_path: null,
    reporting_period,
  });
  if (error) return fail(500, "db_error", "We couldn't save that to your log. Add it by hand.");

  revalidatePath("/dashboard");
  return NextResponse.json({ ok: true, logged: true });
}
