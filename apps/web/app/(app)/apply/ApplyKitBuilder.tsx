"use client";

import { useEffect, useState } from "react";
import type { ApplyKit } from "@jobassistui/shared";
import ApplyCopyButton from "./ApplyCopyButton";
import ApplyLogForm from "./ApplyLogForm";

/** Resume facts used only to build the .txt download. All from the user's profile. */
export interface ApplyResumeBasics {
  name: string;
  email: string;
  phone: string;
  location: string;
  certifications: string[];
  education: { school: string; credential: string; dates: string }[];
}

/** A job picked from the feed (?job=). */
export interface ApplyPreselectedJob {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  /** Set when the feed id couldn't be resolved and we only have its link. */
  fallbackUrl: string | null;
}

interface JobInfo {
  company: string;
  title: string;
  url: string | null;
  applyUrl: string | null;
}

interface Saved {
  key: string;
  kit: ApplyKit;
  job: JobInfo;
}

const TEXT_MAX = 20_000;
const STORAGE_KEY = "jobassistui:apply-kit";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const primaryBtn =
  "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60";

function isHttpUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u);
}

export default function ApplyKitBuilder({
  aiReady,
  basics,
  preselected,
  initialUrl,
}: {
  aiReady: boolean;
  basics: ApplyResumeBasics;
  preselected: ApplyPreselectedJob | null;
  initialUrl: string;
}) {
  const [usePreselected, setUsePreselected] = useState(Boolean(preselected));
  const [tab, setTab] = useState<"url" | "text">("url");
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kit: ApplyKit; job: JobInfo } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const storageKey = preselected ? `job:${preselected.id}` : "manual";

  // Bring back the last kit after a reload, so a refresh doesn't cost another
  // AI call. Per-browser convenience only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (saved?.key === storageKey && saved.kit && saved.job) {
        setResult({ kit: saved.kit, job: saved.job });
      }
    } catch {
      /* storage blocked or bad data: ignore */
    }
  }, [storageKey]);

  async function build() {
    setError(null);
    let body: Record<string, unknown>;
    if (usePreselected && preselected) {
      body = { mode: "job", jobId: preselected.id, fallbackUrl: preselected.fallbackUrl ?? preselected.url };
    } else if (tab === "url") {
      if (!isHttpUrl(url.trim())) {
        setError("Paste a full job link that starts with http:// or https://.");
        return;
      }
      body = { mode: "url", url: url.trim() };
    } else {
      if (text.trim().length < 150) {
        setError("Paste the full job text. That's too short to be a job posting.");
        return;
      }
      body = { mode: "text", text, company, title };
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/apply-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; kit: ApplyKit; job: JobInfo; remaining: number }
        | { ok: false; error: string; code?: string }
        | null;
      if (!data) {
        setError("Something went wrong. Try again.");
      } else if (!data.ok) {
        if (data.code === "no_resume") {
          window.location.href = "/resume";
          return;
        }
        setError(data.error);
      } else {
        setResult({ kit: data.kit, job: data.job });
        setRemaining(data.remaining);
        try {
          const saved: Saved = { key: storageKey, kit: data.kit, job: data.job };
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        } catch {
          /* ignore */
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Once the person logs the application, forget the saved kit so the nav's
  // "Apply kit" link opens a fresh form instead of offering to log it again.
  function clearSaved() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function startOver() {
    setResult(null);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (result) {
    return (
      <ApplyKitView
        kit={result.kit}
        job={result.job}
        basics={basics}
        remaining={remaining}
        onStartOver={startOver}
        onLogged={clearSaved}
      />
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {usePreselected && preselected ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Job</p>
          <p className="mt-1 text-lg font-semibold">
            {preselected.title || "Job from your feed"}
          </p>
          <p className="text-sm text-slate-600">
            {[preselected.company, preselected.location].filter(Boolean).join(" · ")}
          </p>
          {isHttpUrl(preselected.url) && (
            <a
              href={preselected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
            >
              Open the job posting
            </a>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setUsePreselected(false)}
              className="text-sm text-slate-600 underline hover:text-slate-900"
            >
              Use a different job
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex gap-2 text-sm" role="tablist">
            {(
              [
                ["url", "Paste a link"],
                ["text", "Paste the job text"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  tab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "url" ? (
            <div className="mt-4">
              <label htmlFor="apply-url" className="block text-sm font-medium">
                Job link
              </label>
              <input
                id="apply-url"
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2000}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">
                Works best with company career pages. Some big job sites block us. If that
                happens, paste the job text instead.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="apply-company" className="block text-sm font-medium">
                    Company <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="apply-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="apply-title-in" className="block text-sm font-medium">
                    Job title <span className="text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="apply-title-in"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="apply-text" className="block text-sm font-medium">
                  Job text
                </label>
                <textarea
                  id="apply-text"
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
                  maxLength={TEXT_MAX}
                  placeholder="Copy the whole job posting and paste it here."
                  className={inputClass}
                />
                <p className="mt-1 text-right text-xs text-slate-500">
                  {text.length.toLocaleString()} / {TEXT_MAX.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={build} disabled={loading || !aiReady} className={primaryBtn}>
          {loading ? "Building your kit…" : "Build apply kit"}
        </button>
        {loading && (
          <span className="text-sm text-slate-600">This takes about a minute. Keep this page open.</span>
        )}
      </div>
    </div>
  );
}

// ─── The finished kit ───────────────────────────────────────────────────────

function resumeAsText(kit: ApplyKit, b: ApplyResumeBasics): string {
  const lines: string[] = [];
  if (b.name) lines.push(b.name.toUpperCase());
  const contact = [b.location, b.phone, b.email].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  if (lines.length) lines.push("");

  const r = kit.tailoredResume;
  if (r.summary) lines.push("SUMMARY", r.summary, "");
  if (r.experience.length) {
    lines.push("EXPERIENCE");
    for (const e of r.experience) {
      lines.push([e.title, e.employer].filter(Boolean).join(", ") + (e.dates ? ` (${e.dates})` : ""));
      for (const bullet of e.bullets) lines.push(`- ${bullet}`);
      lines.push("");
    }
  }
  if (r.skills.length) lines.push("SKILLS", r.skills.join(", "), "");
  if (b.education.length) {
    lines.push("EDUCATION");
    for (const e of b.education) {
      lines.push([e.credential, e.school].filter(Boolean).join(", ") + (e.dates ? ` (${e.dates})` : ""));
    }
    lines.push("");
  }
  if (b.certifications.length) lines.push("CERTIFICATIONS", ...b.certifications.map((c) => `- ${c}`), "");
  return lines.join("\n").trim() + "\n";
}

function fileSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function scoreClass(score: number): string {
  if (score >= 75) return "bg-emerald-100 text-emerald-800";
  if (score >= 50) return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ApplyKitView({
  kit,
  job,
  basics,
  remaining,
  onStartOver,
  onLogged,
}: {
  kit: ApplyKit;
  job: JobInfo;
  basics: ApplyResumeBasics;
  remaining: number | null;
  onStartOver: () => void;
  onLogged: () => void;
}) {
  const resumeText = resumeAsText(kit, basics);
  const applyHref = isHttpUrl(job.applyUrl) ? job.applyUrl : isHttpUrl(job.url) ? job.url : null;
  const answersText = kit.answers.map((a) => `${a.question}\n${a.answer}`).join("\n\n");

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{job.title || "Your apply kit"}</p>
            {job.company && <p className="text-sm text-slate-600">{job.company}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${scoreClass(kit.matchScore)}`}>
            {kit.matchScore}% match
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {applyHref && (
            <a
              href={applyHref}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryBtn}
            >
              Apply on the company site
            </a>
          )}
          <button
            type="button"
            onClick={onStartOver}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Start over with another job
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          We don&apos;t send anything for you. Read the kit, fix anything that&apos;s off, then apply
          yourself.
          {remaining !== null && ` You have ${remaining} AI requests left today.`}
        </p>
      </div>

      {kit.checkThese.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-900">Check these before you send</h2>
          <p className="mt-1 text-sm text-amber-900">
            We couldn&apos;t tie these to your resume. Fix or remove anything that isn&apos;t true.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {kit.checkThese.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {kit.missingKeywords.length > 0 && (
        <Section title="What the job asks for that your resume doesn't show">
          <p className="text-sm text-slate-600">
            These are gaps, not things to add. Only put one on your resume if it&apos;s true and you
            just left it out.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {kit.missingKeywords.map((k) => (
              <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {k}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Resume for this job"
        action={
          <>
            <ApplyCopyButton text={resumeText} />
            <button
              type="button"
              onClick={() =>
                downloadText(`resume-${fileSlug(job.company || job.title)}.txt`, resumeText)
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Download .txt
            </button>
          </>
        }
      >
        {kit.tailoredResume.summary && (
          <p className="text-sm text-slate-800">{kit.tailoredResume.summary}</p>
        )}
        <div className="mt-4 space-y-4">
          {kit.tailoredResume.experience.map((e, i) => (
            <div key={i}>
              <p className="text-sm font-semibold">
                {e.title}
                {e.employer && <span className="font-normal text-slate-600"> · {e.employer}</span>}
              </p>
              {e.dates && <p className="text-xs text-slate-500">{e.dates}</p>}
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
                {e.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {kit.tailoredResume.skills.length > 0 && (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Skills: </span>
            {kit.tailoredResume.skills.join(", ")}
          </p>
        )}
      </Section>

      {kit.coverLetter && (
        <Section title="Cover letter" action={<ApplyCopyButton text={kit.coverLetter} />}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{kit.coverLetter}</p>
        </Section>
      )}

      {kit.answers.length > 0 && (
        <Section
          title="Draft answers to common questions"
          action={<ApplyCopyButton text={answersText} label="Copy all" />}
        >
          <p className="text-sm text-slate-600">
            Fill in anything in [brackets] yourself. We can&apos;t know those.
          </p>
          <div className="mt-3 space-y-4">
            {kit.answers.map((a, i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{a.question}</p>
                  <ApplyCopyButton text={a.answer} />
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{a.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Did you apply?">
        <ApplyLogForm
          company={job.company}
          title={job.title}
          url={job.applyUrl ?? job.url}
          onSubmit={onLogged}
        />
      </Section>
    </div>
  );
}
