"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// Client side of "Apply for me". Talks to /api/autoapply/{start,fill,status,finish}.
//
// The software fills the form in a cloud browser shown below in a live view.
// The person reads it, fixes it, and presses the form's own Submit button.
// Nothing here ever presses Submit.

// Mirrors FillReport in lib/autoapply/run.ts (kept local so this client file
// never pulls server code into the bundle).
interface FillReport {
  applicationUrl: string;
  fieldCount: number;
  filled: { label: string; value: string }[];
  needsYou: { label: string; reason: string; required: boolean }[];
}

interface StartResponse {
  sessionId: string;
  liveViewUrl: string;
  applicationUrl: string;
  job: { company: string; title: string };
}

type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; error: string };

type Phase =
  | "intro"
  | "starting"
  | "filling"
  | "review"
  | "finishing"
  | "submitted"
  | "not_logged"
  | "cancelled"
  | "ended"
  | "error";

/** Sessions end after 15 minutes (SESSION_TIMEOUT_SECONDS in lib/autoapply/browser). */
const SESSION_MS = 15 * 60 * 1000;
const POLL_MS = 5000;

/**
 * Fill errors where the form is still open in the live view, so the person can
 * finish it by hand. "timeout"/"error"/"network" cover the platform cutting the
 * request off while the cloud browser keeps running.
 */
const FILL_KEEPS_WINDOW = new Set(["fill_failed", "fill_timeout", "already_filled", "timeout", "error", "network"]);

const primaryBtn =
  "rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark disabled:opacity-60";
const secondaryBtn =
  "rounded-lg border-[1.5px] border-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-brand hover:bg-paper disabled:opacity-60";
const quietBtn =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60";

function localDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function isSessionGone(status: number, code: string): boolean {
  return status === 410 || code === "session_gone";
}

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      (T & { error?: string; code?: string }) | null;
    if (!res.ok || !json) {
      return {
        ok: false,
        status: res.status,
        code: json?.code ?? (res.status === 504 ? "timeout" : "error"),
        error: json?.error ?? "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: json };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "network",
      error: "We couldn't reach the server. Check your connection and try again.",
    };
  }
}

interface Problem {
  code: string;
  message: string;
}

// A run in progress, saved per tab so a reload (or a phone bringing back a
// dropped tab) can pick it up again instead of opening a second window.
interface SavedRun {
  session: StartResponse;
  startedAt: number;
  report: FillReport | null;
  fillProblem: Problem | null;
}

const saveKey = (jobId: string) => `autoapply:${jobId}`;

function saveRun(jobId: string, run: SavedRun): void {
  try {
    sessionStorage.setItem(saveKey(jobId), JSON.stringify(run));
  } catch {
    /* storage off: the run just can't be resumed */
  }
}

function loadRun(jobId: string): SavedRun | null {
  try {
    const raw = sessionStorage.getItem(saveKey(jobId));
    if (!raw) return null;
    const run = JSON.parse(raw) as SavedRun;
    if (!run?.session?.sessionId || typeof run.startedAt !== "number") return null;
    return run;
  } catch {
    return null;
  }
}

function clearRun(jobId: string): void {
  try {
    sessionStorage.removeItem(saveKey(jobId));
  } catch {
    /* nothing to do */
  }
}

export default function AutoApplyRunner({
  jobId,
  company,
  title,
  location,
  jobHref,
  kitHref,
  configured,
  queue = null,
  autoStart = false,
}: {
  jobId: string;
  company: string;
  title: string;
  location: string;
  jobHref: string | null;
  kitHref: string;
  configured: boolean;
  /** Set when working through Today's jobs from Home. */
  queue?: { position: number; total: number; nextHref: string | null } | null;
  /** Open the form straight away (the person already pressed Start on Home). */
  autoStart?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [session, setSession] = useState<StartResponse | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [report, setReport] = useState<FillReport | null>(null);
  const [fillProblem, setFillProblem] = useState<Problem | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The window closed while this page was away (reload, tab dropped).
  const [endedAfterLeave, setEndedAfterLeave] = useState(false);

  // Refs so the unload handler and the poller see current values.
  const sessionIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  const live = phase === "filling" || phase === "review" || phase === "finishing";
  const remaining = startedAt ? SESSION_MS - (now - startedAt) : SESSION_MS;
  const expired = startedAt !== null && remaining <= 0;

  // Close the session once. Every exit path goes through here.
  const finish = useCallback(
    async (
      submitted: boolean | "check",
    ): Promise<ApiResult<{ ok: true; logged: boolean }> | null> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || closedRef.current) return null;
      closedRef.current = true;
      clearRun(jobId);
      return post<{ ok: true; logged: boolean }>("/api/autoapply/finish", {
        sessionId,
        submitted,
        date: localDate(),
      });
    },
    [jobId],
  );

  // Countdown tick.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  // Session ran out of time.
  useEffect(() => {
    if (live && expired) {
      void finish("check").then((r) => {
        setPhase(r?.ok && r.data.logged ? "submitted" : "ended");
      });
    }
  }, [live, expired, finish]);

  // Leaving the page: if the form was sent, log it and close the window.
  // (finish "check" leaves an unsent form open, so a reload, or coming back
  // to this page, can pick it up again. An abandoned window ends by itself
  // after 15 minutes.)
  // pagehide, not visibilitychange: opening the live view full screen in a new
  // tab (the phone path) hides this page, and that must not end the session.
  // A page kept in the back/forward cache (persisted) keeps running when it
  // comes back, so nothing is sent. Leaving through an in-app link unmounts
  // this component without a pagehide, so the cleanup does the same thing.
  // The saved run is kept: the reload picks it up.
  useEffect(() => {
    function onLeave(e?: Event) {
      if (e instanceof PageTransitionEvent && e.persisted) return;
      const sessionId = sessionIdRef.current;
      if (!sessionId || closedRef.current) return;
      closedRef.current = true;
      const body = JSON.stringify({
        sessionId,
        submitted: "check",
        date: localDate(),
      });
      try {
        const sent = navigator.sendBeacon?.(
          "/api/autoapply/finish",
          new Blob([body], { type: "text/plain;charset=UTF-8" }),
        );
        if (!sent) {
          void fetch("/api/autoapply/finish", {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body,
            keepalive: true,
          });
        }
      } catch {
        /* the session still ends by itself after 15 minutes */
      }
    }
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      // Unmount (in-app navigation). Under StrictMode the first mount has no
      // session yet, so this does nothing there.
      onLeave();
    };
  }, [jobId]);

  // Pick up a run this tab already had going (reload, or a dropped tab
  // coming back).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const saved = loadRun(jobId);
    if (!saved || Date.now() - saved.startedAt >= SESSION_MS) {
      if (saved) clearRun(jobId);
      if (autoStart && configured) {
        // Drop go=1 so a later reload doesn't open a second window.
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("go");
          window.history.replaceState(window.history.state, "", u);
        } catch {
          /* only matters for reloads */
        }
        void start();
      }
      return;
    }
    sessionIdRef.current = saved.session.sessionId;
    closedRef.current = false;
    setSession(saved.session);
    setStartedAt(saved.startedAt);
    setNow(Date.now());
    setReport(saved.report);
    setFillProblem(saved.fillProblem);
    setPhase("finishing");
    void (async () => {
      const r = await post<{ submitted: boolean; alive: boolean }>("/api/autoapply/status", {
        sessionId: saved.session.sessionId,
      });
      if (closedRef.current) return;
      if (r.ok && r.data.alive) {
        if (r.data.submitted) {
          const f = await finish(true);
          setPhase(f?.ok ? "submitted" : "not_logged");
          return;
        }
        if (!saved.report && !saved.fillProblem) {
          setFillProblem({
            code: "resumed",
            message: "This page reloaded while we were filling in the form. Check every field.",
          });
        }
        setPhase("review");
        return;
      }
      if (r.ok || isSessionGone(r.status, r.code)) {
        // The window is closed. If it closed because the page was left, that
        // step already logged the application if it was sent.
        closedRef.current = true;
        clearRun(jobId);
        setEndedAfterLeave(true);
        setPhase("ended");
        return;
      }
      // Couldn't check (network). Show the form; polling sorts it out.
      setPhase("review");
    })();
  }, [jobId, finish]);

  // While the person reviews, check every 5 seconds whether the form was sent.
  useEffect(() => {
    if (phase !== "review" || !session) return;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (busy || stopped || closedRef.current) return;
      busy = true;
      const r = await post<{ submitted: boolean; alive: boolean }>("/api/autoapply/status", {
        sessionId: session.sessionId,
      });
      busy = false;
      if (stopped || closedRef.current) return;
      if (r.ok) {
        if (r.data.submitted) {
          setPhase("finishing");
          const f = await finish(true);
          setPhase(f?.ok ? "submitted" : "not_logged");
        } else if (!r.data.alive) {
          const f = await finish("check");
          setPhase(f?.ok && f.data.logged ? "submitted" : "ended");
        }
      } else if (isSessionGone(r.status, r.code)) {
        closedRef.current = true;
        setPhase("ended");
      }
      // Other errors (network blips): just try again next tick.
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [phase, session, finish]);

  function fail(r: { status: number; code: string; error: string }) {
    setProblem({
      code: isSessionGone(r.status, r.code) ? "session_gone" : r.code,
      message: r.error,
    });
    setPhase("error");
  }

  async function start() {
    setProblem(null);
    setFillProblem(null);
    setNotice(null);
    setEndedAfterLeave(false);
    setReport(null);
    sessionIdRef.current = null;
    closedRef.current = false;
    setPhase("starting");

    const s = await post<StartResponse>("/api/autoapply/start", { jobId });
    if (!s.ok) {
      fail(s);
      return;
    }
    const startedNow = Date.now();
    sessionIdRef.current = s.data.sessionId;
    setSession(s.data);
    setStartedAt(startedNow);
    setNow(startedNow);
    setPhase("filling");
    saveRun(jobId, { session: s.data, startedAt: startedNow, report: null, fillProblem: null });

    const f = await post<{ report: FillReport }>("/api/autoapply/fill", {
      sessionId: s.data.sessionId,
    });
    if (closedRef.current) return; // cancelled or timed out while filling
    if (f.ok) {
      setReport(f.data.report);
      saveRun(jobId, { session: s.data, startedAt: startedNow, report: f.data.report, fillProblem: null });
      setPhase("review");
    } else if (isSessionGone(f.status, f.code)) {
      closedRef.current = true;
      fail(f);
    } else if (FILL_KEEPS_WINDOW.has(f.code)) {
      // The window is still open. The person can fill it in by hand.
      const fp = { code: f.code, message: f.error };
      setFillProblem(fp);
      saveRun(jobId, { session: s.data, startedAt: startedNow, report: null, fillProblem: fp });
      setPhase("review");
    } else {
      // Couldn't load the resume, couldn't connect, etc. The server has
      // usually closed the window already; make sure it is closed.
      await finish(false);
      fail(f);
    }
  }

  // "I submitted it": check first. Closing the window before the form is
  // really sent would throw away the filled form (and could cut off a submit
  // that is still going through), so the window only closes once the
  // "thank you" page shows.
  async function iSubmitted() {
    const sessionId = sessionIdRef.current;
    if (!sessionId || closedRef.current) return;
    setNotice(null);
    setPhase("finishing");
    const r = await post<{ submitted: boolean; alive: boolean }>("/api/autoapply/status", { sessionId });
    if (closedRef.current) return;
    if (r.ok && r.data.submitted) {
      const f = await finish(true);
      setPhase(f?.ok ? "submitted" : "not_logged");
      return;
    }
    if ((r.ok && !r.data.alive) || (!r.ok && isSessionGone(r.status, r.code))) {
      const f = await finish("check");
      setPhase(f?.ok && f.data.logged ? "submitted" : "ended");
      return;
    }
    setNotice(
      r.ok
        ? "We don't see the thank-you page yet. Check the form above. If it shows an error or a puzzle, fix that and press Submit again."
        : "We couldn't check the form just now. Try again in a moment.",
    );
    setPhase("review");
  }

  async function cancel() {
    setPhase("finishing");
    await finish(false);
    setPhase("cancelled");
  }

  const needsYou = report
    ? [...report.needsYou].sort((a, b) => Number(b.required) - Number(a.required))
    : [];

  const nextJob = queue?.nextHref ? (
    <Link href={queue.nextHref} className={primaryBtn}>
      Next job ({queue.position + 1} of {queue.total})
    </Link>
  ) : null;

  const fallbackLinks = (
    <div className="mt-3 flex flex-wrap gap-2">
      {jobHref && (
        <a
          href={jobHref}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={secondaryBtn}
        >
          Open the job yourself
        </a>
      )}
      <Link href={kitHref} className={secondaryBtn}>
        Build apply kit
      </Link>
    </div>
  );

  return (
    <div className="mt-6 space-y-5">
      {/* The job */}
      <div className="border-[1.5px] border-brand bg-paper-field p-5">
        <span className="form-label">
          {queue ? `Today's jobs · ${queue.position} of ${queue.total}` : "Job"}
        </span>
        <p className="mt-1 text-lg font-semibold">{title}</p>
        <p className="text-sm text-slate-600">{[company, location].filter(Boolean).join(" · ")}</p>
        {live && (
          <p className="mt-2 text-sm text-slate-700" aria-live="polite">
            Time left in this window:{" "}
            <span className={`font-mono font-semibold ${remaining < 120_000 ? "text-stamp" : ""}`}>
              {mmss(remaining)}
            </span>
          </p>
        )}
      </div>

      {/* Before starting */}
      {(phase === "intro" || phase === "starting") && (
        <div className="border-[1.5px] border-brand bg-paper-field p-5">
          <span className="form-label">How it works</span>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-800">
            <li>We open the company&apos;s application form below.</li>
            <li>We fill it in from your resume and saved answers.</li>
            <li>You read every field and fix anything wrong.</li>
            <li>You press Submit in the form. We never press it for you.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-600">
            The window stays open for 15 minutes. We don&apos;t make anything up. If we don&apos;t
            know an answer, we leave it blank and tell you.
          </p>
          {configured ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void start()}
                disabled={phase === "starting"}
                className={primaryBtn}
              >
                {phase === "starting" ? "Opening the form..." : "Start"}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Apply for me isn&apos;t turned on yet. You can still apply the usual way.
              {fallbackLinks}
            </div>
          )}
        </div>
      )}

      {/* Errors that end the run */}
      {phase === "error" && problem && (
        <ProblemBox
          problem={problem}
          fallback={
            <>
              {fallbackLinks}
              {nextJob && <div className="mt-3">{nextJob}</div>}
            </>
          }
          onRetry={start}
        />
      )}

      {/* The live form */}
      {live && session && (
        <div className="border-[1.5px] border-brand bg-paper-field p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="form-label">The application form</span>
            <div className="flex items-center gap-4">
              {phase === "filling" && (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="text-sm text-slate-600 underline hover:text-slate-900"
                >
                  Cancel
                </button>
              )}
              <a
                href={session.liveViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-brand underline"
              >
                Open full screen
              </a>
            </div>
          </div>
          <div className="relative mt-2">
            <iframe
              src={session.liveViewUrl}
              title="Application form"
              allow="clipboard-read; clipboard-write"
              sandbox="allow-same-origin allow-scripts"
              className="block h-[70vh] min-h-[480px] w-full border border-slate-300 bg-white"
            />
            {phase === "filling" && (
              <div className="pointer-events-auto absolute inset-0 flex items-start justify-center bg-paper/40 pt-10">
                <p
                  className="animate-pulse border-[1.5px] border-brand bg-paper-field px-4 py-2 text-sm font-semibold text-brand"
                  aria-live="polite"
                >
                  Filling in your application... First we read the form, then we fill it in.
                  This takes about a minute.
                </p>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            On a phone? Use &quot;Open full screen&quot;, then come back to this tab when
            you&apos;re done.
          </p>
        </div>
      )}

      {/* Review */}
      {(phase === "review" || phase === "finishing") && (
        <div className="space-y-4">
          <div className="border-[1.5px] border-stamp bg-paper-field p-5">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-stamp">
              Read every field, fix anything wrong, then press Submit in the form above.
            </p>
            <p className="mt-1 text-sm text-slate-700">
              We log it for you when the form is sent. If a puzzle or &quot;I&apos;m not a
              robot&quot; box shows up, answer it in the form.
            </p>
          </div>

          {notice && (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {notice}
            </div>
          )}

          {fillProblem && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>{fillProblem.message} You can also fill it in by hand in the window above.</p>
              {fallbackLinks}
            </div>
          )}

          {report && needsYou.length > 0 && (
            <div className="border-[1.5px] border-amber-400 bg-amber-50 p-5">
              <span className="form-label">Check these yourself</span>
              <ul className="mt-2 space-y-2 text-sm">
                {needsYou.map((n, i) => (
                  <li key={i} className="border-l-4 border-amber-400 pl-3">
                    <span className="font-semibold text-slate-900">{n.label || "A question"}</span>
                    {n.required && (
                      <span className="ml-2 rounded-full bg-stamp px-2 py-0.5 text-[11px] font-semibold text-paper">
                        Required
                      </span>
                    )}
                    <p className="text-slate-700">{n.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report && (
            <div className="border-[1.5px] border-brand bg-paper-field p-5">
              <span className="form-label">What we filled in</span>
              {report.filled.length === 0 ? (
                <p className="mt-2 text-sm text-slate-700">
                  We didn&apos;t fill in anything. Please fill in the form yourself.
                </p>
              ) : (
                <details className="mt-2 text-sm" open={report.filled.length <= 12}>
                  <summary className="cursor-pointer text-slate-700">
                    {report.filled.length} of {report.fieldCount} fields
                  </summary>
                  <dl className="mt-2 divide-y divide-paper-line">
                    {report.filled.map((f, i) => (
                      <div
                        key={i}
                        className="grid gap-1 py-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-3"
                      >
                        <dt className="text-slate-600">{f.label}</dt>
                        <dd className="break-words font-medium text-slate-900">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void iSubmitted()}
              disabled={phase === "finishing"}
              className={primaryBtn}
            >
              {phase === "finishing" ? "Checking..." : "I submitted it"}
            </button>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={phase === "finishing"}
              className={quietBtn}
            >
              {queue?.nextHref ? "Skip this job" : "Close the form"}
            </button>
          </div>
        </div>
      )}

      {/* Endings */}
      {phase === "submitted" && (
        <div className="border-[1.5px] border-brand bg-paper-field p-5">
          <span className="stamp">Applied</span>
          <p className="mt-4 text-sm text-slate-800">
            Your application to {company || "this company"} is sent. We added it to your activity
            log.
          </p>
          {queue && !queue.nextHref && (
            <p className="mt-2 text-sm text-slate-800">That was the last of today&apos;s jobs.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {nextJob}
            <Link href="/dashboard" className={nextJob ? secondaryBtn : primaryBtn}>
              Go to dashboard
            </Link>
            <Link href="/jobs" className={secondaryBtn}>
              Find another job
            </Link>
          </div>
        </div>
      )}

      {phase === "not_logged" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            We couldn&apos;t see a &quot;thank you&quot; page, so we didn&apos;t log it. If you did
            send it, add it to your log yourself.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextJob}
            <Link href="/log/new" className={nextJob ? secondaryBtn : primaryBtn}>
              Log it myself
            </Link>
            <Link href="/jobs" className={secondaryBtn}>
              Back to jobs
            </Link>
          </div>
        </div>
      )}

      {phase === "cancelled" && (
        <div className="rounded-md border border-slate-300 bg-paper-field px-4 py-3 text-sm text-slate-800">
          <p>Stopped. Nothing was sent.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextJob}
            <button type="button" onClick={() => void start()} className={secondaryBtn}>
              Start again
            </button>
            <Link href="/jobs" className={quietBtn}>
              Back to jobs
            </Link>
          </div>
        </div>
      )}

      {phase === "ended" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {endedAfterLeave ? (
            <p>
              The application window closed. If you sent the form, check your log first. We add
              it there when we see the thank-you page. If it isn&apos;t there, add it yourself.
            </p>
          ) : (
            <p>
              The application window closed{expired ? " after 15 minutes" : ""}. If you sent the
              form, add it to your log yourself.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {nextJob}
            <button type="button" onClick={() => void start()} className={secondaryBtn}>
              Start again
            </button>
            <Link href="/log/new" className={quietBtn}>
              Log it myself
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemBox({
  problem,
  fallback,
  onRetry,
}: {
  problem: Problem;
  fallback: React.ReactNode;
  onRetry: () => Promise<void>;
}) {
  let body: React.ReactNode;
  switch (problem.code) {
    case "not_configured":
      body = <p>Apply for me isn&apos;t turned on yet. You can still apply the usual way.</p>;
      break;
    case "no_resume":
      body = (
        <p>
          Add your resume first. We fill in the form from it.{" "}
          <Link href="/resume" className="font-medium underline">
            Add your resume
          </Link>
        </p>
      );
      break;
    case "limit":
      body = <p>{problem.message} You can still apply the usual way.</p>;
      break;
    case "unauthenticated":
      body = (
        <p>
          Please sign in again.{" "}
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
        </p>
      );
      break;
    case "not_entitled":
      body = (
        <p>
          Apply for me is part of Guided.{" "}
          <Link href="/billing" className="font-medium underline">
            See Billing
          </Link>
        </p>
      );
      break;
    case "session_gone":
      body = <p>The application window closed. Start again, or apply the usual way.</p>;
      break;
    default:
      body = <p>{problem.message} You can try again, or apply the usual way.</p>;
  }
  const canRetry = ![
    "unsupported",
    "job_not_found",
    "migration_needed",
    "not_configured",
    "no_resume",
    "limit",
    "unauthenticated",
    "not_entitled",
  ].includes(problem.code);
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="alert"
    >
      {body}
      <div className="mt-3 flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" onClick={() => void onRetry()} className={secondaryBtn}>
            Try again
          </button>
        )}
      </div>
      {fallback}
    </div>
  );
}
