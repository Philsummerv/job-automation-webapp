"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TEMPLATE_FIELDS, type AnswerTemplate, type CustomRule } from "@applyassistui/shared";
import { requireUser } from "@/lib/auth";

// Persist the user's answer template to their profile (JSONB). Read back by the
// extension via GET /api/extension/template.
export async function saveTemplate(formData: FormData) {
  const { supabase, user } = await requireUser();

  const config: Record<string, string> = {};
  for (const f of TEMPLATE_FIELDS) {
    const v = String(formData.get(f.key) || "").trim();
    if (v) config[f.key] = v;
  }

  let rules: CustomRule[] = [];
  try {
    const raw = JSON.parse(String(formData.get("rules") || "[]"));
    if (Array.isArray(raw)) {
      rules = raw
        .filter((r) => r && typeof r.match === "string" && typeof r.answer === "string")
        .map((r) => ({ match: String(r.match).trim(), answer: String(r.answer).trim() }))
        .filter((r) => r.match && r.answer);
    }
  } catch {
    // Malformed rules payload — save the config, drop the rules.
  }

  const template: AnswerTemplate = { config, rules };
  const { error } = await supabase
    .from("profiles")
    .update({ answer_template: template })
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/template");
  redirect("/template?saved=1");
}
