import type { Metadata } from "next";
import Link from "next/link";
import { isCompedEmail, requireOnboarded } from "@/lib/auth";
import { isEntitled, MONTHLY_PRICE, FREE_UNTIL_LABEL, isFreePeriod } from "@jobassistui/shared";

export const metadata: Metadata = {
  title: "Guided assist — JobAssistUI",
};

// The install page for Guided assist — the one paid feature.
//
// requireOnboarded, not requireEntitled: someone who hasn't paid still needs to
// READ what this is to decide whether it's worth buying. The download itself is
// entitlement-gated below, and /api/extension/session gates the extension
// server-side too, so a copied zip is useless without a subscription.
//
// Logging, the dashboard and exports are deliberately NOT gated — those are free
// forever. The audience is people on unemployment; charging them to document a
// legal requirement is the wrong business. Guided assist is the upgrade.
//
// isEntitled() returns true for everyone until FREE_UNTIL (2027-01-01), so this
// page shows the download to all comers today and starts gating on its own when
// the date passes. No cutover to run.
//
// WHY THE ZIP AND NOT A STORE LINK: the extension has not been submitted to the
// Chrome Web Store yet. Until it is, developer-mode install is the only way a
// person can actually run it. That's normal for an extension beta, but it is
// genuinely fiddly, so the steps below are written for someone who has never
// opened chrome://extensions in their life. Replace this whole page with a
// one-click Store button the moment the listing is approved.
export default async function GuidedPage() {
  const { user, profile } = await requireOnboarded();
  const entitled =
    isEntitled(profile.subscription_status) || isCompedEmail(user.email);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Guided assist</h1>
      <p className="mt-2 text-sm text-slate-600">
        Fill in your answers once. Then, when you&apos;re applying on Indeed,
        they drop into the form for you.
      </p>

      <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-medium">Early access — read this first.</p>
        <p className="mt-2">
          This isn&apos;t in the Chrome Web Store yet, so installing it takes six
          steps instead of one. It also needs a computer: Chrome extensions
          don&apos;t run on phones. Everything else in JobAssistUI works on any
          device.
        </p>
        <p className="mt-2">
          It&apos;s new. If something goes wrong, tell me on the{" "}
          <Link href="/feedback" className="underline">
            feedback page
          </Link>{" "}
          — that&apos;s genuinely why it&apos;s out this early.
        </p>
      </div>

      <ol className="mt-6 space-y-4 text-sm text-slate-700">
        <li>
          <strong>1. Download it.</strong>
          {entitled ? (
            <div className="mt-2">
              <a
                href="/jobassistui-extension.zip"
                className="inline-block rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Download the extension (.zip)
              </a>
              {isFreePeriod() && (
                <p className="mt-2 text-xs text-slate-500">
                  Free for everyone until {FREE_UNTIL_LABEL}. After that Guided
                  assist is {MONTHLY_PRICE}/month — your activity log, exports
                  and everything else stay free.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">
                Guided assist is {MONTHLY_PRICE}/month. Your activity log,
                weekly tracking and exports stay free — this is the only part
                that costs anything.
              </p>
              <Link
                href="/billing"
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Subscribe to unlock
              </Link>
            </div>
          )}
        </li>
        <li>
          <strong>2. Unzip it</strong> somewhere you won&apos;t delete by
          accident — your Documents folder is fine. Chrome reads this folder
          every time it starts, so it has to stay put.
        </li>
        <li>
          <strong>3. Open</strong>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">
            chrome://extensions
          </code>{" "}
          — type it into the address bar.
        </li>
        <li>
          <strong>4. Turn on Developer mode</strong> with the switch in the top
          right.
        </li>
        <li>
          <strong>5. Click Load unpacked</strong> and pick the folder you
          unzipped. It should contain <code>manifest.json</code>.
        </li>
        <li>
          <strong>6. Fill in your answers</strong> on the{" "}
          <Link href="/template" className="text-brand underline">
            answer template
          </Link>
          , then open an <strong>Easy Apply</strong> job on Indeed and click
          Apply. The form comes up already filled.
        </li>
      </ol>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">What it does and doesn&apos;t do</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>You click Apply. You submit.</strong> It fills the fields
            from your saved answers and stops. It never applies to anything on
            its own and never presses submit for you.
          </li>
          <li>
            <strong>You review every page</strong> before it moves on. Anything
            it couldn&apos;t answer is left blank for you to fill.
          </li>
          <li>
            <strong>It logs the application</strong> to your activity log once
            it&apos;s actually submitted, so it counts toward your week.
          </li>
          <li>
            <strong>Easy Apply only.</strong> Jobs marked &quot;Apply on company
            site&quot; hand off to somebody else&apos;s website, which it
            can&apos;t read.
          </li>
        </ul>
      </div>

      {/* ── The Guided-assist disclaimer ──
          Separate from the one accepted at signup, and deliberately so. That
          one covers the log: you are responsible for its accuracy, it is not
          legal advice. This one covers the thing that acts on a third-party
          website on your behalf, which is a different promise to a different
          person — most accounts never install this, and anyone who does is
          reading it here, next to the download, rather than having agreed to it
          at signup months earlier alongside something unrelated. */}
      <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-semibold">Before you install it — what you are agreeing to</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>You are the applicant, not us.</strong> The extension fills
            fields from answers you saved. You read every page and you press
            Submit. Every application it touches is one you chose and confirmed.
          </li>
          <li>
            <strong>You are responsible for what it fills in.</strong> The
            answers come from your template. If one is out of date or wrong, it
            goes onto a real application to a real employer under your name.
            Check the form before you submit it.
          </li>
          <li>
            <strong>It can get things wrong.</strong> Job sites change without
            warning. It may fill a field incorrectly, miss one, or stop partway.
            Anything it could not answer is left blank on purpose.
          </li>
          <li>
            <strong>Indeed is not affiliated with us</strong> and does not
            endorse this. You are responsible for using it in line with the
            terms of any site you use it on.
          </li>
          <li>
            <strong>It logs an application only after you submit it.</strong>{" "}
            You are still responsible for the accuracy of your log, the same as
            when you add an activity by hand.
          </li>
        </ul>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Chrome may warn you about developer-mode extensions each time it starts.
        That warning is about unpacked extensions in general, not about this one
        specifically — it goes away once the Web Store listing is approved.
      </p>
    </div>
  );
}
