import Link from "next/link";
import { redirect } from "next/navigation";
import { isEntitled } from "@jobassistui/shared";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { MIGRATION_NEEDED_MESSAGE, isMissingTableError } from "@/lib/ai/usage";
import { getJobById } from "@/lib/jobs/lookup";
import { canAutoApply } from "@/lib/autoapply/targets";
import { isAutoApplyConfigured } from "@/lib/autoapply/browser";
import { MAX_DAILY_APPLY_COUNT, queueHref } from "@/lib/autoapply/daily";
import AutoApplyRunner from "./AutoApplyRunner";

export const dynamic = "force-dynamic";

function Notice({
  children,
  tone = "amber",
}: {
  children: React.ReactNode;
  tone?: "amber" | "red";
}) {
  const cls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return <div className={`mt-6 rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default async function AutoApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; queue?: string; go?: string }>;
}) {
  const { supabase, user, profile } = await requireOnboarded();
  const sp = await searchParams;
  const jobId = (sp.job ?? "").slice(0, 300);

  // Today's jobs from Home: the whole list rides along so each finished job
  // can offer the next one. Only ids Apply for me can open are kept.
  const queueIds = (sp.queue ?? "")
    .split(",")
    .map((s) => s.trim().slice(0, 300))
    .filter((id) => id && canAutoApply(id))
    .slice(0, MAX_DAILY_APPLY_COUNT);
  const queuePos = queueIds.indexOf(jobId);
  const queue =
    queuePos >= 0 && queueIds.length > 1
      ? {
          position: queuePos + 1,
          total: queueIds.length,
          nextHref: queuePos + 1 < queueIds.length ? queueHref(queueIds, queuePos + 1, true) : null,
        }
      : null;

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Apply for me</h1>
      <p className="mt-1 text-sm text-slate-600">
        We open the real application form and fill it in from your resume. You check every field.
        You press Submit yourself.
      </p>
    </div>
  );

  const kitHref = jobId ? `/apply?job=${encodeURIComponent(jobId)}` : "/apply";

  const entitled = isEntitled(profile.subscription_status) || isCompedEmail(user.email);
  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice>
          Apply for me is part of Guided.{" "}
          <Link href="/billing" className="font-medium underline">
            See Billing
          </Link>{" "}
          to turn it on. Your activity log stays free.
        </Notice>
      </div>
    );
  }

  if (!jobId) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice>
          Pick a job first.{" "}
          <Link href="/jobs" className="font-medium underline">
            Go to Jobs
          </Link>
          .
        </Notice>
      </div>
    );
  }

  const { data: row, error } = await supabase
    .from("resume_profiles")
    .select("user_id")
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
  if (!row) redirect("/resume");

  if (!canAutoApply(jobId)) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice>
          We can&apos;t fill in this job&apos;s form for you. Apply for me works with Greenhouse,
          Lever and Ashby jobs only.{" "}
          <Link href={kitHref} className="font-medium underline">
            Build an apply kit instead
          </Link>
          .
        </Notice>
      </div>
    );
  }

  const job = await getJobById(jobId);
  if (!job) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Notice>
          We couldn&apos;t find that job any more. It may have been taken down.{" "}
          <Link href={queue?.nextHref ?? "/jobs"} className="font-medium underline">
            {queue?.nextHref ? "Go to the next job" : "Back to Jobs"}
          </Link>
          .
        </Notice>
      </div>
    );
  }

  const jobHref = safeHref(job.applyUrl) ?? safeHref(job.url);

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <AutoApplyRunner
        key={job.id}
        jobId={job.id}
        company={job.company}
        title={job.title}
        location={job.location}
        jobHref={jobHref}
        kitHref={kitHref}
        configured={isAutoApplyConfigured()}
        queue={queue}
        autoStart={sp.go === "1"}
      />
    </div>
  );
}
