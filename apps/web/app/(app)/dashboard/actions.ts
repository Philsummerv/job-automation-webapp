"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

export async function deleteEntry(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;

  // Grab the evidence path first so we can clean up the Storage object too.
  const { data } = await supabase
    .from("activity_log")
    .select("evidence_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("activity_log").delete().eq("id", id).eq("user_id", user.id);

  if (data?.evidence_path) {
    await supabase.storage.from("evidence").remove([data.evidence_path]);
  }

  revalidatePath("/dashboard");
}
