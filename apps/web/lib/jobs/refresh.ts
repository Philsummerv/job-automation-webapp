import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobPosting } from "@jobassistui/shared";
import { COMPANIES, boardKey, type CompanyBoard } from "@/lib/jobs/companies";
import { fetchBoardJobs } from "@/lib/jobs/boards";
import { isLikelyUS } from "@/lib/jobs/filters";
import { isMissingTableError } from "@/lib/ai/usage";

// Refreshes the job_postings index from the employer boards in companies.ts.
// Server-only: writes with the service-role client. Called by
// app/api/cron/refresh-jobs (Vercel cron daily, GitHub Actions hourly).
//
// Work is split into shards (?shard=i&of=n) so each call stays well under the
// function time limit. Per board:
//   1. Fetch the whole board (45s timeout; a few boards are 30MB).
//   2. If the fetch FAILED: record the error and leave its jobs alone. A board
//      that is down for an hour must not vanish from search. But once it has
//      had no good fetch for STALE_AFTER_MS (it moved or was deleted), its
//      jobs are removed, so dead links don't stay in search for ever.
//   3. If the board's hash (over every id + content_hash) is the same as on
//      the last good run, nothing changed: stop. No row reads, no writes.
//   4. Otherwise ask the database which ids are new, changed or gone (the
//      job_board_diff RPC). The diff runs inside Postgres, so the refresh
//      never downloads every stored hash.
//   5. Write only rows that are new or changed.
//   6. Delete rows the board no longer lists. Skipped ONCE when the board
//      suddenly shrank by 90%+ (more likely an API hiccup than a hiring
//      freeze). If the next run gets the same small count, it is accepted.
//   7. Record the result in job_board_status.

export const DEFAULT_SHARDS = 4;
const CONCURRENCY = 8;
const BOARD_TIMEOUT_MS = 45_000;
/** Don't START a board after this long; leaves room to finish under 300s. */
const DEFAULT_DEADLINE_MS = 200_000;
// Small: each row carries up to 4000 chars of text plus a full-text index
// update, and 8 boards write at once. 200 hit the free plan's statement timeout.
const UPSERT_CHUNK = 50;
const DELETE_CHUNK = 100;
/** A board with no good fetch for this long has its jobs removed. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export class IndexMissingError extends Error {
  constructor() {
    super("The job_postings table is missing. Apply migration 0007_job_index.sql.");
    this.name = "IndexMissingError";
  }
}

export interface BoardResult {
  key: string;
  ok: boolean;
  /** US postings on the board right now (0 when the fetch failed). */
  count: number;
  error?: string;
  ms: number;
  written?: number;
  deleted?: number;
  /** Raw JSON-ish size of the rows, for the dry run. */
  bytes?: number;
}

export interface RefreshSummary {
  shard: number;
  of: number;
  dryRun: boolean;
  boards: number;
  ok: number;
  failed: number;
  /** Boards not started because the time budget ran out. */
  skipped: string[];
  jobs: number;
  written: number;
  deleted: number;
  removedBoards: string[];
  ms: number;
  results: BoardResult[];
}

export interface RefreshOptions {
  shard?: number;
  of?: number;
  /** Fetch and build rows but never touch the database. */
  dryRun?: boolean;
  /** Required unless dryRun. A service-role client. */
  client?: SupabaseClient;
  deadlineMs?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Override the board list (tests). Defaults to COMPANIES. */
  boards?: CompanyBoard[];
}

/** Boards in shard `shard` of `of`. Stable: sorted by key, then round-robin. */
export function boardsForShard(
  shard: number,
  of: number,
  boards: CompanyBoard[] = COMPANIES,
): CompanyBoard[] {
  const sorted = [...boards].sort((a, b) => boardKey(a).localeCompare(boardKey(b)));
  return sorted.filter((_, i) => i % of === shard);
}

interface Row {
  id: string;
  source: string;
  board_slug: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  apply_url: string | null;
  posted_at: string | null;
  description_text: string;
  content_hash: string;
  refreshed_at: string;
}

function toRow(board: CompanyBoard, j: JobPosting, now: string): Row {
  const base = {
    id: j.id,
    source: board.system,
    board_slug: board.slug,
    company: j.company,
    title: j.title,
    location: j.location,
    remote: j.remote,
    url: j.url,
    apply_url: j.applyUrl || null,
    posted_at: j.postedAt,
    // Postgres text can't hold NUL bytes; a stray one would fail the batch.
    description_text: j.descriptionText.replace(/\u0000/g, ""),
  };
  const content_hash = createHash("sha1").update(JSON.stringify(base)).digest("hex");
  return { ...base, content_hash, refreshed_at: now };
}

/** One hash for the whole board: same rows = same hash. */
function boardHash(rows: Row[]): string {
  const h = createHash("sha1");
  for (const line of rows.map((r) => `${r.id}:${r.content_hash}`).sort()) {
    h.update(line).update("\n");
  }
  return h.digest("hex");
}

/** A board's job_board_status row from before this run. */
interface PrevStatus {
  key: string;
  ok: boolean;
  count: number;
  last_ok_at: string | null;
  board_hash: string | null;
}

async function loadStatuses(
  db: SupabaseClient,
  boards: CompanyBoard[],
): Promise<Map<string, PrevStatus>> {
  const out = new Map<string, PrevStatus>();
  const keys = boards.map(boardKey);
  for (let i = 0; i < keys.length; i += DELETE_CHUNK) {
    const { data, error } = await db
      .from("job_board_status")
      .select("key, ok, count, last_ok_at, board_hash")
      .in("key", keys.slice(i, i + DELETE_CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as PrevStatus[]) out.set(r.key, r);
  }
  return out;
}

function errText(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timed out";
    return err.message.slice(0, 300);
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message).slice(0, 300);
  }
  return "failed";
}

interface DiffRow {
  write_ids: string[] | null;
  stale_ids: string[] | null;
  existing_count: number | null;
}

/** New/changed ids, gone ids and the stored row count, worked out in Postgres. */
async function diffBoard(
  db: SupabaseClient,
  board: CompanyBoard,
  rows: Row[],
): Promise<{ write: Set<string>; stale: string[]; existing: number }> {
  const { data, error } = await db.rpc("job_board_diff", {
    p_source: board.system,
    p_slug: board.slug,
    p_ids: rows.map((r) => r.id),
    p_hashes: rows.map((r) => r.content_hash),
  });
  if (error) throw error;
  const d = ((data ?? []) as DiffRow[])[0];
  return {
    write: new Set(d?.write_ids ?? []),
    stale: d?.stale_ids ?? [],
    existing: d?.existing_count ?? 0,
  };
}

/** Deletes every stored row of one board. Returns how many went. */
async function deleteBoardRows(db: SupabaseClient, board: CompanyBoard): Promise<number> {
  const { error, count } = await db
    .from("job_postings")
    .delete({ count: "exact" })
    .eq("source", board.system)
    .eq("board_slug", board.slug);
  if (error) throw error;
  return count ?? 0;
}

async function refreshBoard(
  board: CompanyBoard,
  opts: { db?: SupabaseClient; dryRun: boolean; timeoutMs: number; prev?: PrevStatus },
): Promise<BoardResult> {
  const key = boardKey(board);
  const started = Date.now();
  const now = new Date().toISOString();
  const prev = opts.prev;

  let jobs: JobPosting[];
  try {
    jobs = await fetchBoardJobs(board, { timeoutMs: opts.timeoutMs, noStore: true });
  } catch (err) {
    const error = errText(err);
    if (opts.dryRun || !opts.db) {
      return { key, ok: false, count: 0, error, ms: Date.now() - started };
    }
    const db = opts.db;
    // No good fetch for STALE_AFTER_MS: the board moved or closed. Remove its
    // jobs so search and the apply pages stop offering dead links.
    const lastOk = prev?.last_ok_at ? Date.parse(prev.last_ok_at) : NaN;
    if (Number.isFinite(lastOk) && started - lastOk > STALE_AFTER_MS) {
      try {
        const deleted = await deleteBoardRows(db, board);
        const msg = `${error}. No good answer for 2 days, so its jobs were removed.`;
        await db.from("job_board_status").upsert(
          { key, ok: false, count: 0, error: msg, refreshed_at: now, board_hash: null },
          { onConflict: "key" },
        );
        return { key, ok: false, count: 0, error: msg, ms: Date.now() - started, deleted };
      } catch (dbErr) {
        if (isMissingTableError(dbErr)) throw new IndexMissingError();
        console.error(`[refresh-jobs] ${key}: removing old jobs failed`, errText(dbErr));
        // Fall through: at least record the fetch failure.
      }
    }
    // Keep count and last_ok_at as they were; only flag the failure.
    await db
      .from("job_board_status")
      .upsert({ key, ok: false, error, refreshed_at: now }, { onConflict: "key" });
    return { key, ok: false, count: 0, error, ms: Date.now() - started };
  }

  // One row per id (a board can list the same posting twice).
  const byId = new Map<string, Row>();
  for (const j of jobs) {
    if (!j.title || !j.url) continue;
    // Only US postings are indexed (search never shows the others).
    if (!isLikelyUS(j)) continue;
    byId.set(j.id, toRow(board, j, now));
  }
  const rows = [...byId.values()];

  if (opts.dryRun || !opts.db) {
    const bytes = rows.reduce(
      (n, r) => n + r.description_text.length + r.title.length + r.location.length + r.url.length * 2 + 120,
      0,
    );
    return { key, ok: true, count: rows.length, ms: Date.now() - started, bytes };
  }

  const db = opts.db;
  const hash = boardHash(rows);
  try {
    // Same rows as the last good run: nothing to write or delete.
    if (prev?.ok && prev.board_hash === hash) {
      const { error } = await db.from("job_board_status").upsert(
        { key, ok: true, count: rows.length, error: null, refreshed_at: now, last_ok_at: now },
        { onConflict: "key" },
      );
      if (error) throw error;
      return { key, ok: true, count: rows.length, ms: Date.now() - started, written: 0, deleted: 0 };
    }

    const diff = await diffBoard(db, board, rows);
    const changed = rows.filter((r) => diff.write.has(r.id));
    for (let i = 0; i < changed.length; i += UPSERT_CHUNK) {
      const { error } = await db
        .from("job_postings")
        .upsert(changed.slice(i, i + UPSERT_CHUNK), { onConflict: "id" });
      if (error) throw error;
    }

    // A board that suddenly lost 90%+ of a big listing is more likely a bad
    // answer than a real change. Keep the old rows and flag it, but only
    // once: the baseline is the smaller of the stored rows and the count the
    // LAST fetch got. If the next run gets the same small count, the shrink
    // is real and the old rows go.
    const baseline = prev ? Math.min(diff.existing, prev.count) : diff.existing;
    const suspicious = baseline >= 20 && rows.length < baseline * 0.1;
    let deleted = 0;
    if (!suspicious) {
      for (let i = 0; i < diff.stale.length; i += DELETE_CHUNK) {
        const ids = diff.stale.slice(i, i + DELETE_CHUNK);
        const { error } = await db.from("job_postings").delete().in("id", ids);
        if (error) throw error;
        deleted += ids.length;
      }
    }

    const error = suspicious
      ? `Got ${rows.length} jobs, had ${diff.existing}. Kept the old ones for now.`
      : null;
    await db.from("job_board_status").upsert(
      {
        key,
        ok: !suspicious,
        count: rows.length,
        error,
        refreshed_at: now,
        // Set only when the stored rows now match the board exactly.
        board_hash: suspicious ? null : hash,
        ...(suspicious ? {} : { last_ok_at: now }),
      },
      { onConflict: "key" },
    );
    return {
      key,
      ok: !suspicious,
      count: rows.length,
      ...(error ? { error } : {}),
      ms: Date.now() - started,
      written: changed.length,
      deleted,
    };
  } catch (err) {
    if (isMissingTableError(err)) throw new IndexMissingError();
    const error = `database: ${errText(err)}`;
    // board_hash cleared: the stored rows may be half written.
    await db
      .from("job_board_status")
      .upsert({ key, ok: false, error, refreshed_at: now, board_hash: null }, { onConflict: "key" });
    return { key, ok: false, count: rows.length, error, ms: Date.now() - started };
  }
}

/** Removes postings and status rows for boards no longer in companies.ts. */
async function removeDroppedBoards(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("job_board_status").select("key");
  if (error) throw error;
  const listed = new Set(COMPANIES.map(boardKey));
  const dropped = ((data ?? []) as { key: string }[])
    .map((r) => r.key)
    .filter((k) => !listed.has(k));
  for (const key of dropped) {
    const i = key.indexOf(":");
    const source = key.slice(0, i);
    const slug = key.slice(i + 1);
    const del = await db
      .from("job_postings")
      .delete()
      .eq("source", source)
      .eq("board_slug", slug);
    if (del.error) throw del.error;
    await db.from("job_board_status").delete().eq("key", key);
  }
  return dropped;
}

/** Refreshes one shard of the boards. Never throws for a single board. */
export async function refreshJobIndex(opts: RefreshOptions = {}): Promise<RefreshSummary> {
  const started = Date.now();
  const of = Math.max(1, Math.min(opts.of ?? DEFAULT_SHARDS, 64));
  const shard = Math.max(0, Math.min(opts.shard ?? 0, of - 1));
  const dryRun = opts.dryRun === true;
  const db = opts.client;
  if (!dryRun && !db) throw new Error("refreshJobIndex needs a service-role client.");
  const deadline = started + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const timeoutMs = opts.timeoutMs ?? BOARD_TIMEOUT_MS;

  if (!dryRun && db) {
    const probe = await db.from("job_postings").select("id").limit(1);
    if (probe.error) {
      if (isMissingTableError(probe.error)) throw new IndexMissingError();
      throw new Error(probe.error.message);
    }
  }

  const queue = boardsForShard(shard, of, opts.boards);
  let statuses = new Map<string, PrevStatus>();
  if (!dryRun && db) {
    try {
      statuses = await loadStatuses(db, queue);
    } catch (err) {
      // Without them: no skip-if-unchanged, no expiry, and the 90% guard
      // compares against the stored rows only.
      console.error("[refresh-jobs] status load failed", errText(err));
    }
  }
  const results: BoardResult[] = [];
  const skipped: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const board = queue[next++];
      if (Date.now() > deadline) {
        skipped.push(boardKey(board));
        continue;
      }
      results.push(
        await refreshBoard(board, { db, dryRun, timeoutMs, prev: statuses.get(boardKey(board)) }),
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, queue.length) }, worker),
  );

  let removedBoards: string[] = [];
  if (!dryRun && db && shard === 0) {
    try {
      removedBoards = await removeDroppedBoards(db);
    } catch (err) {
      console.error("[refresh-jobs] cleanup failed", errText(err));
    }
  }

  results.sort((a, b) => a.key.localeCompare(b.key));
  return {
    shard,
    of,
    dryRun,
    boards: queue.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    skipped,
    jobs: results.reduce((n, r) => n + r.count, 0),
    written: results.reduce((n, r) => n + (r.written ?? 0), 0),
    deleted: results.reduce((n, r) => n + (r.deleted ?? 0), 0),
    removedBoards,
    ms: Date.now() - started,
    results,
  };
}
