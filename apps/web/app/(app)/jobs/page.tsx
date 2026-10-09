import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isEntitled, type ResumeProfile } from "@jobassistui/shared";
import { requireOnboarded, isCompedEmail } from "@/lib/auth";
import { isAiConfigured, AI_NOT_CONFIGURED_MESSAGE } from "@/lib/ai/client";
import { isMissingTableError, MIGRATION_NEEDED_MESSAGE } from "@/lib/ai/usage";
import JobsSearchForm from "@/components/JobsSearchForm";
import JobsResults from "@/components/JobsResults";
import type { JobsAiState } from "@/components/JobsList";

export const metadata: Metadata = {
  title: "Find jobs — JobAssistUI",
};

// Fetching the feed can take ~10s on a cold cache, and it reads live data.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = { q?: string; l?: string; remote?: string; s?: string };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { supabase, user, profile } = await requireOnboarded();
  const sp = await searchParams;

  // The saved resume, if any. A missing table just means "no resume yet" plus
  // a notice; the feed still works.
  let resume: ResumeProfile | null = null;
  let migrationMissing = false;
  const { data: row, error } = await supabase
    .from("resume_profiles")
    .select("profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) migrationMissing = true;
  } else {
    resume = (row?.profile ?? null) as ResumeProfile | null;
  }

  const defaultQuery = (resume?.titles ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const defaultLocation = resume?.locations?.find((l) => l.trim())?.trim() ?? "";

  const submitted = sp.s === "1" || sp.q !== undefined || sp.l !== undefined;
  const query = (submitted ? sp.q ?? "" : defaultQuery).trim().slice(0, 200);
  const location = (submitted ? sp.l ?? "" : defaultLocation).trim().slice(0, 100);
  const remoteOnly = sp.remote === "1";
  const shouldSearch = submitted || query !== "";

  const entitled =
    isEntitled(profile.subscription_status) || isCompedEmail(user.email);
  let aiState: JobsAiState;
  if (migrationMissing) aiState = "migration_missing";
  else if (!resume) aiState = "no_resume";
  else if (!entitled) aiState = "not_entitled";
  else if (!isAiConfigured()) aiState = "not_configured";
  else aiState = "ready";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Find jobs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Openings from company career sites. Pick one and we&apos;ll help you
          build an application for it.
        </p>
      </div>

      {migrationMissing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {MIGRATION_NEEDED_MESSAGE}
        </div>
      )}
      {aiState === "no_resume" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Add your resume to see how well each job fits you.{" "}
          <Link href="/resume" className="font-medium underline">
            Add your resume
          </Link>
        </div>
      )}
      {aiState === "not_configured" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {AI_NOT_CONFIGURED_MESSAGE}. Jobs still show, but without match scores.
        </div>
      )}
      {aiState === "not_entitled" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Match scores are part of Guided.{" "}
          <Link href="/billing" className="font-medium underline">
            See billing
          </Link>
        </div>
      )}

      <JobsSearchForm query={query} location={location} remoteOnly={remoteOnly} />

      {shouldSearch ? (
        <Suspense
          key={`${query}|${location}|${remoteOnly}`}
          fallback={
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Checking company job boards. This can take about 10 seconds.
            </div>
          }
        >
          <JobsResults
            query={query}
            location={location}
            remoteOnly={remoteOnly}
            resume={resume}
            aiState={aiState}
          />
        </Suspense>
      ) : (
        <p className="text-sm text-slate-600">
          Type a job title or a few keywords, then press Search.
        </p>
      )}
    </div>
  );
}
