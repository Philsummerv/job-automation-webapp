"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  cleanList,
  getResumeProfile,
  normalizeResumeProfile,
  saveResumeProfile,
} from "@/lib/ai/resume";
import { MigrationMissingError, isMissingTableError } from "@/lib/ai/usage";

// Edits to the parsed resume. No AI here, so no usage cap or paid check:
// people can always fix or delete their own data.

/** One item per line, or comma-separated. */
function splitList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One item per line. */
function splitLines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveResumeEdits(formData: FormData) {
  const { supabase, user } = await requireUser();

  let existing;
  try {
    existing = await getResumeProfile(supabase, user.id);
  } catch (err) {
    if (err instanceof MigrationMissingError) redirect("/resume?error=migration");
    throw err;
  }
  if (!existing?.profile) redirect("/resume?error=none");

  const profile = normalizeResumeProfile({
    ...existing.profile,
    name: String(formData.get("name") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    // Titles and locations can contain commas ("Manager, Operations",
    // "Albany, NY"), so they split on new lines only.
    titles: cleanList(splitLines(formData.get("titles")), 15, 120),
    skills: cleanList(splitList(formData.get("skills")), 60, 80),
    locations: cleanList(splitLines(formData.get("locations")), 10, 120),
  });

  try {
    await saveResumeProfile(supabase, user.id, { profile });
  } catch (err) {
    if (err instanceof MigrationMissingError) redirect("/resume?error=migration");
    throw err;
  }

  revalidatePath("/resume");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/resume?saved=1");
}

export async function deleteResume() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("resume_profiles")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    if (isMissingTableError(error)) redirect("/resume?error=migration");
    throw new Error(error.message);
  }
  revalidatePath("/resume");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  redirect("/resume?deleted=1");
}
