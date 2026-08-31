import { requireEntitled } from "@/lib/auth";
import { NextStepActions } from "./NextStepActions";
import { ExtensionMissingNote } from "@/components/ExtensionMissingNote";
import { TemplateForm } from "./TemplateForm";
import type { AnswerTemplate } from "@jobassistui/shared";

export default async function TemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireEntitled();
  const saved = (await searchParams).saved === "1";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Answer template</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your saved answers drive Guided autofill when you&apos;re applying
        online. Blank fields fall back to a sensible default.
      </p>

      <ExtensionMissingNote className="mt-4" />

      {saved && <NextStep template={profile.answer_template} />}

      <TemplateForm template={profile.answer_template} />
    </div>
  );
}

// Saving the template used to end in a one-line "Template saved." and nothing
// else, which left people on a settings page with no idea the answers only do
// something on a job site. This is the next step, said out loud.
//
// The Indeed link is built from the user's OWN saved search when they filled
// those fields in, so the button lands them on their jobs rather than a blank
// search box. Same URL shape as buildIndeedSearchUrl() in packages/automation —
// duplicated here rather than imported because that package is deliberately
// not in the web build (see next.config.js transpilePackages).
function indeedSearchUrl(template: AnswerTemplate | null): string {
  const q = template?.config?.searchQuery?.trim() ?? "";
  const l = template?.config?.searchLocation?.trim() ?? "";
  if (!q) return "https://www.indeed.com/jobs";
  return l
    ? `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}`
    : `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}`;
}

function NextStep({ template }: { template: AnswerTemplate | null }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="text-sm font-semibold text-emerald-900">
        Saved. Here&apos;s what to do next.
      </h2>
      <p className="mt-2 text-sm text-emerald-900">
        Your answers don&apos;t do anything on this page — they fill themselves
        in when you&apos;re on a job application. Open a job, click Apply, and
        the form comes up already filled. You read every page and submit it
        yourself; nothing is ever sent without you.
      </p>

      <NextStepActions indeedUrl={indeedSearchUrl(template)} />
    </div>
  );
}
