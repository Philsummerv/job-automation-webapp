import type { ApplyKit, ResumeProfile } from "@jobassistui/shared";
import {
  HONESTY_RULE,
  UNTRUSTED_DATA_RULE,
  WRITE_MODEL,
  callJson,
  wrapUntrusted,
  type JsonSchema,
} from "@/lib/ai/client";

// Builds the apply kit for one job: tailored resume, cover letter, draft
// answers, missing keywords, match score and a "check these" list.
//
// Server-only. Call order in the route: requireAiAccess() ->
// checkAndRecordUsage() -> buildApplyKit().
//
// Honesty is enforced twice: once in the system prompt (HONESTY_RULE, plus
// explicit wording below), and once in code after the reply comes back
// (enforceHonesty): skills and employers the resume does not show are pulled
// out or flagged in checkThese.

/** Max job text we send to the model. */
export const JOB_TEXT_MAX_CHARS = 20_000;
/** Max raw resume text we send to the model. */
export const RESUME_TEXT_MAX_CHARS = 15_000;

/** The job, after it's been resolved from the feed, a URL or pasted text. */
export interface ApplyJobInput {
  company: string;
  title: string;
  location: string;
  url: string | null;
  text: string;
}

/** What /apply needs to show the job and fill in the log form. */
export interface ApplyKitJobInfo {
  company: string;
  title: string;
  url: string | null;
  applyUrl: string | null;
}

/** What the model returns: the kit plus the job's company/title it read. */
export interface ApplyKitResult {
  kit: ApplyKit;
  /** Company and title the model found in the posting (for pasted text). */
  detected: { company: string | null; title: string | null };
}

const SYSTEM_PROMPT = [
  "You help a person who is out of work apply for one job. You write a tailored resume, a short cover letter and draft answers to common application questions.",
  "",
  UNTRUSTED_DATA_RULE,
  "",
  HONESTY_RULE,
  "",
  "More honesty rules. Follow all of them:",
  "- Use only facts in the <resume>: the same employers, job titles, dates, schools, degrees, certifications, numbers and skills. Copy employer names, titles and dates exactly as written.",
  "- You may reword a bullet, reorder bullets, pick the most relevant ones and drop weak ones. You may not add a new duty, result, tool or number.",
  "- tailoredResume.skills may only contain skills that appear in the <resume>. Order them so the ones the job asks for come first.",
  "- missingKeywords lists important words from the job posting (skills, tools, licenses, requirements) that the resume does not show. These are gaps for the person to see. Never put them into the resume, cover letter or answers as if the person has them.",
  "- If an answer needs a fact the resume does not give (salary, start date, work authorization, a reason for leaving), write a bracketed placeholder like [your expected pay] instead of guessing.",
  "- checkThese lists every statement you wrote that is not plainly in the resume, every placeholder you used, and anything else the person should confirm before sending. If there is nothing, return an empty list.",
  "",
  "What to write:",
  "- matchScore: 0 to 100. How well the resume as it stands fits the job. Be realistic, not kind.",
  "- job.company and job.title: the employer and job title as named in the <job_posting>, or null if it doesn't say.",
  "- tailoredResume.summary: 2 or 3 plain sentences aimed at this job, using only resume facts.",
  "- tailoredResume.experience: the person's jobs, most recent first, with 2 to 6 bullets each, the most relevant first. Keep every job from the resume unless it is clearly unrelated and older than 15 years.",
  "- coverLetter: 180 to 280 words. Plain greeting, three short paragraphs, plain sign-off with the person's name. No hype words, no clichés like 'I am thrilled' or 'perfect fit'.",
  "- answers: 4 to 6 questions this employer's application is likely to ask (for example: why this job, relevant experience, availability, pay expectations), each with a short draft answer in the first person.",
  "",
  "Writing style: plain, short sentences, everyday words, point first. No em dashes. Write like a capable person, not a marketer.",
].join("\n");

const stringArray = { type: "array", items: { type: "string" } } as const;

const SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "matchScore",
    "job",
    "tailoredResume",
    "coverLetter",
    "answers",
    "missingKeywords",
    "checkThese",
  ],
  properties: {
    matchScore: { type: "integer", description: "0 to 100" },
    job: {
      type: "object",
      additionalProperties: false,
      required: ["company", "title"],
      properties: {
        company: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
      },
    },
    tailoredResume: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "experience", "skills"],
      properties: {
        summary: { type: "string" },
        experience: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["employer", "title", "dates", "bullets"],
            properties: {
              employer: { type: "string" },
              title: { type: "string" },
              dates: { type: "string" },
              bullets: stringArray,
            },
          },
        },
        skills: stringArray,
      },
    },
    coverLetter: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
    missingKeywords: stringArray,
    checkThese: stringArray,
  },
};

interface RawKit {
  matchScore: number;
  job: { company: string | null; title: string | null };
  tailoredResume: {
    summary: string;
    experience: { employer: string; title: string; dates: string; bullets: string[] }[];
    skills: string[];
  };
  coverLetter: string;
  answers: { question: string; answer: string }[];
  missingKeywords: string[];
  checkThese: string[];
}

export async function buildApplyKit(input: {
  profile: ResumeProfile;
  rawResumeText: string | null;
  job: ApplyJobInput;
}): Promise<ApplyKitResult> {
  const { profile, rawResumeText, job } = input;

  const resumeBlock = [
    "Structured profile (JSON, may include the person's own edits):",
    JSON.stringify(profile, null, 1),
    rawResumeText?.trim()
      ? "\nOriginal resume text:\n" + rawResumeText.trim().slice(0, RESUME_TEXT_MAX_CHARS)
      : "",
  ].join("\n");

  const jobHeader = [
    job.company ? `Company: ${job.company}` : "",
    job.title ? `Title: ${job.title}` : "",
    job.location ? `Location: ${job.location}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const jobBlock = (jobHeader ? jobHeader + "\n\n" : "") + job.text.slice(0, JOB_TEXT_MAX_CHARS);

  const user = [
    "Here is the person's resume:",
    wrapUntrusted("resume", resumeBlock),
    "",
    "Here is the job posting:",
    wrapUntrusted("job_posting", jobBlock),
    "",
    "Write the apply kit for this job. Follow the honesty rules. Return only the JSON.",
  ].join("\n");

  const raw = await callJson<RawKit>({
    model: WRITE_MODEL,
    system: SYSTEM_PROMPT,
    user,
    schema: SCHEMA,
    maxTokens: 12_000,
  });

  const kit = enforceHonesty(sanitize(raw), profile, rawResumeText);
  return {
    kit,
    detected: {
      company: cleanStr(raw.job?.company, 200) || null,
      title: cleanStr(raw.job?.title, 200) || null,
    },
  };
}

// ─── Clean-up and checks on the model's reply ───────────────────────────────

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const s = cleanStr(item, maxLen);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitize(raw: RawKit): ApplyKit {
  const score = Number(raw.matchScore);
  return {
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    tailoredResume: {
      summary: cleanStr(raw.tailoredResume?.summary, 1500),
      experience: (Array.isArray(raw.tailoredResume?.experience)
        ? raw.tailoredResume.experience
        : []
      )
        .slice(0, 15)
        .map((e) => ({
          employer: cleanStr(e?.employer, 200),
          title: cleanStr(e?.title, 200),
          dates: cleanStr(e?.dates, 100),
          bullets: cleanList(e?.bullets, 8, 600),
        }))
        .filter((e) => e.employer || e.title),
      skills: cleanList(raw.tailoredResume?.skills, 40, 80),
    },
    coverLetter: cleanStr(raw.coverLetter, 6000),
    answers: (Array.isArray(raw.answers) ? raw.answers : [])
      .slice(0, 8)
      .map((a) => ({
        question: cleanStr(a?.question, 300),
        answer: cleanStr(a?.answer, 2000),
      }))
      .filter((a) => a.question && a.answer),
    missingKeywords: cleanList(raw.missingKeywords, 30, 80),
    checkThese: cleanList(raw.checkThese, 30, 400),
  };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/**
 * Code-side honesty guard. The prompt already forbids invented facts; this
 * catches what slips through:
 *  - a skill not found in the resume is removed and noted;
 *  - an employer or job title not in the work history is flagged;
 *  - dates that differ from the resume's dates for that employer are flagged;
 *  - a missing keyword that shows up in the cover letter, answers, summary or
 *    bullets is flagged, since the resume doesn't back it up.
 */
function enforceHonesty(
  kit: ApplyKit,
  profile: ResumeProfile,
  rawResumeText: string | null,
): ApplyKit {
  const corpus = norm(
    [
      rawResumeText ?? "",
      profile.headline,
      ...profile.skills,
      ...profile.certifications,
      ...profile.titles,
      ...profile.workHistory.flatMap((w) => [w.employer, w.title, ...w.bullets]),
      ...profile.education.map((e) => `${e.school} ${e.credential}`),
    ].join(" \n "),
  );
  const padded = ` ${corpus} `;
  const tokens = corpus.split(" ").filter(Boolean);
  const listed = new Set(
    [...profile.skills, ...profile.certifications].map(norm).filter(Boolean),
  );

  // The exact phrase is in the resume, or it's one of the listed skills.
  const exactInResume = (s: string) => {
    const n = norm(s);
    if (!n) return false;
    return listed.has(n) || padded.includes(` ${n} `);
  };

  // Exact phrase, or all its meaningful words sit close together in the
  // resume ("Forklift (certified)" vs "certified forklift operator").
  // Words spread across different bullets don't count.
  const inResume = (s: string) => {
    if (exactInResume(s)) return true;
    const all = norm(s).split(" ").filter(Boolean);
    const parts = all.length === 1 ? all : all.filter((w) => w.length > 2);
    if (parts.length < 2) return false;
    const win = parts.length + 3;
    for (let i = 0; i < tokens.length; i++) {
      if (!parts.includes(tokens[i]!)) continue;
      const slice = new Set(tokens.slice(i, i + win));
      if (parts.every((w) => slice.has(w))) return true;
    }
    return false;
  };

  const notes: string[] = [];

  const keptSkills: string[] = [];
  for (const skill of kit.tailoredResume.skills) {
    if (inResume(skill)) keptSkills.push(skill);
    else notes.push(`Removed the skill "${skill}" because we could not find it in your resume. Add it back only if it's true.`);
  }

  const employers = profile.workHistory.map((w) => norm(w.employer)).filter(Boolean);
  const titles = profile.workHistory.map((w) => norm(w.title)).filter(Boolean);
  for (const e of kit.tailoredResume.experience) {
    if (e.employer && employers.length > 0 && !employers.includes(norm(e.employer)) && !inResume(e.employer)) {
      notes.push(`The employer "${e.employer}" doesn't match your resume. Check it.`);
    }
    if (e.title && titles.length > 0 && !titles.includes(norm(e.title)) && !inResume(e.title)) {
      notes.push(`The job title "${e.title}" at ${e.employer || "one job"} doesn't match your resume. Check it.`);
    }
    // Dates must match the resume's dates for the same employer.
    const src = profile.workHistory.find(
      (w) => norm(w.employer) && norm(w.employer) === norm(e.employer),
    );
    if (src && src.dates.trim() && e.dates && norm(src.dates) !== norm(e.dates)) {
      notes.push(`The dates for ${e.employer} say "${e.dates}", but your resume says "${src.dates}". Use your resume's dates.`);
    }
  }

  // Keep missing keywords as gaps only. Drop one only when the resume shows
  // the exact phrase; a loose word match would hide real gaps.
  const missingKeywords = kit.missingKeywords.filter((k) => !exactInResume(k));

  // A gap the resume doesn't back up must not appear as a claim.
  const places: { label: string; text: string }[] = [
    { label: "The cover letter", text: kit.coverLetter },
    { label: "The summary", text: kit.tailoredResume.summary },
    {
      label: "A resume bullet",
      text: kit.tailoredResume.experience.flatMap((e) => e.bullets).join(" \n "),
    },
    { label: "A draft answer", text: kit.answers.map((a) => a.answer).join(" \n ") },
  ];
  const paddedPlaces = places.map((p) => ({ ...p, text: ` ${norm(p.text)} ` }));
  for (const k of missingKeywords) {
    const n = norm(k);
    if (n.length < 2) continue;
    for (const p of paddedPlaces) {
      if (p.text.includes(` ${n} `)) {
        notes.push(`${p.label} mentions "${k}", which your resume doesn't show. Remove it unless it's true.`);
      }
    }
  }

  return {
    ...kit,
    tailoredResume: { ...kit.tailoredResume, skills: keptSkills },
    missingKeywords,
    checkThese: [...notes, ...kit.checkThese].slice(0, 40),
  };
}
