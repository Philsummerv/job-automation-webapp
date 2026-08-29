import type { Metadata } from "next";
import AssistantChat from "@/components/AssistantChat";
import { requireAdmin } from "@/lib/admin";
import { US_STATES, factCoverage } from "@jobassistui/shared";

export const metadata: Metadata = {
  title: "Rules Assistant — JobAssistUI",
};

// NOT LIVE YET — deliberately admin-gated, and deliberately not linked from the
// nav in (app)/layout.tsx.
//
// The owner's call (2026-08-29): build it, but keep it dark until there are more
// users, because marketing is the priority and this costs money to run at all.
// requireAdmin() uses notFound(), so a signed-in non-admin gets a plain 404 and
// learns nothing about the page existing — which means this is safe to deploy
// alongside unrelated changes without shipping the feature.
//
// TO GO LIVE: swap requireAdmin() for requireUser() and add the nav link. Do
// NOT use requireOnboarded() — it would bounce someone mid-question to settings.
// requireUser() means profile.state can be null, which is why the state step
// can't be skipped.
export default async function AssistantPage() {
  const { profile } = await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Rules Assistant</h1>
        <p className="mt-1 text-sm text-slate-600">
          Answers about your state&apos;s work search rules, quoted from your
          state&apos;s own pages, with the link every time.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900">
        Not released. Only you can see this page.
      </div>

      <AssistantChat
        defaultState={profile.state}
        states={US_STATES}
        checkedStates={factCoverage()}
      />
    </div>
  );
}
