import { US_STATES, type JobPosting, type JobSource } from "@jobassistui/shared";
import { COMPANIES, type CompanyBoard } from "@/lib/jobs/companies";
import { capText, htmlToText } from "@/lib/jobs/html";

// The job feed. Pulls from public job-board APIs on demand, normalizes every
// posting to JobPosting, filters, dedupes and sorts. No cron, no jobs table.
//
// Caching, two layers:
//  1. Next's fetch cache (`next.revalidate`, 1 hour). Note: Next won't cache a
//     response over 2MB (a few big Greenhouse boards) and logs a warning; that's
//     harmless, layer 2 covers it.
//  2. An in-memory cache of the NORMALIZED postings per board, also 1 hour.
//     Survives between requests on a warm server; empty after a cold start.
//
// Failure isolation: every source runs in parallel with its own timeout and its
// own try/catch. One board being down never breaks the feed; the result says
// which sources failed.
//
// Sources:
//  - Greenhouse, Lever, Ashby: the curated employers in companies.ts. Always on.
//  - USAJOBS: only if USAJOBS_API_KEY and USAJOBS_EMAIL are set.
//  - Adzuna (US): only if ADZUNA_APP_ID and ADZUNA_APP_KEY are set.
//  - Arbeitnow: free, but almost all EU jobs, so only with includeInternational.
//  - Remotive: NOT used. Its API terms forbid showing its jobs behind a sign-up.

const REVALIDATE_SECONDS = 3600;
const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;
const SOURCE_TIMEOUT_MS = 12_000;
/** Per-posting description cap. Enough for matching and the apply kit. */
export const DESCRIPTION_MAX_CHARS = 8000;

export interface FetchJobsOptions {
  /** Keywords or titles. Commas separate alternatives: "cashier, retail associate". Empty = everything. */
  query?: string;
  /** e.g. "Syracuse, NY" or "NY". Empty = anywhere. Remote jobs always pass. */
  location?: string;
  remoteOnly?: boolean;
  /** Include non-US jobs (and the Arbeitnow feed). Default false. */
  includeInternational?: boolean;
  /** Max postings returned. Default 300. */
  limit?: number;
}

export interface SourceStatus {
  /** e.g. "greenhouse:carvana", "usajobs". */
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

// ─── Small utilities ────────────────────────────────────────────────────────

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

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

function toIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanTitle(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function desc(text: string): string {
  return capText(text, DESCRIPTION_MAX_CHARS);
}

const REMOTE_RE = /\b(remote|work from home|wfh|anywhere)\b/i;

// ─── Greenhouse ─────────────────────────────────────────────────────────────

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
  content?: string;
  metadata?: { name?: string; value?: unknown }[] | null;
}

function normalizeGreenhouse(board: CompanyBoard, j: GhJob): JobPosting {
  const location = j.location?.name ?? "";
  const workplace = (j.metadata ?? []).find((m) =>
    /workplace|remote/i.test(m.name ?? ""),
  )?.value;
  return {
    id: `greenhouse:${board.slug}:${j.id}`,
    source: "greenhouse",
    company: j.company_name || board.name,
    title: cleanTitle(j.title),
    location,
    remote: REMOTE_RE.test(location) || /remote/i.test(String(workplace ?? "")),
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    postedAt: toIso(j.first_published ?? j.updated_at),
    descriptionText: desc(htmlToText(j.content ?? "")),
  };
}

async function fetchGreenhouse(board: CompanyBoard): Promise<JobPosting[]> {
  const data = await getJson<{ jobs?: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true`,
  );
  return (data.jobs ?? []).map((j) => normalizeGreenhouse(board, j));
}

// ─── Lever ──────────────────────────────────────────────────────────────────

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
}

function normalizeLever(board: CompanyBoard, j: LeverJob): JobPosting {
  const locs = j.categories?.allLocations?.length
    ? j.categories.allLocations
    : j.categories?.location
      ? [j.categories.location]
      : [];
  const location = locs.join("; ");
  const parts = [
    j.descriptionPlain ?? htmlToText(j.description ?? ""),
    ...(j.lists ?? []).map(
      (l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`,
    ),
    j.additionalPlain ?? "",
  ];
  return {
    id: `lever:${board.slug}:${j.id}`,
    source: "lever",
    company: board.name,
    title: cleanTitle(j.text),
    location,
    remote: j.workplaceType === "remote" || REMOTE_RE.test(location),
    url: j.hostedUrl,
    applyUrl: j.applyUrl || j.hostedUrl,
    postedAt: toIso(j.createdAt),
    descriptionText: desc(parts.filter(Boolean).join("\n\n").trim()),
  };
}

async function fetchLever(board: CompanyBoard): Promise<JobPosting[]> {
  const data = await getJson<LeverJob[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(board.slug)}?mode=json`,
  );
  return (Array.isArray(data) ? data : []).map((j) => normalizeLever(board, j));
}

// ─── Ashby ──────────────────────────────────────────────────────────────────

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  workplaceType?: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

function normalizeAshby(board: CompanyBoard, j: AshbyJob): JobPosting {
  const location = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
    .filter(Boolean)
    .join("; ");
  return {
    id: `ashby:${board.slug}:${j.id}`,
    source: "ashby",
    company: board.name,
    title: cleanTitle(j.title),
    location,
    remote:
      Boolean(j.isRemote) ||
      /remote/i.test(j.workplaceType ?? "") ||
      REMOTE_RE.test(location),
    url: j.jobUrl,
    applyUrl: j.applyUrl || j.jobUrl,
    postedAt: toIso(j.publishedAt),
    descriptionText: desc(j.descriptionPlain || htmlToText(j.descriptionHtml ?? "")),
  };
}

async function fetchAshby(board: CompanyBoard): Promise<JobPosting[]> {
  const data = await getJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}`,
  );
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => normalizeAshby(board, j));
}

function fetchBoard(board: CompanyBoard): Promise<JobPosting[]> {
  return cached(`${board.system}:${board.slug}`, () => {
    switch (board.system) {
      case "greenhouse":
        return fetchGreenhouse(board);
      case "lever":
        return fetchLever(board);
      case "ashby":
        return fetchAshby(board);
    }
  });
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
      const location = d.PositionLocationDisplay ?? "";
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
          location,
          remote: REMOTE_RE.test(location),
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

// ─── Filtering ──────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "to", "with", "jobs", "job"]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** "cashier, retail associate" -> [["cashier"], ["retail","associate"]] */
export function parseQuery(query: string): string[][] {
  return query
    .split(/,|\bor\b|\|/i)
    .map((p) => tokens(p))
    .filter((p) => p.length > 0);
}

/**
 * 2 = every word of some phrase is in the title; 1 = every word of some phrase
 * is in title + description; 0 = no match. Empty query matches everything (1).
 */
export function queryMatchLevel(job: JobPosting, phrases: string[][]): 0 | 1 | 2 {
  if (phrases.length === 0) return 1;
  const title = new Set(tokens(job.title));
  let best: 0 | 1 | 2 = 0;
  let body: Set<string> | null = null;
  for (const phrase of phrases) {
    if (phrase.every((t) => title.has(t))) return 2;
    if (best === 0) {
      body ??= new Set([...title, ...tokens(job.descriptionText.slice(0, 4000))]);
      if (phrase.every((t) => body!.has(t))) best = 1;
    }
  }
  return best;
}

const STATE_BY_CODE = new Map<string, string>(US_STATES.map(([c, n]) => [c, n.toLowerCase()]));
const STATE_BY_NAME = new Map<string, string>(US_STATES.map(([c, n]) => [n.toLowerCase(), c]));

const FOREIGN_RE =
  /\b(canada|toronto|vancouver|montreal|ontario|united kingdom|uk|england|london|ireland|dublin|germany|berlin|munich|france|paris|spain|madrid|barcelona|portugal|lisbon|netherlands|amsterdam|poland|warsaw|india|bangalore|bengaluru|hyderabad|pune|singapore|japan|tokyo|australia|sydney|melbourne|brazil|são paulo|sao paulo|mexico|israel|tel aviv|emea|apac|latam|europe|switzerland|zurich|sweden|stockholm|denmark|copenhagen|korea|seoul|china|hong kong|taiwan|philippines|argentina|colombia|chile|uae|dubai)\b/i;

function mentionsUS(loc: string): boolean {
  if (/\b(us|usa|u\.s\.|united states|americas|north america)\b/i.test(loc)) return true;
  for (const [code, name] of STATE_BY_CODE) {
    if (new RegExp(`\\b${code}\\b`).test(loc)) return true;
    if (loc.toLowerCase().includes(name)) return true;
  }
  return false;
}

/** Keeps US jobs and location-less/"Remote" jobs; drops clearly foreign ones. */
export function isLikelyUS(job: JobPosting): boolean {
  const loc = job.location.trim();
  if (!loc) return true;
  if (mentionsUS(loc)) return true;
  return !FOREIGN_RE.test(loc);
}

/** Does the job's location fit what the user typed? Remote jobs always fit. */
export function locationMatches(job: JobPosting, location: string): boolean {
  if (!location.trim()) return true;
  return job.remote || placeMatches(job, location);
}

/** Does the job's own location text name the place the user typed? */
export function placeMatches(job: JobPosting, location: string): boolean {
  const want = location.trim();
  if (!want) return false;
  const loc = job.location;
  const lower = loc.toLowerCase();
  const parts = want.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    const upper = part.toUpperCase();
    if (STATE_BY_CODE.has(upper)) {
      if (new RegExp(`\\b${upper}\\b`).test(loc)) return true;
      if (lower.includes(STATE_BY_CODE.get(upper)!)) return true;
      continue;
    }
    if (STATE_BY_NAME.has(p)) {
      if (lower.includes(p)) return true;
      if (new RegExp(`\\b${STATE_BY_NAME.get(p)}\\b`).test(loc)) return true;
      continue;
    }
    if (p.length > 1 && lower.includes(p)) return true;
  }
  return false;
}

function dedupeKey(j: JobPosting): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${norm(j.company)}|${norm(j.title)}|${norm(j.location)}`;
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

/**
 * Fetches every source in parallel and returns matching postings, best first
 * (title matches, then newest). Never throws for a source failure; check
 * `sources` to see which ones failed.
 */
export async function fetchAllJobs(opts: FetchJobsOptions = {}): Promise<FetchJobsResult> {
  const query = (opts.query ?? "").trim().slice(0, 200);
  const location = (opts.location ?? "").trim().slice(0, 100);
  const limit = Math.max(1, Math.min(opts.limit ?? 300, 1000));

  const tasks: Promise<{ status: SourceStatus; jobs: JobPosting[] }>[] = COMPANIES.map(
    (b) => runSource(`${b.system}:${b.slug}`, b.system, () => fetchBoard(b)),
  );
  if (usaJobsConfigured()) {
    tasks.push(runSource("usajobs", "usajobs", () => fetchUsaJobs(query, location)));
  }
  if (adzunaConfigured()) {
    tasks.push(runSource("adzuna", "adzuna", () => fetchAdzuna(query, location)));
  }
  if (opts.includeInternational) {
    tasks.push(runSource("arbeitnow", "arbeitnow", fetchArbeitnow));
  }

  const results = await Promise.all(tasks);
  const phrases = parseQuery(query);

  const seen = new Set<string>();
  const scored: { job: JobPosting; level: number; local: boolean }[] = [];
  for (const { jobs } of results) {
    for (const job of jobs) {
      if (!job.title || !job.url) continue;
      if (opts.remoteOnly && !job.remote) continue;
      if (!opts.includeInternational && !isLikelyUS(job)) continue;
      if (!locationMatches(job, location)) continue;
      const level = queryMatchLevel(job, phrases);
      if (level === 0) continue;
      const k = dedupeKey(job);
      if (seen.has(k)) continue;
      seen.add(k);
      scored.push({ job, level, local: location ? placeMatches(job, location) : false });
    }
  }

  // Title matches first; within those, jobs in the place the user typed come
  // before remote ones; then newest first.
  scored.sort((a, b) => {
    if (a.level !== b.level) return b.level - a.level;
    if (a.local !== b.local) return a.local ? -1 : 1;
    return (b.job.postedAt ?? "").localeCompare(a.job.postedAt ?? "");
  });

  return {
    jobs: scored.slice(0, limit).map((s) => s.job),
    sources: results.map((r) => r.status),
  };
}

/**
 * Looks up one posting by its JobPosting.id (for /apply?job=...). Only ids for
 * boards in companies.ts or the configured feeds resolve, so this can't be
 * used to fetch arbitrary URLs. Returns null when not found.
 */
export async function getJobById(id: string): Promise<JobPosting | null> {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [system, slug] = parts;
  const nativeId = parts.slice(2).join(":");
  if (!/^[\w.-]{1,200}$/.test(nativeId)) return null;

  // 1. Anything already in memory.
  for (const entry of memCache.values()) {
    const hit = entry.jobs.find((j) => j.id === id);
    if (hit) return hit;
  }

  // 2. Fetch from the source.
  try {
    if (system === "greenhouse" || system === "lever" || system === "ashby") {
      const board = COMPANIES.find((c) => c.system === system && c.slug === slug);
      if (!board) return null;
      if (system === "greenhouse") {
        const j = await getJson<GhJob>(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(nativeId)}`,
        );
        return normalizeGreenhouse(board, j);
      }
      if (system === "lever") {
        const j = await getJson<LeverJob>(
          `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${encodeURIComponent(nativeId)}?mode=json`,
        );
        return normalizeLever(board, j);
      }
      const jobs = await fetchBoard(board);
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
