import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import type { AnswerTemplate, Profile, ResumeProfile } from "@jobassistui/shared";
import { getResumeProfile } from "@/lib/ai/resume";
import { MIGRATION_NEEDED_MESSAGE, MigrationMissingError } from "@/lib/ai/usage";
import type { ApplicantInfo, ResumeFileData } from "@/lib/autoapply/run";

// Everything "Apply for me" knows about the person, gathered in one place:
// the parsed resume, the answer template, the profile row and the sign-in
// email. Server-only.
//
// Only facts the person gave us. A field we don't know stays "" so the form
// filler leaves it blank and tells the person, instead of guessing.

export type LoadApplicantResult =
  | { ok: true; applicant: ApplicantInfo; resumeFile: ResumeFileData | null }
  | { ok: false; status: number; error: string; code: string };

const RESUME_BUCKET = "resumes";

function clean(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** "Jane Q. Public" -> ["Jane", "Public"]. One word -> [word, ""]. */
function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts[parts.length - 1]];
}

/** "Syracuse, NY 13202" -> { city: "Syracuse", state: "NY", zip: "13202" }. Best effort. */
function parseLocation(loc: string): { city: string; state: string; zip: string } {
  const out = { city: "", state: "", zip: "" };
  const m = loc.match(/^\s*([^,]+?)\s*,\s*([A-Za-z]{2})\b\s*(\d{5})?/);
  if (m) {
    out.city = m[1];
    out.state = m[2].toUpperCase();
    out.zip = m[3] ?? "";
  }
  return out;
}

export async function loadApplicant(
  supabase: SupabaseClient,
  user: User,
): Promise<LoadApplicantResult> {
  let row;
  try {
    row = await getResumeProfile(supabase, user.id);
  } catch (err) {
    if (err instanceof MigrationMissingError) {
      return { ok: false, status: 503, code: "migration_needed", error: MIGRATION_NEEDED_MESSAGE };
    }
    return { ok: false, status: 500, code: "db_error", error: "We couldn't load your resume. Try again." };
  }
  if (!row?.profile) {
    return {
      ok: false,
      status: 409,
      code: "no_resume",
      error: "Add your resume first. Apply for me fills forms from it.",
    };
  }
  const resume: ResumeProfile = row.profile;

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, state, answer_template")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = (profileData as Pick<Profile, "full_name" | "state" | "answer_template"> | null) ?? null;
  const template: AnswerTemplate | null = profile?.answer_template ?? null;
  const cfg = template?.config ?? {};

  // Name: the template wins (the person typed it on purpose), then the
  // profile, then the resume.
  const fullFromSources = clean(profile?.full_name) || clean(resume.name);
  const [firstGuess, lastGuess] = splitName(fullFromSources);
  const firstName = clean(cfg.firstName) || firstGuess;
  const lastName = clean(cfg.lastName) || lastGuess;
  const fullName =
    clean(cfg.firstName) || clean(cfg.lastName)
      ? `${firstName} ${lastName}`.trim()
      : fullFromSources || `${firstName} ${lastName}`.trim();

  const fromResumeLoc = parseLocation(resume.locations?.[0] ?? "");
  const state = (clean(profile?.state, 10) || fromResumeLoc.state).toUpperCase();
  const lastJob = resume.workHistory?.[0];

  const applicant: ApplicantInfo = {
    firstName,
    lastName,
    fullName,
    // The sign-in email is a real, working address for this person.
    email: clean(user.email, 320) || clean(resume.email, 320),
    phone: clean(cfg.phone, 40) || clean(resume.phone, 40),
    city: clean(cfg.city) || fromResumeLoc.city,
    state,
    zip: clean(cfg.zipCode, 20) || fromResumeLoc.zip,
    // The site is for US unemployment claims. Only say so when we hold a US
    // state for the person; otherwise leave it for them.
    country: state ? "United States" : "",
    linkedin: clean(cfg.linkedin, 300),
    currentCompany: clean(cfg.priorJobCompany) || clean(lastJob?.employer),
    currentTitle: clean(cfg.priorJobTitle) || clean(lastJob?.title),
    resume,
    rawResumeText: row.raw_text,
    template,
  };

  const resumeFile = await loadResumeFile(supabase, user.id, applicant, row.file_name);
  return { ok: true, applicant, resumeFile };
}

/** Stored PDF first, else a plain PDF built from the parsed resume, else null. */
async function loadResumeFile(
  supabase: SupabaseClient,
  userId: string,
  applicant: ApplicantInfo,
  storedName: string | null,
): Promise<ResumeFileData | null> {
  const fileBase = safeFileBase(applicant.fullName);

  try {
    const { data, error } = await supabase.storage
      .from(RESUME_BUCKET)
      .download(`${userId}/resume.pdf`);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
        const name =
          storedName && /\.pdf$/i.test(storedName) ? safeFileName(storedName) : `${fileBase}.pdf`;
        return { name, mimeType: "application/pdf", buffer };
      }
    }
  } catch (err) {
    console.error("resume pdf download failed", err);
  }

  try {
    const buffer = await buildResumePdf(applicant);
    return buffer ? { name: `${fileBase}.pdf`, mimeType: "application/pdf", buffer } : null;
  } catch (err) {
    console.error("resume pdf build failed", err);
    return null;
  }
}

function safeFileBase(fullName: string): string {
  const base = fullName.replace(/[^A-Za-z0-9 ._-]/g, "").trim().replace(/\s+/g, "_");
  return base ? `${base}_Resume` : "Resume";
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ._()-]/g, "").trim();
  return cleaned && /\.pdf$/i.test(cleaned) ? cleaned.slice(-120) : "Resume.pdf";
}

// ─── Fallback PDF ───────────────────────────────────────────────────────────

// Standard PDF fonts only encode WinAnsi. Map smart punctuation and drop the
// rest so odd characters can never throw while drawing.
function sanitize(input: string): string {
  return (input || "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .split("")
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c === 9 || c === 10 || c === 13) return " ";
      if (c < 32) return "";
      if (c >= 127 && c <= 159) return "?";
      if (c > 255) return "?";
      return ch;
    })
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A plain one-column resume from the parsed profile, for people who pasted
 * text instead of uploading a PDF. Only what is in the profile. Returns null
 * if there is nothing worth putting on a page.
 */
async function buildResumePdf(a: ApplicantInfo): Promise<Buffer | null> {
  const r = a.resume;
  if (!r.workHistory.length && !r.education.length && !r.skills.length) return null;

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const M = 54;
  const maxW = W - M * 2;

  let page = doc.addPage([W, H]);
  let y = H - M;

  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, font: PDFFont, size: number, indent = 0) => {
    for (const line of wrap(s, font, size, maxW - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: M + indent, y: y - size, size, font });
      y -= size + 4;
    }
  };
  const gap = (h: number) => {
    y -= h;
  };
  const heading = (s: string) => {
    gap(8);
    text(s.toUpperCase(), bold, 11);
    gap(2);
  };

  text(a.fullName || r.name || "Resume", bold, 18);
  const contact = [a.email, a.phone, [a.city, a.state].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join("  |  ");
  if (contact) text(contact, regular, 10);
  if (a.linkedin) text(a.linkedin, regular, 10);
  if (r.headline) {
    gap(6);
    text(r.headline, regular, 11);
  }

  if (r.workHistory.length) {
    heading("Experience");
    for (const job of r.workHistory) {
      const head = [job.title, job.employer].filter(Boolean).join(", ");
      if (head) text(head, bold, 11);
      const sub = [job.dates, job.location].filter(Boolean).join("  |  ");
      if (sub) text(sub, regular, 10);
      for (const b of job.bullets) text(`- ${b}`, regular, 10, 10);
      gap(4);
    }
  }

  if (r.education.length) {
    heading("Education");
    for (const ed of r.education) {
      text([ed.credential, ed.school].filter(Boolean).join(", "), regular, 10);
      if (ed.dates) text(ed.dates, regular, 10, 10);
    }
  }

  if (r.skills.length) {
    heading("Skills");
    text(r.skills.join(", "), regular, 10);
  }

  if (r.certifications.length) {
    heading("Certifications");
    for (const c of r.certifications) text(`- ${c}`, regular, 10, 10);
  }

  doc.setTitle(`${a.fullName || "Resume"}`);
  return Buffer.from(await doc.save());
}
