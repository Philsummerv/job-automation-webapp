import { NextResponse } from "next/server";
import { isEntitled, type Profile } from "@applyassistui/shared";
import { createClient } from "@/lib/supabase/server";
import { isCompedEmail } from "@/lib/auth";

// Entitlement probe for the browser extension. The extension's bridge content
// script (running on this origin) calls it SAME-ORIGIN, so the request carries
// the user's login cookies automatically — no token handoff. Returns just what
// the extension needs to gate a run; the paywall logic (isEntitled + comped)
// stays server-side and identical to the web app's requireEntitled().
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ signedIn: false, entitled: false, email: null });
  }

  const { data } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const status = (data as Pick<Profile, "subscription_status"> | null)?.subscription_status;
  const entitled = (status ? isEntitled(status) : false) || isCompedEmail(user.email);

  return NextResponse.json({ signedIn: true, entitled, email: user.email ?? null });
}
