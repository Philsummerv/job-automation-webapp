import { parseJobId } from "@/lib/jobs/lookup";

// Where the application form for a feed job lives. Only Greenhouse, Lever and
// Ashby: their forms need no account, look the same at every company, and the
// URL is built from the job id, never from user input, so this can't be
// pointed at an arbitrary site.

const SUPPORTED = new Set(["greenhouse", "lever", "ashby"]);

export function canAutoApply(jobId: string): boolean {
  const p = parseJobId(jobId);
  return !!p && SUPPORTED.has(p.source);
}

export function applicationUrl(jobId: string): string | null {
  const p = parseJobId(jobId);
  if (!p) return null;
  const slug = encodeURIComponent(p.slug);
  const id = encodeURIComponent(p.nativeId);
  switch (p.source) {
    case "greenhouse":
      // The embed form: the plain job URL often redirects to the company's own
      // careers page with the form inside an iframe.
      return `https://job-boards.greenhouse.io/embed/job_app?for=${slug}&token=${id}`;
    case "lever":
      return `https://jobs.lever.co/${slug}/${id}/apply`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}/${id}/application`;
    default:
      return null;
  }
}
