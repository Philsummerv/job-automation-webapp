// Shared types, enums, and reporting-period helpers used by both the web app
// and (later) the Guided worker. Keep this dependency-free so it transpiles
// cleanly via Next's transpilePackages and is testable in plain Node.

// ─── Enums (value + human label) ────────────────────────────────────────────

export const ACTIVITY_METHODS = [
  { value: "online", label: "Online application" },
  { value: "in_person", label: "In person" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "job_fair", label: "Job fair" },
  { value: "networking", label: "Networking" },
] as const;
export type ActivityMethod = (typeof ACTIVITY_METHODS)[number]["value"];

export const ACTIVITY_RESULTS = [
  { value: "applied", label: "Applied" },
  { value: "interviewed", label: "Interviewed" },
  { value: "callback", label: "Callback" },
  { value: "offered", label: "Offer received" },
  { value: "rejected", label: "Rejected" },
  { value: "no_response", label: "No response" },
  { value: "pending", label: "Pending" },
] as const;
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number]["value"];

export type ActivitySource = "guided" | "self_directed";

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export function methodLabel(v: string): string {
  return ACTIVITY_METHODS.find((m) => m.value === v)?.label ?? v;
}
export function resultLabel(v: string): string {
  return ACTIVITY_RESULTS.find((r) => r.value === v)?.label ?? v;
}
export function dayLabel(v: number): string {
  return DAYS_OF_WEEK.find((d) => d.value === v)?.label ?? String(v);
}

// ─── US states (for DOL export headers / per-state templates) ────────────────

export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

// ─── DB row types (mirror the SQL migrations) ───────────────────────────────

export type SubscriptionStatus =
  | "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "none";

export interface Profile {
  user_id: string;
  full_name: string | null;
  state: string | null;
  weekly_target: number;
  reporting_period_start_day: number; // 0=Sun..6=Sat
  disclaimer_accepted_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  answer_template: AnswerTemplate | null;
  created_at: string;
}

// ─── Answer template (Guided extension autofill) ─────────────────────────────
// The user's saved autofill answers. `config` overrides fields on the
// extension's DEFAULT_CONFIG; `rules` are custom "if the question contains X,
// answer Y" matches that take priority over the built-in ruleset. Edited in the
// web app, read by the extension. Stored as JSONB on profiles.answer_template.

export interface CustomRule {
  /** Case-insensitive substring matched against the question text. */
  match: string;
  /** The answer to apply (plain text, or a Yes/No/option label). */
  answer: string;
}

export interface AnswerTemplate {
  config: Record<string, string>;
  rules: CustomRule[];
}

/** A field shown in the template editor (both the web app and the extension). */
export interface TemplateField {
  key: string;
  label: string;
  type?: "yesno" | "select";
  placeholder?: string;
  /** For type "select": the choices. `value` is the phrase the extension
   * matches against a form's live option labels at fill time. */
  options?: { label: string; value: string }[];
}

/** The curated standard fields exposed in the template editor. */
export const TEMPLATE_FIELDS: TemplateField[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "zipCode", label: "ZIP code" },
  { key: "city", label: "City" },
  { key: "educationLevel", label: "Education", placeholder: "keywords to match the option, e.g. Bachelor" },
  { key: "salary", label: "Desired salary" },
  { key: "yearsExperience", label: "Years of experience" },
  { key: "willingToRelocate", label: "Willing to relocate", type: "yesno" },
  { key: "authorizedToWork", label: "Authorized to work in the US", type: "yesno" },
  { key: "needsSponsorship", label: "Need visa sponsorship", type: "yesno" },
  { key: "usCitizen", label: "US citizen", type: "yesno" },
  { key: "is18OrOlder", label: "18 or older", type: "yesno" },
  { key: "hasDiploma", label: "Have HS diploma / GED", type: "yesno" },
  { key: "drivingLicense", label: "Have driver's license", type: "yesno" },
  {
    key: "veteranStatus",
    label: "Veteran status",
    type: "select",
    options: [
      { label: "Not a protected veteran", value: "not a protected veteran" },
      { label: "I am a protected veteran", value: "i identify as a protected veteran" },
      { label: "Prefer not to answer", value: "prefer not to answer" },
    ],
  },
  {
    key: "disabilityStatus",
    label: "Disability status",
    type: "select",
    options: [
      { label: "No, I don't have a disability", value: "no i do not have a disability" },
      { label: "Yes, I have a disability", value: "yes i have a disability" },
      { label: "Prefer not to answer", value: "prefer not to answer" },
    ],
  },
  { key: "linkedin", label: "LinkedIn URL" },
];

export interface ActivityLogEntry {
  id: string;
  user_id: string;
  run_id: string | null;
  date: string; // 'YYYY-MM-DD'
  employer_name: string;
  job_title: string | null;
  method: ActivityMethod;
  url: string | null;
  result: ActivityResult;
  notes: string | null;
  source: ActivitySource;
  evidence_path: string | null; // Storage object path in the `evidence` bucket
  reporting_period: string | null; // snapshot 'YYYY-MM-DD' of the period start at insert time
  created_at: string;
}

// ─── Date + reporting-period helpers ─────────────────────────────────────────
// All dates are handled as *local* calendar dates (no timezone shifting), since
// a claimant's reporting week is a calendar concept, not an instant in time.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse 'YYYY-MM-DD' into a local Date at midnight (no UTC drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Start (midnight, local) of the reporting period containing `date`. */
export function startOfReportingPeriod(date: Date, startDay: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/** Inclusive end (start + 6 days) of a reporting period. */
export function endOfReportingPeriod(start: Date): Date {
  const e = new Date(start);
  e.setDate(e.getDate() + 6);
  return e;
}

/** Stable key ('YYYY-MM-DD' of the period start) for grouping/sorting. */
export function reportingPeriodKey(date: Date, startDay: number): string {
  return toISODate(startOfReportingPeriod(date, startDay));
}

/** Human label like "Jun 29 – Jul 5, 2025". */
export function formatPeriodRange(start: Date): string {
  const end = endOfReportingPeriod(start);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startStr} – ${endStr}`;
}

/** Group activity entries by reporting period, newest period first. */
export function groupByReportingPeriod(
  entries: ActivityLogEntry[],
  startDay: number,
): { key: string; start: Date; label: string; entries: ActivityLogEntry[] }[] {
  const buckets = new Map<string, ActivityLogEntry[]>();
  for (const e of entries) {
    const key = reportingPeriodKey(parseISODate(e.date), startDay);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, es]) => {
      const start = parseISODate(key);
      return {
        key,
        start,
        label: formatPeriodRange(start),
        entries: es.sort((a, b) => (a.date < b.date ? 1 : -1)),
      };
    });
}

/** Whether an active subscription/trial entitles the user to premium features. */
export function isEntitled(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active";
}

/**
 * Emitted by the Guided automation core (packages/automation) on each verified
 * application submit. The worker (M2 Stage B) maps this to an ActivityLogEntry
 * insert; the Stage A console driver just prints it.
 */
export interface GuidedActivityEvent {
  employer_name: string;
  job_title: string | null;
  url: string | null;
  /** YYYY-MM-DD */
  date: string;
  method: "online";
  result: "applied";
  source: "guided";
  notes: string | null;
  /** Stage A: local screenshot file path; later: evidence-bucket path. */
  screenshotPath?: string | null;
}
