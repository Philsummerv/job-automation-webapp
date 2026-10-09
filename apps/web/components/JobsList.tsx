"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { JobMatch, JobPosting } from "@jobassistui/shared";
import JobsCard from "@/components/JobsCard";

/** What the page knows about AI scoring before the client asks. */
export type JobsAiState =
  | "ready"
  | "no_resume"
  | "not_configured"
  | "not_entitled"
  | "migration_missing";

/** A job without its long description (keeps the page payload small). */
export type JobsCardData = Omit<JobPosting, "descriptionText">;

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; matches: JobMatch[] }
  | { kind: "error"; message: string };

export default function JobsList({
  jobs,
  scoreIds,
  aiState,
  query,
  location,
  remoteOnly,
}: {
  jobs: JobsCardData[];
  /** The ids to send for AI scoring (the top of the list, at most 15). */
  scoreIds: string[];
  aiState: JobsAiState;
  query: string;
  location: string;
  remoteOnly: boolean;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const idsKey = scoreIds.join(",");

  useEffect(() => {
    if (aiState !== "ready" || scoreIds.length === 0) return;
    const ctrl = new AbortController();
    setStatus({ kind: "loading" });
    fetch("/api/ai/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, location, remoteOnly, jobIds: scoreIds }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          matches?: JobMatch[];
          error?: string;
        };
        if (!res.ok) {
          setStatus({
            kind: "error",
            message: data.error || "Couldn't get match scores. Try again later.",
          });
          return;
        }
        setStatus({ kind: "done", matches: data.matches ?? [] });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus({ kind: "error", message: "Couldn't reach the server. Try again." });
      });
    return () => ctrl.abort();
    // idsKey stands in for scoreIds (a new array each render).
  }, [aiState, idsKey, query, location, remoteOnly]);

  const matchById = useMemo(() => {
    const m = new Map<string, JobMatch>();
    if (status.kind === "done") for (const x of status.matches) m.set(x.jobId, x);
    return m;
  }, [status]);

  // Scored jobs go first, best score first; the rest keep their order.
  const ordered = useMemo(() => {
    if (matchById.size === 0) return jobs;
    const scored = jobs.filter((j) => matchById.has(j.id));
    const rest = jobs.filter((j) => !matchById.has(j.id));
    scored.sort((a, b) => matchById.get(b.id)!.score - matchById.get(a.id)!.score);
    return [...scored, ...rest];
  }, [jobs, matchById]);

  return (
    <div className="space-y-3">
      {status.kind === "loading" && (
        <p className="text-sm text-slate-500" aria-live="polite">
          Checking how well the top {scoreIds.length} jobs fit your resume...
        </p>
      )}
      {status.kind === "error" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {status.message} The jobs below are still sorted by your resume keywords.
        </p>
      )}
      {status.kind === "done" && status.matches.length > 0 && (
        <p className="text-xs text-slate-500">
          Scores are a rough guide from AI, based on your{" "}
          <Link href="/resume" className="underline">
            saved resume
          </Link>
          . Read the posting before you apply.
        </p>
      )}

      <ul className="space-y-3">
        {ordered.map((job) => (
          <li key={job.id}>
            <JobsCard
              job={job}
              match={matchById.get(job.id) ?? null}
              scoring={status.kind === "loading" && scoreIds.includes(job.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
