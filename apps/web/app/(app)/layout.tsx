import Link from "next/link";
import BetaBar from "@/components/BetaBar";
import { getProfileContext } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

function trialDaysLeft(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// Authenticated app shell: top nav + billing banner + sign-out. Middleware
// already blocks unauthenticated access to these routes; getProfileContext is
// a belt-and-suspenders (and cached, so pages re-calling it cost nothing).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getProfileContext();
  const status = profile.subscription_status;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-brand">JobAssistUI</span>
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                Beta
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                Activity Log
              </Link>
              <Link href="/log/new" className="text-slate-600 hover:text-slate-900">
                Add Activity
              </Link>
              <Link href="/template" className="text-slate-600 hover:text-slate-900">
                Answer Template
              </Link>
              <Link href="/guided" className="text-slate-600 hover:text-slate-900">
                Guided Assist
              </Link>
              <Link href="/settings" className="text-slate-600 hover:text-slate-900">
                Settings
              </Link>
              <Link href="/billing" className="text-slate-600 hover:text-slate-900">
                Billing
              </Link>
              <Link href="/feedback" className="text-slate-600 hover:text-slate-900">
                Feedback
              </Link>
              {isAdminEmail(user.email) && (
                <Link href="/admin" className="font-medium text-brand hover:underline">
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <BetaBar />

      {status === "trialing" && profile.trial_ends_at && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-5xl px-6 py-2 text-sm text-amber-800">
            Free trial: {trialDaysLeft(profile.trial_ends_at)}{" "}
            {trialDaysLeft(profile.trial_ends_at) === 1 ? "day" : "days"} left ·{" "}
            <Link href="/billing" className="font-medium underline">
              Manage billing →
            </Link>
          </div>
        </div>
      )}

      {status === "past_due" && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto max-w-5xl px-6 py-2 text-sm text-red-800">
            Payment failed — access is paused.{" "}
            <Link href="/billing" className="font-medium underline">
              Update your card →
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
