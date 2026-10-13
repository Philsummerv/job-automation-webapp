import { US_STATES, type JobPosting } from "@jobassistui/shared";

// Query, location and US filters for the job feed. Pure functions, no I/O.
// Used by sources.ts (search ranking) and refresh.ts (the us_likely column).

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
export function isLikelyUS(job: Pick<JobPosting, "location">): boolean {
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

/**
 * The same test as placeMatches, as Postgres patterns for the job index:
 * `location ILIKE ANY(like)` OR `location ~ ANY(regex)`. Never narrower than
 * placeMatches, which still runs on every result afterwards.
 */
export function locationSqlPatterns(location: string): { like: string[]; regex: string[] } {
  const like: string[] = [];
  const regex: string[] = [];
  const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const parts = location.trim().split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    const upper = part.toUpperCase();
    if (STATE_BY_CODE.has(upper)) {
      regex.push(`\\m${upper}\\M`);
      like.push(`%${esc(STATE_BY_CODE.get(upper)!)}%`);
      continue;
    }
    if (STATE_BY_NAME.has(p)) {
      like.push(`%${esc(p)}%`);
      regex.push(`\\m${STATE_BY_NAME.get(p)}\\M`);
      continue;
    }
    if (p.length > 1) like.push(`%${esc(p)}%`);
  }
  return { like, regex };
}

/**
 * Postgres's English stop words (snowball english.stop), 2+ letters. Full-text
 * search drops these from both the query and the documents, so "IT" can't be
 * found with a tsquery. tokens() keeps most of them, so search_job_postings
 * matches them with a regex instead.
 */
const PG_STOP_WORDS = new Set(
  (
    "me my myself we our ours ourselves you your yours yourself yourselves he him his " +
    "himself she her hers herself it its itself they them their theirs themselves what " +
    "which who whom this that these those am is are was were be been being have has had " +
    "having do does did doing an the and but if or because as until while of at by for " +
    "with about against between into through during before after above below to from up " +
    "down in out on off over under again further then once here there when where why how " +
    "all any both each few more most other some such no nor not only own same so than too " +
    "very can will just don should now"
  ).split(" "),
);

/** A Postgres regex: `word` appears as a whole word (case is handled by ~*). */
function wordRe(word: string): string {
  const esc = word.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`);
  return `(?=.*(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$))`;
}

/** A Postgres regex that needs every word in `words`, in any order. */
function allWordsRe(words: string[]): string {
  return `^${words.map(wordRe).join("")}`;
}

export interface IndexQuery {
  /** websearch text for the GIN index: the non-stop words of each phrase, OR'd. */
  query: string;
  /** websearch text for title_hit: only phrases with no stop words. */
  titleQuery: string;
  /** Title regexes, one per phrase that has a stop word (needs all its words). */
  titleRes: string[];
  /**
   * Regexes over title + description: the stop words of each phrase that also
   * has normal words. Empty when some phrase has no stop words (then a row
   * may have matched that phrase, and nothing extra is needed).
   */
  bodyRes: string[];
}

/**
 * Turns parseQuery() phrases into search_job_postings() arguments. Phrases
 * made only of Postgres stop words ("IT") are matched on the title with a
 * regex. Stop words inside a longer phrase ("IT support") must also appear
 * somewhere in the job text.
 */
export function indexQueryParts(phrases: string[][]): IndexQuery {
  const query: string[] = [];
  const titleQuery: string[] = [];
  const titleRes: string[] = [];
  const bodyRes: string[] = [];
  let someFtsPhraseHasNoStop = false;
  for (const phrase of phrases) {
    const normal = phrase.filter((t) => !PG_STOP_WORDS.has(t));
    const stop = phrase.filter((t) => PG_STOP_WORDS.has(t));
    if (stop.length > 0) titleRes.push(allWordsRe(phrase));
    else titleQuery.push(phrase.join(" "));
    if (normal.length > 0) {
      query.push(normal.join(" "));
      if (stop.length > 0) bodyRes.push(allWordsRe(stop));
      else someFtsPhraseHasNoStop = true;
    }
  }
  return {
    query: query.join(" or "),
    titleQuery: titleQuery.join(" or "),
    titleRes,
    bodyRes: someFtsPhraseHasNoStop ? [] : bodyRes,
  };
}

export function dedupeKey(j: JobPosting): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${norm(j.company)}|${norm(j.title)}|${norm(j.location)}`;
}
