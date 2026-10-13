"use client";

import { useActionState, useEffect, useState } from "react";
import { toISODate } from "@jobassistui/shared";
import SubmitButton from "@/components/SubmitButton";
import { logApplication, type LogApplicationState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

// "I applied — log it". Employer and title are editable because pasted jobs
// may not have them, or the AI may have read them wrong.
export default function ApplyLogForm({
  company,
  title,
  url,
  onSubmit,
  stay = false,
  onLogged,
}: {
  company: string;
  title: string;
  url: string | null;
  /** Runs when the form is sent, e.g. to clear the saved kit. */
  onSubmit?: () => void;
  /** Stay on this page after logging instead of going to the dashboard. */
  stay?: boolean;
  /** Runs after a successful log when `stay` is on. */
  onLogged?: () => void;
}) {
  const [state, action] = useActionState<LogApplicationState, FormData>(logApplication, {
    error: null,
  });
  // The person's own calendar day, not the server's.
  const [date, setDate] = useState("");
  useEffect(() => setDate(toISODate(new Date())), []);
  useEffect(() => {
    if (state.logged) onLogged?.();
    // onLogged is a fresh function each render; only react to the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} onSubmit={() => onSubmit?.()} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="apply-employer" className="block text-sm font-medium">
            Employer
          </label>
          <input
            id="apply-employer"
            name="employer_name"
            required
            defaultValue={company}
            maxLength={200}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="apply-title" className="block text-sm font-medium">
            Job title
          </label>
          <input
            id="apply-title"
            name="job_title"
            defaultValue={title}
            maxLength={200}
            className={inputClass}
          />
        </div>
      </div>
      <input type="hidden" name="url" value={url ?? ""} />
      <input type="hidden" name="date" value={date} />
      {stay && <input type="hidden" name="stay" value="1" />}
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <SubmitButton
        pendingLabel="Logging…"
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-display font-bold uppercase tracking-wide text-white hover:bg-emerald-700"
      >
        I applied — log it
      </SubmitButton>
      <p className="text-xs text-slate-500">
        This adds today&apos;s application to your activity log as an online application.
      </p>
    </form>
  );
}
