import type { JobPosting } from "@jobassistui/shared";
import type { CompanyBoard } from "@/lib/jobs/companies";
import { capText, htmlToText } from "@/lib/jobs/html";

// Fetching and normalizing ONE employer board (Greenhouse, Lever or Ashby).
// Shared by the live search fallback (sources.ts) and the job index refresh
// (refresh.ts), so both turn a posting into the same JobPosting.

export const REVALIDATE_SECONDS = 3600;
/** Default per-request timeout for live searches. */
export const SOURCE_TIMEOUT_MS = 12_000;
/** Per-posting description cap. Enough for matching and the apply kit. Was
 * 8000; that made the job index ~340MB on a 500MB free database. */
export const DESCRIPTION_MAX_CHARS = 4000;

export interface GetJsonOptions {
  timeoutMs?: number;
  /**
   * Skip Next's fetch cache. The refresh job uses this: it wants fresh data,
   * and some boards are 30MB, far over the 2MB Next will cache.
   */
  noStore?: boolean;
}

export async function getJson<T>(
  url: string,
  init?: RequestInit,
  opts: GetJsonOptions = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? SOURCE_TIMEOUT_MS),
    ...(opts.noStore
      ? { cache: "no-store" as const }
      : { next: { revalidate: REVALIDATE_SECONDS } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function toIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function cleanTitle(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function desc(text: string): string {
  return capText(text, DESCRIPTION_MAX_CHARS);
}

export const REMOTE_RE = /\b(remote|work from home|wfh|anywhere)\b/i;

// ─── Greenhouse ─────────────────────────────────────────────────────────────

export interface GhJob {
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

export function normalizeGreenhouse(board: CompanyBoard, j: GhJob): JobPosting {
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

// ─── Lever ──────────────────────────────────────────────────────────────────

export interface LeverJob {
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

export function normalizeLever(board: CompanyBoard, j: LeverJob): JobPosting {
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

// ─── One board ──────────────────────────────────────────────────────────────

/**
 * Fetches every open posting on one board and normalizes it. Throws on a
 * network error, timeout or non-2xx answer (callers decide what a failure
 * means). No caching here; sources.ts wraps it in its memory cache.
 */
export async function fetchBoardJobs(
  board: CompanyBoard,
  opts: GetJsonOptions = {},
): Promise<JobPosting[]> {
  const slug = encodeURIComponent(board.slug);
  switch (board.system) {
    case "greenhouse": {
      const data = await getJson<{ jobs?: GhJob[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
        undefined,
        opts,
      );
      return (data.jobs ?? []).map((j) => normalizeGreenhouse(board, j));
    }
    case "lever": {
      const data = await getJson<LeverJob[]>(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        undefined,
        opts,
      );
      return (Array.isArray(data) ? data : []).map((j) => normalizeLever(board, j));
    }
    case "ashby": {
      const data = await getJson<{ jobs?: AshbyJob[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        undefined,
        opts,
      );
      return (data.jobs ?? [])
        .filter((j) => j.isListed !== false)
        .map((j) => normalizeAshby(board, j));
    }
  }
}

/**
 * Fetches one Greenhouse or Lever posting by its native id. Returns undefined
 * for Ashby, which has no single-posting endpoint (fetch the whole board).
 */
export async function fetchOnePosting(
  board: CompanyBoard,
  nativeId: string,
  opts: GetJsonOptions = {},
): Promise<JobPosting | undefined> {
  const slug = encodeURIComponent(board.slug);
  const id = encodeURIComponent(nativeId);
  if (board.system === "greenhouse") {
    const j = await getJson<GhJob>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`,
      undefined,
      opts,
    );
    return normalizeGreenhouse(board, j);
  }
  if (board.system === "lever") {
    const j = await getJson<LeverJob>(
      `https://api.lever.co/v0/postings/${slug}/${id}?mode=json`,
      undefined,
      opts,
    );
    return normalizeLever(board, j);
  }
  return undefined;
}
