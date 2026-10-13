import Link from "next/link";
import { Suspense } from "react";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { isAutoApplyConfigured } from "@/lib/autoapply/browser";
import { dailyApplyCount } from "@/lib/autoapply/daily";
import { isMissingTableError, MIGRATION_NEEDED_MESSAGE } from "@/lib/ai/usage";
import { isAiConfigured, AI_NOT_CONFIGURED_MESSAGE } from "@/lib/ai/client";
import ShellTopJobs, { ShellTopJobsLoading } from "@/components/ShellTopJobs";
import {
  isEntitled,
  groupByReportingPeriod,
  reportingPeriodKey,
  startOfReportingPeriod,
  endOfReportingPeriod,
  toISODate,
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
  const template = profile.answer_template ?? null;
  const canAutoApply =
    isAutoApplyConfigured() &&
    (isEntitled(profile.subscription_status) || isCompedEmail(user.email));
  const appliedUrls = entries.map((e) => e.url).filter((u): u is string => !!u);

  const startDay = profile.reporting_period_start_day;
  const groups = groupByReportingPeriod(entries, startDay);

  // Current-week progress.
  const currentKey = reportingPeriodKey(new Date(), startDay);
  const currentCount = entries.filter(
    (e) => reportingPeriodKey(new Date(e.date + "T00:00:00"), startDay) === currentKey,
  ).length;
  const target = profile.weekly_target;
  const met = currentCount >= target;

  // The seven days of this reporting week, with how many activities each has,
  // for the day boxes on the "This week" form.
  const weekStart = startOfReportingPeriod(new Date(), startDay);
  const weekEnd = endOfReportingPeriod(weekStart);
  const perDay = new Map<string, number>();
  for (const e of entries) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    return {
      iso,
      label: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      count: perDay.get(iso) ?? 0,
    };
  });
  const weekEndLabel = weekEnd
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    .toUpperCase()
    .replace(",", "");

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
        <section className="border-[1.5px] border-brand bg-paper-field p-5">
          <h2 className="form-label">Part 1 · Your resume</h2>
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
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
              >
                Add your resume
              </Link>
            </>
          )}
        </section>

        <section className="border-[1.5px] border-brand bg-paper-field p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="form-label">Part 2 · Today&apos;s jobs</h2>
            <Link href="/jobs" className="text-xs font-medium text-brand hover:underline">
              See all
            </Link>
          </div>
          <div className="mt-2">
            {titles.length > 0 ? (
              <Suspense fallback={<ShellTopJobsLoading />}>
                <ShellTopJobs
                  titles={titles}
                  location={jobLocation}
                  template={template}
                  count={dailyApplyCount(template)}
                  canAutoApply={canAutoApply}
                  appliedUrls={appliedUrls}
                />
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

        <section className="border-[1.5px] border-brand bg-paper-field p-5">
          <h2 className="form-label">Part 3 · This week</h2>
          <div className="relative mt-2 border-[1.5px] border-brand bg-paper">
            <div className="px-3 pt-2">
              <span className="form-label">Week ending</span>
              <p className="pb-2 font-mono text-sm">{weekEndLabel}</p>
            </div>
            {met && (
              <span className="stamp absolute right-2 top-2 bg-paper/70">Target met</span>
            )}
            <div className="grid grid-cols-7 border-t-[1.5px] border-brand">
              {weekDays.map((d) => (
                <div
                  key={d.iso}
                  className="border-r border-brand py-1 text-center font-mono text-[10px] last:border-r-0"
                >
                  <span className="block h-5 text-sm" aria-hidden>
                    {d.count > 0 ? (d.count > 1 ? `✓${d.count}` : "✓") : ""}
                  </span>
                  {d.label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_auto] border-t-[1.5px] border-brand">
              <div className="px-3 pt-2">
                <span className="form-label">Activities</span>
                <p className="pb-2 font-mono text-sm">
                  {currentCount} of {target}
                </p>
              </div>
              <div className="border-l-[1.5px] border-brand px-3 pt-2">
                <span className="form-label">Still needed</span>
                <p className={`pb-2 font-mono text-sm ${met ? "" : "font-semibold text-stamp"}`}>
                  {Math.max(0, target - currentCount)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/log/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
            >
              + Add activity
            </Link>
            <Link
              href="/apply"
              className="border-[1.5px] border-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-brand hover:bg-slate-50"
            >
              Apply kit
            </Link>
          </div>
        </section>

        <p className="text-sm text-slate-600">
          <span className="form-label mr-2">Add-on</span>
          Applying on Indeed from a computer? The{" "}
          <Link href="/guided" className="font-medium text-brand hover:underline">
            Indeed extension
          </Link>{" "}
          fills in Easy Apply forms for you.
        </p>
      </div>

      {/* Activity log */}
      <div
        id="log"
        className="mt-10 flex scroll-mt-4 flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight">Activity log</h2>
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
        <div className="mt-6 border-[1.5px] border-dashed border-brand bg-paper-field p-10 text-center">
          <p className="text-slate-600">No activities logged yet.</p>
          <Link
            href="/log/new"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
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
                  <h3 className="font-display text-sm font-bold uppercase tracking-wide text-brand">
                    Week of {g.label}
                    <span
                      className={`ml-2 border px-1.5 py-0.5 font-mono text-xs font-normal normal-case ${
                        groupMet
                          ? "border-emerald-700 text-emerald-800"
                          : "border-stamp text-stamp"
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
                <div className="mt-2 overflow-x-auto border-[1.5px] border-brand bg-paper-field">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="border-b-[1.5px] border-brand text-left font-display text-[11px] uppercase tracking-[0.1em] text-slate-700">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Employer</th>
                        <th className="px-4 py-2 font-medium">Method</th>
                        <th className="px-4 py-2 font-medium">Result</th>
                        <th className="px-4 py-2 font-medium">Evidence</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-paper-line">
                      {g.entries.map((e) => (
                        <tr key={e.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-700">
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
                              <span className="ml-1 border border-brand px-1 font-mono text-[10px] text-brand">
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
