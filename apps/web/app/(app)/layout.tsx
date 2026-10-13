import Link from "next/link";
import BetaBar from "@/components/BetaBar";
import ShellNav from "@/components/ShellNav";
import WeekReminder from "@/components/WeekReminder";
import { getWeekProgress } from "@/lib/week";
import { getProfileContext } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

function trialDaysLeft(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// Authenticated app shell: top nav (ShellNav, collapses to a menu on phones) + billing banner + sign-out. Middleware
// already blocks unauthenticated access to these routes; getProfileContext is
// a belt-and-suspenders (and cached, so pages re-calling it cost nothing).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, profile } = await getProfileContext();
  // Not onboarded yet means no target to remind about.
  const week = profile.disclaimer_accepted_at ? await getWeekProgress(supabase, profile) : null;
  const status = profile.subscription_status;

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-brand bg-paper">
        <ShellNav email={user.email ?? null} isAdmin={isAdminEmail(user.email)} />
      </header>

      {week && <WeekReminder week={week} />}

      <BetaBar />

      {status === "trialing" && profile.trial_ends_at && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6 text-sm text-amber-800">
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
          <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6 text-sm text-red-800">
            Payment failed — access is paused.{" "}
            <Link href="/billing" className="font-medium underline">
              Update your card →
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
