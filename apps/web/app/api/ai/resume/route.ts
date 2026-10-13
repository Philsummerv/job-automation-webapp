import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai/guard";
import { aiErrorMessage } from "@/lib/ai/client";
import {
  AiLimitError,
  MigrationMissingError,
  checkAndRecordUsage,
} from "@/lib/ai/usage";
import {
  RESUME_MAX_PDF_BYTES,
  RESUME_MAX_TEXT_CHARS,
  parseResumeWithAi,
  saveResumeProfile,
} from "@/lib/ai/resume";

// POST /api/ai/resume — multipart form with either `file` (a PDF up to 5MB)
// or `text` (pasted resume, up to 30k characters). Parses it with the write
// model and saves the result to resume_profiles.
//
// A route handler, not a server action: server actions cap the body at 1MB
// by default, and a resume PDF can be bigger than that.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF parsing on the write model can take a while.
export const maxDuration = 120;

function fail(status: number, error: string, code?: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request) {
  const access = await requireAiAccess();
  if (!access.ok) return fail(access.status, access.error, access.code);
  const { user, supabase } = access;

  // Reject oversize bodies before reading them. 5MB file + form overhead.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > RESUME_MAX_PDF_BYTES + 200_000) {
    return fail(413, "That file is too big. The limit is 5 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "We couldn't read that upload. Try again.");
  }

  const file = form.get("file");
  const text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";

  // Validate input fully BEFORE counting it against the daily cap.
  let input: { kind: "pdf"; base64: string } | { kind: "text"; text: string };
  let fileName: string | null = null;
  let pdfBytes: Buffer | null = null;

  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    if (file.size > RESUME_MAX_PDF_BYTES) {
      return fail(413, "That file is too big. The limit is 5 MB.");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // Check the real file header, not just the name or type.
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return fail(400, "That file is not a PDF. Upload a PDF or paste the text instead.");
    }
    fileName = (file.name || "resume.pdf").slice(0, 200);
    pdfBytes = bytes;
    input = { kind: "pdf", base64: bytes.toString("base64") };
  } else if (text) {
    if (text.length > RESUME_MAX_TEXT_CHARS) {
      return fail(
        413,
        `That text is too long. The limit is ${RESUME_MAX_TEXT_CHARS.toLocaleString()} characters.`,
      );
    }
    if (text.length < 100) {
      return fail(400, "That looks too short for a resume. Paste the whole thing.");
    }
    input = { kind: "text", text };
  } else {
    return fail(400, "Upload a PDF or paste your resume text.");
  }

  try {
    await checkAndRecordUsage(supabase, user.id, "resume_parse");
  } catch (err) {
    if (err instanceof AiLimitError) return fail(429, err.message, "limit");
    if (err instanceof MigrationMissingError) return fail(503, err.message, "migration");
    return fail(500, "Something went wrong. Try again.");
  }

  let parsed;
  try {
    parsed = await parseResumeWithAi(input);
  } catch (err) {
    console.error("resume parse failed", err);
    return fail(502, aiErrorMessage(err), "ai");
  }

  const p = parsed.profile;
  if (!p.name && !p.workHistory.length && !p.skills.length && !p.education.length) {
    return fail(
      422,
      "We couldn't find a resume in that. If your PDF is a scan or photo, try pasting the text instead.",
    );
  }

  try {
    await saveResumeProfile(supabase, user.id, {
      profile: p,
      rawText: parsed.rawText || null,
      fileName,
    });
  } catch (err) {
    if (err instanceof MigrationMissingError) return fail(503, err.message, "migration");
    console.error("resume save failed", err);
    return fail(500, "We read your resume but couldn't save it. Try again.");
  }

  // Keep the original PDF so "Apply for me" can upload it to application
  // forms. Private bucket, one file per user, replaced on every upload. A
  // failure here doesn't fail the upload: Apply for me falls back to a PDF
  // built from the parsed resume.
  if (pdfBytes) {
    const { error: storeErr } = await supabase.storage
      .from("resumes")
      .upload(`${user.id}/resume.pdf`, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (storeErr) console.error("resume pdf store failed", storeErr.message);
  } else {
    // Pasted text replaces the resume, so an older PDF would now be out of date.
    await supabase.storage.from("resumes").remove([`${user.id}/resume.pdf`]);
  }

  return NextResponse.json({ ok: true, profile: p });
}
