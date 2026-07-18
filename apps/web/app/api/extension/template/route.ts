import { NextResponse } from "next/server";
import type { Profile } from "@applyassistui/shared";
import { createClient } from "@/lib/supabase/server";

// The user's saved answer template, for the extension's same-origin bridge to
// fetch and cache. Cookie-authed; returns { template: null } when signed out.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ template: null });

  const { data } = await supabase
    .from("profiles")
    .select("answer_template")
    .eq("user_id", user.id)
    .maybeSingle();

  const template = (data as Pick<Profile, "answer_template"> | null)?.answer_template ?? null;
  return NextResponse.json({ template });
}
