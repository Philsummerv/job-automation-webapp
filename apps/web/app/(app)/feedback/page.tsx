import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { SUPPORT_EMAIL } from "@/lib/site";
import { sendFeedback } from "./actions";

const KINDS = [
  { value: "bug", label: "Something is broken" },
  { value: "confusing", label: "Something is confusing" },
  { value: "idea", label: "I want a feature" },
  { value: "other", label: "Something else" },
];

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; from?: string }>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Report a bug or tell me what you think</h1>
      <p className="mt-2 text-sm text-slate-600">
        JobAssistUI is early and free while it&apos;s being built out. If
        something broke, read wrong, or just annoyed you, say so here — it goes
        straight to me and I read every one. Bugs that cost you a logged
        activity are the ones I most want to hear about.
      </p>

      {sent && (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong className="font-semibold">Got it — thank you.</strong> I read
          these personally and may reply to {user.email}.{" "}
          <Link href="/dashboard" className="font-medium underline">
            Back to your log →
          </Link>
        </div>
      )}

      {params.error === "empty" && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Please write a sentence or two before sending.
        </div>
      )}
      {params.error === "save" && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          That didn&apos;t save — which is itself a bug. Email me directly at{" "}
          <strong>{SUPPORT_EMAIL}</strong> and I&apos;ll dig into it.
        </div>
      )}

      <form action={sendFeedback} className="mt-6 space-y-5">
        <input type="hidden" name="page" value={params.from ?? ""} />

        <div>
          <label htmlFor="kind" className="block text-sm font-medium text-slate-700">
            What kind of thing is this?
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue="bug"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-slate-700">
            What happened?
          </label>
          <textarea
            id="message"
            name="message"
            rows={7}
            required
            maxLength={5000}
            placeholder="What were you doing, what did you expect, and what happened instead? Which page you were on helps a lot."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <SubmitButton
            pendingLabel="Sending…"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Send it
          </SubmitButton>
          <span className="text-xs text-slate-500">
            Sent as {user.email} so I can reply.
          </span>
        </div>
      </form>
    </div>
  );
}
