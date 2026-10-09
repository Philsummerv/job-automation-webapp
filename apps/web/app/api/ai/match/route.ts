import { NextResponse } from "next/server";
import type { JobMatch, JobPosting, ResumeProfile } from "@jobassistui/shared";
import { requireAiAccess } from "@/lib/ai/guard";
import { aiErrorMessage } from "@/lib/ai/client";
import {
  AiLimitError,
  MIGRATION_NEEDED_MESSAGE,
  MigrationMissingError,
  checkAndRecordUsage,
  isMissingTableError,
} from "@/lib/ai/usage";
import { fetchAllJobs } from "@/lib/jobs/sources";
import { getJobById } from "@/lib/jobs/lookup";
import {
  AI_MATCH_LIMIT,
  getCachedMatches,
  matchCacheKey,
  prefilterJobs,
  scoreJobsWithAi,
  setCachedMatches,
} from "@/lib/jobs/match";

// POST /api/ai/match
// Body: { query?: string, location?: string, remoteOnly?: boolean, jobIds?: string[] }
// Returns: { matches: JobMatch[], cached: boolean, remaining?: number }
//
// Scores up to 15 jobs against the user's saved resume in ONE fast-model call.
// The job text never comes from the browser: the server re-runs the same feed
// search (cached for an hour) and only scores jobs it found itself. jobIds,
// when given, picks which of those jobs to score (the ones the page shows on
// top); ids the server can't find are skipped.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const access = await requireAiAccess();
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, code: access.code },
      { status: access.status },
    );
  }
  const { user, supabase } = access;

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 20_000) {
      return NextResponse.json({ error: "Request too large." }, { status: 413 });
    }
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const query = str(body.query, 200);
  const location = str(body.location, 100);
  const remoteOnly = body.remoteOnly === true;
  const wantedIds = Array.isArray(body.jobIds)
    ? body.jobIds
        .filter((x): x is string => typeof x === "string" && x.length <= 300)
        .slice(0, AI_MATCH_LIMIT)
    : [];

  // The saved resume.
  const { data: row, error: rowError } = await supabase
    .from("resume_profiles")
    .select("profile, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowError) {
    if (isMissingTableError(rowError)) {
      return NextResponse.json(
        { error: MIGRATION_NEEDED_MESSAGE, code: "migration_missing" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Couldn't load your resume." }, { status: 500 });
  }
  const profile = (row?.profile ?? null) as ResumeProfile | null;
  if (!profile) {
    return NextResponse.json(
      { error: "Add your resume first to get match scores.", code: "no_resume" },
      { status: 409 },
    );
  }

  // The jobs to score, found by the server itself.
  const { jobs } = await fetchAllJobs({ query, location, remoteOnly });
  let batch: JobPosting[];
  if (wantedIds.length > 0) {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const found = await Promise.all(
      wantedIds.map(async (id) => byId.get(id) ?? (await getJobById(id))),
    );
    batch = found.filter((j): j is JobPosting => !!j);
  } else {
    batch = prefilterJobs(jobs, profile)
      .slice(0, AI_MATCH_LIMIT)
      .map((p) => p.job);
  }
  if (batch.length === 0) {
    return NextResponse.json({ matches: [] as JobMatch[], cached: false });
  }

  const key = matchCacheKey({
    userId: user.id,
    resumeVersion: String(row?.updated_at ?? ""),
    query,
    location,
    remoteOnly,
    jobIds: batch.map((j) => j.id),
  });
  const hit = getCachedMatches(key);
  if (hit) return NextResponse.json({ matches: hit, cached: true });

  try {
    const { remaining } = await checkAndRecordUsage(supabase, user.id, "job_match");
    const matches = await scoreJobsWithAi(profile, batch);
    setCachedMatches(key, matches);
    return NextResponse.json({ matches, cached: false, remaining });
  } catch (err) {
    if (err instanceof MigrationMissingError) {
      return NextResponse.json(
        { error: err.message, code: "migration_missing" },
        { status: 503 },
      );
    }
    if (err instanceof AiLimitError) {
      return NextResponse.json({ error: err.message, code: "limit" }, { status: 429 });
    }
    console.error("[ai/match]", err);
    return NextResponse.json({ error: aiErrorMessage(err), code: "ai_error" }, { status: 502 });
  }
}
