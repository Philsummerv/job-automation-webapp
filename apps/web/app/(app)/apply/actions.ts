"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { parseISODate, reportingPeriodKey, toISODate } from "@jobassistui/shared";

export interface LogApplicationState {
  error: string | null;
  /** Set when the form asked to stay on the page (batch mode) and the row saved. */
  logged?: boolean;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  if (toISODate(d) !== s) return false;
  // Allow the browser's "today" to be a day ahead of the server's.
  const max = new Date();
  max.setDate(max.getDate() + 1);
  return d.getTime() <= max.getTime() && d.getFullYear() >= 2000;
}

function safeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

/**
 * "I applied — log it". Writes one activity_log row with source 'guided', so
 * the work-search log fills itself. Logging is free, so it only needs a
 * signed-in, onboarded user (not the paid check).
 */
export async function logApplication(
  _prev: LogApplicationState,
  formData: FormData,
): Promise<LogApplicationState> {
  const { supabase, user, profile } = await requireOnboarded();

  const employer_name = String(formData.get("employer_name") || "").trim().slice(0, 200);
  const job_title = String(formData.get("job_title") || "").trim().slice(0, 200) || null;
  const url = safeUrl(String(formData.get("url") || "").trim());
  const dateRaw = String(formData.get("date") || "").trim();
  const date = isValidDate(dateRaw) ? dateRaw : toISODate(new Date());

  if (!employer_name) {
    return { error: "Add the employer name before logging." };
  }

  const reporting_period = reportingPeriodKey(
    parseISODate(date),
    profile.reporting_period_start_day,
  );

  const { error } = await supabase.from("activity_log").insert({
    user_id: user.id,
    date,
    employer_name,
    job_title,
    method: "online",
    url,
    result: "applied",
    notes: "Logged from the apply kit.",
    source: "guided",
    evidence_path: null,
    reporting_period,
  });
  if (error) {
    return { error: "We couldn't save that to your log. Try again." };
  }

  revalidatePath("/dashboard");
  // Batch mode stays on the page so the user can move to the next job.
  if (formData.get("stay") === "1") {
    revalidatePath("/apply/batch");
    return { error: null, logged: true };
  }
  redirect("/dashboard?added=1");
}
