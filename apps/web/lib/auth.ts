import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEntitled, type Profile } from "@applyassistui/shared";

// Redirects to /login if there's no session; otherwise returns the client+user.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Loads the caller's profile, creating it defensively if the signup trigger
// hasn't populated it yet. cache(): the layout and the page both call this
// in one render pass — only the first hits the database.
export const getProfileContext = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  let profile = existing as Profile | null;
  if (!profile) {
    const { data: created } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        full_name: (user.user_metadata?.full_name as string) ?? null,
      })
      .select("*")
      .single();
    profile = created as Profile;
  }

  return { supabase, user, profile };
});

// Same as getProfileContext but bounces first-run users to settings until they
// accept the disclaimer. Call at the top of gated pages (dashboard, log entry).
export async function requireOnboarded() {
  const ctx = await getProfileContext();
  if (!ctx.profile.disclaimer_accepted_at) {
    redirect("/settings?onboarding=1");
  }
  return ctx;
}

// Complimentary access: comma-separated emails in COMPED_EMAILS bypass the
// paywall entirely (owner account, beta testers). Case-insensitive.
export function isCompedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return (process.env.COMPED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

// Onboarded + active trial/subscription (or comped); otherwise bounce to the
// paywall. Everything except /settings and /billing itself sits behind this.
export async function requireEntitled() {
  const ctx = await requireOnboarded();
  if (
    !isEntitled(ctx.profile.subscription_status) &&
    !isCompedEmail(ctx.user.email)
  ) {
    redirect("/billing");
  }
  return ctx;
}
