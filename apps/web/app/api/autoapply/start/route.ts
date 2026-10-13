// "Apply for me", step 1: open a cloud browser for one job.
// POST JSON { jobId: "greenhouse:slug:123" }
// Returns { ok: true, sessionId, liveViewUrl, applicationUrl, job: { company, title } }
// or { ok: false, error, code }.
//
// Order: auth + paid tier + AI configured -> supported board -> cloud browser
// configured -> the job still exists -> the person has a resume -> daily cap
// -> create the session. Nothing is charged until we know the run can work.
//
// One live window per person: starting a new one closes any other one they
// have open.
//
// The session only opens here. /api/autoapply/fill does the filling, so this
// call returns fast and the page can show the live view right away.

import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai/guard";
import { getResumeProfile } from "@/lib/ai/resume";
import {
  AiLimitError,
  MIGRATION_NEEDED_MESSAGE,
  MigrationMissingError,
  checkAndRecordUsage,
  getKindUsageToday,
} from "@/lib/ai/usage";
import { getJobById } from "@/lib/jobs/lookup";
import { applicationUrl, canAutoApply } from "@/lib/autoapply/targets";
import {
  AutoApplyNotConfiguredError,
  createSession,
  isAutoApplyConfigured,
  releaseOtherSessions,
} from "@/lib/autoapply/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * Apply for me runs per person per day (UTC). Each one opens a cloud browser
 * that is billed while it runs, so it gets its own small cap on top of the
 * shared AI cap.
 */
const AUTO_APPLY_DAILY_LIMIT = 10;
const KIND_LIMIT_MESSAGE = `You've used today's ${AUTO_APPLY_DAILY_LIMIT} Apply for me tries. They reset at midnight UTC.`;

const NOT_CONFIGURED = "Apply for me isn't set up yet. Open the job and apply there.";

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
  const jobId = typeof body.jobId === "string" ? body.jobId.trim().slice(0, 300) : "";
  if (!jobId) return fail(400, "bad_request", "Pick a job first.");

  // 1. Only Greenhouse, Lever and Ashby forms.
  const formUrl = canAutoApply(jobId) ? applicationUrl(jobId) : null;
  if (!formUrl) {
    return fail(400, "unsupported", "Apply for me can't fill this job's form. Open the job and apply there.");
  }
  if (!isAutoApplyConfigured()) return fail(503, "not_configured", NOT_CONFIGURED);

  // 2. The job must still be posted. Checked on the employer's board, not
  //    the job index, which can lag behind by a day or two.
  const job = await getJobById(jobId, { fresh: true });
  if (!job) {
    return fail(404, "job_not_found", "That job isn't posted any more. Pick another one.");
  }

  // 3. A resume to fill from. (The full applicant, with the PDF, is loaded
  //    in /fill. Here we only need to know there is one.)
  try {
    const row = await getResumeProfile(supabase, user.id);
    if (!row?.profile) {
      return fail(409, "no_resume", "Add your resume first. Apply for me fills forms from it.");
    }
  } catch (err) {
    if (err instanceof MigrationMissingError) return fail(503, "migration_needed", MIGRATION_NEEDED_MESSAGE);
    return fail(500, "db_error", "We couldn't load your resume. Try again.");
  }

  // 4. Daily caps. One slot per application, from the shared AI cap and from
  //    Apply for me's own cap. ai_take_slot runs one request at a time per
  //    user, so counting after taking the slot can't let a burst slip past.
  try {
    if ((await getKindUsageToday(supabase, user.id, "auto_apply")) >= AUTO_APPLY_DAILY_LIMIT) {
      return fail(429, "limit", KIND_LIMIT_MESSAGE);
    }
    await checkAndRecordUsage(supabase, user.id, "auto_apply");
    if ((await getKindUsageToday(supabase, user.id, "auto_apply")) > AUTO_APPLY_DAILY_LIMIT) {
      return fail(429, "limit", KIND_LIMIT_MESSAGE);
    }
  } catch (err) {
    if (err instanceof AiLimitError) return fail(429, "limit", err.message);
    if (err instanceof MigrationMissingError) return fail(503, "migration_needed", err.message);
    return fail(500, "db_error", "We couldn't check your daily limit. Try again.");
  }

  // 5. Open the cloud browser. One window per person: close any other one
  //    first, and again after (a burst of starts keeps only the newest).
  try {
    await releaseOtherSessions(user.id);
    const { sessionId, liveViewUrl, createdAt } = await createSession(user.id, jobId);
    await releaseOtherSessions(user.id, { id: sessionId, createdAt });
    return NextResponse.json({
      ok: true,
      sessionId,
      liveViewUrl,
      applicationUrl: formUrl,
      job: { company: job.company, title: job.title },
    });
  } catch (err) {
    if (err instanceof AutoApplyNotConfiguredError) return fail(503, "not_configured", NOT_CONFIGURED);
    console.error("autoapply start failed", err);
    return fail(502, "browser_error", "We couldn't open the application. Try again, or open the job and apply there.");
  }
}
