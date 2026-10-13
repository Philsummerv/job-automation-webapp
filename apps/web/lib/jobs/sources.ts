import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobPosting, JobSource } from "@jobassistui/shared";
import {
  COMPANIES,
  LIVE_FALLBACK_COMPANIES,
  boardKey,
  type CompanyBoard,
} from "@/lib/jobs/companies";
import {
  REVALIDATE_SECONDS,
  REMOTE_RE,
  cleanTitle,
  desc,
  fetchBoardJobs,
  fetchOnePosting,
  getJson,
  toIso,
} from "@/lib/jobs/boards";
import { htmlToText } from "@/lib/jobs/html";
import {
  dedupeKey,
  indexQueryParts,
  isLikelyUS,
  locationMatches,
  locationSqlPatterns,
  parseQuery,
  placeMatches,
  queryMatchLevel,
} from "@/lib/jobs/filters";
import { isMissingTableError } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

export { DESCRIPTION_MAX_CHARS } from "@/lib/jobs/boards";
export {
  isLikelyUS,
  locationMatches,
  parseQuery,
  placeMatches,
  queryMatchLevel,
} from "@/lib/jobs/filters";

// The job feed: finds postings, filters, dedupes and sorts them.
//
// Employer boards (Greenhouse, Lever, Ashby; ~260 of them in companies.ts)
// are read from the job_postings table (migration 0007), which the refresh
// job (app/api/cron/refresh-jobs) fills every hour. A search asks Postgres for
// up to CANDIDATE_LIMIT rows with full-text search, then runs the same JS
// ranking as before over them, then loads descriptions for the jobs it keeps.
//
// FALLBACK: if that table is missing (migration not applied) or empty (first
// refresh not run yet), boards are fetched live like before, but only the
// original 56 (LIVE_FALLBACK_COMPANIES). The site keeps working either way.
//
// Live feeds, always fetched at search time (their results depend on the query):
//  - USAJOBS: only if USAJOBS_API_KEY and USAJOBS_EMAIL are set.
//  - Adzuna (US): only if ADZUNA_APP_ID and ADZUNA_APP_KEY are set.
//  - Arbeitnow: free, but almost all EU jobs, so only with includeInternational.
//  - Remotive: NOT used. Its API terms forbid showing its jobs behind a sign-up.
//
// Live fetches have an in-memory cache (1 hour) of normalized postings, and
// every source runs with its own timeout and try/catch: one source being down
// never breaks the feed; the result says which sources failed.

const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;
/** Most rows one search pulls from the index before JS ranking. */
const CANDIDATE_LIMIT = 1000;
/**
 * Description characters loaded per index job. The resume ranking
 * (prefilterJobs) reads the first 4000; getJobById gives the full text.
 */
const HYDRATE_CHARS = 4000;
/** How long "the index has rows" (or doesn't) is trusted before re-checking. */
const INDEX_STATE_TTL_MS = 5 * 60 * 1000;

export interface FetchJobsOptions {
  /** Keywords or titles. Commas separate alternatives: "cashier, retail associate". Empty = everything. */
  query?: string;
  /** e.g. "Syracuse, NY" or "NY". Empty = anywhere. Remote jobs always pass. */
  location?: string;
  remoteOnly?: boolean;
  /** Include non-US jobs (and the Arbeitnow feed). Default false. The index only holds US jobs. */
  includeInternational?: boolean;
  /** Max postings returned. Default 300. */
  limit?: number;
}

export interface SourceStatus {
  /** e.g. "greenhouse:carvana", "usajobs", "index". */
  key: string;
  source: JobSource;
  ok: boolean;
  count: number;
  error?: string;
}

export interface FetchJobsResult {
  jobs: JobPosting[];
  sources: SourceStatus[];
}

// ─── Memory cache (live fetches only) ───────────────────────────────────────

const memCache = new Map<string, { at: number; jobs: JobPosting[] }>();
const inFlight = new Map<string, Promise<JobPosting[]>>();

async function cached(
  key: string,
  load: () => Promise<JobPosting[]>,
): Promise<JobPosting[]> {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.jobs;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = load()
    .then((jobs) => {
      memCache.set(key, { at: Date.now(), jobs });
      return jobs;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

function fetchBoardCached(board: CompanyBoard): Promise<JobPosting[]> {
  return cached(boardKey(board), () => fetchBoardJobs(board));
}

// ─── Arbeitnow (keyless, mostly EU) ─────────────────────────────────────────

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  location: string;
  created_at: number;
}

function fetchArbeitnow(): Promise<JobPosting[]> {
  return cached("arbeitnow", async () => {
    const data = await getJson<{ data?: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api",
    );
    return (data.data ?? []).map((j) => ({
      id: `arbeitnow:feed:${j.slug}`,
      source: "arbeitnow" as const,
      company: j.company_name,
      title: cleanTitle(j.title),
      location: j.location ?? "",
      remote: Boolean(j.remote),
      url: j.url,
      applyUrl: j.url,
      postedAt: toIso(j.created_at ? j.created_at * 1000 : null),
      descriptionText: desc(htmlToText(j.description ?? "")),
    }));
  });
}

// ─── USAJOBS (keyed, optional) ──────────────────────────────────────────────
// https://developer.usajobs.gov/ — free key. Requests need the registered
// email as User-Agent and the key as Authorization-Key.

interface UsaJobsItem {
  MatchedObjectId?: string;
  MatchedObjectDescriptor?: {
    PositionID?: string;
    PositionTitle?: string;
    PositionURI?: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    PositionLocation?: { LocationName?: string }[];
    OrganizationName?: string;
    DepartmentName?: string;
    PublicationStartDate?: string;
    QualificationSummary?: string;
    UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] } };
  };
}

function usaJobsConfigured(): boolean {
  return Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL);
}

function fetchUsaJobs(query: string, location: string): Promise<JobPosting[]> {
  const key = `usajobs:${query.toLowerCase()}|${location.toLowerCase()}`;
  return cached(key, async () => {
    const params = new URLSearchParams({ ResultsPerPage: "100" });
    if (query) params.set("Keyword", query);
    if (location) params.set("LocationName", location);
    const data = await getJson<{
      SearchResult?: { SearchResultItems?: UsaJobsItem[] };
    }>(`https://data.usajobs.gov/api/search?${params}`, {
      headers: {
        "User-Agent": process.env.USAJOBS_EMAIL!,
        "Authorization-Key": process.env.USAJOBS_API_KEY!,
      },
    });
    return (data.SearchResult?.SearchResultItems ?? []).flatMap((item) => {
      const d = item.MatchedObjectDescriptor;
      if (!d?.PositionURI) return [];
      const nativeId = item.MatchedObjectId ?? d.PositionID ?? d.PositionURI;
      // "Multiple Locations" names no place, so the location filter would
      // drop the job. List the real places instead (a few, then "+N more").
      const all = (d.PositionLocation ?? []).map((l) => l.LocationName?.trim()).filter(Boolean) as string[];
      // Places matching the search first, so they survive the cut below.
      const hit = (p: string) => !!location && placeMatches({ location: p } as JobPosting, location);
      const places = [...all.filter(hit), ...all.filter((p) => !hit(p))];
      const display = d.PositionLocationDisplay ?? "";
      const where =
        /^multiple locations$/i.test(display.trim()) && places.length
          ? places.slice(0, 8).join("; ") + (places.length > 8 ? `; +${places.length - 8} more` : "")
          : display;
      const text = [
        d.UserArea?.Details?.JobSummary,
        ...(d.UserArea?.Details?.MajorDuties ?? []),
        d.QualificationSummary,
      ]
        .filter(Boolean)
        .join("\n\n");
      return [
        {
          id: `usajobs:feed:${nativeId}`,
          source: "usajobs" as const,
          company: d.OrganizationName || d.DepartmentName || "U.S. federal government",
          title: cleanTitle(d.PositionTitle),
          location: where,
          remote: REMOTE_RE.test(where),
          url: d.PositionURI,
          applyUrl: d.ApplyURI?.[0] || d.PositionURI,
          postedAt: toIso(d.PublicationStartDate),
          descriptionText: desc(htmlToText(text)),
        },
      ];
    });
  });
}

// ─── Adzuna (keyed, optional) ───────────────────────────────────────────────
// https://developer.adzuna.com/ — free key. US endpoint. Descriptions are
// short snippets; the apply kit fetches the full page by URL when needed.

interface AdzunaJob {
  id: string;
  title: string;
  description?: string;
  redirect_url: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
}

function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

function fetchAdzuna(query: string, location: string): Promise<JobPosting[]> {
  const key = `adzuna:${query.toLowerCase()}|${location.toLowerCase()}`;
  return cached(key, async () => {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      results_per_page: "50",
      "content-type": "application/json",
    });
    if (query) params.set("what", query);
    if (location) params.set("where", location);
    const data = await getJson<{ results?: AdzunaJob[] }>(
      `https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`,
    );
    return (data.results ?? []).map((j) => {
      const location = j.location?.display_name ?? "";
      return {
        id: `adzuna:us:${j.id}`,
        source: "adzuna" as const,
        company: j.company?.display_name || "Unknown employer",
        title: cleanTitle(htmlToText(j.title)),
        location,
        remote: REMOTE_RE.test(`${location} ${j.title}`),
        url: j.redirect_url,
        applyUrl: j.redirect_url,
        postedAt: toIso(j.created),
        descriptionText: desc(htmlToText(j.description ?? "")),
      };
    });
  });
}

// ─── The job index (job_postings, migration 0007) ───────────────────────────

interface IndexRow {
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
  description_text?: string;
}

interface SearchRow extends IndexRow {
  title_hit: boolean;
  is_local: boolean;
  query_used: boolean;
}

function rowToPosting(r: IndexRow): JobPosting {
  return {
    id: r.id,
    source: r.source as JobSource,
    company: r.company,
    title: r.title,
    location: r.location ?? "",
    remote: Boolean(r.remote),
    url: r.url,
    applyUrl: r.apply_url || r.url,
    postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null,
    descriptionText: r.description_text ?? "",
  };
}

/** "missing" = no table (migration not applied); "empty" = no rows yet. */
let indexState: { at: number; state: "ready" | "missing" | "empty" } | null = null;

async function getDb(): Promise<SupabaseClient | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    // The signed-in user's client: job_postings is readable by any signed-in
    // user (RLS). Outside a request (no cookies) this throws; we fall back.
    return (await createClient()) as unknown as SupabaseClient;
  } catch {
    return null;
  }
}

async function checkIndexState(db: SupabaseClient): Promise<"ready" | "missing" | "empty"> {
  if (indexState && Date.now() - indexState.at < INDEX_STATE_TTL_MS) return indexState.state;
  const { data, error } = await db.from("job_postings").select("id").limit(1);
  let state: "ready" | "missing" | "empty";
  if (error) {
    if (!isMissingTableError(error)) throw new Error(error.message);
    state = "missing";
  } else {
    state = data && data.length > 0 ? "ready" : "empty";
  }
  indexState = { at: Date.now(), state };
  return state;
}

interface IndexSearch {
  rows: SearchRow[];
  db: SupabaseClient;
}

/**
 * Candidate postings from the index, or null when the index can't be used
 * (no client, table missing or empty, or an error). Null means: use the
 * live fallback.
 */
async function searchIndex(
  phrases: string[][],
  location: string,
  remoteOnly: boolean,
): Promise<IndexSearch | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const state = await checkIndexState(db);
    if (state !== "ready") return null;
    const loc = locationSqlPatterns(location);
    // Same phrases the JS ranking uses, as websearch syntax:
    // [["retail","associate"],["cashier"]] -> "retail associate or cashier".
    // Postgres stop words ("it") go in separately as regexes.
    const q = indexQueryParts(phrases);
    const { data, error } = await db.rpc("search_job_postings", {
      p_query: q.query,
      p_title_query: q.titleQuery,
      p_title_res: q.titleRes,
      p_body_res: q.bodyRes,
      p_has_location: location.length > 0,
      p_loc_like: loc.like,
      p_loc_regex: loc.regex,
      p_remote_only: remoteOnly,
      p_limit: CANDIDATE_LIMIT,
    });
    if (error) {
      if (isMissingTableError(error)) indexState = { at: Date.now(), state: "missing" };
      throw new Error(error.message);
    }
    return { rows: (data ?? []) as SearchRow[], db };
  } catch (err) {
    console.error("[jobs] index search failed, using live boards:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fills in descriptionText for index jobs (search rows leave it out to stay
 * small). Cut to HYDRATE_CHARS. At most 1000 jobs (fetchAllJobs' cap), which
 * is also PostgREST's row cap, so one call is enough.
 */
async function hydrateDescriptions(db: SupabaseClient, jobs: JobPosting[]): Promise<void> {
  const ids = jobs.map((j) => j.id);
  if (ids.length === 0) return;
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const { data, error } = await db.rpc("job_descriptions", {
    p_ids: ids,
    p_max: HYDRATE_CHARS,
  });
  if (error) {
    console.error("[jobs] description load failed:", error.message);
    return;
  }
  for (const r of (data ?? []) as { id: string; description_text: string }[]) {
    const job = byId.get(r.id);
    if (job) job.descriptionText = r.description_text ?? "";
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function runSource(
  key: string,
  source: JobSource,
  load: () => Promise<JobPosting[]>,
): Promise<{ status: SourceStatus; jobs: JobPosting[] }> {
  try {
    const jobs = await load();
    return { status: { key, source, ok: true, count: jobs.length }, jobs };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "timed out"
          : err.message
        : "failed";
    return { status: { key, source, ok: false, count: 0, error: msg }, jobs: [] };
  }
}

interface Scored {
  job: JobPosting;
  level: number;
  local: boolean;
  /** From the index: description not loaded yet. */
  indexed: boolean;
}

/**
 * Searches the employer-board index plus the live feeds and returns matching
 * postings, best first (title matches, then jobs in the typed place, then
 * newest). Never throws for a source failure; check `sources` to see which
 * ones failed.
 */
export async function fetchAllJobs(opts: FetchJobsOptions = {}): Promise<FetchJobsResult> {
  const query = (opts.query ?? "").trim().slice(0, 200);
  const location = (opts.location ?? "").trim().slice(0, 100);
  const limit = Math.max(1, Math.min(opts.limit ?? 300, 1000));
  const phrases = parseQuery(query);

  const feedTasks: Promise<{ status: SourceStatus; jobs: JobPosting[] }>[] = [];
  if (usaJobsConfigured()) {
    feedTasks.push(runSource("usajobs", "usajobs", () => fetchUsaJobs(query, location)));
  }
  if (adzunaConfigured()) {
    feedTasks.push(runSource("adzuna", "adzuna", () => fetchAdzuna(query, location)));
  }
  if (opts.includeInternational) {
    feedTasks.push(runSource("arbeitnow", "arbeitnow", fetchArbeitnow));
  }

  const [index, feedResults] = await Promise.all([
    searchIndex(phrases, location, opts.remoteOnly === true),
    Promise.all(feedTasks),
  ]);

  // Live jobs (feeds, plus the fallback boards when the index can't be used).
  const liveResults = [...feedResults];
  if (!index) {
    liveResults.push(
      ...(await Promise.all(
        LIVE_FALLBACK_COMPANIES.map((b) =>
          runSource(boardKey(b), b.system, () => fetchBoardCached(b)),
        ),
      )),
    );
  }

  const seen = new Set<string>();
  const scored: Scored[] = [];
  const consider = (job: JobPosting, level: number, indexed: boolean) => {
    if (!job.title || !job.url) return;
    if (opts.remoteOnly && !job.remote) return;
    if (!opts.includeInternational && !isLikelyUS(job)) return;
    if (!locationMatches(job, location)) return;
    if (level === 0) return;
    const k = dedupeKey(job);
    if (seen.has(k)) return;
    seen.add(k);
    scored.push({ job, level, local: location ? placeMatches(job, location) : false, indexed });
  };

  if (index) {
    for (const row of index.rows) {
      const job = rowToPosting(row);
      // Postgres already matched the words somewhere in title, company or
      // description (level 1 at least). Title-only check here decides level 2.
      // Description isn't loaded yet, so queryMatchLevel sees the title only.
      const titleLevel = queryMatchLevel(job, phrases);
      const level =
        phrases.length === 0 ? 1 : titleLevel === 2 ? 2 : row.query_used ? 1 : 0;
      consider(job, level, true);
    }
  }
  for (const { jobs } of liveResults) {
    for (const job of jobs) consider(job, queryMatchLevel(job, phrases), false);
  }

  // Title matches first; within those, jobs in the place the user typed come
  // before remote ones; then newest first.
  scored.sort((a, b) => {
    if (a.level !== b.level) return b.level - a.level;
    if (a.local !== b.local) return a.local ? -1 : 1;
    return (b.job.postedAt ?? "").localeCompare(a.job.postedAt ?? "");
  });

  const top = scored.slice(0, limit);
  if (index) {
    await hydrateDescriptions(
      index.db,
      top.filter((s) => s.indexed).map((s) => s.job),
    );
  }

  const sources: SourceStatus[] = liveResults.map((r) => r.status);
  if (index) {
    sources.unshift({ key: "index", source: "greenhouse", ok: true, count: index.rows.length });
  }
  return { jobs: top.map((s) => s.job), sources };
}

/** Reads one posting from the index. Null when absent or the index can't be used. */
async function getIndexedJob(id: string): Promise<JobPosting | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("job_postings")
      .select("id, source, board_slug, company, title, location, remote, url, apply_url, posted_at, description_text")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToPosting(data as IndexRow);
  } catch {
    return null;
  }
}

export interface GetJobOptions {
  /**
   * Check the employer's board first and treat "not found there" as closed.
   * For Apply for me, which must not open a cloud browser on a dead form.
   * The index can hold a closed posting for up to a day or two.
   */
  fresh?: boolean;
}

/** True for an HTTP 404/410 from getJson: the posting is gone. */
function isGoneError(err: unknown): boolean {
  return err instanceof Error && /^HTTP (404|410)$/.test(err.message);
}

/**
 * Looks up one posting by its JobPosting.id (for /apply?job=...). Order:
 * memory cache, then the job index, then a live re-fetch. With `fresh`,
 * board jobs are checked live first. Only ids for boards in companies.ts or
 * the configured feeds resolve, so this can't be used to fetch arbitrary
 * URLs. Returns null when not found.
 */
export async function getJobById(
  id: string,
  opts: GetJobOptions = {},
): Promise<JobPosting | null> {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [system, slug] = parts;
  const nativeId = parts.slice(2).join(":");
  if (!/^[\w.-]{1,200}$/.test(nativeId)) return null;

  const isBoard = system === "greenhouse" || system === "lever" || system === "ashby";
  const board = isBoard
    ? COMPANIES.find((c) => c.system === system && c.slug === slug)
    : undefined;
  if (isBoard && !board) return null;

  // 0. Fresh check. Greenhouse and Lever have a one-posting endpoint; a 404
  //    there means closed. Ashby has none, so its board is read (no cache).
  //    If the board can't be reached, fall through to the usual order.
  if (opts.fresh && board) {
    try {
      if (board.system === "ashby") {
        const jobs = await fetchBoardJobs(board, { noStore: true });
        return jobs.find((j) => j.id === id) ?? null;
      }
      const one = await fetchOnePosting(board, nativeId, { noStore: true });
      if (one) return one;
    } catch (err) {
      if (isGoneError(err)) return null;
    }
  }

  // 1. Anything already in memory.
  for (const entry of memCache.values()) {
    const hit = entry.jobs.find((j) => j.id === id);
    if (hit) return hit;
  }

  // 2. The job index.
  if (board) {
    const hit = await getIndexedJob(id);
    if (hit) return hit;
  }

  // 3. Fetch from the source.
  try {
    if (board) {
      const one = await fetchOnePosting(board, nativeId);
      if (one) return one;
      const jobs = await fetchBoardCached(board);
      return jobs.find((j) => j.id === id) ?? null;
    }
    if (system === "arbeitnow") {
      return (await fetchArbeitnow()).find((j) => j.id === id) ?? null;
    }
  } catch {
    return null;
  }
  // USAJOBS / Adzuna results are query-specific; if they've left the memory
  // cache, the caller should fall back to the posting URL.
  return null;
}
