// Indeed search URL + results scrape. Split out of indeed.ts so it can be
// imported by the BROWSER EXTENSION, which has neither Playwright nor Node
// types available: indeed.ts proper touches Buffer (resume upload) and
// Playwright handles, which fail the extension's typecheck. Nothing here
// depends on either — same "one implementation, two runtimes" split as
// collectFormQuestions in forms.ts.

/** A job card scraped from an Indeed results page. */
export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  /** Pay as Indeed printed it ("From $20 an hour"), or null when not shown. */
  pay: string | null;
  snippet: string;
  link: string;
  isIndeedApply: boolean;
}

// Omit the &l= param entirely when nationwide: an empty `&l=` triggers Indeed's
// "specify location" disambiguation page and the scrape then sees zero job
// beacons. Indeed paginates in steps of 10 via &start=; page 0 omits the param.
// Reconstructing the URL per page is more reliable than clicking "Next",
// because we navigate away to apply and would otherwise lose our place.
export function buildIndeedSearchUrl(query: string, loc: string, start = 0): string {
  const base = loc
    ? `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(loc)}`
    : `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}`;
  return start > 0 ? `${base}&start=${start}` : base;
}

// SELF-CONTAINED ON PURPOSE: no imports, no closures. Playwright serializes
// this into the page via evaluate(); the extension's content script calls it
// directly.
export function collectIndeedJobs(): ScrapedJob[] {
  return Array.from(document.querySelectorAll('[class*="job_seen_beacon"]')).map((card) => {
    const title =
      (card.querySelector('[class*="jobTitle"] a, [class*="jobTitle"] span') as HTMLElement | null)?.innerText?.trim() || "N/A";
    // `[class*="company"]` matched the whole header wrapper and swallowed the
    // location and transit line with it, so the company name is now read from
    // the specific testid / companyName class only.
    const company =
      (card.querySelector('[data-testid="company-name"], [class*="companyName"]') as HTMLElement | null)?.innerText?.trim() || "N/A";
    const location =
      (card.querySelector('[data-testid="text-location"], [class*="companyLocation"]') as HTMLElement | null)?.innerText?.trim() || "N/A";
    const snippet =
      (card.querySelector('[class*="snippet"], .job-snippet') as HTMLElement | null)?.innerText?.trim() || "N/A";
    // Pay lives in a differently-named pill on every layout revision, so match
    // the text rather than chase selectors.
    const payMatch = (card as HTMLElement).innerText.match(
      /(?:from\s+)?\$[\d,]+(?:\.\d{2})?(?:\s*(?:-|–|to)\s*\$?[\d,]+(?:\.\d{2})?)?(?:\s*(?:an?|per)\s+(?:hour|year|month|week)|\s*(?:hourly|annually|yearly))?/i,
    );
    const pay = payMatch ? payMatch[0].trim() : null;
    const linkEl = card.querySelector('[class*="jobTitle"] a');
    const href = linkEl?.getAttribute("href") ?? null;
    const link = href ? new URL(href, "https://www.indeed.com").href : "N/A";
    const cardText = (card as HTMLElement).innerText.toLowerCase();
    const isIndeedApply =
      cardText.includes("easily apply") || cardText.includes("indeed apply");
    return { title, company, location, pay, snippet, link, isIndeedApply };
  });
}
