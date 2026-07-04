import { getProfileContext } from "@/lib/auth";
import { US_STATES, DAYS_OF_WEEK } from "@autoapply/shared";
import { saveSettings } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; saved?: string }>;
}) {
  const { profile } = await getProfileContext();
  const sp = await searchParams;
  const onboarding = sp.onboarding === "1" || !profile.disclaimer_accepted_at;
  const saved = sp.saved === "1";

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">
        {onboarding ? "Welcome — set up your log" : "Settings"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {onboarding
          ? "Tell us your state and weekly requirement so exports match your unemployment reporting."
          : "Your compliance settings. Exports and the weekly count use these."}
      </p>

      {saved && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Settings saved.
        </div>
      )}

      <form action={saveSettings} className="mt-6 space-y-5">
        {onboarding && <input type="hidden" name="onboarding" value="1" />}

        <div>
          <label htmlFor="full_name" className="block text-sm font-medium">
            Full name <span className="text-slate-400">(for report headers)</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={profile.full_name ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium">
            State
          </label>
          <select
            id="state"
            name="state"
            defaultValue={profile.state ?? ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">Select your state…</option>
            {US_STATES.map(([abbr, name]) => (
              <option key={abbr} value={abbr}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="weekly_target" className="block text-sm font-medium">
              Weekly activity requirement
            </label>
            <input
              id="weekly_target"
              name="weekly_target"
              type="number"
              min={0}
              max={20}
              defaultValue={profile.weekly_target}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Most states require 3–5 per week.
            </p>
          </div>
          <div>
            <label
              htmlFor="reporting_period_start_day"
              className="block text-sm font-medium"
            >
              Reporting week starts on
            </label>
            <select
              id="reporting_period_start_day"
              name="reporting_period_start_day"
              defaultValue={profile.reporting_period_start_day}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {onboarding && (
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <input
              type="checkbox"
              name="accept_disclaimer"
              required
              className="mt-0.5"
            />
            <span className="text-slate-700">
              I understand AutoApply is a{" "}
              <strong>user-directed job-search documentation tool</strong>. I am
              responsible for the accuracy of my log and for meeting my state&apos;s
              requirements. AutoApply never submits anything without me present,
              and I initiate and confirm every action.
            </span>
          </label>
        )}

        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          {onboarding ? "Get started" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
