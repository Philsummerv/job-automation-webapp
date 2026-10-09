import Link from "next/link";
import { Suspense } from "react";
import { requireOnboarded } from "@/lib/auth";
import { isMissingTableError, MIGRATION_NEEDED_MESSAGE } from "@/lib/ai/usage";
import { isAiConfigured, AI_NOT_CONFIGURED_MESSAGE } from "@/lib/ai/client";
import ShellTopJobs, { ShellTopJobsLoading } from "@/components/ShellTopJobs";
import {
  groupByReportingPeriod,
  reportingPeriodKey,
  methodLabel,
  resultLabel,
  type ActivityLogEntry,
  type ResumeProfileRow,
} from "@jobassistui/shared";
import { deleteEntry } from "./actions";
import { DeleteEntryForm } from "@/components/DeleteEntryForm";

// Home: three next steps (resume, jobs, this week), then the activity log.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { supabase, profile, user } = await requireOnboarded();
  const sp = await searchParams;

  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .order("date", { ascending: false });
  const entries = (data ?? []) as ActivityLogEntry[];

  // Resume status. The table comes from migration 0006; if it isn't in the
  // database yet, say so instead of crashing.
  const resumeRes = await supabase
    .from("resume_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const migrationMissing = isMissingTableError(resumeRes.error);
  const resume = (resumeRes.data ?? null) as ResumeProfileRow | null;
  const resumeProfile = resume?.profile ?? null;
  const titles = (resumeProfile?.titles ?? []).filter(Boolean);
  const jobLocation = resumeProfile?.locations?.[0] ?? "";
  const aiReady = isAiConfigured();

  const startDay = profile.reporting_period_start_day;
  const groups = groupByReportingPeriod(entries, startDay);

  // Current-week progress.
  const currentKey = reportingPeriodKey(new Date(), startDay);
  const currentCount = entries.filter(
    (e) => reportingPeriodKey(new Date(e.date + "T00:00:00"), startDay) === currentKey,
  ).length;
  const target = profile.weekly_target;
  const met = currentCount >= target;

  // Sign evidence URLs in one batch.
  const evidencePaths = entries
    .map((e) => e.evidence_path)
    .filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (evidencePaths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("evidence")
      .createSignedUrls(evidencePaths, 3600);
    urls?.forEach((u) => {
      if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Home</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your next steps, and every job-search activity you&apos;ve logged.
      </p>

      {sp.added && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Activity added to your log.
        </div>
      )}

      {migrationMissing && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {MIGRATION_NEEDED_MESSAGE}
        </div>
      )}
      {!aiReady && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {AI_NOT_CONFIGURED_MESSAGE}
        </div>
      )}

      {/* Next steps */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">1. Your resume</h2>
          {resumeProfile ? (
            <>
              <p className="mt-2 text-sm text-slate-700">
                {resumeProfile.headline || resumeProfile.name || "Resume saved."}
              </p>
              {titles.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Job titles we search for: {titles.slice(0, 3).join(", ")}
                </p>
              )}
              <Link
                href="/resume"
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Edit resume
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Add your resume once. We use it to find jobs that fit you and to
                write a resume and cover letter for each job.
              </p>
              <Link
                href="/resume"
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Add your resume
              </Link>
            </>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">2. Jobs for you</h2>
            <Link href="/jobs" className="text-xs font-medium text-brand hover:underline">
              See all
            </Link>
          </div>
          <div className="mt-2">
            {titles.length > 0 ? (
              <Suspense fallback={<ShellTopJobsLoading />}>
                <ShellTopJobs titles={titles} location={jobLocation} />
              </Suspense>
            ) : (
              <p className="text-sm text-slate-600">
                Add your resume and jobs that fit will show here. Or{" "}
                <Link href="/jobs" className="font-medium text-brand hover:underline">
                  search jobs now
                </Link>
                .
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">3. This week</h2>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{currentCount}</span>
            <span className="text-sm text-slate-600">
              of {target} activities logged
            </span>
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              met ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {met ? "Target met" : `${target - currentCount} to go`}
          </span>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/log/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Add activity
            </Link>
            <Link
              href="/apply"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Apply kit
            </Link>
          </div>
        </section>
      </div>

      {/* Activity log */}
      <div
        id="log"
        className="mt-10 flex scroll-mt-4 flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h2 className="text-xl font-semibold">Activity log</h2>
          <p className="mt-1 text-sm text-slate-600">
            Grouped by reporting week. Jobs you log from an apply kit land here
            too.
          </p>
        </div>
        <Link href="/log/new" className="text-sm font-medium text-brand hover:underline">
          + Add activity
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No activities logged yet.</p>
          <Link
            href="/log/new"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Log your first activity
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => {
            const groupMet = g.entries.length >= target;
            return (
              <section key={g.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Week of {g.label}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                        groupMet
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {g.entries.length}/{target}
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs">
                    <a
                      href={`/export/pdf?period=${g.key}`}
                      className="font-medium text-brand hover:underline"
                    >
                      Export PDF
                    </a>
                    <a
                      href={`/export/csv?period=${g.key}`}
                      className="font-medium text-brand hover:underline"
                    >
                      Export CSV
                    </a>
                  </div>
                </div>

                {/* overflow-x-auto: on a phone the table scrolls sideways
                    inside its box instead of widening the whole page. */}
                <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Employer</th>
                        <th className="px-4 py-2 font-medium">Method</th>
                        <th className="px-4 py-2 font-medium">Result</th>
                        <th className="px-4 py-2 font-medium">Evidence</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.entries.map((e) => (
                        <tr key={e.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                            {e.date}
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-900">
                              {e.employer_name}
                            </div>
                            {e.job_title && (
                              <div className="text-xs text-slate-500">
                                {e.job_title}
                              </div>
                            )}
                            {e.url && (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-brand hover:underline"
                              >
                                View listing
                              </a>
                            )}
                            {e.notes && (
                              <div className="mt-0.5 text-xs text-slate-500">
                                {e.notes}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                            {methodLabel(e.method)}
                            {e.source === "guided" && (
                              <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-600">
                                Auto-logged
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                            {resultLabel(e.result)}
                          </td>
                          <td className="px-4 py-2">
                            {e.evidence_path && signed.get(e.evidence_path) ? (
                              <a
                                href={signed.get(e.evidence_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-brand hover:underline"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <DeleteEntryForm entryId={e.id} action={deleteEntry} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
