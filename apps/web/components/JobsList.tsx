"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AI_DAILY_LIMIT } from "@jobassistui/shared";
import type { JobMatch, JobPosting } from "@jobassistui/shared";
import JobsCard from "@/components/JobsCard";

/** What the page knows about AI scoring before the client asks. */
export type JobsAiState =
  | "ready"
  | "no_resume"
  | "not_configured"
  | "not_entitled"
  | "migration_missing";

/** sessionStorage key the batch page reads its job list from. */
export const BATCH_STORAGE_KEY = "jobassistui:batch";
/** Most apply kits one batch can make. */
export const BATCH_MAX = 10;

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
  stillNeeded,
}: {
  jobs: JobsCardData[];
  /** The ids to send for AI scoring (the top of the list, at most 15). */
  scoreIds: string[];
  aiState: JobsAiState;
  query: string;
  location: string;
  remoteOnly: boolean;
  /** Activities still needed this week; the batch size starts here. */
  stillNeeded: number;
}) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState(
    Math.min(BATCH_MAX, Math.max(1, stillNeeded || 3)),
  );
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

  const batchMax = Math.min(BATCH_MAX, ordered.length);
  const batchReady = aiState === "ready" && status.kind !== "loading" && batchMax > 0;

  function startBatch() {
    const n = Math.min(batchSize, batchMax);
    const picked = ordered.slice(0, n).map((j) => ({
      id: j.id,
      company: j.company,
      title: j.title,
      location: j.location,
      url: j.url,
      score: matchById.get(j.id)?.score ?? null,
    }));
    try {
      sessionStorage.setItem(
        BATCH_STORAGE_KEY,
        JSON.stringify({ createdAt: Date.now(), jobs: picked }),
      );
    } catch {
      /* storage blocked: the batch page will say there's nothing queued */
    }
    router.push("/apply/batch");
  }

  return (
    <div className="space-y-3">
      {aiState === "ready" && batchMax > 0 && (
        <div className="border-[1.5px] border-brand bg-paper-field p-4">
          <span className="form-label">Batch apply kits</span>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor="batch-size">Make apply kits for the top</label>
            <select
              id="batch-size"
              value={Math.min(batchSize, batchMax)}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="border-[1.5px] border-brand bg-paper px-2 py-1 font-mono"
            >
              {Array.from({ length: batchMax }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>{batchSize === 1 ? "job" : "jobs"}</span>
            <button
              type="button"
              onClick={startBatch}
              disabled={!batchReady}
              className="bg-brand px-4 py-2 font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark disabled:opacity-50"
            >
              {status.kind === "loading" ? "Scoring jobs…" : "Make kits"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {stillNeeded > 0
              ? `You need ${stillNeeded} more ${stillNeeded === 1 ? "activity" : "activities"} this week. `
              : "You've met this week's target. "}
            Each kit uses 1 of your {AI_DAILY_LIMIT} daily AI requests. You still read
            each kit and apply on the company&apos;s site yourself.
          </p>
        </div>
      )}

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
