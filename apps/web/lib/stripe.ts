import Stripe from "stripe";

// Lazy singleton so importing this module (e.g. during `next build` on a
// machine without env vars) never constructs the client at eval time.
// apiVersion is omitted on purpose: stripe-node pins requests to the API
// version its bundled types were generated for (2026-06-24.dahlia for v22).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { typescript: true });
  }
  return _stripe;
}
