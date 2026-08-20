import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site";
import {
  FREE_UNTIL_LABEL,
  MONTHLY_PRICE,
  isFreePeriod,
} from "@jobassistui/shared";

export default function LandingPage() {
  const free = isFreePeriod();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-brand">JobAssistUI</span>
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Beta
            </span>
          </span>
          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="text-slate-600 hover:text-slate-900">
              How it works
            </a>
            <a href="#pricing" className="text-slate-600 hover:text-slate-900">
              Pricing
            </a>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          Unemployment job-search compliance
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
          Track your weekly job search. Export a report ready for your claim.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Most states require you to document 3–5 job-search activities every
          week to keep your benefits. JobAssistUI keeps a clean, exportable log of
          every activity — with dates, employers, methods, and evidence — ready
          for your reporting period.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
          >
            {free ? "Get started free" : "Start 14-day free trial"}
          </Link>
          <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            See how it works →
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {free ? (
            <>
              Free for everyone until {FREE_UNTIL_LABEL} — no credit card
              required. {MONTHLY_PRICE}/month starts {FREE_UNTIL_LABEL}.
            </>
          ) : (
            <>
              14-day free trial — card required, you won&apos;t be charged until
              it ends. {MONTHLY_PRICE}/month after. Cancel anytime.
            </>
          )}
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "1. Log each activity",
                body: "Add every job-search activity — application, interview, job fair, networking — in seconds. Attach a screenshot as evidence.",
              },
              {
                title: "2. Track your week",
                body: "See a live count against your state's weekly requirement, grouped by your reporting period. Never come up short.",
              },
              {
                title: "3. Export & submit",
                body: "Download a formatted PDF or CSV for any week, ready to attach to your unemployment claim.",
              },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-900">{c.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h3 className="font-semibold text-slate-900">
              Coming soon: Guided assist
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              When you&apos;re applying online, Guided mode will streamline the
              form and capture your confirmation as evidence automatically —
              but <strong>you stay in control and confirm every submission.</strong>{" "}
              JobAssistUI never applies to anything without you present.
            </p>
          </div>
        </div>
      </section>

      {/* Beta note — the honest version of "why is this free?" */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-8">
            <span className="rounded bg-sky-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              Early beta
            </span>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">
              I built this because I wanted to be sure about my own claim
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                I&apos;ve been claiming unemployment in New York since March
                2026. Every week you certify the same things: that you looked
                for work, that you had no other income and no holiday pay, that
                you were ready and able to take a job.
              </p>
              <p>
                I never missed a week. I just spent a lot of time wanting to be{" "}
                <em>100% sure</em> I hadn&apos;t — so I built something to keep
                the record for me. You log each application or contact as you go,
                see where you stand for the week, and print a clean copy of what
                you did if you ever need one.
              </p>
              <p>
                It&apos;s free for everyone until {FREE_UNTIL_LABEL} — no card,
                no trial countdown, nothing to cancel. After that it&apos;s{" "}
                {MONTHLY_PRICE}/month. I&apos;d rather people just use it through
                the rest of the year and decide then.
              </p>
              <p>
                It&apos;s early and I built it myself, so there will be things
                wrong with it. If something breaks or reads wrong, tell me —
                there&apos;s a Feedback link inside the app and it comes straight
                to me. Mostly I hope it takes some of the anxiety out of staying
                eligible while you&apos;re trying to find a job.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-100">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold">
            {free ? "Free right now" : "Simple pricing"}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
            Protect the benefits you rely on for less than a coffee a week. One
            missed reporting week can cost you far more.
          </p>
          <div className="mt-8 rounded-2xl border border-slate-200 p-8 shadow-sm">
            {free ? (
              <>
                <div className="text-4xl font-bold">
                  Free
                  <span className="text-base font-normal text-slate-500">
                    {" "}
                    until {FREE_UNTIL_LABEL}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  No credit card required. Starting {FREE_UNTIL_LABEL} it&apos;s{" "}
                  {MONTHLY_PRICE}/month — you&apos;ll be asked to subscribe then,
                  and nothing is charged before that.
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl font-bold">
                  {MONTHLY_PRICE}
                  <span className="text-base font-normal text-slate-500">
                    /month
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Start with a 14-day free trial (card required, cancel anytime).
                </p>
              </>
            )}
            <ul className="mt-6 space-y-2 text-left text-sm text-slate-700">
              <li>✓ Unlimited activity logging</li>
              <li>✓ Weekly compliance tracking</li>
              <li>✓ PDF &amp; CSV exports</li>
              <li>✓ Evidence storage</li>
              <li>
                ✓ Guided application assist{" "}
                <span className="text-slate-400">(coming soon)</span>
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-8 block rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark"
            >
              {free ? "Get started free" : "Start free trial"}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-slate-500">
          <p>
            JobAssistUI is a user-directed job-search documentation tool. It does not
            provide legal advice; requirements vary by state. You are responsible
            for the accuracy of your records and for meeting your state&apos;s rules.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=JobAssistUI%20feedback`}
              className="hover:text-slate-900"
            >
              Report a bug
            </a>
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
