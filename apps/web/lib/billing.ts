import type Stripe from "stripe";
import type { SubscriptionStatus } from "@applyassistui/shared";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
  }
}

// Fetches the subscription fresh from Stripe and writes its current state to
// the owner's profile. Never trusts webhook event payloads (they can be stale
// or arrive out of order), which makes replayed events naturally idempotent.
export async function syncSubscriptionToProfile(
  subscriptionId: string,
): Promise<void> {
  const stripe = getStripe();
  const svc = createServiceClient();

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Resolve the owning user: metadata set at Checkout, falling back to the
  // profile that holds this Stripe customer.
  let userId = sub.metadata?.user_id as string | undefined;
  if (!userId) {
    const { data } = await svc
      .from("profiles")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = (data as { user_id: string } | null)?.user_id;
  }
  if (!userId) {
    throw new Error(
      `Cannot resolve user for Stripe subscription ${subscriptionId}`,
    );
  }

  const mapped = mapStripeStatus(sub.status);

  // Stale-cancel guard: after cancel→resubscribe, a late `deleted` event for
  // the OLD subscription must not clobber the new one.
  const { data: current } = await svc
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  const currentSubId = (current as { stripe_subscription_id: string | null } | null)
    ?.stripe_subscription_id;
  if (currentSubId && currentSubId !== sub.id && mapped === "canceled") {
    return;
  }

  // On the current Stripe API, current_period_end lives on the item.
  const periodEnd = sub.items.data[0]?.current_period_end;

  const { error } = await svc
    .from("profiles")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_status: mapped,
      // Never null trial_ends_at: it doubles as the "has ever trialed" flag
      // that startCheckout uses to deny a second free trial, so a trial-less
      // resubscribe must not erase it.
      ...(sub.trial_end && {
        trial_ends_at: new Date(sub.trial_end * 1000).toISOString(),
      }),
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// Fallback for the Checkout success return when the webhook hasn't landed
// yet: find the customer's newest subscription and sync it.
export async function syncFromCustomer(customerId: string): Promise<void> {
  const subs = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
  });
  const sub = subs.data[0];
  if (sub) await syncSubscriptionToProfile(sub.id);
}

// Records the card fingerprint used at trial start (anti-trial-abuse,
// record-only in M1). Callers must treat failures as non-fatal.
export async function recordCardFingerprint(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (!session.subscription) return;
  const stripe = getStripe();

  const sub = await stripe.subscriptions.retrieve(
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id,
    { expand: ["default_payment_method"] },
  );
  const pm = sub.default_payment_method;
  if (!pm || typeof pm === "string") return;
  const fingerprint = pm.card?.fingerprint;
  if (!fingerprint) return;

  const userId =
    (sub.metadata?.user_id as string | undefined) ??
    session.client_reference_id ??
    undefined;
  if (!userId) return;

  const svc = createServiceClient();
  const { data: existing } = await svc
    .from("used_card_fingerprints")
    .select("user_id")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    const firstUser = (existing as { user_id: string }).user_id;
    if (firstUser !== userId) {
      // Record-only in M1. If trial abuse shows up in practice, enforcement
      // goes here: stripe.subscriptions.update(sub.id, { trial_end: "now" }).
      console.warn(
        `Card fingerprint reuse: ${fingerprint} first used by ${firstUser}, now by ${userId}`,
      );
    }
    return;
  }

  await svc.from("used_card_fingerprints").insert({
    fingerprint,
    user_id: userId,
    stripe_payment_method_id: pm.id,
  });
}
