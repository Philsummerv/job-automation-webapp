import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_DAILY_LIMIT, type AiUsageKind } from "@jobassistui/shared";

// Per-user daily cap on AI calls, backed by public.ai_usage (migration 0006).
// The check and the insert happen in one Postgres function (ai_take_slot)
// that takes a per-user lock, so parallel requests can't all slip past the cap.

export const MIGRATION_NEEDED_MESSAGE =
  "Database update needed: run packages/db/migrations/0006_ai_assistant.sql in Supabase";

/** Thrown when the 0006 tables aren't in the database yet. */
export class MigrationMissingError extends Error {
  constructor() {
    super(MIGRATION_NEEDED_MESSAGE);
    this.name = "MigrationMissingError";
  }
}

/** Thrown when the user has hit today's AI limit. */
export class AiLimitError extends Error {
  constructor(readonly limit: number) {
    super(
      `You've used today's ${limit} AI requests. The limit resets at midnight UTC.`,
    );
    this.name = "AiLimitError";
  }
}

/**
 * True for "table does not exist" from Postgres (42P01) or PostgREST
 * (PGRST205, "Could not find the table ... in the schema cache").
 * Accepts a Supabase error object or anything else.
 */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  // 42883 / PGRST202: the ai_take_slot function from 0006 is missing.
  if (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    e.code === "42883" ||
    e.code === "PGRST202"
  )
    return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return (
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

function startOfUtcDay(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** How many AI calls the user has made today (UTC). */
export async function getUsageToday(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfUtcDay());
  if (error) {
    if (isMissingTableError(error)) throw new MigrationMissingError();
    throw new Error(error.message);
  }
  return count ?? 0;
}

/**
 * Enforces the daily cap and records one call. Call it right BEFORE the AI
 * call. Throws AiLimitError over the cap, MigrationMissingError if 0006 isn't
 * applied. Returns how many calls are left today after this one.
 *
 * The user comes from the session (auth.uid() inside ai_take_slot); the
 * userId argument is kept so callers don't change.
 */
export async function checkAndRecordUsage(
  supabase: SupabaseClient,
  _userId: string,
  kind: AiUsageKind,
  limit: number = AI_DAILY_LIMIT,
): Promise<{ remaining: number }> {
  const { data, error } = await supabase.rpc("ai_take_slot", {
    p_kind: kind,
    p_cap: limit,
  });
  if (error) {
    if (isMissingTableError(error)) throw new MigrationMissingError();
    throw new Error(error.message);
  }
  const remaining = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(remaining) || remaining < 0) throw new AiLimitError(limit);
  return { remaining };
}
