import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  recordCardFingerprint,
  syncSubscriptionToProfile,
} from "@/lib/billing";

// Stripe webhook. Signature-verified against the raw body; sync errors bubble
// up as 500s so Stripe retries. Handlers are idempotent (fresh-fetch sync),
// so replayed or out-of-order deliveries are harmless.
export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        await syncSubscriptionToProfile(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id,
        );
        // Best-effort: fingerprint recording must never fail the webhook.
        try {
          await recordCardFingerprint(session);
        } catch (err) {
          console.warn("recordCardFingerprint failed", err);
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscriptionToProfile(event.data.object.id);
      break;
  }

  return NextResponse.json({ received: true });
}
