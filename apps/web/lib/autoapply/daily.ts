import type { AnswerTemplate, JobPosting } from "@jobassistui/shared";
import { fetchAllJobs } from "@/lib/jobs/sources";
import { canAutoApply } from "./targets";

// "Today's jobs" on Home: a short list of jobs Apply for me can fill, picked
// from the person's resume titles (or their saved search). The person works
// through them one at a time and presses Submit on each. Nothing is sent
// without them.
//
// No table: the list is worked out on each visit. Jobs already in the
// activity log drop off, and the job index changes daily, so the list moves on.

export const DEFAULT_DAILY_APPLY_COUNT = 3;
/** Same as the daily Apply for me limit in /api/autoapply/start. */
export const MAX_DAILY_APPLY_COUNT = 10;

/** How many jobs to line up. 0 = turned off. */
export function dailyApplyCount(template: AnswerTemplate | null | undefined): number {
  const raw = template?.config?.dailyApplyCount?.trim() ?? "";
  if (!raw) return DEFAULT_DAILY_APPLY_COUNT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_APPLY_COUNT;
  return Math.min(n, MAX_DAILY_APPLY_COUNT);
}

/** The person's own "skip titles" pattern. A bad pattern is ignored. */
function skipPattern(template: AnswerTemplate | null | undefined): RegExp | null {
  const raw = template?.config?.exclusionTitleRegex?.trim();
  if (!raw) return null;
  try {
    return new RegExp(raw.slice(0, 200), "i");
  } catch {
    return null;
  }
}

export function todaysSearch(
  template: AnswerTemplate | null | undefined,
  titles: string[],
  location: string,
): { query: string; location: string } {
  const cfg = template?.config ?? {};
  return {
    query: cfg.searchQuery?.trim() || titles.slice(0, 3).join(", "),
    location: cfg.searchLocation?.trim() || location,
  };
}

/**
 * Up to `count` jobs Apply for me can fill, best match first, leaving out
 * jobs whose link is already in the activity log.
 */
export async function pickTodaysJobs(opts: {
  template: AnswerTemplate | null | undefined;
  titles: string[];
  location: string;
  count: number;
  appliedUrls: Iterable<string>;
}): Promise<JobPosting[]> {
  if (opts.count <= 0) return [];
  const { query, location } = todaysSearch(opts.template, opts.titles, opts.location);
  if (!query) return [];
  const applied = new Set(opts.appliedUrls);
  const skip = skipPattern(opts.template);
  const { jobs } = await fetchAllJobs({ query, location, limit: 200 });
  const out: JobPosting[] = [];
  const seen = new Set<string>();
  for (const j of jobs) {
    if (!canAutoApply(j.id) || applied.has(j.url)) continue;
    if (skip && skip.test(j.title)) continue;
    // One per company and title: boards often list the same job in many cities.
    const key = `${j.company}|${j.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
    if (out.length >= opts.count) break;
  }
  return out;
}

/** Link that starts the run at `index` and carries the rest of the list. */
export function queueHref(ids: string[], index: number, autoStart: boolean): string {
  const job = ids[index];
  const q = ids.map(encodeURIComponent).join(",");
  return `/apply/auto?job=${encodeURIComponent(job)}&queue=${q}${autoStart ? "&go=1" : ""}`;
}
