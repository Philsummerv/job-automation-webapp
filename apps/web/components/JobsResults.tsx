import Link from "next/link";
import type { ResumeProfile } from "@jobassistui/shared";
import { fetchAllJobs } from "@/lib/jobs/sources";
import { AI_MATCH_LIMIT, prefilterJobs } from "@/lib/jobs/match";
import JobsList, { type JobsAiState, type JobsCardData } from "@/components/JobsList";

/** How many jobs the page lists. The AI scores only the top AI_MATCH_LIMIT. */
const SHOW_MAX = 50;

// Server component: fetches the feed, ranks it against the resume without AI,
// and hands a slim list to the client, which then asks /api/ai/match for
// scores on the top jobs.
export default async function JobsResults({
  query,
  location,
  remoteOnly,
  resume,
  aiState,
  stillNeeded,
}: {
  query: string;
  location: string;
  remoteOnly: boolean;
  resume: ResumeProfile | null;
  aiState: JobsAiState;
  stillNeeded: number;
}) {
  const { jobs, sources } = await fetchAllJobs({ query, location, remoteOnly });
  const ranked = prefilterJobs(jobs, resume);
  const shown: JobsCardData[] = ranked.slice(0, SHOW_MAX).map(({ job }) => ({
    id: job.id,
    source: job.source,
    company: job.company,
    title: job.title,
    location: job.location,
    remote: job.remote,
    url: job.url,
    applyUrl: job.applyUrl,
    postedAt: job.postedAt,
  }));

  const failed = sources.filter((s) => !s.ok).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
        <span>
          {jobs.length === 0
            ? "No jobs found."
            : jobs.length > SHOW_MAX
              ? `Showing the best ${SHOW_MAX} of ${jobs.length} jobs.`
              : `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} found.`}
        </span>
        {failed > 0 && (
          <span className="text-xs text-slate-500">
            {failed} of {sources.length} job boards didn&apos;t answer. Try again later
            for more results.
          </span>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="border-[1.5px] border-brand bg-paper-field px-4 py-6 text-sm text-slate-600">
          Nothing matched. Try fewer words, a broader title, or leave the location
          blank. You can also{" "}
          <Link href="/apply" className="font-medium text-brand underline">
            paste a job you found somewhere else
          </Link>
          .
        </div>
      ) : (
        <JobsList
          jobs={shown}
          scoreIds={shown.slice(0, AI_MATCH_LIMIT).map((j) => j.id)}
          aiState={aiState}
          query={query}
          location={location}
          remoteOnly={remoteOnly}
          stillNeeded={stillNeeded}
        />
      )}
    </div>
  );
}
