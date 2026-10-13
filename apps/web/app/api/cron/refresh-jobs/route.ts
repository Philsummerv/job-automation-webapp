import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_SHARDS,
  IndexMissingError,
  refreshJobIndex,
} from "@/lib/jobs/refresh";

// Refreshes one slice of the job index (job_postings). See lib/jobs/refresh.ts.
//
// Called by:
//  - Vercel Cron, once a day per shard (apps/web/vercel.json). Vercel sends
//    "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
//  - GitHub Actions, every hour (.github/workflows/refresh-jobs.yml).
//
//   GET or POST /api/cron/refresh-jobs?shard=0&of=4
//   Add &dry=1 to fetch the boards without writing anything.
//
// Without CRON_SECRET set, the route refuses every call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  // Hash both sides so the compare is constant-time whatever the lengths.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

function intParam(v: string | null, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const of = intParam(params.get("of"), DEFAULT_SHARDS);
  const shard = intParam(params.get("shard"), 0);
  if (!(of >= 1 && of <= 64) || !(shard >= 0 && shard < of)) {
    return NextResponse.json(
      { error: "Use ?shard=i&of=n with 0 <= i < n <= 64." },
      { status: 400 },
    );
  }
  const dryRun = params.get("dry") === "1";

  try {
    const summary = await refreshJobIndex({
      shard,
      of,
      dryRun,
      client: dryRun ? undefined : createServiceClient(),
    });
    // Keep the response small: per-board detail only for failures.
    const { results, ...rest } = summary;
    const failures = results
      .filter((r) => !r.ok)
      .map((r) => ({ key: r.key, error: r.error }));
    console.log(
      `[refresh-jobs] shard ${shard}/${of}${dryRun ? " (dry run)" : ""}: ` +
        `${summary.ok} ok, ${summary.failed} failed, ${summary.skipped.length} skipped, ` +
        `${summary.jobs} jobs, ${summary.written} written, ${summary.deleted} deleted, ${summary.ms}ms`,
    );
    return NextResponse.json({ ...rest, failures });
  } catch (err) {
    if (err instanceof IndexMissingError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[refresh-jobs]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
