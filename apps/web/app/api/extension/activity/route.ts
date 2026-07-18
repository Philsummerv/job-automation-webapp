import { NextResponse } from "next/server";
import { reportingPeriodKey, parseISODate, toISODate } from "@applyassistui/shared";
import { createClient } from "@/lib/supabase/server";

// Record a Guided application to the user's activity log. The extension's
// same-origin bridge POSTs queued, user-confirmed activities here. Mirrors the
// manual /log/new insert (reporting_period from the profile) but tags
// source:"guided". Cookie-authed.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not-signed-in" }, { status: 401 });

  let body: { employer_name?: string; job_title?: string; url?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }

  const employer_name = String(body.employer_name || "").trim();
  if (!employer_name) return NextResponse.json({ ok: false, error: "employer-required" }, { status: 400 });
  const job_title = String(body.job_title || "").trim() || null;
  const url = String(body.url || "").trim() || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : toISODate(new Date());

  const { data: profile } = await supabase
    .from("profiles")
    .select("reporting_period_start_day")
    .eq("user_id", user.id)
    .maybeSingle();
  const startDay = (profile as { reporting_period_start_day: number } | null)?.reporting_period_start_day ?? 0;
  const reporting_period = reportingPeriodKey(parseISODate(date), startDay);

  const { error } = await supabase.from("activity_log").insert({
    user_id: user.id,
    date,
    employer_name,
    job_title,
    method: "online",
    url,
    result: "applied",
    source: "guided",
    reporting_period,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
