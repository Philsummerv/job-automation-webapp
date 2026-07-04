import Link from "next/link";
import { isEntitled, type Profile } from "@applyassistui/shared";
import { requireOnboarded } from "@/lib/auth";
import { syncFromCustomer } from "@/lib/billing";
import { openBillingPortal, startCheckout } from "./actions";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const FEATURES = [
  "Unlimited activity logging",
  "Weekly compliance tracking",
  "PDF & CSV exports",
  "Evidence storage",
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const ctx = await requireOnboarded();
  let profile = ctx.profile;
  const sp = await searchParams;

  // Webhook-race fallback: back from a successful Checkout but the webhook
  // hasn't updated the profile yet — pull the truth from Stripe directly.
  if (
    sp.checkout === "success" &&
    !isEntitled(profile.subscription_status) &&
    profile.stripe_customer_id
  ) {
    await syncFromCustomer(profile.stripe_customer_id);
    const { data } = await ctx.supabase
      .from("profiles")
      .select("*")
      .eq("user_id", ctx.user.id)
      .single();
    if (data) profile = data as Profile;
  }

  const status = profile.subscription_status;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {sp.checkout === "canceled" && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          Checkout was canceled — no charge was made.
        </div>
      )}

      {(status === "none" || status === "incomplete") && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">
            Start your 14-day free trial
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            $12/month after the trial. Card required — you won&apos;t be
            charged until your trial ends. Cancel anytime.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-700">
            {FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <form action={startCheckout} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Start free trial
            </button>
          </form>
        </div>
      )}

      {status === "trialing" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Trial active</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your free trial ends on {formatDate(profile.trial_ends_at)}. After
            that your card is charged $12/month. Cancel anytime before then and
            you won&apos;t be charged.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <StartApplyingButton />
            <ManageBillingButton />
          </div>
        </div>
      )}

      {status === "active" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Subscription active</h2>
          <p className="mt-2 text-sm text-slate-600">
            $12/month — renews on {formatDate(profile.current_period_end)}.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <StartApplyingButton />
            <ManageBillingButton />
          </div>
        </div>
      )}

      {status === "past_due" && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-8">
          <h2 className="text-lg font-semibold text-red-800">Payment failed</h2>
          <p className="mt-2 text-sm text-red-700">
            We couldn&apos;t charge your card, so access is paused. Update your
            payment method to pick up right where you left off — your activity
            log is safe.
          </p>
          <div className="mt-6">
            <ManageBillingButton label="Update payment method" />
          </div>
        </div>
      )}

      {status === "canceled" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Your subscription has ended</h2>
          <p className="mt-2 text-sm text-slate-600">
            Resubscribe for $12/month to get back to your activity log. Your
            existing entries are safe.
          </p>
          <form action={startCheckout} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Resubscribe
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function StartApplyingButton() {
  return (
    <Link
      href="/dashboard"
      className="rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
    >
      Start applying
    </Link>
  );
}

function ManageBillingButton({ label = "Manage billing" }: { label?: string }) {
  return (
    <form action={openBillingPortal}>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
      </button>
    </form>
  );
}
