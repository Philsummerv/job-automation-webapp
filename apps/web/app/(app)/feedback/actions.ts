"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

const KINDS = ["bug", "confusing", "idea", "other"];
const MAX_MESSAGE = 5000;

// Deliberately gated on requireUser, not requireEntitled: someone locked out by
// the paywall (or by a bug) still needs a way to tell us about it.
export async function sendFeedback(formData: FormData) {
  const { supabase, user } = await requireUser();

  const message = String(formData.get("message") || "").trim();
  if (!message) redirect("/feedback?error=empty");

  const rawKind = String(formData.get("kind") || "");
  const kind = KINDS.includes(rawKind) ? rawKind : "other";
  const page = String(formData.get("page") || "").trim().slice(0, 200) || null;
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    email: user.email ?? null,
    kind,
    message: message.slice(0, MAX_MESSAGE),
    page,
    user_agent: userAgent,
  });
  if (error) redirect("/feedback?error=save");

  redirect("/feedback?sent=1");
}
