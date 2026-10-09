import Link from "next/link";
import { fetchAllJobs } from "@/lib/jobs/sources";

// Dashboard teaser: the first few jobs that match the titles on the resume.
// No AI here (that costs money and runs on /jobs). Just the plain keyword
// filter from the job feed. Rendered inside <Suspense> because the first feed
// load can take ~10s; the rest of the dashboard shows right away.
export default async function ShellTopJobs({
  titles,
  location,
}: {
  titles: string[];
  location: string;
}) {
  const query = titles.slice(0, 3).join(", ");
  let jobs: Awaited<ReturnType<typeof fetchAllJobs>>["jobs"] = [];
  try {
    const res = await fetchAllJobs({ query, location, limit: 3 });
    jobs = res.jobs;
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
        No close matches for {query || "your titles"} right now.{" "}
        <Link href="/jobs" className="font-medium text-brand hover:underline">
          Search with other words
        </Link>
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li key={j.id} className="text-sm">
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
        </li>
      ))}
    </ul>
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
