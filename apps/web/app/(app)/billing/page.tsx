import Link from "next/link";
import {
  FREE_UNTIL_LABEL,
  MONTHLY_PRICE,
  isEntitled,
  isFreePeriod,
  type Profile,
} from "@jobassistui/shared";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { syncFromCustomer } from "@/lib/billing";
import SubmitButton from "@/components/SubmitButton";
import { openBillingPortal, startCheckout } from "./actions";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// What the subscription actually buys. Logging, tracking, exports and evidence
// storage were listed here until 2026-08-30 — all four are free permanently, so
// the checkout box was selling things nobody has to pay for while omitting the
// only feature behind the paywall.
const FEATURES = [
  "Guided assist — fills Indeed applications from your saved answers",
  "Answer Template — save your answers once, reuse them everywhere",
  "Applications logged automatically as you submit them",
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
  const comped = isCompedEmail(ctx.user.email);
  // During the free period nobody has anything to pay, so the whole
  // subscription-state UI below is replaced by a single explanatory card.
  const free = isFreePeriod();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {sp.checkout === "canceled" && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          Checkout was canceled — no charge was made.
        </div>
      )}

      {free && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <h2 className="text-lg font-semibold text-emerald-900">
            Nothing to pay
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            Your job-search log, weekly tracking and exports are free
            permanently. We don&apos;t have your card and will never need it for
            those.
          </p>
          <p className="mt-2 text-sm text-emerald-800">
            Guided assist — the extension that fills applications for you — is
            also free right now. Starting {FREE_UNTIL_LABEL} that one feature
            costs {MONTHLY_PRICE}/month, and we&apos;ll ask you then. If you
            skip it, nothing else changes: your account stays open, your log
            stays free, and you can always export it.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-emerald-900">
            {FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-3">
            <StartApplyingButton />
            {profile.stripe_customer_id && <ManageBillingButton />}
          </div>
        </div>
      )}

      {!free && comped && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <h2 className="text-lg font-semibold text-emerald-900">
            Complimentary access
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            This account has full access without a subscription.
          </p>
          <div className="mt-6">
            <StartApplyingButton />
          </div>
        </div>
      )}

      {!free && !comped &&(status === "none" || status === "incomplete") && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">
            Add Guided assist
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {MONTHLY_PRICE}/month after a 14-day free trial. Card required — you
            won&apos;t be charged until your trial ends. Cancel anytime.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Your job-search log, weekly tracking and exports stay free whether
            you subscribe or not. This only adds the form-filling extension.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-700">
            {FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <form action={startCheckout} className="mt-6">
            <SubmitButton
              pendingLabel="Opening checkout…"
              className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Start free trial
            </SubmitButton>
          </form>
        </div>
      )}

      {!free && !comped &&status === "trialing" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Trial active</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your free trial ends on {formatDate(profile.trial_ends_at)}. After
            that your card is charged {MONTHLY_PRICE}/month. Cancel anytime before then and
            you won&apos;t be charged.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <StartApplyingButton />
            <ManageBillingButton />
          </div>
        </div>
      )}

      {!free && !comped &&status === "active" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Subscription active</h2>
          <p className="mt-2 text-sm text-slate-600">
            {MONTHLY_PRICE}/month — renews on{" "}
            {formatDate(profile.current_period_end)}.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <StartApplyingButton />
            <ManageBillingButton />
          </div>
        </div>
      )}

      {!free && !comped &&status === "past_due" && (
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

      {!free && !comped &&status === "canceled" && (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold">Your subscription has ended</h2>
          <p className="mt-2 text-sm text-slate-600">
            Resubscribe for {MONTHLY_PRICE}/month to get back to your activity log. Your
            existing entries are safe.
          </p>
          <form action={startCheckout} className="mt-6">
            <SubmitButton
              pendingLabel="Opening checkout…"
              className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Resubscribe
            </SubmitButton>
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
      <SubmitButton
        pendingLabel="Opening portal…"
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
