import Link from "next/link";
import type { AnswerTemplate, JobPosting } from "@jobassistui/shared";
import { fetchAllJobs } from "@/lib/jobs/sources";
import { pickTodaysJobs, queueHref, todaysSearch } from "@/lib/autoapply/daily";

// Home: "Today's jobs". When Apply for me is available, it lines up `count`
// jobs it can fill (see lib/autoapply/daily.ts) with one button to work
// through them; the person presses Submit on each. Otherwise (or with the
// count set to 0) it shows the first few jobs that match the resume titles.
// No AI here (that costs money and runs on /jobs). Rendered inside <Suspense>
// because a job search can take a few seconds; the rest of Home shows first.
export default async function ShellTopJobs({
  titles,
  location,
  template,
  count,
  canAutoApply,
  appliedUrls,
}: {
  titles: string[];
  location: string;
  template: AnswerTemplate | null;
  /** Jobs to line up today. 0 = the setting is off. */
  count: number;
  /** Apply for me is turned on for this person (paid or free period, and configured). */
  canAutoApply: boolean;
  appliedUrls: string[];
}) {
  const search = todaysSearch(template, titles, location);
  const lineUp = canAutoApply && count > 0;

  let jobs: JobPosting[] = [];
  try {
    jobs = lineUp
      ? await pickTodaysJobs({ template, titles, location, count, appliedUrls })
      : (await fetchAllJobs({ query: search.query, location: search.location, limit: 3 })).jobs;
  } catch {
    return (
      <p className="text-sm text-slate-500">
        Couldn&apos;t load jobs right now.{" "}
        <Link href="/jobs" className="font-medium text-brand hover:underline">
          Try the Jobs page
        </Link>
      </p>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {lineUp
          ? `No new jobs we can fill in for ${search.query || "your titles"} today.`
          : `No close matches for ${search.query || "your titles"} right now.`}{" "}
        <Link href="/jobs" className="font-medium text-brand hover:underline">
          Search with other words
        </Link>
      </p>
    );
  }

  const ids = jobs.map((j) => j.id);

  return (
    <div>
      {lineUp && (
        <p className="mb-3 text-sm text-slate-700">
          {jobs.length === 1 ? "1 job" : `${jobs.length} jobs`} we can fill in for you today. We
          fill each form; you check it and press Submit.
        </p>
      )}
      <ul className="space-y-2">
        {jobs.map((j, i) => (
          <li key={j.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <Link
                href={`/apply?job=${encodeURIComponent(j.id)}${/^https?:\/\//i.test(j.url) ? `&url=${encodeURIComponent(j.url)}` : ""}`}
                className="font-medium text-slate-900 hover:text-brand hover:underline"
              >
                {j.title}
              </Link>
              <div className="text-xs text-slate-500">
                {j.company}
                {j.location ? ` · ${j.location}` : ""}
              </div>
            </div>
            {lineUp && (
              <Link
                href={queueHref(ids, i, false)}
                className="shrink-0 text-xs font-medium text-brand hover:underline"
              >
                Apply for me
              </Link>
            )}
          </li>
        ))}
      </ul>
      {lineUp && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={queueHref(ids, 0, true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
          >
            {jobs.length === 1 ? "Start" : `Start: ${jobs.length} jobs, one at a time`}
          </Link>
          <Link href="/template" className="text-xs text-slate-600 hover:underline">
            Change how many
          </Link>
        </div>
      )}
    </div>
  );
}

export function ShellTopJobsLoading() {
  return (
    <div className="space-y-2" aria-label="Loading jobs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}
