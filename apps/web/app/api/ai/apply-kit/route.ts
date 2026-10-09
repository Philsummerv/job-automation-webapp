// Apply kit endpoint. POST JSON, one of:
//   { mode: "job",  jobId: "greenhouse:slug:123", fallbackUrl?: "https://..." }
//   { mode: "url",  url: "https://..." }
//   { mode: "text", text: "...", company?: "...", title?: "..." }
// Returns { ok: true, kit, job, remaining } or { ok: false, error, code }.
//
// Order: auth + paid tier + AI configured -> resume profile -> resolve the job
// (no AI spend yet) -> daily cap -> model call. The cap is only charged once
// we know there's a real job and a real resume to work with.
//
// Node runtime on purpose: safeFetchJobPage needs node:dns and node:net.

import { NextResponse } from "next/server";
import type { ResumeProfileRow } from "@jobassistui/shared";
import { requireAiAccess } from "@/lib/ai/guard";
import {
  AiLimitError,
  MIGRATION_NEEDED_MESSAGE,
  MigrationMissingError,
  checkAndRecordUsage,
  isMissingTableError,
} from "@/lib/ai/usage";
import { aiErrorMessage } from "@/lib/ai/client";
import {
  JOB_TEXT_MAX_CHARS,
  buildApplyKit,
  type ApplyJobInput,
  type ApplyKitJobInfo,
} from "@/lib/ai/applyKit";
import { getJobById } from "@/lib/jobs/lookup";
import { FetchPageError, UnsafeUrlError, safeFetchJobPage } from "@/lib/jobs/fetchUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const MIN_JOB_TEXT = 150;

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

  // 1. Resume profile.
  const { data: row, error: rowErr } = await supabase
    .from("resume_profiles")
    .select("raw_text, profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowErr) {
    if (isMissingTableError(rowErr)) return fail(503, "migration_needed", MIGRATION_NEEDED_MESSAGE);
    return fail(500, "db_error", "We couldn't load your resume. Try again.");
  }
  const resume = row as Pick<ResumeProfileRow, "raw_text" | "profile"> | null;
  if (!resume?.profile) {
    return fail(409, "no_resume", "Add your resume first. Then come back to build the kit.");
  }

  // 2. Resolve the job. No AI spend yet.
  let job: ApplyJobInput;
  let info: ApplyKitJobInfo;
  const mode = str(body.mode, 10);
  try {
    if (mode === "job") {
      const jobId = str(body.jobId, 400);
      const posting = jobId ? await getJobById(jobId) : null;
      if (posting) {
        job = {
          company: posting.company,
          title: posting.title,
          location: posting.location,
          url: posting.url,
          text: posting.descriptionText,
        };
        info = {
          company: posting.company,
          title: posting.title,
          url: posting.url,
          applyUrl: posting.applyUrl || posting.url,
        };
      } else {
        // Feed jobs from query-based sources can drop out of the cache. Fall
        // back to the posting URL if the feed gave us one.
        const fallbackUrl = str(body.fallbackUrl, 2000);
        if (!fallbackUrl) {
          return fail(404, "job_not_found", "We couldn't find that job any more. Paste its link or text instead.");
        }
        ({ job, info } = await fromUrl(fallbackUrl));
      }
    } else if (mode === "url") {
      const url = str(body.url, 2000);
      if (!url) return fail(400, "bad_request", "Paste a job link first.");
      ({ job, info } = await fromUrl(url));
    } else if (mode === "text") {
      const raw = typeof body.text === "string" ? body.text : "";
      if (raw.length > JOB_TEXT_MAX_CHARS) {
        return fail(400, "too_long", `That text is too long. Keep it under ${JOB_TEXT_MAX_CHARS.toLocaleString()} characters.`);
      }
      const text = raw.trim();
      if (text.length < MIN_JOB_TEXT) {
        return fail(400, "too_short", "That's too short to be a job posting. Paste the full job text.");
      }
      const company = str(body.company, 200);
      const title = str(body.title, 200);
      job = { company, title, location: "", url: null, text };
      info = { company, title, url: null, applyUrl: null };
    } else {
      return fail(400, "bad_request", "Pick a job, paste a link, or paste the job text.");
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof FetchPageError) {
      return fail(400, "fetch_failed", err.message);
    }
    return fail(502, "fetch_failed", "We couldn't load that job. Paste the job text instead.");
  }

  if (job.text.trim().length < MIN_JOB_TEXT) {
    return fail(422, "no_job_text", "That job has almost no description. Paste the full job text instead.");
  }

  // 3. Daily cap, then the model call.
  let remaining: number;
  try {
    ({ remaining } = await checkAndRecordUsage(supabase, user.id, "apply_kit"));
  } catch (err) {
    if (err instanceof AiLimitError) return fail(429, "limit", err.message);
    if (err instanceof MigrationMissingError) return fail(503, "migration_needed", err.message);
    return fail(500, "db_error", "We couldn't check your daily limit. Try again.");
  }

  try {
    const { kit, detected } = await buildApplyKit({
      profile: resume.profile,
      rawResumeText: resume.raw_text,
      job,
    });
    const jobInfo: ApplyKitJobInfo = {
      ...info,
      company: info.company || detected.company || "",
      title: info.title || detected.title || "",
    };
    return NextResponse.json({ ok: true, kit, job: jobInfo, remaining });
  } catch (err) {
    console.error("apply-kit failed", err);
    return fail(502, "ai_error", aiErrorMessage(err));
  }
}

async function fromUrl(url: string): Promise<{ job: ApplyJobInput; info: ApplyKitJobInfo }> {
  const page = await safeFetchJobPage(url);
  const company = page.company?.trim().slice(0, 200) ?? "";
  const title = page.title?.trim().slice(0, 200) ?? "";
  return {
    job: { company, title, location: "", url: page.url, text: page.text.slice(0, JOB_TEXT_MAX_CHARS) },
    info: { company, title, url: page.url, applyUrl: page.url },
  };
}
