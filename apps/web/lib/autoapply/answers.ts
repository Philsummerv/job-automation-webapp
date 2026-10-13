import type { AnswerTemplate, JobPosting, ResumeProfile } from "@jobassistui/shared";
import {
  HONESTY_RULE,
  UNTRUSTED_DATA_RULE,
  WRITE_MODEL,
  callJson,
  wrapUntrusted,
  type JsonSchema,
} from "@/lib/ai/client";
import type { ScannedField } from "./scan";

// Decides what goes in each field of an application form. Server-only.
//
// Order:
//  1. Deterministic answers from the person's saved details (name, email,
//     phone, location, LinkedIn, current job, answer template, EEO choices).
//  2. Questions we must never guess (pay, start date, references, SSN,
//     criminal history, past work for this employer, consent boxes, ...) go
//     straight to "needs you".
//  3. One AI call for everything left, using the resume and the job.
//
// Rule: never invent a fact. Unknown means blank, and the person is told.

/** What the run knows about the person. Built by applicant.ts. */
export interface ApplicantInfo {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  linkedin: string;
  currentCompany: string;
  currentTitle: string;
  resume: ResumeProfile;
  rawResumeText: string | null;
  template: AnswerTemplate | null;
}

export type Decision =
  /** Put this in the field. For choice fields it is one of field.options (or, for a combobox, text to search). */
  | { type: "answer"; value: string; source: "profile" | "template" | "eeo" | "ai"; overwrite: boolean }
  /** Upload the resume here. */
  | { type: "resume" }
  /** Leave it for the person, with a short reason. */
  | { type: "skip"; reason: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

const NEG = /\b(not|no|dont|do not|never|without|decline|prefer not)\b/;

/**
 * Picks the option that best matches an answer. Returns null when nothing is
 * a clear match. Keeps "not" and "no" straight, so "not a protected veteran"
 * never lands on "I am a protected veteran".
 */
export function bestOption(answer: string, options: string[]): string | null {
  const a = norm(answer);
  if (!a) return null;
  let best: string | null = null;
  let bestScore = 0;
  const aTokens = a.split(" ").filter((t) => t.length > 1 || /\d/.test(t));
  for (const opt of options) {
    const o = norm(opt);
    if (!o) continue;
    let score = 0;
    if (o === a) score = 100;
    else if (/^(yes|no)$/.test(a)) {
      // Yes/No answers: the option must start with that word.
      score = new RegExp(`^${a}\\b`).test(o) ? 90 : 0;
    } else if (o.startsWith(a) || a.startsWith(o)) score = 80;
    else if (o.includes(a) || (a.includes(o) && o.length > 3)) score = 70;
    else {
      const hit = aTokens.filter((t) => o.split(" ").includes(t)).length;
      score = aTokens.length ? (hit / aTokens.length) * 60 : 0;
    }
    if (score > 0 && NEG.test(a) !== NEG.test(o) && !/^(yes|no)$/.test(a)) score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return bestScore >= 45 ? best : null;
}

const DECLINE =
  /decline|prefer not|don.?t wish|do not wish|not wish to|choose not|rather not|not to (answer|disclose|say|self)|i don.?t want to answer/i;

function declineOption(options: string[]): string | null {
  return options.find((o) => DECLINE.test(o)) ?? null;
}

// ─── Never-guess list ──────────────────────────────────────────────────────

const NEVER_GUESS: { re: RegExp; reason: string }[] = [
  { re: /salary|compensation|pay (rate|range|expectation)|desired (pay|wage|rate)|hourly (rate|wage|pay)|expected pay|wage expectation/i, reason: "Pay is your call. Add a desired salary to your answer template, or type it here." },
  { re: /\breferences?\b/i, reason: "References have to come from you." },
  { re: /start date|when can you start|available to start|earliest (start|date)|notice period|availability to start/i, reason: "Only you know when you can start." },
  { re: /social security|\bssn\b/i, reason: "Never filled in by us." },
  { re: /date of birth|birth ?date|\bdob\b/i, reason: "Never filled in by us." },
  { re: /convicted|criminal|felony|misdemeanor|background check|arrest/i, reason: "Only you can answer this." },
  { re: /(currently|previously|ever|formerly).{0,40}(employed|worked|work) (by|for|at)|former employee|worked (here|for us)/i, reason: "This asks about your history with this employer. Only you know." },
  { re: /how did you (hear|find|learn)|where did you (hear|find|see)|source of (your )?application/i, reason: "Only you know how you found this job." },
  { re: /non-?compete|security clearance|clearance level/i, reason: "Only you can answer this." },
  { re: /\bsecret\b|puzzle|decode|challenge/i, reason: "This is a test for you to answer." },
  { re: /cover letter/i, reason: "Add a cover letter here if you want one. The Apply kit can write one." },
  { re: /\b(pronouns?)\b/i, reason: "Only you can answer this." },
];

/** Agreement, consent and "contact me" boxes. Never ticked for the person. */
const CONSENT =
  /agree|consent|acknowledg|i understand|privacy|terms|policy|certify|attest|confirm that|marketing|contact me|future (job|opportunit)|text messages?|\bsms\b|whatsapp|communications?|subscribe|newsletter|talent (community|network|pool)/i;

// ─── Template yes/no questions ──────────────────────────────────────────────

// Order matters: work authorization is checked before sponsorship, and a
// question that mixes the two is never answered (see templateYesNoFor).
const TEMPLATE_YESNO: { key: string; re: RegExp; ask: string }[] = [
  { key: "authorizedToWork", re: /authori[sz]ed to work|legally (authori[sz]ed|able|eligible|permitted)|right to work|eligible to work|work authori[sz]ation|permitted to work/i, ask: "work authorization" },
  { key: "needsSponsorship", re: /sponsor/i, ask: "visa sponsorship" },
  { key: "usCitizen", re: /u\.?s\.? citizen|citizen of the united states/i, ask: "citizenship" },
  // Age only. "18 months of experience" or "18+ months" must not match.
  {
    key: "is18OrOlder",
    re: /\b(18|eighteen)\s*(years?\s*(of age|old|or older)|or older|or over)|\b(18|eighteen)\s*\+(?!\s*(months?|years?\s+(of|in)\b))|\b(over|under|at least) (the age of )?(18|eighteen)\b(?!\s*(\+|months?|years?\s+(of|in)\b))|\bage of (18|eighteen)\b|legal (working )?age|age of majority/i,
    ask: "being 18 or older",
  },
  { key: "drivingLicense", re: /driv(er|ing)'?s?'? licen[cs]e|drivers? licen[cs]e/i, ask: "a driver's license" },
  { key: "willingToRelocate", re: /relocat/i, ask: "relocating" },
  { key: "hasDiploma", re: /high school|diploma|\bged\b/i, ask: "a diploma or GED" },
];

const SPONSOR_RE = /sponsor/i;
/** "...without sponsorship", "...not require sponsorship": the yes/no flips. */
const NEGATED_SPONSOR_RE = /\b(without|not|no need|no longer)\b.{0,40}sponsor/i;

/**
 * Which template yes/no fact a question asks about. "mixed" means it asks
 * about work authorization and sponsorship together, or flips the
 * sponsorship question ("authorized to work without sponsorship?"). A plain
 * Yes or No from the template could mean the opposite there, so the person
 * answers it.
 */
function templateYesNoFor(label: string): (typeof TEMPLATE_YESNO)[number] | "mixed" | null {
  if (SPONSOR_RE.test(label)) {
    if (TEMPLATE_YESNO[0].re.test(label) || NEGATED_SPONSOR_RE.test(label)) return "mixed";
  }
  return TEMPLATE_YESNO.find((t) => t.re.test(label)) ?? null;
}

const MIXED_REASON = "This asks about work authorization and sponsorship together. Please answer it yourself.";

/** "Do you have...?", "Are you...?" and the like. */
function isYesNoQuestion(label: string): boolean {
  return /^\s*(are|do|does|did|have|has|had|can|could|will|would|is|was|were|should|may)\b/i.test(label);
}

const EEO_RE =
  /gender|\bsex\b|race|ethnic|hispanic|latin[oax]|veteran|disabilit|sexual orientation|transgender|lgbt|demographic|self-identif|eeo/i;

function cfg(app: ApplicantInfo, key: string): string {
  return (app.template?.config?.[key] ?? "").trim();
}

function yesNo(v: string): "Yes" | "No" | null {
  if (/^y(es)?$/i.test(v)) return "Yes";
  if (/^no?$/i.test(v)) return "No";
  return null;
}

/** "Byrne Dairy: Bob Jones" lines → the contact at this employer, if any. */
function contactAt(app: ApplicantInfo, key: string, company: string): string | null {
  const c = norm(company);
  if (!c) return null;
  for (const line of cfg(app, key).split(/\n|;/)) {
    const [emp, ...rest] = line.split(":");
    const e = norm(emp ?? "");
    if (e && (e === c || c.includes(e) || e.includes(c))) return rest.join(":").trim() || "";
  }
  return null;
}

function isChoice(f: ScannedField): boolean {
  return f.kind === "select" || f.kind === "radio" || f.kind === "checkbox" || f.kind === "combobox";
}

/** Turns an intended answer into a decision for this field (matching options for choice fields). */
function answerFor(
  f: ScannedField,
  value: string,
  source: "profile" | "template" | "eeo" | "ai",
  overwrite: boolean,
): Decision {
  if (!value.trim()) return { type: "skip", reason: "We don't have this. Please fill it in." };
  if (f.kind === "file") return { type: "skip", reason: "Attach a file here if you want." };
  if (isChoice(f) && f.options.length && !(f.kind === "checkbox" && f.options[0] === "(check this box)")) {
    const opt = bestOption(value, f.options);
    if (!opt) return { type: "skip", reason: `None of the choices matched "${value}". Please pick one.` };
    return { type: "answer", value: opt, source, overwrite };
  }
  return { type: "answer", value, source, overwrite };
}

const LOCATIONISH =
  /^(current )?location|^location|\bcity\b|where (are you|do you) (live|located|based)|where do you plan on working|working from|based in|home (town|city)|current (city|address city)/i;

/**
 * Deterministic pass. Returns a decision, or null when the AI should try.
 */
export function decideDeterministic(f: ScannedField, app: ApplicantInfo, job: JobPosting | null): Decision | null {
  const label = f.label;
  const l = label.toLowerCase();
  const h = f.hint.toLowerCase();
  const company = job?.company ?? "";
  const textLike = f.kind === "text" || f.kind === "textarea";

  // Files.
  if (f.kind === "file") {
    if (/autofill|auto-fill|parse/i.test(label)) return { type: "skip", reason: "" };
    if (/resume|r[ée]sum[ée]|\bcv\b/i.test(label) || /\bresume\b/.test(h)) return { type: "resume" };
    if (/cover/i.test(label)) return { type: "skip", reason: "Add a cover letter here if you want one. The Apply kit can write one." };
    return { type: "skip", reason: "Attach a file here if this asks for one." };
  }

  // Single checkboxes: agreements are never ticked.
  if (f.kind === "checkbox" && f.options[0] === "(check this box)") {
    if (CONSENT.test(label)) return { type: "skip", reason: "Read this and tick it yourself if you agree." };
    const t = templateYesNoFor(label);
    if (t && t !== "mixed") {
      const v = yesNo(cfg(app, t.key));
      if (v === "Yes") return { type: "answer", value: "(check this box)", source: "template", overwrite: false };
      if (v === "No") return { type: "skip", reason: "" };
    }
    return { type: "skip", reason: "Tick this yourself if it applies to you." };
  }
  // Radio/checkbox groups that are pure consent ("I agree" / "I don't agree").
  if ((f.kind === "radio" || f.kind === "checkbox") && CONSENT.test(label) && !EEO_RE.test(label)) {
    return { type: "skip", reason: "Read this and choose yourself." };
  }

  // Custom rules from the answer template win over built-ins (but not over identity fields below).
  // Demographic questions skip the identity pass, so "Race/Ethnicity" never
  // gets an address in it.
  const eeoLabel = EEO_RE.test(label) && !/\bname\b|e-?mail|phone/.test(l);
  const identity = eeoLabel ? undefined : identityAnswer(f, app, l, h, textLike);
  if (identity !== undefined) return identity;

  for (const r of app.template?.rules ?? []) {
    if (r.match.trim() && l.includes(r.match.trim().toLowerCase()) && r.answer.trim()) {
      return answerFor(f, r.answer.trim(), "template", false);
    }
  }

  // Referrals / people you know here, answered per employer.
  if (/referr|referral/i.test(label) || /relative|acquaint|know (anyone|someone)|family member/i.test(label)) {
    const key = /referr|referral/i.test(label) ? "referralCompanies" : "relativeCompanies";
    const contact = contactAt(app, key, company);
    const asksName = /name|who/i.test(label) && textLike;
    if (contact !== null) return answerFor(f, asksName ? contact : "Yes", "template", false);
    if (asksName) return { type: "skip", reason: "" };
    if (cfg(app, key) || f.options.some((o) => /^no\b/i.test(o))) {
      // The person keeps a list of referrals; this employer isn't on it.
      if (cfg(app, key)) return answerFor(f, "No", "template", false);
    }
    return { type: "skip", reason: "Only you know if someone referred you here." };
  }

  // EEO / demographic questions.
  if (EEO_RE.test(label) && (isChoice(f) || textLike)) {
    let pref = "";
    if (/veteran/i.test(label)) pref = cfg(app, "veteranStatus");
    else if (/disabilit/i.test(label)) pref = cfg(app, "disabilityStatus");
    if (pref && isChoice(f)) {
      const d = answerFor(f, pref, "eeo", false);
      if (d.type === "answer") return d;
    }
    if (isChoice(f) && f.kind !== "combobox") {
      const dec = declineOption(f.options);
      if (dec) return { type: "answer", value: dec, source: "eeo", overwrite: false };
    }
    if (f.kind === "combobox") return { type: "answer", value: "Decline", source: "eeo", overwrite: false };
    return { type: "skip", reason: f.required ? "A self-ID question with no 'prefer not to say' choice. Your call." : "" };
  }

  // Never-guess questions.
  for (const ng of NEVER_GUESS) {
    if (ng.re.test(label)) {
      if (/salary|compensation|pay|wage|hourly/i.test(ng.re.source) && cfg(app, "salary")) {
        return answerFor(f, cfg(app, "salary"), "template", false);
      }
      return { type: "skip", reason: ng.reason };
    }
  }

  // Yes/no facts from the answer template. Never guessed when unset. Only for
  // choice fields, or text fields that ask a yes/no question ("Which high
  // school did you attend?" is not one).
  if (isChoice(f) || isYesNoQuestion(label)) {
    const t = templateYesNoFor(label);
    if (t === "mixed") return { type: "skip", reason: MIXED_REASON };
    if (t) {
      const v = yesNo(cfg(app, t.key));
      if (v) return answerFor(f, v, "template", false);
      return {
        type: "skip",
        reason: `Your answer template doesn't say about ${t.ask}. Pick here, and add it to your template for next time.`,
      };
    }
  }

  // Other template fields.
  if (/education|degree|highest level/i.test(label) && cfg(app, "educationLevel")) {
    return answerFor(f, cfg(app, "educationLevel"), "template", false);
  }
  if (/time ?zone/i.test(label) && cfg(app, "timeZone")) return answerFor(f, cfg(app, "timeZone"), "template", false);

  return null;
}

/** True when the resume's latest job has no end date ("2021 - Present"). */
function stillWorking(app: ApplicantInfo): boolean {
  const dates = app.resume.workHistory?.[0]?.dates ?? "";
  return /\b(present|current|now|today)\b/i.test(dates);
}

/** Name, contact and location fields. `undefined` = not an identity field. */
function identityAnswer(f: ScannedField, app: ApplicantInfo, l: string, h: string, textLike: boolean): Decision | null | undefined {
  const put = (v: string, overwrite = true) =>
    v.trim() ? answerFor(f, v, "profile", overwrite) : { type: "skip" as const, reason: "We don't have this. Please fill it in." };
  const cityState = [app.city, app.state].filter(Boolean).join(", ");

  if (textLike) {
    if (/preferred (first )?name|nickname/.test(l)) return put(app.firstName, false);
    if (/first name|given name|forename/.test(l) || /given-name|first_name|firstname/.test(h)) return put(app.firstName);
    if (/last name|surname|family name/.test(l) || /family-name|last_name|lastname/.test(h)) return put(app.lastName);
    if (/^(full |legal |your )?name$/.test(l.trim()) || /\b(name|_systemfield_name)\b/.test(h.split(" ").slice(1, 2).join(" "))) return put(app.fullName);
    if (/e-?mail/.test(l) || /\bemail\b/.test(h)) return /confirm|re-?enter/.test(l) ? put(app.email) : put(app.email);
    if (/phone|mobile|cell/.test(l) || /^tel\b/.test(h)) return put(app.phone);
    if (/linkedin/.test(l)) return app.linkedin ? put(app.linkedin) : { type: "skip", reason: "Add your LinkedIn link if you have one." };
    if (/zip|postal/.test(l)) return put(app.zip);
    if (/^state\b|state\/province|^province/.test(l)) return put(app.state);
    if (/^country\b/.test(l)) return put(app.country || "United States");
    if (/street|address line|^address/.test(l)) return { type: "skip", reason: "We don't keep your street address. Please type it." };
    if (/^city\b/.test(l)) return put(app.city);
    if (LOCATIONISH.test(l)) return put(cityState);
    // Last job: fine to fill. Current job: only when the resume says the
    // latest job is still going ("2021 - Present"). Most people here are out
    // of work, and "Current company: X" would say they still work there.
    if (/(most recent|previous|prior|last) (company|employer)/.test(l)) return put(app.currentCompany, false);
    if (/(most recent|previous|prior|last) (job )?(title|role|position)/.test(l)) return put(app.currentTitle, false);
    const asksCompany = /current (company|employer)|present employer/.test(l);
    const asksTitle = /current (job )?(title|role|position)/.test(l);
    if (asksCompany || asksTitle) {
      if (!stillWorking(app)) {
        return { type: "skip", reason: "Leave blank if you're not working now, or enter your last job." };
      }
      return put(asksCompany ? app.currentCompany : app.currentTitle, false);
    }
    if (/website|portfolio|github|twitter|personal (site|url)/.test(l)) return { type: "skip", reason: "Add a link here if you have one." };
    return undefined;
  }

  if (f.kind === "combobox" || f.kind === "select") {
    if (/country/.test(l) && !/countries|other country/.test(l)) return put(app.country || "United States");
    if (/^state\b|state\/province|^province/.test(l)) return put(app.state);
    if (LOCATIONISH.test(l)) return put(cityState);
  }
  return undefined;
}

// ─── AI pass ───────────────────────────────────────────────────────────────

const AI_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "answer", "reason"],
        properties: {
          id: { type: "string" },
          answer: { type: ["string", "null"] },
          reason: { type: "string" },
        },
      },
    },
  },
};

const AI_SYSTEM = [
  "You fill in a job application form for a real person, from their resume and saved answers.",
  "For each field you get: id, kind, label, required, and (for choice fields) options.",
  "Return one entry per field id: either an answer, or answer null with a short reason in plain everyday words (under 15 words) telling the person what to do.",
  "For select, radio, checkbox and combobox fields with options, the answer must be copied exactly from the options list.",
  "For text fields keep it short. For textarea questions about experience, write 2 to 4 plain sentences in first person, using only facts from the resume.",
  "Return null (leave it for the person) when the answer is not clearly supported by the resume, the saved answers or the job posting. Never guess.",
  "Always null: salary or pay, start date or availability, references, SSN, date of birth, criminal history, work authorization or visa or citizenship, age, disability, veteran status, anything about the person's past with this specific employer, how they heard about the job, agreeing to terms or consent, and any puzzle, test or task.",
  "Yes/no questions about experience or skills: answer Yes only when the resume clearly shows it; answer No only when the resume clearly shows it is missing (for example a stated number of years is clearly more than the resume's total); otherwise null.",
  "Years-of-experience number fields: answer only when the resume dates support a number; use whole numbers.",
  "The reason field: for answers, a few words on where it came from (e.g. 'From your resume'); for null, what the person should do.",
  HONESTY_RULE,
  UNTRUSTED_DATA_RULE,
].join("\n");

function compactResume(app: ApplicantInfo): string {
  const r = app.resume;
  const lines: string[] = [];
  if (r.name) lines.push(`Name: ${r.name}`);
  if (r.headline) lines.push(`Headline: ${r.headline}`);
  if (r.locations?.length) lines.push(`Locations: ${r.locations.join("; ")}`);
  if (r.yearsExperience != null) lines.push(`Total years of experience: ${r.yearsExperience}`);
  if (r.titles?.length) lines.push(`Titles: ${r.titles.join("; ")}`);
  if (r.skills?.length) lines.push(`Skills: ${r.skills.slice(0, 40).join(", ")}`);
  if (r.certifications?.length) lines.push(`Certifications: ${r.certifications.join("; ")}`);
  for (const w of (r.workHistory ?? []).slice(0, 8)) {
    lines.push(`Job: ${w.title} at ${w.employer} (${w.dates}${w.location ? `, ${w.location}` : ""})`);
    for (const b of (w.bullets ?? []).slice(0, 4)) lines.push(`  - ${b}`);
  }
  for (const e of r.education ?? []) lines.push(`Education: ${e.credential}, ${e.school}${e.dates ? ` (${e.dates})` : ""}`);
  let text = lines.join("\n");
  if (app.rawResumeText) text += `\n\nFull resume text:\n${app.rawResumeText.slice(0, 5000)}`;
  return text.slice(0, 9000);
}

function templateText(app: ApplicantInfo): string {
  const c = app.template?.config ?? {};
  const keep = Object.entries(c).filter(
    ([k, v]) => v && v.trim() && !/^(search|maxApplications|dailyApplyCount|exclusionTitleRegex)/.test(k),
  );
  const rules = (app.template?.rules ?? []).filter((r) => r.match && r.answer);
  return [
    ...keep.map(([k, v]) => `${k}: ${v}`),
    ...rules.map((r) => `If the question contains "${r.match}", answer: ${r.answer}`),
  ].join("\n");
}

interface AiReply {
  answers: { id: string; answer: string | null; reason: string }[];
}

/**
 * One AI call for the fields the deterministic pass couldn't answer. Never
 * throws: on any error every field comes back as "needs you".
 */
export async function decideWithAi(
  fields: ScannedField[],
  app: ApplicantInfo,
  job: JobPosting | null,
  timeoutMs: number,
): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  if (!fields.length) return out;
  const fallback = (reason: string) => {
    for (const f of fields) if (!out.has(f.id)) out.set(f.id, { type: "skip", reason });
  };

  const list = fields.map((f) => ({
    id: f.id,
    kind: f.kind,
    label: f.label,
    required: f.required,
    ...(f.options.length ? { options: f.options } : {}),
  }));
  const jobText = job
    ? `Company: ${job.company}\nTitle: ${job.title}\nLocation: ${job.location}\n\n${job.descriptionText.slice(0, 3500)}`
    : "(job details not available)";
  const user = [
    "Fill these form fields.",
    wrapUntrusted("page", JSON.stringify(list, null, 1)),
    wrapUntrusted("resume", compactResume(app)),
    "Saved answers from the person (trusted):",
    templateText(app) || "(none)",
    wrapUntrusted("job_posting", jobText),
  ].join("\n\n");

  try {
    const reply = await Promise.race([
      callJson<AiReply>({ model: WRITE_MODEL, system: AI_SYSTEM, user, schema: AI_SCHEMA, maxTokens: 6000, effort: "low" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    const byId = new Map(fields.map((f) => [f.id, f]));
    for (const a of reply.answers ?? []) {
      const f = byId.get(a.id);
      if (!f || out.has(f.id)) continue;
      const reason = (a.reason || "").trim().slice(0, 160);
      if (a.answer == null || !String(a.answer).trim()) {
        out.set(f.id, { type: "skip", reason: reason || "Please answer this yourself." });
        continue;
      }
      const value = String(a.answer).trim().slice(0, 2000);
      // Choice answers must be real options.
      if (isChoice(f) && f.options.length) {
        const exact = f.options.find((o) => o === value) ?? bestOption(value, f.options);
        if (!exact) {
          out.set(f.id, { type: "skip", reason: "Please pick an answer here." });
          continue;
        }
        out.set(f.id, { type: "answer", value: exact, source: "ai", overwrite: false });
        continue;
      }
      out.set(f.id, { type: "answer", value, source: "ai", overwrite: false });
    }
    fallback("Please answer this yourself.");
  } catch (err) {
    console.error("[autoapply] AI answers failed:", err instanceof Error ? err.message : err);
    fallback("We couldn't draft an answer. Please fill this in.");
  }
  return out;
}
