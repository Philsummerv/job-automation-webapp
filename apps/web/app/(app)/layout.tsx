import Link from "next/link";
import { getProfileContext } from "@/lib/auth";

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
            <Link href="/dashboard" className="text-lg font-bold text-brand">
              ApplyAssistUI
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
              <Link href="/settings" className="text-slate-600 hover:text-slate-900">
                Settings
              </Link>
              <Link href="/billing" className="text-slate-600 hover:text-slate-900">
                Billing
              </Link>
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
