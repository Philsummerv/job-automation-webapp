import { FREE_UNTIL_LABEL, MONTHLY_PRICE, isFreePeriod } from "@applyassistui/shared";

// Site-wide announcement of the free launch period. Mounted in the root layout
// so it covers the landing page, /login, the legal pages and the whole
// authenticated app. Renders nothing once the free period is over, so no deploy
// is needed on the date. Deliberately not dismissible: this is the disclosure
// that the product becomes paid, not a promo.
export default function FreePeriodBanner() {
  if (!isFreePeriod()) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto max-w-5xl px-6 py-2 text-center text-sm text-amber-900">
        <strong className="font-semibold">
          Free for everyone until {FREE_UNTIL_LABEL} — no credit card required.
        </strong>{" "}
        After that it&apos;s {MONTHLY_PRICE}/month.
      </div>
    </div>
  );
}
