// Types for the AI job-search assistant: the parsed resume, normalized job
// postings, match scores and the apply kit. Plain data only, no runtime deps,
// so both server code and client components can import them.

// ─── Resume profile ─────────────────────────────────────────────────────────

export interface ResumeWorkItem {
  employer: string;
  title: string;
  /** Free text exactly as on the resume, e.g. "Mar 2019 – Jun 2023". */
  dates: string;
  location?: string;
  bullets: string[];
}

export interface ResumeEducationItem {
  school: string;
  /** e.g. "B.S. Biology", "High school diploma", "GED". */
  credential: string;
  dates?: string;
}

/** What the AI extracts from a resume. Every field comes from the resume text. */
export interface ResumeProfile {
  name: string;
  /** One line, e.g. "Warehouse lead with 8 years in shipping and receiving". */
  headline: string;
  email?: string;
  phone?: string;
  /** Places the person lives or wants to work. */
  locations: string[];
  /** Job titles held or targeted, most relevant first. Feeds job search. */
  titles: string[];
  skills: string[];
  /** Total years of work experience, best estimate from the dates. */
  yearsExperience: number | null;
  certifications: string[];
  workHistory: ResumeWorkItem[];
  education: ResumeEducationItem[];
}

/** Row shape of public.resume_profiles (migration 0006). */
export interface ResumeProfileRow {
  user_id: string;
  raw_text: string | null;
  profile: ResumeProfile | null;
  file_name: string | null;
  updated_at: string;
}

export function emptyResumeProfile(): ResumeProfile {
  return {
    name: "",
    headline: "",
    locations: [],
    titles: [],
    skills: [],
    yearsExperience: null,
    certifications: [],
    workHistory: [],
    education: [],
  };
}

// ─── Job feed ───────────────────────────────────────────────────────────────

// Remotive is deliberately NOT a source: its API terms forbid showing its
// jobs behind a sign-up, and the feed is signed-in only.
export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "arbeitnow"
  | "usajobs"
  | "adzuna"
  | "url"
  | "pasted";

export interface JobPosting {
  /**
   * Stable id, "<source>:<company slug or feed>:<native id>". Safe to put in a
   * URL with encodeURIComponent. Never contains user input for feed jobs.
   */
  id: string;
  source: JobSource;
  company: string;
  title: string;
  /** Display string, e.g. "Syracuse, NY" or "Remote (US)". May be "". */
  location: string;
  remote: boolean;
  /** The public posting page. */
  url: string;
  /** Where the person actually applies. Often the same as url. */
  applyUrl: string;
  /** ISO timestamp, or null when the source doesn't say. */
  postedAt: string | null;
  /** Plain text (HTML already stripped), capped in length. */
  descriptionText: string;
}

export interface JobMatch {
  jobId: string;
  /** 0–100. */
  score: number;
  /** One short sentence, plain words. */
  reason: string;
  /** Two or three short sentences: what the job is, pay/hours if posted, the main must-have. */
  summary?: string;
}

// ─── Apply kit ──────────────────────────────────────────────────────────────

export interface TailoredExperience {
  employer: string;
  title: string;
  dates: string;
  bullets: string[];
}

export interface ApplyKit {
  /** 0–100. */
  matchScore: number;
  tailoredResume: {
    summary: string;
    experience: TailoredExperience[];
    skills: string[];
  };
  coverLetter: string;
  answers: { question: string; answer: string }[];
  /** Keywords from the posting that the resume does not show. Gaps, not claims. */
  missingKeywords: string[];
  /** Things the person should check before sending: claims the AI could not tie to the resume. */
  checkThese: string[];
}

// ─── AI usage ───────────────────────────────────────────────────────────────

export type AiUsageKind = "resume_parse" | "job_match" | "apply_kit" | "auto_apply" | "other";

/** Max AI calls per user per day (UTC day). */
export const AI_DAILY_LIMIT = 40;
