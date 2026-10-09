import { FREE_UNTIL_LABEL, MONTHLY_PRICE, isFreePeriod } from "@jobassistui/shared";

// Site-wide pricing disclosure. Mounted in the root layout so it covers the
// landing page, /login, the legal pages and the whole authenticated app.
//
// TWO CLAIMS, AND THEY ARE NOT THE SAME CLAIM. The work-search log (logging,
// weekly tracking, exports) is free PERMANENTLY: no card, no expiry. Only the
// AI tools (Guided: resume help, job matches, apply kits) are the paid tier,
// and they are free until FREE_UNTIL. The free-forever half leads.
//
// Renders nothing once the free period is over, so no deploy is needed on the
// date. Not dismissible: this is the disclosure that one part becomes paid.
export default function FreePeriodBanner() {
  if (!isFreePeriod()) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto max-w-5xl px-4 py-2 text-center text-sm text-amber-900 sm:px-6">
        <strong className="font-semibold">
          Your work-search log is free forever. No credit card.
        </strong>{" "}
        The AI tools are free until {FREE_UNTIL_LABEL}, then {MONTHLY_PRICE}
        /month.
      </div>
    </div>
  );
}
