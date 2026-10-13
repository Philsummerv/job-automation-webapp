"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ApplyKit } from "@jobassistui/shared";
import { BATCH_STORAGE_KEY } from "@/components/JobsList";
import { ApplyKitView, type ApplyResumeBasics, type JobInfo } from "../ApplyKitBuilder";

interface QueuedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  score: number | null;
}

type ItemState =
  | { kind: "waiting" }
  | { kind: "making" }
  | { kind: "ready"; kit: ApplyKit; job: JobInfo }
  | { kind: "logged"; kit: ApplyKit; job: JobInfo }
  | { kind: "failed"; error: string }
  | { kind: "skipped"; error: string };

interface Stored {
  createdAt: number;
  jobs: QueuedJob[];
  /** Finished results by job id, so a reload doesn't pay for the kits again. */
  results?: Record<string, ItemState>;
}

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(BATCH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return Array.isArray(s?.jobs) && s.jobs.length > 0 ? s : null;
  } catch {
    return null;
  }
}

function writeResults(results: Record<string, ItemState>) {
  try {
    const s = readStored();
    if (!s) return;
    // Only keep finished states; "making" turns back into "waiting" on reload.
    const keep: Record<string, ItemState> = {};
    for (const [id, st] of Object.entries(results)) {
      if (st.kind === "ready" || st.kind === "logged" || st.kind === "failed") keep[id] = st;
    }
    sessionStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify({ ...s, results: keep }));
  } catch {
    /* ignore */
  }
}

const STATUS_LABEL: Record<ItemState["kind"], string> = {
  waiting: "Waiting",
  making: "Making…",
  ready: "Open kit",
  logged: "Logged",
  failed: "Failed",
  skipped: "Skipped",
};

export default function BatchBuilder({ basics }: { basics: ApplyResumeBasics }) {
  const [jobs, setJobs] = useState<QueuedJob[] | null>(null);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Guards against React running the effect twice in development.
  const started = useRef(false);

  // Load the queue once.
  useEffect(() => {
    const s = readStored();
    if (!s) {
      setJobs([]);
      return;
    }
    setJobs(s.jobs);
    const init: Record<string, ItemState> = {};
    for (const j of s.jobs) init[j.id] = s.results?.[j.id] ?? { kind: "waiting" };
    setStates(init);
    const firstReady = s.jobs.find((j) => s.results?.[j.id]?.kind === "ready");
    if (firstReady) setOpen(firstReady.id);
  }, []);

  // Work through the queue one job at a time. Sequential on purpose: each
  // kit is a long AI call, and the daily cap is checked per kit.
  useEffect(() => {
    if (!jobs || jobs.length === 0 || started.current) return;
    started.current = true;

    (async () => {
      const saved = readStored()?.results ?? {};
      const current: Record<string, ItemState> = {};
      for (const j of jobs) current[j.id] = saved[j.id] ?? { kind: "waiting" };

      let stop: string | null = null;
      for (const j of jobs) {
        if (current[j.id].kind !== "waiting") continue;
        if (stop) {
          current[j.id] = { kind: "skipped", error: stop };
          setStates((prev) => ({ ...prev, [j.id]: current[j.id] }));
          continue;
        }
        current[j.id] = { kind: "making" };
        setStates((prev) => ({ ...prev, [j.id]: current[j.id] }));
        try {
          const res = await fetch("/api/ai/apply-kit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "job", jobId: j.id, fallbackUrl: j.url }),
          });
          const data = (await res.json().catch(() => null)) as
            | { ok: true; kit: ApplyKit; job: JobInfo; remaining: number }
            | { ok: false; error: string; code?: string }
            | null;
          if (data?.ok) {
            current[j.id] = { kind: "ready", kit: data.kit, job: data.job };
            setRemaining(data.remaining);
            setOpen((o) => o ?? j.id);
          } else {
            const msg = data?.error ?? "Something went wrong with this one.";
            current[j.id] = { kind: "failed", error: msg };
            // Out of AI requests, or no resume: the rest would fail the same way.
            if (data && (data.code === "limit" || data.code === "no_resume")) stop = msg;
          }
        } catch {
          current[j.id] = { kind: "failed", error: "Couldn't reach the server." };
        }
        // Merge, so a kit the user logged meanwhile stays logged.
        setStates((prev) => {
          const next = { ...prev, [j.id]: current[j.id] };
          writeResults(next);
          return next;
        });
      }
    })();
  }, [jobs]);

  function markLogged(id: string) {
    setStates((prev) => {
      const st = prev[id];
      if (st?.kind !== "ready") return prev;
      const next: Record<string, ItemState> = {
        ...prev,
        [id]: { kind: "logged", kit: st.kit, job: st.job },
      };
      writeResults(next);
      // Jump to the next kit that's ready and not logged yet.
      setOpen(jobs?.find((j) => next[j.id]?.kind === "ready")?.id ?? null);
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (jobs === null) {
    return <p className="mt-6 text-sm text-slate-600">Loading your batch…</p>;
  }
  if (jobs.length === 0) {
    return (
      <p className="mt-6 border-[1.5px] border-brand bg-paper-field px-4 py-3 text-sm">
        There&apos;s no batch waiting.{" "}
        <Link href="/jobs" className="font-medium underline">
          Pick jobs on the Jobs page
        </Link>{" "}
        and press Make kits.
      </p>
    );
  }

  const isDone = (k?: ItemState["kind"]) => k === "ready" || k === "logged";
  const done = jobs.filter((j) => isDone(states[j.id]?.kind)).length;
  const logged = jobs.filter((j) => states[j.id]?.kind === "logged").length;
  const openState = open ? states[open] : null;
  const openKit =
    openState && (openState.kind === "ready" || openState.kind === "logged") ? openState : null;
  const allFinished = jobs.every((j) => {
    const k = states[j.id]?.kind;
    return k !== "waiting" && k !== "making";
  });

  return (
    <div className="mt-6 space-y-6">
      <div className="border-[1.5px] border-brand bg-paper-field">
        <div className="grid grid-cols-3 border-b-[1.5px] border-brand">
          {(
            [
              ["Jobs", jobs.length],
              ["Kits ready", done],
              ["Logged", logged],
            ] as const
          ).map(([label, n], i) => (
            <div key={label} className={`px-3 pt-2 ${i > 0 ? "border-l-[1.5px] border-brand" : ""}`}>
              <span className="form-label">{label}</span>
              <p className="pb-2 font-mono text-sm">{n}</p>
            </div>
          ))}
        </div>
        <ol className="divide-y divide-paper-line">
          {jobs.map((j, i) => {
            const st = states[j.id] ?? { kind: "waiting" as const };
            const clickable = isDone(st.kind);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => setOpen(j.id)}
                  className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left text-sm ${
                    open === j.id ? "bg-paper" : clickable ? "hover:bg-paper" : ""
                  }`}
                >
                  <span className="font-mono text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{j.title}</span>
                    <span className="block truncate text-xs text-slate-600">
                      {j.company}
                      {j.score !== null && ` · ${j.score}% match`}
                    </span>
                    {(st.kind === "failed" || st.kind === "skipped") && (
                      <span className="block text-xs text-stamp">{st.error}</span>
                    )}
                  </span>
                  {st.kind === "logged" ? (
                    <span className="stamp text-xs">Logged</span>
                  ) : (
                    <span
                      className={`font-mono text-xs uppercase ${
                        st.kind === "ready"
                          ? "font-semibold text-brand underline"
                          : st.kind === "failed" || st.kind === "skipped"
                            ? "text-stamp"
                            : "text-slate-500"
                      }`}
                    >
                      {STATUS_LABEL[st.kind]}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {openKit && open ? (
        <>
          {openState?.kind === "logged" && (
            <p className="text-sm text-slate-600">This one is already in your log.</p>
          )}
          <ApplyKitView
            key={open}
            kit={openKit.kit}
            job={openKit.job}
            basics={basics}
            remaining={remaining}
            stay
            alreadyLogged={openState?.kind === "logged"}
            onLogged={() => markLogged(open)}
          />
        </>
      ) : done === 0 && !allFinished ? (
        <p className="text-sm text-slate-600" aria-live="polite">
          Making your first kit. Each one takes about 20 to 40 seconds.
        </p>
      ) : allFinished && logged === done && done > 0 ? (
        <p className="text-sm text-slate-700">
          All done. Every kit in this batch is logged.{" "}
          <Link href="/dashboard" className="font-medium underline">
            See your week
          </Link>
        </p>
      ) : null}
    </div>
  );
}
