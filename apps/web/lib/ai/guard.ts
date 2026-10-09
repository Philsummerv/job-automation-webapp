import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isEntitled, type Profile } from "@jobassistui/shared";
import { createClient } from "@/lib/supabase/server";
import { isCompedEmail } from "@/lib/auth";
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured } from "@/lib/ai/client";

// One gate for every AI route and server action: signed in, on the paid
// Guided tier (free for everyone until FREE_UNTIL), and AI configured.
//
// Never redirects. It returns a result so API routes can answer with JSON and
// server actions can return an error to the form. Pages that want a redirect
// for signed-out users should call requireUser() from lib/auth first.
//
// Usage in a route handler:
//   const access = await requireAiAccess();
//   if (!access.ok) return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
//   const { user, supabase } = access;
//
// The daily cap is separate: call checkAndRecordUsage() from lib/ai/usage
// right before the model call.

export type AiAccessErrorCode = "unauthenticated" | "not_entitled" | "not_configured";

export type AiAccess =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      profile: Profile | null;
    }
  | {
      ok: false;
      status: 401 | 402 | 503;
      code: AiAccessErrorCode;
      error: string;
    };

export async function requireAiAccess(): Promise<AiAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      error: "Please sign in first.",
    };
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = (data as Profile | null) ?? null;

  // Same rule as requireEntitled() in lib/auth, minus the redirect. A missing
  // profile row counts as status "none" (still free during the free period).
  const entitled =
    isEntitled(profile?.subscription_status ?? "none") ||
    isCompedEmail(user.email);
  if (!entitled) {
    return {
      ok: false,
      status: 402,
      code: "not_entitled",
      error: "The AI tools are part of Guided. Subscribe on the Billing page to use them.",
    };
  }

  if (!isAiConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "not_configured",
      error: AI_NOT_CONFIGURED_MESSAGE,
    };
  }

  return { ok: true, user, supabase, profile };
}
