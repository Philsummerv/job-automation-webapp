"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEntitled } from "@/lib/auth";
import {
  ACTIVITY_METHODS,
  ACTIVITY_RESULTS,
  reportingPeriodKey,
  parseISODate,
  type ActivityMethod,
  type ActivityResult,
} from "@applyassistui/shared";

function whitelist<T extends string>(
  value: string,
  allowed: readonly { value: string }[],
  fallback: T,
): T {
  return (allowed.some((a) => a.value === value) ? value : fallback) as T;
}

export async function createEntry(formData: FormData) {
  const { supabase, user, profile } = await requireEntitled();

  const date = String(formData.get("date") || "").trim();
  const employer_name = String(formData.get("employer_name") || "").trim();
  if (!date || !employer_name) {
    throw new Error("Date and employer are required.");
  }

  const job_title = String(formData.get("job_title") || "").trim() || null;
  const url = String(formData.get("url") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const method = whitelist<ActivityMethod>(
    String(formData.get("method") || ""),
    ACTIVITY_METHODS,
    "online",
  );
  const result = whitelist<ActivityResult>(
    String(formData.get("result") || ""),
    ACTIVITY_RESULTS,
    "applied",
  );

  // Optional evidence screenshot → private Storage under the user's folder.
  let evidence_path: string | null = null;
  const file = formData.get("evidence");
  if (file instanceof File && file.size > 0) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("evidence")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) throw new Error("Evidence upload failed: " + upErr.message);
    evidence_path = path;
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
    method,
    url,
    result,
    notes,
    source: "self_directed",
    evidence_path,
    reporting_period,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  redirect("/dashboard?added=1");
}
