// Rules Assistant — the answer endpoint.
//
// Cookie-authed like the other routes here. Slice 1 answers only from
// hand-checked data in @jobassistui/shared, so there is no model call and no
// network call on this path at all: it is a pure lookup plus a log write.
//
// THE ORDERING BELOW IS THE SAFETY DESIGN. Keep the numbers when editing.
//   1. Auth
//   2. Cap the input at 500 chars
//   3. Refusal check on the RAW string — before retrieval, before any model
//   4. varies short-circuit (TX/FL count questions)
//   5. (Slice 2) classify free text — not wired yet
//   6. Lane lookup — a table, never a model output
//   7. Retrieve
//   8. Log, return
//
// Steps 3 and 4 exist to spend nothing. A question about someone's eligibility
// must not reach a model, a search, or a database read.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import {
  answerFromCheckedData,
  capQuestion,
  type Answer,
} from "@/lib/assistant";
import { TOPIC_KEYS, US_STATES, type TopicKey } from "@jobassistui/shared";

function isTopicKey(v: unknown): v is TopicKey {
  return typeof v === "string" && (TOPIC_KEYS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "not-signed-in" },
      { status: 401 },
    );
  }

  // NOT LIVE YET — mirrors the admin gate on (app)/assistant/page.tsx so the
  // endpoint can't be called directly while the feature is dark. 404, not 403,
  // for the same reason requireAdmin() uses notFound(): a non-admin learns
  // nothing. Remove this block at the same time as the page's gate.
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  let body: {
    state?: unknown;
    topic?: unknown;
    question?: unknown;
    situation?: unknown;
    exemptions?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }

  const abbr = String(body.state ?? "")
    .trim()
    .toUpperCase();
  const stateName = US_STATES.find((s) => s[0] === abbr)?.[1] ?? abbr;
  if (!abbr) {
    return NextResponse.json({ ok: false, error: "no-state" }, { status: 400 });
  }

  // 2. Cap the input.
  const question = capQuestion(body.question);

  // Slice 1 has no classifier, so a topic must come from a button. Free text
  // without a topic falls through to the honest "I don't have that one".
  if (!isTopicKey(body.topic)) {
    return NextResponse.json({ ok: false, error: "no-topic" }, { status: 400 });
  }
  const topic = body.topic;

  const situation =
    typeof body.situation === "string" ? body.situation.slice(0, 40) : null;
  const exemptions = Array.isArray(body.exemptions)
    ? body.exemptions.filter((e): e is string => typeof e === "string").slice(0, 8)
    : [];

  // 3, 4, 6, 7 — all inside this pure function, in that order.
  const answer: Answer = answerFromCheckedData(abbr, stateName, topic, question);

  // 8. Log. A log failure must never fail the answer — same contract as
  // lib/notify.ts: the user already has a correct answer in hand, and a logging
  // outage should degrade to "we lose the analytics row", not to an error page.
  try {
    await supabase.from("assistant_log").insert({
      user_id: user.id,
      email: user.email ?? null,
      state: abbr,
      situation,
      exemptions,
      topic,
      question: question || null,
      route: "button",
      outcome: answer.kind,
      refusal_reason: answer.refusal_reason ?? null,
      source_urls: answer.source ? [answer.source.url] : null,
      fact_verified_on: answer.source?.verified_on ?? null,
      stale_served: answer.stale,
    });
  } catch (err) {
    console.error("[assistant] log insert failed", err);
  }

  return NextResponse.json({ ok: true, answer });
}
