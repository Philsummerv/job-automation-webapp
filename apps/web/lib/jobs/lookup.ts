import type { JobPosting, JobSource } from "@jobassistui/shared";
import { getJobById as getJobByIdFromSources } from "@/lib/jobs/sources";

// Find one feed posting by its id, for /apply?job=<id>.
//
// Id format: "<source>:<company slug or feed>:<native id>", e.g.
//   greenhouse:carvana:5678123
//   lever:sweetgreen:0b1c...-...
//   ashby:ramp:9f0e...
//   usajobs:feed:812345600
//   adzuna:us:4455667788
//
// Greenhouse, Lever and Ashby ids re-fetch the posting straight from that
// company's board (only boards listed in companies.ts, so the id can't be used
// to fetch arbitrary URLs). USAJOBS and Adzuna results depend on the search
// that found them; they resolve only while still in the server's memory cache.
// When this returns null for those, the caller should ask for the job URL.

const FEED_SOURCES: JobSource[] = [
  "greenhouse",
  "lever",
  "ashby",
  "arbeitnow",
  "usajobs",
  "adzuna",
];

export interface ParsedJobId {
  source: JobSource;
  slug: string;
  nativeId: string;
}

/** Splits and checks a feed job id. Returns null for anything malformed. */
export function parseJobId(id: string): ParsedJobId | null {
  if (typeof id !== "string" || id.length > 300) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [source, slug] = parts;
  const nativeId = parts.slice(2).join(":");
  if (!FEED_SOURCES.includes(source as JobSource)) return null;
  if (!/^[\w.-]{1,100}$/.test(slug)) return null;
  if (!/^[\w.-]{1,200}$/.test(nativeId)) return null;
  return { source: source as JobSource, slug, nativeId };
}

/** True when this id can be re-fetched any time (not just from the cache). */
export function isStableJobId(id: string): boolean {
  const p = parseJobId(id);
  return !!p && (p.source === "greenhouse" || p.source === "lever" || p.source === "ashby");
}

/**
 * Looks up one posting. Returns null when the id is malformed, the board isn't
 * one we list, the posting is gone, or (USAJOBS/Adzuna) it left the cache.
 * Never throws.
 */
export async function getJobById(id: string): Promise<JobPosting | null> {
  if (!parseJobId(id)) return null;
  try {
    return await getJobByIdFromSources(id);
  } catch {
    return null;
  }
}
