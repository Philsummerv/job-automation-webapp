// The jurisdiction directory — the only hand-curated data the Rules Assistant
// needs. One row per UI program: who runs it, how to reach them, and which
// domains the assistant is allowed to search for that state.
//
// This file seeds four things:
//   1. `allowed_domains` for the web search call (1-3 entries, never 53)
//   2. Every phone number the assistant falls back to
//   3. The "I haven't checked your state" answer, which is still useful
//   4. `scripts/check-links.mjs`, which HEADs every URL in here
//
// RULE: never add a row from memory. Every field must come from a page someone
// actually opened, and `verified_on` is the day they opened it. A row with a
// guessed phone number is worse than no row — the fallback for a missing row is
// honest ("I don't have your state yet"), the fallback for a wrong number is a
// person calling a dead line about their benefits.
//
// Keep dependency-free, like the rest of @jobassistui/shared.

export interface Jurisdiction {
  abbr: string;
  name: string;
  /** Official agency name, as the agency writes it. */
  agency_name: string;
  /**
   * Claimant-facing phone number, as published. Required — a row without a
   * verified number should not exist.
   */
  agency_phone: string;
  /**
   * Registrable domains for the search allowlist. 1-3 entries, most specific
   * first. Subdomains are covered automatically, so "ny.gov" also matches
   * "dol.ny.gov". Plain hostnames only: no scheme, no path, no IPs.
   */
  domains: string[];
  /** The claimant handbook or its nearest equivalent. */
  handbook_url: string;
  /** The page that states the work-search rules, if the state has a dedicated one. */
  work_search_url?: string;
  /**
   * Set when the state does NOT have one statewide activity count. Short-
   * circuits count questions before any search: we render this and the official
   * lookup link rather than letting a search surface one region's number and
   * report it as statewide.
   */
  varies?: {
    by: string;
    lookup_label: string;
    lookup_url: string;
  };
  /** YYYY-MM-DD. The day a human opened these URLs and confirmed these values. */
  verified_on: string;
}

// ─── The directory ──────────────────────────────────────────────────────────
//
// Partial on purpose. A jurisdiction that hasn't been researched is ABSENT, and
// the assistant says so honestly. It is never represented by a guessed row.

export const DIRECTORY: Record<string, Jurisdiction> = {
  NY: {
    abbr: "NY",
    name: "New York",
    agency_name: "New York State Department of Labor",
    agency_phone: "1-888-209-8124",
    domains: ["dol.ny.gov"],
    handbook_url:
      "https://dol.ny.gov/system/files/documents/2026/01/ui-claimant-handbook_1-26.pdf",
    work_search_url: "https://dol.ny.gov/services/ui/wsr",
    verified_on: "2026-08-29",
  },

  TX: {
    abbr: "TX",
    name: "Texas",
    agency_name: "Texas Workforce Commission",
    agency_phone: "1-800-939-6631",
    domains: ["twc.texas.gov"],
    handbook_url:
      "https://www.twc.texas.gov/sites/default/files/ui/docs/unemployment-benefits-handbook-twc.pdf",
    // Texas does not have one statewide number — it is set per Workforce
    // Development Board area. This is exactly why `varies` exists.
    varies: {
      by: "Workforce Development Board area",
      lookup_label: "Required Number of Work Search Activities by County",
      lookup_url:
        "https://www.twc.texas.gov/programs/unemployment-benefits/required-number-work-search-activities-county",
    },
    verified_on: "2026-08-29",
  },

  FL: {
    abbr: "FL",
    name: "Florida",
    agency_name: "Florida Department of Commerce — Reemployment Assistance",
    // 1-833-FL-APPLY. Verified against floridajobs.org, not recalled — an
    // earlier draft of this row had a plausible-looking wrong number.
    agency_phone: "1-833-352-7759",
    domains: ["floridajobs.org", "floridacommerce.gov"],
    handbook_url:
      "https://www.floridajobs.org/docs/default-source/reemployment-assistance-center/unemployment/bri/bri_english.pdf",
    // Florida's count depends on county population (5/week, 3/week in
    // designated smaller counties), so it takes the same treatment as Texas.
    varies: {
      by: "county",
      lookup_label: "Reemployment Assistance Benefit Rights Information handbook",
      lookup_url:
        "https://www.floridajobs.org/docs/default-source/reemployment-assistance-center/unemployment/bri/bri_english.pdf",
    },
    verified_on: "2026-08-29",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getJurisdiction(abbr: string | null | undefined): Jurisdiction | null {
  if (!abbr) return null;
  return DIRECTORY[abbr.toUpperCase()] ?? null;
}

/** True when we have a verified contact row — NOT a claim that we know its rules. */
export function hasDirectoryEntry(abbr: string | null | undefined): boolean {
  return getJurisdiction(abbr) !== null;
}

/**
 * The search allowlist for a jurisdiction. Returns null when we have no row,
 * which must short-circuit to the "I don't have your state yet" answer rather
 * than searching the open web.
 */
export function allowedDomainsFor(abbr: string): string[] | null {
  const j = getJurisdiction(abbr);
  if (!j || j.domains.length === 0) return null;
  return j.domains;
}

/** Jurisdictions researched so far, for the coverage badge on the state step. */
export function coveredJurisdictions(): string[] {
  return Object.keys(DIRECTORY).sort();
}

/**
 * Count questions short-circuit here for states with no single statewide
 * number. Cheaper than searching and removes the chance of reporting one
 * region's number as statewide.
 */
export function variesFor(abbr: string): Jurisdiction["varies"] | null {
  return getJurisdiction(abbr)?.varies ?? null;
}
