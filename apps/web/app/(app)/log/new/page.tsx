import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import {
  ACTIVITY_METHODS,
  ACTIVITY_RESULTS,
  toISODate,
} from "@applyassistui/shared";
import { createEntry } from "./actions";

export default async function NewEntryPage() {
  await requireOnboarded();
  const today = toISODate(new Date());

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Add a job-search activity</h1>
      <p className="mt-1 text-sm text-slate-600">
        Record an activity you completed. This goes straight into your Activity
        Log and counts toward your weekly requirement.
      </p>

      <form action={createEntry} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={today}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="method" className="block text-sm font-medium">
              Method
            </label>
            <select id="method" name="method" defaultValue="online" className={inputClass}>
              {ACTIVITY_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="employer_name" className="block text-sm font-medium">
            Employer / organization
          </label>
          <input
            id="employer_name"
            name="employer_name"
            required
            placeholder="e.g. Acme Labs"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="job_title" className="block text-sm font-medium">
            Job title <span className="text-slate-400">(optional)</span>
          </label>
          <input id="job_title" name="job_title" className={inputClass} />
        </div>

        <div>
          <label htmlFor="url" className="block text-sm font-medium">
            Listing URL <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://…"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="result" className="block text-sm font-medium">
            Result
          </label>
          <select id="result" name="result" defaultValue="applied" className={inputClass}>
            {ACTIVITY_RESULTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium">
            Notes <span className="text-slate-400">(optional)</span>
          </label>
          <textarea id="notes" name="notes" rows={3} className={inputClass} />
        </div>

        <div>
          <label htmlFor="evidence" className="block text-sm font-medium">
            Evidence screenshot <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="evidence"
            name="evidence"
            type="file"
            accept="image/*,application/pdf"
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-500">
            A confirmation-page screenshot strengthens your record.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Save activity
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
