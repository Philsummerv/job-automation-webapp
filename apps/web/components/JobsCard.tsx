import Link from "next/link";
import type { JobMatch, JobSource } from "@jobassistui/shared";
import type { JobsCardData } from "@/components/JobsList";

const SOURCE_LABEL: Record<JobSource, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  arbeitnow: "Arbeitnow",
  usajobs: "USAJOBS",
  adzuna: "Adzuna",
  url: "Link",
  pasted: "Pasted",
};

function postedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Posted ${months} ${months === 1 ? "month" : "months"} ago`;
  return "Posted over a year ago";
}

function scoreClass(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function scoreWord(score: number): string {
  if (score >= 80) return "Strong fit";
  if (score >= 50) return "Partial fit";
  return "Weak fit";
}

/** Only http(s) links are rendered as links. Feed URLs come from job boards. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default function JobsCard({
  job,
  match,
  scoring,
}: {
  job: JobsCardData;
  match: JobMatch | null;
  scoring: boolean;
}) {
  const posted = postedLabel(job.postedAt);
  const openHref = safeHref(job.applyUrl) ?? safeHref(job.url);
  const where = [job.location, job.remote && !/remote/i.test(job.location) ? "Remote" : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{job.title}</h2>
          <p className="mt-0.5 text-sm text-slate-700">{job.company}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {where && <span>{where}</span>}
            {posted && <span>{posted}</span>}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {SOURCE_LABEL[job.source] ?? job.source}
            </span>
          </p>
        </div>
        {match ? (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreClass(match.score)}`}
            title={scoreWord(match.score)}
          >
            {match.score} · {scoreWord(match.score)}
          </span>
        ) : scoring ? (
          <span className="shrink-0 animate-pulse rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-400">
            Scoring...
          </span>
        ) : null}
      </div>

      {match?.reason && <p className="mt-2 text-sm text-slate-700">{match.reason}</p>}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/apply?job=${encodeURIComponent(job.id)}${/^https?:\/\//i.test(job.url) ? `&url=${encodeURIComponent(job.url)}` : ""}`}
          className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:opacity-90"
        >
          Build apply kit
        </Link>
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            Open job
          </a>
        )}
      </div>
    </div>
  );
}
