import {
  parseISODate,
  endOfReportingPeriod,
  toISODate,
  methodLabel,
  resultLabel,
  type ActivityLogEntry,
} from "@autoapply/shared";

// Loosely typed to stay compatible with the untyped Supabase client (row
// shapes are enforced by the `as ActivityLogEntry[]` cast below).
type AnySupabase = {
  from: (table: string) => any;
};

export function periodRange(periodKey: string) {
  const start = parseISODate(periodKey);
  const end = endOfReportingPeriod(start);
  return { start, end, startISO: toISODate(start), endISO: toISODate(end) };
}

// Fetches the caller's entries within a reporting period (RLS scopes to the
// user). `periodKey` is the 'YYYY-MM-DD' start-of-week key.
export async function getPeriodEntries(
  supabase: AnySupabase,
  periodKey: string,
): Promise<ActivityLogEntry[]> {
  const { startISO, endISO } = periodRange(periodKey);
  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .gte("date", startISO)
    .lte("date", endISO)
    .order("date", { ascending: true });
  return (data ?? []) as ActivityLogEntry[];
}

export function toCsv(entries: ActivityLogEntry[]): string {
  const headers = [
    "Date",
    "Employer",
    "Job Title",
    "Method",
    "Result",
    "URL",
    "Notes",
    "Source",
  ];
  const esc = (v: string | null | undefined) => {
    const s = (v ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const rows = entries.map((e) =>
    [
      e.date,
      e.employer_name,
      e.job_title,
      methodLabel(e.method),
      resultLabel(e.result),
      e.url,
      e.notes,
      e.source === "guided" ? "Guided" : "Self-directed",
    ]
      .map(esc)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\r\n");
}
