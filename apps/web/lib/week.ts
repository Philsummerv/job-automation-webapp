import type { SupabaseClient } from "@supabase/supabase-js";
import {
  endOfReportingPeriod,
  parseISODate,
  startOfReportingPeriod,
  toISODate,
} from "@jobassistui/shared";

export interface WeekProgress {
  /** Activities logged in the current reporting week. */
  count: number;
  /** The user's weekly requirement (from Settings). */
  target: number;
  /** How many more they need this week. 0 once the target is met. */
  needed: number;
  met: boolean;
  /** 'YYYY-MM-DD' of the first and last day of this reporting week. */
  weekStart: string;
  weekEnd: string;
  /** Days left in the week, counting today. 1 on the last day. */
  daysLeft: number;
}

/**
 * Where the user stands on this week's work-search requirement. Uses the
 * server's calendar day, like the rest of the period math, so it can be a day
 * off for someone right around midnight.
 */
export async function getWeekProgress(
  supabase: SupabaseClient,
  profile: { weekly_target: number; reporting_period_start_day: number },
): Promise<WeekProgress> {
  const today = new Date();
  const start = startOfReportingPeriod(today, profile.reporting_period_start_day);
  const end = endOfReportingPeriod(start);
  const weekStart = toISODate(start);
  const weekEnd = toISODate(end);

  const { count } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .gte("date", weekStart)
    .lte("date", weekEnd);

  const n = count ?? 0;
  const target = profile.weekly_target;
  const todayStart = parseISODate(toISODate(today));
  const daysLeft = Math.round((end.getTime() - todayStart.getTime()) / 86_400_000) + 1;

  return {
    count: n,
    target,
    needed: Math.max(0, target - n),
    met: n >= target,
    weekStart,
    weekEnd,
    daysLeft: Math.max(1, daysLeft),
  };
}

/** "SUN 10/12" style label for the last day of the week. */
export function weekEndShort(weekEnd: string): string {
  return parseISODate(weekEnd)
    .toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
}
