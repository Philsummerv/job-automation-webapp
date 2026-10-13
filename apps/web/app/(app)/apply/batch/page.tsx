import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isEntitled, type ResumeProfileRow } from "@jobassistui/shared";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { AI_NOT_CONFIGURED_MESSAGE, isAiConfigured } from "@/lib/ai/client";
import { MIGRATION_NEEDED_MESSAGE, isMissingTableError } from "@/lib/ai/usage";
import { toApplyBasics } from "@/lib/applyBasics";
import BatchBuilder from "./BatchBuilder";

export const metadata: Metadata = {
  title: "Batch apply kits — JobAssistUI",
};

export const dynamic = "force-dynamic";

// Batch mode: the job list comes from the Jobs page through sessionStorage,
// and BatchBuilder makes one apply kit per job, one after another.
export default async function BatchPage() {
  const { supabase, user, profile } = await requireOnboarded();

  const header = (
    <div>
      <h1 className="text-2xl">Batch apply kits</h1>
      <p className="mt-1 text-sm text-slate-600">
        We make a kit for each job, one at a time. Open a finished kit, apply on the
        company&apos;s site, then log it. Nothing is sent for you.
      </p>
    </div>
  );

  const entitled = isEntitled(profile.subscription_status) || isCompedEmail(user.email);
  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <p className="mt-6 border-[1.5px] border-brand bg-paper-field px-4 py-3 text-sm">
          Apply kits are part of Guided.{" "}
          <Link href="/billing" className="font-medium underline">
            See Billing
          </Link>
          . Your activity log stays free.
        </p>
      </div>
    );
  }

  const { data: row, error } = await supabase
    .from("resume_profiles")
    .select("profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <p className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {isMissingTableError(error)
            ? MIGRATION_NEEDED_MESSAGE
            : "We couldn't load your resume. Refresh the page to try again."}
        </p>
      </div>
    );
  }
  const resume = row as Pick<ResumeProfileRow, "profile"> | null;
  if (!resume?.profile) redirect("/resume");

  const aiReady = isAiConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      {!aiReady ? (
        <p className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {AI_NOT_CONFIGURED_MESSAGE}
        </p>
      ) : (
        <BatchBuilder basics={toApplyBasics(resume.profile, profile)} />
      )}
    </div>
  );
}
