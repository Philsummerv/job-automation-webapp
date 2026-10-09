import type { Metadata } from "next";
import Link from "next/link";
import { isEntitled } from "@jobassistui/shared";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured } from "@/lib/ai/client";
import { MIGRATION_NEEDED_MESSAGE } from "@/lib/ai/usage";
import { getResumeProfileSafe } from "@/lib/ai/resume";
import ResumeUpload from "@/components/ResumeUpload";
import SubmitButton from "@/components/SubmitButton";
import { deleteResume, saveResumeEdits } from "./actions";

export const metadata: Metadata = {
  title: "Your resume — JobAssistUI",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Notice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "error" | "ok";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return <div className={`rounded-md border px-4 py-2 text-sm ${styles}`}>{children}</div>;
}

export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const { supabase, user, profile: account } = await requireOnboarded();
  const sp = await searchParams;

  const entitled =
    isEntitled(account.subscription_status) || isCompedEmail(user.email);
  const aiReady = isAiConfigured();
  const { row, migrationMissing } = await getResumeProfileSafe(supabase, user.id);
  const resume = row?.profile ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Your resume</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add your resume once. We use it to find jobs that fit you and to
          build each application. We only use what your resume says.
        </p>
      </div>

      {sp.saved === "1" && <Notice tone="ok">Changes saved.</Notice>}
      {sp.deleted === "1" && <Notice tone="ok">Your resume was deleted.</Notice>}
      {(migrationMissing || sp.error === "migration") && (
        <Notice tone="error">{MIGRATION_NEEDED_MESSAGE}</Notice>
      )}
      {sp.error === "none" && (
        <Notice tone="error">Add a resume first, then you can edit it.</Notice>
      )}

      {!migrationMissing && (
        <section className="rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {resume ? "Upload a new version" : "Add your resume"}
          </h2>
          {resume && row?.updated_at && (
            <p className="mt-1 text-xs text-slate-500">
              {row.file_name ? `${row.file_name}, ` : ""}last updated{" "}
              {new Date(row.updated_at).toLocaleDateString()}
            </p>
          )}
          <div className="mt-4">
            {!entitled ? (
              <Notice tone="warn">
                Reading a resume with AI is part of Guided.{" "}
                <Link href="/billing" className="font-medium underline">
                  See billing
                </Link>
              </Notice>
            ) : !aiReady ? (
              <Notice tone="warn">{AI_NOT_CONFIGURED_MESSAGE}</Notice>
            ) : (
              <ResumeUpload hasResume={Boolean(resume)} />
            )}
          </div>
        </section>
      )}

      {resume && (
        <>
          <section>
            <h2 className="text-lg font-semibold">Check your details</h2>
            <p className="mt-1 text-sm text-slate-600">
              The AI can make mistakes. Fix anything that is wrong. Job
              search uses your titles, skills and locations.
            </p>

            <form action={saveResumeEdits} className="mt-4 space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium">
                  Name
                </label>
                <input id="name" name="name" defaultValue={resume.name} maxLength={150} className={inputClass} />
              </div>

              <div>
                <label htmlFor="headline" className="block text-sm font-medium">
                  Headline
                </label>
                <input
                  id="headline"
                  name="headline"
                  defaultValue={resume.headline}
                  maxLength={300}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">One line about you.</p>
              </div>

              <div>
                <label htmlFor="titles" className="block text-sm font-medium">
                  Job titles <span className="text-slate-400">(one per line)</span>
                </label>
                <textarea
                  id="titles"
                  name="titles"
                  rows={4}
                  defaultValue={resume.titles.join("\n")}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Put the jobs you want most at the top. We search for these.
                </p>
              </div>

              <div>
                <label htmlFor="skills" className="block text-sm font-medium">
                  Skills <span className="text-slate-400">(one per line or comma-separated)</span>
                </label>
                <textarea
                  id="skills"
                  name="skills"
                  rows={6}
                  defaultValue={resume.skills.join("\n")}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Only list skills you really have. Your applications use this list.
                </p>
              </div>

              <div>
                <label htmlFor="locations" className="block text-sm font-medium">
                  Locations <span className="text-slate-400">(one per line)</span>
                </label>
                <textarea
                  id="locations"
                  name="locations"
                  rows={3}
                  defaultValue={resume.locations.join("\n")}
                  placeholder="Albany, NY"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Where you live or want to work.
                </p>
              </div>

              <SubmitButton
                pendingLabel="Saving…"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Save changes
              </SubmitButton>
            </form>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Work history</h2>
              <p className="mt-1 text-sm text-slate-600">
                Read from your resume. To change it, fix your resume and upload it again.
              </p>
            </div>
            {resume.workHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No jobs found on your resume.</p>
            ) : (
              <ul className="space-y-4">
                {resume.workHistory.map((w, i) => (
                  <li key={i} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <p className="font-medium text-slate-900">
                        {w.title || "Untitled role"}
                        {w.employer && <span className="font-normal text-slate-600"> at {w.employer}</span>}
                      </p>
                      {w.dates && <p className="text-xs text-slate-500">{w.dates}</p>}
                    </div>
                    {w.location && <p className="text-xs text-slate-500">{w.location}</p>}
                    {w.bullets.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {w.bullets.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(resume.education.length > 0 || resume.certifications.length > 0) && (
            <section className="grid gap-6 sm:grid-cols-2">
              {resume.education.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold">Education</h2>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {resume.education.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium text-slate-900">{e.credential || "Education"}</span>
                        {e.school && <span>, {e.school}</span>}
                        {e.dates && <span className="text-slate-500"> ({e.dates})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resume.certifications.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold">Certifications</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {resume.certifications.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="text-sm font-medium text-slate-900">Ready to look for jobs?</p>
              <p className="text-sm text-slate-600">We match jobs to the details above.</p>
            </div>
            <Link
              href="/jobs"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Find jobs
            </Link>
          </section>

          <section className="border-t border-slate-200 pt-6">
            <h2 className="text-sm font-semibold text-slate-900">Delete my resume</h2>
            <p className="mt-1 text-sm text-slate-600">
              Removes your resume and these details from JobAssistUI. Your activity log stays.
            </p>
            <form action={deleteResume} className="mt-3">
              <SubmitButton
                pendingLabel="Deleting…"
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete my resume
              </SubmitButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
