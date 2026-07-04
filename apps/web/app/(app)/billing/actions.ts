"use server";

import { redirect } from "next/navigation";
import { isEntitled } from "@applyassistui/shared";
import { requireOnboarded } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

// Sends the user to Stripe Checkout to start the trial (or resubscribe).
// requireOnboarded, not requireEntitled — non-subscribers must reach this.
export async function startCheckout() {
  const { user, profile } = await requireOnboarded();
  if (isEntitled(profile.subscription_status)) redirect("/dashboard");

  const stripe = getStripe();

  // Reuse the Stripe customer if we have one; otherwise create it and persist
  // the id BEFORE creating the session so a retry never duplicates a customer.
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    const svc = createServiceClient();
    const { error } = await svc
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }

  // One trial per user: trial_ends_at doubles as the "has ever trialed" flag,
  // so a canceled subscriber who comes back pays from day one.
  const trialEligible = profile.trial_ends_at === null;
  const site = process.env.NEXT_PUBLIC_SITE_URL!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    // Card required even though the trial is free — the anti-abuse mechanism.
    payment_method_collection: "always",
    subscription_data: {
      metadata: { user_id: user.id },
      ...(trialEligible && { trial_period_days: 14 }),
    },
    success_url: `${site}/billing?checkout=success`,
    cancel_url: `${site}/billing?checkout=canceled`,
  });

  redirect(session.url!);
}

// Opens the Stripe customer portal (cancel, update card, invoices).
export async function openBillingPortal() {
  const { profile } = await requireOnboarded();
  if (!profile.stripe_customer_id) redirect("/billing");

  const portal = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id!,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/billing`,
  });

  redirect(portal.url);
}
