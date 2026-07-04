"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function saveSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const full_name = String(formData.get("full_name") || "").trim() || null;
  const state = String(formData.get("state") || "").trim() || null;
  const weekly_target = Math.max(
    0,
    Math.min(20, Number(formData.get("weekly_target") || 3)),
  );
  const reporting_period_start_day = Math.max(
    0,
    Math.min(6, Number(formData.get("reporting_period_start_day") || 0)),
  );
  const accept = formData.get("accept_disclaimer") === "on";
  const onboarding = formData.get("onboarding") === "1";

  const update: Record<string, unknown> = {
    full_name,
    state,
    weekly_target,
    reporting_period_start_day,
  };
  if (accept) update.disclaimer_accepted_at = new Date().toISOString();

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  // Finish onboarding only once the disclaimer is accepted.
  if (onboarding && accept) redirect("/dashboard");
  redirect("/settings?saved=1");
}
