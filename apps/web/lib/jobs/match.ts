import type { JobMatch, JobPosting, ResumeProfile } from "@jobassistui/shared";
import {
  FAST_MODEL,
  UNTRUSTED_DATA_RULE,
  callJson,
  wrapUntrusted,
  type JsonSchema,
} from "@/lib/ai/client";

// Matching jobs to a resume, in two steps:
//  1. prefilterJobs: cheap, deterministic, no AI. Ranks the feed by how many
//     resume titles and skills show up in each posting.
//  2. scoreJobsWithAi: ONE batched call to the fast model for the top N
//     (N <= 15), returning a 0-100 score and a one-line reason per job.
//
// Server-only (imports the AI client).

/** Most jobs we ever send to the AI in one call. */
export const AI_MATCH_LIMIT = 15;
/** Per-job description cap inside the scoring prompt. Keeps the call cheap. */
const JOB_TEXT_CHARS = 1200;

const STOP = new Set([
  "and", "or", "the", "a", "an", "of", "in", "for", "to", "with", "at", "on",
  "i", "ii", "iii", "iv", "sr", "jr", "senior", "junior", "lead", "level",
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface PrefilteredJob {
  job: JobPosting;
  /** Higher is better. Only meaningful relative to other jobs in the same list. */
  prefilterScore: number;
}

/**
 * Ranks jobs against the resume without AI. With no profile (or an empty one)
 * the feed order is kept. Stable: ties keep the feed's order (which already
 * puts title matches, local jobs and newer jobs first).
 */
export function prefilterJobs(
  jobs: JobPosting[],
  profile: ResumeProfile | null,
): PrefilteredJob[] {
  const titleWords = new Set(
    (profile?.titles ?? []).slice(0, 8).flatMap((t) => words(t)),
  );
  for (const w of profile?.workHistory?.slice(0, 5) ?? []) {
    for (const t of words(w.title)) titleWords.add(t);
  }
  const skills = (profile?.skills ?? [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 1)
    .slice(0, 40);

  if (titleWords.size === 0 && skills.length === 0) {
    return jobs.map((job) => ({ job, prefilterScore: 0 }));
  }

  const scored = jobs.map((job, index) => {
    const jobTitle = new Set(words(job.title));
    let score = 0;
    for (const w of titleWords) if (jobTitle.has(w)) score += 3;

    const body = ` ${job.title} ${job.descriptionText.slice(0, 4000)} `.toLowerCase();
    let skillHits = 0;
    for (const s of skills) {
      // Whole-word-ish match so "go" doesn't hit "good".
      const re = new RegExp(`[^a-z0-9]${escapeRe(s)}[^a-z0-9]`);
      if (re.test(body)) skillHits++;
      if (skillHits >= 10) break;
    }
    score += skillHits;
    return { job, prefilterScore: score, index };
  });

  scored.sort((a, b) => b.prefilterScore - a.prefilterScore || a.index - b.index);
  return scored.map(({ job, prefilterScore }) => ({ job, prefilterScore }));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A short version of the profile for the scoring prompt. Facts only. */
function compactProfile(p: ResumeProfile): string {
  const lines: string[] = [];
  if (p.headline) lines.push(`Headline: ${p.headline}`);
  if (p.titles.length) lines.push(`Titles: ${p.titles.slice(0, 8).join("; ")}`);
  if (p.yearsExperience != null) lines.push(`Years of experience: ${p.yearsExperience}`);
  if (p.locations.length) lines.push(`Locations: ${p.locations.slice(0, 4).join("; ")}`);
  if (p.skills.length) lines.push(`Skills: ${p.skills.slice(0, 40).join(", ")}`);
  if (p.certifications.length)
    lines.push(`Certifications: ${p.certifications.slice(0, 10).join(", ")}`);
  for (const w of p.workHistory.slice(0, 5)) {
    lines.push(`Job: ${w.title} at ${w.employer} (${w.dates})`);
    for (const b of w.bullets.slice(0, 3)) lines.push(`  - ${b.slice(0, 200)}`);
  }
  for (const e of p.education.slice(0, 3)) {
    lines.push(`Education: ${e.credential}, ${e.school}`);
  }
  return lines.join("\n").slice(0, 6000);
}

const MATCH_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "score", "reason", "summary"],
        properties: {
          ref: { type: "string", description: "The job's ref, e.g. J3." },
          score: {
            type: "integer",
            description: "0 to 100. How well this person fits this job.",
          },
          reason: {
            type: "string",
            description: "One short plain sentence, under 20 words.",
          },
          summary: {
            type: "string",
            description:
              "2-3 short plain sentences about the job itself: what the work is, pay and hours if the posting gives them, and the main must-have. Under 60 words.",
          },
        },
      },
    },
  },
};

const MATCH_SYSTEM = [
  "You score how well one job seeker fits each job in a list.",
  "Score 0-100: 80+ strong fit (has the main experience asked for), 50-79 partial fit, under 50 weak fit.",
  "Judge only from what the resume shows. Do not assume skills it does not list.",
  "For each job write one short, plain sentence (under 20 words) saying the main reason. Use everyday words. No hype.",
  "Also write a summary of the job itself in 2-3 short sentences (under 60 words): what the work is, the pay and hours if the posting says them, and the main must-have. Only state what the posting says; never guess pay.",
  "Return one entry per job, using the job's ref exactly as given.",
  UNTRUSTED_DATA_RULE,
].join("\n");

/**
 * One batched AI call that scores up to AI_MATCH_LIMIT jobs. Throws whatever
 * callJson throws (AiNotConfiguredError, AiOutputError, SDK errors). Jobs the
 * model skipped are left out of the result.
 */
export async function scoreJobsWithAi(
  profile: ResumeProfile,
  jobs: JobPosting[],
): Promise<JobMatch[]> {
  const batch = jobs.slice(0, AI_MATCH_LIMIT);
  if (batch.length === 0) return [];

  const refs = new Map<string, string>();
  const jobBlocks = batch.map((job, i) => {
    const ref = `J${i + 1}`;
    refs.set(ref, job.id);
    const text = [
      `Title: ${job.title}`,
      `Company: ${job.company}`,
      `Location: ${job.location || "not given"}${job.remote ? " (remote)" : ""}`,
      "",
      job.descriptionText.slice(0, JOB_TEXT_CHARS),
    ].join("\n");
    return `Job ref ${ref}:\n${wrapUntrusted("job_posting", text)}`;
  });

  const user = [
    "The job seeker's resume, summarized:",
    wrapUntrusted("resume", compactProfile(profile)),
    "",
    `Score these ${batch.length} jobs:`,
    "",
    jobBlocks.join("\n\n"),
  ].join("\n");

  const out = await callJson<{
    matches: { ref: string; score: number; reason: string; summary?: string }[];
  }>({
    model: FAST_MODEL,
    system: MATCH_SYSTEM,
    user,
    schema: MATCH_SCHEMA,
    maxTokens: 5000,
  });

  const seen = new Set<string>();
  const matches: JobMatch[] = [];
  for (const m of out.matches ?? []) {
    const jobId = refs.get(String(m.ref).trim().toUpperCase());
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);
    const score = Math.round(Number(m.score));
    matches.push({
      jobId,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      reason: String(m.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      summary: String(m.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || undefined,
    });
  }
  return matches;
}

// ─── Per-user result cache ──────────────────────────────────────────────────
// Same user + same resume version + same search + same jobs = same scores.
// Lets a page reload reuse the scores without spending another AI call.
// In memory only; empty after a cold start, which is fine.

const MATCH_CACHE_TTL_MS = 60 * 60 * 1000;
const MATCH_CACHE_MAX = 500;
const matchCache = new Map<string, { at: number; matches: JobMatch[] }>();

export function matchCacheKey(parts: {
  userId: string;
  resumeVersion: string;
  query: string;
  location: string;
  remoteOnly: boolean;
  jobIds: string[];
}): string {
  return [
    parts.userId,
    parts.resumeVersion,
    parts.query.trim().toLowerCase(),
    parts.location.trim().toLowerCase(),
    parts.remoteOnly ? "r" : "",
    [...parts.jobIds].sort().join(","),
  ].join("|");
}

export function getCachedMatches(key: string): JobMatch[] | null {
  const hit = matchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MATCH_CACHE_TTL_MS) {
    matchCache.delete(key);
    return null;
  }
  return hit.matches;
}

export function setCachedMatches(key: string, matches: JobMatch[]): void {
  if (matchCache.size >= MATCH_CACHE_MAX) {
    const oldest = matchCache.keys().next().value;
    if (oldest !== undefined) matchCache.delete(oldest);
  }
  matchCache.set(key, { at: Date.now(), matches });
}
