import { FREE_UNTIL_LABEL, MONTHLY_PRICE, isFreePeriod } from "@jobassistui/shared";

// Site-wide pricing disclosure. Mounted in the root layout so it covers the
// landing page, /login, the legal pages and the whole authenticated app.
//
// TWO CLAIMS, AND THEY ARE NOT THE SAME CLAIM. Since the 2026-08-29 pricing
// split, logging, the dashboard, weekly tracking and both exports are free
// PERMANENTLY — no card, no expiry. Only Guided assist (the extension) is the
// paid tier, and it is free until FREE_UNTIL like everything else was.
//
// This banner used to say "free for everyone until January, after that it's
// $12/month", which was true before the split and reads as a much worse offer
// than the real one. The free-forever half is the whole pitch — it is what can
// be said in a Facebook group full of people on unemployment — so it leads, and
// the paid half follows it plainly rather than being softened or buried.
//
// Still renders nothing once the free period is over, so no deploy is needed on
// the date. Deliberately not dismissible: this is the disclosure that one part
// of the product becomes paid, not a promo.
export default function FreePeriodBanner() {
  if (!isFreePeriod()) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto max-w-5xl px-6 py-2 text-center text-sm text-amber-900">
        <strong className="font-semibold">
          Your job-search log is free forever — no credit card.
        </strong>{" "}
        Guided assist is free until {FREE_UNTIL_LABEL}, then {MONTHLY_PRICE}
        /month.
      </div>
    </div>
  );
}
