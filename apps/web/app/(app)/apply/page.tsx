import Link from "next/link";
import { redirect } from "next/navigation";
import { isEntitled, type ResumeProfileRow } from "@jobassistui/shared";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured } from "@/lib/ai/client";
import { MIGRATION_NEEDED_MESSAGE, isMissingTableError } from "@/lib/ai/usage";
import { getJobById } from "@/lib/jobs/lookup";
import { toApplyBasics } from "@/lib/applyBasics";
import ApplyKitBuilder, { type ApplyPreselectedJob, type ApplyResumeBasics } from "./ApplyKitBuilder";

export const dynamic = "force-dynamic";

function Notice({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "red" }) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return <div className={`mt-6 rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; url?: string }>;
}) {
  const { supabase, user, profile } = await requireOnboarded();
  const sp = await searchParams;

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Apply kit</h1>
      <p className="mt-1 text-sm text-slate-600">
        Pick a job and get a resume, cover letter and answers made for it. Everything comes from
        your own resume. Check it, then apply on the company&apos;s site.
      </p>
    </div>
  );

  const entitled = isEntitled(profile.subscription_status) || isCompedEmail(user.email);
  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice>
          The apply kit is part of Guided.{" "}
          <Link href="/billing" className="font-medium underline">
            See Billing
          </Link>{" "}
          to turn it on. Your activity log stays free.
        </Notice>
      </div>
    );
  }

  const { data: row, error } = await supabase
    .from("resume_profiles")
    .select("profile, file_name, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice tone="red">
          {isMissingTableError(error)
            ? MIGRATION_NEEDED_MESSAGE
            : "We couldn't load your resume. Refresh the page to try again."}
        </Notice>
      </div>
    );
  }

  const resume = row as Pick<ResumeProfileRow, "profile"> | null;
  if (!resume?.profile) redirect("/resume");
  const p = resume.profile;

  const basics: ApplyResumeBasics = toApplyBasics(p, profile);

  // Job picked from the feed.
  let preselected: ApplyPreselectedJob | null = null;
  let jobNotFound = false;
  const jobId = (sp.job ?? "").slice(0, 400);
  const rawUrl = (sp.url ?? "").trim().slice(0, 2000);
  const fallbackUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
  if (jobId) {
    const posting = await getJobById(jobId);
    if (posting) {
      preselected = {
        id: posting.id,
        company: posting.company,
        title: posting.title,
        location: posting.location,
        url: posting.url,
        fallbackUrl: null,
      };
    } else if (fallbackUrl) {
      preselected = {
        id: jobId,
        company: "",
        title: "",
        location: "",
        url: fallbackUrl,
        fallbackUrl,
      };
    } else {
      jobNotFound = true;
    }
  }

  const aiReady = isAiConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      {!aiReady && <Notice tone="red">{AI_NOT_CONFIGURED_MESSAGE}</Notice>}
      {jobNotFound && (
        <Notice>
          We couldn&apos;t find that job any more. It may have been taken down. Paste its link or
          the job text below instead.
        </Notice>
      )}
      <ApplyKitBuilder
        aiReady={aiReady}
        basics={basics}
        preselected={preselected}
        initialUrl={!jobId ? fallbackUrl : ""}
      />
    </div>
  );
}
