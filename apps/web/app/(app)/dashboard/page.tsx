import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import {
  groupByReportingPeriod,
  reportingPeriodKey,
  methodLabel,
  resultLabel,
  type ActivityLogEntry,
} from "@autoapply/shared";
import { deleteEntry } from "./actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { supabase, profile } = await requireOnboarded();
  const sp = await searchParams;

  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .order("date", { ascending: false });
  const entries = (data ?? []) as ActivityLogEntry[];

  const startDay = profile.reporting_period_start_day;
  const groups = groupByReportingPeriod(entries, startDay);

  // Current-week progress badge.
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Activity Log</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your job-search activities, grouped by reporting week.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              met
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {currentCount}/{target} this week
          </span>
          <Link
            href="/log/new"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Add activity
          </Link>
        </div>
      </div>

      {sp.added && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Activity added to your log.
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No activities logged yet.</p>
          <Link
            href="/log/new"
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Log your first activity
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => {
            const groupMet = g.entries.length >= target;
            return (
              <section key={g.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-700">
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
                  </h2>
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

                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
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
                                Guided
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
                            <form action={deleteEntry}>
                              <input type="hidden" name="id" value={e.id} />
                              <button
                                type="submit"
                                className="text-xs text-slate-400 hover:text-red-600"
                              >
                                Delete
                              </button>
                            </form>
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
