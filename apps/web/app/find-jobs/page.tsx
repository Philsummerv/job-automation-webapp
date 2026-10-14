import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import JobsSearchForm from "@/components/JobsSearchForm";
import JobsResults from "@/components/JobsResults";

export const metadata: Metadata = {
  title: "Find jobs near you — JobAssistUI",
  description:
    "Search open jobs from real company career sites. No account needed to look.",
};

// Fetching the feed can take ~10s on a cold cache, and it reads live data.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = { q?: string; l?: string; remote?: string; s?: string };

// The public job search: anyone can look, no account. This is the link to
// share in groups and on flyers. Signed-in users go to /jobs instead, which
// adds resume matching and batch kits. The apply buttons here send the
// visitor to sign in first, then on to the same job.
export default async function FindJobsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") qs.set(k, v);
    redirect(qs.size ? `/jobs?${qs}` : "/jobs");
  }

  const query = (sp.q ?? "").trim().slice(0, 200);
  const location = (sp.l ?? "").trim().slice(0, 100);
  const remoteOnly = sp.remote === "1";
  const shouldSearch = sp.s === "1" || query !== "";

  return (
    <div className="ruled min-h-screen text-brand">
      <header className="border-b-2 border-brand bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-display text-lg font-bold uppercase tracking-wide">
            JobAssistUI
          </Link>
          <Link
            href="/login?redirect=%2Fjobs"
            className="bg-brand px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-paper hover:bg-brand-dark"
          >
            Sign in / Sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold">Find jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Open jobs from real company career sites. No account needed to look.
          </p>
        </div>

        <div className="border-[1.5px] border-brand bg-paper-field px-4 py-3 text-sm text-slate-800">
          Found one you like? Sign up free and we&apos;ll help you apply. Every
          application goes into your work-search log. The log is free forever.
          No card.
        </div>

        <JobsSearchForm
          query={query}
          location={location}
          remoteOnly={remoteOnly}
          action="/find-jobs"
        />

        {shouldSearch ? (
          <Suspense
            key={`${query}|${location}|${remoteOnly}`}
            fallback={
              <div className="border-[1.5px] border-brand bg-paper-field px-4 py-8 text-center text-sm text-slate-500">
                Checking company job boards. This can take about 10 seconds.
              </div>
            }
          >
            <JobsResults
              query={query}
              location={location}
              remoteOnly={remoteOnly}
              resume={null}
              aiState="no_resume"
              stillNeeded={0}
              signedOut
            />
          </Suspense>
        ) : (
          <p className="text-sm text-slate-600">
            Type a job title or a few keywords, then press Search.
          </p>
        )}

        <p className="text-xs text-slate-600">
          Not a government site. Not affiliated with any state labor department.
        </p>
      </main>
    </div>
  );
}
